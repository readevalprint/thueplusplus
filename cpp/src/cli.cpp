#include "thue/thue.hpp"

#include <cerrno>
#include <csignal>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <optional>
#include <string>

namespace {

void Usage() {
  std::cerr << "usage: thue <program> [--proc:<name> <command>]... [--input <state>] [options]\n";
}

bool IsFlag(const std::string& arg, const std::string& name) { return arg == name || arg.rfind(name + "=", 0) == 0; }

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
    return thue::kExitUsage;
  }
  thue::Interpreter interp;
  const std::string program = argv[1];
  std::optional<std::string> input;
  std::string coverage;
  std::string counts;
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
        std::exit(thue::kExitRuntime);
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
      } else if (IsFlag(arg, "--input")) {
        input = need("--input");
        saw_input = true;
      } else if (IsFlag(arg, "--max-evals")) {
        interp.set_max_evals(thue::ParseLimit(need("--max-evals")));
      } else if (IsFlag(arg, "--max-state-bytes")) {
        interp.set_max_state_bytes(thue::ParseLimit(need("--max-state-bytes")));
      } else if (IsFlag(arg, "--max-steps")) {
        interp.set_max_steps(thue::ParseLimit(need("--max-steps")));
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
      return thue::kExitUsage;
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
      ran = true;
      code = interp.Run();
    }
  } catch (const thue::LimitError& err) {
    error = err.what();
    code = err.code();
  } catch (const std::exception& err) {
    error = err.what();
    code = thue::kExitRuntime;
  }

  std::cerr << thue::FormatTrace(interp.trace());
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
  try {
    interp.WriteRuleCoverage();
  } catch (const std::exception& err) {
    std::cerr << "Error: failed to write rule coverage: " << err.what() << "\n";
    code = 1;
  }
  interp.Cleanup();
  return code;
}
