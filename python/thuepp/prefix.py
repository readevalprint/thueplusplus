"""Literal prefix of a rule pattern, matching the Go engine.

A miss on this text cannot be a match, so the runner skips the regex and
does not count a regex eval. A hit still runs the regex. The Go function
is regexp.LiteralPrefix after stripping one leading ^ and refusing (?i.
"""

from __future__ import annotations

CONT = "cont"
STOP = "stop"
BLOCK = "block"
FLAGS = "flags"
CAP = "cap"
_INF = -1
_MAX_REPEAT = 100_000


class _Bad(Exception):
    pass


class _Flags:
    def __init__(self, multiline: bool = False, fold: bool = False) -> None:
        self.multiline = multiline
        self.fold = fold

    def copy(self) -> _Flags:
        return _Flags(self.multiline, self.fold)


def literal_prefix(lhs: str) -> str:
    """Return the literal text that begins every match. Empty means no skip."""
    if "(?i" in lhs:
        return ""
    body = lhs[1:] if lhs.startswith("^") else lhs
    try:
        one_pass = _one_pass(body)
        text, _status, index = _sequence(
            body, 0, _Flags(), at_start=True, stop_paren=False, one_pass=one_pass
        )
    except _Bad:
        return ""
    if index != len(body):
        return ""
    return text


def _one_pass(body: str) -> bool:
    """Go uses onePassPrefix only for an anchored, unambiguous program."""
    try:
        if not _leading_begin_text(body):
            return False
        if _alt_present(body) and not _end_anchored(body):
            return False
        if _swallows_next(body):
            return False
    except _Bad:
        return False
    return True


def _swallows_next(body: str) -> bool:
    """A dot-all repeat before another atom can consume that atom, so this is not one-pass."""
    for token in ("[\\s\\S]*", "[\\s\\S]+", "[\\S\\s]*", "[\\S\\s]+", "[\\s\\S]?", "[\\S\\s]?"):
        start = 0
        while True:
            found = body.find(token, start)
            if found < 0:
                break
            cursor = found + len(token)
            if cursor < len(body) and body[cursor] == "?":
                cursor += 1
            while cursor < len(body) and body[cursor] == ")":
                cursor += 1
            if cursor < len(body) and not body.startswith("\\z", cursor) and body[cursor] != "$":
                return True
            start = found + len(token)
    return False


def _leading_begin_text(body: str) -> bool:
    index = 0
    multiline = False
    while index < len(body):
        if body.startswith("(?P<", index) or body.startswith("(?<", index):
            return False
        if body.startswith("(?:", index):
            index += 3
            continue
        if body.startswith("(?", index):
            index += 2
            sign = 1
            saw = False
            while index < len(body) and body[index] not in ":)":
                char = body[index]
                index += 1
                if char == "-":
                    sign = -1
                    saw = False
                    continue
                if char == "m":
                    multiline = sign > 0
                saw = True
            if index >= len(body):
                return False
            if body[index] == ":":
                index += 1
                continue
            index += 1
            continue
        if body[index] == "(":
            return False
        if body.startswith("\\A", index):
            return True
        if body[index] == "^":
            return not multiline
        return False
    return False


def _end_anchored(body: str) -> bool:
    if "(?m" in body:
        return body.endswith("\\z")
    return body.endswith("\\z") or body.endswith("$")


def _alt_present(body: str) -> bool:
    index = 0
    while index < len(body):
        if body.startswith("\\Q", index):
            end = body.find("\\E", index + 2)
            index = len(body) if end < 0 else end + 2
            continue
        if body[index] == "\\":
            index += 2
            continue
        if body[index] == "[":
            index = _class_span(body, index)[0]
            continue
        if body[index] == "|":
            return True
        index += 1
    return False


def _sequence(
    pattern: str,
    index: int,
    flags: _Flags,
    *,
    at_start: bool,
    stop_paren: bool,
    one_pass: bool,
):
    branches: list[list[tuple[str, str]]] = [[]]
    while index < len(pattern):
        if stop_paren and pattern[index] == ")":
            break
        if pattern[index] == "|":
            branches.append([])
            index += 1
            at_start = True
            continue
        text, status, index, flags, at_start = _atom(pattern, index, flags, at_start, one_pass)
        if status == FLAGS:
            continue
        minimum, maximum, index = _quantifier(pattern, index)
        text, status = _apply_quantifier(text, status, minimum, maximum)
        if status == CONT and text == "":
            continue
        branches[-1].append((text, status))
        if status != CAP:
            at_start = False
    folded = [_fold(branch) for branch in branches]
    if len(folded) == 1:
        text, status = folded[0]
        return text, status, index
    text, status = _common(folded)
    return text, status, index


def _common(folded: list[tuple[str, str]]) -> tuple[str, str]:
    texts = []
    for text, status in folded:
        if status == BLOCK:
            return "", BLOCK
        texts.append(text)
    common = texts[0]
    for text in texts[1:]:
        limit = min(len(common), len(text))
        size = 0
        while size < limit and common[size] == text[size]:
            size += 1
        common = common[:size]
    if not common:
        return "", BLOCK
    if all(status == CONT and text == common for text, status in folded):
        return common, CONT
    return common, STOP


def _fold(atoms: list[tuple[str, str]]) -> tuple[str, str]:
    text = ""
    saw_cap = False
    for atom, status in atoms:
        if status == CAP:
            saw_cap = True
            continue
        if status == BLOCK:
            return text, STOP if text else BLOCK
        text += atom
        if status == STOP:
            return text, STOP
    if saw_cap and text == "":
        return "", CAP
    return text, CONT


def _atom(pattern: str, index: int, flags: _Flags, at_start: bool, one_pass: bool):
    if index >= len(pattern):
        raise _Bad("truncated pattern")
    char = pattern[index]
    if char == "^":
        if flags.multiline or not at_start or not one_pass:
            return "", BLOCK, index + 1, flags, False
        return "", CONT, index + 1, flags, True
    if char == "$":
        return "", BLOCK, index + 1, flags, False
    if char == ".":
        return "", BLOCK, index + 1, flags, False
    if char[0] == "[":
        end, rune = _class_span(pattern, index)
        if rune is None or flags.fold:
            return "", BLOCK, end, flags, False
        return rune, CONT, end, flags, False
    if char == "(":
        return _group(pattern, index, flags, at_start, one_pass)
    if char == "\\":
        return _escape(pattern, index, flags, at_start, one_pass)
    if char in "*+?)|":
        raise _Bad("bare operator")
    if flags.fold:
        return "", BLOCK, index + 1, flags, False
    return char, CONT, index + 1, flags, False


def _group(pattern: str, index: int, flags: _Flags, at_start: bool, one_pass: bool):
    capturing = True
    if pattern[index : index + 2] == "(?":
        named = _named_capture(pattern, index)
        if named is None:
            return _perl_group(pattern, index, flags, at_start, one_pass)
        index = named
    else:
        index += 1
    text, status, index = _sequence(
        pattern, index, flags, at_start=at_start, stop_paren=True, one_pass=one_pass
    )
    if index >= len(pattern) or pattern[index] != ")":
        raise _Bad("unclosed group")
    index += 1
    if one_pass and capturing:
        return "", BLOCK, index, flags, False
    if capturing and status == CONT and text == "":
        return "", CAP, index, flags, at_start
    still_start = at_start and status == CONT and text == ""
    return text, status, index, flags, still_start


def _named_capture(pattern: str, index: int) -> int | None:
    if pattern.startswith("(?P<", index):
        start = index + 4
    elif pattern.startswith("(?<", index):
        start = index + 3
    else:
        return None
    end = pattern.find(">", start)
    if end < 0 or end == start:
        raise _Bad("bad capture name")
    name = pattern[start:end]
    if any(char != "_" and not char.isalnum() for char in name):
        raise _Bad("bad capture name")
    return end + 1


def _perl_group(pattern: str, index: int, flags: _Flags, at_start: bool, one_pass: bool):
    cursor = index + 2
    sign = 1
    saw = False
    updated = flags.copy()
    while cursor < len(pattern):
        char = pattern[cursor]
        if char in ":)":
            if sign < 0 and not saw:
                raise _Bad("bad flags")
            cursor += 1
            if char == ")":
                return "", FLAGS, cursor, updated, at_start
            text, status, cursor = _sequence(
                pattern, cursor, updated, at_start=at_start, stop_paren=True, one_pass=one_pass
            )
            if cursor >= len(pattern) or pattern[cursor] != ")":
                raise _Bad("unclosed group")
            still_start = at_start and status == CONT and text == ""
            return text, status, cursor + 1, flags, still_start
        if char == "-":
            if sign < 0:
                raise _Bad("bad flags")
            sign = -1
            saw = False
            cursor += 1
            continue
        if char not in "imsU":
            raise _Bad("bad flags")
        saw = True
        enabled = sign > 0
        if char == "i":
            updated.fold = enabled
        elif char == "m":
            updated.multiline = enabled
        cursor += 1
    raise _Bad("bad flags")


def _escape(pattern: str, index: int, flags: _Flags, at_start: bool, one_pass: bool):
    if index + 1 >= len(pattern):
        raise _Bad("trailing backslash")
    if pattern.startswith("\\Q", index):
        end = pattern.find("\\E", index + 2)
        literal = pattern[index + 2 :] if end < 0 else pattern[index + 2 : end]
        index = len(pattern) if end < 0 else end + 2
        if flags.fold and literal:
            return "", BLOCK, index, flags, False
        return literal, CONT, index, flags, at_start and literal == ""
    char = pattern[index + 1]
    if char == "A":
        if at_start and one_pass:
            return "", CONT, index + 2, flags, True
        return "", BLOCK, index + 2, flags, False
    if char in "zZbBdDwWsS":
        if char == "Z":
            raise _Bad("bad escape")
        return "", BLOCK, index + 2, flags, False
    literal, index = _literal_escape(pattern, index)
    if flags.fold:
        return "", BLOCK, index, flags, False
    return literal, CONT, index, flags, False


def _literal_escape(pattern: str, index: int) -> tuple[str, int]:
    if index + 1 >= len(pattern):
        raise _Bad("trailing backslash")
    rest = pattern[index + 1 :]
    char = rest[0]
    rest = rest[1:]
    if char in "01234567":
        if char != "0" and (not rest or rest[0] not in "01234567"):
            raise _Bad("bad escape")
        value = ord(char) - 48
        consumed = 1
        while consumed < 3 and rest and rest[0] in "01234567":
            value = value * 8 + ord(rest[0]) - 48
            rest = rest[1:]
            consumed += 1
        return chr(value), len(pattern) - len(rest)
    if char == "x":
        if not rest:
            raise _Bad("bad escape")
        if rest[0] == "{":
            rest = rest[1:]
            digits = ""
            while rest and rest[0] != "}":
                if rest[0] not in "0123456789abcdefABCDEF":
                    raise _Bad("bad escape")
                digits += rest[0]
                rest = rest[1:]
                if int(digits, 16) > 0x10FFFF:
                    raise _Bad("bad escape")
            if not digits or not rest or rest[0] != "}":
                raise _Bad("bad escape")
            return chr(int(digits, 16)), len(pattern) - len(rest) + 1
        if len(rest) < 2:
            raise _Bad("bad escape")
        pair = rest[:2]
        if any(item not in "0123456789abcdefABCDEF" for item in pair):
            raise _Bad("bad escape")
        return chr(int(pair, 16)), index + 4
    named = {"a": "\a", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v"}
    if char in named:
        return named[char], index + 2
    if char.isascii() and not char.isalnum():
        return char, index + 2
    if char == "_":
        return char, index + 2
    raise _Bad("bad escape")


def _class_span(pattern: str, index: int) -> tuple[int, str | None]:
    if pattern[index] != "[":
        raise _Bad("class")
    index += 1
    negated = False
    if index < len(pattern) and pattern[index] == "^":
        negated = True
        index += 1
    runes: list[str] = []
    ranged = False
    posix = False
    if index < len(pattern) and pattern[index] == "]":
        runes.append("]")
        index += 1
    while index < len(pattern) and pattern[index] != "]":
        if pattern.startswith("[:", index):
            end = pattern.find(":]", index + 2)
            if end < 0:
                raise _Bad("class")
            posix = True
            index = end + 2
            continue
        if pattern[index] == "\\":
            try:
                literal, index = _literal_escape(pattern, index)
            except _Bad:
                if index + 1 >= len(pattern):
                    raise
                index += 2
                posix = True
                continue
            runes.append(literal)
        else:
            runes.append(pattern[index])
            index += 1
        if (
            index + 1 < len(pattern)
            and pattern[index] == "-"
            and pattern[index + 1] != "]"
        ):
            ranged = True
            index += 1
    if index >= len(pattern) or pattern[index] != "]":
        raise _Bad("class")
    index += 1
    if not negated and not ranged and not posix and len(runes) == 1:
        return index, runes[0]
    return index, None


def _quantifier(pattern: str, index: int) -> tuple[int, int, int]:
    if index >= len(pattern):
        return 1, 1, index
    char = pattern[index]
    if char == "*":
        minimum, maximum, index = 0, _INF, index + 1
    elif char == "+":
        minimum, maximum, index = 1, _INF, index + 1
    elif char == "?":
        minimum, maximum, index = 0, 1, index + 1
    elif char == "{":
        parsed = _repeat(pattern, index)
        if parsed is None:
            return 1, 1, index
        minimum, maximum, index = parsed
    else:
        return 1, 1, index
    if index < len(pattern) and pattern[index] == "?":
        index += 1
    return minimum, maximum, index


def _repeat(pattern: str, index: int) -> tuple[int, int, int] | None:
    if pattern[index] != "{":
        return None
    cursor = index + 1
    minimum, cursor = _integer(pattern, cursor)
    if minimum is None or cursor >= len(pattern):
        return None
    if pattern[cursor] != ",":
        maximum = minimum
    else:
        cursor += 1
        if cursor < len(pattern) and pattern[cursor] == "}":
            maximum = _INF
        else:
            maximum, cursor = _integer(pattern, cursor)
            if maximum is None:
                return None
    if cursor >= len(pattern) or pattern[cursor] != "}":
        return None
    if minimum < 0 or (maximum >= 0 and maximum < minimum):
        raise _Bad("bad repeat")
    if minimum > _MAX_REPEAT or (maximum > _MAX_REPEAT):
        raise _Bad("bad repeat")
    return minimum, maximum, cursor + 1


def _integer(pattern: str, index: int) -> tuple[int | None, int]:
    if index >= len(pattern) or not pattern[index].isdigit():
        return None, index
    if pattern[index] == "0" and index + 1 < len(pattern) and pattern[index + 1].isdigit():
        return None, index
    value = 0
    while index < len(pattern) and pattern[index].isdigit():
        value = value * 10 + ord(pattern[index]) - 48
        if value >= 100_000_000:
            return -1, index
        index += 1
    return value, index


def _apply_quantifier(text: str, status: str, minimum: int, maximum: int) -> tuple[str, str]:
    if minimum == 1 and maximum == 1:
        return text, status
    if status == CAP:
        if minimum == maximum:
            return ("", CONT) if minimum == 0 else ("", CAP)
        return "", BLOCK
    if status == CONT and text == "":
        return "", CONT
    if minimum == 0 and maximum == 0:
        return "", CONT
    if status == CONT:
        if minimum == 0:
            return "", BLOCK
        repeated = text * minimum
        if maximum == minimum:
            return repeated, CONT
        return repeated, STOP
    if status == STOP:
        if minimum == 0:
            return "", BLOCK
        return text, STOP
    if minimum == 0 and maximum == 0:
        return "", CONT
    return "", BLOCK
