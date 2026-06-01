<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <Table data-test="koan-solutions-table">
    <TableHeader>
      <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
        <TableHead v-for="header in headerGroup.headers" :key="header.id">
          <FlexRender
            v-if="!header.isPlaceholder"
            :render="header.column.columnDef.header"
            :props="header.getContext()"
          />
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow
        v-for="row in table.getRowModel().rows"
        :id="row.original.id"
        :key="row.original.id"
        :data-test="`solution-${row.original.id}`"
        class="cursor-pointer"
        role="link"
        tabindex="0"
        @click="openSolution(row.original, $event)"
        @keydown.enter.prevent="openSolution(row.original, $event)"
        @keydown.space.prevent="openSolution(row.original, $event)"
      >
        <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
          <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
        </TableCell>
      </TableRow>
      <TableRow v-if="!table.getRowModel().rows.length">
        <TableCell :colspan="columns.length">No qualifying solutions yet.</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>

<script setup lang="ts">
import type { Column, ColumnDef, SortingState } from '@tanstack/vue-table'
import {
  FlexRender,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
} from '@tanstack/vue-table'
import { ExternalLink } from '@lucide/vue'
import { h, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { KoanSolution } from './types'

const props = defineProps<{
  solutions: KoanSolution[]
}>()

const sorting = ref<SortingState>([])

const columns: ColumnDef<KoanSolution>[] = [
  {
    accessorKey: 'author',
    header: ({ column }) => sortButton(column, 'Author'),
    cell: ({ row }) => h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap' } }, [
      row.original.author,
      h('a', {
        style: { display: 'inline-flex', alignItems: 'center', verticalAlign: 'text-bottom' },
        href: row.original.website,
        rel: 'author noopener',
        target: '_blank',
        'aria-label': `${row.original.author} website`,
      }, [h(ExternalLink, { 'aria-hidden': 'true', style: { display: 'inline-block' }, size: 14 })]),
    ]),
  },
  {
    accessorKey: 'title',
    header: ({ column }) => sortButton(column, 'Title'),
    cell: ({ row }) => row.original.title,
  },
  {
    accessorKey: 'ruleCount',
    header: ({ column }) => sortButton(column, 'Rules'),
    cell: ({ row }) => String(row.original.ruleCount),
  },
  {
    accessorKey: 'stepCount',
    header: ({ column }) => sortButton(column, 'Steps'),
    cell: ({ row }) => String(row.original.stepCount),
  },
  {
    accessorKey: 'evalCheckCount',
    header: ({ column }) => sortButton(column, 'Eval Checks'),
    cell: ({ row }) => String(row.original.evalCheckCount),
  },
  {
    accessorKey: 'cumulativeStateBytes',
    header: ({ column }) => sortButton(column, 'Cumulative State'),
    cell: ({ row }) => `${row.original.cumulativeStateBytes} bytes`,
  },
]

const table = useVueTable({
  get data() { return props.solutions },
  get columns() { return columns },
  getRowId: row => row.id,
  state: {
    get sorting() { return sorting.value },
  },
  onSortingChange: updater => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
})

function sortButton(column: Column<KoanSolution, unknown>, label: string) {
  const sorted = column.getIsSorted()
  const suffix = sorted === 'asc' ? ' ↑' : sorted === 'desc' ? ' ↓' : ''
  return h(Button, {
    variant: 'ghost',
    size: 'sm',
    type: 'button',
    'data-test': `solution-sort-${column.id}`,
    onClick: () => column.toggleSorting(sorted === 'asc'),
  }, () => `${label}${suffix}`)
}

function openSolution(solution: KoanSolution, event: MouseEvent | KeyboardEvent): void {
  if (isInteractiveElement(event.target)) return
  window.location.href = solution.path
}

function isInteractiveElement(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('a, button, input, select, textarea, [role="button"]'))
}
</script>
