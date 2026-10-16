#include "thuepp/thuepp.hpp"

#include "rational.hpp"

#include <re2/re2.h>

#include <algorithm>
#include <cctype>
#include <cerrno>
#include <climits>
#include <cmath>
#include <cstdio>
#include <chrono>
#include <condition_variable>
#include <cstring>
#include <deque>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <map>
#include <mutex>
#include <set>
#include <sstream>
#include <thread>
#include <utility>

#include <fcntl.h>
#include <signal.h>
#include <sys/wait.h>
#include <unistd.h>

namespace thuepp {
namespace {

constexpr int kMaxNumericLiteralChars = 4096;
constexpr int kMaxAliasSubstitutions = 10000;
constexpr int kMaxExpandedPatternBytes = 1000000;
constexpr int kMaxLineBytes = 10 * 1024 * 1024;

const char* kNumericGrammar =
    "-?(?:[0-9]+|[0-9]+\\.[0-9]+|[0-9]+/[0-9]+)";

enum class Op { kSub, kRead, kWrite, kExit, kBuiltin };

const char* OpText(Op op) {
  switch (op) {
    case Op::kSub:
      return "::=";
    case Op::kRead:
      return "::<";
    case Op::kWrite:
      return "::>";
    case Op::kExit:
      return "::-";
    case Op::kBuiltin:
      return "::!";
  }
  return "";
}

struct Rule {
  std::string lhs;
  std::unique_ptr<RE2> pattern;
  std::vector<std::string> mids;
  Op op = Op::kSub;
  std::string rhs;
  int line_number = 0;
  std::string source_path;
  std::string builtin_name;
  std::vector<std::string> builtin_args;
};

struct Match {
  int start = 0;
  int end = 0;
  std::map<std::string, std::string> groups;
};

struct SourceRow {
  std::string text;
  std::string source_path;
  int source_line = 0;
};

class ResourceFailure : public std::runtime_error {
 public:
  ResourceFailure(std::string message, bool omit_name)
      : std::runtime_error(std::move(message)), omit_name(omit_name) {}
  bool omit_name = false;
};

class ReadTimeout : public std::runtime_error {
 public:
  ReadTimeout() : std::runtime_error("timeout") {}
};

std::string FormatResourceError(const std::string& name, const std::exception& err) {
  if (const auto* failure = dynamic_cast<const ResourceFailure*>(&err)) {
    if (failure->omit_name) {
      return "ERR:resource:" + std::string(failure->what());
    }
  }
  return "ERR:resource:" + name + ":" + err.what();
}

bool IsAsciiWord(unsigned char ch) {
  return ch == '_' || (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

bool IsWord(const std::string& text) {
  if (text.empty()) {
    return false;
  }
  for (unsigned char ch : text) {
    if (!IsAsciiWord(ch)) {
      return false;
    }
  }
  return true;
}

bool IsName(const std::string& text) {
  if (text.empty() || (text[0] >= '0' && text[0] <= '9') || !IsWord(text)) {
    return false;
  }
  return true;
}

bool IsGoSpace(uint32_t rune) {
  switch (rune) {
    case '\t':
    case '\n':
    case '\v':
    case '\f':
    case '\r':
    case ' ':
    case 0x85:
    case 0xA0:
    case 0x1680:
    case 0x2028:
    case 0x2029:
    case 0x202F:
    case 0x205F:
    case 0x3000:
      return true;
    default:
      return rune >= 0x2000 && rune <= 0x200A;
  }
}

bool DecodeUtf8(const std::string& text, size_t index, uint32_t& rune, size_t& length) {
  if (index >= text.size()) {
    return false;
  }
  auto byte = static_cast<unsigned char>(text[index]);
  if (byte < 0x80) {
    rune = byte;
    length = 1;
    return true;
  }
  if ((byte & 0xE0) == 0xC0 && index + 1 < text.size()) {
    rune = ((byte & 0x1F) << 6) | (static_cast<unsigned char>(text[index + 1]) & 0x3F);
    length = 2;
    return rune >= 0x80;
  }
  if ((byte & 0xF0) == 0xE0 && index + 2 < text.size()) {
    rune = ((byte & 0x0F) << 12) | ((static_cast<unsigned char>(text[index + 1]) & 0x3F) << 6) |
           (static_cast<unsigned char>(text[index + 2]) & 0x3F);
    length = 3;
    return rune >= 0x800;
  }
  if ((byte & 0xF8) == 0xF0 && index + 3 < text.size()) {
    rune = ((byte & 0x07) << 18) | ((static_cast<unsigned char>(text[index + 1]) & 0x3F) << 12) |
           ((static_cast<unsigned char>(text[index + 2]) & 0x3F) << 6) |
           (static_cast<unsigned char>(text[index + 3]) & 0x3F);
    length = 4;
    return rune >= 0x10000 && rune <= 0x10FFFF;
  }
  return false;
}

std::string TrimSpace(const std::string& text) {
  size_t begin = 0;
  while (begin < text.size()) {
    uint32_t rune = 0;
    size_t length = 0;
    if (!DecodeUtf8(text, begin, rune, length) || !IsGoSpace(rune)) {
      break;
    }
    begin += length;
  }
  size_t end = text.size();
  while (end > begin) {
    size_t at = end - 1;
    while (at > begin && (static_cast<unsigned char>(text[at]) & 0xC0) == 0x80) {
      --at;
    }
    uint32_t rune = 0;
    size_t length = 0;
    if (!DecodeUtf8(text, at, rune, length) || length != end - at || !IsGoSpace(rune)) {
      break;
    }
    end = at;
  }
  return text.substr(begin, end - begin);
}

std::string TrimRightSpaceTab(std::string text) {
  while (!text.empty() && (text.back() == ' ' || text.back() == '\t')) {
    text.pop_back();
  }
  return text;
}

std::string TrimLeftSpaceTab(std::string text) {
  size_t index = 0;
  while (index < text.size() && (text[index] == ' ' || text[index] == '\t')) {
    ++index;
  }
  return text.substr(index);
}

std::string TrimSpaceTab(std::string text) { return TrimLeftSpaceTab(TrimRightSpaceTab(std::move(text))); }

std::vector<std::string> Fields(const std::string& text) {
  std::vector<std::string> out;
  size_t index = 0;
  while (index < text.size()) {
    uint32_t rune = 0;
    size_t length = 0;
    if (!DecodeUtf8(text, index, rune, length)) {
      length = 1;
      rune = static_cast<unsigned char>(text[index]);
    }
    if (IsGoSpace(rune)) {
      index += length;
      continue;
    }
    size_t start = index;
    index += length;
    while (index < text.size()) {
      if (!DecodeUtf8(text, index, rune, length)) {
        length = 1;
        rune = static_cast<unsigned char>(text[index]);
      }
      if (IsGoSpace(rune)) {
        break;
      }
      index += length;
    }
    out.push_back(text.substr(start, index - start));
  }
  return out;
}

bool Utf8Valid(const std::string& text) {
  size_t index = 0;
  while (index < text.size()) {
    uint32_t rune = 0;
    size_t length = 0;
    if (!DecodeUtf8(text, index, rune, length)) {
      return false;
    }
    index += length;
  }
  return true;
}

std::string QuoteMeta(const std::string& value) {
  static const std::string kMeta = "\\.+*?()|[]{}^$";
  std::string out;
  out.reserve(value.size());
  for (char ch : value) {
    if (kMeta.find(ch) != std::string::npos) {
      out.push_back('\\');
    }
    out.push_back(ch);
  }
  return out;
}

std::string PctEncode(const std::string& value) {
  static const std::string kHex = "0123456789ABCDEF";
  std::string out;
  for (unsigned char byte : value) {
    if ((byte >= 'A' && byte <= 'Z') || (byte >= 'a' && byte <= 'z') || (byte >= '0' && byte <= '9') ||
        byte == '_' || byte == '.' || byte == '-') {
      out.push_back(static_cast<char>(byte));
    } else {
      out.push_back('%');
      out.push_back(kHex[byte >> 4]);
      out.push_back(kHex[byte & 0x0F]);
    }
  }
  return out;
}

std::string PctDecode(const std::string& value) {
  std::string data;
  for (size_t pos = 0; pos < value.size();) {
    unsigned char ch = value[pos];
    if (ch == '%') {
      if (pos + 2 >= value.size()) {
        throw std::runtime_error("PCT payload has incomplete percent escape");
      }
      auto hex = [](unsigned char c) {
        if (c >= '0' && c <= '9') {
          return c - '0';
        }
        if (c >= 'A' && c <= 'F') {
          return c - 'A' + 10;
        }
        return -1;
      };
      int hi = hex(value[pos + 1]);
      int lo = hex(value[pos + 2]);
      if (hi < 0 || lo < 0) {
        throw std::runtime_error("PCT payload has malformed or non-canonical percent escape");
      }
      data.push_back(static_cast<char>((hi << 4) | lo));
      pos += 3;
    } else {
      if (!((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_' ||
            ch == '.' || ch == '-')) {
        throw std::runtime_error("PCT payload contains unencoded unsafe byte");
      }
      data.push_back(static_cast<char>(ch));
      ++pos;
    }
  }
  if (!Utf8Valid(data)) {
    throw std::runtime_error("PCT payload decoded bytes are not valid UTF-8");
  }
  return data;
}

std::string EscapePct(const std::string& value) {
  std::string text = PctDecode(value);
  std::string out;
  size_t index = 0;
  while (index < text.size()) {
    uint32_t rune = 0;
    size_t length = 0;
    if (!DecodeUtf8(text, index, rune, length)) {
      break;
    }
    switch (rune) {
      case '\\':
        out += "\\\\";
        break;
      case '"':
        out += "\\\"";
        break;
      case '\n':
        out += "\\n";
        break;
      case '\t':
        out += "\\t";
        break;
      case '\r':
        out += "\\r";
        break;
      case '\b':
        out += "\\b";
        break;
      case '\f':
        out += "\\f";
        break;
      default:
        out.append(text, index, length);
        break;
    }
    index += length;
  }
  return PctEncode(out);
}

std::string UnescapePct(const std::string& value) {
  std::string text = PctDecode(value);
  std::string out;
  for (size_t pos = 0; pos < text.size(); ++pos) {
    char ch = text[pos];
    if (ch != '\\') {
      out.push_back(ch);
      continue;
    }
    if (pos + 1 >= text.size()) {
      throw std::runtime_error("Builtin 'unescape' has trailing backslash escape");
    }
    ++pos;
    switch (text[pos]) {
      case '\\':
        out.push_back('\\');
        break;
      case '"':
        out.push_back('"');
        break;
      case 'n':
        out.push_back('\n');
        break;
      case 't':
        out.push_back('\t');
        break;
      case 'r':
        out.push_back('\r');
        break;
      case 'b':
        out.push_back('\b');
        break;
      case 'f':
        out.push_back('\f');
        break;
      default:
        throw std::runtime_error(std::string("Builtin 'unescape' unsupported escape '\\") + text[pos] + "'");
    }
  }
  return PctEncode(out);
}

int B64Value(unsigned char ch) {
  if (ch >= 'A' && ch <= 'Z') {
    return ch - 'A';
  }
  if (ch >= 'a' && ch <= 'z') {
    return ch - 'a' + 26;
  }
  if (ch >= '0' && ch <= '9') {
    return ch - '0' + 52;
  }
  if (ch == '-') {
    return 62;
  }
  if (ch == '_') {
    return 63;
  }
  return -1;
}

std::string B64Encode(const std::string& value) {
  static const char* kAlpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  std::string out;
  const auto* data = reinterpret_cast<const unsigned char*>(value.data());
  size_t len = value.size();
  size_t i = 0;
  while (i + 3 <= len) {
    uint32_t n = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    out.push_back(kAlpha[(n >> 18) & 63]);
    out.push_back(kAlpha[(n >> 12) & 63]);
    out.push_back(kAlpha[(n >> 6) & 63]);
    out.push_back(kAlpha[n & 63]);
    i += 3;
  }
  if (i < len) {
    uint32_t n = data[i] << 16;
    if (i + 1 < len) {
      n |= data[i + 1] << 8;
    }
    out.push_back(kAlpha[(n >> 18) & 63]);
    out.push_back(kAlpha[(n >> 12) & 63]);
    if (i + 1 < len) {
      out.push_back(kAlpha[(n >> 6) & 63]);
    }
  }
  return out;
}

std::string B64Decode(const std::string& value) {
  if (value.find('=') != std::string::npos) {
    throw std::runtime_error("Builtin 'b64dec' expected unpadded Base64url input");
  }
  for (unsigned char ch : value) {
    if (B64Value(ch) < 0) {
      throw std::runtime_error("Builtin 'b64dec' expected Base64url input");
    }
  }
  if (value.size() % 4 == 1) {
    throw std::runtime_error("Builtin 'b64dec' invalid Base64url length");
  }
  std::string out;
  size_t si = 0;
  while (si < value.size()) {
    int dlen = 4;
    int dbuf[4] = {0, 0, 0, 0};
    for (int j = 0; j < 4; ++j) {
      if (si == value.size()) {
        if (j == 1) {
          throw std::runtime_error("Builtin 'b64dec' invalid Base64url input: illegal base64 data at input byte " +
                                    std::to_string(si - j));
        }
        dlen = j;
        break;
      }
      int decoded = B64Value(static_cast<unsigned char>(value[si]));
      ++si;
      if (decoded < 0) {
        throw std::runtime_error("Builtin 'b64dec' invalid Base64url input: illegal base64 data at input byte " +
                                  std::to_string(si - 1));
      }
      dbuf[j] = decoded;
    }
    uint32_t val = (dbuf[0] << 18) | (dbuf[1] << 12) | (dbuf[2] << 6) | dbuf[3];
    unsigned char b0 = (val >> 16) & 0xFF;
    unsigned char b1 = (val >> 8) & 0xFF;
    unsigned char b2 = val & 0xFF;
    if (dlen == 4) {
      out.push_back(static_cast<char>(b0));
      out.push_back(static_cast<char>(b1));
      out.push_back(static_cast<char>(b2));
    } else if (dlen == 3) {
      if (b2 != 0) {
        throw std::runtime_error("Builtin 'b64dec' invalid Base64url input: illegal base64 data at input byte " +
                                  std::to_string(si - 1));
      }
      out.push_back(static_cast<char>(b0));
      out.push_back(static_cast<char>(b1));
    } else if (dlen == 2) {
      if (b1 != 0 || b2 != 0) {
        throw std::runtime_error("Builtin 'b64dec' invalid Base64url input: illegal base64 data at input byte " +
                                  std::to_string(si - 2));
      }
      out.push_back(static_cast<char>(b0));
    }
  }
  if (!Utf8Valid(out)) {
    throw std::runtime_error("Builtin 'b64dec' decoded bytes are not valid UTF-8");
  }
  if (B64Encode(out) != value) {
    throw std::runtime_error("Builtin 'b64dec' expected canonical unpadded Base64url input");
  }
  return out;
}

rat::Rational ParseNumber(const std::string& value, const std::string& builtin) {
  static const RE2 kNumeric("(?:" + std::string(kNumericGrammar) + ")", RE2::Quiet);
  static const RE2 kZeroDen("^-?[0-9]+/0+$", RE2::Quiet);
  if (!RE2::FullMatch(value, kNumeric)) {
    throw std::runtime_error("Builtin '" + builtin + "' expected numeric input, got '" + value + "'");
  }
  if (static_cast<int>(value.size()) > kMaxNumericLiteralChars) {
    throw std::runtime_error("Builtin '" + builtin + "' numeric input exceeds maximum length (" +
                              std::to_string(kMaxNumericLiteralChars) + " characters)");
  }
  if (RE2::FullMatch(value, kZeroDen)) {
    throw std::runtime_error("Builtin '" + builtin + "' fraction denominator must be non-zero");
  }
  return rat::ParseCanonical(value);
}

std::string FormatRat(const rat::Rational& value) { return value.Canonical(); }

int BuiltinArity(const std::string& name) {
  static const std::map<std::string, int> kArities = {
      {"eq", 2},     {"add", 2},    {"sub", 2},     {"mul", 2},    {"div", 2},   {"mod", 2},
      {"numeq", 2},  {"lt", 2},     {"le", 2},      {"gt", 2},     {"ge", 2},    {"num", 1},
      {"b64enc", 1}, {"b64dec", 1}, {"pctenc", 1},  {"pctdec", 1}, {"escape", 1}, {"unescape", 1},
  };
  auto found = kArities.find(name);
  return found == kArities.end() ? -1 : found->second;
}

int CmpRat(const rat::Rational& a, const rat::Rational& b) {
  return a.num.Mul(b.den).Cmp(b.num.Mul(a.den));
}

std::string EvalBuiltin(const std::string& name, const std::vector<std::string>& values) {
  if (name == "eq") {
    return values[0] == values[1] ? "1" : "0";
  }
  if (name == "b64enc") {
    return B64Encode(values[0]);
  }
  if (name == "b64dec") {
    return B64Decode(values[0]);
  }
  if (name == "pctenc") {
    return PctEncode(values[0]);
  }
  if (name == "pctdec") {
    return PctDecode(values[0]);
  }
  if (name == "escape") {
    return EscapePct(values[0]);
  }
  if (name == "unescape") {
    return UnescapePct(values[0]);
  }
  if (name == "num") {
    return "<num>" + FormatRat(ParseNumber(values[0], name)) + "</num>";
  }
  rat::Rational a = ParseNumber(values[0], name);
  rat::Rational b = ParseNumber(values[1], name);
  if (name == "add") {
    return FormatRat(rat::Add(a, b));
  }
  if (name == "sub") {
    return FormatRat(rat::Sub(a, b));
  }
  if (name == "mul") {
    return FormatRat(rat::Mul(a, b));
  }
  if (name == "div") {
    if (b.Sign() == 0) {
      throw std::runtime_error("Builtin 'div' division by zero");
    }
    return FormatRat(rat::Div(a, b));
  }
  if (name == "mod") {
    if (b.Sign() == 0) {
      throw std::runtime_error("Builtin 'mod' modulo by zero");
    }
    if (!a.IsInt() || !b.IsInt()) {
      throw std::runtime_error("Builtin 'mod' expected integer inputs");
    }
    if (a.Sign() < 0 || b.Sign() < 0) {
      throw std::runtime_error("Builtin 'mod' expected non-negative integer inputs");
    }
    return a.num.Abs().Mod(b.num.Abs()).Decimal();
  }
  int cmp = CmpRat(a, b);
  if (name == "numeq") {
    return cmp == 0 ? "1" : "0";
  }
  if (name == "lt") {
    return cmp < 0 ? "1" : "0";
  }
  if (name == "le") {
    return cmp <= 0 ? "1" : "0";
  }
  if (name == "gt") {
    return cmp > 0 ? "1" : "0";
  }
  if (name == "ge") {
    return cmp >= 0 ? "1" : "0";
  }
  throw std::runtime_error("internal error: validated builtin '" + name + "' has no evaluator");
}

std::string DecodeReplacementEscapes(std::string text) {
  const std::string placeholder = std::string("\x00", 1) + "BACKSLASH" + std::string("\x00", 1);
  auto replace_all = [](std::string& value, const std::string& from, const std::string& to) {
    size_t pos = 0;
    while ((pos = value.find(from, pos)) != std::string::npos) {
      value.replace(pos, from.size(), to);
      pos += to.size();
    }
  };
  replace_all(text, "\\\\", placeholder);
  replace_all(text, "\\n", "\n");
  replace_all(text, "\\t", "\t");
  replace_all(text, "\\r", "\r");
  replace_all(text, placeholder, "\\");
  return text;
}

std::string ExpandTemplate(const std::string& templ, const std::map<std::string, std::string>& groups,
                           const std::map<std::string, std::string>& extra) {
  std::map<std::string, std::string> raw = groups;
  for (const auto& item : extra) {
    raw[item.first] = item.second;
  }
  std::map<std::string, std::string> vars;
  for (const auto& item : raw) {
    std::string doubled;
    for (char ch : item.second) {
      if (ch == '\\') {
        doubled.push_back('\\');
      }
      doubled.push_back(ch);
    }
    vars.emplace(item.first, std::move(doubled));
  }
  std::string out;
  size_t pos = 0;
  while (pos < templ.size()) {
    if (templ.compare(pos, 2, "{{") == 0) {
      size_t end = templ.find("}}", pos + 2);
      if (end != std::string::npos) {
        std::string inside = templ.substr(pos + 2, end - (pos + 2));
        if (inside.find('|') != std::string::npos) {
          auto bar = inside.find('|');
          std::string name = inside.substr(0, bar);
          std::string filt = inside.substr(bar + 1);
          if (filt.find('|') != std::string::npos || !IsName(name) || !IsName(filt)) {
            throw std::runtime_error("Malformed template filter '{{" + inside + "}}'");
          }
          auto found = raw.find(name);
          if (found == raw.end()) {
            throw std::runtime_error("Missing template capture '" + name + "'");
          }
          if (filt == "pctenc") {
            out += PctEncode(found->second);
          } else if (filt == "pctdec") {
            out += PctDecode(found->second);
          } else {
            throw std::runtime_error("Unknown template filter '" + filt + "'");
          }
          pos = end + 2;
          continue;
        }
        if (IsWord(inside)) {
          auto found = vars.find(inside);
          if (found != vars.end()) {
            out += found->second;
          }
          pos = end + 2;
          continue;
        }
      }
    }
    if (templ.compare(pos, 2, "{{") == 0) {
      out.push_back(templ[pos]);
      ++pos;
      continue;
    }
    size_t literal = pos;
    while (pos < templ.size() && templ.compare(pos, 2, "{{") != 0) {
      ++pos;
    }
    out += DecodeReplacementEscapes(templ.substr(literal, pos - literal));
  }
  return out;
}

std::string RenderMidFilter(const std::string& name, const std::string& value) {
  if (name == "pctenc") {
    return PctEncode(value);
  }
  if (name == "pctdec") {
    return PctDecode(value);
  }
  if (name == "quote") {
    return QuoteMeta(value);
  }
  throw std::runtime_error("Unknown template filter '" + name + "'");
}

std::string ExpandMidFilters(const std::string& inside, const std::map<std::string, std::string>& groups) {
  std::vector<std::string> parts;
  size_t start = 0;
  for (size_t i = 0; i <= inside.size(); ++i) {
    if (i == inside.size() || inside[i] == '|') {
      parts.push_back(inside.substr(start, i - start));
      start = i + 1;
    }
  }
  if (parts.size() < 2 || !IsName(parts[0])) {
    throw std::runtime_error("Malformed template filter '{{" + inside + "}}'");
  }
  for (size_t i = 1; i < parts.size(); ++i) {
    if (!IsName(parts[i])) {
      throw std::runtime_error("Malformed template filter '{{" + inside + "}}'");
    }
  }
  auto found = groups.find(parts[0]);
  if (found == groups.end()) {
    throw std::runtime_error("Missing template capture '" + parts[0] + "'");
  }
  std::string value = found->second;
  for (size_t i = 1; i < parts.size(); ++i) {
    value = RenderMidFilter(parts[i], value);
  }
  return value;
}

std::string ExpandMidPattern(const std::string& pattern, const std::map<std::string, std::string>& groups) {
  std::string out;
  size_t pos = 0;
  while (pos < pattern.size()) {
    if (pattern.compare(pos, 2, "{{") == 0) {
      size_t end = pattern.find("}}", pos + 2);
      if (end != std::string::npos) {
        std::string inside = pattern.substr(pos + 2, end - (pos + 2));
        if (inside.find('|') != std::string::npos) {
          out += ExpandMidFilters(inside, groups);
          pos = end + 2;
          continue;
        }
        if (IsName(inside)) {
          auto found = groups.find(inside);
          if (found != groups.end()) {
            out += found->second;
          }
          pos = end + 2;
          continue;
        }
      }
    }
    size_t next = pattern.find("{{", pos);
    if (next == std::string::npos) {
      out.append(pattern, pos, std::string::npos);
      break;
    }
    if (next == pos) {
      out.push_back(pattern[pos]);
      ++pos;
      continue;
    }
    out.append(pattern, pos, next - pos);
    pos = next;
  }
  return out;
}

std::string TranslateNamedCaptures(const std::string& pattern) {
  std::string out;
  for (size_t i = 0; i < pattern.size();) {
    if (pattern.compare(i, 3, "(?<") == 0) {
      size_t end = pattern.find('>', i + 3);
      if (end != std::string::npos && end > i + 3) {
        out += "(?P<";
        out.append(pattern, i + 3, end - (i + 3));
        out.push_back('>');
        i = end + 1;
        continue;
      }
    }
    out.push_back(pattern[i]);
    ++i;
  }
  return out;
}

RE2::Options ReOptions() {
  RE2::Options options;
  options.set_log_errors(false);
  options.set_max_mem(64LL << 20);
  return options;
}

std::unique_ptr<RE2> CompilePattern(const std::string& pattern, std::string& error) {
  auto compiled = std::make_unique<RE2>("(?m)" + TranslateNamedCaptures(pattern), ReOptions());
  if (!compiled->ok()) {
    error = compiled->error();
    return nullptr;
  }
  return compiled;
}

bool FindMatch(const RE2& re, const std::string& state, Match& match) {
  int captures = re.NumberOfCapturingGroups();
  if (captures < 0) {
    return false;
  }
  std::vector<re2::StringPiece> sub(static_cast<size_t>(captures) + 1);
  if (!re.Match(state, 0, state.size(), RE2::UNANCHORED, sub.data(), static_cast<int>(sub.size()))) {
    return false;
  }
  if (sub[0].data() == nullptr) {
    return false;
  }
  match.start = static_cast<int>(sub[0].data() - state.data());
  match.end = match.start + static_cast<int>(sub[0].size());
  match.groups.clear();
  for (const auto& item : re.CapturingGroupNames()) {
    int index = item.first;
    if (index > 0 && index < static_cast<int>(sub.size()) && sub[index].data() != nullptr) {
      match.groups[item.second] = std::string(sub[index].data(), sub[index].size());
    }
  }
  return true;
}

void CollectCaptureNames(const std::string& pattern, std::set<std::string>& names) {
  for (size_t i = 0; i + 4 < pattern.size(); ++i) {
    if (pattern[i] != '(' || pattern[i + 1] != '?') {
      continue;
    }
    size_t j = i + 2;
    if (pattern[j] == 'P' && j + 1 < pattern.size() && pattern[j + 1] == '<') {
      j += 2;
    } else if (pattern[j] == '<') {
      j += 1;
    } else {
      continue;
    }
    size_t start = j;
    if (start >= pattern.size() || !((pattern[start] >= 'A' && pattern[start] <= 'Z') ||
                                      (pattern[start] >= 'a' && pattern[start] <= 'z') || pattern[start] == '_')) {
      continue;
    }
    ++j;
    while (j < pattern.size() && IsAsciiWord(static_cast<unsigned char>(pattern[j]))) {
      ++j;
    }
    if (j < pattern.size() && pattern[j] == '>') {
      names.insert(pattern.substr(start, j - start));
    }
  }
}

bool StructuralOpAt(const std::string& line, size_t index, char& op) {
  if (index + 2 >= line.size() || line[index] != ':' || line[index + 1] != ':') {
    return false;
  }
  if (index > 0 && line[index - 1] == '\\') {
    return false;
  }
  char candidate = line[index + 2];
  if (candidate == '|' || candidate == '=' || candidate == '<' || candidate == '>' || candidate == '-' ||
      candidate == '!') {
    op = candidate;
    return true;
  }
  return false;
}

bool HasTerminalOperator(const std::string& line) {
  for (size_t i = 0; i + 2 < line.size(); ++i) {
    char op = 0;
    if (StructuralOpAt(line, i, op) && op != '|') {
      return true;
    }
  }
  return false;
}

struct RuleSplit {
  std::string lhs;
  std::vector<std::string> mids;
  char op = 0;
  std::string rhs;
  bool ok = false;
};

RuleSplit SplitRuleLine(const std::string& line) {
  RuleSplit split;
  bool saw_mid = false;
  for (size_t i = 0; i + 2 < line.size();) {
    char op = 0;
    if (!StructuralOpAt(line, i, op)) {
      ++i;
      continue;
    }
    if (op == '|') {
      if (!saw_mid) {
        split.lhs = line.substr(0, i);
        saw_mid = true;
      }
      size_t next = i + 3;
      char next_op = 0;
      bool found = false;
      for (; next + 2 < line.size(); ++next) {
        if (StructuralOpAt(line, next, next_op)) {
          found = true;
          break;
        }
      }
      if (!found) {
        throw std::runtime_error("::| requires a terminal operator");
      }
      split.mids.push_back(line.substr(i + 3, next - (i + 3)));
      if (next_op == '|') {
        i = next;
        continue;
      }
      split.op = next_op;
      split.rhs = line.substr(next + 3);
      split.ok = true;
      return split;
    }
    if (!saw_mid) {
      split.lhs = line.substr(0, i);
    }
    split.op = op;
    split.rhs = line.substr(i + 3);
    split.ok = true;
    return split;
  }
  if (saw_mid) {
    throw std::runtime_error("::| requires a terminal operator");
  }
  return split;
}

bool HasInvalidOperator(const std::string& line) {
  for (size_t i = 0; i + 2 < line.size(); ++i) {
    if (line[i] != ':' || line[i + 1] != ':') {
      continue;
    }
    if (i > 0 && line[i - 1] == '\\') {
      continue;
    }
    unsigned char ch = static_cast<unsigned char>(line[i + 2]);
    if (ch == ' ' || ch == '\t' || ch == '\n' || ch == '\f' || ch == '\r' || IsAsciiWord(ch) || ch == '=' ||
        ch == '<' || ch == '>' || ch == '!' || ch == '-') {
      continue;
    }
    return true;
  }
  return false;
}

std::vector<std::string> SplitAnnotated(const std::string& content) {
  std::vector<std::string> lines;
  if (content.empty()) {
    return lines;
  }
  std::string body = content;
  if (!body.empty() && body.back() == '\n') {
    body.pop_back();
  }
  size_t start = 0;
  for (size_t i = 0; i <= body.size(); ++i) {
    if (i == body.size() || body[i] == '\n') {
      lines.push_back(body.substr(start, i - start));
      start = i + 1;
    }
  }
  return lines;
}

std::string ExpandAliasRefs(const std::string& pattern, const std::map<std::string, std::string>& aliases,
                            int line_number) {
  for (size_t i = 0; i + 3 < pattern.size(); ++i) {
    if (pattern.compare(i, 2, "<|") != 0) {
      continue;
    }
    size_t j = i + 2;
    if (j >= pattern.size() || pattern[j] < 'A' || pattern[j] > 'Z') {
      continue;
    }
    size_t start = j;
    ++j;
    while (j < pattern.size() && ((pattern[j] >= 'A' && pattern[j] <= 'Z') || (pattern[j] >= '0' && pattern[j] <= '9') ||
                                  pattern[j] == '_')) {
      ++j;
    }
    if (j + 1 < pattern.size() && pattern[j] == '|' && pattern[j + 1] == '>') {
      std::string name = pattern.substr(start, j - start);
      throw std::runtime_error("Line " + std::to_string(line_number) + ": Invalid pattern alias token '<|" + name +
                                "|>'; use '$" + name + "' aliases");
    }
  }
  std::string out;
  int substitutions = 0;
  for (size_t idx = 0; idx < pattern.size();) {
    if (pattern[idx] != '$' || (idx > 0 && pattern[idx - 1] == '\\')) {
      out.push_back(pattern[idx]);
      ++idx;
      continue;
    }
    size_t end = idx + 1;
    if (end >= pattern.size() || pattern[end] < 'A' || pattern[end] > 'Z') {
      out.push_back(pattern[idx]);
      ++idx;
      continue;
    }
    ++end;
    while (end < pattern.size()) {
      char ch = pattern[end];
      if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_') {
        ++end;
        continue;
      }
      break;
    }
    std::string name = pattern.substr(idx + 1, end - (idx + 1));
    auto found = aliases.find(name);
    if (found == aliases.end()) {
      throw std::runtime_error("Line " + std::to_string(line_number) + ": Unknown pattern alias '$" + name + "'");
    }
    ++substitutions;
    if (substitutions > kMaxAliasSubstitutions) {
      throw std::runtime_error("Line " + std::to_string(line_number) +
                                ": Pattern alias expansion exceeded substitution limit (" +
                                std::to_string(kMaxAliasSubstitutions) + ")");
    }
    out += found->second;
    idx = end;
  }
  if (static_cast<int>(out.size()) > kMaxExpandedPatternBytes) {
    throw std::runtime_error("Line " + std::to_string(line_number) + ": Pattern alias expansion exceeded byte limit (" +
                              std::to_string(kMaxExpandedPatternBytes) + ")");
  }
  return out;
}

bool AliasLine(const std::string& line, std::string& name, std::string& pattern) {
  size_t i = 0;
  while (i < line.size() && (line[i] == ' ' || line[i] == '\t' || line[i] == '\f' || line[i] == '\v')) {
    ++i;
  }
  if (i >= line.size() || line[i] < 'A' || line[i] > 'Z') {
    return false;
  }
  size_t start = i;
  ++i;
  while (i < line.size() && ((line[i] >= 'A' && line[i] <= 'Z') || (line[i] >= '0' && line[i] <= '9') || line[i] == '_')) {
    ++i;
  }
  size_t after = i;
  while (i < line.size() && (line[i] == ' ' || line[i] == '\t' || line[i] == '\f' || line[i] == '\v')) {
    ++i;
  }
  if (i + 1 >= line.size() || line[i] != '<' || line[i + 1] != '-') {
    return false;
  }
  i += 2;
  while (i < line.size() && (line[i] == ' ' || line[i] == '\t' || line[i] == '\f' || line[i] == '\v')) {
    ++i;
  }
  name = line.substr(start, after - start);
  pattern = TrimSpace(line.substr(i));
  return true;
}

std::string ExpandPatterns(const std::string& content) {
  std::map<std::string, std::string> aliases;
  std::vector<std::string> out;
  int current_source_line = 0;
  auto lines = SplitAnnotated(content);
  for (size_t idx = 0; idx < lines.size(); ++idx) {
    const std::string& line = lines[idx];
    int line_number = static_cast<int>(idx) + 1;
    std::string stripped = TrimSpace(line);
    if (stripped.rfind("# thuepp-source: ", 0) == 0) {
      std::string marker = stripped.substr(std::string("# thuepp-source: ").size());
      auto colon = marker.rfind(':');
      if (colon != std::string::npos) {
        try {
          size_t used = 0;
          int source_line = std::stoi(marker.substr(colon + 1), &used);
          if (used == marker.size() - colon - 1) {
            current_source_line = source_line;
          }
        } catch (const std::exception&) {
        }
      }
      out.push_back(line);
      continue;
    }
    int effective = current_source_line != 0 ? current_source_line : line_number;
    if (stripped.empty()) {
      out.push_back(line);
      continue;
    }
    std::string alias_name;
    std::string alias_pattern;
    if (AliasLine(line, alias_name, alias_pattern) && !HasTerminalOperator(line)) {
      if (aliases.count(alias_name) != 0) {
        throw std::runtime_error("Line " + std::to_string(effective) + ": Duplicate pattern alias '" + alias_name + "'");
      }
      std::set<std::string> captures;
      CollectCaptureNames(alias_pattern, captures);
      if (!captures.empty()) {
        throw std::runtime_error("Line " + std::to_string(effective) + ": Pattern alias '" + alias_name +
                                  "' must not contain named captures");
      }
      aliases[alias_name] = "(?:" + ExpandAliasRefs(alias_pattern, aliases, effective) + ")";
      continue;
    }
    RuleSplit split;
    try {
      split = SplitRuleLine(line);
    } catch (const std::runtime_error& err) {
      throw std::runtime_error("Line " + std::to_string(effective) + ": " + err.what());
    }
    if (split.ok) {
      std::string rebuilt = ExpandAliasRefs(split.lhs, aliases, effective);
      for (const std::string& mid : split.mids) {
        rebuilt += "::|";
        rebuilt += ExpandAliasRefs(mid, aliases, effective);
      }
      rebuilt += "::";
      rebuilt.push_back(split.op);
      rebuilt += split.rhs;
      out.push_back(rebuilt);
      continue;
    }
    out.push_back(line);
  }
  std::string joined;
  for (size_t i = 0; i < out.size(); ++i) {
    if (i != 0) {
      joined.push_back('\n');
    }
    joined += out[i];
  }
  return joined;
}

std::unique_ptr<Rule> ParseRule(const std::string& line, int line_number, const std::string& source_path) {
  std::string trimmed = TrimSpace(line);
  if (trimmed.empty() || trimmed == "::=") {
    return nullptr;
  }
  RuleSplit split;
  try {
    split = SplitRuleLine(line);
  } catch (const std::runtime_error& err) {
    throw std::runtime_error("Line " + std::to_string(line_number) + ": " + err.what());
  }
  if (!split.ok) {
    if (HasInvalidOperator(line)) {
      throw std::runtime_error("Line " + std::to_string(line_number) + ": Invalid rule syntax: " + line);
    }
    return nullptr;
  }
  std::string lhs = TrimRightSpaceTab(split.lhs);
  std::string rhs = TrimLeftSpaceTab(split.rhs);
  if (lhs.empty()) {
    return nullptr;
  }
  auto rule = std::make_unique<Rule>();
  switch (split.op) {
    case '=':
      rule->op = Op::kSub;
      break;
    case '<':
      rule->op = Op::kRead;
      break;
    case '>':
      rule->op = Op::kWrite;
      break;
    case '-':
      rule->op = Op::kExit;
      break;
    case '!':
      rule->op = Op::kBuiltin;
      break;
    default:
      throw std::runtime_error("Line " + std::to_string(line_number) + ": Invalid rule syntax: " + line);
  }
  for (const std::string& text : split.mids) {
    std::string mid = TrimSpaceTab(text);
    if (mid.empty()) {
      throw std::runtime_error("Line " + std::to_string(line_number) + ": ::| requires a regex");
    }
    rule->mids.push_back(mid);
  }
  std::string error;
  rule->pattern = CompilePattern(lhs, error);
  if (!rule->pattern) {
    throw std::runtime_error("Line " + std::to_string(line_number) + ": Invalid regex '" + lhs + "': " + error);
  }
  rule->lhs = lhs;
  rule->rhs = rhs;
  rule->line_number = line_number;
  rule->source_path = source_path;
  if (rule->op == Op::kBuiltin) {
    std::set<std::string> names;
    for (const auto& item : rule->pattern->CapturingGroupNames()) {
      names.insert(item.second);
    }
    for (const std::string& mid : rule->mids) {
      CollectCaptureNames(mid, names);
    }
    auto tokens = Fields(rhs);
    if (tokens.empty()) {
      throw std::runtime_error("Line " + std::to_string(line_number) + ": ::! requires a builtin name");
    }
    int arity = BuiltinArity(tokens[0]);
    if (arity < 0) {
      throw std::runtime_error("Line " + std::to_string(line_number) + ": Unknown builtin '" + tokens[0] + "'");
    }
    if (static_cast<int>(tokens.size()) - 1 != arity) {
      throw std::runtime_error("Line " + std::to_string(line_number) + ": Builtin '" + tokens[0] + "' expects " +
                                std::to_string(arity) + " args, got " + std::to_string(tokens.size() - 1));
    }
    for (size_t i = 1; i < tokens.size(); ++i) {
      if (!IsName(tokens[i])) {
        throw std::runtime_error("Line " + std::to_string(line_number) + ": ::! arguments must be capture names, got '" +
                                  tokens[i] + "'");
      }
      if (names.count(tokens[i]) == 0) {
        throw std::runtime_error("Line " + std::to_string(line_number) + ": ::! argument '" + tokens[i] +
                                  "' is not a named capture");
      }
    }
    rule->builtin_name = tokens[0];
    rule->builtin_args.assign(tokens.begin() + 1, tokens.end());
  }
  return rule;
}

std::vector<std::string> FileLines(const std::string& content) {
  std::vector<std::string> lines;
  size_t start = 0;
  for (size_t i = 0; i < content.size(); ++i) {
    if (content[i] == '\n') {
      if (static_cast<int>(i - start) > kMaxLineBytes) {
        throw std::runtime_error("bufio.Scanner: token too long");
      }
      lines.push_back(content.substr(start, i - start));
      start = i + 1;
    }
  }
  if (start < content.size()) {
    if (static_cast<int>(content.size() - start) > kMaxLineBytes) {
      throw std::runtime_error("bufio.Scanner: token too long");
    }
    lines.push_back(content.substr(start));
  }
  return lines;
}

std::string Annotate(const std::string& source_path, const std::string& content) {
  std::string out;
  int line_number = 0;
  for (const std::string& line : FileLines(content)) {
    ++line_number;
    out += "# thuepp-source: " + source_path + ":" + std::to_string(line_number) + "\n";
    out += line;
    out.push_back('\n');
  }
  return out;
}

std::vector<SourceRow> IterRows(const std::string& content, const std::string& program_path) {
  std::vector<SourceRow> rows;
  std::string current_path = program_path;
  int current_line = 0;
  auto lines = SplitAnnotated(content);
  for (size_t idx = 0; idx < lines.size(); ++idx) {
    const std::string& line = lines[idx];
    std::string trimmed = TrimSpace(line);
    if (trimmed.rfind("# thuepp-source: ", 0) == 0) {
      std::string marker = trimmed.substr(std::string("# thuepp-source: ").size());
      auto colon = marker.rfind(':');
      if (colon != std::string::npos) {
        try {
          size_t used = 0;
          int source_line = std::stoi(marker.substr(colon + 1), &used);
          if (used == marker.size() - colon - 1) {
            current_path = marker.substr(0, colon);
            current_line = source_line;
          }
        } catch (const std::exception&) {
        }
      }
      continue;
    }
    SourceRow row;
    row.text = line;
    row.source_path = current_path;
    row.source_line = current_line != 0 ? current_line : static_cast<int>(idx) + 1;
    rows.push_back(std::move(row));
  }
  return rows;
}

std::string AnnotatedFromRows(const std::vector<SourceRow>& rows) {
  std::string out;
  for (size_t i = 0; i < rows.size(); ++i) {
    if (i != 0) {
      out.push_back('\n');
    }
    out += "# thuepp-source: " + rows[i].source_path + ":" + std::to_string(rows[i].source_line) + "\n";
    out += rows[i].text;
  }
  return out;
}

std::pair<std::string, bool> StripLineTerminator(const std::string& line) {
  if (line.empty() || line.back() != '\n') {
    return {"", false};
  }
  std::string body = line.substr(0, line.size() - 1);
  if (!body.empty() && body.back() == '\r') {
    body.pop_back();
  }
  return {body, true};
}

void ReadFdLines(int fd, const std::function<void(std::string)>& on_line, const std::function<void()>& on_eof) {
  std::string buffer;
  char tmp[4096];
  while (true) {
    ssize_t n = ::read(fd, tmp, sizeof tmp);
    if (n > 0) {
      buffer.append(tmp, static_cast<size_t>(n));
      size_t nl = 0;
      while ((nl = buffer.find('\n')) != std::string::npos) {
        on_line(buffer.substr(0, nl + 1));
        buffer.erase(0, nl + 1);
      }
      continue;
    }
    if (n == 0) {
      if (!buffer.empty()) {
        on_line(buffer);
      }
      on_eof();
      return;
    }
    if (errno == EINTR) {
      continue;
    }
    on_eof();
    return;
  }
}

class StdinResource {
 public:
  std::string ReadLine(std::chrono::nanoseconds timeout) {
    Start();
    auto deadline = std::chrono::steady_clock::now() + timeout;
    std::unique_lock<std::mutex> lock(state_->mu);
    while (state_->lines.empty() && !state_->eof) {
      if (state_->cv.wait_until(lock, deadline) == std::cv_status::timeout) {
        break;
      }
    }
    if (!state_->lines.empty()) {
      std::string line = std::move(state_->lines.front());
      state_->lines.pop_front();
      lock.unlock();
      auto stripped = StripLineTerminator(line);
      if (!stripped.second) {
        throw std::runtime_error("EOF before newline");
      }
      return stripped.first;
    }
    if (state_->eof) {
      throw std::runtime_error("EOF before newline");
    }
    throw ReadTimeout();
  }

  void WriteString(const std::string&) {
    throw std::runtime_error("write requires process or output stream binding");
  }

 private:
  struct State {
    std::mutex mu;
    std::condition_variable cv;
    std::deque<std::string> lines;
    bool eof = false;
  };

  void Start() {
    std::call_once(once_, [this] {
      state_ = std::make_shared<State>();
      auto state = state_;
      std::thread([state] {
        ReadFdLines(
            STDIN_FILENO,
            [state](std::string line) {
              std::lock_guard<std::mutex> lock(state->mu);
              state->lines.push_back(std::move(line));
              state->cv.notify_one();
            },
            [state] {
              std::lock_guard<std::mutex> lock(state->mu);
              state->eof = true;
              state->cv.notify_one();
            });
      }).detach();
    });
  }

  std::once_flag once_;
  std::shared_ptr<State> state_;
};

class OutputResource {
 public:
  explicit OutputResource(std::ostream& out) : out_(out) {}
  std::string ReadLine(std::chrono::nanoseconds) {
    throw ResourceFailure("cannot_read_output_stream", true);
  }
  void WriteString(const std::string& content) {
    out_.write(content.data(), static_cast<std::streamsize>(content.size()));
    out_.flush();
    if (!out_) {
      throw std::runtime_error("write failed");
    }
  }

 private:
  std::ostream& out_;
};

class ProcessResource {
 public:
  explicit ProcessResource(std::string command) : command_(std::move(command)) {}
  ~ProcessResource() { Cleanup(); }

  std::string ReadLine(std::chrono::nanoseconds timeout) {
    EnsureStarted();
    auto deadline = std::chrono::steady_clock::now() + timeout;
    std::unique_lock<std::mutex> lock(mu_);
    while (true) {
      if (!lines_.empty()) {
        std::string line = std::move(lines_.front());
        lines_.pop_front();
        lock.unlock();
        auto stripped = StripLineTerminator(line);
        if (!stripped.second) {
          throw std::runtime_error("EOF before newline");
        }
        return stripped.first;
      }
      if (stdout_eof_) {
        // Wait owns the process and the stderr copy. Decide EOF versus the
        // exit error only after both have finished, matching Go's Wait path.
        if (!exited_ || !stderr_done_) {
          cv_.wait_until(lock, deadline, [this] { return !lines_.empty() || (exited_ && stderr_done_); });
          if (!lines_.empty()) {
            continue;
          }
          if (!exited_ || !stderr_done_) {
            throw ReadTimeout();
          }
        }
        std::string exit_error = ExitError();
        if (!exit_error.empty()) {
          throw std::runtime_error(exit_error);
        }
        throw std::runtime_error("EOF before newline");
      }
      if (cv_.wait_until(lock, deadline) == std::cv_status::timeout && lines_.empty() && !stdout_eof_) {
        throw ReadTimeout();
      }
    }
  }

  void WriteString(const std::string& content) {
    EnsureStarted();
    const char* data = content.data();
    size_t left = content.size();
    while (left > 0) {
      ssize_t n = ::write(stdin_fd_, data, left);
      if (n < 0) {
        if (errno == EINTR) {
          continue;
        }
        throw std::runtime_error(std::strerror(errno));
      }
      data += n;
      left -= static_cast<size_t>(n);
    }
  }

  void Cleanup() {
    // Close the child's stdin first so a reader waiting for another line
    // sees EOF. Then kill the process group: the shell's grandchild can
    // outlive a kill of the shell alone and keep the stdout pipe open.
    if (stdin_fd_ >= 0) {
      ::close(stdin_fd_);
      stdin_fd_ = -1;
    }
    if (pid_ > 0) {
      ::kill(-pid_, SIGKILL);
      ::kill(pid_, SIGKILL);
    }
    if (waiter_.joinable()) {
      waiter_.join();
    }
    if (reader_.joinable()) {
      reader_.join();
    }
    if (err_reader_.joinable()) {
      err_reader_.join();
    }
    pid_ = -1;
  }

 private:
  std::string ExitError() {
    if (!exited_ || exit_code_ == 0) {
      return "";
    }
    std::string msg = TrimSpace(stderr_);
    if (msg.empty()) {
      msg = "process exited " + std::to_string(exit_code_);
    }
    return msg;
  }

  void EnsureStarted() {
    if (started_) {
      return;
    }
    int in_pipe[2] = {-1, -1};
    int out_pipe[2] = {-1, -1};
    int err_pipe[2] = {-1, -1};
    auto close_pair = [](int fds[2]) {
      if (fds[0] >= 0) {
        ::close(fds[0]);
      }
      if (fds[1] >= 0) {
        ::close(fds[1]);
      }
    };
    if (pipe2(in_pipe, O_CLOEXEC) != 0 || pipe2(out_pipe, O_CLOEXEC) != 0 || pipe2(err_pipe, O_CLOEXEC) != 0) {
      close_pair(in_pipe);
      close_pair(out_pipe);
      close_pair(err_pipe);
      throw std::runtime_error(std::strerror(errno));
    }
    std::string script = "stdbuf -oL " + command_;
    pid_t pid = ::fork();
    if (pid < 0) {
      close_pair(in_pipe);
      close_pair(out_pipe);
      close_pair(err_pipe);
      throw std::runtime_error(std::strerror(errno));
    }
    if (pid == 0) {
      // Own a process group so Cleanup can kill the shell and anything it starts.
      if (setpgid(0, 0) != 0) {
        _exit(127);
      }
      dup2(in_pipe[0], STDIN_FILENO);
      dup2(out_pipe[1], STDOUT_FILENO);
      dup2(err_pipe[1], STDERR_FILENO);
      execl("/bin/sh", "sh", "-c", script.c_str(), static_cast<char*>(nullptr));
      _exit(127);
    }
    setpgid(pid, pid);
    ::close(in_pipe[0]);
    ::close(out_pipe[1]);
    ::close(err_pipe[1]);
    stdin_fd_ = in_pipe[1];
    int stdout_fd = out_pipe[0];
    int stderr_fd = err_pipe[0];
    pid_ = pid;
    started_ = true;
    reader_ = std::thread([this, stdout_fd] {
      ReadFdLines(
          stdout_fd,
          [this](std::string line) {
            std::lock_guard<std::mutex> lock(mu_);
            lines_.push_back(std::move(line));
            cv_.notify_all();
          },
          [this, stdout_fd] {
            ::close(stdout_fd);
            std::lock_guard<std::mutex> lock(mu_);
            stdout_eof_ = true;
            cv_.notify_all();
          });
    });
    err_reader_ = std::thread([this, stderr_fd] {
      std::string buffer;
      char tmp[1024];
      while (true) {
        ssize_t n = ::read(stderr_fd, tmp, sizeof tmp);
        if (n > 0) {
          buffer.append(tmp, static_cast<size_t>(n));
          continue;
        }
        if (n < 0 && errno == EINTR) {
          continue;
        }
        break;
      }
      ::close(stderr_fd);
      std::lock_guard<std::mutex> lock(mu_);
      stderr_ += buffer;
      stderr_done_ = true;
      cv_.notify_all();
    });
    waiter_ = std::thread([this] {
      int status = 0;
      while (::waitpid(pid_, &status, 0) < 0) {
        if (errno != EINTR) {
          break;
        }
      }
      int code = -1;
      if (WIFEXITED(status)) {
        code = WEXITSTATUS(status);
      }
      std::lock_guard<std::mutex> lock(mu_);
      exited_ = true;
      exit_code_ = code;
      cv_.notify_all();
    });
  }

  std::string command_;
  bool started_ = false;
  pid_t pid_ = -1;
  int stdin_fd_ = -1;
  std::mutex mu_;
  std::condition_variable cv_;
  std::deque<std::string> lines_;
  bool stdout_eof_ = false;
  bool stderr_done_ = false;
  bool exited_ = false;
  int exit_code_ = 0;
  std::string stderr_;
  std::thread reader_;
  std::thread err_reader_;
  std::thread waiter_;
};

struct Binding {
  std::string name;
  std::unique_ptr<StdinResource> stdin_resource;
  std::unique_ptr<OutputResource> output;
  std::unique_ptr<ProcessResource> process;

  std::string ReadLine(std::chrono::nanoseconds timeout) {
    if (stdin_resource) {
      return stdin_resource->ReadLine(timeout);
    }
    if (output) {
      return output->ReadLine(timeout);
    }
    if (process) {
      return process->ReadLine(timeout);
    }
    throw std::runtime_error("missing host resource");
  }

  std::string Write(const std::string& content) {
    try {
      if (stdin_resource) {
        stdin_resource->WriteString(content);
      } else if (output) {
        output->WriteString(content);
      } else if (process) {
        process->WriteString(content);
      } else {
        return "ERR:resource:" + name + ":missing host resource";
      }
    } catch (const std::exception& err) {
      return FormatResourceError(name, err);
    }
    return "";
  }

  void Cleanup() {
    if (process) {
      process->Cleanup();
    }
  }
};

std::string JsonString(const std::string& text) {
  std::string out = "\"";
  for (size_t i = 0; i < text.size();) {
    unsigned char c = static_cast<unsigned char>(text[i]);
    if (c < 0x80) {
      switch (c) {
        case '"':
          out += "\\\"";
          break;
        case '\\':
          out += "\\\\";
          break;
        case '\b':
          out += "\\b";
          break;
        case '\f':
          out += "\\f";
          break;
        case '\n':
          out += "\\n";
          break;
        case '\r':
          out += "\\r";
          break;
        case '\t':
          out += "\\t";
          break;
        default:
          if (c < 0x20) {
            char buf[8];
            std::snprintf(buf, sizeof buf, "\\u%04x", c);
            out += buf;
          } else {
            out.push_back(static_cast<char>(c));
          }
      }
      ++i;
      continue;
    }
    uint32_t rune = 0;
    size_t length = 0;
    if (!DecodeUtf8(text, i, rune, length)) {
      out += "\xef\xbf\xbd";
      ++i;
      continue;
    }
    if (rune == 0x2028 || rune == 0x2029) {
      char buf[8];
      std::snprintf(buf, sizeof buf, "\\u%04x", rune);
      out += buf;
    } else {
      out.append(text, i, length);
    }
    i += length;
  }
  out.push_back('"');
  return out;
}

std::string DebugGroups(const std::map<std::string, std::string>& groups) {
  std::string out = "map[";
  bool first = true;
  for (const auto& item : groups) {
    if (!first) {
      out.push_back(' ');
    }
    first = false;
    std::string value = item.second;
    auto replace = [](std::string& text, const std::string& from, const std::string& to) {
      size_t pos = 0;
      while ((pos = text.find(from, pos)) != std::string::npos) {
        text.replace(pos, from.size(), to);
        pos += to.size();
      }
    };
    replace(value, "\n", "\\n");
    replace(value, "\r", "\\r");
    out += item.first;
    out.push_back(':');
    out += value;
  }
  out.push_back(']');
  return out;
}

std::string VisibleNewlines(std::string text) {
  std::string out;
  for (char ch : text) {
    if (ch == '\n') {
      out += "\\n";
    } else {
      out.push_back(ch);
    }
  }
  return out;
}

std::pair<std::string, std::string> SplitResource(const std::string& expanded) {
  for (size_t i = 0; i < expanded.size(); ++i) {
    if (expanded[i] == ' ' || expanded[i] == '\t') {
      return {expanded.substr(0, i), expanded.substr(i + 1)};
    }
  }
  return {expanded, ""};
}

bool ParseExitCode(const std::string& text, int& code) {
  if (text.empty()) {
    return false;
  }
  size_t index = 0;
  int sign = 1;
  if (text[0] == '+' || text[0] == '-') {
    if (text[0] == '-') {
      sign = -1;
    }
    index = 1;
  }
  if (index >= text.size()) {
    return false;
  }
  int64_t value = 0;
  for (; index < text.size(); ++index) {
    if (text[index] < '0' || text[index] > '9') {
      return false;
    }
    value = value * 10 + (text[index] - '0');
    if (value > static_cast<int64_t>(INT64_C(9223372036854775807))) {
      return false;
    }
  }
  int64_t signed_value = sign < 0 ? -value : value;
  if (signed_value > INT32_MAX || signed_value < INT32_MIN) {
    // Go's int is 64-bit on the hosts we match. Keep the full int64 and let
    // the process status truncate the same way os.Exit does.
  }
  code = static_cast<int>(signed_value);
  return true;
}

std::string AtoiError(const std::string& text, bool overflow) {
  return std::string("strconv.Atoi: parsing \"") + text + (overflow ? "\": value out of range" : "\": invalid syntax");
}

}  // namespace

const char* LimitKindName(LimitKind kind) {
  switch (kind) {
    case LimitKind::kSteps:
      return "steps";
    case LimitKind::kEvals:
      return "evals";
    case LimitKind::kState:
      return "state";
    case LimitKind::kTimeout:
      return "timeout";
  }
  return "";
}

LimitError::LimitError(LimitKind kind, int code, std::string message)
    : std::runtime_error(std::move(message)), kind_(kind), code_(code) {}

LimitKind LimitError::kind() const { return kind_; }
int LimitError::code() const { return code_; }

std::optional<int64_t> ParseLimit(const std::string& text) {
  if (text == "unlimited") {
    return std::nullopt;
  }
  if (text.empty()) {
    throw std::invalid_argument(AtoiError(text, false));
  }
  size_t index = 0;
  int sign = 1;
  if (text[0] == '+' || text[0] == '-') {
    sign = text[0] == '-' ? -1 : 1;
    index = 1;
  }
  if (index >= text.size()) {
    throw std::invalid_argument(AtoiError(text, false));
  }
  uint64_t value = 0;
  for (; index < text.size(); ++index) {
    if (text[index] < '0' || text[index] > '9') {
      throw std::invalid_argument(AtoiError(text, false));
    }
    uint64_t digit = static_cast<uint64_t>(text[index] - '0');
    if (value > (UINT64_MAX - digit) / 10) {
      throw std::invalid_argument(AtoiError(text, true));
    }
    value = value * 10 + digit;
  }
  if (sign < 0) {
    if (value > static_cast<uint64_t>(INT64_MAX) + 1) {
      throw std::invalid_argument(AtoiError(text, true));
    }
    if (value == static_cast<uint64_t>(INT64_MAX) + 1) {
      return INT64_MIN;
    }
    return -static_cast<int64_t>(value);
  }
  if (value > static_cast<uint64_t>(INT64_MAX)) {
    throw std::invalid_argument(AtoiError(text, true));
  }
  return static_cast<int64_t>(value);
}

std::string FormatTrace(const std::vector<TraceEvent>& events) {
  if (events.empty()) {
    return "";
  }
  std::string out;
  for (const TraceEvent& event : events) {
    out += "{\"step\":" + std::to_string(event.step) + ",\"ruleIndex\":" + std::to_string(event.rule_index) +
           ",\"lineNumber\":" + std::to_string(event.line_number) + ",\"operator\":" + JsonString(event.op) +
           ",\"matchStart\":" + std::to_string(event.match_start) + ",\"matchEnd\":" + std::to_string(event.match_end) +
           ",\"error\":" + JsonString(event.error) + ",\"stateBefore\":" + JsonString(event.state_before) +
           ",\"replacement\":" + JsonString(event.replacement) + ",\"stateAfter\":" + JsonString(event.state_after) +
           ",\"exitCode\":";
    if (event.exit_code) {
      out += std::to_string(*event.exit_code);
    } else {
      out += "null";
    }
    out += "}\n";
  }
  return out;
}

struct Interpreter::Impl {
  std::vector<std::unique_ptr<Rule>> rules;
  std::string state;
  std::map<std::string, std::unique_ptr<Binding>> bindings;
  std::optional<int64_t> max_evals = kDefaultMaxEvals;
  std::optional<int64_t> max_state_bytes = kDefaultMaxStateBytes;
  std::optional<int64_t> max_steps = kDefaultMaxSteps;
  int64_t eval_count = 0;
  int64_t applied_steps = 0;
  bool debug = false;
  bool trace_enabled = false;
  std::vector<TraceEvent> trace;
  std::string rule_coverage_path;
  std::map<std::string, int> rule_coverage;
  std::string program_path;
  std::ostream* stdout_stream = &std::cout;
  std::ostream* stderr_stream = &std::cerr;

  Impl() {
    auto stdin_binding = std::make_unique<Binding>();
    stdin_binding->name = "stdin";
    stdin_binding->stdin_resource = std::make_unique<StdinResource>();
    bindings["stdin"] = std::move(stdin_binding);
    auto stdout_binding = std::make_unique<Binding>();
    stdout_binding->name = "stdout";
    stdout_binding->output = std::make_unique<OutputResource>(*stdout_stream);
    bindings["stdout"] = std::move(stdout_binding);
    auto stderr_binding = std::make_unique<Binding>();
    stderr_binding->name = "stderr";
    stderr_binding->output = std::make_unique<OutputResource>(*stderr_stream);
    bindings["stderr"] = std::move(stderr_binding);
  }

  void ParseProgram(const std::string& content) {
    auto rows = IterRows(content, program_path);
    int separator = -1;
    for (size_t i = 0; i < rows.size(); ++i) {
      if (TrimSpace(rows[i].text) == "::=") {
        separator = static_cast<int>(i);
        break;
      }
    }
    std::vector<SourceRow> prefix = rows;
    std::vector<SourceRow> state_rows;
    if (separator >= 0) {
      prefix.assign(rows.begin(), rows.begin() + separator);
      state_rows.assign(rows.begin() + separator + 1, rows.end());
    }
    std::string expanded = ExpandPatterns(AnnotatedFromRows(prefix));
    rules.clear();
    std::string current_path = program_path;
    int current_line = 0;
    auto lines = SplitAnnotated(expanded);
    for (size_t idx = 0; idx < lines.size(); ++idx) {
      const std::string& line = lines[idx];
      std::string trimmed = TrimSpace(line);
      if (trimmed.rfind("# thuepp-source: ", 0) == 0) {
        std::string marker = trimmed.substr(std::string("# thuepp-source: ").size());
        auto colon = marker.rfind(':');
        if (colon != std::string::npos) {
          try {
            size_t used = 0;
            int source_line = std::stoi(marker.substr(colon + 1), &used);
            if (used == marker.size() - colon - 1) {
              current_path = marker.substr(0, colon);
              current_line = source_line;
            }
          } catch (const std::exception&) {
          }
        }
        continue;
      }
      int source_line = current_line != 0 ? current_line : static_cast<int>(idx) + 1;
      auto rule = ParseRule(line, source_line, current_path);
      if (rule) {
        rules.push_back(std::move(rule));
      }
    }
    state.clear();
    for (size_t i = 0; i < state_rows.size(); ++i) {
      if (i != 0) {
        state.push_back('\n');
      }
      state += state_rows[i].text;
    }
  }

  std::string RuleId(const Rule& rule) const {
    namespace fs = std::filesystem;
    fs::path source = fs::path(rule.source_path).lexically_normal();
    fs::path base = fs::absolute(fs::current_path()).lexically_normal();
    fs::path rel = source.lexically_relative(base);
    std::string text = source.generic_string();
    if (!rel.empty()) {
      std::string relative = rel.generic_string();
      if (relative.rfind("..", 0) != 0 && !rel.is_absolute()) {
        text = relative;
      }
    }
    return text + ":" + std::to_string(rule.line_number);
  }

  void RecordCoverage(const Rule& rule) { rule_coverage[RuleId(rule)] += 1; }

  void RecordTrace(const Rule& rule, int rule_index, const Match& match, const std::string& state_before,
                   const std::string& replacement, const std::optional<int>& exit_code, const std::string& error) {
    if (!trace_enabled) {
      return;
    }
    TraceEvent event;
    event.step = eval_count;
    event.rule_index = rule_index;
    event.source_path = rule.source_path;
    event.line_number = rule.line_number;
    event.op = OpText(rule.op);
    event.lhs = rule.lhs;
    event.match_start = match.start;
    event.match_end = match.end;
    event.groups = match.groups;
    event.state_before = state_before;
    event.replacement = replacement;
    event.state_after = state;
    event.exit_code = exit_code;
    event.error = error;
    trace.push_back(std::move(event));
  }

  void SetState(const std::string& next) {
    if (max_state_bytes && static_cast<int64_t>(next.size()) > *max_state_bytes) {
      throw LimitError(LimitKind::kState, kExitStateLimit,
                        "State size (" + std::to_string(next.size()) + " bytes) exceeds maximum (" +
                            std::to_string(*max_state_bytes) + " bytes)");
    }
    state = next;
  }

  std::pair<std::map<std::string, std::string>, bool> ApplyMids(const Rule& rule,
                                                                const std::map<std::string, std::string>& groups) {
    if (rule.mids.empty()) {
      return {groups, true};
    }
    auto out = groups;
    for (const std::string& mid : rule.mids) {
      std::string expanded;
      try {
        expanded = ExpandMidPattern(mid, out);
      } catch (const std::runtime_error& err) {
        throw std::runtime_error("Line " + std::to_string(rule.line_number) + ": " + err.what());
      }
      std::string error;
      auto compiled = CompilePattern(expanded, error);
      if (!compiled) {
        throw std::runtime_error("Line " + std::to_string(rule.line_number) + ": Invalid ::| regex '" + expanded + "'");
      }
      Match mid_match;
      if (!FindMatch(*compiled, state, mid_match)) {
        return {out, false};
      }
      for (const auto& item : mid_match.groups) {
        out[item.first] = item.second;
      }
    }
    return {out, true};
  }

  int Run() {
    applied_steps = 0;
    trace.clear();
    while (true) {
      bool applied = false;
      for (size_t rule_index = 0; rule_index < rules.size(); ++rule_index) {
        const Rule& rule = *rules[rule_index];
        if (max_evals && eval_count >= *max_evals) {
          throw LimitError(LimitKind::kEvals, kExitEvalLimit,
                            "Evaluation step limit (" + std::to_string(*max_evals) + ") exceeded");
        }
        ++eval_count;
        Match match;
        if (!FindMatch(*rule.pattern, state, match)) {
          continue;
        }
        std::string state_before = state;
        std::map<std::string, std::string> groups;
        bool mid_ok = false;
        try {
          auto mid = ApplyMids(rule, match.groups);
          groups = std::move(mid.first);
          mid_ok = mid.second;
        } catch (const std::runtime_error& err) {
          RecordTrace(rule, static_cast<int>(rule_index), match, state_before, "", std::nullopt, err.what());
          throw;
        }
        if (!mid_ok) {
          continue;
        }
        match.groups = groups;
        applied = true;
        if (debug) {
          *stderr_stream << "[" << eval_count << "] STATE: " << VisibleNewlines(state) << "\n";
          *stderr_stream << "[" << eval_count << "] RULE " << rule.line_number << " MATCHES STATE AT " << match.start
                         << ":" << match.end << ": " << rule.lhs << "\n";
          *stderr_stream << "[" << eval_count << "] GROUPS: " << DebugGroups(groups) << "\n";
        }
        if (rule.op != Op::kExit && max_steps && applied_steps >= *max_steps) {
          throw LimitError(LimitKind::kSteps, kExitStepLimit,
                            "Applied step limit (" + std::to_string(*max_steps) + ") exceeded");
        }
        std::map<std::string, std::string> magic{{"rule_index", std::to_string(rule_index)}};
        std::string repl;
        try {
          switch (rule.op) {
            case Op::kSub:
              repl = ExpandTemplate(rule.rhs, groups, magic);
              RecordCoverage(rule);
              break;
            case Op::kRead: {
              auto parts = Fields(TrimSpace(rule.rhs));
              if (parts.size() != 2) {
                throw std::runtime_error("Line " + std::to_string(rule.line_number) +
                                          ": ::< requires read_spec and literal resource");
              }
              const std::string& read_spec = parts[0];
              const std::string& resource = parts[1];
              char* end = nullptr;
              if (!read_spec.empty() && std::isspace(static_cast<unsigned char>(read_spec[0]))) {
                throw std::runtime_error("Line " + std::to_string(rule.line_number) + ": invalid read timeout '" +
                                          read_spec + "'");
              }
              errno = 0;
              double seconds = std::strtod(read_spec.c_str(), &end);
              if (end != read_spec.c_str() + read_spec.size() || !std::isfinite(seconds) || seconds <= 0) {
                throw std::runtime_error("Line " + std::to_string(rule.line_number) + ": invalid read timeout '" +
                                          read_spec + "'");
              }
              if (!IsName(resource)) {
                throw std::runtime_error("Line " + std::to_string(rule.line_number) +
                                          ": ::< resource must be a literal binding name");
              }
              auto found = bindings.find(resource);
              if (found == bindings.end()) {
                throw std::runtime_error("Unknown resource '" + resource + "'");
              }
              try {
                auto timeout = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::duration<double>(seconds));
                repl = PctEncode(found->second->ReadLine(timeout));
              } catch (const ReadTimeout& err) {
                throw LimitError(LimitKind::kTimeout, kExitReadTimeout, FormatResourceError(resource, err));
              } catch (const std::exception& err) {
                if (dynamic_cast<const LimitError*>(&err) != nullptr) {
                  throw;
                }
                throw std::runtime_error(FormatResourceError(resource, err));
              }
              RecordCoverage(rule);
              break;
            }
            case Op::kWrite: {
              std::string expanded = ExpandTemplate(rule.rhs, groups, magic);
              auto parts = SplitResource(expanded);
              auto found = bindings.find(parts.first);
              if (found == bindings.end()) {
                repl = "ERR:resource:" + parts.first;
              } else {
                repl = found->second->Write(parts.second);
              }
              if (found != bindings.end() && repl.empty()) {
                RecordCoverage(rule);
              }
              break;
            }
            case Op::kBuiltin: {
              std::vector<std::string> values;
              for (const std::string& arg : rule.builtin_args) {
                auto found = groups.find(arg);
                if (found == groups.end()) {
                  throw std::runtime_error("Line " + std::to_string(rule.line_number) + ": ::! argument '" + arg +
                                            "' was not captured");
                }
                values.push_back(found->second);
              }
              repl = EvalBuiltin(rule.builtin_name, values);
              RecordCoverage(rule);
              break;
            }
            case Op::kExit: {
              std::string code_str = TrimSpace(rule.rhs);
              if (code_str.size() >= 2 && code_str.front() == '{' && code_str.back() == '}') {
                code_str = code_str.substr(1, code_str.size() - 2);
              }
              int code = 0;
              RecordCoverage(rule);
              if (!ParseExitCode(code_str, code)) {
                RecordTrace(rule, static_cast<int>(rule_index), match, state_before, "", std::nullopt, "");
                return kExitRuntime;
              }
              RecordTrace(rule, static_cast<int>(rule_index), match, state_before, "", code, "");
              return code;
            }
          }
          SetState(state.substr(0, static_cast<size_t>(match.start)) + repl + state.substr(static_cast<size_t>(match.end)));
        } catch (const LimitError& err) {
          RecordTrace(rule, static_cast<int>(rule_index), match, state_before, repl, std::nullopt, err.what());
          throw;
        } catch (const std::runtime_error& err) {
          RecordTrace(rule, static_cast<int>(rule_index), match, state_before, repl, std::nullopt, err.what());
          throw;
        }
        RecordTrace(rule, static_cast<int>(rule_index), match, state_before, repl, std::nullopt, "");
        ++applied_steps;
        if (max_steps && applied_steps >= *max_steps) {
          throw LimitError(LimitKind::kSteps, kExitStepLimit,
                            "Applied step limit (" + std::to_string(*max_steps) + ") exceeded");
        }
        if (debug) {
          *stderr_stream << "[" << eval_count << "] RESULT: " << VisibleNewlines(state) << "\n\n";
        }
        break;
      }
      if (!applied) {
        return 0;
      }
    }
  }
};

Interpreter::Interpreter() : impl_(std::make_unique<Impl>()) {}
Interpreter::~Interpreter() = default;
Interpreter::Interpreter(Interpreter&&) noexcept = default;
Interpreter& Interpreter::operator=(Interpreter&&) noexcept = default;

void Interpreter::set_max_evals(std::optional<int64_t> limit) { impl_->max_evals = limit; }
void Interpreter::set_max_state_bytes(std::optional<int64_t> limit) { impl_->max_state_bytes = limit; }
void Interpreter::set_max_steps(std::optional<int64_t> limit) { impl_->max_steps = limit; }
void Interpreter::set_debug(bool enabled) { impl_->debug = enabled; }
void Interpreter::set_trace_enabled(bool enabled) { impl_->trace_enabled = enabled; }
void Interpreter::set_rule_coverage_path(std::string path) { impl_->rule_coverage_path = std::move(path); }

void Interpreter::AddProcBinding(const std::string& name, const std::string& command) {
  auto binding = std::make_unique<Binding>();
  binding->name = name;
  binding->process = std::make_unique<ProcessResource>(command);
  impl_->bindings[name] = std::move(binding);
}

void Interpreter::LoadProgram(const std::string& path) {
  namespace fs = std::filesystem;
  fs::path absolute = fs::absolute(path);
  impl_->program_path = absolute.string();
  std::ifstream in(absolute, std::ios::binary);
  if (!in) {
    if (!fs::exists(absolute)) {
      throw std::runtime_error("File not found: " + absolute.string());
    }
    throw std::runtime_error("open " + absolute.string() + ": " + std::strerror(errno));
  }
  std::ostringstream buffer;
  buffer << in.rdbuf();
  impl_->ParseProgram(Annotate(impl_->program_path, buffer.str()));
}

void Interpreter::LoadProgramText(const std::string& source_path, const std::string& content) {
  if (TrimSpace(source_path).empty()) {
    throw std::runtime_error("source path is required");
  }
  impl_->program_path = source_path;
  impl_->ParseProgram(Annotate(source_path, content));
}

void Interpreter::ApplyInputOverride(std::string value) { impl_->state = std::move(value); }

int Interpreter::Run() { return impl_->Run(); }
int64_t Interpreter::eval_count() const { return impl_->eval_count; }
int64_t Interpreter::applied_steps() const { return impl_->applied_steps; }
const std::string& Interpreter::state() const { return impl_->state; }
const std::vector<TraceEvent>& Interpreter::trace() const { return impl_->trace; }

std::vector<RuleInfo> Interpreter::rules() const {
  std::vector<RuleInfo> out;
  for (const auto& rule : impl_->rules) {
    RuleInfo info;
    info.lhs = rule->lhs;
    info.source_path = rule->source_path;
    info.line_number = rule->line_number;
    out.push_back(std::move(info));
  }
  return out;
}

std::string Interpreter::RuleCoverageTSV() const {
  std::string out;
  for (const auto& item : impl_->rule_coverage) {
    out += item.first;
    out.push_back('\t');
    out += std::to_string(item.second);
    out.push_back('\n');
  }
  return out;
}

void Interpreter::WriteRuleCoverage() const {
  if (impl_->rule_coverage_path.empty()) {
    return;
  }
  namespace fs = std::filesystem;
  fs::path path(impl_->rule_coverage_path);
  if (path.has_parent_path()) {
    fs::create_directories(path.parent_path());
  }
  std::ofstream out(path, std::ios::binary);
  if (!out) {
    throw std::runtime_error(std::strerror(errno));
  }
  std::string body = RuleCoverageTSV();
  out.write(body.data(), static_cast<std::streamsize>(body.size()));
  if (!out) {
    throw std::runtime_error(std::strerror(errno));
  }
}

void Interpreter::Cleanup() {
  for (auto& item : impl_->bindings) {
    item.second->Cleanup();
  }
}

}  // namespace thuepp
