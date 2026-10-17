package org.thuelang.thuelang;

/**
 * Literal prefix of a rule pattern, matching the Go engine.
 *
 * <p>A miss on this text cannot be a match, so the runner skips the regex and
 * does not count a regex eval. A hit still runs the regex. The Go function is
 * {@code regexp.LiteralPrefix} after stripping one leading {@code ^} and
 * refusing {@code (?i}.
 */
final class Prefix {
    private static final int INF = -1;
    private static final int MAX_REPEAT = 100_000;

    private enum Status {
        CONT, STOP, BLOCK, FLAGS, CAP
    }

    private static final class Bad extends Exception {
        Bad(String message) {
            super(message);
        }
    }

    private static final class Flags {
        boolean multiline;
        boolean fold;

        Flags copy() {
            Flags flags = new Flags();
            flags.multiline = multiline;
            flags.fold = fold;
            return flags;
        }
    }

    private record Seq(String text, Status status, int index) {}

    private record Atom(String text, Status status, int index, Flags flags, boolean atStart) {}

    private Prefix() {}

    static String literalPrefix(String lhs) {
        if (lhs.contains("(?i")) {
            return "";
        }
        String body = lhs.startsWith("^") ? lhs.substring(1) : lhs;
        try {
            boolean onePass = onePass(body);
            Seq seq = sequence(body, 0, new Flags(), true, false, onePass);
            if (seq.index != body.length()) {
                return "";
            }
            return seq.text;
        } catch (Bad ignored) {
            return "";
        }
    }

    private static boolean onePass(String body) {
        try {
            if (!leadingBeginText(body)) {
                return false;
            }
            if (altPresent(body) && !endAnchored(body)) {
                return false;
            }
            return !swallowsNext(body);
        } catch (Bad ignored) {
            return false;
        }
    }

    private static boolean swallowsNext(String body) {
        String[] tokens = {
            "[\\s\\S]*", "[\\s\\S]+", "[\\S\\s]*", "[\\S\\s]+", "[\\s\\S]?", "[\\S\\s]?"
        };
        for (String token : tokens) {
            int start = 0;
            while (true) {
                int found = body.indexOf(token, start);
                if (found < 0) {
                    break;
                }
                int cursor = found + token.length();
                if (cursor < body.length() && body.charAt(cursor) == '?') {
                    cursor++;
                }
                while (cursor < body.length() && body.charAt(cursor) == ')') {
                    cursor++;
                }
                if (cursor < body.length() && !body.startsWith("\\z", cursor) && body.charAt(cursor) != '$') {
                    return true;
                }
                start = found + token.length();
            }
        }
        return false;
    }

    private static boolean leadingBeginText(String body) throws Bad {
        int index = 0;
        boolean multiline = false;
        while (index < body.length()) {
            if (body.startsWith("(?P<", index) || body.startsWith("(?<", index)) {
                return false;
            }
            if (body.startsWith("(?:", index)) {
                index += 3;
                continue;
            }
            if (body.startsWith("(?", index)) {
                index += 2;
                int sign = 1;
                boolean saw = false;
                while (index < body.length() && body.charAt(index) != ':' && body.charAt(index) != ')') {
                    char ch = body.charAt(index);
                    index++;
                    if (ch == '-') {
                        sign = -1;
                        saw = false;
                        continue;
                    }
                    if (ch == 'm') {
                        multiline = sign > 0;
                    }
                    saw = true;
                }
                if (index >= body.length()) {
                    return false;
                }
                if (body.charAt(index) == ':') {
                    index++;
                    continue;
                }
                index++;
                continue;
            }
            if (body.charAt(index) == '(') {
                return false;
            }
            if (body.startsWith("\\A", index)) {
                return true;
            }
            if (body.charAt(index) == '^') {
                return !multiline;
            }
            return false;
        }
        return false;
    }

    private static boolean endAnchored(String body) {
        if (body.contains("(?m")) {
            return body.endsWith("\\z");
        }
        return body.endsWith("\\z") || body.endsWith("$");
    }

    private static boolean altPresent(String body) throws Bad {
        int index = 0;
        while (index < body.length()) {
            if (body.startsWith("\\Q", index)) {
                int end = body.indexOf("\\E", index + 2);
                index = end < 0 ? body.length() : end + 2;
                continue;
            }
            if (body.charAt(index) == '\\') {
                index += 2;
                continue;
            }
            if (body.charAt(index) == '[') {
                index = classSpan(body, index).index;
                continue;
            }
            if (body.charAt(index) == '|') {
                return true;
            }
            index++;
        }
        return false;
    }

    private static Seq sequence(
            String pattern, int index, Flags flags, boolean atStart, boolean stopParen, boolean onePass)
            throws Bad {
        java.util.List<java.util.List<Piece>> branches = new java.util.ArrayList<>();
        branches.add(new java.util.ArrayList<>());
        while (index < pattern.length()) {
            if (stopParen && pattern.charAt(index) == ')') {
                break;
            }
            if (pattern.charAt(index) == '|') {
                branches.add(new java.util.ArrayList<>());
                index++;
                atStart = true;
                continue;
            }
            Atom atom = atom(pattern, index, flags, atStart, onePass);
            index = atom.index;
            flags = atom.flags;
            atStart = atom.atStart;
            if (atom.status == Status.FLAGS) {
                continue;
            }
            Quantifier quantifier = quantifier(pattern, index);
            index = quantifier.index;
            Piece applied = applyQuantifier(atom.text, atom.status, quantifier.minimum, quantifier.maximum);
            if (applied.status == Status.CONT && applied.text.isEmpty()) {
                continue;
            }
            branches.get(branches.size() - 1).add(applied);
            if (applied.status != Status.CAP) {
                atStart = false;
            }
        }
        java.util.List<Piece> folded = new java.util.ArrayList<>();
        for (java.util.List<Piece> branch : branches) {
            folded.add(fold(branch));
        }
        if (folded.size() == 1) {
            Piece only = folded.get(0);
            return new Seq(only.text, only.status, index);
        }
        Piece common = common(folded);
        return new Seq(common.text, common.status, index);
    }

    private static Piece common(java.util.List<Piece> folded) {
        java.util.List<String> texts = new java.util.ArrayList<>();
        for (Piece piece : folded) {
            if (piece.status == Status.BLOCK) {
                return new Piece("", Status.BLOCK);
            }
            texts.add(piece.text);
        }
        String shared = texts.get(0);
        for (int i = 1; i < texts.size(); i++) {
            String text = texts.get(i);
            int limit = Math.min(shared.length(), text.length());
            int size = 0;
            while (size < limit && shared.charAt(size) == text.charAt(size)) {
                size++;
            }
            shared = shared.substring(0, size);
        }
        if (shared.isEmpty()) {
            return new Piece("", Status.BLOCK);
        }
        boolean all = true;
        for (Piece piece : folded) {
            if (piece.status != Status.CONT || !piece.text.equals(shared)) {
                all = false;
                break;
            }
        }
        if (all) {
            return new Piece(shared, Status.CONT);
        }
        return new Piece(shared, Status.STOP);
    }

    private static Piece fold(java.util.List<Piece> atoms) {
        String text = "";
        boolean sawCap = false;
        for (Piece atom : atoms) {
            if (atom.status == Status.CAP) {
                sawCap = true;
                continue;
            }
            if (atom.status == Status.BLOCK) {
                return new Piece(text, text.isEmpty() ? Status.BLOCK : Status.STOP);
            }
            text += atom.text;
            if (atom.status == Status.STOP) {
                return new Piece(text, Status.STOP);
            }
        }
        if (sawCap && text.isEmpty()) {
            return new Piece("", Status.CAP);
        }
        return new Piece(text, Status.CONT);
    }

    private static Atom atom(String pattern, int index, Flags flags, boolean atStart, boolean onePass) throws Bad {
        if (index >= pattern.length()) {
            throw new Bad("truncated pattern");
        }
        char ch = pattern.charAt(index);
        if (ch == '^') {
            if (flags.multiline || !atStart || !onePass) {
                return new Atom("", Status.BLOCK, index + 1, flags, false);
            }
            return new Atom("", Status.CONT, index + 1, flags, true);
        }
        if (ch == '$') {
            return new Atom("", Status.BLOCK, index + 1, flags, false);
        }
        if (ch == '.') {
            return new Atom("", Status.BLOCK, index + 1, flags, false);
        }
        if (ch == '[') {
            ClassSpan span = classSpan(pattern, index);
            if (span.rune == null || flags.fold) {
                return new Atom("", Status.BLOCK, span.index, flags, false);
            }
            return new Atom(span.rune, Status.CONT, span.index, flags, false);
        }
        if (ch == '(') {
            return group(pattern, index, flags, atStart, onePass);
        }
        if (ch == '\\') {
            return escape(pattern, index, flags, atStart, onePass);
        }
        if (ch == '*' || ch == '+' || ch == '?' || ch == ')' || ch == '|') {
            throw new Bad("bare operator");
        }
        if (flags.fold) {
            return new Atom("", Status.BLOCK, index + 1, flags, false);
        }
        return new Atom(String.valueOf(ch), Status.CONT, index + 1, flags, false);
    }

    private static Atom group(String pattern, int index, Flags flags, boolean atStart, boolean onePass) throws Bad {
        boolean capturing = true;
        if (pattern.startsWith("(?", index)) {
            Integer named = namedCapture(pattern, index);
            if (named == null) {
                return perlGroup(pattern, index, flags, atStart, onePass);
            }
            index = named;
        } else {
            index++;
        }
        Seq seq = sequence(pattern, index, flags, atStart, true, onePass);
        index = seq.index;
        if (index >= pattern.length() || pattern.charAt(index) != ')') {
            throw new Bad("unclosed group");
        }
        index++;
        if (onePass && capturing) {
            return new Atom("", Status.BLOCK, index, flags, false);
        }
        if (capturing && seq.status == Status.CONT && seq.text.isEmpty()) {
            return new Atom("", Status.CAP, index, flags, atStart);
        }
        boolean stillStart = atStart && seq.status == Status.CONT && seq.text.isEmpty();
        return new Atom(seq.text, seq.status, index, flags, stillStart);
    }

    private static Integer namedCapture(String pattern, int index) throws Bad {
        int start;
        if (pattern.startsWith("(?P<", index)) {
            start = index + 4;
        } else if (pattern.startsWith("(?<", index)) {
            start = index + 3;
        } else {
            return null;
        }
        int end = pattern.indexOf('>', start);
        if (end < 0 || end == start) {
            throw new Bad("bad capture name");
        }
        String name = pattern.substring(start, end);
        for (int i = 0; i < name.length(); i++) {
            char ch = name.charAt(i);
            if (ch != '_' && !Character.isLetterOrDigit(ch)) {
                throw new Bad("bad capture name");
            }
        }
        return end + 1;
    }

    private static Atom perlGroup(String pattern, int index, Flags flags, boolean atStart, boolean onePass)
            throws Bad {
        int cursor = index + 2;
        int sign = 1;
        boolean saw = false;
        Flags updated = flags.copy();
        while (cursor < pattern.length()) {
            char ch = pattern.charAt(cursor);
            if (ch == ':' || ch == ')') {
                if (sign < 0 && !saw) {
                    throw new Bad("bad flags");
                }
                cursor++;
                if (ch == ')') {
                    return new Atom("", Status.FLAGS, cursor, updated, atStart);
                }
                Seq seq = sequence(pattern, cursor, updated, atStart, true, onePass);
                cursor = seq.index;
                if (cursor >= pattern.length() || pattern.charAt(cursor) != ')') {
                    throw new Bad("unclosed group");
                }
                boolean stillStart = atStart && seq.status == Status.CONT && seq.text.isEmpty();
                return new Atom(seq.text, seq.status, cursor + 1, flags, stillStart);
            }
            if (ch == '-') {
                if (sign < 0) {
                    throw new Bad("bad flags");
                }
                sign = -1;
                saw = false;
                cursor++;
                continue;
            }
            if (ch != 'i' && ch != 'm' && ch != 's' && ch != 'U') {
                throw new Bad("bad flags");
            }
            saw = true;
            boolean enabled = sign > 0;
            if (ch == 'i') {
                updated.fold = enabled;
            } else if (ch == 'm') {
                updated.multiline = enabled;
            }
            cursor++;
        }
        throw new Bad("bad flags");
    }

    private static Atom escape(String pattern, int index, Flags flags, boolean atStart, boolean onePass) throws Bad {
        if (index + 1 >= pattern.length()) {
            throw new Bad("trailing backslash");
        }
        if (pattern.startsWith("\\Q", index)) {
            int end = pattern.indexOf("\\E", index + 2);
            String literal = end < 0 ? pattern.substring(index + 2) : pattern.substring(index + 2, end);
            index = end < 0 ? pattern.length() : end + 2;
            if (flags.fold && !literal.isEmpty()) {
                return new Atom("", Status.BLOCK, index, flags, false);
            }
            return new Atom(literal, Status.CONT, index, flags, atStart && literal.isEmpty());
        }
        char ch = pattern.charAt(index + 1);
        if (ch == 'A') {
            if (atStart && onePass) {
                return new Atom("", Status.CONT, index + 2, flags, true);
            }
            return new Atom("", Status.BLOCK, index + 2, flags, false);
        }
        if ("zZbBdDwWsS".indexOf(ch) >= 0) {
            if (ch == 'Z') {
                throw new Bad("bad escape");
            }
            return new Atom("", Status.BLOCK, index + 2, flags, false);
        }
        LiteralEscape literal = literalEscape(pattern, index);
        if (flags.fold) {
            return new Atom("", Status.BLOCK, literal.index, flags, false);
        }
        return new Atom(literal.text, Status.CONT, literal.index, flags, false);
    }

    private record LiteralEscape(String text, int index) {}

    private static LiteralEscape literalEscape(String pattern, int index) throws Bad {
        if (index + 1 >= pattern.length()) {
            throw new Bad("trailing backslash");
        }
        String rest = pattern.substring(index + 1);
        char ch = rest.charAt(0);
        rest = rest.substring(1);
        if (ch >= '0' && ch <= '7') {
            if (ch != '0' && (rest.isEmpty() || rest.charAt(0) < '0' || rest.charAt(0) > '7')) {
                throw new Bad("bad escape");
            }
            int value = ch - '0';
            int consumed = 1;
            while (consumed < 3 && !rest.isEmpty() && rest.charAt(0) >= '0' && rest.charAt(0) <= '7') {
                value = value * 8 + (rest.charAt(0) - '0');
                rest = rest.substring(1);
                consumed++;
            }
            return new LiteralEscape(new String(Character.toChars(value)), pattern.length() - rest.length());
        }
        if (ch == 'x') {
            if (rest.isEmpty()) {
                throw new Bad("bad escape");
            }
            if (rest.charAt(0) == '{') {
                rest = rest.substring(1);
                StringBuilder digits = new StringBuilder();
                while (!rest.isEmpty() && rest.charAt(0) != '}') {
                    char digit = rest.charAt(0);
                    if (!isHex(digit)) {
                        throw new Bad("bad escape");
                    }
                    digits.append(digit);
                    rest = rest.substring(1);
                    if (Integer.parseInt(digits.toString(), 16) > 0x10FFFF) {
                        throw new Bad("bad escape");
                    }
                }
                if (digits.isEmpty() || rest.isEmpty() || rest.charAt(0) != '}') {
                    throw new Bad("bad escape");
                }
                int code = Integer.parseInt(digits.toString(), 16);
                return new LiteralEscape(new String(Character.toChars(code)), pattern.length() - rest.length() + 1);
            }
            if (rest.length() < 2) {
                throw new Bad("bad escape");
            }
            String pair = rest.substring(0, 2);
            if (!isHex(pair.charAt(0)) || !isHex(pair.charAt(1))) {
                throw new Bad("bad escape");
            }
            return new LiteralEscape(new String(Character.toChars(Integer.parseInt(pair, 16))), index + 4);
        }
        String named = switch (ch) {
            case 'a' -> "\u0007";
            case 'f' -> "\f";
            case 'n' -> "\n";
            case 'r' -> "\r";
            case 't' -> "\t";
            case 'v' -> "\u000B";
            default -> null;
        };
        if (named != null) {
            return new LiteralEscape(named, index + 2);
        }
        if (ch < 128 && !Character.isLetterOrDigit(ch)) {
            return new LiteralEscape(String.valueOf(ch), index + 2);
        }
        if (ch == '_') {
            return new LiteralEscape(String.valueOf(ch), index + 2);
        }
        throw new Bad("bad escape");
    }

    private static boolean isHex(char ch) {
        return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
    }

    private record ClassSpan(int index, String rune) {}

    private static ClassSpan classSpan(String pattern, int index) throws Bad {
        if (pattern.charAt(index) != '[') {
            throw new Bad("class");
        }
        index++;
        boolean negated = false;
        if (index < pattern.length() && pattern.charAt(index) == '^') {
            negated = true;
            index++;
        }
        java.util.List<String> runes = new java.util.ArrayList<>();
        boolean ranged = false;
        boolean posix = false;
        if (index < pattern.length() && pattern.charAt(index) == ']') {
            runes.add("]");
            index++;
        }
        while (index < pattern.length() && pattern.charAt(index) != ']') {
            if (pattern.startsWith("[:", index)) {
                int end = pattern.indexOf(":]", index + 2);
                if (end < 0) {
                    throw new Bad("class");
                }
                posix = true;
                index = end + 2;
                continue;
            }
            if (pattern.charAt(index) == '\\') {
                try {
                    LiteralEscape literal = literalEscape(pattern, index);
                    index = literal.index;
                    runes.add(literal.text);
                } catch (Bad bad) {
                    if (index + 1 >= pattern.length()) {
                        throw bad;
                    }
                    index += 2;
                    posix = true;
                    continue;
                }
            } else {
                runes.add(String.valueOf(pattern.charAt(index)));
                index++;
            }
            if (index + 1 < pattern.length() && pattern.charAt(index) == '-' && pattern.charAt(index + 1) != ']') {
                ranged = true;
                index++;
            }
        }
        if (index >= pattern.length() || pattern.charAt(index) != ']') {
            throw new Bad("class");
        }
        index++;
        if (!negated && !ranged && !posix && runes.size() == 1) {
            return new ClassSpan(index, runes.get(0));
        }
        return new ClassSpan(index, null);
    }

    private record Quantifier(int minimum, int maximum, int index) {}

    private static Quantifier quantifier(String pattern, int index) throws Bad {
        if (index >= pattern.length()) {
            return new Quantifier(1, 1, index);
        }
        char ch = pattern.charAt(index);
        int minimum;
        int maximum;
        if (ch == '*') {
            minimum = 0;
            maximum = INF;
            index++;
        } else if (ch == '+') {
            minimum = 1;
            maximum = INF;
            index++;
        } else if (ch == '?') {
            minimum = 0;
            maximum = 1;
            index++;
        } else if (ch == '{') {
            Quantifier parsed = repeat(pattern, index);
            if (parsed == null) {
                return new Quantifier(1, 1, index);
            }
            minimum = parsed.minimum;
            maximum = parsed.maximum;
            index = parsed.index;
        } else {
            return new Quantifier(1, 1, index);
        }
        if (index < pattern.length() && pattern.charAt(index) == '?') {
            index++;
        }
        return new Quantifier(minimum, maximum, index);
    }

    private static Quantifier repeat(String pattern, int index) throws Bad {
        if (pattern.charAt(index) != '{') {
            return null;
        }
        int cursor = index + 1;
        IntScan minimum = integer(pattern, cursor);
        cursor = minimum.index;
        if (minimum.value == null || cursor >= pattern.length()) {
            return null;
        }
        int max;
        if (pattern.charAt(cursor) != ',') {
            max = minimum.value;
        } else {
            cursor++;
            if (cursor < pattern.length() && pattern.charAt(cursor) == '}') {
                max = INF;
            } else {
                IntScan scanned = integer(pattern, cursor);
                cursor = scanned.index;
                if (scanned.value == null) {
                    return null;
                }
                max = scanned.value;
            }
        }
        if (cursor >= pattern.length() || pattern.charAt(cursor) != '}') {
            return null;
        }
        if (minimum.value < 0 || (max >= 0 && max < minimum.value)) {
            throw new Bad("bad repeat");
        }
        if (minimum.value > MAX_REPEAT || max > MAX_REPEAT) {
            throw new Bad("bad repeat");
        }
        return new Quantifier(minimum.value, max, cursor + 1);
    }

    private record IntScan(Integer value, int index) {}

    private static IntScan integer(String pattern, int index) {
        if (index >= pattern.length() || !Character.isDigit(pattern.charAt(index))) {
            return new IntScan(null, index);
        }
        if (pattern.charAt(index) == '0' && index + 1 < pattern.length() && Character.isDigit(pattern.charAt(index + 1))) {
            return new IntScan(null, index);
        }
        int value = 0;
        while (index < pattern.length() && Character.isDigit(pattern.charAt(index))) {
            value = value * 10 + (pattern.charAt(index) - '0');
            if (value >= 100_000_000) {
                return new IntScan(-1, index);
            }
            index++;
        }
        return new IntScan(value, index);
    }

    private record Piece(String text, Status status) {}

    private static Piece applyQuantifier(String text, Status status, int minimum, int maximum) {
        if (minimum == 1 && maximum == 1) {
            return new Piece(text, status);
        }
        if (status == Status.CAP) {
            if (minimum == maximum) {
                return new Piece("", minimum == 0 ? Status.CONT : Status.CAP);
            }
            return new Piece("", Status.BLOCK);
        }
        if (status == Status.CONT && text.isEmpty()) {
            return new Piece("", Status.CONT);
        }
        if (minimum == 0 && maximum == 0) {
            return new Piece("", Status.CONT);
        }
        if (status == Status.CONT) {
            if (minimum == 0) {
                return new Piece("", Status.BLOCK);
            }
            String repeated = text.repeat(minimum);
            if (maximum == minimum) {
                return new Piece(repeated, Status.CONT);
            }
            return new Piece(repeated, Status.STOP);
        }
        if (status == Status.STOP) {
            if (minimum == 0) {
                return new Piece("", Status.BLOCK);
            }
            return new Piece(text, Status.STOP);
        }
        if (minimum == 0 && maximum == 0) {
            return new Piece("", Status.CONT);
        }
        return new Piece("", Status.BLOCK);
    }
}
