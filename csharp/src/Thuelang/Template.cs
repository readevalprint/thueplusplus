namespace Thuelang;

static class Template
{
    public static string DecodeReplacementEscapes(string text)
    {
        const string placeholder = "\u0000BACKSLASH\u0000";
        text = text.Replace(@"\\", placeholder, StringComparison.Ordinal);
        text = text.Replace(@"\n", "\n", StringComparison.Ordinal);
        text = text.Replace(@"\t", "\t", StringComparison.Ordinal);
        text = text.Replace(@"\r", "\r", StringComparison.Ordinal);
        return text.Replace(placeholder, @"\", StringComparison.Ordinal);
    }

    public static string Expand(string template, Dictionary<string, string> groups, Dictionary<string, string> extra)
    {
        var raw = new Dictionary<string, string>(groups);
        foreach (var pair in extra)
            raw[pair.Key] = pair.Value;
        var vars = new Dictionary<string, string>(raw.Count);
        foreach (var pair in raw)
            vars[pair.Key] = pair.Value.Replace("\\", @"\\", StringComparison.Ordinal);
        var chars = template.ToCharArray();
        var builder = new System.Text.StringBuilder();
        var index = 0;
        while (index < chars.Length)
        {
            if (chars[index] == '{' && index + 1 < chars.Length && chars[index + 1] == '{')
            {
                var rel = FindClose(chars, index + 2);
                if (rel is int close)
                {
                    var inside = new string(chars, index + 2, close);
                    if (inside.Contains('|'))
                    {
                        var parts = inside.Split('|');
                        if (parts.Length != 2 || !Builtin.IsName(parts[0]) || !Builtin.IsName(parts[1]))
                            throw new ParseError($"Malformed template filter '{{{{{inside}}}}}'");
                        if (!raw.TryGetValue(parts[0], out var value))
                            throw new ParseError($"Missing template capture '{parts[0]}'");
                        builder.Append(parts[1] switch
                        {
                            "pctenc" => Builtin.PctEncode(value),
                            "pctdec" => Builtin.PctDecode(value),
                            var other => throw new ParseError($"Unknown template filter '{other}'"),
                        });
                        index += 2 + close + 2;
                        continue;
                    }
                    if (Builtin.IsWord(inside))
                    {
                        if (vars.TryGetValue(inside, out var value))
                            builder.Append(value);
                        index += 2 + close + 2;
                        continue;
                    }
                }
            }
            if (chars[index] == '{' && index + 1 < chars.Length && chars[index + 1] == '{')
            {
                builder.Append(chars[index]);
                index++;
                continue;
            }
            var start = index;
            while (index < chars.Length && !(chars[index] == '{' && index + 1 < chars.Length && chars[index + 1] == '{'))
                index++;
            builder.Append(DecodeReplacementEscapes(new string(chars, start, index - start)));
        }
        return builder.ToString();
    }

    public static string ExpandMid(string pattern, Dictionary<string, string> groups)
    {
        var builder = new System.Text.StringBuilder();
        var pos = 0;
        while (pos < pattern.Length)
        {
            if (pattern.AsSpan(pos).StartsWith("{{"))
            {
                var rel = pattern.IndexOf("}}", pos + 2, StringComparison.Ordinal);
                if (rel >= 0)
                {
                    var inside = pattern[(pos + 2)..rel];
                    if (inside.Contains('|'))
                    {
                        builder.Append(ExpandMidFilters(inside, groups));
                        pos = rel + 2;
                        continue;
                    }
                    if (Builtin.IsName(inside))
                    {
                        if (groups.TryGetValue(inside, out var value))
                            builder.Append(value);
                        pos = rel + 2;
                        continue;
                    }
                }
            }
            var next = pattern.IndexOf("{{", pos, StringComparison.Ordinal);
            if (next < 0)
            {
                builder.Append(pattern.AsSpan(pos));
                break;
            }
            if (next == pos)
            {
                builder.Append(pattern[pos]);
                pos++;
                continue;
            }
            builder.Append(pattern.AsSpan(pos, next - pos));
            pos = next;
        }
        return builder.ToString();
    }

    static string ExpandMidFilters(string inside, Dictionary<string, string> groups)
    {
        var parts = inside.Split('|');
        if (parts.Length < 2 || !Builtin.IsName(parts[0]) || parts.Skip(1).Any(part => !Builtin.IsName(part)))
            throw new ParseError($"Malformed template filter '{{{{{inside}}}}}'");
        if (!groups.TryGetValue(parts[0], out var value))
            throw new ParseError($"Missing template capture '{parts[0]}'");
        for (var i = 1; i < parts.Length; i++)
        {
            value = parts[i] switch
            {
                "pctenc" => Builtin.PctEncode(value),
                "pctdec" => Builtin.PctDecode(value),
                "quote" => Builtin.QuoteMeta(value),
                var other => throw new ParseError($"Unknown template filter '{other}'"),
            };
        }
        return value;
    }

    static int? FindClose(char[] chars, int start)
    {
        var index = start;
        while (index + 1 < chars.Length)
        {
            if (chars[index] == '}' && chars[index + 1] == '}')
                return index - start;
            index++;
        }
        return null;
    }
}
