#include "prefix.hpp"

#include <algorithm>
#include <cstdint>
#include <optional>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

namespace thuepp {
namespace {

enum class Status { kCont, kStop, kBlock, kFlags, kCap };

struct Bad {};

struct Flags {
  bool multiline = false;
  bool fold = false;
};

constexpr int kInf = -1;
constexpr int kMaxRepeat = 100000;

bool Decode(const std::string& text, std::u32string& out) {
  size_t index = 0;
  while (index < text.size()) {
    unsigned char lead = static_cast<unsigned char>(text[index]);
    uint32_t code = 0;
    size_t length = 0;
    if (lead < 0x80) {
      code = lead;
      length = 1;
    } else if ((lead & 0xE0) == 0xC0 && index + 1 < text.size()) {
      unsigned char next = static_cast<unsigned char>(text[index + 1]);
      if ((next & 0xC0) != 0x80) {
        return false;
      }
      code = ((lead & 0x1F) << 6) | (next & 0x3F);
      if (code < 0x80) {
        return false;
      }
      length = 2;
    } else if ((lead & 0xF0) == 0xE0 && index + 2 < text.size()) {
      unsigned char a = static_cast<unsigned char>(text[index + 1]);
      unsigned char b = static_cast<unsigned char>(text[index + 2]);
      if ((a & 0xC0) != 0x80 || (b & 0xC0) != 0x80) {
        return false;
      }
      code = ((lead & 0x0F) << 12) | ((a & 0x3F) << 6) | (b & 0x3F);
      if (code < 0x800 || (code >= 0xD800 && code <= 0xDFFF)) {
        return false;
      }
      length = 3;
    } else if ((lead & 0xF8) == 0xF0 && index + 3 < text.size()) {
      unsigned char a = static_cast<unsigned char>(text[index + 1]);
      unsigned char b = static_cast<unsigned char>(text[index + 2]);
      unsigned char c = static_cast<unsigned char>(text[index + 3]);
      if ((a & 0xC0) != 0x80 || (b & 0xC0) != 0x80 || (c & 0xC0) != 0x80) {
        return false;
      }
      code = ((lead & 0x07) << 18) | ((a & 0x3F) << 12) | ((b & 0x3F) << 6) | (c & 0x3F);
      if (code < 0x10000 || code > 0x10FFFF) {
        return false;
      }
      length = 4;
    } else {
      return false;
    }
    out.push_back(static_cast<char32_t>(code));
    index += length;
  }
  return true;
}

std::string Encode(const std::u32string& text) {
  std::string out;
  for (char32_t code : text) {
    if (code <= 0x7F) {
      out.push_back(static_cast<char>(code));
    } else if (code <= 0x7FF) {
      out.push_back(static_cast<char>(0xC0 | (code >> 6)));
      out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
    } else if (code <= 0xFFFF) {
      out.push_back(static_cast<char>(0xE0 | (code >> 12)));
      out.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
    } else {
      out.push_back(static_cast<char>(0xF0 | (code >> 18)));
      out.push_back(static_cast<char>(0x80 | ((code >> 12) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
    }
  }
  return out;
}

bool Starts(const std::u32string& pattern, size_t index, const char* text) {
  for (size_t i = 0; text[i] != '\0'; ++i) {
    if (index + i >= pattern.size() || pattern[index + i] != static_cast<char32_t>(static_cast<unsigned char>(text[i]))) {
      return false;
    }
  }
  return true;
}

std::optional<size_t> FindFrom(const std::u32string& pattern, size_t index, const char* text) {
  std::u32string needle;
  for (size_t i = 0; text[i] != '\0'; ++i) {
    needle.push_back(static_cast<char32_t>(static_cast<unsigned char>(text[i])));
  }
  if (needle.empty()) {
    return index;
  }
  if (index > pattern.size() || needle.size() > pattern.size() - index) {
    return std::nullopt;
  }
  for (size_t at = index; at + needle.size() <= pattern.size(); ++at) {
    if (pattern.compare(at, needle.size(), needle) == 0) {
      return at;
    }
  }
  return std::nullopt;
}

bool AsciiDigit(char32_t ch) { return ch >= '0' && ch <= '9'; }
bool AsciiHex(char32_t ch) {
  return AsciiDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
}
bool AsciiAlnum(char32_t ch) {
  return AsciiDigit(ch) || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}
bool IsAlnum(char32_t ch) {
  if (AsciiAlnum(ch)) {
    return true;
  }
  // The Python walker uses Unicode alphanumeric. Patterns in this repository
  // only need ASCII here; a non-ASCII letter still counts as a name character.
  return ch > 0x7F;
}

struct Piece {
  std::u32string text;
  Status status = Status::kCont;
};

std::pair<std::optional<int>, size_t> Integer(const std::u32string& pattern, size_t index) {
  if (index >= pattern.size() || !AsciiDigit(pattern[index])) {
    return {std::nullopt, index};
  }
  if (pattern[index] == '0' && index + 1 < pattern.size() && AsciiDigit(pattern[index + 1])) {
    return {std::nullopt, index};
  }
  int value = 0;
  while (index < pattern.size() && AsciiDigit(pattern[index])) {
    value = value * 10 + static_cast<int>(pattern[index] - '0');
    if (value >= 100000000) {
      return {-1, index};
    }
    ++index;
  }
  return {value, index};
}

std::pair<std::u32string, size_t> LiteralEscape(const std::u32string& pattern, size_t index) {
  if (index + 1 >= pattern.size()) {
    throw Bad();
  }
  char32_t ch = pattern[index + 1];
  size_t rest = index + 2;
  if (ch >= '0' && ch <= '7') {
    if (ch != '0' && (rest >= pattern.size() || pattern[rest] < '0' || pattern[rest] > '7')) {
      throw Bad();
    }
    uint32_t value = static_cast<uint32_t>(ch - '0');
    int consumed = 1;
    size_t cursor = rest;
    while (consumed < 3 && cursor < pattern.size() && pattern[cursor] >= '0' && pattern[cursor] <= '7') {
      value = value * 8 + static_cast<uint32_t>(pattern[cursor] - '0');
      ++cursor;
      ++consumed;
    }
    if (value > 0x10FFFF) {
      throw Bad();
    }
    return {std::u32string(1, static_cast<char32_t>(value)), cursor};
  }
  if (ch == 'x') {
    if (rest >= pattern.size()) {
      throw Bad();
    }
    if (pattern[rest] == '{') {
      size_t cursor = rest + 1;
      std::string digits;
      while (cursor < pattern.size() && pattern[cursor] != '}') {
        if (!AsciiHex(pattern[cursor])) {
          throw Bad();
        }
        digits.push_back(static_cast<char>(pattern[cursor]));
        ++cursor;
        unsigned long parsed = std::stoul(digits, nullptr, 16);
        if (parsed > 0x10FFFF) {
          throw Bad();
        }
      }
      if (digits.empty() || cursor >= pattern.size() || pattern[cursor] != '}') {
        throw Bad();
      }
      unsigned long parsed = std::stoul(digits, nullptr, 16);
      return {std::u32string(1, static_cast<char32_t>(parsed)), cursor + 1};
    }
    if (rest + 2 > pattern.size() || !AsciiHex(pattern[rest]) || !AsciiHex(pattern[rest + 1])) {
      throw Bad();
    }
    std::string pair;
    pair.push_back(static_cast<char>(pattern[rest]));
    pair.push_back(static_cast<char>(pattern[rest + 1]));
    return {std::u32string(1, static_cast<char32_t>(std::stoul(pair, nullptr, 16))), index + 4};
  }
  char32_t named = 0;
  bool found = true;
  switch (ch) {
    case 'a':
      named = 0x07;
      break;
    case 'f':
      named = 0x0c;
      break;
    case 'n':
      named = '\n';
      break;
    case 'r':
      named = '\r';
      break;
    case 't':
      named = '\t';
      break;
    case 'v':
      named = 0x0b;
      break;
    default:
      found = false;
      break;
  }
  if (found) {
    return {std::u32string(1, named), index + 2};
  }
  if (ch <= 0x7F && !AsciiAlnum(ch)) {
    return {std::u32string(1, ch), index + 2};
  }
  if (ch == '_') {
    return {std::u32string(1, ch), index + 2};
  }
  throw Bad();
}

std::pair<size_t, std::optional<char32_t>> ClassSpan(const std::u32string& pattern, size_t index) {
  if (index >= pattern.size() || pattern[index] != '[') {
    throw Bad();
  }
  ++index;
  bool negated = false;
  if (index < pattern.size() && pattern[index] == '^') {
    negated = true;
    ++index;
  }
  std::u32string runes;
  bool ranged = false;
  bool posix = false;
  if (index < pattern.size() && pattern[index] == ']') {
    runes.push_back(']');
    ++index;
  }
  while (index < pattern.size() && pattern[index] != ']') {
    if (Starts(pattern, index, "[:")) {
      auto end = FindFrom(pattern, index + 2, ":]");
      if (!end) {
        throw Bad();
      }
      posix = true;
      index = *end + 2;
      continue;
    }
    if (pattern[index] == '\\') {
      try {
        auto escaped = LiteralEscape(pattern, index);
        if (escaped.first.size() != 1) {
          posix = true;
        } else {
          runes.push_back(escaped.first[0]);
        }
        index = escaped.second;
      } catch (const Bad&) {
        if (index + 1 >= pattern.size()) {
          throw;
        }
        index += 2;
        posix = true;
        continue;
      }
    } else {
      runes.push_back(pattern[index]);
      ++index;
    }
    if (index + 1 < pattern.size() && pattern[index] == '-' && pattern[index + 1] != ']') {
      ranged = true;
      ++index;
    }
  }
  if (index >= pattern.size() || pattern[index] != ']') {
    throw Bad();
  }
  ++index;
  if (!negated && !ranged && !posix && runes.size() == 1) {
    return {index, runes[0]};
  }
  return {index, std::nullopt};
}

bool LeadingBeginText(const std::u32string& body) {
  size_t index = 0;
  bool multiline = false;
  while (index < body.size()) {
    if (Starts(body, index, "(?P<") || Starts(body, index, "(?<")) {
      return false;
    }
    if (Starts(body, index, "(?:")) {
      index += 3;
      continue;
    }
    if (Starts(body, index, "(?")) {
      index += 2;
      int sign = 1;
      bool saw = false;
      while (index < body.size() && body[index] != ':' && body[index] != ')') {
        char32_t ch = body[index++];
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
      (void)saw;
      if (index >= body.size()) {
        return false;
      }
      if (body[index] == ':') {
        ++index;
        continue;
      }
      ++index;
      continue;
    }
    if (body[index] == '(') {
      return false;
    }
    if (Starts(body, index, "\\A")) {
      return true;
    }
    if (body[index] == '^') {
      return !multiline;
    }
    return false;
  }
  return false;
}

bool EndAnchored(const std::string& body) {
  if (body.find("(?m") != std::string::npos) {
    return body.size() >= 2 && body.compare(body.size() - 2, 2, "\\z") == 0;
  }
  if (body.size() >= 2 && body.compare(body.size() - 2, 2, "\\z") == 0) {
    return true;
  }
  return !body.empty() && body.back() == '$';
}

bool AltPresent(const std::u32string& body) {
  size_t index = 0;
  while (index < body.size()) {
    if (Starts(body, index, "\\Q")) {
      auto end = FindFrom(body, index + 2, "\\E");
      index = end ? *end + 2 : body.size();
      continue;
    }
    if (body[index] == '\\') {
      index += 2;
      continue;
    }
    if (body[index] == '[') {
      index = ClassSpan(body, index).first;
      continue;
    }
    if (body[index] == '|') {
      return true;
    }
    ++index;
  }
  return false;
}

bool SwallowsNext(const std::string& body) {
  const char* tokens[] = {"[\\s\\S]*", "[\\s\\S]+", "[\\S\\s]*", "[\\S\\s]+", "[\\s\\S]?", "[\\S\\s]?"};
  for (const char* token : tokens) {
    size_t start = 0;
    const std::string needle(token);
    while (true) {
      size_t found = body.find(needle, start);
      if (found == std::string::npos) {
        break;
      }
      size_t cursor = found + needle.size();
      if (cursor < body.size() && body[cursor] == '?') {
        ++cursor;
      }
      while (cursor < body.size() && body[cursor] == ')') {
        ++cursor;
      }
      if (cursor < body.size() && body.compare(cursor, 2, "\\z") != 0 && body[cursor] != '$') {
        return true;
      }
      start = found + needle.size();
    }
  }
  return false;
}

bool OnePass(const std::u32string& chars, const std::string& body) {
  try {
    if (!LeadingBeginText(chars)) {
      return false;
    }
    if (AltPresent(chars) && !EndAnchored(body)) {
      return false;
    }
    if (SwallowsNext(body)) {
      return false;
    }
  } catch (const Bad&) {
    return false;
  }
  return true;
}

Piece ApplyQuantifier(const std::u32string& text, Status status, int minimum, int maximum) {
  if (minimum == 1 && maximum == 1) {
    return {text, status};
  }
  if (status == Status::kCap) {
    if (minimum == maximum) {
      return {std::u32string(), minimum == 0 ? Status::kCont : Status::kCap};
    }
    return {std::u32string(), Status::kBlock};
  }
  if (status == Status::kCont && text.empty()) {
    return {std::u32string(), Status::kCont};
  }
  if (minimum == 0 && maximum == 0) {
    return {std::u32string(), Status::kCont};
  }
  if (status == Status::kCont) {
    if (minimum == 0) {
      return {std::u32string(), Status::kBlock};
    }
    std::u32string repeated;
    for (int i = 0; i < minimum; ++i) {
      repeated += text;
    }
    return {repeated, maximum == minimum ? Status::kCont : Status::kStop};
  }
  if (status == Status::kStop) {
    if (minimum == 0) {
      return {std::u32string(), Status::kBlock};
    }
    return {text, Status::kStop};
  }
  return {std::u32string(), Status::kBlock};
}

std::optional<std::tuple<int, int, size_t>> Repeat(const std::u32string& pattern, size_t index);

std::tuple<int, int, size_t> Quantifier(const std::u32string& pattern, size_t index) {
  if (index >= pattern.size()) {
    return {1, 1, index};
  }
  char32_t ch = pattern[index];
  int minimum = 1;
  int maximum = 1;
  if (ch == '*') {
    minimum = 0;
    maximum = kInf;
    ++index;
  } else if (ch == '+') {
    minimum = 1;
    maximum = kInf;
    ++index;
  } else if (ch == '?') {
    minimum = 0;
    maximum = 1;
    ++index;
  } else if (ch == '{') {
    auto parsed = Repeat(pattern, index);
    if (!parsed) {
      return {1, 1, index};
    }
    return *parsed;
  } else {
    return {1, 1, index};
  }
  if (index < pattern.size() && pattern[index] == '?') {
    ++index;
  }
  return {minimum, maximum, index};
}

std::optional<std::tuple<int, int, size_t>> Repeat(const std::u32string& pattern, size_t index) {
  if (pattern[index] != '{') {
    return std::nullopt;
  }
  size_t cursor = index + 1;
  auto minimum = Integer(pattern, cursor);
  cursor = minimum.second;
  if (!minimum.first || cursor >= pattern.size()) {
    return std::nullopt;
  }
  int maximum = 0;
  if (pattern[cursor] != ',') {
    maximum = *minimum.first;
  } else {
    ++cursor;
    if (cursor < pattern.size() && pattern[cursor] == '}') {
      maximum = kInf;
    } else {
      auto parsed = Integer(pattern, cursor);
      cursor = parsed.second;
      if (!parsed.first) {
        return std::nullopt;
      }
      maximum = *parsed.first;
    }
  }
  if (cursor >= pattern.size() || pattern[cursor] != '}') {
    return std::nullopt;
  }
  int min = *minimum.first;
  if (min < 0 || (maximum >= 0 && maximum < min) || min > kMaxRepeat || maximum > kMaxRepeat) {
    throw Bad();
  }
  return std::tuple<int, int, size_t>{min, maximum, cursor + 1};
}

struct Walk {
  std::u32string text;
  Status status = Status::kCont;
  size_t index = 0;
  Flags flags;
  bool at_start = false;
};

Walk Sequence(const std::u32string& pattern, size_t index, Flags flags, bool at_start, bool stop_paren, bool one_pass);

Walk Atom(const std::u32string& pattern, size_t index, Flags flags, bool at_start, bool one_pass) {
  if (index >= pattern.size()) {
    throw Bad();
  }
  char32_t ch = pattern[index];
  if (ch == '^') {
    if (flags.multiline || !at_start || !one_pass) {
      return {std::u32string(), Status::kBlock, index + 1, flags, false};
    }
    return {std::u32string(), Status::kCont, index + 1, flags, true};
  }
  if (ch == '$' || ch == '.') {
    return {std::u32string(), Status::kBlock, index + 1, flags, false};
  }
  if (ch == '[') {
    auto span = ClassSpan(pattern, index);
    if (!span.second || flags.fold) {
      return {std::u32string(), Status::kBlock, span.first, flags, false};
    }
    return {std::u32string(1, *span.second), Status::kCont, span.first, flags, false};
  }
  if (ch == '\\') {
    if (index + 1 >= pattern.size()) {
      throw Bad();
    }
    if (Starts(pattern, index, "\\Q")) {
      auto end = FindFrom(pattern, index + 2, "\\E");
      std::u32string literal = end ? pattern.substr(index + 2, *end - (index + 2)) : pattern.substr(index + 2);
      size_t next = end ? *end + 2 : pattern.size();
      if (flags.fold && !literal.empty()) {
        return {std::u32string(), Status::kBlock, next, flags, false};
      }
      return {literal, Status::kCont, next, flags, at_start && literal.empty()};
    }
    char32_t escaped = pattern[index + 1];
    if (escaped == 'A') {
      if (at_start && one_pass) {
        return {std::u32string(), Status::kCont, index + 2, flags, true};
      }
      return {std::u32string(), Status::kBlock, index + 2, flags, false};
    }
    if (std::u32string(U"zZbBdDwWsS").find(escaped) != std::u32string::npos) {
      if (escaped == 'Z') {
        throw Bad();
      }
      return {std::u32string(), Status::kBlock, index + 2, flags, false};
    }
    auto literal = LiteralEscape(pattern, index);
    if (flags.fold) {
      return {std::u32string(), Status::kBlock, literal.second, flags, false};
    }
    return {literal.first, Status::kCont, literal.second, flags, false};
  }
  if (ch == '*' || ch == '+' || ch == '?' || ch == ')' || ch == '|') {
    throw Bad();
  }
  if (flags.fold) {
    return {std::u32string(), Status::kBlock, index + 1, flags, false};
  }
  return {std::u32string(1, ch), Status::kCont, index + 1, flags, false};
}

std::optional<size_t> NamedCapture(const std::u32string& pattern, size_t index) {
  size_t start = 0;
  if (Starts(pattern, index, "(?P<")) {
    start = index + 4;
  } else if (Starts(pattern, index, "(?<")) {
    start = index + 3;
  } else {
    return std::nullopt;
  }
  auto end = FindFrom(pattern, start, ">");
  if (!end || *end == start) {
    throw Bad();
  }
  for (size_t i = start; i < *end; ++i) {
    if (pattern[i] != '_' && !IsAlnum(pattern[i])) {
      throw Bad();
    }
  }
  return *end + 1;
}

Walk PerlGroup(const std::u32string& pattern, size_t index, Flags flags, bool at_start, bool one_pass) {
  size_t cursor = index + 2;
  int sign = 1;
  bool saw = false;
  Flags updated = flags;
  while (cursor < pattern.size()) {
    char32_t ch = pattern[cursor];
    if (ch == ':' || ch == ')') {
      if (sign < 0 && !saw) {
        throw Bad();
      }
      ++cursor;
      if (ch == ')') {
        return {std::u32string(), Status::kFlags, cursor, updated, at_start};
      }
      Walk inner = Sequence(pattern, cursor, updated, at_start, true, one_pass);
      if (inner.index >= pattern.size() || pattern[inner.index] != ')') {
        throw Bad();
      }
      bool still = at_start && inner.status == Status::kCont && inner.text.empty();
      return {inner.text, inner.status, inner.index + 1, flags, still};
    }
    if (ch == '-') {
      if (sign < 0) {
        throw Bad();
      }
      sign = -1;
      saw = false;
      ++cursor;
      continue;
    }
    if (ch != 'i' && ch != 'm' && ch != 's' && ch != 'U') {
      throw Bad();
    }
    saw = true;
    bool enabled = sign > 0;
    if (ch == 'i') {
      updated.fold = enabled;
    } else if (ch == 'm') {
      updated.multiline = enabled;
    }
    ++cursor;
  }
  throw Bad();
}

Walk Group(const std::u32string& pattern, size_t index, Flags flags, bool at_start, bool one_pass) {
  bool capturing = true;
  if (Starts(pattern, index, "(?")) {
    auto named = NamedCapture(pattern, index);
    if (!named) {
      return PerlGroup(pattern, index, flags, at_start, one_pass);
    }
    index = *named;
  } else {
    ++index;
  }
  Walk inner = Sequence(pattern, index, flags, at_start, true, one_pass);
  if (inner.index >= pattern.size() || pattern[inner.index] != ')') {
    throw Bad();
  }
  size_t next = inner.index + 1;
  if (one_pass && capturing) {
    return {std::u32string(), Status::kBlock, next, flags, false};
  }
  if (capturing && inner.status == Status::kCont && inner.text.empty()) {
    return {std::u32string(), Status::kCap, next, flags, at_start};
  }
  bool still = at_start && inner.status == Status::kCont && inner.text.empty();
  return {inner.text, inner.status, next, flags, still};
}

Walk AtomFull(const std::u32string& pattern, size_t index, Flags flags, bool at_start, bool one_pass) {
  if (index < pattern.size() && pattern[index] == '(') {
    return Group(pattern, index, flags, at_start, one_pass);
  }
  return Atom(pattern, index, flags, at_start, one_pass);
}

Piece Fold(const std::vector<Piece>& atoms) {
  std::u32string text;
  bool saw_cap = false;
  for (const Piece& atom : atoms) {
    if (atom.status == Status::kCap) {
      saw_cap = true;
      continue;
    }
    if (atom.status == Status::kBlock) {
      return {text, text.empty() ? Status::kBlock : Status::kStop};
    }
    text += atom.text;
    if (atom.status == Status::kStop) {
      return {text, Status::kStop};
    }
  }
  if (saw_cap && text.empty()) {
    return {std::u32string(), Status::kCap};
  }
  return {text, Status::kCont};
}

Piece Common(const std::vector<Piece>& folded) {
  std::vector<std::u32string> texts;
  for (const Piece& piece : folded) {
    if (piece.status == Status::kBlock) {
      return {std::u32string(), Status::kBlock};
    }
    texts.push_back(piece.text);
  }
  std::u32string shared = texts[0];
  for (size_t i = 1; i < texts.size(); ++i) {
    size_t limit = std::min(shared.size(), texts[i].size());
    size_t size = 0;
    while (size < limit && shared[size] == texts[i][size]) {
      ++size;
    }
    shared.resize(size);
  }
  if (shared.empty()) {
    return {std::u32string(), Status::kBlock};
  }
  bool exact = true;
  for (const Piece& piece : folded) {
    if (piece.status != Status::kCont || piece.text != shared) {
      exact = false;
      break;
    }
  }
  return {shared, exact ? Status::kCont : Status::kStop};
}

Walk Sequence(const std::u32string& pattern, size_t index, Flags flags, bool at_start, bool stop_paren, bool one_pass) {
  std::vector<std::vector<Piece>> branches(1);
  while (index < pattern.size()) {
    if (stop_paren && pattern[index] == ')') {
      break;
    }
    if (pattern[index] == '|') {
      branches.emplace_back();
      ++index;
      at_start = true;
      continue;
    }
    Walk atom = AtomFull(pattern, index, flags, at_start, one_pass);
    index = atom.index;
    flags = atom.flags;
    at_start = atom.at_start;
    if (atom.status == Status::kFlags) {
      continue;
    }
    auto quant = Quantifier(pattern, index);
    index = std::get<2>(quant);
    Piece applied = ApplyQuantifier(atom.text, atom.status, std::get<0>(quant), std::get<1>(quant));
    if (applied.status == Status::kCont && applied.text.empty()) {
      continue;
    }
    branches.back().push_back(applied);
    if (applied.status != Status::kCap) {
      at_start = false;
    }
  }
  std::vector<Piece> folded;
  for (const auto& branch : branches) {
    folded.push_back(Fold(branch));
  }
  if (folded.size() == 1) {
    return {folded[0].text, folded[0].status, index, flags, at_start};
  }
  Piece shared = Common(folded);
  return {shared.text, shared.status, index, flags, at_start};
}

}  // namespace

std::string LiteralPrefix(const std::string& lhs) {
  if (lhs.find("(?i") != std::string::npos) {
    return "";
  }
  std::string body = (!lhs.empty() && lhs[0] == '^') ? lhs.substr(1) : lhs;
  std::u32string chars;
  if (!Decode(body, chars)) {
    return "";
  }
  try {
    bool one_pass = OnePass(chars, body);
    Walk walked = Sequence(chars, 0, Flags{}, true, false, one_pass);
    if (walked.index != chars.size()) {
      return "";
    }
    return Encode(walked.text);
  } catch (const Bad&) {
    return "";
  }
}

}  // namespace thuepp
