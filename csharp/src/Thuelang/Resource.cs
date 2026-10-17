using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;

namespace Thuelang;

sealed class ReadFail : Exception
{
    public bool IsTimeout { get; }

    public ReadFail(string message) : base(message)
    {
    }

    public static ReadFail TimedOut() => new(true);

    ReadFail(bool timeout) : base("timeout")
    {
        IsTimeout = timeout;
    }
}

sealed class LineEvent
{
    public bool Eof { get; init; }
    public string Text { get; init; } = "";
}

sealed class StdinResource
{
    BlockingCollection<LineEvent>? events;

    public string ReadLine(TimeSpan timeout)
    {
        Start();
        var queue = events ?? throw new ReadFail("EOF before newline");
        if (!queue.TryTake(out var ev, Clamp(timeout)))
            throw queue.IsCompleted ? new ReadFail("EOF before newline") : ReadFail.TimedOut();
        if (ev.Eof)
            throw new ReadFail("EOF before newline");
        return Strip(ev.Text);
    }

    void Start()
    {
        if (events is not null)
            return;
        var queue = new BlockingCollection<LineEvent>();
        events = queue;
        var thread = new Thread(() => Pump(Console.OpenStandardInput(), queue)) { IsBackground = true };
        thread.Start();
    }

    static void Pump(Stream stream, BlockingCollection<LineEvent> queue)
    {
        var buf = new List<byte>(128);
        try
        {
            while (true)
            {
                var value = stream.ReadByte();
                if (value < 0)
                {
                    if (buf.Count > 0)
                        queue.Add(new LineEvent { Text = Encoding.UTF8.GetString(buf.ToArray()) });
                    queue.Add(new LineEvent { Eof = true });
                    break;
                }
                buf.Add((byte)value);
                if (value != '\n')
                    continue;
                queue.Add(new LineEvent { Text = Encoding.UTF8.GetString(buf.ToArray()) });
                buf.Clear();
            }
        }
        catch
        {
            try { queue.Add(new LineEvent { Eof = true }); } catch { /* reader gone */ }
        }
    }

    internal static string Strip(string line)
    {
        if (!line.EndsWith('\n'))
            throw new ReadFail("EOF before newline");
        var stripped = line[..^1];
        if (stripped.EndsWith('\r'))
            stripped = stripped[..^1];
        return stripped;
    }

    internal static TimeSpan Clamp(TimeSpan timeout)
    {
        var cap = TimeSpan.FromDays(365);
        if (timeout < TimeSpan.Zero)
            return TimeSpan.Zero;
        return timeout > cap ? cap : timeout;
    }
}

enum ProcKind { Line, Eof, Exited }

sealed class ProcEvent
{
    public ProcKind Kind { get; init; }
    public string Text { get; init; } = "";
    public int? Code { get; init; }
    public string Stderr { get; init; } = "";
}

sealed class ProcessResource
{
    readonly string command;
    Process? process;
    Stream? stdin;
    BlockingCollection<ProcEvent>? events;

    public ProcessResource(string command)
    {
        this.command = command;
    }

    public string ReadLine(TimeSpan timeout)
    {
        try
        {
            Ensure();
        }
        catch (IOException ex)
        {
            throw new ReadFail(ex.Message);
        }
        var queue = events ?? throw new ReadFail("EOF before newline");
        return ReadEvents(queue, Stopwatch.StartNew(), StdinResource.Clamp(timeout), null);
    }

    public void Write(string content)
    {
        Ensure();
        var stream = stdin ?? throw new IOException("process stdin is missing");
        var bytes = Encoding.UTF8.GetBytes(content);
        stream.Write(bytes);
        stream.Flush();
    }

    public void Cleanup()
    {
        var proc = process;
        process = null;
        stdin = null;
        if (proc is null)
            return;
        try
        {
            if (!proc.HasExited)
                proc.Kill(entireProcessTree: true);
        }
        catch
        {
            /* already gone */
        }
        try { proc.Dispose(); } catch { /* already disposed */ }
    }

    void Ensure()
    {
        if (process is not null)
            return;
        var start = new ProcessStartInfo
        {
            FileName = "sh",
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        start.ArgumentList.Add("-c");
        start.ArgumentList.Add($"stdbuf -oL {command}");
        var proc = new Process { StartInfo = start };
        try
        {
            if (!proc.Start())
                throw new IOException("process did not start");
        }
        catch (Exception ex)
        {
            throw new IOException(ex.Message);
        }
        var input = proc.StandardInput.BaseStream;
        var output = proc.StandardOutput.BaseStream;
        var error = proc.StandardError.BaseStream;
        var queue = new BlockingCollection<ProcEvent>();
        var errQueue = new BlockingCollection<string>(1);
        var stdoutThread = new Thread(() => Pump(output, queue)) { IsBackground = true };
        var stderrThread = new Thread(() =>
        {
            try
            {
                using var buffer = new MemoryStream();
                error.CopyTo(buffer);
                errQueue.Add(Encoding.UTF8.GetString(buffer.ToArray()));
            }
            catch
            {
                try { errQueue.Add(""); } catch { /* reader gone */ }
            }
        })
        { IsBackground = true };
        var waitThread = new Thread(() =>
        {
            int? code = null;
            try
            {
                proc.WaitForExit();
                code = proc.ExitCode;
            }
            catch
            {
                code = null;
            }
            var stderr = "";
            try
            {
                if (errQueue.TryTake(out var text, TimeSpan.FromDays(365)))
                    stderr = text;
            }
            catch
            {
                stderr = "";
            }
            try
            {
                queue.Add(new ProcEvent { Kind = ProcKind.Exited, Code = code, Stderr = stderr });
            }
            catch
            {
                /* reader gone */
            }
        })
        { IsBackground = true };
        stdoutThread.Start();
        stderrThread.Start();
        waitThread.Start();
        process = proc;
        stdin = input;
        events = queue;
    }

    static void Pump(Stream stream, BlockingCollection<ProcEvent> queue)
    {
        var buf = new List<byte>(128);
        try
        {
            while (true)
            {
                var value = stream.ReadByte();
                if (value < 0)
                {
                    if (buf.Count > 0)
                        queue.Add(new ProcEvent { Kind = ProcKind.Line, Text = Encoding.UTF8.GetString(buf.ToArray()) });
                    queue.Add(new ProcEvent { Kind = ProcKind.Eof });
                    break;
                }
                buf.Add((byte)value);
                if (value != '\n')
                    continue;
                queue.Add(new ProcEvent { Kind = ProcKind.Line, Text = Encoding.UTF8.GetString(buf.ToArray()) });
                buf.Clear();
            }
        }
        catch
        {
            try { queue.Add(new ProcEvent { Kind = ProcKind.Eof }); } catch { /* reader gone */ }
        }
    }

    static string ReadEvents(BlockingCollection<ProcEvent> events, Stopwatch clock, TimeSpan budget, (int? Code, string Stderr)? exited)
    {
        while (true)
        {
            if (clock.Elapsed >= budget)
                return Finish(exited);
            var left = budget - clock.Elapsed;
            if (!events.TryTake(out var ev, left))
                return Finish(exited);
            switch (ev.Kind)
            {
                case ProcKind.Line:
                    return StdinResource.Strip(ev.Text);
                case ProcKind.Eof:
                    if (exited is null && clock.Elapsed < budget)
                    {
                        var remain = budget - clock.Elapsed;
                        if (events.TryTake(out var next, remain) && next.Kind == ProcKind.Exited)
                            exited = (next.Code, next.Stderr);
                    }
                    if (exited is { } done)
                        return ExitError(done.Code, done.Stderr);
                    throw new ReadFail("EOF before newline");
                case ProcKind.Exited:
                    exited = (ev.Code, ev.Stderr);
                    break;
            }
        }
    }

    static string Finish((int? Code, string Stderr)? exited)
    {
        if (exited is { } done)
            return ExitError(done.Code, done.Stderr);
        throw ReadFail.TimedOut();
    }

    static string ExitError(int? code, string stderr)
    {
        if (code == 0)
            throw new ReadFail("EOF before newline");
        var message = stderr.Trim();
        if (message.Length == 0)
            throw new ReadFail($"process exited {code ?? -1}");
        throw new ReadFail(message);
    }
}
