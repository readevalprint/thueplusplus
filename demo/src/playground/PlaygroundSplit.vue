<script setup lang="ts">
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'

defineProps<{
  stacked: boolean
}>()
</script>

<template>
  <ResizablePanelGroup
    v-if="stacked"
    direction="vertical"
    auto-save-id="thuepp-playground-split-stack"
    data-test="playground-split"
    data-direction="vertical"
    class="min-h-0 flex-1"
    :keyboard-resize-by="4"
  >
    <ResizablePanel :default-size="45" :min-size="20" :collapsible="true" :collapsed-size="8" class="min-h-0">
      <slot name="output" />
    </ResizablePanel>
    <ResizableHandle with-handle aria-label="Resize output and editor" />
    <ResizablePanel :default-size="55" :min-size="20" :collapsible="true" :collapsed-size="8" class="min-h-0">
      <slot name="editor" />
    </ResizablePanel>
  </ResizablePanelGroup>
  <ResizablePanelGroup
    v-else
    direction="horizontal"
    auto-save-id="thuepp-playground-split"
    data-test="playground-split"
    data-direction="horizontal"
    class="min-h-0 flex-1"
    :keyboard-resize-by="4"
  >
    <ResizablePanel id="editor" :default-size="38" :min-size="18" :collapsible="true" :collapsed-size="2" class="min-w-0">
      <slot name="editor" />
    </ResizablePanel>
    <ResizableHandle with-handle aria-label="Resize editor and output" />
    <ResizablePanel :default-size="62" :min-size="24" :collapsible="true" :collapsed-size="2" class="min-w-0">
      <slot name="output" />
    </ResizablePanel>
  </ResizablePanelGroup>
</template>
