<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import DocPage from '@/components/DocPage.vue'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { pages } from '@/site'

const page = pages.reference

const operators = [
  ['::=', 'Replace the matched text in the state.'],
  ['::>', 'Write the replacement to a named resource.'],
  ['::<', 'Read a line from a named resource into the match.'],
  ['::-', 'Stop the run and return an integer. This does not consume an applied step.'],
  ['::!', 'Call a builtin, such as arithmetic.'],
  ['::|', 'Search the whole state and bind captures for the rest of the rule.'],
]

const limits = [
  ['Max steps', '1000000', 'Applied rewrites. The Nth rewrite exits 10.'],
  ['Max evals', '1000000', 'Rule probes, including misses. Past the limit exits 11.'],
  ['Max state bytes', '8388608', 'UTF-8 length after a replacement. Past the limit exits 12.'],
]
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title">
    <template #actions>
      <Button as-child>
        <RouterLink to="/playground">Run a rule</RouterLink>
      </Button>
    </template>
    <section id="operators" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Operators</h2>
      <p class="leading-7">Rules are tried in order. The first pattern that matches is the one that runs. Patterns are RE2.</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Operator</TableHead>
            <TableHead>Effect</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in operators" :key="row[0]">
            <TableCell class="font-mono">{{ row[0] }}</TableCell>
            <TableCell>{{ row[1] }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </section>
    <section id="resources" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Resources</h2>
      <p class="leading-7">A new interpreter binds <code>stdin</code>, <code>stdout</code>, and <code>stderr</code>. Guest rules cannot open files, sockets, or processes. A host may bind more resources by name. The WebAssembly host rejects process bindings. A <code>::&lt;</code> read that passes its timeout exits 13.</p>
    </section>
    <section id="limits" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Limits</h2>
      <p class="leading-7">A new interpreter starts with these limits. A host can raise them or clear one with an explicit unlimited value. <code>0</code> is a limit of zero, not unlimited.</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Limit</TableHead>
            <TableHead>Default</TableHead>
            <TableHead>Stop</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in limits" :key="row[0]">
            <TableCell>{{ row[0] }}</TableCell>
            <TableCell class="font-mono">{{ row[1] }}</TableCell>
            <TableCell>{{ row[2] }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p class="text-muted-foreground leading-7">Exit 0 is quiescence, or the integer from <code>::-</code>. Exit 1 is any other runtime error. Exit 2 is CLI usage. The <RouterLink to="/hosts" class="underline underline-offset-4">hosts</RouterLink> share this contract.</p>
    </section>
  </DocPage>
</template>
