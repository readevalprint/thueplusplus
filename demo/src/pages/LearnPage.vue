<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import DocPage from '@/components/DocPage.vue'
import RewriteArrow from '@/components/marks/RewriteArrow.vue'
import { hostProseList } from '@/hosts'
import { pages } from '@/site'

const page = pages.guides
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
        <RouterLink to="/docs/language">Operators</RouterLink>
      </Button>
    </template>
    <section id="program" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">A program</h2>
      <p class="leading-7">A program is an ordered list of rules and one state string. The engine tries the rules from the top. The first pattern that matches rewrites the state. That repeats until no rule matches, or a rule stops the run.</p>
      <pre class="bg-surface border-line overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ sample }}</pre>
      <p class="text-muted-foreground leading-7">The rule matches <code>hello Ada</code> and replaces the whole state with <code>hi Ada</code>. Nothing else matches, so the run stops.</p>
    </section>
    <section id="operators" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Operators</h2>
      <p class="leading-7"><code>::=</code> rewrites the state. <code>::&gt;</code> writes to a resource. <code>::&lt;</code> reads one. <code>::-</code> stops with an integer. <code>::!</code> calls a builtin. <code>::|</code> searches the whole state and binds captures for the rest of the rule. The <RouterLink to="/docs/language" class="underline underline-offset-4">language reference</RouterLink> is the short list.</p>
    </section>
    <section id="programs" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Programs</h2>
      <p class="leading-7">A <RouterLink to="/install" class="underline underline-offset-4">host</RouterLink> runs the Thue++ engine. This repository ships {{ hostProseList }}. The engine runs a program, any <code>.tpp</code> file, and the program handles input and output. Some programs are interpreters, such as Lisp and Forth, that run scripts. Others are apps written directly in Thue++. Those programs are the <RouterLink to="/projects" class="underline underline-offset-4">sandboxed projects</RouterLink>. A new interpreter binds stdin, stdout, and stderr, and it starts with limits so a run cannot go on forever.</p>
    </section>
    <section id="try-it" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Try it</h2>
      <p class="leading-7">The <RouterLink to="/playground" class="underline underline-offset-4">playground</RouterLink> loads the Go host compiled to WebAssembly. Step runs one rewrite, and the step limit is on before you press anything.</p>
    </section>
  </DocPage>
</template>
