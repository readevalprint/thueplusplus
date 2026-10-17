import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { thueLanguageConfiguration, thueMonarchLanguage } from './thueMonarch'

export function registerThueMonacoLanguage(monaco: typeof Monaco): void {
  if (!monaco.languages.getLanguages().some(language => language.id === 'thue')) {
    monaco.languages.register({ id: 'thue', extensions: ['.thue'], aliases: ['Thue++', 'thue++'] })
  }
  monaco.languages.setMonarchTokensProvider('thue', thueMonarchLanguage)
  monaco.languages.setLanguageConfiguration('thue', thueLanguageConfiguration)
  const rules = [
    { token: 'operator.alias.thue', foreground: 'ffb86b', fontStyle: 'bold' },
    { token: 'type.identifier.alias.thue', foreground: 'ffb86b', fontStyle: 'bold' },
    { token: 'operator.thue', foreground: 'd29bff' },
    { token: 'keyword.separator.thue', foreground: 'ff7aa8', fontStyle: 'bold' },
    { token: 'type.identifier.thue', foreground: '7cb4ff' },
    { token: 'variable.thue', foreground: 'ffb86b' },
    { token: 'regexp.thue', foreground: 'c3e88d' },
    { token: 'regexp.escape.thue', foreground: '6fe0cf' },
    { token: 'constant.thue', foreground: 'ff9a80' },
    { token: 'number.thue', foreground: 'ffb86b' },
    { token: 'invalid.thue', foreground: 'ff5a36', fontStyle: 'bold' },
  ]
  monaco.editor.defineTheme('thue-dark', {
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
  monaco.editor.defineTheme('thue-light', {
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
