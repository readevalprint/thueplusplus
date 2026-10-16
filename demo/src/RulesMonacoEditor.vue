<template>
  <div ref="container" class="monaco-rules-editor h-full min-h-0 w-full flex-1 overflow-hidden" :data-current-match-line="highlightLine || undefined" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { installMonacoEnvironment } from './monacoEnvironment'
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
let monaco: typeof Monaco | undefined
let editor: Monaco.editor.IStandaloneCodeEditor | undefined
let matchDecorations: Monaco.editor.IEditorDecorationsCollection | undefined
let resizeObserver: ResizeObserver | undefined
let themeObserver: MutationObserver | undefined
let applyingExternalValue = false

function editorThemeName(): 'thuepp-dark' | 'thuepp-light' {
  return document.documentElement.classList.contains('dark') ? 'thuepp-dark' : 'thuepp-light'
}

interface RulesEditorElement extends HTMLElement {
  __thueppSetValue?: (value: string) => void
}

function registerThueppLanguage(monacoApi: typeof Monaco): void {
  registerThueppMonacoLanguage(monacoApi)
}

onMounted(async () => {
  if (!container.value) return
  await import('monaco-editor/min/vs/editor/editor.main.css')
  await installMonacoEnvironment()
  monaco = await import('monaco-editor/esm/vs/editor/editor.api.js')
  registerThueppLanguage(monaco)
  editor = monaco.editor.create(container.value, {
    value: props.modelValue,
    language: 'thuepp',
    theme: editorThemeName(),
    automaticLayout: false,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
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
  themeObserver = new MutationObserver(() => monaco?.editor.setTheme(editorThemeName()))
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
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
  if (!editor || !matchDecorations || !monaco) return
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
  themeObserver?.disconnect()
  resizeObserver?.disconnect()
  if (container.value) delete (container.value as RulesEditorElement).__thueppSetValue
  editor?.dispose()
})
</script>

<style scoped>
.monaco-rules-editor :deep(.matched-rule-line) {
  background: color-mix(in oklch, var(--primary) 16%, transparent);
}

.monaco-rules-editor :deep(.matched-rule-line-gutter) {
  border-left: 3px solid var(--primary);
}
</style>
