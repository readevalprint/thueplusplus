namespace Thuelang;

/// <summary>
/// Literal prefix of a rule pattern, matching the Go engine.
/// A miss on this text cannot be a match, so the runner skips the regex and
/// does not count a regex eval. A hit still runs the regex.
/// </summary>
static class Prefix
{
    enum Status { Cont, Stop, Block, Flags, Cap }

    sealed class Bad : Exception { }

    struct Flags
    {
        public bool Multiline;
        public bool Fold;
        public static Flags New() => new();
    }

    const int Inf = -1;
    const int MaxRepeat = 100_000;

    public static string Literal(string lhs)
    {
        if (lhs.Contains("(?i", StringComparison.Ordinal))
            return "";
        var body = lhs.StartsWith('^') ? lhs[1..] : lhs;
        var chars = body.ToCharArray();
        bool onePass;
        try
        {
            onePass = OnePass(chars, body);
        }
        catch (Bad)
        {
            return "";
        }
        try
        {
            var (text, _, index) = Sequence(chars, 0, Flags.New(), true, false, onePass);
            return index == chars.Length ? text : "";
        }
        catch (Bad)
        {
            return "";
        }
    }

    static bool OnePass(char[] chars, string body)
    {
        if (!LeadingBeginText(chars))
            return false;
        bool alt;
        try
        {
            alt = AltPresent(chars);
        }
        catch (Bad)
        {
            return false;
        }
        if (alt && !EndAnchored(body))
            return false;
        return !SwallowsNext(body);
    }

    static bool SwallowsNext(string body)
    {
        string[] tokens = [@"[\s\S]*", @"[\s\S]+", @"[\S\s]*", @"[\S\s]+", @"[\s\S]?", @"[\S\s]?"];
        foreach (var token in tokens)
        {
            var start = 0;
            while (body.IndexOf(token, start, StringComparison.Ordinal) is var found && found >= 0)
            {
                var cursor = found + token.Length;
                if (cursor < body.Length && body[cursor] == '?')
                    cursor++;
                while (cursor < body.Length && body[cursor] == ')')
                    cursor++;
                var rest = body[cursor..];
                if (rest.Length > 0 && !rest.StartsWith(@"\z", StringComparison.Ordinal) && !rest.StartsWith('$'))
                    return true;
                start = found + token.Length;
            }
        }
        return false;
    }

    static bool LeadingBeginText(char[] body)
    {
        var index = 0;
        var multiline = false;
        while (index < body.Length)
        {
            if (Starts(body, index, "(?P<") || Starts(body, index, "(?<"))
                return false;
            if (Starts(body, index, "(?:"))
            {
                index += 3;
                continue;
            }
            if (Starts(body, index, "(?"))
            {
                index += 2;
                var sign = 1;
                while (index < body.Length && body[index] != ':' && body[index] != ')')
                {
                    var ch = body[index];
                    index++;
                    if (ch == '-')
                    {
                        sign = -1;
                        continue;
                    }
                    if (ch == 'm')
                        multiline = sign > 0;
                }
                if (index >= body.Length)
                    return false;
                if (body[index] == ':')
                {
                    index++;
                    continue;
                }
                index++;
                continue;
            }
            if (body[index] == '(')
                return false;
            if (Starts(body, index, @"\A"))
                return true;
            if (body[index] == '^')
                return !multiline;
            return false;
        }
        return false;
    }

    static bool EndAnchored(string body) =>
        body.Contains("(?m", StringComparison.Ordinal) ? body.EndsWith(@"\z", StringComparison.Ordinal) : body.EndsWith(@"\z", StringComparison.Ordinal) || body.EndsWith('$');

    static bool AltPresent(char[] body)
    {
        var index = 0;
        while (index < body.Length)
        {
            if (Starts(body, index, @"\Q"))
            {
                var end = FindFrom(body, index + 2, @"\E");
                index = end is int at ? at + 2 : body.Length;
                continue;
            }
            if (body[index] == '\\')
            {
                index += 2;
                continue;
            }
            if (body[index] == '[')
            {
                index = ClassSpan(body, index).End;
                continue;
            }
            if (body[index] == '|')
                return true;
            index++;
        }
        return false;
    }

    static (string Text, Status Status, int Index) Sequence(char[] pattern, int index, Flags flags, bool atStart, bool stopParen, bool onePass)
    {
        var branches = new List<List<(string Text, Status Status)>> { new() };
        while (index < pattern.Length)
        {
            if (stopParen && pattern[index] == ')')
                break;
            if (pattern[index] == '|')
            {
                branches.Add(new());
                index++;
                atStart = true;
                continue;
            }
            var (text, status, next, nextFlags, nextStart) = Atom(pattern, index, flags, atStart, onePass);
            index = next;
            flags = nextFlags;
            atStart = nextStart;
            if (status == Status.Flags)
                continue;
            var (minimum, maximum, after) = Quantifier(pattern, index);
            index = after;
            (text, status) = ApplyQuantifier(text, status, minimum, maximum);
            if (status == Status.Cont && text.Length == 0)
                continue;
            branches[^1].Add((text, status));
            if (status != Status.Cap)
                atStart = false;
        }
        var folded = branches.Select(Fold).ToList();
        if (folded.Count == 1)
            return (folded[0].Text, folded[0].Status, index);
        var (common, commonStatus) = Common(folded);
        return (common, commonStatus, index);
    }

    static (string Text, Status Status) Common(List<(string Text, Status Status)> folded)
    {
        var texts = new List<string>();
        foreach (var (text, status) in folded)
        {
            if (status == Status.Block)
                return ("", Status.Block);
            texts.Add(text);
        }
        var shared = texts[0].ToCharArray().ToList();
        foreach (var text in texts.Skip(1))
        {
            var other = text.ToCharArray();
            var limit = Math.Min(shared.Count, other.Length);
            var size = 0;
            while (size < limit && shared[size] == other[size])
                size++;
            shared.RemoveRange(size, shared.Count - size);
        }
        if (shared.Count == 0)
            return ("", Status.Block);
        var common = new string(shared.ToArray());
        if (folded.All(item => item.Status == Status.Cont && item.Text == common))
            return (common, Status.Cont);
        return (common, Status.Stop);
    }

    static (string Text, Status Status) Fold(List<(string Text, Status Status)> atoms)
    {
        var text = new System.Text.StringBuilder();
        var sawCap = false;
        foreach (var (atom, status) in atoms)
        {
            if (status == Status.Cap)
            {
                sawCap = true;
                continue;
            }
            if (status == Status.Block)
                return (text.ToString(), text.Length == 0 ? Status.Block : Status.Stop);
            text.Append(atom);
            if (status == Status.Stop)
                return (text.ToString(), Status.Stop);
        }
        if (sawCap && text.Length == 0)
            return ("", Status.Cap);
        return (text.ToString(), Status.Cont);
    }

    static (string Text, Status Status, int Index, Flags Flags, bool AtStart) Atom(char[] pattern, int index, Flags flags, bool atStart, bool onePass)
    {
        if (index >= pattern.Length)
            throw new Bad();
        var ch = pattern[index];
        if (ch == '^')
        {
            if (flags.Multiline || !atStart || !onePass)
                return ("", Status.Block, index + 1, flags, false);
            return ("", Status.Cont, index + 1, flags, true);
        }
        if (ch is '$' or '.')
            return ("", Status.Block, index + 1, flags, false);
        if (ch == '[')
        {
            var span = ClassSpan(pattern, index);
            if (span.Rune is not char rune || flags.Fold)
                return ("", Status.Block, span.End, flags, false);
            return (rune.ToString(), Status.Cont, span.End, flags, false);
        }
        if (ch == '(')
            return Group(pattern, index, flags, atStart, onePass);
        if (ch == '\\')
            return Escape(pattern, index, flags, atStart, onePass);
        if ("*+?)|".Contains(ch))
            throw new Bad();
        if (flags.Fold)
            return ("", Status.Block, index + 1, flags, false);
        return (ch.ToString(), Status.Cont, index + 1, flags, false);
    }

    static (string Text, Status Status, int Index, Flags Flags, bool AtStart) Group(char[] pattern, int index, Flags flags, bool atStart, bool onePass)
    {
        const bool capturing = true;
        if (Starts(pattern, index, "(?"))
        {
            var named = NamedCapture(pattern, index);
            if (named is int at)
                index = at;
            else
                return PerlGroup(pattern, index, flags, atStart, onePass);
        }
        else
        {
            index++;
        }
        var (text, status, next) = Sequence(pattern, index, flags, atStart, true, onePass);
        if (next >= pattern.Length || pattern[next] != ')')
            throw new Bad();
        index = next + 1;
        if (onePass && capturing)
            return ("", Status.Block, index, flags, false);
        if (capturing && status == Status.Cont && text.Length == 0)
            return ("", Status.Cap, index, flags, atStart);
        var still = atStart && status == Status.Cont && text.Length == 0;
        return (text, status, index, flags, still);
    }

    static int? NamedCapture(char[] pattern, int index)
    {
        int start;
        if (Starts(pattern, index, "(?P<"))
            start = index + 4;
        else if (Starts(pattern, index, "(?<"))
            start = index + 3;
        else
            return null;
        var end = FindFrom(pattern, start, ">") ?? throw new Bad();
        if (end == start)
            throw new Bad();
        for (var i = start; i < end; i++)
        {
            var ch = pattern[i];
            if (ch != '_' && !char.IsLetterOrDigit(ch))
                throw new Bad();
        }
        return end + 1;
    }

    static (string Text, Status Status, int Index, Flags Flags, bool AtStart) PerlGroup(char[] pattern, int index, Flags flags, bool atStart, bool onePass)
    {
        var cursor = index + 2;
        var sign = 1;
        var saw = false;
        var updated = flags;
        while (cursor < pattern.Length)
        {
            var ch = pattern[cursor];
            if (ch is ':' or ')')
            {
                if (sign < 0 && !saw)
                    throw new Bad();
                cursor++;
                if (ch == ')')
                    return ("", Status.Flags, cursor, updated, atStart);
                var (text, status, next) = Sequence(pattern, cursor, updated, atStart, true, onePass);
                if (next >= pattern.Length || pattern[next] != ')')
                    throw new Bad();
                var still = atStart && status == Status.Cont && text.Length == 0;
                return (text, status, next + 1, flags, still);
            }
            if (ch == '-')
            {
                if (sign < 0)
                    throw new Bad();
                sign = -1;
                saw = false;
                cursor++;
                continue;
            }
            if (!"imsU".Contains(ch))
                throw new Bad();
            saw = true;
            var enabled = sign > 0;
            if (ch == 'i')
                updated.Fold = enabled;
            else if (ch == 'm')
                updated.Multiline = enabled;
            cursor++;
        }
        throw new Bad();
    }

    static (string Text, Status Status, int Index, Flags Flags, bool AtStart) Escape(char[] pattern, int index, Flags flags, bool atStart, bool onePass)
    {
        if (index + 1 >= pattern.Length)
            throw new Bad();
        if (Starts(pattern, index, @"\Q"))
        {
            var end = FindFrom(pattern, index + 2, @"\E");
            var literal = end is int at ? new string(pattern, index + 2, at - (index + 2)) : new string(pattern, index + 2, pattern.Length - (index + 2));
            var next = end is int found ? found + 2 : pattern.Length;
            if (flags.Fold && literal.Length > 0)
                return ("", Status.Block, next, flags, false);
            var still = atStart && literal.Length == 0;
            return (literal, Status.Cont, next, flags, still);
        }
        var ch = pattern[index + 1];
        if (ch == 'A')
        {
            if (atStart && onePass)
                return ("", Status.Cont, index + 2, flags, true);
            return ("", Status.Block, index + 2, flags, false);
        }
        if ("zZbBdDwWsS".Contains(ch))
        {
            if (ch == 'Z')
                throw new Bad();
            return ("", Status.Block, index + 2, flags, false);
        }
        var (decoded, after) = LiteralEscape(pattern, index);
        if (flags.Fold)
            return ("", Status.Block, after, flags, false);
        return (decoded, Status.Cont, after, flags, false);
    }

    static (string Text, int Index) LiteralEscape(char[] pattern, int index)
    {
        if (index + 1 >= pattern.Length)
            throw new Bad();
        var ch = pattern[index + 1];
        var rest = index + 2;
        if (ch is >= '0' and <= '7')
        {
            if (ch != '0' && (rest >= pattern.Length || pattern[rest] is < '0' or > '7'))
                throw new Bad();
            var value = (uint)(ch - '0');
            var consumed = 1;
            var cursor = rest;
            while (consumed < 3 && cursor < pattern.Length && pattern[cursor] is >= '0' and <= '7')
            {
                value = value * 8 + (uint)(pattern[cursor] - '0');
                cursor++;
                consumed++;
            }
            if (value > 0x10FFFF || !RuneOk(value))
                throw new Bad();
            return (char.ConvertFromUtf32((int)value), cursor);
        }
        if (ch == 'x')
        {
            if (rest >= pattern.Length)
                throw new Bad();
            if (pattern[rest] == '{')
            {
                var cursor = rest + 1;
                var digits = new System.Text.StringBuilder();
                while (cursor < pattern.Length && pattern[cursor] != '}')
                {
                    var digit = pattern[cursor];
                    if (!IsHex(digit))
                        throw new Bad();
                    digits.Append(digit);
                    cursor++;
                    if (!uint.TryParse(digits.ToString(), System.Globalization.NumberStyles.HexNumber, null, out var parsed) || parsed > 0x10FFFF)
                        throw new Bad();
                }
                if (digits.Length == 0 || cursor >= pattern.Length || pattern[cursor] != '}')
                    throw new Bad();
                var code = uint.Parse(digits.ToString(), System.Globalization.NumberStyles.HexNumber);
                if (!RuneOk(code))
                    throw new Bad();
                return (char.ConvertFromUtf32((int)code), cursor + 1);
            }
            if (rest + 2 > pattern.Length)
                throw new Bad();
            var pair = new string(pattern, rest, 2);
            if (!pair.All(IsHex))
                throw new Bad();
            var hex = uint.Parse(pair, System.Globalization.NumberStyles.HexNumber);
            if (!RuneOk(hex))
                throw new Bad();
            return (char.ConvertFromUtf32((int)hex), index + 4);
        }
        char? named = ch switch
        {
            'a' => '\u0007',
            'f' => '\u000c',
            'n' => '\n',
            'r' => '\r',
            't' => '\t',
            'v' => '\u000b',
            _ => null,
        };
        if (named is char decoded)
            return (decoded.ToString(), index + 2);
        if (ch < 128 && !char.IsAsciiLetterOrDigit(ch))
            return (ch.ToString(), index + 2);
        if (ch == '_')
            return (ch.ToString(), index + 2);
        throw new Bad();
    }

    static bool RuneOk(uint value) => value <= 0x10FFFF && !(value >= 0xD800 && value <= 0xDFFF);

    static bool IsHex(char ch) => ch is >= '0' and <= '9' or >= 'a' and <= 'f' or >= 'A' and <= 'F';

    readonly struct ClassResult
    {
        public int End { get; init; }
        public char? Rune { get; init; }
    }

    static ClassResult ClassSpan(char[] pattern, int index)
    {
        if (index >= pattern.Length || pattern[index] != '[')
            throw new Bad();
        index++;
        var negated = false;
        if (index < pattern.Length && pattern[index] == '^')
        {
            negated = true;
            index++;
        }
        var runes = new List<char>();
        var ranged = false;
        var posix = false;
        if (index < pattern.Length && pattern[index] == ']')
        {
            runes.Add(']');
            index++;
        }
        while (index < pattern.Length && pattern[index] != ']')
        {
            if (Starts(pattern, index, "[:"))
            {
                var end = FindFrom(pattern, index + 2, ":]") ?? throw new Bad();
                posix = true;
                index = end + 2;
                continue;
            }
            if (pattern[index] == '\\')
            {
                try
                {
                    var (literal, next) = LiteralEscape(pattern, index);
                    if (literal.Length != 1)
                        posix = true;
                    else
                        runes.Add(literal[0]);
                    index = next;
                }
                catch (Bad)
                {
                    if (index + 1 >= pattern.Length)
                        throw;
                    index += 2;
                    posix = true;
                    continue;
                }
            }
            else
            {
                runes.Add(pattern[index]);
                index++;
            }
            if (index + 1 < pattern.Length && pattern[index] == '-' && pattern[index + 1] != ']')
            {
                ranged = true;
                index++;
            }
        }
        if (index >= pattern.Length || pattern[index] != ']')
            throw new Bad();
        index++;
        if (!negated && !ranged && !posix && runes.Count == 1)
            return new ClassResult { End = index, Rune = runes[0] };
        return new ClassResult { End = index, Rune = null };
    }

    static (int Minimum, int Maximum, int Index) Quantifier(char[] pattern, int index)
    {
        if (index >= pattern.Length)
            return (1, 1, index);
        var ch = pattern[index];
        int minimum, maximum;
        if (ch == '*')
            (minimum, maximum, index) = (0, Inf, index + 1);
        else if (ch == '+')
            (minimum, maximum, index) = (1, Inf, index + 1);
        else if (ch == '?')
            (minimum, maximum, index) = (0, 1, index + 1);
        else if (ch == '{')
        {
            var parsed = Repeat(pattern, index);
            if (parsed is null)
                return (1, 1, index);
            (minimum, maximum, index) = parsed.Value;
        }
        else
        {
            return (1, 1, index);
        }
        if (index < pattern.Length && pattern[index] == '?')
            index++;
        return (minimum, maximum, index);
    }

    static (int Minimum, int Maximum, int Index)? Repeat(char[] pattern, int index)
    {
        if (pattern[index] != '{')
            return null;
        var cursor = index + 1;
        var (minimum, next) = Integer(pattern, cursor);
        cursor = next;
        if (minimum is not int low)
            return null;
        if (cursor >= pattern.Length)
            return null;
        int high;
        if (pattern[cursor] != ',')
        {
            high = low;
        }
        else
        {
            cursor++;
            if (cursor < pattern.Length && pattern[cursor] == '}')
            {
                high = Inf;
            }
            else
            {
                var (maximum, after) = Integer(pattern, cursor);
                cursor = after;
                if (maximum is not int parsed)
                    return null;
                high = parsed;
            }
        }
        if (cursor >= pattern.Length || pattern[cursor] != '}')
            return null;
        if (low < 0 || (high >= 0 && high < low))
            throw new Bad();
        if (low > MaxRepeat || high > MaxRepeat)
            throw new Bad();
        return (low, high, cursor + 1);
    }

    static (int? Value, int Index) Integer(char[] pattern, int index)
    {
        if (index >= pattern.Length || pattern[index] is < '0' or > '9')
            return (null, index);
        if (pattern[index] == '0' && index + 1 < pattern.Length && pattern[index + 1] is >= '0' and <= '9')
            return (null, index);
        var value = 0;
        while (index < pattern.Length && pattern[index] is >= '0' and <= '9')
        {
            value = value * 10 + (pattern[index] - '0');
            if (value >= 100_000_000)
                return (-1, index);
            index++;
        }
        return (value, index);
    }

    static (string Text, Status Status) ApplyQuantifier(string text, Status status, int minimum, int maximum)
    {
        if (minimum == 1 && maximum == 1)
            return (text, status);
        if (status == Status.Cap)
        {
            if (minimum == maximum)
                return minimum == 0 ? ("", Status.Cont) : ("", Status.Cap);
            return ("", Status.Block);
        }
        if (status == Status.Cont && text.Length == 0)
            return ("", Status.Cont);
        if (minimum == 0 && maximum == 0)
            return ("", Status.Cont);
        if (status == Status.Cont)
        {
            if (minimum == 0)
                return ("", Status.Block);
            var repeated = string.Concat(Enumerable.Repeat(text, minimum));
            return maximum == minimum ? (repeated, Status.Cont) : (repeated, Status.Stop);
        }
        if (status == Status.Stop)
            return minimum == 0 ? ("", Status.Block) : (text, Status.Stop);
        return ("", Status.Block);
    }

    static bool Starts(char[] pattern, int index, string text)
    {
        if (index + text.Length > pattern.Length)
            return false;
        for (var i = 0; i < text.Length; i++)
        {
            if (pattern[index + i] != text[i])
                return false;
        }
        return true;
    }

    static int? FindFrom(char[] pattern, int index, string text)
    {
        if (text.Length == 0)
            return index;
        if (index > pattern.Length)
            return null;
        var hay = new string(pattern, index, pattern.Length - index);
        var found = hay.IndexOf(text, StringComparison.Ordinal);
        return found < 0 ? null : index + found;
    }
}
