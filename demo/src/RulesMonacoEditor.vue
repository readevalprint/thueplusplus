<template>
  <div ref="container" class="monaco-rules-editor" :data-current-match-line="highlightLine || undefined" />
</template>

<script setup lang="ts">
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/min/vs/editor/editor.main.css'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { registerThueppMonacoLanguage } from './thueppMonacoSetup'

const props = withDefaults(defineProps<{
  modelValue: string
  highlightLine?: number
  readonly?: boolean
}>(), {
  readonly: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  paste: [value: string]
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
  registerThueppMonacoLanguage(monaco)
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
    readOnly: props.readonly,
    domReadOnly: props.readonly,
  })
  editor.onDidChangeModelContent(() => {
    if (applyingExternalValue || !editor) return
    emit('update:modelValue', editor.getValue())
  })
  editor.onDidPaste(() => {
    if (!editor) return
    emit('paste', editor.getValue())
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

watch(() => props.readonly, value => {
  editor?.updateOptions({ readOnly: value, domReadOnly: value })
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
