using System.Globalization;
using System.Text;

namespace Thuelang;

/// <summary>CLI limit parsing. <c>unlimited</c> clears a limit. Zero is a real limit.</summary>
public static class Limits
{
    public static bool TryParse(string text, out long? value, out string error)
    {
        if (text == "unlimited")
        {
            value = null;
            error = "";
            return true;
        }
        if (!TryAtoi(text, out var parsed, out error))
        {
            value = null;
            return false;
        }
        value = parsed;
        return true;
    }

    public static bool TryAtoi(string text, out long value, out string error)
    {
        if (!AtouiSyntax(text))
        {
            value = 0;
            error = $"strconv.Atoi: parsing {GoQuote(text)}: invalid syntax";
            return false;
        }
        if (!long.TryParse(text, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out value))
        {
            error = $"strconv.Atoi: parsing {GoQuote(text)}: value out of range";
            return false;
        }
        error = "";
        return true;
    }

    static bool AtouiSyntax(string text)
    {
        var digits = text.StartsWith('-') ? text[1..] : text;
        return digits.Length > 0 && digits.All(static ch => ch is >= '0' and <= '9');
    }

    public static string GoQuote(string text)
    {
        var builder = new StringBuilder("\"");
        foreach (var ch in text)
        {
            switch (ch)
            {
                case '\\':
                    builder.Append(@"\\");
                    break;
                case '"':
                    builder.Append("\\\"");
                    break;
                case '\n':
                    builder.Append(@"\n");
                    break;
                case '\r':
                    builder.Append(@"\r");
                    break;
                case '\t':
                    builder.Append(@"\t");
                    break;
                default:
                    if (ch < 0x20)
                        builder.Append($"\\x{(int)ch:x2}");
                    else
                        builder.Append(ch);
                    break;
            }
        }
        builder.Append('"');
        return builder.ToString();
    }
}
