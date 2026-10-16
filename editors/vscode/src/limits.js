"use strict";

// Host defaults from the v0.5 spec. The Run command always passes these
// three flags. Nothing in this module can request an unbounded run.
const DEFAULT_MAX_STEPS = 1000000;
const DEFAULT_MAX_PROBES = 1000000;
const DEFAULT_MAX_STATE_BYTES = 8388608;

const LIMITS = [
  ["maxSteps", "--max-steps", DEFAULT_MAX_STEPS],
  ["maxProbes", "--max-evals", DEFAULT_MAX_PROBES],
  ["maxStateBytes", "--max-state-bytes", DEFAULT_MAX_STATE_BYTES],
];

function limitError(name, value) {
  return new Error(
    `Thue++ setting thuepp.${name} must be a non-negative integer, got ${JSON.stringify(value)}. Unlimited is not a Run command setting.`
  );
}

function requireLimit(name, value, fallback) {
  const chosen = value === undefined || value === null ? fallback : value;
  if (typeof chosen === "string" && chosen.trim().toLowerCase() === "unlimited") {
    throw limitError(name, chosen);
  }
  if (typeof chosen !== "number" || !Number.isInteger(chosen) || chosen < 0 || !Number.isSafeInteger(chosen)) {
    throw limitError(name, chosen);
  }
  return chosen;
}

function buildRunCommand({ file, executable, config }) {
  if (typeof file !== "string" || file.length === 0) {
    throw new Error("Save the Thue++ file before running it.");
  }
  if (typeof executable !== "string" || executable.trim().length === 0) {
    throw new Error("Thue++ setting thuepp.executable must be the thuepp command or an absolute path.");
  }
  const settings = config || {};
  const args = [file];
  for (const [name, flag, fallback] of LIMITS) {
    const value = requireLimit(name, settings[name], fallback);
    args.push(flag, String(value));
  }
  if (args.some((arg) => arg === "unlimited")) {
    throw new Error("Run Thue++ file does not pass unlimited.");
  }
  return { executable, args };
}

module.exports = {
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_PROBES,
  DEFAULT_MAX_STATE_BYTES,
  buildRunCommand,
};
