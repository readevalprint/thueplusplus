import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { thueppLanguageConfiguration, thueppMonarchLanguage } from './thueppMonarch'

export function registerThueppMonacoLanguage(monaco: typeof Monaco): void {
  if (!monaco.languages.getLanguages().some(language => language.id === 'thuepp')) {
    monaco.languages.register({ id: 'thuepp', extensions: ['.tpp'], aliases: ['Thue++', 'thue++', 'thuepp', 'thue'] })
  }
  monaco.languages.setMonarchTokensProvider('thuepp', thueppMonarchLanguage)
  monaco.languages.setLanguageConfiguration('thuepp', thueppLanguageConfiguration)
  const rules = [
    { token: 'operator.alias.thuepp', foreground: 'ffb86b', fontStyle: 'bold' },
    { token: 'type.identifier.alias.thuepp', foreground: 'ffb86b', fontStyle: 'bold' },
    { token: 'operator.thuepp', foreground: 'd29bff' },
    { token: 'keyword.separator.thuepp', foreground: 'ff7aa8', fontStyle: 'bold' },
    { token: 'type.identifier.thuepp', foreground: '7cb4ff' },
    { token: 'variable.thuepp', foreground: 'ffb86b' },
    { token: 'regexp.thuepp', foreground: 'c3e88d' },
    { token: 'regexp.escape.thuepp', foreground: '6fe0cf' },
    { token: 'constant.thuepp', foreground: 'ff9a80' },
    { token: 'number.thuepp', foreground: 'ffb86b' },
    { token: 'invalid.thuepp', foreground: 'ff5a36', fontStyle: 'bold' },
  ]
  monaco.editor.defineTheme('thuepp-dark', {
    base: 'vs-dark',
    inherit: true,
    rules,
    colors: {
      'editor.background': '#111114',
      'editor.foreground': '#e8e6e1',
      'editorLineNumber.foreground': '#807f88',
      'editorLineNumber.activeForeground': '#e8e6e1',
      'editorCursor.foreground': '#ff5a36',
      'editor.selectionBackground': '#2a2a31',
      'editor.inactiveSelectionBackground': '#202026',
      'editorGutter.background': '#111114',
    },
  })
  monaco.editor.defineTheme('thuepp-light', {
    base: 'vs',
    inherit: true,
    rules,
    colors: {
      'editor.background': '#fffcf8',
      'editor.foreground': '#1a1916',
      'editorLineNumber.foreground': '#7a776f',
      'editorLineNumber.activeForeground': '#1a1916',
      'editorCursor.foreground': '#ff5a36',
      'editor.selectionBackground': '#e8e6e0',
      'editor.inactiveSelectionBackground': '#ddd9d2',
      'editorGutter.background': '#fffcf8',
    },
  })
}
