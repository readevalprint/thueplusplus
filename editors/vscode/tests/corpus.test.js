"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const { loadGrammar, tokenize, scopeAt, classifyLine, structuralOpAt, OPERATOR_SCOPE, hasScope } = require("./grammar");

const repoRoot = path.resolve(__dirname, "..", "..", "..");

function programFiles() {
  const roots = ["examples", "guests"]
    .map((name) => path.join(repoRoot, name))
    .filter((dir) => fs.existsSync(dir));
  const files = [];
  for (const root of roots) {
    const stack = [root];
    while (stack.length > 0) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile() && entry.name.endsWith(".tpp")) {
          files.push(full);
        }
      }
    }
  }
  files.sort();
  return files;
}

function assertClassified(file, lines, tokenLines) {
  let inState = false;
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const line = lines[lineNumber].endsWith("\r") ? lines[lineNumber].slice(0, -1) : lines[lineNumber];
    const tokens = tokenLines[lineNumber];
    const where = `${path.relative(repoRoot, file)}:${lineNumber + 1}`;
    if (inState) {
      for (const token of tokens) {
        assert.ok(
          hasScope(token.scopes, "string.unquoted.state.thuepp"),
          `${where} state text is not initial state: ${JSON.stringify(token.scopes)} in ${JSON.stringify(line)}`
        );
        assert.ok(
          !token.scopes.some((scope) => scope.startsWith("keyword.operator.")),
          `${where} state text was highlighted as a rule: ${JSON.stringify(line)}`
        );
      }
      continue;
    }
    const classified = classifyLine(line);
    if (classified.kind === "separator") {
      const start = line.indexOf("::=");
      const scopes = scopeAt(tokens, start);
      assert.ok(hasScope(scopes, "keyword.control.separator.thuepp"), `${where} separator scope ${JSON.stringify(scopes)}`);
      assert.ok(!hasScope(scopes, "string.unquoted.state.thuepp"), `${where} separator was swallowed by state`);
      inState = true;
      continue;
    }
    if (classified.kind === "blank") {
      continue;
    }
    if (classified.kind === "comment") {
      for (let index = 0; index < line.length; index++) {
        if (/\s/.test(line[index])) {
          continue;
        }
        const scopes = scopeAt(tokens, index);
        assert.ok(
          hasScope(scopes, "comment.line.thuepp"),
          `${where} column ${index} of comment ${JSON.stringify(line)} has ${JSON.stringify(scopes)}`
        );
      }
      continue;
    }
    if (classified.kind === "alias") {
      const match = line.match(/^[ \t]*([A-Z][A-Z0-9_]*)[ \t]*(<-)/);
      const nameAt = line.indexOf(match[1]);
      const arrowAt = line.indexOf(match[2], nameAt);
      assert.ok(hasScope(scopeAt(tokens, nameAt), "entity.name.type.alias.thuepp"), `${where} alias name ${JSON.stringify(line)}`);
      assert.ok(hasScope(scopeAt(tokens, arrowAt), "keyword.operator.alias.thuepp"), `${where} alias arrow ${JSON.stringify(line)}`);
      assert.ok(!hasScope(scopeAt(tokens, nameAt), "comment.line.thuepp"), `${where} alias classified as comment`);
      continue;
    }
    if (classified.kind === "invalid") {
      const match = line.match(/(?:^|[^\\])::[^\s\w=<>!|-]/);
      const at = match.index + (line[match.index] === ":" ? 0 : 1);
      assert.ok(
        hasScope(scopeAt(tokens, at), "invalid.illegal.operator.thuepp"),
        `${where} invalid operator ${JSON.stringify(line)} scopes ${JSON.stringify(scopeAt(tokens, at))}`
      );
      continue;
    }
    if (classified.kind === "dangling-mid") {
      const scopes = scopeAt(tokens, classified.first.index);
      assert.ok(hasScope(scopes, "keyword.operator.mid.thuepp"), `${where} dangling ::| ${JSON.stringify(scopes)} in ${JSON.stringify(line)}`);
      assert.ok(
        tokens.some((token) => token.scopes.some((scope) => scope.startsWith("invalid.illegal"))),
        `${where} dangling ::| is not invalid in ${JSON.stringify(line)}`
      );
      continue;
    }
    if (classified.kind === "rule") {
      for (let index = 0; index + 2 < line.length; index++) {
        const op = structuralOpAt(line, index);
        if (!op) {
          continue;
        }
        if (op === "|" && index > classified.terminal.index) {
          continue;
        }
        if (op !== "|" && index !== classified.terminal.index) {
          continue;
        }
        const scopes = scopeAt(tokens, index);
        assert.ok(
          hasScope(scopes, OPERATOR_SCOPE[op]),
          `${where} ::${op} has ${JSON.stringify(scopes)} in ${JSON.stringify(line)}`
        );
        if (op !== "|") {
          break;
        }
      }
    }
  }
}

test("every example and guest program tokenizes", async () => {
  const grammar = await loadGrammar();
  const files = programFiles();
  assert.ok(files.length > 0, "no .tpp programs found");
  const failures = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    let tokenLines;
    try {
      tokenLines = tokenize(grammar, text);
    } catch (err) {
      failures.push(`${path.relative(repoRoot, file)}: ${err.message}`);
      continue;
    }
    try {
      assertClassified(file, text.split("\n"), tokenLines);
    } catch (err) {
      failures.push(err.message);
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});
