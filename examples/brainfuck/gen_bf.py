#!/usr/bin/env python3
"""Generate examples/brainfuck/brainfuck.tpp."""

from pathlib import Path

RUN = 126


def plus_minus_table() -> str:
    parts = ["T{"]
    for k in range(1, RUN + 1):
        parts.append(";" + ("+" * k) + "=" + str(k) + ";")
        parts.append(";" + ("-" * k) + "=" + str((256 - k) % 256) + ";")
    parts.append("}")
    return "".join(parts)


def hex_table() -> str:
    parts = ["G{"]
    for n in range(256):
        parts.append(f";{n}=%{n:02X};")
    parts.append("}")
    return "".join(parts)


def safe_table() -> str:
    parts = ["Z{"]
    for n in range(128):
        ch = chr(n)
        if ch.isascii() and (ch.isalnum() or ch in "_.-"):
            parts.append(f",{ch}={n},")
    parts.append("}")
    return "".join(parts)


def hexdigit_table() -> str:
    parts = ["X{"]
    for n in range(10):
        parts.append(f";{n}:{n};")
    for n, ch in enumerate("ABCDEF", 10):
        parts.append(f";{ch}:{n};")
    parts.append("}")
    return "".join(parts)


RULES = r'''
NUM <- [0-9]+
HEX <- [0-9A-F]

Q«1»L«(?<left>[^»]*)»P«»R«(?<r>[^»]*)»N«(?<nid>[^»]*)»S«(?<stk>[^»]*)»H«(?<h>[^»]*)»A«(?<a>[^»]*)»B«(?<b>[^»]*)»O«(?<o>[^»]*)»J«(?<j>[^»]*)»I«(?<i>[^»]*)»W«(?<w>[^»]*)»(?<tables>[\s\S]*?)T\{[^}]*\} ::= Q«0»L«{{left}}»P«»R«{{r}}»N«{{nid}}»S«{{stk}}»H«{{h}}»A«{{a}}»B«{{b}}»O«{{o}}»J«{{j}}»I«{{i}}»W«{{w}}»{{tables}}

Q«0»L«(?<left>[^»]*)»P«»R«\.>(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<n>$NUM)»A«(?<a>[^»]*)»B«(?<c0>$NUM),(?<rb>[^»]*)»O«(?<o>(?:%$HEX$HEX)*)» ::| ;{{n}}=(?<p>%$HEX$HEX); ::= Q«0»L«{{left}}.>»P«»R«{{post}}»N«{{nid}}»S«»H«{{c0}}»A«{{n}},{{a}}»B«{{rb}}»O«{{o}}{{p}}»

Q«0»L«(?<left>[^»]*)»P«»R«\.>(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<n>$NUM)»A«(?<a>[^»]*)»B«»O«(?<o>(?:%$HEX$HEX)*)» ::| ;{{n}}=(?<p>%$HEX$HEX); ::= Q«0»L«{{left}}.>»P«»R«{{post}}»N«{{nid}}»S«»H«0»A«{{n}},{{a}}»B«»O«{{o}}{{p}}»

Q«0»L«(?<left>[^»]*)»P«»R«\.(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<n>$NUM)»A«(?<a>[^»]*)»B«(?<b>[^»]*)»O«(?<o>(?:%$HEX$HEX)*)» ::| ;{{n}}=(?<p>%$HEX$HEX); ::= Q«0»L«{{left}}.»P«»R«{{post}}»N«{{nid}}»S«»H«{{n}}»A«{{a}}»B«{{b}}»O«{{o}}{{p}}»

Q«0»L«(?<left>[^»]*)»P«»R«\+(?<k>$NUM);(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<n>$NUM)» ::= Q«0»L«{{left}}+{{k}};»P«»R«{{post}}»N«{{nid}}»S«»H«MOD<ADD<{{n}},{{k}}>,256>»

__MOVES__

Q«0»L«(?<left>[^»]*)»P«»R«\[#(?<id>$NUM);(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<h>[1-9][0-9]*)» ::= Q«0»L«{{left}}[#{{id}};»P«»R«{{post}}»N«{{nid}}»S«»H«{{h}}»

Q«0»L«(?<left>[^»]*)»P«»R«\[#(?<id>$NUM);(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«0» ::| R«\[#{{id}};(?<mid>[^»]*)\]#{{id}};(?<after>[^»]*)»N« ::= Q«0»L«{{left}}[#{{id}};{{mid}}]#{{id}};»P«»R«{{after}}»N«{{nid}}»S«»H«0»

Q«0»L«(?<left>[^»]*)»P«»R«\]#(?<id>$NUM);(?<after>[^»]*)»N«(?<nid>$NUM)»S«»H«0» ::= Q«0»L«{{left}}]#{{id}};»P«»R«{{after}}»N«{{nid}}»S«»H«0»

Q«0»L«(?<left>[^»]*)»P«»R«\]#(?<id>$NUM);(?<after>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<h>[1-9][0-9]*)» ::| L«(?<before>[^»]*)\[#{{id}};(?<mid>[^»]*)»P«»R« ::= Q«0»L«{{before}}[#{{id}};»P«»R«{{mid}}]#{{id}};{{after}}»N«{{nid}}»S«»H«{{h}}»

Q«0»L«(?<left>[^»]*)»P«»R«,(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<h>$NUM)»A«(?<a>[^»]*)»B«(?<b>[^»]*)»O«(?<o>(?:%$HEX$HEX)*)»J«(?<byte>$NUM),(?<rest>[^»]*)»I«\.» ::= Q«0»L«{{left}},»P«»R«{{post}}»N«{{nid}}»S«»H«{{byte}}»A«{{a}}»B«{{b}}»O«{{o}}»J«{{rest}}»I«.»

ADD<(?<a>$NUM),(?<b>$NUM)> ::! add a b
MOD<(?<a>$NUM),(?<b>$NUM)> ::! mod a b
MUL<(?<a>$NUM),(?<b>$NUM)> ::! mul a b

P«(?<run>\+{1,126})(?<post>[^»]*)»R«(?<out>[^»]*)» ::| ;{{run|quote}}=(?<k>$NUM); ::= P«{{post}}»R«{{out}}+{{k}};»

P«(?<run>-{1,126})(?<post>[^»]*)»R«(?<out>[^»]*)» ::| ;{{run|quote}}=(?<k>$NUM); ::= P«{{post}}»R«{{out}}+{{k}};»

P«>{16}(?<post>[^»]*)»R«(?<out>[^»]*)» ::= P«{{post}}»R«{{out}}R16;»

P«>{8}(?<post>[^»]*)»R«(?<out>[^»]*)» ::= P«{{post}}»R«{{out}}R8;»

P«>{4}(?<post>[^»]*)»R«(?<out>[^»]*)» ::= P«{{post}}»R«{{out}}R4;»

P«>{2}(?<post>[^»]*)»R«(?<out>[^»]*)» ::= P«{{post}}»R«{{out}}R2;»

P«>(?<post>[^»]*)»R«(?<out>[^»]*)» ::= P«{{post}}»R«{{out}}>»

P«<{16}(?<post>[^»]*)»R«(?<out>[^»]*)» ::= P«{{post}}»R«{{out}}L16;»

P«<{8}(?<post>[^»]*)»R«(?<out>[^»]*)» ::= P«{{post}}»R«{{out}}L8;»

P«<{4}(?<post>[^»]*)»R«(?<out>[^»]*)» ::= P«{{post}}»R«{{out}}L4;»

P«<{2}(?<post>[^»]*)»R«(?<out>[^»]*)» ::= P«{{post}}»R«{{out}}L2;»

P«<(?<post>[^»]*)»R«(?<out>[^»]*)» ::= P«{{post}}»R«{{out}}<»

P«(?<run>\.+|,+)(?<post>[^»]*)»R«(?<out>[^»]*)» ::= P«{{post}}»R«{{out}}{{run}}»

P«\[(?<post>[^»]*)»R«(?<out>[^»]*)»N«(?<id>$NUM)»S«(?<stk>[^»]*)» ::= P«{{post}}»R«{{out}}[#{{id}};»N«ADD<{{id}},1>»S«{{id}},{{stk}}»

P«\](?<post>[^»]*)»R«(?<out>[^»]*)»N«(?<nid>$NUM)»S«(?<id>$NUM),(?<stk>[^»]*)» ::= P«{{post}}»R«{{out}}]#{{id}};»N«{{nid}}»S«{{stk}}»

P«(?<junk>[^><+\-.,\[\]»]+)(?<post>[^»]*)»R«(?<out>[^»]*)» ::= P«{{post}}»R«{{out}}»

Q«0»L«(?<left>[^»]*)»P«»R«,(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<h>$NUM)»A«(?<a>[^»]*)»B«(?<b>[^»]*)»O«(?<o>(?:%$HEX$HEX)*)»J«»I«» ::= Q«0»L«{{left}}»P«»R«,{{post}}»N«{{nid}}»S«»H«{{h}}»A«{{a}}»B«{{b}}»O«{{o}}»J«»I«R@RD@»

Q«0»L«(?<left>[^»]*)»P«»R«,(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<h>$NUM)»A«(?<a>[^»]*)»B«(?<b>[^»]*)»O«(?<o>(?:%$HEX$HEX)*)»J«»I«\.» ::= Q«0»L«{{left}}»P«»R«,{{post}}»N«{{nid}}»S«»H«{{h}}»A«{{a}}»B«{{b}}»O«{{o}}»J«»I«R@RD@»

@RD@ ::< 5 stdin

I«R(?<data>[^»]*)» ::= I«={{data}}»

J«(?<j>[^»]*)»I«=(?<ch>[A-Za-z0-9_.-])(?<rest>[^»]*)»W«» ::| ,{{ch|quote}}=(?<k>$NUM), ::= J«{{j}}{{k}},»I«={{rest}}»W«»

I«=%(?<hi>$HEX)(?<lo>$HEX)(?<rest>[^»]*)»W«» ::| ;{{hi}}:(?<hv>$NUM); ::| ;{{lo}}:(?<lv>$NUM); ::= I«={{rest}}»W«ADD<MUL<{{hv}},16>,{{lv}}>»

J«(?<j>[^»]*)»I«(?<i>[^»]*)»W«(?<n>$NUM)» ::= J«{{j}}{{n}},»I«{{i}}»W«»

J«(?<j>[^»]*)»I«=»W«» ::= J«{{j}}10,»I«.»W«»

\A@BF«Q«0»L«[^»]*»P«»R«»N«$NUM»S«»H«$NUM»A«[^»]*»B«[^»]*»O«(?<o>(?:%$HEX$HEX)*)»J«[^»]*»I«[^»]*»W«»[\s\S]*\z ::= @OUT<{{o}}>

\A@OUT<(?<v>(?:%$HEX$HEX)*)>\z ::> stdout {{v|pctdec}}

\A@BF«[\s\S]*P«»R«[^»]*»N«$NUM»S«$NUM,[^»]*»[\s\S]*\z ::= @ERR<unmatched_bracket>

\A@BF«[\s\S]*P«\][^»]*»R«[^»]*»N«$NUM»S«»[\s\S]*\z ::= @ERR<unmatched_bracket>

\A@ERR<(?<e>[A-Za-z0-9_]+)>\z ::= @E<{{e}}>@@X@

@E<(?<e>[A-Za-z0-9_]+)> ::> stderr {{e}}

\A@X@\z ::- 2

\A\z ::- 0

\A(?<c>[^@])(?<src>[^«»]*)\z ::= @BF«Q«1»L«»P«{{c}}{{src}}»R«»N«0»S«»H«0»A«»B«»O«»J«»I«»W«»__TABLES__»

\A@(?<src>[^«»]*)\z ::= @BF«Q«1»L«»P«@{{src}}»R«»N«0»S«»H«0»A«»B«»O«»J«»I«»W«»__TABLES__»

\A(?<s>[\s\S]*)\z ::= @ERR<unsupported_form>
'''


def _tpl(i: int) -> str:
    return "{{c" + str(i) + "}}"


def move_rules() -> str:
    """Move a run of < or > in chunks so a long jump is a handful of steps."""
    lines = []
    prefix = (
        'Q«0»L«(?<left>[^»]*)»P«»R«{arrows}(?<post>[^»]*)»'
        'N«(?<nid>$NUM)»S«»H«(?<h>$NUM)»'
    )
    for n in (16, 8, 4, 2):
        caps = ",".join(f"(?<c{i}>$NUM)" for i in range(n))
        if n == 1:
            new_a = "{{h}},{{a}}"
            new_b = "{{h}},{{b}}"
        else:
            passed = ",".join(_tpl(i) for i in range(n - 2, -1, -1))
            new_a = passed + ",{{h}},{{a}}"
            new_b = passed + ",{{h}},{{b}}"
        new_h = _tpl(n - 1)
        # Tokens, not raw arrows: a single '>' must not be a prefix of a chunk.
        tok_r = f"R{n};"
        tok_l = f"L{n};"
        lines.append(
            prefix.format(arrows=tok_r)
            + f'A«(?<a>[^»]*)»B«{caps},(?<rb>[^»]*)» ::= '
            + 'Q«0»L«{{left}}'
            + tok_r
            + '»P«»R«{{post}}»N«{{nid}}»S«»H«'
            + new_h
            + '»A«'
            + new_a
            + '»B«{{rb}}»'
        )
        lines.append(
            prefix.format(arrows=tok_l)
            + f'A«{caps},(?<ra>[^»]*)»B«(?<b>[^»]*)» ::= '
            + 'Q«0»L«{{left}}'
            + tok_l
            + '»P«»R«{{post}}»N«{{nid}}»S«»H«'
            + new_h
            + '»A«{{ra}}»B«'
            + new_b
            + '»'
        )
    lines.append(
        'Q«0»L«(?<left>[^»]*)»P«»R«>(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<h>$NUM)»A«(?<a>[^»]*)»B«(?<c0>$NUM),(?<rb>[^»]*)» ::= Q«0»L«{{left}}>»P«»R«{{post}}»N«{{nid}}»S«»H«{{c0}}»A«{{h}},{{a}}»B«{{rb}}»'
    )
    lines.append(
        'Q«0»L«(?<left>[^»]*)»P«»R«<(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<h>$NUM)»A«(?<c0>$NUM),(?<ra>[^»]*)»B«(?<b>[^»]*)» ::= Q«0»L«{{left}}<»P«»R«{{post}}»N«{{nid}}»S«»H«{{c0}}»A«{{ra}}»B«{{h}},{{b}}»'
    )
    lines.append(
        'Q«0»L«(?<left>[^»]*)»P«»R«>(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<h>$NUM)»A«(?<a>[^»]*)»B«» ::= Q«0»L«{{left}}>»P«»R«{{post}}»N«{{nid}}»S«»H«0»A«{{h}},{{a}}»B«»'
    )
    lines.append(
        'Q«0»L«(?<left>[^»]*)»P«»R«<(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<h>$NUM)»A«»B«(?<b>[^»]*)» ::= Q«0»L«{{left}}<»P«»R«{{post}}»N«{{nid}}»S«»H«0»A«»B«{{h}},{{b}}»'
    )
    # Chunk token didn't fit on the tape: split it. Tried only after the real moves.
    for n, left, right in ((16, "L8;L8;", "R8;R8;"), (8, "L4;L4;", "R4;R4;"), (4, "L2;L2;", "R2;R2;"), (2, "<<", ">>")):
        lines.append(
            'Q«0»L«(?<left>[^»]*)»P«»R«R'
            + str(n)
            + ';(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<h>$NUM)» ::= Q«0»L«{{left}}»P«»R«'
            + right
            + '{{post}}»N«{{nid}}»S«»H«{{h}}»'
        )
        lines.append(
            'Q«0»L«(?<left>[^»]*)»P«»R«L'
            + str(n)
            + ';(?<post>[^»]*)»N«(?<nid>$NUM)»S«»H«(?<h>$NUM)» ::= Q«0»L«{{left}}»P«»R«'
            + left
            + '{{post}}»N«{{nid}}»S«»H«{{h}}»'
        )
    return "\n\n".join(lines)


def main() -> None:
    # G is first so '.' finds ;n=%HH; without scanning the plus-run table.
    tables = hex_table() + safe_table() + hexdigit_table() + plus_minus_table()
    text = RULES.replace("__TABLES__", tables).replace("__MOVES__", move_rules())
    # Drop the leading newline so the file starts at the first alias.
    text = text.strip() + "\n"
    dest = Path(__file__).resolve().parent / "brainfuck.tpp"
    dest.write_text(text, encoding="utf-8")
    print(f"wrote {dest} bytes={dest.stat().st_size} lines={text.count(chr(10))+1}")


if __name__ == "__main__":
    main()
