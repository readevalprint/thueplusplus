// SPDX-License-Identifier: AGPL-3.0-or-later
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { thueppLanguageConfiguration, thueppMonarchLanguage } from './thueppMonarch'

export function registerThueppMonacoLanguage(monaco: typeof Monaco): void {
  if (!monaco.languages.getLanguages().some(language => language.id === 'thuepp')) {
    monaco.languages.register({ id: 'thuepp', extensions: ['.tpp'], aliases: ['Thue++', 'thue++', 'thuepp', 'thue'] })
  }
  monaco.languages.setMonarchTokensProvider('thuepp', thueppMonarchLanguage)
  monaco.languages.setLanguageConfiguration('thuepp', thueppLanguageConfiguration)
  monaco.editor.defineTheme('thuepp-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'operator.alias.thuepp', foreground: 'fbbf24', fontStyle: 'bold' },
      { token: 'type.identifier.alias.thuepp', foreground: 'fde68a', fontStyle: 'bold' },
      { token: 'operator.thuepp', foreground: 'c4b5fd' },
      { token: 'keyword.separator.thuepp', foreground: 'f9a8d4', fontStyle: 'bold' },
      { token: 'type.identifier.thuepp', foreground: '93c5fd' },
      { token: 'variable.thuepp', foreground: 'fbbf24' },
      { token: 'regexp.thuepp', foreground: '86efac' },
      { token: 'regexp.escape.thuepp', foreground: '67e8f9' },
      { token: 'constant.thuepp', foreground: 'fca5a5' },
      { token: 'number.thuepp', foreground: 'fdba74' },
      { token: 'invalid.thuepp', foreground: 'ff7a90', fontStyle: 'bold' },
    ],
    colors: {
      'editor.background': '#070708',
      'editor.foreground': '#f5f5f6',
      'editorLineNumber.foreground': '#74747e',
      'editorLineNumber.activeForeground': '#f5f5f6',
      'editorCursor.foreground': '#f5f5f6',
      'editor.selectionBackground': '#3a3a42',
      'editor.inactiveSelectionBackground': '#26262a',
      'editorGutter.background': '#070708',
    },
  })
}
