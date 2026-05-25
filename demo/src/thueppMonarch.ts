import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'

export const thueppMonarchLanguage: monaco.languages.IMonarchLanguage = {
  defaultToken: 'source',
  tokenPostfix: '.thuepp',

  brackets: [
    { open: '{', close: '}', token: 'delimiter.curly' },
    { open: '{{', close: '}}', token: 'delimiter.curly' },
    { open: '(', close: ')', token: 'delimiter.parenthesis' },
    { open: '[', close: ']', token: 'delimiter.square' },
    { open: '<', close: '>', token: 'delimiter.angle' },
  ],

  tokenizer: {
    root: [
      [/^\s*::=\s*$/, { token: 'keyword.separator', next: '@stateRow' }],
      [/^(\s*)([A-Z][A-Z0-9_]*)(\s*)(<-)/, [
        'white',
        'type.identifier',
        'white',
        'operator',
      ]],
      { include: '@source' },
    ],

    source: [
      [/\\::/, 'regexp.escape'],
      [/::[=<>!-]/, 'operator'],
      [/::[^\s\w=<>!-]+/, 'invalid'],
      [/\{\{\s*(rule_index|[A-Za-z_][A-Za-z0-9_]*)\s*(\|\s*(pctenc|pctdec|[A-Za-z_][A-Za-z0-9_]*)\s*)?\}\}/, 'variable'],
      [/\{\{[^}\r\n]*\}\}/, 'invalid'],
      [/<\|[A-Z][A-Z0-9_]*\|>/, 'invalid'],
      [/\$[A-Z][A-Z0-9_]*/, 'type.identifier'],
      [/(\(\?<)([A-Za-z_][A-Za-z0-9_]*)(>)/, ['regexp', 'variable', 'regexp']],
      [/(\(\?P<)([A-Za-z_][A-Za-z0-9_]*)(>)/, ['regexp', 'variable', 'regexp']],
      [/\(\?[:imsU-]+/, 'regexp'],
      [/\[(?:\\.|[^\]\\])*\]/, 'regexp'],
      [/\\[ntr\\dDsSwWbB.+*?^$()[\]{}|/<>-]/, 'regexp.escape'],
      [/[?*+|^$]/, 'regexp'],
      [/%[0-9A-F]{2}/, 'constant'],
      [/-?(?:[0-9]+\.[0-9]+|[0-9]+\/[0-9]+|[0-9]+)/, 'number'],
      [/\b(?:true|false)\b/, 'constant'],
      [/\bERR<[A-Za-z0-9_]+>/, 'invalid'],
      [/[{}()\[\]<>]/, '@brackets'],
      [/\s+/, 'white'],
      [/[^\s{}()\[\]<>$%\\:?*+|^\r\n]+/, 'source'],
      [/./, 'source'],
    ],

    stateRow: [
      [/.*$/, { token: 'string', next: '@afterState' }],
    ],

    afterState: [
      [/.*$/, 'invalid'],
    ],
  },
}

export const thueppLanguageConfiguration: monaco.languages.LanguageConfiguration = {
  brackets: [
    ['{', '}'],
    ['{{', '}}'],
    ['(', ')'],
    ['[', ']'],
    ['<', '>'],
  ],
  autoClosingPairs: [
    { open: '{{', close: '}}' },
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '<', close: '>' },
  ],
  surroundingPairs: [
    { open: '{{', close: '}}' },
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '<', close: '>' },
  ],
}
