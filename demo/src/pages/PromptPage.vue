<script setup lang="ts">
import { ref } from 'vue'
import DocPage from '@/components/DocPage.vue'
import RewriteArrow from '@/components/marks/RewriteArrow.vue'
import { Button } from '@/components/ui/button'
import { pages } from '@/site'

const page = pages.prompt
const copyError = ref('')

const prompt = `Clone https://github.com/thuelang/thueplusplus. The site is https://thuelang.org. GitLab (https://gitlab.com/thuelang/thueplusplus) is a mirror.

Read CONTRIBUTING.md. Pick one problem under problems/ or one language under langs/. A direct solution is problems/<slug>/solutions/direct/solution.thue. Cost is UTF-8 bytes: each regex eval adds len(state)+len(lhs), and each applied step adds len(rhs).

Change one solution. Run make problems or make langs. Limits live in metrics/limits.toml. Open a pull request only if the tests pass and the Go cost is strictly lower than metric.json. Then run make metrics and commit metrics/latest.json with the change.`

async function copyPrompt(): Promise<void> {
  copyError.value = ''
  if (!navigator.clipboard) {
    copyError.value = 'This browser has no clipboard API.'
    return
  }
  try {
    await navigator.clipboard.writeText(prompt)
  } catch (error) {
    copyError.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title">
    <template #mark>
      <RewriteArrow />
    </template>
    <section id="prompt" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Prompt</h2>
      <p class="leading-7">Copy this into a coding agent. It should open a pull request only when the Go cost is strictly lower.</p>
      <pre data-test="autoresearch-prompt" class="border-line bg-surface overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7] whitespace-pre-wrap">{{ prompt }}</pre>
      <div>
        <Button type="button" data-test="copy-prompt" @click="copyPrompt">Copy prompt</Button>
      </div>
      <p v-if="copyError" data-test="copy-prompt-error" class="text-destructive leading-7">{{ copyError }}</p>
    </section>
  </DocPage>
</template>
