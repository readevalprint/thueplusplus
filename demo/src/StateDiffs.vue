<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <section ref="timeline" class="state-diffs" data-test="playground-diffs" aria-label="state history">
    <Table>
      <TableBody>
        <template v-if="table.getRowModel().rows.length">
          <template v-for="row in table.getRowModel().rows" :key="row.original.key">
            <TableRow
              class="state-diff-row"
              :class="{ selected: row.original.key === selectedKey, future: isFuture(row.original) }"
              :data-test="`playground-diff-${row.original.step}`"
              :data-selected="row.original.key === selectedKey || undefined"
              :data-future="isFuture(row.original) || undefined"
              :data-state="row.original.key === selectedKey ? 'selected' : undefined"
              tabindex="0"
              @click="emit('select', row.original.key)"
              @keydown.enter.prevent="emit('select', row.original.key)"
              @keydown.space.prevent="emit('select', row.original.key)"
            >
              <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id" :class="cell.column.columnDef.meta?.class">
                <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
              </TableCell>
            </TableRow>
          </template>
        </template>
        <TableRow v-else>
          <TableCell :colspan="columns.length" class="state-diff-empty">No state history yet.</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </section>
</template>

<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import {
  FlexRender,
  getCoreRowModel,
  useVueTable,
} from '@tanstack/vue-table'
import { nextTick, h, ref, watch } from 'vue'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'

interface DiffPart {
  key: string
  text: string
  changed: boolean
  ellipsis?: boolean
}

interface StateDiffEntry {
  key: string
  step: number
  row: number
  rule: string
  stateBefore: string
  stateAfter: string
  before: DiffPart[]
  after: DiffPart[]
  error?: string
  note?: string
}

declare module '@tanstack/vue-table' {
  interface ColumnMeta<TData, TValue> {
    class?: string
  }
}

const props = defineProps<{
  entries: StateDiffEntry[]
  selectedKey?: string
}>()

const emit = defineEmits<{
  select: [key: string]
}>()

const timeline = ref<HTMLElement | null>(null)

const columns: ColumnDef<StateDiffEntry>[] = [
  {
    id: 'entry',
    cell: ({ row }) => entryCell(row.original),
    meta: { class: 'state-diff-entry-cell' },
  },
]

const table = useVueTable({
  get data() { return props.entries },
  get columns() { return columns },
  getRowId: row => row.key,
  getCoreRowModel: getCoreRowModel(),
})

watch(() => props.entries.length, async () => {
  await nextTick()
  if (timeline.value) timeline.value.scrollTop = timeline.value.scrollHeight
})

function isFuture(entry: StateDiffEntry): boolean {
  const selectedIndex = props.entries.findIndex(item => item.key === props.selectedKey)
  const entryIndex = props.entries.findIndex(item => item.key === entry.key)
  return selectedIndex >= 0 && entryIndex > selectedIndex
}

function entryCell(entry: StateDiffEntry) {
  return h('div', { class: 'state-diff-entry-body' }, [
    h('div', { class: 'state-diff-field state-diff-rule-field' }, [
      h('div', { class: 'state-diff-rule', 'data-test': 'playground-diff-rule' }, entry.rule),
    ]),
    diffCell(entry),
  ])
}

function diffCell(entry: StateDiffEntry) {
  if (entry.error) return h('div', { class: 'state-diff-error', 'data-test': 'playground-diff-error' }, entry.error)
  if (entry.note) return h('div', { class: 'state-diff-note', 'data-test': 'playground-diff-note' }, entry.note)
  return h('div', { class: 'state-diff-lines' }, [
    h('div', { class: 'state-diff-field' }, [
      diffLine(entry.before, 'removed'),
    ]),
    h('div', { class: 'state-diff-field' }, [
      diffLine(entry.after, 'added'),
    ]),
  ])
}

function diffLine(parts: DiffPart[], side: 'removed' | 'added') {
  return h('div', { class: `state-diff-line ${side}` }, [
    ...parts.map(part => h('span', { key: part.key, class: partClass(part, side) }, part.text)),
  ])
}

function partClass(part: DiffPart, side: 'removed' | 'added'): Record<string, boolean> {
  return {
    [`state-diff-char-${side}`]: part.changed,
    'state-diff-ellipsis': Boolean(part.ellipsis),
  }
}
</script>
