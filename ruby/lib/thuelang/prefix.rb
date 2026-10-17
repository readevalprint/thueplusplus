# frozen_string_literal: true

module Thuelang
  # Literal prefix of a rule pattern, matching the Go engine.
  #
  # A miss on this text cannot be a match, so the runner skips the regex and
  # does not count a regex eval. A hit still runs the regex. The Go function
  # is regexp.LiteralPrefix after stripping one leading ^ and refusing (?i.
  module Prefix
    CONT = :cont
    STOP = :stop
    BLOCK = :block
    FLAGS = :flags
    CAP = :cap
    INF = -1
    MAX_REPEAT = 100_000

    class Bad < StandardError
    end

    Flags = Struct.new(:multiline, :fold) do
      def copy
        Flags.new(multiline, fold)
      end
    end

    module_function

    def literal_prefix(lhs)
      return "" if lhs.include?("(?i")

      body = lhs.start_with?("^") ? lhs[1..] : lhs
      one_pass = one_pass?(body)
      text, _status, index = sequence(body, 0, Flags.new(false, false), at_start: true, stop_paren: false, one_pass: one_pass)
      return "" if index != body.length

      text
    rescue Bad
      ""
    end

    def one_pass?(body)
      return false unless leading_begin_text?(body)
      return false if alt_present?(body) && !end_anchored?(body)
      return false if swallows_next?(body)

      true
    rescue Bad
      false
    end

    def swallows_next?(body)
      ["[\\s\\S]*", "[\\s\\S]+", "[\\S\\s]*", "[\\S\\s]+", "[\\s\\S]?", "[\\S\\s]?"].each do |token|
        start = 0
        loop do
          found = body.index(token, start)
          break if found.nil?

          cursor = found + token.length
          cursor += 1 if cursor < body.length && body[cursor] == "?"
          cursor += 1 while cursor < body.length && body[cursor] == ")"
          return true if cursor < body.length && body[cursor, 2] != "\\z" && body[cursor] != "$"

          start = found + token.length
        end
      end
      false
    end

    def leading_begin_text?(body)
      index = 0
      multiline = false
      while index < body.length
        return false if body[index, 4] == "(?P<" || body[index, 3] == "(?<"
        if body[index, 3] == "(?:"
          index += 3
          next
        end
        if body[index, 2] == "(?"
          index += 2
          sign = 1
          saw = false
          while index < body.length && body[index] != ":" && body[index] != ")"
            char = body[index]
            index += 1
            if char == "-"
              sign = -1
              saw = false
              next
            end
            multiline = sign.positive? if char == "m"
            saw = true
          end
          return false if index >= body.length
          if body[index] == ":"
            index += 1
            next
          end
          index += 1
          next
        end
        return false if body[index] == "("
        return true if body[index, 2] == "\\A"
        return !multiline if body[index] == "^"

        return false
      end
      false
    end

    def end_anchored?(body)
      return body.end_with?("\\z") if body.include?("(?m")

      body.end_with?("\\z") || body.end_with?("$")
    end

    def alt_present?(body)
      index = 0
      while index < body.length
        if body[index, 2] == "\\Q"
          ending = body.index("\\E", index + 2)
          index = ending.nil? ? body.length : ending + 2
          next
        end
        if body[index] == "\\"
          index += 2
          next
        end
        if body[index] == "["
          index = class_span(body, index)[0]
          next
        end
        return true if body[index] == "|"

        index += 1
      end
      false
    end

    def sequence(pattern, index, flags, at_start:, stop_paren:, one_pass:)
      branches = [[]]
      while index < pattern.length
        if stop_paren && pattern[index] == ")"
          break
        end
        if pattern[index] == "|"
          branches << []
          index += 1
          at_start = true
          next
        end
        text, status, index, flags, at_start = atom(pattern, index, flags, at_start, one_pass)
        if status == FLAGS
          next
        end
        minimum, maximum, index = quantifier(pattern, index)
        text, status = apply_quantifier(text, status, minimum, maximum)
        if status == CONT && text.empty?
          next
        end
        branches[-1] << [text, status]
        at_start = false unless status == CAP
      end
      folded = branches.map { |branch| fold(branch) }
      return folded[0] + [index] if folded.length == 1

      text, status = common(folded)
      [text, status, index]
    end

    def common(folded)
      texts = []
      folded.each do |text, status|
        return ["", BLOCK] if status == BLOCK

        texts << text
      end
      shared = texts[0]
      texts[1..].each do |text|
        limit = [shared.length, text.length].min
        size = 0
        size += 1 while size < limit && shared[size] == text[size]
        shared = shared[0, size]
      end
      return ["", BLOCK] if shared.empty?
      return [shared, CONT] if folded.all? { |text, status| status == CONT && text == shared }

      [shared, STOP]
    end

    def fold(atoms)
      text = +""
      saw_cap = false
      atoms.each do |atom, status|
        if status == CAP
          saw_cap = true
          next
        end
        return [text, text.empty? ? BLOCK : STOP] if status == BLOCK

        text << atom
        return [text, STOP] if status == STOP
      end
      return ["", CAP] if saw_cap && text.empty?

      [text, CONT]
    end

    def atom(pattern, index, flags, at_start, one_pass)
      raise Bad, "truncated pattern" if index >= pattern.length

      char = pattern[index]
      if char == "^"
        return ["", BLOCK, index + 1, flags, false] if flags.multiline || !at_start || !one_pass

        return ["", CONT, index + 1, flags, true]
      end
      return ["", BLOCK, index + 1, flags, false] if char == "$" || char == "."
      if char == "["
        ending, rune = class_span(pattern, index)
        return ["", BLOCK, ending, flags, false] if rune.nil? || flags.fold

        return [rune, CONT, ending, flags, false]
      end
      return group(pattern, index, flags, at_start, one_pass) if char == "("
      return escape(pattern, index, flags, at_start, one_pass) if char == "\\"
      raise Bad, "bare operator" if "*+?)|".include?(char)
      return ["", BLOCK, index + 1, flags, false] if flags.fold

      [char, CONT, index + 1, flags, false]
    end

    def group(pattern, index, flags, at_start, one_pass)
      capturing = true
      if pattern[index, 2] == "(?"
        named = named_capture(pattern, index)
        return perl_group(pattern, index, flags, at_start, one_pass) if named.nil?

        index = named
      else
        index += 1
      end
      text, status, index = sequence(pattern, index, flags, at_start: at_start, stop_paren: true, one_pass: one_pass)
      raise Bad, "unclosed group" if index >= pattern.length || pattern[index] != ")"

      index += 1
      return ["", BLOCK, index, flags, false] if one_pass && capturing
      return ["", CAP, index, flags, at_start] if capturing && status == CONT && text.empty?

      still_start = at_start && status == CONT && text.empty?
      [text, status, index, flags, still_start]
    end

    def named_capture(pattern, index)
      if pattern[index, 4] == "(?P<"
        start = index + 4
      elsif pattern[index, 3] == "(?<"
        start = index + 3
      else
        return nil
      end
      ending = pattern.index(">", start)
      raise Bad, "bad capture name" if ending.nil? || ending == start

      name = pattern[start...ending]
      raise Bad, "bad capture name" if name.chars.any? { |char| char != "_" && !char.match?(/[[:alnum:]]/) }

      ending + 1
    end

    def perl_group(pattern, index, flags, at_start, one_pass)
      cursor = index + 2
      sign = 1
      saw = false
      updated = flags.copy
      while cursor < pattern.length
        char = pattern[cursor]
        if char == ":" || char == ")"
          raise Bad, "bad flags" if sign.negative? && !saw

          cursor += 1
          return ["", FLAGS, cursor, updated, at_start] if char == ")"

          text, status, cursor = sequence(pattern, cursor, updated, at_start: at_start, stop_paren: true, one_pass: one_pass)
          raise Bad, "unclosed group" if cursor >= pattern.length || pattern[cursor] != ")"

          still_start = at_start && status == CONT && text.empty?
          return [text, status, cursor + 1, flags, still_start]
        end
        if char == "-"
          raise Bad, "bad flags" if sign.negative?

          sign = -1
          saw = false
          cursor += 1
          next
        end
        raise Bad, "bad flags" unless "imsU".include?(char)

        saw = true
        enabled = sign.positive?
        updated.fold = enabled if char == "i"
        updated.multiline = enabled if char == "m"
        cursor += 1
      end
      raise Bad, "bad flags"
    end

    def escape(pattern, index, flags, at_start, one_pass)
      raise Bad, "trailing backslash" if index + 1 >= pattern.length

      if pattern[index, 2] == "\\Q"
        ending = pattern.index("\\E", index + 2)
        literal = ending.nil? ? pattern[(index + 2)..] : pattern[(index + 2)...ending]
        index = ending.nil? ? pattern.length : ending + 2
        return ["", BLOCK, index, flags, false] if flags.fold && !literal.empty?

        return [literal, CONT, index, flags, at_start && literal.empty?]
      end
      char = pattern[index + 1]
      if char == "A"
        return ["", CONT, index + 2, flags, true] if at_start && one_pass

        return ["", BLOCK, index + 2, flags, false]
      end
      if "zZbBdDwWsS".include?(char)
        raise Bad, "bad escape" if char == "Z"

        return ["", BLOCK, index + 2, flags, false]
      end
      literal, index = literal_escape(pattern, index)
      return ["", BLOCK, index, flags, false] if flags.fold

      [literal, CONT, index, flags, false]
    end

    def literal_escape(pattern, index)
      raise Bad, "trailing backslash" if index + 1 >= pattern.length

      rest = pattern[(index + 1)..]
      char = rest[0]
      rest = rest[1..] || ""
      if "01234567".include?(char)
        raise Bad, "bad escape" if char != "0" && (rest.empty? || !"01234567".include?(rest[0]))

        value = char.ord - 48
        consumed = 1
        while consumed < 3 && !rest.empty? && "01234567".include?(rest[0])
          value = (value * 8) + rest[0].ord - 48
          rest = rest[1..]
          consumed += 1
        end
        return [value.chr(Encoding::UTF_8), pattern.length - rest.length]
      end
      if char == "x"
        raise Bad, "bad escape" if rest.empty?
        if rest[0] == "{"
          rest = rest[1..]
          digits = +""
          while !rest.empty? && rest[0] != "}"
            raise Bad, "bad escape" unless "0123456789abcdefABCDEF".include?(rest[0])

            digits << rest[0]
            rest = rest[1..]
            raise Bad, "bad escape" if digits.to_i(16) > 0x10FFFF
          end
          raise Bad, "bad escape" if digits.empty? || rest.empty? || rest[0] != "}"

          return [digits.to_i(16).chr(Encoding::UTF_8), pattern.length - rest.length + 1]
        end
        raise Bad, "bad escape" if rest.length < 2

        pair = rest[0, 2]
        raise Bad, "bad escape" if pair.chars.any? { |item| !"0123456789abcdefABCDEF".include?(item) }

        return [pair.to_i(16).chr(Encoding::UTF_8), index + 4]
      end
      named = { "a" => "\a", "f" => "\f", "n" => "\n", "r" => "\r", "t" => "\t", "v" => "\v" }
      return [named[char], index + 2] if named.key?(char)
      return [char, index + 2] if char.ascii_only? && !char.match?(/[A-Za-z0-9]/)
      return [char, index + 2] if char == "_"

      raise Bad, "bad escape"
    end

    def class_span(pattern, index)
      raise Bad, "class" if pattern[index] != "["

      index += 1
      negated = false
      if index < pattern.length && pattern[index] == "^"
        negated = true
        index += 1
      end
      runes = []
      ranged = false
      posix = false
      if index < pattern.length && pattern[index] == "]"
        runes << "]"
        index += 1
      end
      while index < pattern.length && pattern[index] != "]"
        if pattern[index, 2] == "[:"
          ending = pattern.index(":]", index + 2)
          raise Bad, "class" if ending.nil?

          posix = true
          index = ending + 2
          next
        end
        if pattern[index] == "\\"
          begin
            literal, index = literal_escape(pattern, index)
          rescue Bad
            raise if index + 1 >= pattern.length

            index += 2
            posix = true
            next
          end
          runes << literal
        else
          runes << pattern[index]
          index += 1
        end
        if index + 1 < pattern.length && pattern[index] == "-" && pattern[index + 1] != "]"
          ranged = true
          index += 1
        end
      end
      raise Bad, "class" if index >= pattern.length || pattern[index] != "]"

      index += 1
      return [index, runes[0]] if !negated && !ranged && !posix && runes.length == 1

      [index, nil]
    end

    def quantifier(pattern, index)
      return [1, 1, index] if index >= pattern.length

      char = pattern[index]
      if char == "*"
        minimum, maximum, index = 0, INF, index + 1
      elsif char == "+"
        minimum, maximum, index = 1, INF, index + 1
      elsif char == "?"
        minimum, maximum, index = 0, 1, index + 1
      elsif char == "{"
        parsed = repeat(pattern, index)
        return [1, 1, index] if parsed.nil?

        minimum, maximum, index = parsed
      else
        return [1, 1, index]
      end
      index += 1 if index < pattern.length && pattern[index] == "?"
      [minimum, maximum, index]
    end

    def repeat(pattern, index)
      return nil if pattern[index] != "{"

      cursor = index + 1
      minimum, cursor = integer(pattern, cursor)
      return nil if minimum.nil? || cursor >= pattern.length
      if pattern[cursor] != ","
        maximum = minimum
      else
        cursor += 1
        if cursor < pattern.length && pattern[cursor] == "}"
          maximum = INF
        else
          maximum, cursor = integer(pattern, cursor)
          return nil if maximum.nil?
        end
      end
      return nil if cursor >= pattern.length || pattern[cursor] != "}"
      raise Bad, "bad repeat" if minimum.negative? || (maximum >= 0 && maximum < minimum)
      raise Bad, "bad repeat" if minimum > MAX_REPEAT || maximum > MAX_REPEAT

      [minimum, maximum, cursor + 1]
    end

    def integer(pattern, index)
      return [nil, index] if index >= pattern.length || !pattern[index].match?(/[0-9]/)
      return [nil, index] if pattern[index] == "0" && index + 1 < pattern.length && pattern[index + 1].match?(/[0-9]/)

      value = 0
      while index < pattern.length && pattern[index].match?(/[0-9]/)
        value = (value * 10) + pattern[index].ord - 48
        return [-1, index] if value >= 100_000_000

        index += 1
      end
      [value, index]
    end

    def apply_quantifier(text, status, minimum, maximum)
      return [text, status] if minimum == 1 && maximum == 1
      if status == CAP
        return ["", BLOCK] unless minimum == maximum

        return minimum.zero? ? ["", CONT] : ["", CAP]
      end
      return ["", CONT] if status == CONT && text.empty?
      return ["", CONT] if minimum.zero? && maximum.zero?
      if status == CONT
        return ["", BLOCK] if minimum.zero?

        repeated = text * minimum
        return [repeated, CONT] if maximum == minimum

        return [repeated, STOP]
      end
      if status == STOP
        return ["", BLOCK] if minimum.zero?

        return [text, STOP]
      end
      return ["", CONT] if minimum.zero? && maximum.zero?

      ["", BLOCK]
    end
  end
end
