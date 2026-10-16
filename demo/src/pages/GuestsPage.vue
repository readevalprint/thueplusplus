<script setup lang="ts">
import DocPage from '@/components/DocPage.vue'
import { pages } from '@/site'

const page = pages.guests
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title">
    <section id="what-a-guest-is" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">What a guest is</h2>
      <p class="leading-7">A guest is a language implemented in Thue++. Its programs are state. Its semantics are rules. A host runs those rules. The guest does not get files, sockets, or processes unless that host binds them.</p>
    </section>
    <section id="lisp" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Lisp</h2>
      <p class="text-muted-foreground leading-7">Placeholder. A Lisp guest is in the repository examples. The catalog entry for it is not on this page yet.</p>
    </section>
    <section id="forth" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Forth</h2>
      <p class="text-muted-foreground leading-7">Placeholder. A Forth guest is in the repository examples. The catalog entry for it is not on this page yet.</p>
    </section>
    <section id="catalog" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Catalog</h2>
      <p class="text-muted-foreground leading-7">Placeholder. The guest list, with programs and what they implement, will be filled in here.</p>
    </section>
  </DocPage>
</template>
