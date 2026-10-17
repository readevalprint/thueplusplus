#include "thuelang/thuelang.hpp"

#include <cctype>
#include <cerrno>
#include <cstdio>
#include <csignal>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

namespace {

void Usage() {
  std::cerr << "usage: thue <program> [--proc:<name> <command>]... [--input <state>] [options]\n";
}

bool IsFlag(const std::string& arg, const std::string& name) { return arg == name || arg.rfind(name + "=", 0) == 0; }

void WriteMetrics(const std::string& path, const thuelang::RunMetrics& metrics) {
  namespace fs = std::filesystem;
  fs::path target(path);
  if (target.has_parent_path()) {
    fs::create_directories(target.parent_path());
  }
  std::ofstream out(target, std::ios::binary);
  if (!out) {
    throw std::runtime_error(std::strerror(errno));
  }
  std::string body = "{\"cost\":" + std::to_string(metrics.cost) +
                     ",\"applied_steps\":" + std::to_string(metrics.applied_steps) +
                     ",\"regex_evals\":" + std::to_string(metrics.regex_evals) +
                     ",\"regex_matches\":" + std::to_string(metrics.regex_matches) +
                     ",\"state_bytes\":" + std::to_string(metrics.state_bytes) +
                     ",\"state_peak\":" + std::to_string(metrics.state_peak) +
                     ",\"rule_count\":" + std::to_string(metrics.rule_count) +
                     ",\"rule_chars\":" + std::to_string(metrics.rule_chars) + "}\n";
  out.write(body.data(), static_cast<std::streamsize>(body.size()));
  if (!out) {
    throw std::runtime_error(std::strerror(errno));
  }
}

void WriteCounts(const std::string& path, int64_t applied, int64_t probes) {
  namespace fs = std::filesystem;
  fs::path target(path);
  if (target.has_parent_path()) {
    fs::create_directories(target.parent_path());
  }
  std::ofstream out(target, std::ios::binary);
  if (!out) {
    throw std::runtime_error(std::strerror(errno));
  }
  std::string body = "{\"applied_steps\":" + std::to_string(applied) + ",\"probes\":" + std::to_string(probes) + "}\n";
  out.write(body.data(), static_cast<std::streamsize>(body.size()));
  if (!out) {
    throw std::runtime_error(std::strerror(errno));
  }
}

struct ResourceFile {
  std::map<std::string, std::vector<std::string>> reads;
  std::vector<std::string> writes;
};

class ResourceJson {
 public:
  explicit ResourceJson(std::string text) : text_(std::move(text)) {}

  ResourceFile Parse() {
    ResourceFile file;
    Expect('{');
    bool saw_reads = false;
    bool saw_writes = false;
    Skip();
    if (Peek() == '}') {
      throw std::runtime_error("resources file keys must be reads and writes");
    }
    while (true) {
      std::string key = ParseString();
      Expect(':');
      if (key == "reads") {
        if (saw_reads) {
          throw std::runtime_error("resources file keys must be reads and writes");
        }
        saw_reads = true;
        file.reads = ParseReads();
      } else if (key == "writes") {
        if (saw_writes) {
          throw std::runtime_error("resources file keys must be reads and writes");
        }
        saw_writes = true;
        file.writes = ParseStringArray();
      } else {
        throw std::runtime_error("resources file keys must be reads and writes");
      }
      Skip();
      if (Peek() == ',') {
        ++index_;
        continue;
      }
      if (Peek() == '}') {
        ++index_;
        break;
      }
      throw std::runtime_error("resources file is not JSON");
    }
    Skip();
    if (index_ != text_.size()) {
      throw std::runtime_error("resources file has an extra JSON value");
    }
    if (!saw_reads || !saw_writes) {
      throw std::runtime_error("resources file keys must be reads and writes");
    }
    return file;
  }

 private:
  void Skip() {
    while (index_ < text_.size() && std::isspace(static_cast<unsigned char>(text_[index_]))) {
      ++index_;
    }
  }

  char Peek() {
    Skip();
    if (index_ >= text_.size()) {
      throw std::runtime_error("resources file is not JSON");
    }
    return text_[index_];
  }

  void Expect(char want) {
    if (Peek() != want) {
      throw std::runtime_error("resources file is not JSON");
    }
    ++index_;
  }

  std::string ParseString() {
    Expect('"');
    std::string out;
    while (index_ < text_.size()) {
      unsigned char ch = static_cast<unsigned char>(text_[index_++]);
      if (ch == '"') {
        return out;
      }
      if (ch == '\\') {
        if (index_ >= text_.size()) {
          throw std::runtime_error("resources file is not JSON");
        }
        char esc = text_[index_++];
        switch (esc) {
          case '"':
          case '\\':
          case '/':
            out.push_back(esc);
            break;
          case 'b':
            out.push_back('\b');
            break;
          case 'f':
            out.push_back('\f');
            break;
          case 'n':
            out.push_back('\n');
            break;
          case 'r':
            out.push_back('\r');
            break;
          case 't':
            out.push_back('\t');
            break;
          case 'u': {
            if (index_ + 4 > text_.size()) {
              throw std::runtime_error("resources file is not JSON");
            }
            int code = 0;
            for (int i = 0; i < 4; ++i) {
              char hex = text_[index_++];
              code <<= 4;
              if (hex >= '0' && hex <= '9') {
                code += hex - '0';
              } else if (hex >= 'a' && hex <= 'f') {
                code += hex - 'a' + 10;
              } else if (hex >= 'A' && hex <= 'F') {
                code += hex - 'A' + 10;
              } else {
                throw std::runtime_error("resources file is not JSON");
              }
            }
            if (code <= 0x7F) {
              out.push_back(static_cast<char>(code));
            } else if (code <= 0x7FF) {
              out.push_back(static_cast<char>(0xC0 | (code >> 6)));
              out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
            } else {
              out.push_back(static_cast<char>(0xE0 | (code >> 12)));
              out.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
              out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
            }
            break;
          }
          default:
            throw std::runtime_error("resources file is not JSON");
        }
        continue;
      }
      if (ch < 0x20) {
        throw std::runtime_error("resources file is not JSON");
      }
      out.push_back(static_cast<char>(ch));
    }
    throw std::runtime_error("resources file is not JSON");
  }

  std::vector<std::string> ParseStringArray() {
    Expect('[');
    std::vector<std::string> values;
    Skip();
    if (Peek() == ']') {
      ++index_;
      return values;
    }
    while (true) {
      values.push_back(ParseString());
      Skip();
      if (Peek() == ',') {
        ++index_;
        continue;
      }
      if (Peek() == ']') {
        ++index_;
        return values;
      }
      throw std::runtime_error("resources file is not JSON");
    }
  }

  std::map<std::string, std::vector<std::string>> ParseReads() {
    Expect('{');
    std::map<std::string, std::vector<std::string>> reads;
    Skip();
    if (Peek() == '}') {
      ++index_;
      return reads;
    }
    while (true) {
      std::string key = ParseString();
      Expect(':');
      if (!reads.emplace(key, ParseStringArray()).second) {
        throw std::runtime_error("resources file is not JSON");
      }
      Skip();
      if (Peek() == ',') {
        ++index_;
        continue;
      }
      if (Peek() == '}') {
        ++index_;
        return reads;
      }
      throw std::runtime_error("resources file is not JSON");
    }
  }

  std::string text_;
  size_t index_ = 0;
};

ResourceFile LoadResourceFile(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) {
    throw std::runtime_error(path + ": " + std::strerror(errno));
  }
  std::ostringstream buffer;
  buffer << in.rdbuf();
  try {
    return ResourceJson(buffer.str()).Parse();
  } catch (const std::runtime_error& err) {
    throw std::runtime_error(path + ": " + err.what());
  }
}

std::string JsonString(const std::string& text) {
  std::string out = "\"";
  for (unsigned char ch : text) {
    switch (ch) {
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
        if (ch < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof(buf), "\\u%04x", ch);
          out += buf;
        } else {
          out.push_back(static_cast<char>(ch));
        }
    }
  }
  out.push_back('"');
  return out;
}

void WriteResourceOutput(const std::string& path, const std::map<std::string, std::string>& writes) {
  namespace fs = std::filesystem;
  fs::path target(path);
  if (target.has_parent_path()) {
    fs::create_directories(target.parent_path());
  }
  std::ofstream out(target, std::ios::binary);
  if (!out) {
    throw std::runtime_error(std::strerror(errno));
  }
  std::string body = "{\n";
  bool first = true;
  for (const auto& item : writes) {
    if (!first) {
      body += ",\n";
    }
    first = false;
    body += "  " + JsonString(item.first) + ": " + JsonString(item.second);
  }
  body += "\n}\n";
  out.write(body.data(), static_cast<std::streamsize>(body.size()));
  if (!out) {
    throw std::runtime_error(std::strerror(errno));
  }
}

std::string DisplaySource(const std::string& source_path) {
  namespace fs = std::filesystem;
  fs::path source = fs::path(source_path).lexically_normal();
  fs::path base = fs::absolute(fs::current_path()).lexically_normal();
  fs::path rel = source.lexically_relative(base);
  if (!rel.empty()) {
    std::string relative = rel.generic_string();
    if (relative.rfind("..", 0) != 0 && !rel.is_absolute()) {
      return relative;
    }
  }
  return source.generic_string();
}

}  // namespace

int main(int argc, char** argv) {
  std::signal(SIGPIPE, SIG_IGN);
  if (argc < 2) {
    Usage();
    return thuelang::kExitUsage;
  }
  thuelang::Interpreter interp;
  const std::string program = argv[1];
  std::optional<std::string> input;
  std::string coverage;
  std::string counts;
  std::string metrics;
  std::string resources;
  std::string resource_out;
  bool list_rules = false;
  bool saw_input = false;

  for (int index = 2; index < argc;) {
    std::string arg = argv[index];
    auto need = [&](const std::string& name) -> std::string {
      if (arg.rfind(name + "=", 0) == 0) {
        std::string value = arg.substr(name.size() + 1);
        ++index;
        return value;
      }
      if (index + 1 >= argc) {
        std::cerr << "Error: " << name << " requires an argument\n";
        std::exit(thuelang::kExitRuntime);
      }
      std::string value = argv[index + 1];
      index += 2;
      return value;
    };
    try {
      if (arg == "--debug") {
        interp.set_debug(true);
        ++index;
      } else if (arg == "--trace") {
        interp.set_trace_enabled(true);
        ++index;
      } else if (arg == "--list-rules") {
        list_rules = true;
        ++index;
      } else if (IsFlag(arg, "--rule-coverage")) {
        coverage = need("--rule-coverage");
      } else if (IsFlag(arg, "--counts")) {
        counts = need("--counts");
      } else if (IsFlag(arg, "--metrics")) {
        metrics = need("--metrics");
      } else if (IsFlag(arg, "--resources")) {
        resources = need("--resources");
      } else if (IsFlag(arg, "--resource-out")) {
        resource_out = need("--resource-out");
      } else if (IsFlag(arg, "--input")) {
        input = need("--input");
        saw_input = true;
      } else if (IsFlag(arg, "--max-evals")) {
        interp.set_max_evals(thuelang::ParseLimit(need("--max-evals")));
      } else if (IsFlag(arg, "--max-state-bytes")) {
        interp.set_max_state_bytes(thuelang::ParseLimit(need("--max-state-bytes")));
      } else if (IsFlag(arg, "--max-steps")) {
        interp.set_max_steps(thuelang::ParseLimit(need("--max-steps")));
      } else if (arg.rfind("--proc:", 0) == 0) {
        std::string name = arg.substr(std::string("--proc:").size());
        if (index + 1 >= argc) {
          std::cerr << "Error: --proc:" << name << " requires a command argument\n";
          return 1;
        }
        interp.AddProcBinding(name, argv[index + 1]);
        index += 2;
      } else {
        std::cerr << "Error: Unknown argument: " << arg << "\n";
        return 1;
      }
    } catch (const std::invalid_argument& err) {
      std::cerr << err.what() << "\n";
      return thuelang::kExitUsage;
    }
  }
  if (!coverage.empty()) {
    interp.set_rule_coverage_path(coverage);
  }

  int code = 0;
  std::string error;
  bool ran = false;
  try {
    interp.LoadProgram(program);
    if (list_rules) {
      for (const auto& rule : interp.rules()) {
        std::cout << DisplaySource(rule.source_path) << ":" << rule.line_number << "\t" << rule.lhs << "\n";
      }
    } else {
      if (saw_input) {
        interp.ApplyInputOverride(*input);
      }
      if (!resources.empty()) {
        ResourceFile file = LoadResourceFile(resources);
        interp.BindScripts(file.reads, file.writes);
      } else if (!resource_out.empty()) {
        throw std::runtime_error("--resource-out requires --resources");
      }
      ran = true;
      code = interp.Run();
    }
  } catch (const thuelang::LimitError& err) {
    error = err.what();
    code = err.code();
  } catch (const std::exception& err) {
    error = err.what();
    code = thuelang::kExitRuntime;
  }

  std::cerr << thuelang::FormatTrace(interp.trace());
  if (!error.empty()) {
    std::cerr << "Error: " << error << "\n";
  }
  if (ran && !counts.empty()) {
    try {
      WriteCounts(counts, interp.applied_steps(), interp.eval_count());
    } catch (const std::exception& err) {
      std::cerr << "Error: failed to write counts: " << err.what() << "\n";
      code = 1;
    }
  }
  if (ran && !metrics.empty()) {
    try {
      WriteMetrics(metrics, interp.metrics());
    } catch (const std::exception& err) {
      std::cerr << "Error: failed to write metrics: " << err.what() << "\n";
      code = 1;
    }
  }
  if (ran && !resource_out.empty()) {
    try {
      WriteResourceOutput(resource_out, interp.ScriptWrites());
    } catch (const std::exception& err) {
      std::cerr << "Error: failed to write resources: " << err.what() << "\n";
      code = 1;
    }
  }
  try {
    interp.WriteRuleCoverage();
  } catch (const std::exception& err) {
    std::cerr << "Error: failed to write rule coverage: " << err.what() << "\n";
    code = 1;
  }
  interp.Cleanup();
  return code;
}
