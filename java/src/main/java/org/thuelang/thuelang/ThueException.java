package org.thuelang.thuelang;

/** A runtime failure. The message is the stderr text without the CLI's {@code Error: } prefix. */
public class ThueException extends RuntimeException {
    public ThueException(String message) {
        super(message);
    }
}
