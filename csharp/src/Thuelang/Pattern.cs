using System.Text;
using System.Text.RegularExpressions;

namespace Thuelang;

enum OpKind { Substitute, Read, Write, Exit, Builtin }

static class Op
{
    public static string Text(OpKind kind) => kind switch
    {
        OpKind.Substitute => "::=",
        OpKind.Read => "::<",
        OpKind.Write => "::>",
        OpKind.Exit => "::-",
        OpKind.Builtin => "::!",
        _ => throw new InvalidOperationException(),
    };

    public static OpKind? From(char op) => op switch
    {
        '=' => OpKind.Substitute,
        '<' => OpKind.Read,
        '>' => OpKind.Write,
        '-' => OpKind.Exit,
        '!' => OpKind.Builtin,
        _ => null,
    };
}

sealed class Rule
{
    public required string Lhs { get; init; }
    public required Regex Pattern { get; init; }
    public required List<string> Mids { get; init; }
    public required OpKind Operator { get; init; }
    public required string Rhs { get; init; }
    public required int LineNumber { get; init; }
    public required string SourcePath { get; init; }
    public required string Source { get; init; }
    public required string LiteralPrefix { get; init; }
    public required string BuiltinName { get; init; }
    public required List<string> BuiltinArgs { get; init; }
    public required int LhsBytes { get; init; }
    public required int RhsBytes { get; init; }
    public required int SourceBytes { get; init; }
    public required List<string> CaptureNames { get; init; }
}

sealed class ParsedProgram
{
    public required List<Rule> Rules { get; init; }
    public required string State { get; init; }
}

static class Patterns
{
    public const int MaxPatternAliasSubstitutionsPerLine = 10_000;
    public const int MaxExpandedPatternBytes = 1_000_000;

    static readonly Regex AliasDef = new(@"^\s*([A-Z][A-Z0-9_]*)\s*<-\s*(.*)$", RegexOptions.CultureInvariant | RegexOptions.Compiled);
    static readonly Regex InvalidAliasToken = new(@"<\|([A-Z][A-Z0-9_]*)\|>", RegexOptions.CultureInvariant | RegexOptions.Compiled);
    static readonly Regex NamedCapture = new(@"\(\?(?:<|P<)([A-Za-z_][A-Za-z0-9_]*)>", RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static List<string> SourceLines(string content)
    {
        if (content.Length == 0)
            return new();
        var trimmed = content.EndsWith('\n') ? content[..^1] : content;
        if (trimmed.Length == 0)
            return new() { "" };
        return trimmed.Split('\n').Select(line => line.EndsWith('\r') ? line[..^1] : line).ToList();
    }

    public static ParsedProgram Parse(string sourcePath, string content)
    {
        var annotated = Annotate(sourcePath, content);
        var rows = IterSourceRows(annotated, sourcePath);
        var separator = rows.FindIndex(row => row.Text.Trim() == "::=");
        List<Row> prefix;
        List<Row> stateRows;
        if (separator >= 0)
        {
            prefix = rows.GetRange(0, separator);
            stateRows = rows.GetRange(separator + 1, rows.Count - separator - 1);
        }
        else
        {
            prefix = rows;
            stateRows = new();
        }
        var expanded = ExpandPatterns(AnnotatedFromRows(prefix));
        var rules = new List<Rule>();
        var currentPath = sourcePath;
        var currentLine = 0;
        foreach (var line in SourceLines(expanded))
        {
            var trimmed = line.Trim();
            if (trimmed.StartsWith("# thue-source: ", StringComparison.Ordinal))
            {
                var marker = trimmed["# thue-source: ".Length..];
                var colon = marker.LastIndexOf(':');
                if (colon > 0 && int.TryParse(marker[(colon + 1)..], out var sourceLine) && sourceLine > 0)
                {
                    currentPath = marker[..colon];
                    currentLine = sourceLine;
                }
                continue;
            }
            var lineNumber = currentLine == 0 ? 1 : currentLine;
            var rule = ParseRule(line, lineNumber, currentPath);
            if (rule is not null)
                rules.Add(rule);
        }
        var state = string.Join('\n', stateRows.Select(row => row.Text));
        return new ParsedProgram { Rules = rules, State = state };
    }

    public static Regex CompileGuest(string pattern)
    {
        var translated = TranslateRe2(pattern).Replace("(?P<", "(?<", StringComparison.Ordinal);
        return new Regex("(?m)" + translated, RegexOptions.CultureInvariant);
    }

    public static List<string> CaptureNames(Regex pattern)
    {
        var names = new List<string>();
        foreach (var name in pattern.GetGroupNames())
        {
            if (int.TryParse(name, out _))
                continue;
            names.Add(name);
        }
        return names;
    }

    static Rule? ParseRule(string line, int lineNumber, string sourcePath)
    {
        var trimmed = line.Trim();
        if (trimmed.Length == 0 || trimmed == "::=")
            return null;
        RuleSplit? split;
        try
        {
            split = SplitRuleLine(line);
        }
        catch (ParseError ex)
        {
            throw new ParseError($"Line {lineNumber}: {ex.Message}");
        }
        if (split is null)
        {
            if (HasInvalidOperator(line))
                throw new ParseError($"Line {lineNumber}: Invalid rule syntax: {line}");
            return null;
        }
        var lhs = split.Lhs.TrimEnd(' ', '\t');
        var rhs = split.Rhs.TrimStart(' ', '\t');
        if (lhs.Length == 0)
            return null;
        var op = Op.From(split.Op) ?? throw new ParseError($"Line {lineNumber}: Invalid rule syntax: {line}");
        var mids = new List<string>();
        foreach (var text in split.Mids)
        {
            var pattern = text.Trim(' ', '\t');
            if (pattern.Length == 0)
                throw new ParseError($"Line {lineNumber}: ::| requires a regex");
            mids.Add(pattern);
        }
        Regex compiled;
        try
        {
            compiled = CompileGuest(lhs);
        }
        catch (ArgumentException ex)
        {
            throw new ParseError($"Line {lineNumber}: Invalid regex '{lhs}': {Flatten(ex.Message)}");
        }
        var builtinName = "";
        var builtinArgs = new List<string>();
        if (op == OpKind.Builtin)
        {
            var names = new HashSet<string>(CaptureNames(compiled));
            foreach (var mid in mids)
            {
                foreach (Match found in NamedCapture.Matches(mid))
                    names.Add(found.Groups[1].Value);
            }
            (builtinName, builtinArgs) = Builtin.ParseCall(rhs, lineNumber, names);
        }
        var source = line.Trim();
        return new Rule
        {
            Lhs = lhs,
            Pattern = compiled,
            Mids = mids,
            Operator = op,
            Rhs = rhs,
            LineNumber = lineNumber,
            SourcePath = sourcePath,
            Source = source,
            LiteralPrefix = Prefix.Literal(lhs),
            BuiltinName = builtinName,
            BuiltinArgs = builtinArgs,
            LhsBytes = Encoding.UTF8.GetByteCount(lhs),
            RhsBytes = Encoding.UTF8.GetByteCount(rhs),
            SourceBytes = Encoding.UTF8.GetByteCount(source),
            CaptureNames = CaptureNames(compiled),
        };
    }

    static string Flatten(string text) => text.Replace('\n', ' ').Replace('\r', ' ');

    sealed class Row
    {
        public required string Text { get; init; }
        public required string SourcePath { get; init; }
        public required int SourceLine { get; init; }
    }

    sealed class RuleSplit
    {
        public required string Lhs { get; init; }
        public required List<string> Mids { get; init; }
        public required char Op { get; init; }
        public required string Rhs { get; init; }
    }

    static string Annotate(string sourcePath, string content)
    {
        var builder = new StringBuilder();
        var lines = SourceLines(content);
        for (var index = 0; index < lines.Count; index++)
        {
            builder.Append("# thue-source: ").Append(sourcePath).Append(':').Append(index + 1).Append('\n');
            builder.Append(lines[index]).Append('\n');
        }
        return builder.ToString();
    }

    static List<Row> IterSourceRows(string content, string programPath)
    {
        var rows = new List<Row>();
        var currentPath = programPath;
        var currentLine = 0;
        var lines = SourceLines(content);
        for (var index = 0; index < lines.Count; index++)
        {
            var line = lines[index];
            var trimmed = line.Trim();
            if (trimmed.StartsWith("# thue-source: ", StringComparison.Ordinal))
            {
                var marker = trimmed["# thue-source: ".Length..];
                var colon = marker.LastIndexOf(':');
                if (colon > 0 && int.TryParse(marker[(colon + 1)..], out var sourceLine) && sourceLine > 0)
                {
                    currentPath = marker[..colon];
                    currentLine = sourceLine;
                }
                continue;
            }
            var sourceLineNumber = currentLine == 0 ? index + 1 : currentLine;
            rows.Add(new Row { Text = line, SourcePath = currentPath, SourceLine = sourceLineNumber });
        }
        return rows;
    }

    static string AnnotatedFromRows(List<Row> rows)
    {
        var builder = new StringBuilder();
        for (var index = 0; index < rows.Count; index++)
        {
            if (index > 0)
                builder.Append('\n');
            var row = rows[index];
            builder.Append("# thue-source: ").Append(row.SourcePath).Append(':').Append(row.SourceLine).Append('\n');
            builder.Append(row.Text);
        }
        return builder.ToString();
    }

    static string ExpandPatterns(string content)
    {
        var aliases = new Dictionary<string, string>();
        var output = new List<string>();
        var currentSourceLine = 0;
        var lines = SourceLines(content);
        for (var index = 0; index < lines.Count; index++)
        {
            var line = lines[index];
            var lineNumber = index + 1;
            var stripped = line.Trim();
            if (stripped.StartsWith("# thue-source: ", StringComparison.Ordinal))
            {
                var marker = stripped["# thue-source: ".Length..];
                var colon = marker.LastIndexOf(':');
                if (colon >= 0 && int.TryParse(marker[(colon + 1)..], out var parsed))
                    currentSourceLine = parsed;
                output.Add(line);
                continue;
            }
            var effective = currentSourceLine == 0 ? lineNumber : currentSourceLine;
            if (stripped.Length == 0)
            {
                output.Add(line);
                continue;
            }
            var found = AliasDef.Match(line);
            if (found.Success && !HasTerminalOperator(line))
            {
                var name = found.Groups[1].Value;
                var body = found.Groups[2].Value.Trim();
                if (aliases.ContainsKey(name))
                    throw new ParseError($"Line {effective}: Duplicate pattern alias '{name}'");
                if (NamedCapture.IsMatch(body))
                    throw new ParseError($"Line {effective}: Pattern alias '{name}' must not contain named captures");
                var expanded = ExpandAliasRefs(body, aliases, effective);
                aliases[name] = $"(?:{expanded})";
                continue;
            }
            RuleSplit? split;
            try
            {
                split = SplitRuleLine(line);
            }
            catch (ParseError ex)
            {
                throw new ParseError($"Line {effective}: {ex.Message}");
            }
            if (split is not null)
            {
                var rebuilt = new StringBuilder(ExpandAliasRefs(split.Lhs, aliases, effective));
                foreach (var mid in split.Mids)
                {
                    rebuilt.Append("::|");
                    rebuilt.Append(ExpandAliasRefs(mid, aliases, effective));
                }
                rebuilt.Append("::");
                rebuilt.Append(split.Op);
                rebuilt.Append(split.Rhs);
                output.Add(rebuilt.ToString());
            }
            else
            {
                output.Add(line);
            }
        }
        return string.Join('\n', output);
    }

    static string ExpandAliasRefs(string pattern, Dictionary<string, string> aliases, int lineNumber)
    {
        var invalid = InvalidAliasToken.Match(pattern);
        if (invalid.Success)
            throw new ParseError($"Line {lineNumber}: Invalid pattern alias token '<|{invalid.Groups[1].Value}|>'; use '${invalid.Groups[1].Value}' aliases");
        var chars = pattern.ToCharArray();
        var builder = new StringBuilder();
        var substitutions = 0;
        var index = 0;
        while (index < chars.Length)
        {
            var ch = chars[index];
            var escaped = index > 0 && chars[index - 1] == '\\';
            if (ch != '$' || escaped)
            {
                builder.Append(ch);
                index++;
                continue;
            }
            var end = index + 1;
            if (end >= chars.Length || chars[end] is < 'A' or > 'Z')
            {
                builder.Append('$');
                index++;
                continue;
            }
            end++;
            while (end < chars.Length)
            {
                var c = chars[end];
                if (c is >= 'A' and <= 'Z' or >= '0' and <= '9' or '_')
                    end++;
                else
                    break;
            }
            var name = new string(chars, index + 1, end - (index + 1));
            if (!aliases.TryGetValue(name, out var alias))
                throw new ParseError($"Line {lineNumber}: Unknown pattern alias '${name}'");
            substitutions++;
            if (substitutions > MaxPatternAliasSubstitutionsPerLine)
                throw new ParseError($"Line {lineNumber}: Pattern alias expansion exceeded substitution limit ({MaxPatternAliasSubstitutionsPerLine})");
            builder.Append(alias);
            index = end;
        }
        if (Encoding.UTF8.GetByteCount(builder.ToString()) > MaxExpandedPatternBytes)
            throw new ParseError($"Line {lineNumber}: Pattern alias expansion exceeded byte limit ({MaxExpandedPatternBytes})");
        return builder.ToString();
    }

    static char? StructuralOpAt(string line, int index)
    {
        if (index + 2 >= line.Length || line[index] != ':' || line[index + 1] != ':')
            return null;
        if (index > 0 && line[index - 1] == '\\')
            return null;
        var op = line[index + 2];
        return op is '|' or '=' or '<' or '>' or '-' or '!' ? op : null;
    }

    static bool HasTerminalOperator(string line)
    {
        for (var index = 0; index + 2 < line.Length; index++)
        {
            var op = StructuralOpAt(line, index);
            if (op is char found && found != '|')
                return true;
        }
        return false;
    }

    static RuleSplit? SplitRuleLine(string line)
    {
        var sawMid = false;
        var lhs = "";
        var mids = new List<string>();
        var index = 0;
        while (index + 2 < line.Length)
        {
            var op = StructuralOpAt(line, index);
            if (op is null)
            {
                index++;
                continue;
            }
            if (op == '|')
            {
                if (!sawMid)
                {
                    lhs = line[..index];
                    sawMid = true;
                }
                var nextAt = index + 3;
                var found = false;
                var nextOp = '\0';
                while (nextAt + 2 < line.Length)
                {
                    var next = StructuralOpAt(line, nextAt);
                    if (next is char parsed)
                    {
                        found = true;
                        nextOp = parsed;
                        break;
                    }
                    nextAt++;
                }
                if (!found)
                    throw new ParseError("::| requires a terminal operator");
                mids.Add(line[(index + 3)..nextAt]);
                if (nextOp == '|')
                {
                    index = nextAt;
                    continue;
                }
                return new RuleSplit { Lhs = lhs, Mids = mids, Op = nextOp, Rhs = line[(nextAt + 3)..] };
            }
            if (!sawMid)
                lhs = line[..index];
            return new RuleSplit { Lhs = lhs, Mids = mids, Op = op.Value, Rhs = line[(index + 3)..] };
        }
        if (sawMid)
            throw new ParseError("::| requires a terminal operator");
        return null;
    }

    static bool HasInvalidOperator(string line)
    {
        for (var index = 0; index + 2 < line.Length; index++)
        {
            if (line[index] == ':' && line[index + 1] == ':' && (index == 0 || line[index - 1] != '\\'))
            {
                var ch = line[index + 2];
                var word = ch is >= '0' and <= '9' or >= 'A' and <= 'Z' or >= 'a' and <= 'z' or '_';
                var whitespace = ch is ' ' or '\t' or '\n' or '\r' or '\f';
                var op = ch is '=' or '<' or '>' or '!' or '-';
                if (!word && !whitespace && !op)
                    return true;
            }
        }
        return false;
    }

    public static string TranslateRe2(string pattern)
    {
        var chars = pattern.ToCharArray();
        var builder = new StringBuilder();
        var index = 0;
        var atom = false;
        while (index < chars.Length)
        {
            if (chars[index] == '\\' && index + 1 < chars.Length && chars[index + 1] == 'Q')
            {
                index += 2;
                while (index < chars.Length)
                {
                    if (chars[index] == '\\' && index + 1 < chars.Length && chars[index + 1] == 'E')
                    {
                        index += 2;
                        break;
                    }
                    PushQuoted(builder, chars[index]);
                    atom = true;
                    index++;
                }
                continue;
            }
            if (chars[index] == '\\')
            {
                index = CopyEscape(chars, index, builder);
                atom = true;
                continue;
            }
            if (chars[index] == '[')
            {
                index = CopyClass(chars, index, builder);
                atom = true;
                continue;
            }
            if (chars[index] == '(')
            {
                var flagLen = FlagOnlyLen(chars, index);
                if (flagLen is int len)
                {
                    builder.Append(chars, index, len);
                    index += len;
                    atom = false;
                    continue;
                }
                builder.Append('(');
                index++;
                atom = false;
                continue;
            }
            if (chars[index] == ')')
            {
                builder.Append(')');
                index++;
                atom = true;
                continue;
            }
            if (chars[index] == '{')
            {
                var end = QuantifierEnd(chars, index);
                if (end is int quant && atom && QuantifierBoundsOk(chars, index, quant))
                {
                    builder.Append(chars, index, quant - index);
                    index = quant;
                    atom = false;
                    continue;
                }
                builder.Append("\\{");
                index++;
                atom = true;
                continue;
            }
            if (chars[index] is '*' or '+' or '?')
            {
                var groupMarker = builder.Length > 0 && builder[^1] == '(';
                builder.Append(chars[index]);
                index++;
                if (!groupMarker)
                    atom = false;
                continue;
            }
            if (chars[index] is '|' or '^' or '$')
            {
                builder.Append(chars[index]);
                index++;
                atom = false;
                continue;
            }
            builder.Append(chars[index]);
            index++;
            atom = true;
        }
        return builder.ToString();
    }

    static void PushQuoted(StringBuilder builder, char ch)
    {
        if (ch is '\\' or '.' or '+' or '*' or '?' or '(' or ')' or '|' or '[' or ']' or '{' or '}' or '^' or '$')
            builder.Append('\\');
        builder.Append(ch);
    }

    static int CopyEscape(char[] chars, int start, StringBuilder builder)
    {
        builder.Append('\\');
        var index = start + 1;
        if (index >= chars.Length)
            return index;
        var marker = chars[index];
        builder.Append(marker);
        index++;
        if ((marker is 'x' or 'p' or 'P') && index < chars.Length && chars[index] == '{')
        {
            builder.Append('{');
            index++;
            while (index < chars.Length && chars[index] != '}')
            {
                builder.Append(chars[index]);
                index++;
            }
            if (index < chars.Length)
            {
                builder.Append('}');
                index++;
            }
            return index;
        }
        if (marker is 'x' or 'u' or 'U')
        {
            var width = marker == 'x' ? 2 : marker == 'u' ? 4 : 8;
            for (var i = 0; i < width; i++)
            {
                if (index < chars.Length && IsHex(chars[index]))
                {
                    builder.Append(chars[index]);
                    index++;
                }
                else
                {
                    break;
                }
            }
        }
        return index;
    }

    static bool IsHex(char ch) => ch is >= '0' and <= '9' or >= 'a' and <= 'f' or >= 'A' and <= 'F';

    static int CopyClass(char[] chars, int start, StringBuilder builder)
    {
        builder.Append('[');
        var index = start + 1;
        if (index < chars.Length && chars[index] == '^')
        {
            builder.Append('^');
            index++;
        }
        if (index < chars.Length && chars[index] == ']')
        {
            builder.Append(']');
            index++;
        }
        while (index < chars.Length)
        {
            if (chars[index] == '\\')
            {
                index = CopyEscape(chars, index, builder);
                continue;
            }
            if (chars[index] == '[' && index + 1 < chars.Length && chars[index + 1] == ':')
            {
                builder.Append('[');
                builder.Append(':');
                index += 2;
                while (index < chars.Length && !(chars[index] == ':' && index + 1 < chars.Length && chars[index + 1] == ']'))
                {
                    builder.Append(chars[index]);
                    index++;
                }
                if (index < chars.Length)
                {
                    builder.Append(':');
                    builder.Append(']');
                    index += 2;
                }
                continue;
            }
            var ch = chars[index];
            builder.Append(ch);
            index++;
            if (ch == ']')
                break;
        }
        return index;
    }

    static int? FlagOnlyLen(char[] chars, int start)
    {
        if (start + 1 >= chars.Length || chars[start + 1] != '?')
            return null;
        var index = start + 2;
        var flags = 0;
        var minus = false;
        while (index < chars.Length)
        {
            var ch = chars[index];
            if (ch is 'i' or 'm' or 's' or 'U' or 'x' or 'u')
            {
                flags++;
                index++;
                continue;
            }
            if (ch == '-' && !minus)
            {
                minus = true;
                index++;
                continue;
            }
            if (ch == ')' && flags > 0)
                return index + 1 - start;
            return null;
        }
        return null;
    }

    static int? QuantifierEnd(char[] chars, int start)
    {
        if (chars[start] != '{')
            return null;
        var index = start + 1;
        if (index >= chars.Length || chars[index] is < '0' or > '9')
            return null;
        while (index < chars.Length && chars[index] is >= '0' and <= '9')
            index++;
        if (index < chars.Length && chars[index] == ',')
        {
            index++;
            while (index < chars.Length && chars[index] is >= '0' and <= '9')
                index++;
        }
        if (index < chars.Length && chars[index] == '}')
            return index + 1;
        return null;
    }

    static bool QuantifierBoundsOk(char[] chars, int start, int end)
    {
        var body = new string(chars, start + 1, end - start - 2);
        var comma = body.IndexOf(',');
        if (comma >= 0)
        {
            if (!System.Numerics.BigInteger.TryParse(body[..comma], out var low))
                return false;
            var right = body[(comma + 1)..];
            if (right.Length == 0)
                return true;
            if (!System.Numerics.BigInteger.TryParse(right, out var high))
                return false;
            return low <= high;
        }
        return System.Numerics.BigInteger.TryParse(body, out _);
    }
}
