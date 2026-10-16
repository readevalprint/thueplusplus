<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import DocPage from '@/components/DocPage.vue'
import RewriteArrow from '@/components/marks/RewriteArrow.vue'
import { hostProseList } from '@/hosts'
import { pages } from '@/site'

const page = pages.learn
const sample = `^hello (?<name>[A-Za-z]+)$ ::= hi {{name}}
::=
hello Ada`
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title">
    <template #mark>
      <RewriteArrow />
    </template>
    <template #actions>
      <Button as-child>
        <RouterLink to="/playground?file=./examples/hello/hello.tpp">Open the playground</RouterLink>
      </Button>
      <Button as-child variant="outline">
        <RouterLink to="/reference">Operators</RouterLink>
      </Button>
    </template>
    <section id="program" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">A program</h2>
      <p class="leading-7">A program is an ordered list of rules and one state string. The host tries the rules from the top. The first pattern that matches rewrites the state. That repeats until no rule matches, or a rule stops the run.</p>
      <pre class="bg-surface border-line overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ sample }}</pre>
      <p class="text-muted-foreground leading-7">The rule matches <code>hello Ada</code> and replaces the whole state with <code>hi Ada</code>. Nothing else matches, so the run stops.</p>
    </section>
    <section id="operators" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Operators</h2>
      <p class="leading-7"><code>::=</code> rewrites the state. <code>::&gt;</code> writes to a resource. <code>::&lt;</code> reads one. <code>::-</code> stops with an integer. <code>::!</code> calls a builtin. <code>::|</code> searches the whole state and binds captures for the rest of the rule. The <RouterLink to="/reference" class="underline underline-offset-4">reference</RouterLink> is the short list.</p>
    </section>
    <section id="hosts-and-guests" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Hosts and guests</h2>
      <p class="leading-7">A <RouterLink to="/hosts" class="underline underline-offset-4">host</RouterLink> is Thue++ implemented in another language: {{ hostProseList }}. A <RouterLink to="/guests" class="underline underline-offset-4">guest</RouterLink> is a language implemented in Thue++. The host decides which resources exist. A new interpreter binds stdin, stdout, and stderr, and it starts with limits so a run cannot go on forever.</p>
    </section>
    <section id="try-it" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Try it</h2>
      <p class="leading-7">The <RouterLink to="/playground" class="underline underline-offset-4">playground</RouterLink> loads the Go host compiled to WebAssembly. Step runs one rewrite, and the step limit is on before you press anything.</p>
    </section>
  </DocPage>
</template>
