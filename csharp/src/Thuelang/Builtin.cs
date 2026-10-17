using System.Globalization;
using System.Numerics;
using System.Text;
using System.Text.RegularExpressions;

namespace Thuelang;

static class Builtin
{
    public const int MaxNumericLiteralChars = 4096;

    /// <summary>Canonical numeric literal grammar from docs/numeric-builtins.md.</summary>
    internal const string NumericGrammar = @"-?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)";

    static readonly Regex NumericRe = new("^" + NumericGrammar + "$", RegexOptions.CultureInvariant | RegexOptions.Compiled);
    static readonly Regex ZeroDenominatorRe = new(@"^-?[0-9]+/0+$", RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static int? Arity(string name) => name switch
    {
        "eq" or "add" or "sub" or "mul" or "div" or "mod" or "numeq" or "lt" or "le" or "gt" or "ge" => 2,
        "num" or "b64enc" or "b64dec" or "pctenc" or "pctdec" or "escape" or "unescape" => 1,
        _ => null,
    };

    public static bool IsWord(string value) =>
        value.Length > 0 && value.All(static ch => ch is >= '0' and <= '9' or >= 'A' and <= 'Z' or >= 'a' and <= 'z' or '_');

    public static bool IsName(string value)
    {
        if (value.Length == 0)
            return false;
        var first = value[0];
        if (first is not (>= 'A' and <= 'Z' or >= 'a' and <= 'z' or '_'))
            return false;
        for (var i = 1; i < value.Length; i++)
        {
            var ch = value[i];
            if (ch is not (>= '0' and <= '9' or >= 'A' and <= 'Z' or >= 'a' and <= 'z' or '_'))
                return false;
        }
        return true;
    }

    public static (string Name, List<string> Args) ParseCall(string rhs, int lineNumber, HashSet<string> captures)
    {
        var tokens = rhs.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length == 0)
            throw new ParseError($"Line {lineNumber}: ::! requires a builtin name");
        var name = tokens[0];
        var expected = Arity(name) ?? throw new ParseError($"Line {lineNumber}: Unknown builtin '{name}'");
        var args = tokens.Skip(1).ToArray();
        if (args.Length != expected)
            throw new ParseError($"Line {lineNumber}: Builtin '{name}' expects {expected} args, got {args.Length}");
        foreach (var arg in args)
        {
            if (!IsName(arg))
                throw new ParseError($"Line {lineNumber}: ::! arguments must be capture names, got '{arg}'");
            if (!captures.Contains(arg))
                throw new ParseError($"Line {lineNumber}: ::! argument '{arg}' is not a named capture");
        }
        return (name, args.ToList());
    }

    public static string PctEncode(string value)
    {
        var builder = new StringBuilder();
        foreach (var b in Encoding.UTF8.GetBytes(value))
        {
            if (b is (>= (byte)'0' and <= (byte)'9') or (>= (byte)'A' and <= (byte)'Z') or (>= (byte)'a' and <= (byte)'z') or (byte)'_' or (byte)'.' or (byte)'-')
                builder.Append((char)b);
            else
                builder.Append('%').Append(b.ToString("X2"));
        }
        return builder.ToString();
    }

    public static string PctDecode(string value)
    {
        var bytes = Encoding.UTF8.GetBytes(value);
        var data = new List<byte>(bytes.Length);
        var index = 0;
        while (index < bytes.Length)
        {
            if (bytes[index] == (byte)'%')
            {
                if (index + 2 >= bytes.Length)
                    throw new ParseError("PCT payload has incomplete percent escape");
                var hex = value.Substring(index + 1, 2);
                if (!hex.All(static ch => ch is >= '0' and <= '9' or >= 'A' and <= 'F'))
                    throw new ParseError("PCT payload has malformed or non-canonical percent escape");
                data.Add(Convert.ToByte(hex, 16));
                index += 3;
            }
            else
            {
                var ch = bytes[index];
                if (!(ch is (>= (byte)'0' and <= (byte)'9') or (>= (byte)'A' and <= (byte)'Z') or (>= (byte)'a' and <= (byte)'z') or (byte)'_' or (byte)'.' or (byte)'-'))
                    throw new ParseError("PCT payload contains unencoded unsafe byte");
                data.Add(ch);
                index += 1;
            }
        }
        try
        {
            return new UTF8Encoding(false, true).GetString(data.ToArray());
        }
        catch (DecoderFallbackException)
        {
            throw new ParseError("PCT payload decoded bytes are not valid UTF-8");
        }
    }

    public static string B64UrlEncode(string value)
    {
        var text = Convert.ToBase64String(Encoding.UTF8.GetBytes(value));
        return text.TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public static string B64UrlDecode(string value)
    {
        if (value.Contains('='))
            throw new ParseError("Builtin 'b64dec' expected unpadded Base64url input");
        if (!value.All(static ch => ch is >= '0' and <= '9' or >= 'A' and <= 'Z' or >= 'a' and <= 'z' or '-' or '_'))
            throw new ParseError("Builtin 'b64dec' expected Base64url input");
        if (value.Length % 4 == 1)
            throw new ParseError("Builtin 'b64dec' invalid Base64url length");
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = (value.Length % 4) switch
        {
            2 => padded + "==",
            3 => padded + "=",
            _ => padded,
        };
        byte[] decoded;
        try
        {
            decoded = Convert.FromBase64String(padded);
        }
        catch (FormatException ex)
        {
            throw new ParseError($"Builtin 'b64dec' invalid Base64url input: {ex.Message}");
        }
        string text;
        try
        {
            text = new UTF8Encoding(false, true).GetString(decoded);
        }
        catch (DecoderFallbackException)
        {
            throw new ParseError("Builtin 'b64dec' decoded bytes are not valid UTF-8");
        }
        if (B64UrlEncode(text) != value)
            throw new ParseError("Builtin 'b64dec' expected canonical unpadded Base64url input");
        return text;
    }

    public static string Eval(string name, IReadOnlyList<string> values)
    {
        var expected = Arity(name) ?? throw new ParseError($"internal error: invalid validated builtin '{name}' with {values.Count} values");
        if (values.Count != expected)
            throw new ParseError($"internal error: invalid validated builtin '{name}' with {values.Count} values");
        switch (name)
        {
            case "eq":
                return values[0] == values[1] ? "1" : "0";
            case "b64enc":
                return B64UrlEncode(values[0]);
            case "b64dec":
                return B64UrlDecode(values[0]);
            case "pctenc":
                return PctEncode(values[0]);
            case "pctdec":
                return PctDecode(values[0]);
            case "escape":
                return EscapeText(values[0]);
            case "unescape":
                return UnescapeText(values[0]);
            case "num":
                return $"<num>{FormatRat(ParseNumber(values[0], name))}</num>";
        }
        var left = ParseNumber(values[0], name);
        var right = ParseNumber(values[1], name);
        return name switch
        {
            "add" => FormatRat(left.Add(right)),
            "sub" => FormatRat(left.Sub(right)),
            "mul" => FormatRat(left.Mul(right)),
            "div" => right.IsZero ? throw new ParseError("Builtin 'div' division by zero") : FormatRat(left.Div(right)),
            "mod" => Mod(left, right),
            "numeq" => left.Equals(right) ? "1" : "0",
            "lt" => left.Compare(right) < 0 ? "1" : "0",
            "le" => left.Compare(right) <= 0 ? "1" : "0",
            "gt" => left.Compare(right) > 0 ? "1" : "0",
            "ge" => left.Compare(right) >= 0 ? "1" : "0",
            _ => throw new ParseError($"internal error: validated builtin '{name}' has no evaluator"),
        };
    }

    public static string QuoteMeta(string value)
    {
        var builder = new StringBuilder();
        foreach (var ch in value)
        {
            if (ch is '\\' or '.' or '+' or '*' or '?' or '(' or ')' or '|' or '[' or ']' or '{' or '}' or '^' or '$')
                builder.Append('\\');
            builder.Append(ch);
        }
        return builder.ToString();
    }

    static string EscapeText(string value)
    {
        var text = PctDecode(value);
        var builder = new StringBuilder();
        foreach (var ch in text)
        {
            switch (ch)
            {
                case '\\': builder.Append(@"\\"); break;
                case '"': builder.Append("\\\""); break;
                case '\n': builder.Append(@"\n"); break;
                case '\t': builder.Append(@"\t"); break;
                case '\r': builder.Append(@"\r"); break;
                case '\u0008': builder.Append(@"\b"); break;
                case '\u000c': builder.Append(@"\f"); break;
                default: builder.Append(ch); break;
            }
        }
        return PctEncode(builder.ToString());
    }

    static string UnescapeText(string value)
    {
        var text = PctDecode(value);
        var chars = text.ToCharArray();
        var builder = new StringBuilder();
        var index = 0;
        while (index < chars.Length)
        {
            if (chars[index] != '\\')
            {
                builder.Append(chars[index]);
                index++;
                continue;
            }
            if (index + 1 >= chars.Length)
                throw new ParseError("Builtin 'unescape' has trailing backslash escape");
            index++;
            switch (chars[index])
            {
                case '\\': builder.Append('\\'); break;
                case '"': builder.Append('"'); break;
                case 'n': builder.Append('\n'); break;
                case 't': builder.Append('\t'); break;
                case 'r': builder.Append('\r'); break;
                case 'b': builder.Append('\u0008'); break;
                case 'f': builder.Append('\u000c'); break;
                default:
                    throw new ParseError($"Builtin 'unescape' unsupported escape '\\{chars[index]}'");
            }
            index++;
        }
        return PctEncode(builder.ToString());
    }

    static Rat ParseNumber(string value, string builtin)
    {
        if (!NumericRe.IsMatch(value))
            throw new ParseError($"Builtin '{builtin}' expected numeric input, got '{value}'");
        if (value.EnumerateRunes().Count() > MaxNumericLiteralChars)
            throw new ParseError($"Builtin '{builtin}' numeric input exceeds maximum length ({MaxNumericLiteralChars} characters)");
        if (ZeroDenominatorRe.IsMatch(value))
            throw new ParseError($"Builtin '{builtin}' fraction denominator must be non-zero");
        var slash = value.IndexOf('/');
        if (slash >= 0)
            return Rat.New(ParseInt(value[..slash]), ParseInt(value[(slash + 1)..]));
        var dot = value.IndexOf('.');
        if (dot >= 0)
        {
            var whole = value[..dot];
            var frac = value[(dot + 1)..];
            var negative = whole.StartsWith('-');
            var digits = negative ? whole[1..] + frac : whole + frac;
            var numer = ParseInt(digits);
            if (negative)
                numer = -numer;
            var denom = BigInteger.Pow(10, frac.Length);
            return Rat.New(numer, denom);
        }
        return Rat.FromInteger(ParseInt(value));
    }

    static BigInteger ParseInt(string value)
    {
        if (!BigInteger.TryParse(value, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var parsed))
            throw new ParseError($"expected integer digits, got '{value}'");
        return parsed;
    }

    static string FormatRat(Rat value) => value.IsInteger ? value.Numer.ToString(CultureInfo.InvariantCulture) : $"{value.Numer.ToString(CultureInfo.InvariantCulture)}/{value.Denom.ToString(CultureInfo.InvariantCulture)}";

    static string Mod(Rat left, Rat right)
    {
        if (right.IsZero)
            throw new ParseError("Builtin 'mod' modulo by zero");
        if (!left.IsInteger || !right.IsInteger)
            throw new ParseError("Builtin 'mod' expected integer inputs");
        if (left.IsNegative || right.IsNegative)
            throw new ParseError("Builtin 'mod' expected non-negative integer inputs");
        return (left.Numer % right.Numer).ToString(CultureInfo.InvariantCulture);
    }

    readonly struct Rat
    {
        public BigInteger Numer { get; }
        public BigInteger Denom { get; }

        Rat(BigInteger numer, BigInteger denom)
        {
            Numer = numer;
            Denom = denom;
        }

        public bool IsInteger => Denom == 1;
        public bool IsZero => Numer.IsZero;
        public bool IsNegative => Numer.Sign < 0;

        public static Rat FromInteger(BigInteger value) => new(value, BigInteger.One);

        public static Rat New(BigInteger numer, BigInteger denom)
        {
            if (denom.Sign < 0)
            {
                numer = -numer;
                denom = -denom;
            }
            var gcd = BigInteger.GreatestCommonDivisor(BigInteger.Abs(numer), denom);
            if (gcd.IsZero)
                gcd = BigInteger.One;
            return new Rat(numer / gcd, denom / gcd);
        }

        public Rat Add(Rat other) => New(Numer * other.Denom + other.Numer * Denom, Denom * other.Denom);
        public Rat Sub(Rat other) => New(Numer * other.Denom - other.Numer * Denom, Denom * other.Denom);
        public Rat Mul(Rat other) => New(Numer * other.Numer, Denom * other.Denom);

        public Rat Div(Rat other) => New(Numer * other.Denom, Denom * other.Numer);

        public int Compare(Rat other) => (Numer * other.Denom).CompareTo(other.Numer * Denom);

        public bool Equals(Rat other) => Numer == other.Numer && Denom == other.Denom;
    }
}

sealed class ParseError : Exception
{
    public ParseError(string message) : base(message) { }
}
