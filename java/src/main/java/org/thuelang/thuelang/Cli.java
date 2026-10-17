package org.thuelang.thuelang;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Thin command line over {@link Interpreter}. */
public final class Cli {
    private Cli() {}

    public static void main(String[] args) {
        if (args.length == 0) {
            System.err.println("usage: thue <program> [--proc:<name> <command>]... [--input <state>] [options]");
            System.exit(2);
        }
        Interpreter interp = new Interpreter();
        String inputOverride = null;
        boolean sawInput = false;
        String coveragePath = "";
        String countsPath = "";
        String metricsPath = "";
        String resourcesPath = "";
        String resourceOutPath = "";
        boolean listRules = false;

        for (int idx = 1; idx < args.length; ) {
            String arg = args[idx];
            if (arg.equals("--debug")) {
                interp.setDebug(true);
                idx++;
            } else if (arg.equals("--trace")) {
                interp.setTraceEnabled(true);
                idx++;
            } else if (arg.equals("--list-rules")) {
                listRules = true;
                idx++;
            } else if (arg.equals("--rule-coverage") || arg.startsWith("--rule-coverage=")) {
                coveragePath = value(args, idx, "--rule-coverage");
                idx += arg.startsWith("--rule-coverage=") ? 1 : 2;
            } else if (arg.equals("--counts") || arg.startsWith("--counts=")) {
                countsPath = value(args, idx, "--counts");
                idx += arg.startsWith("--counts=") ? 1 : 2;
            } else if (arg.equals("--metrics") || arg.startsWith("--metrics=")) {
                metricsPath = value(args, idx, "--metrics");
                idx += arg.startsWith("--metrics=") ? 1 : 2;
            } else if (arg.equals("--input") || arg.startsWith("--input=")) {
                inputOverride = value(args, idx, "--input");
                sawInput = true;
                idx += arg.startsWith("--input=") ? 1 : 2;
            } else if (arg.equals("--max-evals") || arg.startsWith("--max-evals=")) {
                interp.setMaxEvals(limit(arg.startsWith("--max-evals=") ? arg.substring("--max-evals=".length()) : nextArg(args, idx, "--max-evals")));
                idx += arg.startsWith("--max-evals=") ? 1 : 2;
            } else if (arg.equals("--max-state-bytes") || arg.startsWith("--max-state-bytes=")) {
                interp.setMaxStateBytes(limit(arg.startsWith("--max-state-bytes=")
                        ? arg.substring("--max-state-bytes=".length())
                        : nextArg(args, idx, "--max-state-bytes")));
                idx += arg.startsWith("--max-state-bytes=") ? 1 : 2;
            } else if (arg.equals("--max-steps") || arg.startsWith("--max-steps=")) {
                interp.setMaxSteps(limit(arg.startsWith("--max-steps=") ? arg.substring("--max-steps=".length()) : nextArg(args, idx, "--max-steps")));
                idx += arg.startsWith("--max-steps=") ? 1 : 2;
            } else if (arg.equals("--resources") || arg.startsWith("--resources=")) {
                resourcesPath = value(args, idx, "--resources");
                idx += arg.startsWith("--resources=") ? 1 : 2;
            } else if (arg.equals("--resource-out") || arg.startsWith("--resource-out=")) {
                resourceOutPath = value(args, idx, "--resource-out");
                idx += arg.startsWith("--resource-out=") ? 1 : 2;
            } else if (arg.startsWith("--proc:")) {
                String name = arg.substring("--proc:".length());
                if (idx + 1 >= args.length) {
                    System.err.println("Error: --proc:" + name + " requires a command argument");
                    System.exit(1);
                }
                interp.addProcBinding(name, args[idx + 1]);
                idx += 2;
            } else {
                System.err.println("Error: Unknown argument: " + arg);
                System.exit(1);
            }
        }

        if (!coveragePath.isEmpty()) {
            interp.setRuleCoveragePath(coveragePath);
        }
        try {
            interp.loadProgram(args[0]);
        } catch (ThueException exc) {
            System.err.println("Error: " + exc.getMessage());
            interp.cleanup();
            System.exit(1);
        }

        int code = 0;
        String error = null;
        boolean ran = false;
        if (listRules) {
            for (Interpreter.ListedRule rule : interp.listedRules()) {
                System.out.println(Interpreter.displayPath(rule.sourcePath()) + ":" + rule.lineNumber() + "\t" + rule.lhs());
            }
        } else {
            if (sawInput) {
                interp.applyInputOverride(inputOverride);
            }
            if (!resourcesPath.isEmpty()) {
                try {
                    ResourceFile file = loadResources(resourcesPath);
                    interp.bindScripts(file.reads, file.writes);
                } catch (ThueException exc) {
                    System.err.println("Error: " + exc.getMessage());
                    interp.cleanup();
                    System.exit(1);
                }
            } else if (!resourceOutPath.isEmpty()) {
                System.err.println("Error: --resource-out requires --resources");
                interp.cleanup();
                System.exit(1);
            }
            ran = true;
            try {
                code = interp.run();
            } catch (LimitException exc) {
                error = exc.getMessage();
                code = exc.code();
            } catch (ThueException exc) {
                error = exc.getMessage();
                code = Interpreter.EXIT_RUNTIME;
            }
        }

        System.err.print(interp.formatTrace());
        if (error != null) {
            System.err.println("Error: " + error);
        }
        if (ran && !countsPath.isEmpty()) {
            try {
                writeText(countsPath, interp.countsJson());
            } catch (IOException exc) {
                System.err.println("Error: failed to write counts: " + message(exc));
                code = 1;
            }
        }
        if (ran && !metricsPath.isEmpty()) {
            try {
                writeText(metricsPath, interp.metricsJson());
            } catch (IOException exc) {
                System.err.println("Error: failed to write metrics: " + message(exc));
                code = 1;
            }
        }
        if (ran && !resourceOutPath.isEmpty()) {
            try {
                writeText(resourceOutPath, Interpreter.resourceOutputJson(interp.scriptWrites()));
            } catch (ThueException exc) {
                System.err.println("Error: " + exc.getMessage());
                code = 1;
            } catch (IOException exc) {
                System.err.println("Error: failed to write resources: " + message(exc));
                code = 1;
            }
        }
        try {
            interp.writeRuleCoverage();
        } catch (ThueException exc) {
            System.err.println("Error: failed to write rule coverage: " + exc.getMessage());
            code = 1;
        }
        interp.cleanup();
        System.exit(code);
    }

    private static String value(String[] args, int idx, String flag) {
        String arg = args[idx];
        String prefix = flag + "=";
        if (arg.startsWith(prefix)) {
            return arg.substring(prefix.length());
        }
        return nextArg(args, idx, flag);
    }

    private static String nextArg(String[] args, int idx, String flag) {
        if (idx + 1 >= args.length) {
            System.err.println("Error: " + flag + " requires an argument");
            System.exit(1);
        }
        return args[idx + 1];
    }

    private static Long limit(String text) {
        if (text.equals("unlimited")) {
            return null;
        }
        if (!Interpreter.atoiSyntax(text)) {
            System.err.println("strconv.Atoi: parsing " + JsonText.goQuote(text) + ": invalid syntax");
            System.exit(2);
        }
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException exc) {
            System.err.println("strconv.Atoi: parsing " + JsonText.goQuote(text) + ": value out of range");
            System.exit(2);
            return null;
        }
    }

    private static void writeText(String path, String text) throws IOException {
        Path target = Path.of(path);
        Path parent = target.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Files.writeString(target, text, StandardCharsets.UTF_8);
    }

    private static String message(IOException exc) {
        return exc.getMessage() == null ? exc.toString() : exc.getMessage();
    }

    private record ResourceFile(Map<String, List<String>> reads, List<String> writes) {}

    private static ResourceFile loadResources(String path) {
        byte[] data;
        try {
            data = Files.readAllBytes(Path.of(path));
        } catch (IOException exc) {
            throw new ThueException(message(exc));
        }
        ObjectMapper mapper = new ObjectMapper();
        JsonNode root;
        try (com.fasterxml.jackson.core.JsonParser parser = mapper.createParser(data)) {
            root = mapper.readTree(parser);
            if (parser.nextToken() != null) {
                throw new ThueException(path + ": extra JSON value");
            }
        } catch (ThueException exc) {
            throw exc;
        } catch (IOException exc) {
            throw new ThueException(path + ": " + message(exc));
        }
        if (root == null || !root.isObject()) {
            throw new ThueException(path + ": json: cannot unmarshal into resources object");
        }
        root.fieldNames().forEachRemaining(name -> {
            if (!name.equals("reads") && !name.equals("writes")) {
                throw new ThueException(path + ": json: unknown field \"" + name + "\"");
            }
        });
        if (!root.has("reads") || root.get("reads").isNull()) {
            throw new ThueException("reads are required");
        }
        if (!root.has("writes") || root.get("writes").isNull()) {
            throw new ThueException("writes are required");
        }
        JsonNode readsNode = root.get("reads");
        JsonNode writesNode = root.get("writes");
        if (!readsNode.isObject()) {
            throw new ThueException(path + ": json: cannot unmarshal reads into a map");
        }
        if (!writesNode.isArray()) {
            throw new ThueException(path + ": json: cannot unmarshal writes into an array");
        }
        Map<String, List<String>> reads = new LinkedHashMap<>();
        readsNode.fields().forEachRemaining(entry -> {
            if (!entry.getValue().isArray()) {
                throw new ThueException(path + ": json: cannot unmarshal " + entry.getKey() + " into an array");
            }
            List<String> lines = new ArrayList<>();
            for (JsonNode line : entry.getValue()) {
                if (!line.isTextual()) {
                    throw new ThueException(path + ": json: cannot unmarshal a resource line into a string");
                }
                lines.add(line.asText());
            }
            reads.put(entry.getKey(), lines);
        });
        List<String> writes = new ArrayList<>();
        for (JsonNode name : writesNode) {
            if (!name.isTextual()) {
                throw new ThueException(path + ": json: cannot unmarshal a write name into a string");
            }
            writes.add(name.asText());
        }
        return new ResourceFile(reads, writes);
    }
}
