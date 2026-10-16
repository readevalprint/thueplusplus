<script setup lang="ts">
import { RouterLink } from 'vue-router'
import RewriteGraphic from '@/components/landing/RewriteGraphic.vue'
</script>

<template>
  <div data-test="landing" class="mx-auto flex w-full max-w-prose flex-col gap-8 px-6 pt-10 pb-16">
    <header class="flex flex-col gap-6">
      <div>
        <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">Thue++</h1>
        <p class="mt-2 text-lg leading-7">The safest, smallest, sandbox.</p>
      </div>
      <RewriteGraphic />
    </header>
    <p data-test="landing-languages" class="leading-7">Available in <RouterLink to="/hosts#go" class="underline underline-offset-4">go</RouterLink>, <RouterLink to="/hosts#python" class="underline underline-offset-4">python</RouterLink>, <RouterLink to="/hosts#javascript" class="underline underline-offset-4">js</RouterLink>, and soon cpp, erlang, ocaml, perl, ruby, haskell, rust.</p>
  </div>
</template>
