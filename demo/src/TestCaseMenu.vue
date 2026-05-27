<template>
  <TreeRoot
    v-slot="{ flattenItems }"
    v-model:expanded="expandedKeys"
    class="test-case-tree"
    data-test="test-case-menu"
    :items="treeItems"
    :get-key="itemKey"
    aria-label="Example test cases"
  >
    <TreeItem
      v-for="item in flattenItems"
      :key="item._id"
      v-bind="item.bind"
      v-slot="{ isExpanded }"
      as-child
      @select="event => selectTreeItem(event, item.value)"
    >
      <button
        type="button"
        class="test-case-tree-item"
        :class="[`level-${item.level}`, { active: item.value.option?.id === selectedId }]"
        data-test="test-case-tree-item"
        :data-kind="item.value.kind"
        :data-test-case-id="item.value.option?.id"
      >
        <span class="test-case-tree-disclosure" aria-hidden="true">{{ item.hasChildren ? (isExpanded ? '▾' : '▸') : '' }}</span>
        <span class="test-case-tree-copy">
          <span class="test-case-tree-title" data-test="test-case-tree-title">{{ item.value.title }}</span>
          <span v-if="item.value.subtitle" class="test-case-tree-subtitle" data-test="test-case-tree-subtitle">{{ item.value.subtitle }}</span>
        </span>
      </button>
    </TreeItem>
  </TreeRoot>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { TreeItem, TreeRoot } from 'reka-ui'
import type { TestCaseOption } from './testCases'

interface TestCaseTreeNode {
  kind: 'program' | 'case'
  key: string
  title: string
  subtitle?: string
  option?: TestCaseOption
  children?: TestCaseTreeNode[]
}

const props = defineProps<{
  options: TestCaseOption[]
  selectedId?: string
  currentProgramPath?: string
}>()

const emit = defineEmits<{
  select: [option: TestCaseOption]
}>()

const expandedKeys = ref<string[]>([])

const treeItems = computed<TestCaseTreeNode[]>(() => {
  const byProgram = new Map<string, TestCaseOption[]>()
  for (const option of props.options) {
    const current = byProgram.get(option.programPath) ?? []
    current.push(option)
    byProgram.set(option.programPath, current)
  }
  return [...byProgram.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([programPath, options]) => ({
      kind: 'program',
      key: `program:${programPath}`,
      title: programPath,
      subtitle: `${options.length} ${options.length === 1 ? 'case' : 'cases'}`,
      children: [...options]
        .sort((left, right) => left.caseName.localeCompare(right.caseName))
        .map(option => ({
          kind: 'case',
          key: `case:${option.id}`,
          title: option.caseName,
          subtitle: option.manifestPath,
          option,
        })),
    }))
})

watch(
  () => [props.currentProgramPath, props.selectedId, treeItems.value] as const,
  () => {
    const selectedProgram = treeItems.value.find(group => group.children?.some(item => item.option?.id === props.selectedId))
    const currentProgram = props.currentProgramPath ? treeItems.value.find(group => group.title === props.currentProgramPath) : undefined
    const preferred = selectedProgram ?? currentProgram
    if (!preferred) return
    if (!expandedKeys.value.includes(preferred.key)) expandedKeys.value = [...expandedKeys.value, preferred.key]
  },
  { immediate: true },
)

function itemKey(item: TestCaseTreeNode): string {
  return item.key
}

function selectTreeItem(event: CustomEvent, item: TestCaseTreeNode): void {
  if (!item.option) {
    event.preventDefault()
    return
  }
  emit('select', item.option)
}
</script>
