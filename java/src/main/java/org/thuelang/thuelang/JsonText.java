package org.thuelang.thuelang;

/** Compact JSON text. Trace objects do not escape HTML. */
final class JsonText {
    private JsonText() {}

    static String quote(String text) {
        StringBuilder out = new StringBuilder(text.length() + 2);
        out.append('"');
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            switch (cp) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (cp < 0x20 || cp == 0x2028 || cp == 0x2029) {
                        out.append(String.format("\\u%04x", cp));
                    } else {
                        out.appendCodePoint(cp);
                    }
                }
            }
            i += Character.charCount(cp);
        }
        out.append('"');
        return out.toString();
    }

    /** Go {@code %q} / {@code strconv.Quote} for short CLI and resource names. */
    static String goQuote(String text) {
        StringBuilder out = new StringBuilder(text.length() + 2);
        out.append('"');
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            switch (cp) {
                case '\\' -> out.append("\\\\");
                case '"' -> out.append("\\\"");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (cp < 0x20) {
                        out.append(String.format("\\x%02x", cp));
                    } else {
                        out.appendCodePoint(cp);
                    }
                }
            }
            i += Character.charCount(cp);
        }
        out.append('"');
        return out.toString();
    }
}
