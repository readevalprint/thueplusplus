<script setup lang="ts">
import { ref } from 'vue'
import DocPage from '@/components/DocPage.vue'
import RewriteArrow from '@/components/marks/RewriteArrow.vue'
import { Button } from '@/components/ui/button'
import { pages } from '@/site'

const page = pages.prompt
const copyError = ref('')

const prompt = `Clone https://github.com/thuelang/thueplusplus. The site is https://thuelang.org. GitLab (https://gitlab.com/thuelang/thueplusplus) is a mirror.

Read CONTRIBUTING.md. Pick one problem under problems/ or one language under langs/. Read the current Pareto front for that directory: the minimized counters are regex evals, regex matches, cumulative state size, rule count, and rule chars.

Change one solution or one language version. Run the Go tests for that directory (make problems or make langs). Every run has explicit step, probe, and state limits, timeout(1), and a 256 MiB cap. Open a pull request only if the tests pass and the file is not dominated. Then run make metrics and commit metrics/latest.json with the change. make metrics fails if any host reports no resident memory.`

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
      <p class="leading-7">Copy this into a coding agent. It should open a pull request only when the result is on the Pareto front.</p>
      <pre data-test="autoresearch-prompt" class="border-line bg-surface overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7] whitespace-pre-wrap">{{ prompt }}</pre>
      <div>
        <Button type="button" data-test="copy-prompt" @click="copyPrompt">Copy prompt</Button>
      </div>
      <p v-if="copyError" data-test="copy-prompt-error" class="text-destructive leading-7">{{ copyError }}</p>
    </section>
  </DocPage>
</template>
