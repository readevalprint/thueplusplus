<template>
  <div class="readme-code-editor" :style="editorStyle" ref="container" :data-line-start="lineNumberStart" />
</template>

<script setup lang="ts">
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/min/vs/editor/editor.main.css'
import 'monaco-editor/esm/vs/basic-languages/clojure/clojure.contribution.js'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { registerThueppMonacoLanguage } from './thueppMonacoSetup'

const props = withDefaults(defineProps<{
  code: string
  language?: string
  lineNumberStart?: number
}>(), {
  language: 'thuepp',
  lineNumberStart: 1,
})

const container = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | undefined
let resizeObserver: ResizeObserver | undefined

const lineHeight = 20
const verticalPadding = 16
const horizontalScrollbarHeight = 12
const borderHeight = 2
const lineCount = computed(() => Math.max(1, props.code.split('\n').length))
const editorStyle = computed(() => ({
  height: `${lineCount.value * lineHeight + verticalPadding + horizontalScrollbarHeight + borderHeight}px`,
}))

onMounted(() => {
  if (!container.value) return
  registerThueppMonacoLanguage(monaco)
  editor = monaco.editor.create(container.value, {
    value: props.code,
    language: props.language,
    theme: 'thuepp-dark',
    automaticLayout: false,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 13,
    lineHeight,
    padding: { top: 8, bottom: 8 },
    minimap: { enabled: false },
    renderLineHighlight: 'none',
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    wrappingStrategy: 'simple',
    tabSize: 2,
    insertSpaces: true,
    detectIndentation: false,
    lineNumbers: line => String(props.lineNumberStart + line - 1),
    lineNumbersMinChars: Math.max(3, String(props.lineNumberStart + props.code.split('\n').length - 1).length + 1),
    glyphMargin: false,
    folding: false,
    overviewRulerLanes: 0,
    readOnly: true,
    domReadOnly: true,
    scrollbar: {
      alwaysConsumeMouseWheel: false,
      horizontal: 'visible',
      vertical: 'hidden',
    },
  })
  resizeObserver = new ResizeObserver(() => editor?.layout())
  resizeObserver.observe(container.value)
})

watch(() => props.code, code => {
  if (!editor || editor.getValue() === code) return
  editor.setValue(code)
  editor.layout()
})

watch(() => props.lineNumberStart, start => {
  editor?.updateOptions({
    lineNumbers: line => String(start + line - 1),
    lineNumbersMinChars: Math.max(3, String(start + props.code.split('\n').length - 1).length + 1),
  })
})

watch(() => props.language, language => {
  const model = editor?.getModel()
  if (model) monaco.editor.setModelLanguage(model, language)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  editor?.dispose()
})
</script>
