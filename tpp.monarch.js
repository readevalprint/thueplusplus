// Monaco Monarch tokenizer for thue++ (.tpp).
//
// Source parsing is line-oriented: rows before the final `::=` separator are
// rules/aliases/inert source; zero or one raw state row may follow it. This
// tokenizer is intentionally lexical. Runtime checks such as RE2 validity,
// alias order/uniqueness, builtin arity, capture existence, resource validity,
// and template filter validity still belong to the interpreter.
//
// Register with:
//   monaco.languages.register({ id: 'thuepp', extensions: ['.tpp'] });
//   monaco.languages.setMonarchTokensProvider('thuepp', thueppMonarchLanguage);
//   monaco.languages.setLanguageConfiguration('thuepp', thueppLanguageConfiguration);

export const thueppMonarchLanguage = {
  defaultToken: 'source',
  tokenPostfix: '.thuepp',

  brackets: [
    ['{', '}', 'delimiter.curly'],
    ['{{', '}}', 'delimiter.curly'],
    ['(', ')', 'delimiter.parenthesis'],
    ['[', ']', 'delimiter.square'],
  ],

  tokenizer: {
    root: [
      // Final state separator. The next physical row, if any, is raw state.
      [/^\s*::=\s*$/, { token: 'keyword.separator', next: '@stateRow' }],

      // Rule rows: highlight only the first unescaped valid operator as the
      // delimiter. Later operator-looking text is RHS payload, not delimiter.
      // Match the whole physical row so tokenizer state cannot leak to the next row.
      [/^(?!.*\(\?(?:P<|<)[A-Za-z_][A-Za-z0-9_]*>)((?:\\::|(?!(?:::[=<>!-]))[^\r\n])*?\S(?:\\::|(?!(?:::[=<>!-]))[^\r\n])*?)(::[=<>!-])(.*)$/, [
        'source',
        'operator',
        'source',
      ]],

      // Alias definitions. Use alias-specific token classes so definitions
      // stand out, but only on rows without an unescaped valid rule operator.
      [/^(?!.*(?:^|[^\\])::[=<>!-])(\s*)([A-Z][A-Z0-9_]*)(\s*)(<-)/, [
        'white',
        'type.identifier.alias',
        'white',
        'operator.alias',
      ]],

      // Inert prose rows with no unescaped rule operator are executable
      // documentation. Color them as comments without reintroducing `#`
      // comment syntax or hiding invalid `::x` / stale `<|ALIAS|>` markers.
      [/^(?=\s*\S)(?!\s*[A-Z][A-Z0-9_]*\s*<-)(?!.*(?:^|[^\\])::)(?!.*<\|[A-Z][A-Z0-9_]*\|>).+$/, 'comment'],

      { include: '@source' },
    ],

    source: [
      // Escaped parser delimiter must win before operator matching.
      [/\\::/, 'regexp.escape'],

      // Rule-looking operators outside parsed rule rows are invalid/empty-LHS
      // operator rows or other standalone operator-looking text.
      [/::[=<>!-]/, 'operator'],
      [/::(?![=<>!-])\S*/, 'invalid'],

      { include: '@common' },
    ],

    common: [
      // Replacement template fields.
      [/\{\{\s*(rule_index|[A-Za-z_][A-Za-z0-9_]*)\s*(\|\s*(pctenc|pctdec|[A-Za-z_][A-Za-z0-9_]*)\s*)?\}\}/, 'variable'],
      [/\{\{[^}\r\n]*\}\}/, 'invalid'],

      // Pattern aliases and stale alias spelling.
      [/<\|[A-Z][A-Z0-9_]*\|>/, 'invalid'],
      [/\$[A-Z][A-Z0-9_]*/, 'type.identifier.alias'],

      // RE2-ish regex surface used in LHS and aliases.
      [/(\()(\?<)([A-Za-z_][A-Za-z0-9_]*)(>)/, ['@brackets', 'regexp', 'variable', 'regexp']],
      [/(\()(\?P<)([A-Za-z_][A-Za-z0-9_]*)(>)/, ['@brackets', 'regexp', 'variable', 'regexp']],
      [/(\()(\?[:imsU-]+)/, ['@brackets', 'regexp']],
      [/\[(?:\\.|[^\]\\])*\]/, 'regexp'],
      [/\\[ntr\\dDsSwWbB.+*?^$()[\]{}|/<>-]/, 'regexp.escape'],
      [/[?*+|^$]/, 'regexp'],

      // Common framed values in serious examples such as Lisp. This is generic
      // enough to help read thue++ state machines without making Lisp syntax
      // part of core thue++.
      [/%[0-9A-F]{2}/, 'constant'],
      [/-?(?:[0-9]+\.[0-9]+|[0-9]+\/[0-9]+|[0-9]+)/, 'number'],
      [/\b(?:true|false)\b/, 'constant'],
      [/\bERR<[A-Za-z0-9_]+>/, 'invalid'],

      [/[{}()\[\]]/, '@brackets'],
      [/\s+/, 'white'],
      [/[^\s{}()\[\]$%\\:?*+|^\r\n]+/, 'source'],
      [/./, 'source'],
    ],

    stateRow: [
      [/.*$/, { token: 'string', next: '@afterState' }],
    ],

    // The language allows at most one source-provided state row after `::=`.
    afterState: [
      [/.*$/, 'invalid'],
    ],
  },
};

export const thueppLanguageConfiguration = {
  brackets: [
    ['{', '}'],
    ['{{', '}}'],
    ['(', ')'],
    ['[', ']'],
  ],
  autoClosingPairs: [
    { open: '{{', close: '}}' },
    { open: '(', close: ')' },
    { open: '[', close: ']' },
  ],
  surroundingPairs: [
    { open: '{{', close: '}}' },
    { open: '(', close: ')' },
    { open: '[', close: ']' },
  ],
};
