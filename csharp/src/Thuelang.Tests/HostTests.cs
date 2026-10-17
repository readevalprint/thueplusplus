using Thuelang;
using Xunit;

namespace Thuelang.Tests;

public class HostTests
{
    [Fact]
    public void PrefixesMatchTheGoEngine()
    {
        (string Lhs, string Prefix)[] cases =
        [
            ("()*a", ""),
            ("()a", "a"),
            ("(?:^a)", "a"),
            ("(foo)bar", "foobar"),
            ("a[]b]{0}c", "ac"),
            ("^(?:[z])$", "z"),
            ("(?i)ABC", ""),
            ("a{3}b", "aaab"),
            ("(?:ab){2}", "abab"),
            ("a.{0}b", "ab"),
            ("foo(?:bar){0}baz", "foobaz"),
            ("a+b", "a"),
            ("a{2,}b", "aa"),
            ("a*b", ""),
            ("ab*c", "a"),
            ("a(?:)*b", "ab"),
            ("{01}", "{01}"),
            (@"\A\{(?<bad>[\s\S]*)\z", "{"),
            (@"\Ag:0\ni:4\nbuy:(?<b>4)\n\z", "g:0\ni:4\nbuy:"),
        ];
        foreach (var (lhs, prefix) in cases)
            Assert.Equal(prefix, Prefix.Literal(lhs));
    }

    [Fact]
    public void AtoiMatchesGo()
    {
        Assert.True(Limits.TryAtoi("0", out var zero, out _));
        Assert.Equal(0, zero);
        Assert.True(Limits.TryAtoi("-2", out var negative, out _));
        Assert.Equal(-2, negative);
        Assert.False(Limits.TryAtoi("+1", out _, out var plus));
        Assert.Equal("strconv.Atoi: parsing \"+1\": invalid syntax", plus);
        Assert.False(Limits.TryAtoi("nope", out _, out var nope));
        Assert.Equal("strconv.Atoi: parsing \"nope\": invalid syntax", nope);
        Assert.True(Limits.TryParse("unlimited", out var cleared, out _));
        Assert.Null(cleared);
    }

    [Fact]
    public void HelloRewriteQuiesces()
    {
        var code = Drive("^hello$ ::= world\n::=\n", "hello");
        Assert.Equal(0, code);
        Assert.Equal("world", LastState);
    }

    [Fact]
    public void DecimalSumIsAReducedFraction()
    {
        const string source = "^(?<a>-?(?:[0-9]+|[0-9]+\\.[0-9]+|[0-9]+/[0-9]+))\\+(?<b>-?(?:[0-9]+|[0-9]+\\.[0-9]+|[0-9]+/[0-9]+))$ ::! add a b\n::=\n";
        var code = Drive(source, "0.1+0.2");
        Assert.Equal(0, code);
        Assert.Equal("3/10", LastState);
    }

    [Fact]
    public void NegativeZeroIsZero()
    {
        const string source = "^(?<a>-0\\.0)$ ::! num a\n::=\n";
        var code = Drive(source, "-0.0");
        Assert.Equal(0, code);
        Assert.Equal("<num>0</num>", LastState);
    }

    [Fact]
    public void LeadingZerosReduce()
    {
        const string source = "^(?<a>-?(?:[0-9]+|[0-9]+\\.[0-9]+|[0-9]+/[0-9]+))\\+(?<b>-?(?:[0-9]+|[0-9]+\\.[0-9]+|[0-9]+/[0-9]+))$ ::! add a b\n::=\n";
        var code = Drive(source, "0002/0004+1/2");
        Assert.Equal(0, code);
        Assert.Equal("1", LastState);
    }

    [Fact]
    public void StateLimitTraceAndMessage()
    {
        using var interp = new Interpreter();
        interp.MaxSteps = 1;
        interp.MaxEvals = 100;
        interp.MaxStateBytes = 100;
        interp.TraceEnabled = true;
        interp.LoadProgramText("state-limit.thue", "^a$ ::= bb\n::=\n");
        interp.ApplyInputOverride("a");
        interp.MaxStateBytes = 1;
        var err = Assert.Throws<LimitException>(() => interp.Run());
        Assert.Equal(12, err.Code);
        Assert.Equal(LimitKind.State, err.Kind);
        Assert.Equal("a", interp.State);
        Assert.Equal(0, interp.AppliedSteps);
        Assert.Equal(
            "{\"step\":1,\"ruleIndex\":0,\"lineNumber\":1,\"operator\":\"::=\",\"matchStart\":0,\"matchEnd\":1,\"error\":\"State size (2 bytes) exceeds maximum (1 bytes)\",\"stateBefore\":\"a\",\"replacement\":\"bb\",\"stateAfter\":\"a\",\"exitCode\":null}\n",
            Interpreter.FormatTrace(interp.Trace));
    }

    [Fact]
    public void UnicodeStateLimitEscapesLineSeparators()
    {
        using var interp = new Interpreter();
        interp.MaxSteps = 5;
        interp.MaxEvals = 20;
        interp.MaxStateBytes = 4;
        interp.TraceEnabled = true;
        interp.LoadProgramText("unicode-state-limit.thue", "^(?<s>.+)$ ::= {{s}}Z\n::=\nplaceholder\n");
        interp.ApplyInputOverride("é\u2028");
        var err = Assert.Throws<LimitException>(() => interp.Run());
        Assert.Equal(12, err.Code);
        Assert.Equal("é\u2028", interp.State);
        Assert.Equal(
            "{\"step\":1,\"ruleIndex\":0,\"lineNumber\":1,\"operator\":\"::=\",\"matchStart\":0,\"matchEnd\":5,\"error\":\"State size (6 bytes) exceeds maximum (4 bytes)\",\"stateBefore\":\"é\\u2028\",\"replacement\":\"é\\u2028Z\",\"stateAfter\":\"é\\u2028\",\"exitCode\":null}\n",
            Interpreter.FormatTrace(interp.Trace));
    }

    [Fact]
    public void UnicodeRuleFailureEscapesLineSeparators()
    {
        using var interp = new Interpreter();
        interp.MaxSteps = 5;
        interp.MaxEvals = 20;
        interp.MaxStateBytes = 100;
        interp.TraceEnabled = true;
        interp.LoadProgramText("unicode-rule-failure.thue", "^in:(?<s>.+)$ ::= {{s|pctdec}}\n::=\nplaceholder\n");
        interp.ApplyInputOverride("in:x\u2028\u2029éy");
        var err = Assert.Throws<ThueException>(() => interp.Run());
        Assert.Equal("PCT payload contains unencoded unsafe byte", err.Message);
        Assert.Equal("in:x\u2028\u2029éy", interp.State);
        Assert.Equal(
            "{\"step\":1,\"ruleIndex\":0,\"lineNumber\":1,\"operator\":\"::=\",\"matchStart\":0,\"matchEnd\":13,\"error\":\"PCT payload contains unencoded unsafe byte\",\"stateBefore\":\"in:x\\u2028\\u2029éy\",\"replacement\":\"\",\"stateAfter\":\"in:x\\u2028\\u2029éy\",\"exitCode\":null}\n",
            Interpreter.FormatTrace(interp.Trace));
    }

    [Fact]
    public void ZeroStepsApplyNothing()
    {
        using var interp = new Interpreter();
        interp.MaxSteps = 0;
        interp.MaxEvals = 10;
        interp.MaxStateBytes = 100;
        interp.LoadProgramText("t.thue", "^a$ ::= b\n::=\n");
        interp.ApplyInputOverride("a");
        var err = Assert.Throws<LimitException>(() => interp.Run());
        Assert.Equal(10, err.Code);
        Assert.Equal("Applied step limit (0) exceeded", err.Message);
        Assert.Empty(interp.Trace);
    }

    static string LastState = "";

    static int Drive(string source, string input)
    {
        using var interp = new Interpreter();
        interp.MaxSteps = 1000;
        interp.MaxEvals = 10_000;
        interp.MaxStateBytes = 1_000_000;
        interp.LoadProgramText("t.thue", source);
        interp.ApplyInputOverride(input);
        var code = interp.Run();
        LastState = interp.State;
        return code;
    }
}
