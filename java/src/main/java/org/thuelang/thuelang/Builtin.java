package org.thuelang.thuelang;

import java.math.BigInteger;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

/** Exact-rational and string builtins. Messages match the other hosts. */
final class Builtin {
    static final int MAX_NUMERIC_LITERAL_CHARS = 4096;
    private static final java.util.regex.Pattern NUMERIC =
            java.util.regex.Pattern.compile("-?(?:[0-9]+|[0-9]+\\.[0-9]+|[0-9]+/[0-9]+)");
    private static final java.util.regex.Pattern ZERO_DENOMINATOR =
            java.util.regex.Pattern.compile("-?[0-9]+/0+");
    private static final Map<String, Integer> ARITY = Map.ofEntries(
            Map.entry("eq", 2),
            Map.entry("add", 2),
            Map.entry("sub", 2),
            Map.entry("mul", 2),
            Map.entry("div", 2),
            Map.entry("mod", 2),
            Map.entry("numeq", 2),
            Map.entry("lt", 2),
            Map.entry("le", 2),
            Map.entry("gt", 2),
            Map.entry("ge", 2),
            Map.entry("num", 1),
            Map.entry("b64enc", 1),
            Map.entry("b64dec", 1),
            Map.entry("pctenc", 1),
            Map.entry("pctdec", 1),
            Map.entry("escape", 1),
            Map.entry("unescape", 1));

    private Builtin() {}

    static Integer arity(String name) {
        return ARITY.get(name);
    }

    static String eval(String name, java.util.List<String> values) {
        Integer expected = arity(name);
        if (expected == null || values.size() != expected) {
            throw new ThueException("internal error: invalid validated builtin '" + name + "' with " + values.size() + " values");
        }
        return switch (name) {
            case "eq" -> values.get(0).equals(values.get(1)) ? "1" : "0";
            case "b64enc" -> b64urlEncode(values.get(0));
            case "b64dec" -> b64urlDecode(values.get(0));
            case "pctenc" -> pctEncode(values.get(0));
            case "pctdec" -> pctDecode(values.get(0));
            case "escape" -> escape(values.get(0));
            case "unescape" -> unescape(values.get(0));
            case "num" -> "<num>" + format(parseNumber(values.get(0), name)) + "</num>";
            default -> numeric(name, values);
        };
    }

    private static String numeric(String name, java.util.List<String> values) {
        Rat a = parseNumber(values.get(0), name);
        Rat b = parseNumber(values.get(1), name);
        return switch (name) {
            case "add" -> format(a.add(b));
            case "sub" -> format(a.sub(b));
            case "mul" -> format(a.mul(b));
            case "div" -> {
                if (b.signum() == 0) {
                    throw new ThueException("Builtin 'div' division by zero");
                }
                yield format(a.div(b));
            }
            case "mod" -> {
                if (b.signum() == 0) {
                    throw new ThueException("Builtin 'mod' modulo by zero");
                }
                if (!a.isInt() || !b.isInt()) {
                    throw new ThueException("Builtin 'mod' expected integer inputs");
                }
                if (a.signum() < 0 || b.signum() < 0) {
                    throw new ThueException("Builtin 'mod' expected non-negative integer inputs");
                }
                yield a.num.mod(b.num).toString();
            }
            case "numeq" -> a.compareTo(b) == 0 ? "1" : "0";
            case "lt" -> a.compareTo(b) < 0 ? "1" : "0";
            case "le" -> a.compareTo(b) <= 0 ? "1" : "0";
            case "gt" -> a.compareTo(b) > 0 ? "1" : "0";
            case "ge" -> a.compareTo(b) >= 0 ? "1" : "0";
            default -> throw new ThueException("internal error: validated builtin '" + name + "' has no evaluator");
        };
    }

    static String b64urlEncode(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    static String b64urlDecode(String value) {
        if (value.indexOf('=') >= 0) {
            throw new ThueException("Builtin 'b64dec' expected unpadded Base64url input");
        }
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            boolean ok = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_';
            if (!ok) {
                throw new ThueException("Builtin 'b64dec' expected Base64url input");
            }
        }
        if (value.length() % 4 == 1) {
            throw new ThueException("Builtin 'b64dec' invalid Base64url length");
        }
        byte[] decoded;
        try {
            decoded = Base64.getUrlDecoder().decode(value);
        } catch (IllegalArgumentException exc) {
            throw new ThueException("Builtin 'b64dec' invalid Base64url input: " + exc.getMessage());
        }
        String text;
        try {
            CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT);
            text = decoder.decode(java.nio.ByteBuffer.wrap(decoded)).toString();
        } catch (CharacterCodingException exc) {
            throw new ThueException("Builtin 'b64dec' decoded bytes are not valid UTF-8");
        }
        if (!b64urlEncode(text).equals(value)) {
            throw new ThueException("Builtin 'b64dec' expected canonical unpadded Base64url input");
        }
        return text;
    }

    static String pctEncode(String value) {
        StringBuilder out = new StringBuilder();
        for (byte b : value.getBytes(StandardCharsets.UTF_8)) {
            int unsigned = b & 0xff;
            if ((unsigned >= 'A' && unsigned <= 'Z')
                    || (unsigned >= 'a' && unsigned <= 'z')
                    || (unsigned >= '0' && unsigned <= '9')
                    || unsigned == '_' || unsigned == '.' || unsigned == '-') {
                out.append((char) unsigned);
            } else {
                out.append(String.format("%%%02X", unsigned));
            }
        }
        return out.toString();
    }

    static String pctDecode(String value) {
        java.io.ByteArrayOutputStream data = new java.io.ByteArrayOutputStream();
        for (int pos = 0; pos < value.length(); ) {
            char ch = value.charAt(pos);
            if (ch == '%') {
                if (pos + 2 >= value.length()) {
                    throw new ThueException("PCT payload has incomplete percent escape");
                }
                String hx = value.substring(pos + 1, pos + 3);
                for (int i = 0; i < hx.length(); i++) {
                    char c = hx.charAt(i);
                    if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F'))) {
                        throw new ThueException("PCT payload has malformed or non-canonical percent escape");
                    }
                }
                data.write(Integer.parseInt(hx, 16));
                pos += 3;
            } else {
                if (!((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '.' || ch == '-')) {
                    throw new ThueException("PCT payload contains unencoded unsafe byte");
                }
                data.write(ch);
                pos++;
            }
        }
        byte[] bytes = data.toByteArray();
        try {
            CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT);
            return decoder.decode(java.nio.ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException exc) {
            throw new ThueException("PCT payload decoded bytes are not valid UTF-8");
        }
    }

    static String escape(String value) {
        String text = pctDecode(value);
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            switch (ch) {
                case '\\' -> out.append("\\\\");
                case '"' -> out.append("\\\"");
                case '\n' -> out.append("\\n");
                case '\t' -> out.append("\\t");
                case '\r' -> out.append("\\r");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                default -> out.append(ch);
            }
        }
        return pctEncode(out.toString());
    }

    static String unescape(String value) {
        String text = pctDecode(value);
        StringBuilder out = new StringBuilder();
        for (int pos = 0; pos < text.length(); pos++) {
            char ch = text.charAt(pos);
            if (ch != '\\') {
                out.append(ch);
                continue;
            }
            if (pos + 1 >= text.length()) {
                throw new ThueException("Builtin 'unescape' has trailing backslash escape");
            }
            pos++;
            switch (text.charAt(pos)) {
                case '\\' -> out.append('\\');
                case '"' -> out.append('"');
                case 'n' -> out.append('\n');
                case 't' -> out.append('\t');
                case 'r' -> out.append('\r');
                case 'b' -> out.append('\b');
                case 'f' -> out.append('\f');
                default -> throw new ThueException("Builtin 'unescape' unsupported escape '\\" + text.charAt(pos) + "'");
            }
        }
        return pctEncode(out.toString());
    }

    static String quoteMeta(String value) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if ("\\.+*?()|[]{}^$".indexOf(ch) >= 0) {
                out.append('\\');
            }
            out.append(ch);
        }
        return out.toString();
    }

    private static Rat parseNumber(String value, String builtin) {
        if (!NUMERIC.matcher(value).matches()) {
            throw new ThueException("Builtin '" + builtin + "' expected numeric input, got '" + value + "'");
        }
        if (value.length() > MAX_NUMERIC_LITERAL_CHARS) {
            throw new ThueException("Builtin '" + builtin + "' numeric input exceeds maximum length ("
                    + MAX_NUMERIC_LITERAL_CHARS + " characters)");
        }
        if (ZERO_DENOMINATOR.matcher(value).matches()) {
            throw new ThueException("Builtin '" + builtin + "' fraction denominator must be non-zero");
        }
        boolean neg = value.startsWith("-");
        String body = neg ? value.substring(1) : value;
        BigInteger num;
        BigInteger den;
        int slash = body.indexOf('/');
        int dot = body.indexOf('.');
        if (slash >= 0) {
            num = new BigInteger(body.substring(0, slash));
            den = new BigInteger(body.substring(slash + 1));
        } else if (dot >= 0) {
            String digits = body.substring(0, dot) + body.substring(dot + 1);
            num = new BigInteger(digits);
            den = BigInteger.TEN.pow(body.length() - dot - 1);
        } else {
            num = new BigInteger(body);
            den = BigInteger.ONE;
        }
        if (neg) {
            num = num.negate();
        }
        return new Rat(num, den);
    }

    private static String format(Rat value) {
        if (value.den.equals(BigInteger.ONE)) {
            return value.num.toString();
        }
        return value.num.toString() + "/" + value.den.toString();
    }

    private static final class Rat implements Comparable<Rat> {
        final BigInteger num;
        final BigInteger den;

        Rat(BigInteger num, BigInteger den) {
            if (den.signum() < 0) {
                num = num.negate();
                den = den.negate();
            }
            BigInteger gcd = num.gcd(den);
            if (!gcd.equals(BigInteger.ONE)) {
                num = num.divide(gcd);
                den = den.divide(gcd);
            }
            this.num = num;
            this.den = den;
        }

        int signum() {
            return num.signum();
        }

        boolean isInt() {
            return den.equals(BigInteger.ONE);
        }

        Rat add(Rat other) {
            return new Rat(num.multiply(other.den).add(other.num.multiply(den)), den.multiply(other.den));
        }

        Rat sub(Rat other) {
            return new Rat(num.multiply(other.den).subtract(other.num.multiply(den)), den.multiply(other.den));
        }

        Rat mul(Rat other) {
            return new Rat(num.multiply(other.num), den.multiply(other.den));
        }

        Rat div(Rat other) {
            return new Rat(num.multiply(other.den), den.multiply(other.num));
        }

        @Override
        public int compareTo(Rat other) {
            return num.multiply(other.den).compareTo(other.num.multiply(den));
        }
    }
}
