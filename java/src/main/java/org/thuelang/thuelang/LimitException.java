package org.thuelang.thuelang;

/**
 * A resource limit stopped the run.
 *
 * <p>{@code kind} is {@code steps}, {@code evals}, {@code state}, or {@code timeout}.
 * {@code code} is 10, 11, 12, or 13. The message has no {@code Error: } prefix.
 */
public final class LimitException extends ThueException {
    private final String kind;
    private final int code;

    public LimitException(String kind, int code, String message) {
        super(message);
        this.kind = kind;
        this.code = code;
    }

    public String kind() {
        return kind;
    }

    public int code() {
        return code;
    }
}
