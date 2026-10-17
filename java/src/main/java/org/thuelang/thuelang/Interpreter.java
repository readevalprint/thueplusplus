package org.thuelang.thuelang;

import com.google.re2j.Matcher;
import com.google.re2j.Pattern;
import com.google.re2j.PatternSyntaxException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * One Thue++ program.
 *
 * <p>Defaults match the other hosts: one million evals, 8 MiB of state, and one million applied
 * steps. A null limit is unlimited. Zero is a real limit. {@link #evalCount()} accumulates across
 * {@link #run()} calls. The other counters reset on each run.
 */
public final class Interpreter {
    public static final long DEFAULT_MAX_EVALS = 1_000_000L;
    public static final long DEFAULT_MAX_STATE_BYTES = 8L * 1024 * 1024;
    public static final long DEFAULT_MAX_STEPS = 1_000_000L;
    public static final int EXIT_RUNTIME = 1;
    public static final int EXIT_STEP_LIMIT = 10;
    public static final int EXIT_EVAL_LIMIT = 11;
    public static final int EXIT_STATE_LIMIT = 12;
    public static final int EXIT_READ_TIMEOUT = 13;

    static final int MAX_ALIAS_SUBSTITUTIONS = 10_000;
    static final int MAX_EXPANDED_PATTERN_BYTES = 1_000_000;

    private static final java.util.regex.Pattern ALIAS_DEF =
            java.util.regex.Pattern.compile("^\\s*([A-Z][A-Z0-9_]*)\\s*<-\\s*(.*)$");
    private static final java.util.regex.Pattern INVALID_ALIAS_TOKEN =
            java.util.regex.Pattern.compile("<\\|([A-Z][A-Z0-9_]*)\\|>");
    private static final java.util.regex.Pattern NAMED_CAPTURE =
            java.util.regex.Pattern.compile("\\(\\?(?:<|P<)([A-Za-z_][A-Za-z0-9_]*)>");
    private static final java.util.regex.Pattern JAVA_NAMED =
            java.util.regex.Pattern.compile("\\(\\?<([A-Za-z_][A-Za-z0-9_]*)>");
    private static final java.util.regex.Pattern INVALID_RULE =
            java.util.regex.Pattern.compile("(?:^|[^\\\\])::[^ \\t\\n\\f\\r0-9A-Za-z_=<>!-]");

    private static final String OP_SUBSTITUTE = "::=";
    private static final String OP_READ = "::<";
    private static final String OP_WRITE = "::>";
    private static final String OP_EXIT = "::-";
    private static final String OP_BUILTIN = "::!";

    private final List<Rule> rules = new ArrayList<>();
    private String state = "";
    private final Map<String, Binding> bindings = new LinkedHashMap<>();
    private Map<String, Resources.Script> scripts;
    private Long maxEvals = DEFAULT_MAX_EVALS;
    private Long maxStateBytes = DEFAULT_MAX_STATE_BYTES;
    private Long maxSteps = DEFAULT_MAX_STEPS;
    private long evalCount;
    private long appliedSteps;
    private long cost;
    private long regexEvals;
    private long regexMatches;
    private long stateBytes;
    private long statePeak;
    private boolean debug;
    private boolean traceEnabled;
    private String ruleCoveragePath = "";
    private final Map<String, Integer> coverage = new TreeMap<>();
    private String programPath = "";
    private final OutputStream debugOut;
    private final List<TraceEvent> trace = new ArrayList<>();

    public Interpreter() {
        this(System.in, System.out, System.err);
    }

    Interpreter(InputStream stdin, OutputStream stdout, OutputStream stderr) {
        this.debugOut = stderr;
        bindings.put("stdin", new Binding("stdin", new Resources.Stdin(stdin)));
        bindings.put("stdout", new Binding("stdout", new Resources.Output(stdout)));
        bindings.put("stderr", new Binding("stderr", new Resources.Output(stderr)));
    }

    public void setMaxEvals(Long value) {
        maxEvals = value;
    }

    public void setMaxStateBytes(Long value) {
        maxStateBytes = value;
    }

    public void setMaxSteps(Long value) {
        maxSteps = value;
    }

    public void setDebug(boolean enabled) {
        debug = enabled;
    }

    public void setTraceEnabled(boolean enabled) {
        traceEnabled = enabled;
    }

    public void setRuleCoveragePath(String path) {
        ruleCoveragePath = path == null ? "" : path;
    }

    public void addProcBinding(String name, String command) {
        bindings.put(name, new Binding(name, new Resources.Process(command)));
    }

    /** Replaces every binding, including stdin, stdout, and stderr, with in-memory scripts. */
    public void bindScripts(Map<String, List<String>> reads, List<String> writes) {
        if (reads == null) {
            throw new ThueException("reads are required");
        }
        if (writes == null) {
            throw new ThueException("writes are required");
        }
        Map<String, Boolean> writeSet = new LinkedHashMap<>();
        for (String name : writes) {
            if (!validResourceName(name)) {
                throw new ThueException("invalid resource " + JsonText.goQuote(name));
            }
            if (writeSet.containsKey(name)) {
                throw new ThueException("duplicate writable resource " + name);
            }
            writeSet.put(name, Boolean.TRUE);
        }
        for (Map.Entry<String, List<String>> entry : reads.entrySet()) {
            if (!validResourceName(entry.getKey())) {
                throw new ThueException("invalid resource " + JsonText.goQuote(entry.getKey()));
            }
            if (entry.getValue() == null) {
                throw new ThueException("resource " + entry.getKey() + " line contains a newline");
            }
            for (String line : entry.getValue()) {
                if (line.indexOf('\n') >= 0 || line.indexOf('\r') >= 0) {
                    throw new ThueException("resource " + entry.getKey() + " line contains a newline");
                }
            }
        }
        Map<String, Boolean> names = new LinkedHashMap<>();
        for (String name : reads.keySet()) {
            names.put(name, Boolean.TRUE);
        }
        for (String name : writeSet.keySet()) {
            names.put(name, Boolean.TRUE);
        }
        if (names.isEmpty()) {
            throw new ThueException("no resources");
        }
        cleanup();
        bindings.clear();
        scripts = new LinkedHashMap<>();
        for (String name : names.keySet()) {
            boolean readable = reads.containsKey(name);
            boolean writable = writeSet.containsKey(name);
            List<String> lines = reads.get(name);
            Resources.Script script = new Resources.Script(lines, readable, writable);
            scripts.put(name, script);
            bindings.put(name, new Binding(name, script));
        }
    }

    public Map<String, String> scriptWrites() {
        if (scripts == null) {
            throw new ThueException("this run has no scripted resources");
        }
        Map<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<String, Resources.Script> entry : scripts.entrySet()) {
            String recorded = entry.getValue().recorded();
            if (recorded != null) {
                out.put(entry.getKey(), recorded);
            }
        }
        return out;
    }

    public void loadProgram(String programPath) {
        Path abs = Path.of(programPath).toAbsolutePath().normalize();
        this.programPath = abs.toString();
        String text;
        try {
            text = Files.readString(abs, StandardCharsets.UTF_8);
        } catch (NoSuchFileException exc) {
            throw new ThueException("File not found: " + abs);
        } catch (IOException exc) {
            throw new ThueException(exc.getMessage() == null ? exc.toString() : exc.getMessage());
        }
        parseProgram(annotate(abs.toString(), text));
    }

    public void applyInputOverride(String value) {
        state = value;
    }

    /**
     * Runs until quiescence, {@code ::-}, or a limit.
     *
     * <p>A {@code ::-} result is the exit code and does not throw. An invalid {@code ::-} code
     * returns {@link #EXIT_RUNTIME} and does not throw. Other failures throw. Limit failures throw
     * {@link LimitException}.
     */
    public int run() {
        appliedSteps = 0;
        cost = 0;
        regexEvals = 0;
        regexMatches = 0;
        stateBytes = 0;
        statePeak = 0;
        trace.clear();
        noteState();
        while (true) {
            boolean applied = false;
            for (int ruleIndex = 0; ruleIndex < rules.size(); ruleIndex++) {
                Rule rule = rules.get(ruleIndex);
                if (maxEvals != null && evalCount >= maxEvals) {
                    throw new LimitException("evals", EXIT_EVAL_LIMIT, "Evaluation step limit (" + maxEvals + ") exceeded");
                }
                evalCount++;
                Match match = findMatch(rule, state);
                if (match == null) {
                    continue;
                }
                String stateBefore = state;
                MidResult mid;
                try {
                    mid = applyMids(rule, match.groups);
                } catch (ThueException exc) {
                    recordTrace(rule, ruleIndex, match, stateBefore, "", null, exc.getMessage());
                    throw exc;
                }
                if (!mid.ok) {
                    continue;
                }
                match = new Match(match.start, match.end, mid.groups);
                applied = true;
                Map<String, String> magic = Map.of("rule_index", Integer.toString(ruleIndex));
                if (debug) {
                    debugLine("[" + evalCount + "] STATE: " + state.replace("\n", "\\n"));
                    debugLine("[" + evalCount + "] RULE " + rule.lineNumber + " MATCHES STATE AT "
                            + utf8Offset(state, match.start) + ":" + utf8Offset(state, match.end) + ": " + rule.lhs);
                    debugLine("[" + evalCount + "] GROUPS: " + formatDebugGroups(match.groups));
                }
                if (!OP_EXIT.equals(rule.operator) && maxSteps != null && appliedSteps >= maxSteps) {
                    throw new LimitException("steps", EXIT_STEP_LIMIT, "Applied step limit (" + maxSteps + ") exceeded");
                }
                String repl = "";
                switch (rule.operator) {
                    case OP_SUBSTITUTE -> {
                        try {
                            repl = expandTemplate(rule.rhs, match.groups, magic);
                        } catch (ThueException exc) {
                            recordTrace(rule, ruleIndex, match, stateBefore, "", null, exc.getMessage());
                            throw exc;
                        }
                        recordCoverage(rule);
                    }
                    case OP_READ -> {
                        ReadSpec spec;
                        try {
                            spec = parseReadRhs(rule.lineNumber, rule.rhs);
                        } catch (ThueException exc) {
                            recordTrace(rule, ruleIndex, match, stateBefore, "", null, exc.getMessage());
                            throw exc;
                        }
                        Binding binding = bindings.get(spec.resource);
                        if (binding == null) {
                            ThueException exc = new ThueException("Unknown resource '" + spec.resource + "'");
                            recordTrace(rule, ruleIndex, match, stateBefore, "", null, exc.getMessage());
                            throw exc;
                        }
                        Resources.Read read = binding.resource.readLine(spec.timeoutNanos);
                        if (read.error() != null) {
                            String message = Resources.format(binding.name, read);
                            recordTrace(rule, ruleIndex, match, stateBefore, "", null, message);
                            if (read.timeout()) {
                                throw new LimitException("timeout", EXIT_READ_TIMEOUT, message);
                            }
                            throw new ThueException(message);
                        }
                        repl = Builtin.pctEncode(read.line());
                        recordCoverage(rule);
                    }
                    case OP_WRITE -> {
                        String expanded;
                        try {
                            expanded = expandTemplate(rule.rhs, match.groups, magic);
                        } catch (ThueException exc) {
                            recordTrace(rule, ruleIndex, match, stateBefore, "", null, exc.getMessage());
                            throw exc;
                        }
                        String[] parts = splitResource(expanded);
                        Binding binding = bindings.get(parts[0]);
                        if (binding == null) {
                            repl = "ERR:resource:" + parts[0];
                        } else {
                            String err = binding.resource.write(parts[1]);
                            repl = err.isEmpty() ? "" : Resources.formatWrite(binding.name, err);
                        }
                        if (binding != null && repl.isEmpty()) {
                            recordCoverage(rule);
                        }
                    }
                    case OP_BUILTIN -> {
                        List<String> values = new ArrayList<>(rule.builtinArgs.size());
                        for (String arg : rule.builtinArgs) {
                            if (!match.groups.containsKey(arg)) {
                                ThueException exc = new ThueException(
                                        "Line " + rule.lineNumber + ": ::! argument '" + arg + "' was not captured");
                                recordTrace(rule, ruleIndex, match, stateBefore, "", null, exc.getMessage());
                                throw exc;
                            }
                            values.add(match.groups.get(arg));
                        }
                        try {
                            repl = Builtin.eval(rule.builtinName, values);
                        } catch (ThueException exc) {
                            recordTrace(rule, ruleIndex, match, stateBefore, "", null, exc.getMessage());
                            throw exc;
                        }
                        recordCoverage(rule);
                    }
                    case OP_EXIT -> {
                        Integer code = parseExitCode(rule.rhs);
                        recordCoverage(rule);
                        if (code == null) {
                            recordTrace(rule, ruleIndex, match, stateBefore, "", null, "");
                            return EXIT_RUNTIME;
                        }
                        recordTrace(rule, ruleIndex, match, stateBefore, "", code, "");
                        return code;
                    }
                    default -> throw new ThueException("Line " + rule.lineNumber + ": Invalid rule syntax: " + rule.source);
                }
                String next = state.substring(0, match.start) + repl + state.substring(match.end);
                try {
                    setState(next);
                } catch (LimitException exc) {
                    recordTrace(rule, ruleIndex, match, stateBefore, repl, null, exc.getMessage());
                    throw exc;
                }
                noteState();
                recordTrace(rule, ruleIndex, match, stateBefore, repl, null, "");
                chargeStep(rule.rhs);
                if (maxSteps != null && appliedSteps >= maxSteps) {
                    throw new LimitException("steps", EXIT_STEP_LIMIT, "Applied step limit (" + maxSteps + ") exceeded");
                }
                if (debug) {
                    debugLine("[" + evalCount + "] RESULT: " + state.replace("\n", "\\n"));
                    debugLine("");
                }
                break;
            }
            if (!applied) {
                return 0;
            }
        }
    }

    public long evalCount() {
        return evalCount;
    }

    public long appliedSteps() {
        return appliedSteps;
    }

    public RunMetrics metrics() {
        long chars = 0;
        for (Rule rule : rules) {
            chars += utf8Len(rule.source);
        }
        return new RunMetrics(cost, appliedSteps, regexEvals, regexMatches, stateBytes, statePeak, rules.size(), chars);
    }

    public String metricsJson() {
        RunMetrics m = metrics();
        return "{\"cost\":" + m.cost()
                + ",\"applied_steps\":" + m.appliedSteps()
                + ",\"regex_evals\":" + m.regexEvals()
                + ",\"regex_matches\":" + m.regexMatches()
                + ",\"state_bytes\":" + m.stateBytes()
                + ",\"state_peak\":" + m.statePeak()
                + ",\"rule_count\":" + m.ruleCount()
                + ",\"rule_chars\":" + m.ruleChars()
                + "}\n";
    }

    public String countsJson() {
        return "{\"applied_steps\":" + appliedSteps + ",\"probes\":" + evalCount + "}\n";
    }

    public String formatTrace() {
        if (trace.isEmpty()) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        for (TraceEvent event : trace) {
            out.append("{\"step\":").append(event.step);
            out.append(",\"ruleIndex\":").append(event.ruleIndex);
            out.append(",\"lineNumber\":").append(event.lineNumber);
            out.append(",\"operator\":").append(JsonText.quote(event.operator));
            out.append(",\"matchStart\":").append(event.matchStart);
            out.append(",\"matchEnd\":").append(event.matchEnd);
            out.append(",\"error\":").append(JsonText.quote(event.error));
            out.append(",\"stateBefore\":").append(JsonText.quote(event.stateBefore));
            out.append(",\"replacement\":").append(JsonText.quote(event.replacement));
            out.append(",\"stateAfter\":").append(JsonText.quote(event.stateAfter));
            out.append(",\"exitCode\":").append(event.exitCode == null ? "null" : event.exitCode.toString());
            out.append("}\n");
        }
        return out.toString();
    }

    public List<ListedRule> listedRules() {
        List<ListedRule> listed = new ArrayList<>(rules.size());
        for (Rule rule : rules) {
            listed.add(new ListedRule(rule.sourcePath, rule.lineNumber, rule.lhs));
        }
        return listed;
    }

    public static String displayPath(String source) {
        Path path = Path.of(source);
        Path absolute = path.isAbsolute() ? path.normalize() : path.toAbsolutePath().normalize();
        Path cwd = Path.of("").toAbsolutePath().normalize();
        if (absolute.startsWith(cwd)) {
            Path relative = cwd.relativize(absolute);
            String text = relative.toString().replace('\\', '/');
            if (!text.startsWith("..")) {
                return text.isEmpty() ? source : text;
            }
        }
        return absolute.toString().replace('\\', '/');
    }

    public void writeRuleCoverage() {
        if (ruleCoveragePath.isEmpty()) {
            return;
        }
        Path path = Path.of(ruleCoveragePath);
        try {
            Path parent = path.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            Files.writeString(path, coverageTsv(), StandardCharsets.UTF_8);
        } catch (IOException exc) {
            throw new ThueException(exc.getMessage() == null ? exc.toString() : exc.getMessage());
        }
    }

    public String coverageTsv() {
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, Integer> entry : coverage.entrySet()) {
            out.append(entry.getKey()).append('\t').append(entry.getValue()).append('\n');
        }
        return out.toString();
    }

    public static String resourceOutputJson(Map<String, String> writes) {
        if (writes == null) {
            throw new ThueException("writes are required");
        }
        List<String> keys = new ArrayList<>(writes.keySet());
        keys.sort(String::compareTo);
        if (keys.isEmpty()) {
            return "{}\n";
        }
        StringBuilder out = new StringBuilder("{\n");
        for (int i = 0; i < keys.size(); i++) {
            out.append("  ").append(JsonText.quote(keys.get(i))).append(": ").append(JsonText.quote(writes.get(keys.get(i))));
            if (i + 1 < keys.size()) {
                out.append(',');
            }
            out.append('\n');
        }
        out.append("}\n");
        return out.toString();
    }

    public void cleanup() {
        for (Binding binding : bindings.values()) {
            binding.resource.cleanup();
        }
    }

    private void parseProgram(String annotated) {
        List<SourceRow> rows = sourceRows(annotated, programPath);
        int separator = -1;
        for (int i = 0; i < rows.size(); i++) {
            if (rows.get(i).text.strip().equals("::=")) {
                separator = i;
                break;
            }
        }
        List<SourceRow> prefix = rows;
        List<SourceRow> stateRows = List.of();
        if (separator >= 0) {
            prefix = rows.subList(0, separator);
            stateRows = rows.subList(separator + 1, rows.size());
        }
        String expanded = expandPatterns(annotatedFromRows(prefix));
        rules.clear();
        String currentPath = programPath;
        int currentLine = 0;
        List<String> lines = splitAnnotated(expanded);
        for (int idx = 0; idx < lines.size(); idx++) {
            String line = lines.get(idx);
            String trimmed = line.strip();
            if (trimmed.startsWith("# thue-source: ")) {
                Marker marker = marker(trimmed);
                if (marker != null) {
                    currentPath = marker.path;
                    currentLine = marker.line;
                }
                continue;
            }
            int sourceLine = currentLine == 0 ? idx + 1 : currentLine;
            Rule rule = parseRule(line, sourceLine, currentPath);
            if (rule != null) {
                rules.add(rule);
            }
        }
        StringBuilder joined = new StringBuilder();
        for (int i = 0; i < stateRows.size(); i++) {
            if (i > 0) {
                joined.append('\n');
            }
            joined.append(stateRows.get(i).text);
        }
        state = joined.toString();
    }

    private static String annotate(String path, String content) {
        StringBuilder out = new StringBuilder();
        int lineNumber = 0;
        for (String line : scanLines(content)) {
            lineNumber++;
            out.append("# thue-source: ").append(path).append(':').append(lineNumber).append('\n');
            out.append(line).append('\n');
        }
        return out.toString();
    }

    static List<String> scanLines(String content) {
        if (content.isEmpty()) {
            return List.of();
        }
        String body = content.endsWith("\n") ? content.substring(0, content.length() - 1) : content;
        if (body.isEmpty()) {
            return List.of("");
        }
        String[] parts = body.split("\n", -1);
        List<String> lines = new ArrayList<>(parts.length);
        for (String part : parts) {
            if (part.endsWith("\r")) {
                part = part.substring(0, part.length() - 1);
            }
            lines.add(part);
        }
        return lines;
    }

    private static List<String> splitAnnotated(String content) {
        if (content.isEmpty()) {
            return List.of();
        }
        String body = content.endsWith("\n") ? content.substring(0, content.length() - 1) : content;
        if (body.isEmpty()) {
            return List.of("");
        }
        return List.of(body.split("\n", -1));
    }

    private static List<SourceRow> sourceRows(String content, String programPath) {
        List<SourceRow> rows = new ArrayList<>();
        String currentPath = programPath;
        int currentLine = 0;
        List<String> lines = splitAnnotated(content);
        for (int lineNumber = 0; lineNumber < lines.size(); lineNumber++) {
            String line = lines.get(lineNumber);
            String trimmed = line.strip();
            if (trimmed.startsWith("# thue-source: ")) {
                Marker marker = marker(trimmed);
                if (marker != null) {
                    currentPath = marker.path;
                    currentLine = marker.line;
                }
                continue;
            }
            int sourceLine = currentLine == 0 ? lineNumber + 1 : currentLine;
            rows.add(new SourceRow(line, currentPath, sourceLine));
        }
        return rows;
    }

    private static String annotatedFromRows(List<SourceRow> rows) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < rows.size(); i++) {
            if (i > 0) {
                out.append('\n');
            }
            SourceRow row = rows.get(i);
            out.append("# thue-source: ").append(row.sourcePath).append(':').append(row.sourceLine).append('\n');
            out.append(row.text);
        }
        return out.toString();
    }

    private static Marker marker(String trimmed) {
        String body = trimmed.substring("# thue-source: ".length());
        int colon = body.lastIndexOf(':');
        if (colon < 0) {
            return null;
        }
        try {
            int line = Integer.parseInt(body.substring(colon + 1));
            return new Marker(body.substring(0, colon), line);
        } catch (NumberFormatException exc) {
            return null;
        }
    }

    private static String expandPatterns(String content) {
        Map<String, String> aliases = new LinkedHashMap<>();
        List<String> out = new ArrayList<>();
        int currentSourceLine = 0;
        List<String> lines = splitAnnotated(content);
        for (int idx = 0; idx < lines.size(); idx++) {
            String line = lines.get(idx);
            int lineNumber = idx + 1;
            String stripped = line.strip();
            if (stripped.startsWith("# thue-source: ")) {
                Marker marker = marker(stripped);
                if (marker != null) {
                    currentSourceLine = marker.line;
                }
                out.add(line);
                continue;
            }
            int effective = currentSourceLine == 0 ? lineNumber : currentSourceLine;
            if (stripped.isEmpty()) {
                out.add(line);
                continue;
            }
            java.util.regex.Matcher alias = ALIAS_DEF.matcher(line);
            if (alias.matches() && !hasTerminalOperator(line)) {
                String name = alias.group(1);
                String pat = alias.group(2).strip();
                if (aliases.containsKey(name)) {
                    throw new ThueException("Line " + effective + ": Duplicate pattern alias '" + name + "'");
                }
                if (NAMED_CAPTURE.matcher(pat).find()) {
                    throw new ThueException("Line " + effective + ": Pattern alias '" + name + "' must not contain named captures");
                }
                String expanded = expandAliasRefs(pat, aliases, effective);
                aliases.put(name, "(?:" + expanded + ")");
                continue;
            }
            Split split;
            try {
                split = splitRuleLine(line);
            } catch (ThueException exc) {
                throw new ThueException("Line " + effective + ": " + exc.getMessage());
            }
            if (split != null) {
                StringBuilder rebuilt = new StringBuilder(expandAliasRefs(split.lhs, aliases, effective));
                for (String mid : split.mids) {
                    rebuilt.append("::|").append(expandAliasRefs(mid, aliases, effective));
                }
                rebuilt.append("::").append(split.op).append(split.rhs);
                out.add(rebuilt.toString());
                continue;
            }
            out.add(line);
        }
        return String.join("\n", out);
    }

    private static String expandAliasRefs(String pattern, Map<String, String> aliases, int lineNumber) {
        java.util.regex.Matcher bad = INVALID_ALIAS_TOKEN.matcher(pattern);
        if (bad.find()) {
            String name = bad.group(1);
            throw new ThueException("Line " + lineNumber + ": Invalid pattern alias token '<|" + name + "|>'; use '$" + name + "' aliases");
        }
        StringBuilder out = new StringBuilder();
        int substitutions = 0;
        for (int idx = 0; idx < pattern.length(); ) {
            char ch = pattern.charAt(idx);
            if (ch != '$' || (idx > 0 && pattern.charAt(idx - 1) == '\\')) {
                out.append(ch);
                idx++;
                continue;
            }
            int end = idx + 1;
            if (end >= pattern.length() || pattern.charAt(end) < 'A' || pattern.charAt(end) > 'Z') {
                out.append(ch);
                idx++;
                continue;
            }
            end++;
            while (end < pattern.length()) {
                char next = pattern.charAt(end);
                if ((next >= 'A' && next <= 'Z') || (next >= '0' && next <= '9') || next == '_') {
                    end++;
                    continue;
                }
                break;
            }
            String name = pattern.substring(idx + 1, end);
            String alias = aliases.get(name);
            if (alias == null) {
                throw new ThueException("Line " + lineNumber + ": Unknown pattern alias '$" + name + "'");
            }
            substitutions++;
            if (substitutions > MAX_ALIAS_SUBSTITUTIONS) {
                throw new ThueException("Line " + lineNumber + ": Pattern alias expansion exceeded substitution limit ("
                        + MAX_ALIAS_SUBSTITUTIONS + ")");
            }
            out.append(alias);
            idx = end;
        }
        String expanded = out.toString();
        if (utf8Len(expanded) > MAX_EXPANDED_PATTERN_BYTES) {
            throw new ThueException("Line " + lineNumber + ": Pattern alias expansion exceeded byte limit ("
                    + MAX_EXPANDED_PATTERN_BYTES + ")");
        }
        return expanded;
    }

    private static Rule parseRule(String line, int lineNumber, String sourcePath) {
        String trimmed = line.strip();
        if (trimmed.isEmpty() || trimmed.equals("::=")) {
            return null;
        }
        Split split;
        try {
            split = splitRuleLine(line);
        } catch (ThueException exc) {
            throw new ThueException("Line " + lineNumber + ": " + exc.getMessage());
        }
        if (split == null) {
            if (INVALID_RULE.matcher(line).find()) {
                throw new ThueException("Line " + lineNumber + ": Invalid rule syntax: " + line);
            }
            return null;
        }
        String lhs = rstrip(split.lhs);
        String rhs = lstrip(split.rhs);
        if (lhs.isEmpty()) {
            return null;
        }
        String operator = switch (split.op) {
            case '=' -> OP_SUBSTITUTE;
            case '<' -> OP_READ;
            case '>' -> OP_WRITE;
            case '-' -> OP_EXIT;
            case '!' -> OP_BUILTIN;
            default -> throw new ThueException("Line " + lineNumber + ": Invalid rule syntax: " + line);
        };
        List<String> mids = new ArrayList<>(split.mids.size());
        for (String text : split.mids) {
            mids.add(parseMid(text, lineNumber));
        }
        Pattern pattern;
        try {
            pattern = compilePattern(lhs);
        } catch (PatternSyntaxException exc) {
            throw new ThueException("Line " + lineNumber + ": Invalid regex '" + lhs + "': " + exc.getMessage());
        }
        String builtinName = "";
        List<String> builtinArgs = List.of();
        if (OP_BUILTIN.equals(operator)) {
            Map<String, Boolean> names = new LinkedHashMap<>();
            for (String name : pattern.namedGroups().keySet()) {
                names.put(name, Boolean.TRUE);
            }
            for (String mid : mids) {
                java.util.regex.Matcher named = NAMED_CAPTURE.matcher(mid);
                while (named.find()) {
                    names.put(named.group(1), Boolean.TRUE);
                }
            }
            BuiltinCall call = parseBuiltinCall(rhs, lineNumber, names);
            builtinName = call.name;
            builtinArgs = call.args;
        }
        return new Rule(lhs, pattern, Prefix.literalPrefix(lhs), mids, operator, rhs, lineNumber, sourcePath, trimmed, builtinName, builtinArgs);
    }

    private static String parseMid(String text, int lineNumber) {
        int start = 0;
        int end = text.length();
        while (start < end && (text.charAt(start) == ' ' || text.charAt(start) == '\t')) {
            start++;
        }
        while (end > start && (text.charAt(end - 1) == ' ' || text.charAt(end - 1) == '\t')) {
            end--;
        }
        if (start == end) {
            throw new ThueException("Line " + lineNumber + ": ::| requires a regex");
        }
        return text.substring(start, end);
    }

    private static BuiltinCall parseBuiltinCall(String rhs, int lineNumber, Map<String, Boolean> captures) {
        List<String> tokens = fields(rhs);
        if (tokens.isEmpty()) {
            throw new ThueException("Line " + lineNumber + ": ::! requires a builtin name");
        }
        String name = tokens.get(0);
        Integer arity = Builtin.arity(name);
        if (arity == null) {
            throw new ThueException("Line " + lineNumber + ": Unknown builtin '" + name + "'");
        }
        List<String> args = tokens.subList(1, tokens.size());
        if (args.size() != arity) {
            throw new ThueException("Line " + lineNumber + ": Builtin '" + name + "' expects " + arity + " args, got " + args.size());
        }
        for (String arg : args) {
            if (!isWord(arg) || (arg.charAt(0) >= '0' && arg.charAt(0) <= '9')) {
                throw new ThueException("Line " + lineNumber + ": ::! arguments must be capture names, got '" + arg + "'");
            }
            if (!captures.containsKey(arg)) {
                throw new ThueException("Line " + lineNumber + ": ::! argument '" + arg + "' is not a named capture");
            }
        }
        return new BuiltinCall(name, List.copyOf(args));
    }

    private Match findMatch(Rule rule, String text) {
        if (rule.literalPrefix.isEmpty() || text.contains(rule.literalPrefix)) {
            chargeEval(text, rule.lhs);
            Matcher matcher = rule.pattern.matcher(text);
            if (!matcher.find()) {
                return null;
            }
            regexMatches++;
            Map<String, String> groups = new LinkedHashMap<>();
            for (Map.Entry<String, Integer> entry : rule.pattern.namedGroups().entrySet()) {
                String value = matcher.group(entry.getValue());
                if (value != null) {
                    groups.put(entry.getKey(), value);
                }
            }
            return new Match(matcher.start(), matcher.end(), groups);
        }
        return null;
    }

    private MidResult applyMids(Rule rule, Map<String, String> groups) {
        if (rule.mids.isEmpty()) {
            return new MidResult(groups, true);
        }
        Map<String, String> out = new LinkedHashMap<>(groups);
        for (String mid : rule.mids) {
            String expanded = expandMidPattern(mid, out, rule.lineNumber);
            Pattern pattern;
            try {
                pattern = compilePattern(expanded);
            } catch (PatternSyntaxException exc) {
                throw new ThueException("Line " + rule.lineNumber + ": Invalid ::| regex '" + expanded + "'");
            }
            chargeEval(state, rule.lhs);
            Matcher matcher = pattern.matcher(state);
            if (!matcher.find()) {
                return new MidResult(out, false);
            }
            regexMatches++;
            for (Map.Entry<String, Integer> entry : pattern.namedGroups().entrySet()) {
                String value = matcher.group(entry.getValue());
                if (value != null) {
                    out.put(entry.getKey(), value);
                }
            }
        }
        return new MidResult(out, true);
    }

    private static String expandMidPattern(String pattern, Map<String, String> groups, int lineNumber) {
        try {
            return expandMid(pattern, groups);
        } catch (ThueException exc) {
            throw new ThueException("Line " + lineNumber + ": " + exc.getMessage());
        }
    }

    private static String expandMid(String pattern, Map<String, String> groups) {
        StringBuilder out = new StringBuilder();
        int pos = 0;
        while (pos < pattern.length()) {
            if (pattern.startsWith("{{", pos)) {
                int end = pattern.indexOf("}}", pos + 2);
                if (end >= 0) {
                    String inside = pattern.substring(pos + 2, end);
                    if (inside.indexOf('|') >= 0) {
                        out.append(expandMidFilters(inside, groups));
                        pos = end + 2;
                        continue;
                    }
                    if (isMidName(inside)) {
                        String value = groups.get(inside);
                        if (value != null) {
                            out.append(value);
                        }
                        pos = end + 2;
                        continue;
                    }
                }
            }
            int next = pattern.indexOf("{{", pos);
            if (next < 0) {
                out.append(pattern, pos, pattern.length());
                break;
            }
            if (next == pos) {
                out.append(pattern.charAt(pos));
                pos++;
                continue;
            }
            out.append(pattern, pos, next);
            pos = next;
        }
        return out.toString();
    }

    private static String expandMidFilters(String inside, Map<String, String> groups) {
        String[] parts = inside.split("\\|", -1);
        if (parts.length < 2 || !isMidName(parts[0])) {
            throw new ThueException("Malformed template filter '{{" + inside + "}}'");
        }
        for (int i = 1; i < parts.length; i++) {
            if (!isMidName(parts[i])) {
                throw new ThueException("Malformed template filter '{{" + inside + "}}'");
            }
        }
        if (!groups.containsKey(parts[0])) {
            throw new ThueException("Missing template capture '" + parts[0] + "'");
        }
        String value = groups.get(parts[0]);
        for (int i = 1; i < parts.length; i++) {
            value = renderMidFilter(parts[i], value);
        }
        return value;
    }

    private static String renderMidFilter(String name, String value) {
        return switch (name) {
            case "pctenc" -> Builtin.pctEncode(value);
            case "pctdec" -> Builtin.pctDecode(value);
            case "quote" -> Builtin.quoteMeta(value);
            default -> throw new ThueException("Unknown template filter '" + name + "'");
        };
    }

    private static String expandTemplate(String template, Map<String, String> groups, Map<String, String> extra) {
        Map<String, String> raw = new LinkedHashMap<>(groups);
        raw.putAll(extra);
        Map<String, String> vars = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : groups.entrySet()) {
            vars.put(entry.getKey(), entry.getValue().replace("\\", "\\\\"));
        }
        for (Map.Entry<String, String> entry : extra.entrySet()) {
            vars.put(entry.getKey(), entry.getValue().replace("\\", "\\\\"));
        }
        StringBuilder out = new StringBuilder();
        int pos = 0;
        while (pos < template.length()) {
            if (template.startsWith("{{", pos)) {
                int end = template.indexOf("}}", pos + 2);
                if (end >= 0) {
                    String inside = template.substring(pos + 2, end);
                    if (inside.indexOf('|') >= 0) {
                        String[] parts = inside.split("\\|", -1);
                        if (parts.length != 2 || !isCaptureName(parts[0]) || !isCaptureName(parts[1])) {
                            throw new ThueException("Malformed template filter '{{" + inside + "}}'");
                        }
                        if (!raw.containsKey(parts[0])) {
                            throw new ThueException("Missing template capture '" + parts[0] + "'");
                        }
                        String value = raw.get(parts[0]);
                        switch (parts[1]) {
                            case "pctenc" -> out.append(Builtin.pctEncode(value));
                            case "pctdec" -> out.append(Builtin.pctDecode(value));
                            default -> throw new ThueException("Unknown template filter '" + parts[1] + "'");
                        }
                        pos = end + 2;
                        continue;
                    }
                    if (isWord(inside)) {
                        String value = vars.get(inside);
                        if (value != null) {
                            out.append(value);
                        }
                        pos = end + 2;
                        continue;
                    }
                }
            }
            if (template.startsWith("{{", pos)) {
                out.append(template.charAt(pos));
                pos++;
                continue;
            }
            int literalStart = pos;
            while (pos < template.length() && !template.startsWith("{{", pos)) {
                pos++;
            }
            out.append(decodeReplacementEscapes(template.substring(literalStart, pos)));
        }
        return out.toString();
    }

    private static String decodeReplacementEscapes(String text) {
        String placeholder = "\u0000BACKSLASH\u0000";
        text = text.replace("\\\\", placeholder);
        text = text.replace("\\n", "\n");
        text = text.replace("\\t", "\t");
        text = text.replace("\\r", "\r");
        text = text.replace(placeholder, "\\");
        return text;
    }

    private static ReadSpec parseReadRhs(int lineNumber, String rhs) {
        List<String> parts = fields(rhs.strip());
        if (parts.size() != 2) {
            throw new ThueException("Line " + lineNumber + ": ::< requires read_spec and literal resource");
        }
        String readSpec = parts.get(0);
        String resource = parts.get(1);
        double seconds;
        try {
            seconds = Double.parseDouble(readSpec);
        } catch (NumberFormatException exc) {
            seconds = Double.NaN;
        }
        if (Double.isNaN(seconds) || Double.isInfinite(seconds) || seconds <= 0) {
            throw new ThueException("Line " + lineNumber + ": invalid read timeout '" + readSpec + "'");
        }
        if (!isWord(resource) || (resource.charAt(0) >= '0' && resource.charAt(0) <= '9')) {
            throw new ThueException("Line " + lineNumber + ": ::< resource must be a literal binding name");
        }
        return new ReadSpec(resource, (long) (seconds * 1_000_000_000d));
    }

    private static Integer parseExitCode(String rhs) {
        String code = rhs.strip();
        if (code.startsWith("{") && code.endsWith("}") && code.length() >= 2) {
            code = code.substring(1, code.length() - 1);
        }
        if (!atoiSyntax(code)) {
            return null;
        }
        try {
            long value = Long.parseLong(code);
            return (int) value;
        } catch (NumberFormatException exc) {
            return null;
        }
    }

    static boolean atoiSyntax(String text) {
        String digits = text.startsWith("-") ? text.substring(1) : text;
        if (digits.isEmpty()) {
            return false;
        }
        for (int i = 0; i < digits.length(); i++) {
            char ch = digits.charAt(i);
            if (ch < '0' || ch > '9') {
                return false;
            }
        }
        return true;
    }

    private void setState(String next) {
        long size = utf8Len(next);
        if (maxStateBytes != null && size > maxStateBytes) {
            throw new LimitException(
                    "state",
                    EXIT_STATE_LIMIT,
                    "State size (" + size + " bytes) exceeds maximum (" + maxStateBytes + " bytes)");
        }
        state = next;
    }

    private void noteState() {
        long n = utf8Len(state);
        stateBytes += n;
        if (n > statePeak) {
            statePeak = n;
        }
    }

    private void chargeEval(String text, String lhs) {
        regexEvals++;
        cost += utf8Len(text) + utf8Len(lhs);
    }

    private void chargeStep(String rhs) {
        appliedSteps++;
        cost += utf8Len(rhs);
    }

    private void recordCoverage(Rule rule) {
        coverage.merge(ruleId(rule), 1, Integer::sum);
    }

    private static String ruleId(Rule rule) {
        return displayPath(rule.sourcePath) + ":" + rule.lineNumber;
    }

    private void recordTrace(
            Rule rule, int ruleIndex, Match match, String stateBefore, String replacement, Integer exitCode, String error) {
        if (!traceEnabled) {
            return;
        }
        trace.add(new TraceEvent(
                evalCount,
                ruleIndex,
                rule.lineNumber,
                rule.operator,
                utf8Offset(stateBefore, match.start),
                utf8Offset(stateBefore, match.end),
                error,
                stateBefore,
                replacement,
                state,
                exitCode));
    }

    private void debugLine(String text) {
        try {
            debugOut.write((text + "\n").getBytes(StandardCharsets.UTF_8));
            debugOut.flush();
        } catch (IOException exc) {
            throw new ThueException(exc.getMessage() == null ? exc.toString() : exc.getMessage());
        }
    }

    private static String formatDebugGroups(Map<String, String> groups) {
        List<String> keys = new ArrayList<>(groups.keySet());
        keys.sort(String::compareTo);
        StringBuilder out = new StringBuilder("map[");
        for (int i = 0; i < keys.size(); i++) {
            if (i > 0) {
                out.append(' ');
            }
            String value = groups.get(keys.get(i)).replace("\n", "\\n").replace("\r", "\\r");
            out.append(keys.get(i)).append(':').append(value);
        }
        out.append(']');
        return out.toString();
    }

    private static String[] splitResource(String expanded) {
        for (int i = 0; i < expanded.length(); i++) {
            char ch = expanded.charAt(i);
            if (ch == ' ' || ch == '\t') {
                return new String[] {expanded.substring(0, i), expanded.substring(i + 1)};
            }
        }
        return new String[] {expanded, ""};
    }

    private static String translateLhs(String lhs) {
        return JAVA_NAMED.matcher(lhs).replaceAll("(?P<$1>");
    }

    private static Pattern compilePattern(String lhs) {
        return Pattern.compile("(?m)" + literalBraces(translateLhs(lhs)));
    }

    /**
     * re2j records a failed {@code {} repeat as a real repeat, so a literal brace
     * before a quantifier is rejected. {@code \{} is the same literal and clears that flag.
     * A real quantifier, an escape, and a {@code \Q} quote are left alone.
     */
    static String literalBraces(String pattern) {
        StringBuilder out = new StringBuilder(pattern.length());
        int i = 0;
        while (i < pattern.length()) {
            char ch = pattern.charAt(i);
            if (ch == '\\') {
                if (i + 1 < pattern.length() && pattern.charAt(i + 1) == 'Q') {
                    int end = pattern.indexOf("\\E", i + 2);
                    if (end < 0) {
                        out.append(pattern, i, pattern.length());
                        break;
                    }
                    out.append(pattern, i, end + 2);
                    i = end + 2;
                    continue;
                }
                out.append(ch);
                if (i + 1 < pattern.length()) {
                    out.append(pattern.charAt(i + 1));
                    i += 2;
                } else {
                    i++;
                }
                continue;
            }
            if (ch == '{' && !isRepeat(pattern, i)) {
                out.append("\\{");
                i++;
                continue;
            }
            out.append(ch);
            i++;
        }
        return out.toString();
    }

    private static boolean isRepeat(String pattern, int i) {
        int j = i + 1;
        if (j >= pattern.length() || !isDigit(pattern.charAt(j))) {
            return false;
        }
        while (j < pattern.length() && isDigit(pattern.charAt(j))) {
            j++;
        }
        if (j >= pattern.length()) {
            return false;
        }
        if (pattern.charAt(j) == ',') {
            j++;
            while (j < pattern.length() && isDigit(pattern.charAt(j))) {
                j++;
            }
        }
        return j < pattern.length() && pattern.charAt(j) == '}';
    }

    private static boolean isDigit(char ch) {
        return ch >= '0' && ch <= '9';
    }

    /** Byte offset of a UTF-16 index. re2j reports code units; trace and debug report UTF-8 bytes. */
    static int utf8Offset(String text, int charIndex) {
        int n = 0;
        int limit = Math.min(charIndex, text.length());
        for (int i = 0; i < limit; ) {
            int cp = text.codePointAt(i);
            int width = Character.charCount(cp);
            if (i + width > limit) {
                break;
            }
            if (cp < 0x80) {
                n++;
            } else if (cp < 0x800) {
                n += 2;
            } else if (cp < 0x10000) {
                n += 3;
            } else {
                n += 4;
            }
            i += width;
        }
        return n;
    }

    static long utf8Len(String text) {
        long n = 0;
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            if (cp < 0x80) {
                n++;
            } else if (cp < 0x800) {
                n += 2;
            } else if (cp < 0x10000) {
                n += 3;
            } else {
                n += 4;
            }
            i += Character.charCount(cp);
        }
        return n;
    }

    private static boolean isWord(String text) {
        if (text.isEmpty()) {
            return false;
        }
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (!(ch == '_' || (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'))) {
                return false;
            }
        }
        return true;
    }

    private static boolean isMidName(String text) {
        if (text.isEmpty() || (text.charAt(0) >= '0' && text.charAt(0) <= '9')) {
            return false;
        }
        return isWord(text);
    }

    private static boolean isCaptureName(String text) {
        return isMidName(text);
    }

    private static boolean validResourceName(String name) {
        if (name.isEmpty()) {
            return false;
        }
        for (int i = 0; i < name.length(); i++) {
            char ch = name.charAt(i);
            if (ch == '_' || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
                continue;
            }
            if (i > 0 && ch >= '0' && ch <= '9') {
                continue;
            }
            return false;
        }
        return true;
    }

    private static List<String> fields(String text) {
        List<String> tokens = new ArrayList<>();
        int i = 0;
        while (i < text.length()) {
            int cp = text.codePointAt(i);
            if (Character.isWhitespace(cp)) {
                i += Character.charCount(cp);
                continue;
            }
            int start = i;
            while (i < text.length()) {
                int next = text.codePointAt(i);
                if (Character.isWhitespace(next)) {
                    break;
                }
                i += Character.charCount(next);
            }
            tokens.add(text.substring(start, i));
        }
        return tokens;
    }

    private static String rstrip(String text) {
        int end = text.length();
        while (end > 0 && (text.charAt(end - 1) == ' ' || text.charAt(end - 1) == '\t')) {
            end--;
        }
        return text.substring(0, end);
    }

    private static String lstrip(String text) {
        int start = 0;
        while (start < text.length() && (text.charAt(start) == ' ' || text.charAt(start) == '\t')) {
            start++;
        }
        return text.substring(start);
    }

    private static boolean hasTerminalOperator(String line) {
        for (int i = 0; i + 2 < line.length(); i++) {
            Character op = structuralOpAt(line, i);
            if (op != null && op != '|') {
                return true;
            }
        }
        return false;
    }

    private static Split splitRuleLine(String line) {
        boolean sawMid = false;
        String lhs = "";
        List<String> mids = new ArrayList<>();
        for (int i = 0; i + 2 < line.length(); ) {
            Character op = structuralOpAt(line, i);
            if (op == null) {
                i++;
                continue;
            }
            if (op == '|') {
                if (!sawMid) {
                    lhs = line.substring(0, i);
                    sawMid = true;
                }
                Next next = nextStructuralOp(line, i + 3);
                if (next == null || next.op == 0) {
                    throw new ThueException("::| requires a terminal operator");
                }
                mids.add(line.substring(i + 3, next.index));
                if (next.op == '|') {
                    i = next.index;
                    continue;
                }
                return new Split(lhs, mids, next.op, line.substring(next.index + 3));
            }
            if (!sawMid) {
                lhs = line.substring(0, i);
            }
            return new Split(lhs, mids, op, line.substring(i + 3));
        }
        if (sawMid) {
            throw new ThueException("::| requires a terminal operator");
        }
        return null;
    }

    private static Character structuralOpAt(String line, int i) {
        if (i + 2 >= line.length() || line.charAt(i) != ':' || line.charAt(i + 1) != ':') {
            return null;
        }
        if (i > 0 && line.charAt(i - 1) == '\\') {
            return null;
        }
        char op = line.charAt(i + 2);
        return switch (op) {
            case '|', '=', '<', '>', '-', '!' -> op;
            default -> null;
        };
    }

    private static Next nextStructuralOp(String line, int start) {
        for (int i = start; i + 2 < line.length(); i++) {
            Character op = structuralOpAt(line, i);
            if (op != null) {
                return new Next(i, op);
            }
        }
        return null;
    }

    public record ListedRule(String sourcePath, int lineNumber, String lhs) {}

    private record Rule(
            String lhs,
            Pattern pattern,
            String literalPrefix,
            List<String> mids,
            String operator,
            String rhs,
            int lineNumber,
            String sourcePath,
            String source,
            String builtinName,
            List<String> builtinArgs) {}

    private record SourceRow(String text, String sourcePath, int sourceLine) {}

    private record Marker(String path, int line) {}

    private record Split(String lhs, List<String> mids, char op, String rhs) {}

    private record Next(int index, char op) {}

    private record Match(int start, int end, Map<String, String> groups) {}

    private record MidResult(Map<String, String> groups, boolean ok) {}

    private record BuiltinCall(String name, List<String> args) {}

    private record ReadSpec(String resource, long timeoutNanos) {}

    private record TraceEvent(
            long step,
            int ruleIndex,
            int lineNumber,
            String operator,
            int matchStart,
            int matchEnd,
            String error,
            String stateBefore,
            String replacement,
            String stateAfter,
            Integer exitCode) {}

    private record Binding(String name, Resources.Resource resource) {}
}
