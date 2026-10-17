using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Thuelang;

public enum LimitKind
{
    Steps,
    Evals,
    State,
    Timeout,
}

public static class LimitKinds
{
    public static string Name(LimitKind kind) => kind switch
    {
        LimitKind.Steps => "steps",
        LimitKind.Evals => "evals",
        LimitKind.State => "state",
        LimitKind.Timeout => "timeout",
        _ => throw new InvalidOperationException(),
    };
}

/// <summary>A limit stop. <see cref="Code"/> is 10, 11, 12, or 13.</summary>
public sealed class LimitException : Exception
{
    public LimitKind Kind { get; }
    public int Code { get; }

    public LimitException(LimitKind kind, int code, string message) : base(message)
    {
        Kind = kind;
        Code = code;
    }
}

/// <summary>A runtime failure that is not a limit. The CLI exits with <see cref="Code"/>.</summary>
public sealed class ThueException : Exception
{
    public int Code { get; }

    public ThueException(string message, int code = Interpreter.ExitRuntime) : base(message)
    {
        Code = code;
    }
}

public sealed class RunMetrics
{
    public long Cost { get; init; }
    public long AppliedSteps { get; init; }
    public long RegexEvals { get; init; }
    public long RegexMatches { get; init; }
    public long StateBytes { get; init; }
    public long StatePeak { get; init; }
    public long RuleCount { get; init; }
    public long RuleChars { get; init; }
}

public sealed class TraceEvent
{
    public long Step { get; init; }
    public int RuleIndex { get; init; }
    public string SourcePath { get; init; } = "";
    public int LineNumber { get; init; }
    public string Operator { get; init; } = "";
    public string Lhs { get; init; } = "";
    public int MatchStart { get; init; }
    public int MatchEnd { get; init; }
    public string StateBefore { get; init; } = "";
    public string Replacement { get; init; } = "";
    public string StateAfter { get; init; } = "";
    public int? ExitCode { get; init; }
    public string Error { get; init; } = "";
}

public sealed class ListedRule
{
    public string Lhs { get; init; } = "";
    public int LineNumber { get; init; }
    public string SourcePath { get; init; } = "";
}

public sealed class Interpreter : IDisposable
{
    public const long DefaultMaxEvals = 1_000_000;
    public const long DefaultMaxStateBytes = 8 * 1024 * 1024;
    public const long DefaultMaxSteps = 1_000_000;
    public const int ExitRuntime = 1;
    public const int ExitStepLimit = 10;
    public const int ExitEvalLimit = 11;
    public const int ExitStateLimit = 12;
    public const int ExitReadTimeout = 13;

    readonly List<TraceEvent> trace = new();
    readonly Dictionary<string, Binding> bindings = new();
    readonly SortedDictionary<string, long> coverage = new();
    readonly Dictionary<string, Regex> midCache = new();

    List<Rule> rules = new();
    string state = "";
    int stateBytes;
    bool scripted;
    long cost;
    long regexEvals;
    long regexMatches;
    long sampledBytes;
    long statePeak;
    string? coveragePath;
    bool disposed;

    public Interpreter()
    {
        MaxEvals = DefaultMaxEvals;
        MaxStateBytes = DefaultMaxStateBytes;
        MaxSteps = DefaultMaxSteps;
        bindings["stdin"] = new Binding { Kind = BindKind.Stdin, Stdin = new StdinResource() };
        bindings["stdout"] = new Binding { Kind = BindKind.Stdout };
        bindings["stderr"] = new Binding { Kind = BindKind.Stderr };
    }

    public long? MaxEvals { get; set; }
    public long? MaxStateBytes { get; set; }
    public long? MaxSteps { get; set; }
    public bool Debug { get; set; }
    public bool TraceEnabled { get; set; }
    public long EvalCount { get; private set; }
    public long AppliedSteps { get; private set; }
    public IReadOnlyList<TraceEvent> Trace => trace;
    public string State => state;

    public void SetRuleCoveragePath(string? path) => coveragePath = path;

    public void AddProcBinding(string name, string command)
    {
        bindings[name] = new Binding { Kind = BindKind.Process, Process = new ProcessResource(command) };
    }

    public void BindScripts(IReadOnlyDictionary<string, IReadOnlyList<string>> reads, IReadOnlyList<string> writes)
    {
        var writeSet = new HashSet<string>(StringComparer.Ordinal);
        foreach (var name in writes)
        {
            if (!Builtin.IsName(name))
                throw new ThueException($"invalid resource {Limits.GoQuote(name)}");
            if (!writeSet.Add(name))
                throw new ThueException($"duplicate writable resource {name}");
        }
        foreach (var pair in reads)
        {
            if (!Builtin.IsName(pair.Key))
                throw new ThueException($"invalid resource {Limits.GoQuote(pair.Key)}");
            foreach (var line in pair.Value)
            {
                if (line.Contains('\n') || line.Contains('\r'))
                    throw new ThueException($"resource {pair.Key} line contains a newline");
            }
        }
        var names = new List<string>(reads.Keys);
        foreach (var name in writes)
        {
            if (!reads.ContainsKey(name))
                names.Add(name);
        }
        if (names.Count == 0)
            throw new ThueException("no resources");
        Cleanup();
        bindings.Clear();
        foreach (var name in names)
        {
            var readable = reads.ContainsKey(name);
            var lines = readable ? reads[name].ToList() : new List<string>();
            bindings[name] = new Binding
            {
                Kind = BindKind.Script,
                Script = new ScriptResource(lines, readable, writeSet.Contains(name)),
            };
        }
        scripted = true;
    }

    public SortedDictionary<string, string> ScriptWrites()
    {
        if (!scripted)
            throw new ThueException("this run has no scripted resources");
        var outMap = new SortedDictionary<string, string>(StringComparer.Ordinal);
        foreach (var pair in bindings)
        {
            if (pair.Value.Kind == BindKind.Script && pair.Value.Script is { Recorded: { } text })
                outMap[pair.Key] = text;
        }
        return outMap;
    }

    public void LoadProgram(string path)
    {
        string abs;
        try
        {
            abs = Path.GetFullPath(path);
        }
        catch (Exception ex)
        {
            throw new ThueException(ex.Message);
        }
        byte[] bytes;
        try
        {
            bytes = File.ReadAllBytes(abs);
        }
        catch (Exception ex) when (ex is FileNotFoundException or DirectoryNotFoundException)
        {
            throw new ThueException($"File not found: {abs}");
        }
        catch (Exception ex)
        {
            throw new ThueException(ex.Message);
        }
        string content;
        try
        {
            content = new UTF8Encoding(false, true).GetString(bytes);
        }
        catch (DecoderFallbackException)
        {
            throw new ThueException("program is not valid UTF-8");
        }
        LoadText(abs, content);
    }

    public void LoadProgramText(string sourcePath, string content)
    {
        if (string.IsNullOrWhiteSpace(sourcePath))
            throw new ThueException("source path is required");
        LoadText(sourcePath, content);
    }

    public void ApplyInputOverride(string value) => AssignState(value);

    public IReadOnlyList<ListedRule> ListedRules()
    {
        var listed = new List<ListedRule>(rules.Count);
        foreach (var rule in rules)
        {
            listed.Add(new ListedRule
            {
                Lhs = rule.Lhs,
                LineNumber = rule.LineNumber,
                SourcePath = rule.SourcePath,
            });
        }
        return listed;
    }

    public RunMetrics Metrics()
    {
        long chars = 0;
        foreach (var rule in rules)
            chars += rule.SourceBytes;
        return new RunMetrics
        {
            Cost = cost,
            AppliedSteps = AppliedSteps,
            RegexEvals = regexEvals,
            RegexMatches = regexMatches,
            StateBytes = sampledBytes,
            StatePeak = statePeak,
            RuleCount = rules.Count,
            RuleChars = chars,
        };
    }

    public int Run()
    {
        AppliedSteps = 0;
        cost = 0;
        regexEvals = 0;
        regexMatches = 0;
        sampledBytes = 0;
        statePeak = 0;
        trace.Clear();
        NoteState();
        while (true)
        {
            var applied = false;
            var ruleCount = rules.Count;
            for (var ruleIndex = 0; ruleIndex < ruleCount; ruleIndex++)
            {
                if (MaxEvals is long maxEvals && EvalCount >= maxEvals)
                {
                    throw Limit(LimitKind.Evals, ExitEvalLimit, $"Evaluation step limit ({maxEvals}) exceeded");
                }
                EvalCount++;
                var found = FindMatch(ruleIndex);
                if (found is null)
                    continue;
                var rule = rules[ruleIndex];
                var stateBefore = state;
                var mid = ApplyMids(rule.LineNumber, rule.LhsBytes, rule.Mids, found.Groups);
                if (mid.Error is not null)
                {
                    Record(ruleIndex, rule, found, stateBefore, "", null, mid.Error);
                    throw new ThueException(mid.Error);
                }
                if (mid.Groups is null)
                    continue;
                found.Groups = mid.Groups;
                applied = true;
                if (Debug)
                    DebugMatch(rule.LineNumber, rule.Lhs, found, stateBefore);
                if (rule.Operator != OpKind.Exit && MaxSteps is long maxSteps && AppliedSteps >= maxSteps)
                {
                    throw Limit(LimitKind.Steps, ExitStepLimit, $"Applied step limit ({maxSteps}) exceeded");
                }
                var extra = new Dictionary<string, string> { ["rule_index"] = ruleIndex.ToString() };
                string replacement;
                switch (rule.Operator)
                {
                    case OpKind.Substitute:
                        try
                        {
                            replacement = Template.Expand(rule.Rhs, found.Groups, extra);
                            RecordCoverage(rule.SourcePath, rule.LineNumber);
                        }
                        catch (ParseError ex)
                        {
                            Record(ruleIndex, rule, found, stateBefore, "", null, ex.Message);
                            throw new ThueException(ex.Message);
                        }
                        break;
                    case OpKind.Read:
                        try
                        {
                            replacement = ReadOperator(rule.LineNumber, rule.Rhs);
                            RecordCoverage(rule.SourcePath, rule.LineNumber);
                        }
                        catch (Exception ex) when (ex is ThueException or LimitException)
                        {
                            Record(ruleIndex, rule, found, stateBefore, "", null, ex.Message);
                            throw;
                        }
                        break;
                    case OpKind.Write:
                        try
                        {
                            var expanded = Template.Expand(rule.Rhs, found.Groups, extra);
                            var (resource, content) = SplitResource(expanded);
                            var (text, ok) = WriteOperator(resource, content);
                            if (ok)
                                RecordCoverage(rule.SourcePath, rule.LineNumber);
                            replacement = text;
                        }
                        catch (ParseError ex)
                        {
                            Record(ruleIndex, rule, found, stateBefore, "", null, ex.Message);
                            throw new ThueException(ex.Message);
                        }
                        break;
                    case OpKind.Builtin:
                        var values = new List<string>(rule.BuiltinArgs.Count);
                        foreach (var arg in rule.BuiltinArgs)
                        {
                            if (!found.Groups.TryGetValue(arg, out var value))
                            {
                                var message = $"Line {rule.LineNumber}: ::! argument '{arg}' was not captured";
                                Record(ruleIndex, rule, found, stateBefore, "", null, message);
                                throw new ThueException(message);
                            }
                            values.Add(value);
                        }
                        try
                        {
                            replacement = Builtin.Eval(rule.BuiltinName, values);
                            RecordCoverage(rule.SourcePath, rule.LineNumber);
                        }
                        catch (ParseError ex)
                        {
                            Record(ruleIndex, rule, found, stateBefore, "", null, ex.Message);
                            throw new ThueException(ex.Message);
                        }
                        break;
                    case OpKind.Exit:
                        RecordCoverage(rule.SourcePath, rule.LineNumber);
                        var code = ParseExitCode(rule.Rhs);
                        Record(ruleIndex, rule, found, stateBefore, "", code, "");
                        return code ?? ExitRuntime;
                    default:
                        throw new ThueException($"internal error: operator {rule.Operator}");
                }
                var newState = Splice(stateBefore, found.Start, found.End, replacement);
                try
                {
                    SetState(newState);
                }
                catch (LimitException ex)
                {
                    Record(ruleIndex, rule, found, stateBefore, replacement, null, ex.Message);
                    throw;
                }
                NoteState();
                Record(ruleIndex, rule, found, stateBefore, replacement, null, "");
                AppliedSteps++;
                cost += rule.RhsBytes;
                if (MaxSteps is long stepMax && AppliedSteps >= stepMax)
                    throw Limit(LimitKind.Steps, ExitStepLimit, $"Applied step limit ({stepMax}) exceeded");
                if (Debug)
                {
                    ErrLine($"[{EvalCount}] RESULT: {state.Replace("\n", "\\n", StringComparison.Ordinal)}\n");
                }
                break;
            }
            if (!applied)
                return 0;
        }
    }

    public void WriteRuleCoverage()
    {
        if (coveragePath is null)
            return;
        WriteText(coveragePath, CoverageText());
    }

    public void Cleanup()
    {
        foreach (var binding in bindings.Values)
            binding.Process?.Cleanup();
    }

    public void Dispose()
    {
        if (disposed)
            return;
        disposed = true;
        Cleanup();
    }

    public static string FormatTrace(IReadOnlyList<TraceEvent> events)
    {
        if (events.Count == 0)
            return "";
        var builder = new StringBuilder();
        foreach (var ev in events)
        {
            builder.Append(TraceJson(ev));
            builder.Append('\n');
        }
        return builder.ToString();
    }

    public static string DisplayPath(string path)
    {
        var normalized = path.Replace('\\', '/');
        if (!Path.IsPathRooted(path))
            return normalized;
        var cwd = Path.GetFullPath(Directory.GetCurrentDirectory());
        var full = Path.GetFullPath(path);
        if (full == cwd)
            return "";
        var prefix = cwd.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (full.StartsWith(prefix, StringComparison.Ordinal))
            return full[prefix.Length..].Replace('\\', '/');
        return full.Replace('\\', '/');
    }

    public static string MetricsJson(RunMetrics metrics)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, JsonOptions))
        {
            writer.WriteStartObject();
            writer.WriteNumber("cost", metrics.Cost);
            writer.WriteNumber("applied_steps", metrics.AppliedSteps);
            writer.WriteNumber("regex_evals", metrics.RegexEvals);
            writer.WriteNumber("regex_matches", metrics.RegexMatches);
            writer.WriteNumber("state_bytes", metrics.StateBytes);
            writer.WriteNumber("state_peak", metrics.StatePeak);
            writer.WriteNumber("rule_count", metrics.RuleCount);
            writer.WriteNumber("rule_chars", metrics.RuleChars);
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(stream.ToArray()) + "\n";
    }

    void LoadText(string sourcePath, string content)
    {
        ParsedProgram parsed;
        try
        {
            parsed = Patterns.Parse(sourcePath, content);
        }
        catch (ParseError ex)
        {
            throw new ThueException(ex.Message);
        }
        rules = parsed.Rules;
        AssignState(parsed.State);
        midCache.Clear();
    }

    void AssignState(string value)
    {
        state = value;
        stateBytes = Encoding.UTF8.GetByteCount(value);
    }

    void NoteState()
    {
        var size = (long)stateBytes;
        sampledBytes += size;
        if (size > statePeak)
            statePeak = size;
    }

    MatchHit? FindMatch(int ruleIndex)
    {
        var rule = rules[ruleIndex];
        if (rule.LiteralPrefix.Length > 0 && !state.Contains(rule.LiteralPrefix, StringComparison.Ordinal))
            return null;
        regexEvals++;
        cost += stateBytes + (long)rule.LhsBytes;
        var found = FindRule(rule, state);
        if (found is not null)
            regexMatches++;
        return found;
    }

    MidOutcome ApplyMids(int lineNumber, int lhsBytes, List<string> mids, Dictionary<string, string> groups)
    {
        if (mids.Count == 0)
            return new MidOutcome { Groups = new Dictionary<string, string>(groups) };
        var output = new Dictionary<string, string>(groups);
        foreach (var pattern in mids)
        {
            string expanded;
            try
            {
                expanded = Template.ExpandMid(pattern, output);
            }
            catch (ParseError ex)
            {
                return new MidOutcome { Error = $"Line {lineNumber}: {ex.Message}" };
            }
            if (!midCache.TryGetValue(expanded, out var compiled))
            {
                try
                {
                    compiled = Patterns.CompileGuest(expanded);
                }
                catch (ArgumentException)
                {
                    return new MidOutcome { Error = $"Line {lineNumber}: Invalid ::| regex '{expanded}'" };
                }
                midCache[expanded] = compiled;
            }
            regexEvals++;
            cost += stateBytes + (long)lhsBytes;
            var found = compiled.Match(state);
            if (!found.Success)
                return new MidOutcome();
            regexMatches++;
            foreach (var name in compiled.GetGroupNames())
            {
                if (int.TryParse(name, out _))
                    continue;
                var group = found.Groups[name];
                if (group.Success)
                    output[name] = group.Value;
            }
        }
        return new MidOutcome { Groups = output };
    }

    string ReadOperator(int lineNumber, string rhs)
    {
        var parts = rhs.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 2)
            throw new ThueException($"Line {lineNumber}: ::< requires read_spec and literal resource");
        if (!double.TryParse(parts[0], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var seconds)
            || !double.IsFinite(seconds) || seconds <= 0)
        {
            throw new ThueException($"Line {lineNumber}: invalid read timeout '{parts[0]}'");
        }
        if (!Builtin.IsName(parts[1]))
            throw new ThueException($"Line {lineNumber}: ::< resource must be a literal binding name");
        var nanos = seconds * 1_000_000_000.0;
        if (!double.IsFinite(nanos) || nanos < 0)
            throw new ThueException($"Line {lineNumber}: invalid read timeout '{parts[0]}'");
        var ticks = nanos / 100.0;
        var timeout = ticks >= TimeSpan.MaxValue.Ticks ? TimeSpan.MaxValue : TimeSpan.FromTicks((long)ticks);
        var name = parts[1];
        if (!bindings.TryGetValue(name, out var binding))
            throw new ThueException($"Unknown resource '{name}'");
        if (binding.Kind is BindKind.Stdout or BindKind.Stderr)
            throw new ThueException("ERR:resource:cannot_read_output_stream");
        if (binding.Kind == BindKind.Script && binding.Script is { Readable: false })
            throw new ThueException("ERR:resource:cannot_read_output_stream");
        try
        {
            var line = binding.Kind switch
            {
                BindKind.Stdin => binding.Stdin!.ReadLine(timeout),
                BindKind.Process => binding.Process!.ReadLine(timeout),
                BindKind.Script => binding.Script!.ReadLine(),
                _ => throw new ThueException("ERR:resource:cannot_read_output_stream"),
            };
            return Builtin.PctEncode(line);
        }
        catch (ReadFail ex) when (ex.IsTimeout)
        {
            throw Limit(LimitKind.Timeout, ExitReadTimeout, $"ERR:resource:{name}:timeout");
        }
        catch (ReadFail ex)
        {
            throw new ThueException($"ERR:resource:{name}:{ex.Message}");
        }
    }

    (string Text, bool Ok) WriteOperator(string resource, string content)
    {
        if (!bindings.TryGetValue(resource, out var binding))
            return ($"ERR:resource:{resource}", false);
        try
        {
            switch (binding.Kind)
            {
                case BindKind.Stdout:
                    WriteStd(Console.OpenStandardOutput(), content);
                    break;
                case BindKind.Stderr:
                    WriteStd(Console.OpenStandardError(), content);
                    break;
                case BindKind.Stdin:
                    throw new IOException("write requires process or output stream binding");
                case BindKind.Process:
                    binding.Process!.Write(content);
                    break;
                case BindKind.Script:
                    binding.Script!.Write(content);
                    break;
            }
            return ("", true);
        }
        catch (Exception ex)
        {
            if (ex.Message == "cannot_read_output_stream")
                return ($"ERR:resource:{ex.Message}", false);
            return ($"ERR:resource:{resource}:{ex.Message}", false);
        }
    }

    void SetState(string newState)
    {
        var size = Encoding.UTF8.GetByteCount(newState);
        if (MaxStateBytes is long max && (max < 0 || size > max))
        {
            throw Limit(LimitKind.State, ExitStateLimit, $"State size ({size} bytes) exceeds maximum ({max} bytes)");
        }
        state = newState;
        stateBytes = size;
    }

    void RecordCoverage(string sourcePath, int lineNumber)
    {
        if (coveragePath is null)
            return;
        var id = $"{DisplayPath(sourcePath)}:{lineNumber}";
        coverage.TryGetValue(id, out var count);
        coverage[id] = count + 1;
    }

    void Record(int ruleIndex, Rule rule, MatchHit found, string stateBefore, string replacement, int? exitCode, string error)
    {
        if (!TraceEnabled)
            return;
        trace.Add(new TraceEvent
        {
            Step = EvalCount,
            RuleIndex = ruleIndex,
            SourcePath = rule.SourcePath,
            LineNumber = rule.LineNumber,
            Operator = Op.Text(rule.Operator),
            Lhs = rule.Lhs,
            MatchStart = Encoding.UTF8.GetByteCount(stateBefore.AsSpan(0, found.Start)),
            MatchEnd = Encoding.UTF8.GetByteCount(stateBefore.AsSpan(0, found.End)),
            StateBefore = stateBefore,
            Replacement = replacement,
            StateAfter = state,
            ExitCode = exitCode,
            Error = error,
        });
    }

    void DebugMatch(int lineNumber, string lhs, MatchHit found, string stateBefore)
    {
        ErrLine($"[{EvalCount}] STATE: {stateBefore.Replace("\n", "\\n", StringComparison.Ordinal)}");
        ErrLine($"[{EvalCount}] RULE {lineNumber} MATCHES STATE AT {ByteAt(stateBefore, found.Start)}:{ByteAt(stateBefore, found.End)}: {lhs}");
        ErrLine($"[{EvalCount}] GROUPS: {FormatGroups(found.Groups)}");
    }

    string CoverageText()
    {
        var builder = new StringBuilder();
        foreach (var pair in coverage)
        {
            builder.Append(pair.Key);
            builder.Append('\t');
            builder.Append(pair.Value);
            builder.Append('\n');
        }
        return builder.ToString();
    }

    static void WriteText(string path, string text)
    {
        var parent = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(parent))
            Directory.CreateDirectory(parent);
        File.WriteAllBytes(path, Encoding.UTF8.GetBytes(text));
    }

    static void WriteStd(Stream stream, string content)
    {
        var bytes = Encoding.UTF8.GetBytes(content);
        stream.Write(bytes);
        stream.Flush();
    }

    static void ErrLine(string text)
    {
        WriteStd(Console.OpenStandardError(), text + "\n");
    }

    static MatchHit? FindRule(Rule rule, string state)
    {
        var found = rule.Pattern.Match(state);
        if (!found.Success)
            return null;
        var groups = new Dictionary<string, string>();
        foreach (var name in rule.CaptureNames)
        {
            var group = found.Groups[name];
            if (group.Success)
                groups[name] = group.Value;
        }
        return new MatchHit { Start = found.Index, End = found.Index + found.Length, Groups = groups };
    }

    static string Splice(string state, int start, int end, string replacement)
    {
        return string.Concat(state.AsSpan(0, start), replacement, state.AsSpan(end));
    }

    static (string Resource, string Content) SplitResource(string expanded)
    {
        for (var index = 0; index < expanded.Length; index++)
        {
            var ch = expanded[index];
            if (ch is ' ' or '\t')
                return (expanded[..index], expanded[(index + 1)..]);
        }
        return (expanded, "");
    }

    static int? ParseExitCode(string rhs)
    {
        var trimmed = rhs.Trim();
        var code = trimmed.Length >= 2 && trimmed[0] == '{' && trimmed[^1] == '}'
            ? trimmed[1..^1]
            : trimmed;
        if (!Limits.TryAtoi(code, out var value, out _))
            return null;
        if (value < int.MinValue || value > int.MaxValue)
            return null;
        return (int)value;
    }

    static int ByteAt(string text, int charIndex) => Encoding.UTF8.GetByteCount(text.AsSpan(0, charIndex));

    static string FormatGroups(Dictionary<string, string> groups)
    {
        var keys = groups.Keys.ToList();
        keys.Sort(StringComparer.Ordinal);
        var parts = new List<string>(keys.Count);
        foreach (var key in keys)
        {
            var value = groups[key].Replace("\n", "\\n", StringComparison.Ordinal).Replace("\r", "\\r", StringComparison.Ordinal);
            parts.Add($"{key}:{value}");
        }
        return $"map[{string.Join(' ', parts)}]";
    }

    static string TraceJson(TraceEvent ev)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, JsonOptions))
        {
            writer.WriteStartObject();
            writer.WriteNumber("step", ev.Step);
            writer.WriteNumber("ruleIndex", ev.RuleIndex);
            writer.WriteNumber("lineNumber", ev.LineNumber);
            writer.WriteString("operator", ev.Operator);
            writer.WriteNumber("matchStart", ev.MatchStart);
            writer.WriteNumber("matchEnd", ev.MatchEnd);
            writer.WriteString("error", ev.Error);
            writer.WriteString("stateBefore", ev.StateBefore);
            writer.WriteString("replacement", ev.Replacement);
            writer.WriteString("stateAfter", ev.StateAfter);
            if (ev.ExitCode is int code)
                writer.WriteNumber("exitCode", code);
            else
                writer.WriteNull("exitCode");
            writer.WriteEndObject();
        }
        // Go's encoding/json writes these two separators as escapes. The rest of a non-ASCII string stays UTF-8.
        return Encoding.UTF8.GetString(stream.ToArray())
            .Replace("\u2028", "\\u2028", StringComparison.Ordinal)
            .Replace("\u2029", "\\u2029", StringComparison.Ordinal);
    }

    static LimitException Limit(LimitKind kind, int code, string message) => new(kind, code, message);

    static readonly JsonWriterOptions JsonOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        Indented = false,
    };

    enum BindKind { Stdin, Stdout, Stderr, Process, Script }

    sealed class Binding
    {
        public BindKind Kind { get; init; }
        public StdinResource? Stdin { get; init; }
        public ProcessResource? Process { get; init; }
        public ScriptResource? Script { get; init; }
    }

    sealed class ScriptResource
    {
        readonly List<string> lines;
        int index;
        string? recorded;
        public bool Readable { get; }
        public string? Recorded => recorded;

        public ScriptResource(List<string> lines, bool readable, bool writable)
        {
            this.lines = lines;
            Readable = readable;
            if (writable)
                recorded = "";
        }

        public string ReadLine()
        {
            if (!Readable)
                throw new ReadFail("cannot_read_output_stream");
            if (index >= lines.Count)
                throw new ReadFail("EOF before newline");
            return lines[index++];
        }

        public void Write(string content)
        {
            if (recorded is null)
                throw new IOException("write requires process or output stream binding");
            recorded += content;
        }
    }

    sealed class MatchHit
    {
        public int Start { get; init; }
        public int End { get; init; }
        public Dictionary<string, string> Groups { get; set; } = new();
    }

    sealed class MidOutcome
    {
        public Dictionary<string, string>? Groups { get; init; }
        public string? Error { get; init; }
    }
}
