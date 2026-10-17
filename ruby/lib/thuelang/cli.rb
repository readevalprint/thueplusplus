# frozen_string_literal: true

require "fileutils"
require "json"

require_relative "../thuelang"

module Thuelang
  module CLI
    module_function

    def call(argv)
      exit run(argv)
    end

    def run(argv)
      if argv.empty?
        warn "usage: thue <program> [--proc:<name> <command>]... [--input <state>] [options]"
        return 2
      end

      interpreter = Interpreter.new
      input_override = nil
      counts_path = nil
      metrics_path = nil
      resources_path = nil
      resource_out_path = nil
      list_rules = false
      index = 1
      while index < argv.length
        arg = argv[index]
        if arg == "--debug"
          interpreter.debug = true
          index += 1
        elsif arg == "--trace"
          interpreter.trace_enabled = true
          index += 1
        elsif arg == "--list-rules"
          list_rules = true
          index += 1
        elsif (value = take_value(argv, index, "--rule-coverage"))
          interpreter.rule_coverage_path = value
          index = @next_index
        elsif (value = take_value(argv, index, "--counts"))
          counts_path = value
          index = @next_index
        elsif (value = take_value(argv, index, "--metrics"))
          metrics_path = value
          index = @next_index
        elsif (value = take_value(argv, index, "--resources"))
          resources_path = value
          index = @next_index
        elsif (value = take_value(argv, index, "--resource-out"))
          resource_out_path = value
          index = @next_index
        elsif (value = take_value(argv, index, "--input"))
          input_override = value
          index = @next_index
        elsif (value = take_value(argv, index, "--max-evals"))
          interpreter.max_evals = require_limit(value)
          index = @next_index
        elsif (value = take_value(argv, index, "--max-state-bytes"))
          interpreter.max_state_bytes = require_limit(value)
          index = @next_index
        elsif (value = take_value(argv, index, "--max-steps"))
          interpreter.max_steps = require_limit(value)
          index = @next_index
        elsif (name = arg.delete_prefix("--proc:")) && arg.start_with?("--proc:")
          if index + 1 >= argv.length
            warn "Error: --proc:#{name} requires a command argument"
            return 1
          end
          interpreter.add_proc_binding(name, argv[index + 1])
          index += 2
        else
          warn "Error: Unknown argument: #{arg}"
          return 1
        end
      end

      exit_code = 0
      error_message = nil
      ran = false
      begin
        interpreter.load_program(argv[0])
        if list_rules
          interpreter.listed_rules.each do |path, line_number, lhs|
            puts "#{path}:#{line_number}\t#{lhs}"
          end
        else
          interpreter.apply_input_override(input_override) unless input_override.nil?
          if resources_path
            load_resources(interpreter, resources_path)
          elsif resource_out_path
            raise "--resource-out requires --resources"
          end
          ran = true
          exit_code = interpreter.run
        end
      rescue LimitExceeded => error
        error_message = error.message
        exit_code = error.code
      rescue RuntimeError => error
        error_message = error.message
        exit_code = 1
      rescue Interrupt
        warn "\nInterrupted"
        return 130
      ensure
        if interpreter.trace_enabled
          $stderr.write(Format.trace(interpreter.trace))
        end
        warn "Error: #{error_message}" unless error_message.nil?
        if ran && counts_path
          begin
            write_text(counts_path, Format.counts(interpreter.applied_steps, interpreter.eval_count))
          rescue SystemCallError => error
            warn "Error: failed to write counts: #{error}"
            exit_code = 1
          end
        end
        if ran && metrics_path
          begin
            write_text(metrics_path, Format.metrics(interpreter.metrics))
          rescue SystemCallError => error
            warn "Error: failed to write metrics: #{error}"
            exit_code = 1
          end
        end
        if ran && resource_out_path
          begin
            write_text(resource_out_path, "#{JSON.pretty_generate(interpreter.script_writes, ascii_only: true)}\n")
          rescue SystemCallError => error
            warn "Error: failed to write resources: #{error}"
            exit_code = 1
          end
        end
        begin
          interpreter.write_rule_coverage
        rescue SystemCallError => error
          warn "Error: failed to write rule coverage: #{error}"
          exit_code = 1
        end
        interpreter.cleanup
      end
      exit_code
    end

    def take_value(argv, index, flag)
      arg = argv[index]
      equals = "#{flag}="
      if arg == flag
        if index + 1 >= argv.length
          warn "Error: #{flag} requires an argument"
          exit 1
        end
        @next_index = index + 2
        return argv[index + 1]
      end
      if arg.start_with?(equals)
        @next_index = index + 1
        return arg.delete_prefix(equals)
      end
      nil
    end

    def require_limit(text)
      limit = parse_limit(text)
      return limit unless limit == :invalid

      exit 2
    end

    def parse_limit(text)
      return nil if text == "unlimited"
      unless atoi_syntax(text)
        warn %(strconv.Atoi: parsing #{go_quote(text)}: invalid syntax)
        return :invalid
      end
      value = Integer(text, 10)
      if value < -2**63 || value > (2**63 - 1)
        warn %(strconv.Atoi: parsing #{go_quote(text)}: value out of range)
        return :invalid
      end
      value
    end

    def atoi_syntax(text)
      digits = text.start_with?("-") ? text[1..] : text
      !digits.empty? && digits.match?(/\A[0-9]+\z/)
    end

    def go_quote(text)
      out = +'"'
      text.each_char do |char|
        out << case char
               when "\\" then "\\\\"
               when '"' then '\\"'
               when "\n" then "\\n"
               when "\r" then "\\r"
               when "\t" then "\\t"
               else
                 code = char.ord
                 code < 0x20 ? format("\\x%02x", code) : char
               end
      end
      out << '"'
    end

    def load_resources(interpreter, path)
      payload = JSON.parse(File.read(path, encoding: Encoding::UTF_8))
      unless payload.is_a?(Hash) && payload.keys.sort == %w[reads writes]
        raise "resources file keys must be reads and writes"
      end
      interpreter.bind_scripts(payload["reads"], payload["writes"])
    rescue JSON::ParserError => error
      raise "#{path}: #{error}"
    end

    def write_text(path, text)
      parent = File.dirname(path)
      FileUtils.mkdir_p(parent) unless parent == "."
      File.write(path, text)
    end
  end
end
