# frozen_string_literal: true

require "base64"
require "fileutils"
require "json"
require "open3"
require "re2"

require_relative "prefix"

module Thuelang
  DEFAULT_MAX_EVALS = 1_000_000
  DEFAULT_MAX_STATE_BYTES = 8 * 1024 * 1024
  DEFAULT_MAX_STEPS = 1_000_000
  MAX_NUMERIC_LITERAL_CHARS = 4096
  MAX_PATTERN_ALIAS_SUBSTITUTIONS_PER_LINE = 10_000
  MAX_EXPANDED_PATTERN_BYTES = 1_000_000
  RE2_MAX_MEM = 100 * 1024 * 1024

  EXIT_RUNTIME = 1
  EXIT_STEP_LIMIT = 10
  EXIT_EVAL_LIMIT = 11
  EXIT_STATE_LIMIT = 12
  EXIT_READ_TIMEOUT = 13

  class LimitExceeded < RuntimeError
    attr_reader :kind, :code

    def initialize(kind, code, message)
      super(message)
      @kind = kind
      @code = code
    end
  end

  RunMetrics = Struct.new(
    :cost,
    :applied_steps,
    :regex_evals,
    :regex_matches,
    :state_bytes,
    :state_peak,
    :rule_count,
    :rule_chars,
    keyword_init: true
  )

  Rule = Struct.new(
    :lhs,
    :pattern,
    :operator,
    :rhs,
    :line_number,
    :source_path,
    :builtin_name,
    :builtin_args,
    :mids,
    :source,
    :literal_prefix,
    keyword_init: true
  )

  Mid = Struct.new(:pattern, keyword_init: true)
  SourceRow = Struct.new(:text, :source_path, :source_line, keyword_init: true)
  Found = Struct.new(:start_at, :finish, :groups, keyword_init: true)

  Binding = Struct.new(
    :name,
    :is_process,
    :command,
    :stdin_io,
    :stdout_io,
    :stderr_io,
    :wait_thr,
    :lines,
    :line_at,
    :recorded,
    keyword_init: true
  )

  module Format
    module_function

    def trace(events)
      return "" if events.empty?

      events.map { |event| trace_json(trace_object(event)) }.join("\n") + "\n"
    end

    def trace_json(payload)
      JSON.generate(payload).gsub("\u2028", "\\u2028").gsub("\u2029", "\\u2029")
    end

    def trace_object(event)
      {
        "step" => event[:step],
        "ruleIndex" => event[:rule_index],
        "lineNumber" => event[:line_number],
        "operator" => event[:operator],
        "matchStart" => event[:match_start],
        "matchEnd" => event[:match_end],
        "error" => event[:error].to_s,
        "stateBefore" => event[:state_before],
        "replacement" => event[:replacement].to_s,
        "stateAfter" => event[:state_after],
        "exitCode" => event[:exit_code]
      }
    end

    def metrics(metrics)
      JSON.generate(
        {
          "cost" => metrics.cost,
          "applied_steps" => metrics.applied_steps,
          "regex_evals" => metrics.regex_evals,
          "regex_matches" => metrics.regex_matches,
          "state_bytes" => metrics.state_bytes,
          "state_peak" => metrics.state_peak,
          "rule_count" => metrics.rule_count,
          "rule_chars" => metrics.rule_chars
        },
        ascii_only: true
      ) + "\n"
    end

    def counts(applied_steps, probes)
      JSON.generate({ "applied_steps" => applied_steps, "probes" => probes }, ascii_only: true) + "\n"
    end
  end

  class Interpreter
    ALIAS_DEF_RE = /\A\s*([A-Z][A-Z0-9_]*)\s*<-\s*(.*)\z/
    ALIAS_REF_RE = /(?<!\\)\$([A-Z][A-Z0-9_]*)/
    INVALID_ALIAS_TOKEN_RE = /<\|([A-Z][A-Z0-9_]*)\|>/
    NAMED_CAPTURE_RE = /\(\?(?:<|P<)([A-Za-z_][A-Za-z0-9_]*)>/
    NAMED_CAPTURE_SPELLING = /\(\?<([^>]+)>/
    TEMPLATE_RE = /\{\{([^}]*)\}\}/
    NUMERIC_RE = /\A-?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+\/[0-9]+)\z/
    WORD_RE = /\A[A-Za-z_]\w*\z/
    MID_NAME_RE = /\A[A-Za-z_][A-Za-z0-9_]*\z/
    RESOURCE_NAME_RE = /\A[A-Za-z_][A-Za-z0-9_]*\z/
    RE_META = "\\.+*?()|[]{}^$".chars.freeze
    TERMINAL_OPS = "=<>!-".chars.freeze
    BUILTIN_ARITY = {
      "eq" => 2,
      "add" => 2,
      "sub" => 2,
      "mul" => 2,
      "div" => 2,
      "mod" => 2,
      "numeq" => 2,
      "lt" => 2,
      "le" => 2,
      "gt" => 2,
      "ge" => 2,
      "num" => 1,
      "b64enc" => 1,
      "b64dec" => 1,
      "pctenc" => 1,
      "pctdec" => 1,
      "escape" => 1,
      "unescape" => 1
    }.freeze
    PCT_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-".b.freeze
    OPERATORS = {
      "=" => "::=",
      "<" => "::<",
      ">" => "::>",
      "-" => "::-",
      "!" => "::!"
    }.freeze

    attr_accessor :max_evals, :max_state_bytes, :max_steps, :debug, :trace_enabled, :rule_coverage_path
    attr_reader :rules, :state, :eval_count, :applied_steps, :trace, :program_path

    def initialize(max_evals: :default, max_state_bytes: :default, max_steps: :default, debug: false, trace_enabled: false, rule_coverage_path: nil)
      @max_evals = max_evals == :default ? DEFAULT_MAX_EVALS : max_evals
      @max_state_bytes = max_state_bytes == :default ? DEFAULT_MAX_STATE_BYTES : max_state_bytes
      @max_steps = max_steps == :default ? DEFAULT_MAX_STEPS : max_steps
      @debug = debug
      @trace_enabled = trace_enabled
      @rule_coverage_path = rule_coverage_path
      @rules = []
      @state = ""
      @bindings = {}
      @eval_count = 0
      @applied_steps = 0
      @cost = 0
      @regex_evals = 0
      @regex_matches = 0
      @state_bytes = 0
      @state_peak = 0
      @trace = []
      @rule_coverage_counts = {}
      @program_path = ""
      @bindings["stdin"] = Binding.new(name: "stdin", is_process: false, command: "stdin", line_at: 0)
      @bindings["stdout"] = Binding.new(name: "stdout", is_process: false, command: "stdout", line_at: 0)
      @bindings["stderr"] = Binding.new(name: "stderr", is_process: false, command: "stderr", line_at: 0)
    end

    def add_proc_binding(name, command)
      @bindings[name] = Binding.new(name: name, is_process: true, command: command, line_at: 0)
    end

    def bind_scripts(reads, writes)
      raise "resources file needs reads and writes" unless reads.is_a?(Hash) && writes.is_a?(Array)
      raise "duplicate writable resource" unless writes.uniq.length == writes.length

      names = (reads.keys + writes).uniq
      raise "no resources" if names.empty?

      write_set = writes.to_h { |name| [name, true] }
      @bindings = {}
      names.each do |name|
        raise "invalid resource #{name.inspect}" unless name.is_a?(String) && RESOURCE_NAME_RE.match?(name)

        binding = Binding.new(name: name, is_process: false, command: name, line_at: 0)
        if reads.key?(name)
          lines = reads[name]
          unless lines.is_a?(Array) && lines.all? { |line| line.is_a?(String) && !line.include?("\n") && !line.include?("\r") }
            raise "resource #{name} lines must be strings without newlines"
          end
          binding.lines = lines.dup
        end
        binding.recorded = [] if write_set.key?(name)
        @bindings[name] = binding
      end
    end

    def script_writes
      @bindings.each_with_object({}) do |(name, binding), out|
        out[name] = binding.recorded.join unless binding.recorded.nil?
      end
    end

    def load_program(program_path)
      resolved = File.expand_path(program_path)
      @program_path = resolved
      raise "File not found: #{resolved}" unless File.file?(resolved)

      bytes = File.binread(resolved)
      text = bytes.dup.force_encoding(Encoding::UTF_8)
      raise "invalid UTF-8 in #{resolved}" unless text.valid_encoding?

      annotated = []
      split_lines(text).each_with_index do |line, index|
        annotated << "# thue-source: #{resolved}:#{index + 1}"
        annotated << line
      end
      parse_program(annotated.join("\n"))
    end

    def apply_input_override(value)
      @state = value
    end

    def metrics
      RunMetrics.new(
        cost: @cost,
        applied_steps: @applied_steps,
        regex_evals: @regex_evals,
        regex_matches: @regex_matches,
        state_bytes: @state_bytes,
        state_peak: @state_peak,
        rule_count: @rules.length,
        rule_chars: @rules.sum { |rule| rule.source.bytesize }
      )
    end

    def write_rule_coverage
      return if @rule_coverage_path.nil? || @rule_coverage_path.empty?

      path = @rule_coverage_path
      parent = File.dirname(path)
      FileUtils.mkdir_p(parent) unless parent == "."
      lines = @rule_coverage_counts.keys.sort.map { |rule_id| "#{rule_id}\t#{@rule_coverage_counts[rule_id]}" }
      File.write(path, lines.empty? ? "" : "#{lines.join("\n")}\n")
    end

    def listed_rules
      @rules.map { |rule| [display_path(rule.source_path), rule.line_number, rule.lhs] }
    end

    def run
      @applied_steps = 0
      @cost = 0
      @regex_evals = 0
      @regex_matches = 0
      @state_bytes = 0
      @state_peak = 0
      @trace = []
      note_state
      loop do
        applied = false
        @rules.each_with_index do |rule, rule_index|
          if !@max_evals.nil? && @eval_count >= @max_evals
            raise LimitExceeded.new("evals", EXIT_EVAL_LIMIT, "Evaluation step limit (#{@max_evals}) exceeded")
          end

          @eval_count += 1
          found = match_state(rule)
          next if found.nil?

          state_before = @state
          groups = nil
          mid_ok = false
          begin
            groups, mid_ok = apply_mids(rule, found.groups)
          rescue RuntimeError => error
            record_trace(rule, rule_index, found, state_before, "", error: error.message)
            raise
          end
          next unless mid_ok

          applied = true
          debug_match(rule, found, groups) if @debug
          if rule.operator != "::-" && !@max_steps.nil? && @applied_steps >= @max_steps
            raise LimitExceeded.new("steps", EXIT_STEP_LIMIT, "Applied step limit (#{@max_steps}) exceeded")
          end

          replacement = nil
          magic = { "rule_index" => rule_index.to_s }
          begin
            case rule.operator
            when "::="
              replacement = expand_template(rule.rhs, groups, magic)
              record_rule_coverage(rule)
            when "::<"
              replacement = read_replacement(rule, found)
              record_rule_coverage(rule)
            when "::>"
              replacement = write_replacement(rule, groups, magic)
            when "::!"
              replacement = builtin_replacement(rule, groups)
              record_rule_coverage(rule)
            when "::-"
              return exit_replacement(rule, rule_index, found, state_before)
            else
              raise "Line #{rule.line_number}: unsupported operator #{rule.operator}"
            end
            set_state(@state[0...found.start_at].to_s + replacement.to_s + @state[found.finish..].to_s)
          rescue RuntimeError => error
            record_trace(rule, rule_index, found, state_before, replacement.to_s, error: error.message)
            raise
          end
          note_state
          record_trace(rule, rule_index, found, state_before, replacement.to_s)
          charge_step(rule.rhs)
          if !@max_steps.nil? && @applied_steps >= @max_steps
            raise LimitExceeded.new("steps", EXIT_STEP_LIMIT, "Applied step limit (#{@max_steps}) exceeded")
          end
          debug_result if @debug
          break
        end
        return 0 unless applied
      end
    end

    def cleanup
      @bindings.each_value do |binding|
        next if binding.wait_thr.nil?

        pid = binding.wait_thr.pid
        begin
          Process.kill("TERM", pid)
        rescue Errno::ESRCH, Errno::EPERM
        end
        binding.wait_thr.join(1)
        unless binding.wait_thr.stop?
          begin
            Process.kill("KILL", pid)
          rescue Errno::ESRCH, Errno::EPERM
          end
          binding.wait_thr.join(1)
        end
        [binding.stdin_io, binding.stdout_io, binding.stderr_io].each do |io|
          io.close unless io.nil? || io.closed?
        rescue IOError
        end
      rescue StandardError
      end
    end

    private

    def split_lines(content)
      return [] if content.empty?

      lines = content.split("\n", -1)
      lines.pop if lines.last == ""
      lines.map { |line| line.delete_suffix("\r") }
    end

    def parse_program(content)
      rows = source_rows(content)
      separator = rows.index { |row| row.text.strip == "::=" }
      if separator
        prefix_rows = rows[0...separator]
        state_rows = rows[(separator + 1)..]
      else
        prefix_rows = rows
        state_rows = []
      end
      expanded = expand_patterns(annotated_content(prefix_rows))
      @rules = []
      current = nil
      split_lines(expanded).each_with_index do |line, index|
        stripped = line.strip
        if stripped.start_with?("# thue-source: ")
          marker = source_marker(stripped)
          current = marker if marker
          next
        end
        source_path, source_line = current || [@program_path, index + 1]
        rule = parse_rule(line, source_line, source_path)
        @rules << rule unless rule.nil?
      end
      @state = state_rows.map(&:text).join("\n")
    end

    def source_rows(content)
      rows = []
      current = nil
      split_lines(content).each_with_index do |line, index|
        stripped = line.strip
        if stripped.start_with?("# thue-source: ")
          marker = source_marker(stripped)
          current = marker if marker
          next
        end
        source_path, source_line = current || [@program_path, index + 1]
        rows << SourceRow.new(text: line, source_path: source_path, source_line: source_line)
      end
      rows
    end

    def source_marker(stripped)
      marker = stripped.delete_prefix("# thue-source: ")
      source_path, sep, source_line = marker.rpartition(":")
      return nil unless sep == ":" && source_line.match?(/\A[0-9]+\z/)

      [source_path, source_line.to_i]
    end

    def annotated_content(rows)
      rows.flat_map { |row| ["# thue-source: #{row.source_path}:#{row.source_line}", row.text] }.join("\n")
    end

    def expand_patterns(content)
      aliases = {}
      result = []
      current = nil
      content.split("\n", -1).each_with_index do |line, index|
        line_number = index + 1
        stripped = line.strip
        if stripped.start_with?("# thue-source: ")
          marker = source_marker(stripped)
          current = marker if marker
          result << line
          next
        end
        effective = current ? current[1] : line_number
        if stripped.empty?
          result << line
          next
        end
        alias_match = ALIAS_DEF_RE.match(line)
        if alias_match && !terminal_operator?(line)
          name = alias_match[1]
          pattern = alias_match[2].strip
          raise "Line #{effective}: Duplicate pattern alias '#{name}'" if aliases.key?(name)
          if NAMED_CAPTURE_RE.match?(pattern)
            raise "Line #{effective}: Pattern alias '#{name}' must not contain named captures"
          end
          aliases[name] = "(?:#{expand_alias_refs(pattern, aliases, effective)})"
          next
        end
        begin
          split = split_rule_line(line)
        rescue RuntimeError => error
          raise "Line #{effective}: #{error.message}"
        end
        if split
          pieces = [expand_alias_refs(split[:lhs], aliases, effective)]
          split[:mids].each do |mid|
            pieces << "::|"
            pieces << expand_alias_refs(mid, aliases, effective)
          end
          pieces << "::#{split[:op]}#{split[:rhs]}"
          result << pieces.join
          next
        end
        result << line
      end
      result.join("\n")
    end

    def expand_alias_refs(pattern, aliases, line_number)
      invalid = INVALID_ALIAS_TOKEN_RE.match(pattern)
      if invalid
        name = invalid[1]
        raise "Line #{line_number}: Invalid pattern alias token '<|#{name}|>'; use '$#{name}' aliases"
      end
      substitutions = 0
      expanded = pattern.gsub(ALIAS_REF_RE) do
        name = Regexp.last_match(1)
        raise "Line #{line_number}: Unknown pattern alias '$#{name}'" unless aliases.key?(name)

        substitutions += 1
        if substitutions > MAX_PATTERN_ALIAS_SUBSTITUTIONS_PER_LINE
          raise "Line #{line_number}: Pattern alias expansion exceeded substitution limit (#{MAX_PATTERN_ALIAS_SUBSTITUTIONS_PER_LINE})"
        end
        aliases[name]
      end
      if expanded.bytesize > MAX_EXPANDED_PATTERN_BYTES
        raise "Line #{line_number}: Pattern alias expansion exceeded byte limit (#{MAX_EXPANDED_PATTERN_BYTES})"
      end
      expanded
    end

    def terminal_operator?(line)
      index = 0
      while index + 2 < line.length
        op = structural_op_at(line, index)
        return true if op && op != "|"

        index += 1
      end
      false
    end

    def structural_op_at(line, index)
      return nil if index + 2 >= line.length || line[index] != ":" || line[index + 1] != ":"
      return nil if index.positive? && line[index - 1] == "\\"

      op = line[index + 2]
      return op if op == "|" || TERMINAL_OPS.include?(op)

      nil
    end

    def split_rule_line(line)
      saw_mid = false
      lhs = ""
      mids = []
      index = 0
      while index + 2 < line.length
        op = structural_op_at(line, index)
        if op.nil?
          index += 1
          next
        end
        if op == "|"
          lhs = line[0...index] unless saw_mid
          saw_mid = true
          next_at = index + 3
          found = false
          next_op = nil
          while next_at + 2 < line.length
            next_op = structural_op_at(line, next_at)
            if next_op
              found = true
              break
            end
            next_at += 1
          end
          raise "::| requires a terminal operator" unless found

          mids << line[(index + 3)...next_at]
          if next_op == "|"
            index = next_at
            next
          end
          return { lhs: lhs, mids: mids, op: next_op, rhs: line[(next_at + 3)..] }
        end
        lhs = line[0...index] unless saw_mid
        return { lhs: lhs, mids: mids, op: op, rhs: line[(index + 3)..] }
      end
      raise "::| requires a terminal operator" if saw_mid

      nil
    end

    def parse_rule(line, line_number, source_path)
      stripped = line.strip
      return nil if stripped.empty? || stripped == "::="

      begin
        split = split_rule_line(line)
      rescue RuntimeError => error
        raise "Line #{line_number}: #{error.message}"
      end
      if split.nil?
        raise "Line #{line_number}: Invalid rule syntax: #{line}" if line.match?(/(?<!\\)::[^\s\w=<>!-]/)

        return nil
      end
      lhs = split[:lhs].sub(/[ \t]+\z/, "")
      rhs = split[:rhs].sub(/\A[ \t]+/, "")
      operator = OPERATORS[split[:op]]
      return nil if lhs.empty?

      mids = split[:mids].map do |text|
        pattern_text = text.sub(/\A[ \t]+/, "").sub(/[ \t]+\z/, "")
        raise "Line #{line_number}: ::| requires a regex" if pattern_text.empty?

        Mid.new(pattern: pattern_text)
      end
      pattern = compile_rule(lhs, line_number)
      builtin_name = ""
      builtin_args = []
      if operator == "::!"
        capture_names = pattern.names.to_h { |name| [name, true] }
        mids.each { |mid| mid.pattern.scan(NAMED_CAPTURE_RE) { capture_names[Regexp.last_match(1)] = true } }
        builtin_name, builtin_args = parse_builtin_call(rhs, line_number, capture_names)
      end
      Rule.new(
        lhs: lhs,
        pattern: pattern,
        operator: operator,
        rhs: rhs,
        line_number: line_number,
        source_path: source_path,
        builtin_name: builtin_name,
        builtin_args: builtin_args,
        mids: mids,
        source: line.strip,
        literal_prefix: Prefix.literal_prefix(lhs)
      )
    end

    def compile_rule(lhs, line_number)
      compiled = compile_pattern("(?m)#{translate_lhs(lhs)}")
      return compiled if compiled

      raise "Line #{line_number}: Invalid regex '#{lhs}': #{last_re_error}"
    end

    def translate_lhs(lhs)
      return "" if lhs.empty?

      lhs.gsub(NAMED_CAPTURE_SPELLING, "(?P<\\1>")
    end

    def compile_pattern(pattern)
      compiled = RE2::Regexp.new(pattern, utf8: true, log_errors: false, max_mem: RE2_MAX_MEM)
      unless compiled.ok?
        @last_re_error = compiled.error
        return nil
      end
      compiled
    rescue StandardError => error
      @last_re_error = error.message
      nil
    end

    def last_re_error
      @last_re_error
    end

    def search_pattern(pattern, text)
      count = pattern.number_of_capturing_groups
      found = pattern.match(text, submatches: count.positive? ? count : 1)
      return nil if found.nil? || found == true || found == false

      groups = {}
      found.named_captures.each { |name, value| groups[name] = value }
      Found.new(start_at: found.begin(0), finish: found.end(0), groups: groups)
    end

    def parse_builtin_call(rhs, line_number, capture_names)
      tokens = rhs.split
      raise "Line #{line_number}: ::! requires a builtin name" if tokens.empty?

      name = tokens[0]
      args = tokens[1..]
      expected = BUILTIN_ARITY[name]
      raise "Line #{line_number}: Unknown builtin '#{name}'" if expected.nil?
      if args.length != expected
        raise "Line #{line_number}: Builtin '#{name}' expects #{expected} args, got #{args.length}"
      end
      args.each do |arg|
        raise "Line #{line_number}: ::! arguments must be capture names, got '#{arg}'" unless WORD_RE.match?(arg)
        raise "Line #{line_number}: ::! argument '#{arg}' is not a named capture" unless capture_names.key?(arg)
      end
      [name, args]
    end

    def match_state(rule)
      return nil if !rule.literal_prefix.empty? && !@state.include?(rule.literal_prefix)

      charge_eval(rule.lhs)
      found = search_pattern(rule.pattern, @state)
      return nil if found.nil?

      @regex_matches += 1
      found
    end

    def apply_mids(rule, groups)
      return [groups, true] if rule.mids.empty?

      out = {}
      groups.each { |key, value| out[key] = value if value.is_a?(String) }
      rule.mids.each do |mid|
        begin
          expanded = expand_mid_pattern(mid.pattern, out)
        rescue RuntimeError => error
          raise "Line #{rule.line_number}: #{error.message}"
        end
        compiled = compile_pattern("(?m)#{translate_lhs(expanded)}")
        raise "Line #{rule.line_number}: Invalid ::| regex '#{expanded}'" if compiled.nil?

        charge_eval(rule.lhs)
        found = search_pattern(compiled, @state)
        return [groups, false] if found.nil?

        @regex_matches += 1
        compiled.names.each do |name|
          value = found.groups[name]
          out[name] = value unless value.nil?
        end
      end
      [out, true]
    end

    def expand_template(template, groups, extra)
      raw = groups.merge(extra)
      escaped = {}
      raw.each do |key, value|
        escaped[key] = value.is_a?(String) ? value.gsub("\\") { "\\\\" } : value
      end
      pieces = []
      position = 0
      template.to_enum(:scan, TEMPLATE_RE).each do
        match = Regexp.last_match
        pieces << decode_replacement_escapes(template[position...match.begin(0)])
        inner = match[1]
        if inner.include?("|")
          name, filt = inner.split("|", 2)
          unless WORD_RE.match?(name) && WORD_RE.match?(filt)
            raise "Malformed template filter '{{#{inner}}}'"
          end
          raise "Missing template capture '#{name}'" unless raw.key?(name)

          value = raw[name].to_s
          case filt
          when "pctenc"
            pieces << pct_encode(value)
          when "pctdec"
            pieces << pct_decode(value)
          else
            raise "Unknown template filter '#{filt}'"
          end
        elsif /\A\w+\z/.match?(inner)
          value = escaped[inner]
          pieces << (value ? value.to_s : "")
        else
          pieces << match[0]
        end
        position = match.end(0)
      end
      pieces << decode_replacement_escapes(template[position..].to_s)
      pieces.join
    end

    def expand_mid_pattern(pattern, groups)
      pieces = []
      position = 0
      while position < pattern.length
        if pattern[position, 2] == "{{"
          ending = pattern.index("}}", position + 2)
          if ending
            inside = pattern[(position + 2)...ending]
            if inside.include?("|")
              pieces << expand_mid_filters(inside, groups)
              position = ending + 2
              next
            end
            if MID_NAME_RE.match?(inside)
              raw = groups.fetch(inside, "")
              pieces << (raw.nil? ? "" : raw.to_s)
              position = ending + 2
              next
            end
          end
        end
        next_hole = pattern.index("{{", position)
        if next_hole.nil?
          pieces << pattern[position..]
          break
        end
        if next_hole == position
          pieces << pattern[position]
          position += 1
          next
        end
        pieces << pattern[position...next_hole]
        position = next_hole
      end
      pieces.join
    end

    def expand_mid_filters(inside, groups)
      parts = inside.split("|")
      if parts.length < 2 || !MID_NAME_RE.match?(parts[0]) || parts[1..].any? { |part| !MID_NAME_RE.match?(part) }
        raise "Malformed template filter '{{#{inside}}}'"
      end
      raise "Missing template capture '#{parts[0]}'" if !groups.key?(parts[0]) || groups[parts[0]].nil?

      value = groups[parts[0]].to_s
      parts[1..].each do |filt|
        case filt
        when "pctenc"
          value = pct_encode(value)
        when "pctdec"
          value = pct_decode(value)
        when "quote"
          value = quote_meta(value)
        else
          raise "Unknown template filter '#{filt}'"
        end
      end
      value
    end

    def decode_replacement_escapes(text)
      placeholder = "\u0000BACKSLASH\u0000"
      text = text.gsub("\\\\", placeholder)
      text = text.gsub("\\n", "\n")
      text = text.gsub("\\t", "\t")
      text = text.gsub("\\r", "\r")
      text.gsub(placeholder, "\\")
    end

    def quote_meta(value)
      value.chars.map { |char| RE_META.include?(char) ? "\\#{char}" : char }.join
    end

    def read_replacement(rule, _found)
      parts = rule.rhs.strip.split
      raise "Line #{rule.line_number}: ::< requires read_spec and literal resource" unless parts.length == 2

      read_spec, resource = parts
      begin
        read_timeout = Float(read_spec)
      rescue ArgumentError
        raise "Line #{rule.line_number}: invalid read timeout '#{read_spec}'"
      end
      unless read_timeout.finite? && read_timeout.positive?
        raise "Line #{rule.line_number}: invalid read timeout '#{read_spec}'"
      end
      raise "Line #{rule.line_number}: ::< resource must be a literal binding name" unless WORD_RE.match?(resource)

      binding = @bindings[resource]
      raise "Unknown resource '#{resource}'" if binding.nil?

      content, error = read_line(binding, read_timeout)
      if error
        raise LimitExceeded.new("timeout", EXIT_READ_TIMEOUT, error) if error.start_with?("ERR:resource:") && error.end_with?(":timeout")

        raise error
      end
      pct_encode(content)
    end

    def write_replacement(rule, groups, magic)
      expanded = expand_template(rule.rhs, groups, magic)
      space = expanded.index(/[ \t]/)
      if space
        resource = expanded[0...space]
        content = expanded[(space + 1)..]
      else
        resource = expanded
        content = ""
      end
      binding = @bindings[resource]
      if binding.nil?
        "ERR:resource:#{resource}"
      else
        error = write_string(binding, content)
        record_rule_coverage(rule) if error.nil?
        error || ""
      end
    end

    def builtin_replacement(rule, groups)
      values = rule.builtin_args.map do |arg|
        raise "Line #{rule.line_number}: ::! argument '#{arg}' was not captured" unless groups.key?(arg)

        groups[arg]
      end
      eval_builtin(rule.builtin_name, values)
    end

    def exit_replacement(rule, rule_index, found, state_before)
      code_str = rule.rhs.strip
      code_str = code_str[1..-2] if code_str.start_with?("{") && code_str.end_with?("}")
      begin
        exit_code = Integer(code_str.strip, 10)
      rescue ArgumentError
        record_rule_coverage(rule)
        record_trace(rule, rule_index, found, state_before, "")
        return 1
      end
      record_rule_coverage(rule)
      record_trace(rule, rule_index, found, state_before, "", exit_code: exit_code)
      exit_code
    end

    def read_line(binding, timeout)
      unless binding.lines.nil?
        return ["", "ERR:resource:#{binding.name}:EOF before newline"] if binding.line_at >= binding.lines.length

        line = binding.lines[binding.line_at]
        binding.line_at += 1
        return [line, nil]
      end
      return ["", "ERR:resource:cannot_read_output_stream"] unless binding.recorded.nil?
      return ["", "ERR:resource:cannot_read_output_stream"] if binding.name == "stdout" || binding.name == "stderr"
      if binding.name == "stdin"
        ready = IO.select([$stdin], nil, nil, timeout)
        return ["", "ERR:resource:stdin:timeout"] unless ready

        $stdin.set_encoding(Encoding::UTF_8, invalid: :replace, undef: :replace)
        line = $stdin.gets
        return ["", "ERR:resource:stdin:EOF before newline"] if line.nil?
        return [strip_line(line), nil] if line.end_with?("\n")

        return ["", "ERR:resource:stdin:EOF before newline"]
      end
      if binding.is_process
        ensure_process(binding)
        begin
          ready = IO.select([binding.stdout_io], nil, nil, timeout)
          unless ready
            status = process_exit_status(binding)
            if !status.nil? && status != 0
              stderr = read_io(binding.stderr_io).strip
              stderr = "process exited #{status}" if stderr.empty?
              return ["", "ERR:resource:#{binding.name}:#{stderr}"]
            end
            return ["", "ERR:resource:#{binding.name}:timeout"]
          end
          line = binding.stdout_io.gets
          line = decode_io(line) unless line.nil?
          return ["", "ERR:resource:#{binding.name}:EOF before newline"] if line.nil? || line.empty?
          return [strip_line(line), nil] if line.end_with?("\n")

          ["", "ERR:resource:#{binding.name}:EOF before newline"]
        rescue SystemCallError => error
          ["", "ERR:resource:#{binding.name}:#{error}"]
        end
      else
        ["", "ERR:resource:#{binding.name}:line read requires process or stdin binding"]
      end
    end

    def write_string(binding, content)
      unless binding.recorded.nil?
        binding.recorded << content
        return nil
      end
      return "ERR:resource:#{binding.name}:write requires process or output stream binding" unless binding.lines.nil?
      if binding.name == "stdout"
        $stdout.write(content)
        $stdout.flush
        return nil
      end
      if binding.name == "stderr"
        $stderr.write(content)
        $stderr.flush
        return nil
      end
      if binding.is_process
        ensure_process(binding)
        begin
          binding.stdin_io.write(content.encode(Encoding::UTF_8))
          binding.stdin_io.flush
          nil
        rescue SystemCallError => error
          "ERR:resource:#{binding.name}:#{error}"
        end
      else
        "ERR:resource:#{binding.name}:write requires process or output stream binding"
      end
    end

    def ensure_process(binding)
      return unless binding.is_process && binding.wait_thr.nil?

      stdin, stdout, stderr, wait_thr = Open3.popen3("stdbuf -oL #{binding.command}")
      [stdin, stdout, stderr].each(&:binmode)
      binding.stdin_io = stdin
      binding.stdout_io = stdout
      binding.stderr_io = stderr
      binding.wait_thr = wait_thr
    end

    def process_exit_status(binding)
      return nil if binding.wait_thr.alive?

      binding.wait_thr.value.exitstatus
    end

    def read_io(io)
      return "" if io.nil?

      data = io.read
      decode_io(data)
    end

    def decode_io(data)
      return "" if data.nil?

      text = data.dup.force_encoding(Encoding::UTF_8)
      return text if text.valid_encoding?

      text.encode(Encoding::UTF_8, invalid: :replace, undef: :replace)
    end

    def strip_line(line)
      line = line.delete_suffix("\n")
      line.delete_suffix("\r")
    end

    def set_state(new_state)
      unless @max_state_bytes.nil?
        size = new_state.bytesize
        if size > @max_state_bytes
          raise LimitExceeded.new(
            "state",
            EXIT_STATE_LIMIT,
            "State size (#{size} bytes) exceeds maximum (#{@max_state_bytes} bytes)"
          )
        end
      end
      @state = new_state
    end

    def note_state
      size = @state.bytesize
      @state_bytes += size
      @state_peak = size if size > @state_peak
    end

    def charge_eval(lhs)
      @regex_evals += 1
      @cost += @state.bytesize + lhs.bytesize
    end

    def charge_step(rhs)
      @applied_steps += 1
      @cost += rhs.bytesize
    end

    def record_rule_coverage(rule)
      return if @rule_coverage_path.nil? || @rule_coverage_path.empty?

      rule_id = "#{display_path(rule.source_path)}:#{rule.line_number}"
      @rule_coverage_counts[rule_id] = @rule_coverage_counts.fetch(rule_id, 0) + 1
    end

    def byte_index(text, char_index)
      text[0...char_index].to_s.bytesize
    end

    def record_trace(rule, rule_index, found, state_before, replacement, error: "", exit_code: nil)
      return unless @trace_enabled

      @trace << {
        step: @eval_count,
        rule_index: rule_index,
        line_number: rule.line_number,
        operator: rule.operator,
        match_start: byte_index(state_before, found.start_at),
        match_end: byte_index(state_before, found.finish),
        error: error,
        state_before: state_before,
        replacement: replacement,
        state_after: @state,
        exit_code: exit_code
      }
    end

    def debug_match(rule, found, groups)
      warn "[#{@eval_count}] STATE: #{@state.gsub("\n", "\\n")}"
      warn "[#{@eval_count}] RULE #{rule.line_number} MATCHES STATE AT #{found.start_at}:#{found.finish}: #{rule.lhs}"
      warn "[#{@eval_count}] GROUPS: #{groups.inspect}"
    end

    def debug_result
      warn "[#{@eval_count}] RESULT: #{@state.gsub("\n", "\\n")}"
      warn ""
    end

    def display_path(path)
      absolute = File.expand_path(path)
      cwd = File.expand_path(Dir.pwd)
      prefix = "#{cwd}/"
      return absolute.delete_prefix(prefix) if absolute.start_with?(prefix)

      absolute
    end

    def b64url_encode(value)
      Base64.urlsafe_encode64(value, padding: false)
    end

    def b64url_decode(value)
      raise "Builtin 'b64dec' expected unpadded Base64url input" if value.include?("=")
      raise "Builtin 'b64dec' expected Base64url input" unless value.match?(/\A[A-Za-z0-9_-]*\z/)
      raise "Builtin 'b64dec' invalid Base64url length" if value.length % 4 == 1

      padded = value + ("=" * ((4 - (value.length % 4)) % 4))
      begin
        decoded = Base64.urlsafe_decode64(padded)
      rescue ArgumentError => error
        raise "Builtin 'b64dec' invalid Base64url input: #{error}"
      end
      text = decoded.dup.force_encoding(Encoding::UTF_8)
      raise "Builtin 'b64dec' decoded bytes are not valid UTF-8" unless text.valid_encoding?
      raise "Builtin 'b64dec' expected canonical unpadded Base64url input" unless b64url_encode(text) == value

      text
    end

    def pct_encode(value)
      value.bytes.map { |byte| PCT_SAFE.include?(byte.chr) ? byte.chr : format("%%%02X", byte) }.join
    end

    def pct_decode(value)
      data = []
      index = 0
      while index < value.length
        char = value[index]
        if char == "%"
          raise "PCT payload has incomplete percent escape" if index + 2 >= value.length

          hex = value[(index + 1), 2]
          raise "PCT payload has malformed or non-canonical percent escape" unless hex.match?(/\A[0-9A-F]{2}\z/)

          data << hex.to_i(16)
          index += 3
        else
          raise "PCT payload contains unencoded unsafe byte" unless char.match?(/\A[A-Za-z0-9_.-]\z/)

          data << char.ord
          index += 1
        end
      end
      text = data.pack("C*").force_encoding(Encoding::UTF_8)
      raise "PCT payload decoded bytes are not valid UTF-8: invalid byte sequence" unless text.valid_encoding?

      text
    end

    def escape_text(value)
      text = pct_decode(value)
      replacements = {
        "\\" => "\\\\",
        '"' => '\\"',
        "\n" => "\\n",
        "\t" => "\\t",
        "\r" => "\\r",
        "\b" => "\\b",
        "\f" => "\\f"
      }
      pct_encode(text.chars.map { |char| replacements.fetch(char, char) }.join)
    end

    def unescape_text(value)
      text = pct_decode(value)
      replacements = {
        "\\" => "\\",
        '"' => '"',
        "n" => "\n",
        "t" => "\t",
        "r" => "\r",
        "b" => "\b",
        "f" => "\f"
      }
      out = []
      index = 0
      while index < text.length
        char = text[index]
        unless char == "\\"
          out << char
          index += 1
          next
        end
        raise "Builtin 'unescape' has trailing backslash escape" if index + 1 >= text.length

        esc = text[index + 1]
        raise "Builtin 'unescape' unsupported escape '\\#{esc}'" unless replacements.key?(esc)

        out << replacements[esc]
        index += 2
      end
      pct_encode(out.join)
    end

    def parse_number(value, builtin)
      unless value.is_a?(String) && NUMERIC_RE.match?(value)
        raise "Builtin '#{builtin}' expected numeric input, got '#{value}'"
      end
      if value.length > MAX_NUMERIC_LITERAL_CHARS
        raise "Builtin '#{builtin}' numeric input exceeds maximum length (#{MAX_NUMERIC_LITERAL_CHARS} characters)"
      end
      if value.include?("/")
        denominator = Integer(value.rpartition("/").last, 10)
        raise "Builtin '#{builtin}' fraction denominator must be non-zero" if denominator.zero?
      end
      begin
        Rational(value)
      rescue ArgumentError, ZeroDivisionError
        raise "Builtin '#{builtin}' expected numeric input, got '#{value}'"
      end
    end

    def format_rational(value)
      return value.numerator.to_s if value.denominator == 1

      "#{value.numerator}/#{value.denominator}"
    end

    def eval_builtin(name, values)
      expected = BUILTIN_ARITY[name]
      if expected.nil? || values.length != expected
        raise "internal error: invalid validated builtin '#{name}' with #{values.length} values"
      end
      return values[0] == values[1] ? "1" : "0" if name == "eq"
      return b64url_encode(values[0]) if name == "b64enc"
      return b64url_decode(values[0]) if name == "b64dec"
      return pct_encode(values[0]) if name == "pctenc"
      return pct_decode(values[0]) if name == "pctdec"
      return escape_text(values[0]) if name == "escape"
      return unescape_text(values[0]) if name == "unescape"
      return "<num>#{format_rational(parse_number(values[0], name))}</num>" if name == "num"

      left = parse_number(values[0], name)
      right = parse_number(values[1], name)
      case name
      when "add"
        format_rational(left + right)
      when "sub"
        format_rational(left - right)
      when "mul"
        format_rational(left * right)
      when "div"
        raise "Builtin 'div' division by zero" if right.zero?

        format_rational(left / right)
      when "mod"
        raise "Builtin 'mod' modulo by zero" if right.zero?
        raise "Builtin 'mod' expected integer inputs" unless left.denominator == 1 && right.denominator == 1
        raise "Builtin 'mod' expected non-negative integer inputs" if left.negative? || right.negative?

        (left.numerator % right.numerator).to_s
      when "numeq"
        left == right ? "1" : "0"
      when "lt"
        left < right ? "1" : "0"
      when "le"
        left <= right ? "1" : "0"
      when "gt"
        left > right ? "1" : "0"
      when "ge"
        left >= right ? "1" : "0"
      else
        raise "internal error: validated builtin '#{name}' has no evaluator"
      end
    end
  end
end
