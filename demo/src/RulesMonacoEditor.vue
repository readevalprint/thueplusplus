<template>
  <div ref="container" class="monaco-rules-editor" :data-current-match-line="highlightLine || undefined" />
</template>

<script setup lang="ts">
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/min/vs/editor/editor.main.css'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { thueppLanguageConfiguration, thueppMonarchLanguage } from './thueppMonarch'

const props = defineProps<{
  modelValue: string
  highlightLine?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const container = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | undefined
let matchDecorations: monaco.editor.IEditorDecorationsCollection | undefined
let resizeObserver: ResizeObserver | undefined
let applyingExternalValue = false

interface RulesEditorElement extends HTMLElement {
  __thueppSetValue?: (value: string) => void
}

function registerThueppLanguage(): void {
  if (!monaco.languages.getLanguages().some(language => language.id === 'thuepp')) {
    monaco.languages.register({ id: 'thuepp', extensions: ['.tpp'], aliases: ['thue++', 'thuepp'] })
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

onMounted(() => {
  if (!container.value) return
  registerThueppLanguage()
  editor = monaco.editor.create(container.value, {
    value: props.modelValue,
    language: 'thuepp',
    theme: 'thuepp-dark',
    automaticLayout: false,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 13,
    lineHeight: 20,
    minimap: { enabled: false },
    renderLineHighlight: 'line',
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    wrappingStrategy: 'simple',
    tabSize: 2,
    insertSpaces: true,
    detectIndentation: false,
    scrollbar: {
      alwaysConsumeMouseWheel: false,
      horizontal: 'visible',
      vertical: 'visible',
    },
  })
  editor.onDidChangeModelContent(() => {
    if (applyingExternalValue || !editor) return
    emit('update:modelValue', editor.getValue())
  })
  matchDecorations = editor.createDecorationsCollection()
  updateMatchedRuleDecoration(props.highlightLine)
  ;(container.value as RulesEditorElement).__thueppSetValue = (value: string) => {
    if (!editor) return
    editor.setValue(value)
    emit('update:modelValue', value)
  }
  resizeObserver = new ResizeObserver(() => editor?.layout())
  resizeObserver.observe(container.value)
})

watch(() => props.modelValue, value => {
  if (!editor || editor.getValue() === value) return
  applyingExternalValue = true
  editor.setValue(value)
  applyingExternalValue = false
  updateMatchedRuleDecoration(props.highlightLine)
})

watch(() => props.highlightLine, line => {
  updateMatchedRuleDecoration(line)
})

function updateMatchedRuleDecoration(line: number | undefined): void {
  if (!editor || !matchDecorations) return
  const model = editor.getModel()
  if (!line || !model || line < 1 || line > model.getLineCount()) {
    matchDecorations.set([])
    return
  }
  matchDecorations.set([{
    range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
    options: {
      isWholeLine: true,
      className: 'matched-rule-line',
      linesDecorationsClassName: 'matched-rule-line-gutter',
      overviewRuler: {
        color: 'rgba(251, 191, 36, 0.85)',
        position: monaco.editor.OverviewRulerLane.Center,
      },
    },
  }])
  editor.revealLineInCenterIfOutsideViewport(line, monaco.editor.ScrollType.Smooth)
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  if (container.value) delete (container.value as RulesEditorElement).__thueppSetValue
  editor?.dispose()
})
</script>
