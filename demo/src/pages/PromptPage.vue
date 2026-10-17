<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import DocPage from '@/components/DocPage.vue'
import PromptScene from '@/components/scenes/PromptScene.vue'
import { Button } from '@/components/ui/button'
import { pages } from '@/site'

const page = pages.prompt
const route = useRoute()
const copyError = ref('')
const problem = computed(() => typeof route.query.problem === 'string' ? route.query.problem : '')
const solution = computed(() => typeof route.query.solution === 'string' ? route.query.solution : '')

const focus = computed(() => {
  if (problem.value && solution.value) {
    return `Work on problems/${problem.value}/solutions/${solution.value}/. Make that solution strictly cheaper.`
  }
  return 'Pick one problem under problems/ or one language under langs/. A direct solution is problems/<slug>/solutions/direct/solution.thue.'
})

const prompt = computed(() => `Clone https://github.com/thuelang/thueplusplus. The site is https://thuelang.org. GitLab (https://gitlab.com/thuelang/thueplusplus) is a mirror.

Read CONTRIBUTING.md. ${focus.value} Cost is UTF-8 bytes: each regex eval adds len(state)+len(lhs), and each applied step adds len(rhs).

Change one solution. Run make problems or make langs. Limits live in metrics/limits.toml. Open a pull request when the tests pass. A strictly lower Go cost is the goal. A higher cost is a warning, and a maintainer decides. Do not commit metric.json or metrics/latest.json.`)

async function copyPrompt(): Promise<void> {
  copyError.value = ''
  if (!navigator.clipboard) {
    copyError.value = 'This browser has no clipboard API.'
    return
  }
  try {
    await navigator.clipboard.writeText(prompt.value)
  } catch (error) {
    copyError.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title" :summary="page.description">
    <template #scene>
      <PromptScene :problem="problem || undefined" :solution="solution || undefined" />
    </template>
    <section id="prompt" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Prompt</h2>
      <p class="leading-7">Copy this into a coding agent. It should open a pull request when the tests pass. A higher Go cost is a warning.</p>
      <pre data-test="autoresearch-prompt" class="border-line bg-surface overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7] whitespace-pre-wrap">{{ prompt }}</pre>
      <div>
        <Button type="button" data-test="copy-prompt" @click="copyPrompt">Copy prompt</Button>
      </div>
      <p v-if="copyError" data-test="copy-prompt-error" class="text-destructive leading-7">{{ copyError }}</p>
    </section>
  </DocPage>
</template>
