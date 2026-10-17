package org.thuelang.thuelang;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/** Host resources. A new interpreter binds only stdin, stdout, and stderr. */
final class Resources {
    private Resources() {}

    record Read(String line, String error, boolean omitName, boolean timeout) {
        static Read ok(String line) {
            return new Read(line, null, false, false);
        }

        static Read fail(String error, boolean omitName) {
            return new Read(null, error, omitName, false);
        }

        static Read timedOut() {
            return new Read(null, "timeout", false, true);
        }
    }

    interface Resource {
        Read readLine(long timeoutNanos);

        /** Empty string on success. Otherwise the raw error, without the {@code ERR:resource:} prefix. */
        String write(String content);

        void cleanup();
    }

    static String format(String name, Read read) {
        if (read.omitName) {
            return "ERR:resource:" + read.error;
        }
        return "ERR:resource:" + name + ":" + read.error;
    }

    static String formatWrite(String name, String error) {
        return "ERR:resource:" + name + ":" + error;
    }

    static final class Output implements Resource {
        private final OutputStream stream;

        Output(OutputStream stream) {
            this.stream = stream;
        }

        @Override
        public Read readLine(long timeoutNanos) {
            return Read.fail("cannot_read_output_stream", true);
        }

        @Override
        public String write(String content) {
            try {
                stream.write(content.getBytes(StandardCharsets.UTF_8));
                stream.flush();
                return "";
            } catch (IOException exc) {
                return exc.getMessage() == null ? exc.toString() : exc.getMessage();
            }
        }

        @Override
        public void cleanup() {}
    }

    static final class Stdin implements Resource {
        private final InputStream stream;
        private final BlockingQueue<String> lines = new LinkedBlockingQueue<>();
        private volatile boolean started;
        private volatile boolean closed;

        Stdin(InputStream stream) {
            this.stream = stream;
        }

        private void start() {
            if (started) {
                return;
            }
            synchronized (this) {
                if (started) {
                    return;
                }
                started = true;
                Thread thread = new Thread(this::pump, "thue-stdin");
                thread.setDaemon(true);
                thread.start();
            }
        }

        private void pump() {
            pumpLines(stream, lines);
            closed = true;
        }

        @Override
        public Read readLine(long timeoutNanos) {
            start();
            return take(lines, timeoutNanos, () -> closed);
        }

        @Override
        public String write(String content) {
            return "write requires process or output stream binding";
        }

        @Override
        public void cleanup() {}
    }

    static final class Process implements Resource {
        private final String command;
        private java.lang.Process process;
        private OutputStream stdin;
        private final BlockingQueue<String> lines = new LinkedBlockingQueue<>();
        private final ByteArrayOutputStream stderr = new ByteArrayOutputStream();
        private volatile boolean closed;
        private volatile Integer exitCode;

        Process(String command) {
            this.command = command;
        }

        private void ensureStarted() {
            if (process != null) {
                return;
            }
            try {
                process = new ProcessBuilder("/bin/sh", "-c", "stdbuf -oL " + command).start();
            } catch (IOException exc) {
                throw new ThueException(exc.getMessage() == null ? exc.toString() : exc.getMessage());
            }
            stdin = process.getOutputStream();
            Thread out = new Thread(() -> {
                pumpLines(process.getInputStream(), lines);
                closed = true;
            }, "thue-proc-out");
            out.setDaemon(true);
            out.start();
            Thread err = new Thread(() -> {
                try {
                    process.getErrorStream().transferTo(stderr);
                } catch (IOException ignored) {
                    // The exit status still reports the failure.
                }
                try {
                    exitCode = process.waitFor();
                } catch (InterruptedException exc) {
                    Thread.currentThread().interrupt();
                }
            }, "thue-proc-err");
            err.setDaemon(true);
            err.start();
        }

        @Override
        public Read readLine(long timeoutNanos) {
            try {
                ensureStarted();
            } catch (ThueException exc) {
                return Read.fail(exc.getMessage(), false);
            }
            long deadline = System.nanoTime() + timeoutNanos;
            while (true) {
                String queued = lines.poll();
                if (queued != null) {
                    return fromQueued(queued);
                }
                if (closed) {
                    return exited();
                }
                long left = deadline - System.nanoTime();
                if (left <= 0) {
                    if (closed) {
                        return exited();
                    }
                    return Read.timedOut();
                }
                try {
                    String line = lines.poll(left, TimeUnit.NANOSECONDS);
                    if (line != null) {
                        return fromQueued(line);
                    }
                } catch (InterruptedException exc) {
                    Thread.currentThread().interrupt();
                    return Read.timedOut();
                }
                if (closed) {
                    String late = lines.poll();
                    if (late != null) {
                        return fromQueued(late);
                    }
                    return exited();
                }
                return Read.timedOut();
            }
        }

        private Read exited() {
            Integer code = exitCode;
            if (code != null && code != 0) {
                String message = stderr.toString(StandardCharsets.UTF_8).strip();
                if (message.isEmpty()) {
                    message = "process exited " + code;
                }
                return Read.fail(message, false);
            }
            return Read.fail("EOF before newline", false);
        }

        @Override
        public String write(String content) {
            try {
                ensureStarted();
                stdin.write(content.getBytes(StandardCharsets.UTF_8));
                stdin.flush();
                return "";
            } catch (ThueException exc) {
                return exc.getMessage();
            } catch (IOException exc) {
                return exc.getMessage() == null ? exc.toString() : exc.getMessage();
            }
        }

        @Override
        public void cleanup() {
            if (process != null) {
                process.destroyForcibly();
                try {
                    process.waitFor(1, TimeUnit.SECONDS);
                } catch (InterruptedException exc) {
                    Thread.currentThread().interrupt();
                }
            }
        }
    }

    static final class Script implements Resource {
        private final java.util.List<String> lines;
        private int at;
        private final boolean readable;
        private final StringBuilder recorded;

        Script(java.util.List<String> lines, boolean readable, boolean writable) {
            this.lines = lines;
            this.readable = readable;
            this.recorded = writable ? new StringBuilder() : null;
        }

        String recorded() {
            return recorded == null ? null : recorded.toString();
        }

        @Override
        public Read readLine(long timeoutNanos) {
            if (!readable) {
                return Read.fail("cannot_read_output_stream", true);
            }
            if (lines == null || at >= lines.size()) {
                return Read.fail("EOF before newline", false);
            }
            return Read.ok(lines.get(at++));
        }

        @Override
        public String write(String content) {
            if (recorded == null) {
                return "write requires process or output stream binding";
            }
            recorded.append(content);
            return "";
        }

        @Override
        public void cleanup() {}
    }

    private static Read take(BlockingQueue<String> lines, long timeoutNanos, java.util.function.BooleanSupplier closed) {
        long deadline = System.nanoTime() + timeoutNanos;
        while (true) {
            String queued = lines.poll();
            if (queued != null) {
                return fromQueued(queued);
            }
            if (closed.getAsBoolean()) {
                return Read.fail("EOF before newline", false);
            }
            long left = deadline - System.nanoTime();
            if (left <= 0) {
                return Read.timedOut();
            }
            try {
                String line = lines.poll(left, TimeUnit.NANOSECONDS);
                if (line == null) {
                    if (closed.getAsBoolean()) {
                        return Read.fail("EOF before newline", false);
                    }
                    return Read.timedOut();
                }
                return fromQueued(line);
            } catch (InterruptedException exc) {
                Thread.currentThread().interrupt();
                return Read.timedOut();
            }
        }
    }

    private static Read fromQueued(String line) {
        if (!line.endsWith("\n")) {
            return Read.fail("EOF before newline", false);
        }
        String stripped = line.substring(0, line.length() - 1);
        if (stripped.endsWith("\r")) {
            stripped = stripped.substring(0, stripped.length() - 1);
        }
        return Read.ok(stripped);
    }

    private static void pumpLines(InputStream stream, BlockingQueue<String> lines) {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        try {
            while (true) {
                int b = stream.read();
                if (b < 0) {
                    if (buf.size() > 0) {
                        lines.put(buf.toString(StandardCharsets.UTF_8));
                    }
                    return;
                }
                buf.write(b);
                if (b == '\n') {
                    lines.put(buf.toString(StandardCharsets.UTF_8));
                    buf.reset();
                }
            }
        } catch (IOException | InterruptedException exc) {
            if (exc instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
        }
    }
}
