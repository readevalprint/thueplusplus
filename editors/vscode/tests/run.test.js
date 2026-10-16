"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const { buildRunCommand, DEFAULT_MAX_STEPS, DEFAULT_MAX_PROBES, DEFAULT_MAX_STATE_BYTES } = require("../src/limits");

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
const properties = packageJson.contributes.configuration.properties;

test("package defaults are the finite host defaults", () => {
  assert.equal(properties["thuepp.maxSteps"].default, DEFAULT_MAX_STEPS);
  assert.equal(properties["thuepp.maxProbes"].default, DEFAULT_MAX_PROBES);
  assert.equal(properties["thuepp.maxStateBytes"].default, DEFAULT_MAX_STATE_BYTES);
  assert.equal(properties["thuepp.maxSteps"].default, 1000000);
  assert.equal(properties["thuepp.maxProbes"].default, 1000000);
  assert.equal(properties["thuepp.maxStateBytes"].default, 8388608);
  for (const property of Object.values(properties)) {
    assert.notEqual(property.default, "unlimited");
    assert.ok(!JSON.stringify(property).includes("unlimited") || property.description.includes("no unlimited"));
  }
});

test("run command passes explicit finite limits", () => {
  const command = buildRunCommand({
    file: "/tmp/hello.tpp",
    executable: "thuepp",
    config: {},
  });
  assert.equal(command.executable, "thuepp");
  assert.deepEqual(command.args, [
    "/tmp/hello.tpp",
    "--max-steps",
    "1000000",
    "--max-evals",
    "1000000",
    "--max-state-bytes",
    "8388608",
  ]);
  assert.ok(!command.args.includes("unlimited"));
});

test("configured limits replace the defaults and stay explicit", () => {
  const command = buildRunCommand({
    file: "program.tpp",
    executable: "/usr/local/bin/thuepp",
    config: { maxSteps: 0, maxProbes: 3, maxStateBytes: 8 },
  });
  assert.deepEqual(command.args, [
    "program.tpp",
    "--max-steps",
    "0",
    "--max-evals",
    "3",
    "--max-state-bytes",
    "8",
  ]);
});

test("null config values use the finite defaults", () => {
  const command = buildRunCommand({
    file: "program.tpp",
    executable: "thuepp",
    config: { maxSteps: null, maxProbes: null, maxStateBytes: null },
  });
  assert.deepEqual(command.args.slice(1), [
    "--max-steps",
    "1000000",
    "--max-evals",
    "1000000",
    "--max-state-bytes",
    "8388608",
  ]);
});

test("unlimited and non-integers are rejected", () => {
  for (const config of [
    { maxSteps: "unlimited" },
    { maxProbes: "unlimited" },
    { maxStateBytes: "Unlimited" },
    { maxSteps: -1 },
    { maxProbes: 1.5 },
    { maxStateBytes: Number.POSITIVE_INFINITY },
    { maxSteps: Number.NaN },
  ]) {
    assert.throws(() => buildRunCommand({ file: "program.tpp", executable: "thuepp", config }), /non-negative integer|Unlimited is not/);
  }
});

test("missing file and executable fail", () => {
  assert.throws(() => buildRunCommand({ file: "", executable: "thuepp", config: {} }), /Save the Thue/);
  assert.throws(() => buildRunCommand({ file: "program.tpp", executable: "  ", config: {} }), /executable/);
});
