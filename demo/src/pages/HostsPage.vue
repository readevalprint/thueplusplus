<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import DocPage from '@/components/DocPage.vue'
import { pages } from '@/site'

const page = pages.hosts
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title">
    <template #actions>
      <Button as-child>
        <RouterLink to="/playground">Run the JavaScript host</RouterLink>
      </Button>
    </template>
    <p class="leading-7">A host is an implementation of Thue++. The same rules should get the same answer. Three hosts are in this repository.</p>
    <section id="go" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Go</h2>
      <p class="leading-7">The Go interpreter is the host behind the <code>thuepp</code> command and behind the WebAssembly module. A new interpreter binds stdin, stdout, and stderr, and starts with the default step, probe, and state limits.</p>
    </section>
    <section id="python" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Python</h2>
      <p class="leading-7">The Python host is the other native implementation. It uses RE2 and the same default limits. Process bindings stay opt-in, the same way they do in Go.</p>
    </section>
    <section id="javascript" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">JavaScript</h2>
      <p class="leading-7">The JavaScript host is the Go interpreter compiled to WebAssembly, not a second language written in JavaScript. This site's playground loads that module. It rejects process bindings. Runs from the page pass a step limit.</p>
    </section>
  </DocPage>
</template>
