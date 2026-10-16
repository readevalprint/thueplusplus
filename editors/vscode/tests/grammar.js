"use strict";

const fs = require("fs");
const path = require("path");
const vscodeOniguruma = require("vscode-oniguruma");
const vscodeTextmate = require("vscode-textmate");

const grammarPath = path.join(__dirname, "..", "syntaxes", "thuepp.tmLanguage.json");

let grammarPromise;

function loadGrammar() {
  if (!grammarPromise) {
    grammarPromise = (async () => {
      const wasmPath = require.resolve("vscode-oniguruma/release/onig.wasm");
      const wasm = fs.readFileSync(wasmPath);
      await vscodeOniguruma.loadWASM(wasm.buffer);
      const registry = new vscodeTextmate.Registry({
        onigLib: Promise.resolve({
          createOnigScanner: (patterns) => new vscodeOniguruma.OnigScanner(patterns),
          createOnigString: (value) => new vscodeOniguruma.OnigString(value),
        }),
        loadGrammar: async (scopeName) => {
          if (scopeName !== "source.thuepp") {
            return null;
          }
          return JSON.parse(fs.readFileSync(grammarPath, "utf8"));
        },
      });
      const grammar = await registry.loadGrammar("source.thuepp");
      if (!grammar) {
        throw new Error("source.thuepp grammar did not load");
      }
      return grammar;
    })();
  }
  return grammarPromise;
}

function tokenize(grammar, text) {
  const lines = text.split(/\n/);
  let ruleStack = vscodeTextmate.INITIAL;
  return lines.map((line) => {
    const clean = line.endsWith("\r") ? line.slice(0, -1) : line;
    const result = grammar.tokenizeLine(clean, ruleStack);
    ruleStack = result.ruleStack;
    return result.tokens.map((token) => ({
      start: token.startIndex,
      end: token.endIndex,
      scopes: token.scopes,
    }));
  });
}

function scopeAt(tokens, index) {
  const covering = tokens.filter((token) => token.start <= index && index < token.end);
  if (covering.length === 0) {
    return [];
  }
  return covering[covering.length - 1].scopes;
}

function structuralOpAt(line, index) {
  if (index + 2 >= line.length || line[index] !== ":" || line[index + 1] !== ":") {
    return null;
  }
  if (index > 0 && line[index - 1] === "\\") {
    return null;
  }
  const op = line[index + 2];
  if ("|=<>!-".includes(op)) {
    return op;
  }
  return null;
}

function classifyLine(line) {
  if (/^[ \t]*::=[ \t]*$/.test(line)) {
    return { kind: "separator" };
  }
  let first = null;
  let terminal = null;
  for (let index = 0; index + 2 < line.length; index++) {
    const op = structuralOpAt(line, index);
    if (!op) {
      continue;
    }
    if (!first) {
      first = { index, op };
    }
    if (op !== "|") {
      terminal = { index, op };
      break;
    }
  }
  const lhs = first ? line.slice(0, first.index).replace(/[ \t]+$/, "") : "";
  if (terminal && lhs !== "") {
    return { kind: "rule", terminal, first };
  }
  if (/^[ \t]*[A-Z][A-Z0-9_]*[ \t]*<-/.test(line) && !terminal) {
    return { kind: "alias" };
  }
  if (first && first.op === "|" && lhs !== "" && !terminal) {
    return { kind: "dangling-mid", first };
  }
  if (/(?:^|[^\\])::[^\s\w=<>!|-]/.test(line)) {
    return { kind: "invalid" };
  }
  if (line.trim() === "") {
    return { kind: "blank" };
  }
  return { kind: "comment" };
}

const OPERATOR_SCOPE = {
  "|": "keyword.operator.mid.thuepp",
  "=": "keyword.operator.rewrite.thuepp",
  "<": "keyword.operator.read.thuepp",
  ">": "keyword.operator.write.thuepp",
  "-": "keyword.operator.exit.thuepp",
  "!": "keyword.operator.builtin.thuepp",
};

function hasScope(scopes, expected) {
  return scopes.some((scope) => scope === expected || scope.split(" ").includes(expected));
}

module.exports = {
  loadGrammar,
  tokenize,
  scopeAt,
  classifyLine,
  structuralOpAt,
  OPERATOR_SCOPE,
  hasScope,
};
