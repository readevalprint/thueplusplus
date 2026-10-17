using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using Thuelang;

static class Program
{
    static int Main(string[] args)
    {
        if (args.Length == 0)
        {
            ErrLine("usage: thue <program> [--proc:<name> <command>]... [--input <state>] [options]");
            return 2;
        }
        using var interp = new Interpreter();
        string? inputOverride = null;
        string? countsPath = null;
        string? metricsPath = null;
        string? resourcesPath = null;
        string? resourceOutPath = null;
        var listRules = false;
        var index = 1;
        while (index < args.Length)
        {
            var arg = args[index];
            if (arg == "--debug")
            {
                interp.Debug = true;
                index++;
            }
            else if (arg == "--trace")
            {
                interp.TraceEnabled = true;
                index++;
            }
            else if (arg == "--list-rules")
            {
                listRules = true;
                index++;
            }
            else if (Take(args, ref index, "--rule-coverage", out var coverage))
            {
                interp.SetRuleCoveragePath(coverage);
            }
            else if (Take(args, ref index, "--counts", out var counts))
            {
                countsPath = counts;
            }
            else if (Take(args, ref index, "--metrics", out var metrics))
            {
                metricsPath = metrics;
            }
            else if (Take(args, ref index, "--resources", out var resources))
            {
                resourcesPath = resources;
            }
            else if (Take(args, ref index, "--resource-out", out var resourceOut))
            {
                resourceOutPath = resourceOut;
            }
            else if (Take(args, ref index, "--input", out var input))
            {
                inputOverride = input;
            }
            else if (Take(args, ref index, "--max-evals", out var evals))
            {
                if (!RequireLimit(evals, out var value))
                    return 2;
                interp.MaxEvals = value;
            }
            else if (Take(args, ref index, "--max-state-bytes", out var stateBytes))
            {
                if (!RequireLimit(stateBytes, out var value))
                    return 2;
                interp.MaxStateBytes = value;
            }
            else if (Take(args, ref index, "--max-steps", out var steps))
            {
                if (!RequireLimit(steps, out var value))
                    return 2;
                interp.MaxSteps = value;
            }
            else if (arg.StartsWith("--proc:", StringComparison.Ordinal))
            {
                var name = arg["--proc:".Length..];
                if (index + 1 >= args.Length)
                {
                    ErrLine($"Error: --proc:{name} requires a command argument");
                    return 1;
                }
                interp.AddProcBinding(name, args[index + 1]);
                index += 2;
            }
            else
            {
                ErrLine($"Error: Unknown argument: {arg}");
                return 1;
            }
        }

        try
        {
            interp.LoadProgram(args[0]);
        }
        catch (ThueException ex)
        {
            ErrLine($"Error: {ex.Message}");
            interp.Cleanup();
            return 1;
        }

        var exitCode = 0;
        string? errorMessage = null;
        var ran = false;
        if (listRules)
        {
            foreach (var rule in interp.ListedRules())
                OutLine($"{Interpreter.DisplayPath(rule.SourcePath)}:{rule.LineNumber}\t{rule.Lhs}");
        }
        else
        {
            if (inputOverride is not null)
                interp.ApplyInputOverride(inputOverride);
            if (resourcesPath is not null)
            {
                try
                {
                    var file = LoadResources(resourcesPath);
                    IReadOnlyDictionary<string, IReadOnlyList<string>> reads = file.Reads.ToDictionary(
                        pair => pair.Key,
                        pair => (IReadOnlyList<string>)pair.Value);
                    interp.BindScripts(reads, file.Writes);
                }
                catch (Exception ex) when (ex is ThueException or IOException or JsonException)
                {
                    ErrLine($"Error: {ex.Message}");
                    interp.Cleanup();
                    return 1;
                }
            }
            else if (resourceOutPath is not null)
            {
                ErrLine("Error: --resource-out requires --resources");
                interp.Cleanup();
                return 1;
            }
            ran = true;
            try
            {
                exitCode = interp.Run();
            }
            catch (LimitException ex)
            {
                errorMessage = ex.Message;
                exitCode = ex.Code;
            }
            catch (ThueException ex)
            {
                errorMessage = ex.Message;
                exitCode = ex.Code;
            }
        }
        if (interp.TraceEnabled)
            ErrRaw(Interpreter.FormatTrace(interp.Trace));
        if (errorMessage is not null)
            ErrLine($"Error: {errorMessage}");
        if (ran)
        {
            if (countsPath is not null)
            {
                try
                {
                    WriteBytes(countsPath, Encoding.UTF8.GetBytes($"{{\"applied_steps\":{interp.AppliedSteps},\"probes\":{interp.EvalCount}}}\n"));
                }
                catch (Exception ex)
                {
                    ErrLine($"Error: failed to write counts: {ex.Message}");
                    exitCode = 1;
                }
            }
            if (metricsPath is not null)
            {
                try
                {
                    WriteBytes(metricsPath, Encoding.UTF8.GetBytes(Interpreter.MetricsJson(interp.Metrics())));
                }
                catch (Exception ex)
                {
                    ErrLine($"Error: failed to write metrics: {ex.Message}");
                    exitCode = 1;
                }
            }
            if (resourceOutPath is not null)
            {
                try
                {
                    var writes = interp.ScriptWrites();
                    var json = JsonSerializer.Serialize(writes, ResourceJson) + "\n";
                    WriteBytes(resourceOutPath, Encoding.UTF8.GetBytes(json));
                }
                catch (Exception ex)
                {
                    ErrLine($"Error: failed to write resources: {ex.Message}");
                    exitCode = 1;
                }
            }
        }
        try
        {
            interp.WriteRuleCoverage();
        }
        catch (Exception ex)
        {
            ErrLine($"Error: failed to write rule coverage: {ex.Message}");
            exitCode = 1;
        }
        interp.Cleanup();
        return unchecked((byte)exitCode);
    }

    static bool Take(string[] args, ref int index, string flag, out string value)
    {
        value = "";
        var arg = args[index];
        if (arg == flag)
        {
            if (index + 1 >= args.Length)
            {
                ErrLine($"Error: {flag} requires an argument");
                Environment.Exit(1);
            }
            value = args[index + 1];
            index += 2;
            return true;
        }
        var equals = flag + "=";
        if (arg.StartsWith(equals, StringComparison.Ordinal))
        {
            value = arg[equals.Length..];
            index++;
            return true;
        }
        return false;
    }

    static bool RequireLimit(string text, out long? value)
    {
        if (Limits.TryParse(text, out value, out var error))
            return true;
        ErrLine(error);
        value = null;
        return false;
    }

    static ResourceFile LoadResources(string path)
    {
        var text = File.ReadAllText(path);
        var file = JsonSerializer.Deserialize<ResourceFile>(text, ResourceJson)
            ?? throw new JsonException($"{path}: empty JSON");
        if (file.Reads is null || file.Writes is null)
            throw new JsonException($"{path}: reads and writes are required");
        return file;
    }

    static void WriteBytes(string path, byte[] bytes)
    {
        var parent = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(parent))
            Directory.CreateDirectory(parent);
        File.WriteAllBytes(path, bytes);
    }

    static void ErrLine(string text) => ErrRaw(text + "\n");

    static void ErrRaw(string text)
    {
        var stream = Console.OpenStandardError();
        stream.Write(Encoding.UTF8.GetBytes(text));
        stream.Flush();
    }

    static void OutLine(string text)
    {
        var stream = Console.OpenStandardOutput();
        stream.Write(Encoding.UTF8.GetBytes(text + "\n"));
        stream.Flush();
    }

    static readonly JsonSerializerOptions ResourceJson = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        WriteIndented = true,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = false,
    };

    sealed class ResourceFile
    {
        [JsonRequired]
        public Dictionary<string, List<string>> Reads { get; set; } = new();

        [JsonRequired]
        public List<string> Writes { get; set; } = new();
    }
}
