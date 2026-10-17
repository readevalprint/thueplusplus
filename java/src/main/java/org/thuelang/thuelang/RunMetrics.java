package org.thuelang.thuelang;

/** Counters for one run. The same fields, in the same order, as {@code thue --metrics}. */
public record RunMetrics(
        long cost,
        long appliedSteps,
        long regexEvals,
        long regexMatches,
        long stateBytes,
        long statePeak,
        long ruleCount,
        long ruleChars) {}
