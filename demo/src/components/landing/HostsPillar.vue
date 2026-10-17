<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PillarFrame from './PillarFrame.vue'
import { registryHosts } from '@/hosts'
</script>

<template>
  <PillarFrame id="multi-platform" title="multi-platform" mode="search" label="Rex looks across the hosts" settled="yes" ok="yes">
    <ul data-test="registry-hosts" class="grid grid-cols-2 gap-2">
      <li v-for="host in registryHosts" :key="host.id">
        <RouterLink
          :to="host.href"
          data-test="registry-host"
          :data-host-id="host.id"
          class="border-line bg-surface hover:border-signal flex min-h-16 flex-col justify-center border px-3 py-2"
        >
          <span class="font-mono text-[15px]">{{ host.landing }}</span>
          <span v-if="host.id !== host.landing" class="text-ash font-mono text-[12px]">{{ host.id }}</span>
        </RouterLink>
      </li>
    </ul>
  </PillarFrame>
</template>
