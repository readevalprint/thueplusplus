// Thue++ embedder API. Spec version v0.5.
//
// A new Interpreter binds only stdin, stdout, and stderr. Guest rules cannot
// open files, sockets, or processes. AddProcBinding is the process opt-in.
// Limits default to 1000000 probes, 1000000 applied rewrites, and 8388608
// bytes of state. nullopt clears a limit. 0 is a real limit.

#ifndef THUELANG_THUELANG_HPP_
#define THUELANG_THUELANG_HPP_

#include <cstdint>
#include <map>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

namespace thuelang {

inline constexpr int64_t kDefaultMaxEvals = 1000000;
inline constexpr int64_t kDefaultMaxStateBytes = 8 * 1024 * 1024;
inline constexpr int64_t kDefaultMaxSteps = 1000000;

inline constexpr int kExitRuntime = 1;
inline constexpr int kExitUsage = 2;
inline constexpr int kExitStepLimit = 10;
inline constexpr int kExitEvalLimit = 11;
inline constexpr int kExitStateLimit = 12;
inline constexpr int kExitReadTimeout = 13;

enum class LimitKind { kSteps, kEvals, kState, kTimeout };

const char* LimitKindName(LimitKind kind);

// A resource-limit stop. what() is the message without the CLI "Error: " prefix.
// kind is steps, evals, state, or timeout. code is 10, 11, 12, or 13.
class LimitError : public std::runtime_error {
 public:
  LimitError(LimitKind kind, int code, std::string message);
  LimitKind kind() const;
  int code() const;

 private:
  LimitKind kind_;
  int code_;
};

struct TraceEvent {
  int64_t step = 0;
  int rule_index = 0;
  std::string source_path;
  int line_number = 0;
  std::string op;
  std::string lhs;
  int match_start = 0;
  int match_end = 0;
  std::map<std::string, std::string> groups;
  std::string state_before;
  std::string replacement;
  std::string state_after;
  std::optional<int> exit_code;
  std::string error;
};

struct RuleInfo {
  std::string lhs;
  std::string source_path;
  int line_number = 0;
};

// Counters for one run. The same fields as `thue --metrics`.
struct RunMetrics {
  int64_t cost = 0;
  int64_t applied_steps = 0;
  int64_t regex_evals = 0;
  int64_t regex_matches = 0;
  int64_t state_bytes = 0;
  int64_t state_peak = 0;
  int64_t rule_count = 0;
  int64_t rule_chars = 0;
};

// "unlimited" clears the limit. Any other value is a decimal integer.
// Zero is a real limit. Throws std::invalid_argument with the Go Atoi text
// when the text is not an integer.
std::optional<int64_t> ParseLimit(const std::string& text);

// One JSON object per event, conformance key order, each terminated by a newline.
// An empty log is an empty string. exitCode is null except for ::-.
std::string FormatTrace(const std::vector<TraceEvent>& events);

class Interpreter {
 public:
  Interpreter();
  ~Interpreter();
  Interpreter(Interpreter&&) noexcept;
  Interpreter& operator=(Interpreter&&) noexcept;
  Interpreter(const Interpreter&) = delete;
  Interpreter& operator=(const Interpreter&) = delete;

  void set_max_evals(std::optional<int64_t> limit);
  void set_max_state_bytes(std::optional<int64_t> limit);
  void set_max_steps(std::optional<int64_t> limit);
  void set_debug(bool enabled);
  void set_trace_enabled(bool enabled);
  void set_rule_coverage_path(std::string path);

  void AddProcBinding(const std::string& name, const std::string& command);
  // Replace every binding with in-memory scripts. No process is started.
  void BindScripts(const std::map<std::string, std::vector<std::string>>& reads,
                   const std::vector<std::string>& writes);
  std::map<std::string, std::string> ScriptWrites() const;

  void LoadProgram(const std::string& path);
  void LoadProgramText(const std::string& source_path, const std::string& content);
  void ApplyInputOverride(std::string value);

  // Quiescence or ::- returns the exit code. A limit throws LimitError.
  // Any other failure throws std::runtime_error. Eval count accumulates
  // across calls. Applied steps and the trace log reset on each call.
  int Run();

  int64_t eval_count() const;
  int64_t applied_steps() const;
  RunMetrics metrics() const;
  const std::string& state() const;
  const std::vector<TraceEvent>& trace() const;
  std::vector<RuleInfo> rules() const;

  std::string RuleCoverageTSV() const;
  void WriteRuleCoverage() const;
  void Cleanup();

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace thuelang

#endif  // THUELANG_THUELANG_HPP_
