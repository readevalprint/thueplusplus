<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <article :class="documentClass">
    <template v-for="(block, index) in blocks" :key="index">
      <component :is="`h${block.level}`" v-if="block.kind === 'heading'" :id="block.id" v-html="block.html" />
      <p v-else-if="block.kind === 'paragraph'" v-html="block.html" />
      <ul v-else-if="block.kind === 'list'">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex" v-html="item" />
      </ul>
      <div v-else-if="block.kind === 'table'" class="readme-table-wrap">
        <table>
          <thead>
            <tr>
              <th v-for="(header, headerIndex) in block.headers" :key="headerIndex" v-html="header" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
              <td v-for="(cell, cellIndex) in row" :key="cellIndex" v-html="cell" />
            </tr>
          </tbody>
        </table>
      </div>
      <ReadmeCodeEditor
        v-else-if="block.kind === 'code' && block.monacoLanguage"
        class="readme-thue-editor"
        :data-test="block.monacoLanguage === 'clojure' ? 'readme-lisp-code' : 'readme-thue-code'"
        :code="block.code"
        :language="block.monacoLanguage"
        :line-number-start="block.lineNumberStart"
      />
      <pre v-else-if="block.kind === 'code'" class="readme-code"><code>{{ block.code }}</code></pre>
      <hr v-else-if="block.kind === 'rule'">
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ReadmeCodeEditor from './ReadmeCodeEditor.vue'
import { parseMarkdown } from './markdown'

const props = withDefaults(defineProps<{
  markdown: string
  documentClass?: string
}>(), {
  documentClass: 'readme-document',
})

const blocks = computed(() => parseMarkdown(props.markdown))
</script>
