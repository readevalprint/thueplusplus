<template>
  <div class="test-case-menu-row">
    <span class="test-case-menu-label">Select an example</span>
    <NavigationMenu data-test="test-case-menu">
      <NavigationMenuList>
        <NavigationMenuItem v-for="group in menuGroups" :key="group.label">
          <NavigationMenuTrigger data-test="test-case-menu-trigger">{{ group.label }}</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul class="grid w-[24rem] gap-3 p-4 md:w-[34rem] md:grid-cols-2">
              <li v-for="option in group.options" :key="option.id">
                <NavigationMenuLink
                  as="button"
                  type="button"
                  class="cursor-pointer text-left"
                  data-test="test-case-menu-case"
                  :data-test-case-id="option.id"
                  @click="emit('select', option)"
                >
                  <span class="text-sm leading-none font-medium" data-test="test-case-menu-case-name">{{ option.menuLabel }}</span>
                  <span class="text-muted-foreground line-clamp-2 text-sm leading-snug" data-test="test-case-menu-case-description">{{ option.menuDescription }}</span>
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import type { TestCaseOption } from './testCases'

const props = defineProps<{
  options: TestCaseOption[]
}>()

const emit = defineEmits<{
  select: [option: TestCaseOption]
}>()

interface CuratedExample {
  manifestPath: string
  caseName?: string
  label: string
  description: string
}

interface CuratedGroup {
  label: string
  examples: CuratedExample[]
}

type MenuOption = TestCaseOption & {
  menuLabel: string
  menuDescription: string
}

interface MenuGroup {
  label: string
  options: MenuOption[]
}

const curatedGroups: CuratedGroup[] = [
  {
    label: 'Basic rules',
    examples: [
      {
        manifestPath: 'examples/hello/tests/basic.toml',
        label: 'Hello rewrite',
        description: 'Smallest complete program: one rule rewrites START into a greeting.',
      },
      {
        manifestPath: 'examples/pattern-alias/tests/dollar_transitive.toml',
        label: 'Pattern aliases',
        description: 'Builds readable regex fragments with $ aliases and nested reuse.',
      },
      {
        manifestPath: 'examples/multiline/tests/basic.toml',
        label: 'Multiline state',
        description: 'Demonstrates rules matching across a state with multiple rows.',
      },
      {
        manifestPath: 'examples/pattern-order/tests/basic.toml',
        label: 'Pattern order',
        description: 'Illustrates first-match rule ordering when more than one rule could apply.',
      },
    ],
  },
  {
    label: 'I/O',
    examples: [
      {
        manifestPath: 'examples/echo/tests/proc-input.toml',
        label: 'Echo stdin',
        description: 'Reads external input and writes it back through the resource pane.',
      },
      {
        manifestPath: 'examples/process/tests/write-read-line.toml',
        label: 'Write/read line',
        description: 'Writes to a process resource, then reads a newline-delimited response.',
      },
      {
        manifestPath: 'examples/process/tests/sequential-line-read.toml',
        label: 'Sequential reads',
        description: 'Consumes multiple process lines in order so resource state is visible.',
      },
      {
        manifestPath: 'examples/lisp/tests/io_acceptance.toml',
        caseName: 'write emits string and returns empty list',
        label: 'Lisp write',
        description: 'Runs the Lisp write primitive and shows stdout as a first-class effect.',
      },
      {
        manifestPath: 'examples/lisp/tests/io_acceptance.toml',
        caseName: 'readline returns line without prompt',
        label: 'Lisp readline',
        description: 'Reads one stdin line into Lisp without hidden prompt behavior.',
      },
    ],
  },
  {
    label: 'Resources',
    examples: [
      {
        manifestPath: 'examples/guess-number/tests/basic.toml',
        label: 'Guess number',
        description: 'Uses random/stdin/stdout resources in a small interactive program.',
      },
      {
        manifestPath: 'examples/process/tests/basic.toml',
        label: 'Process resource',
        description: 'Minimal process resource call for seeing external process plumbing.',
      },
      {
        manifestPath: 'examples/process/tests/line-read.toml',
        label: 'Line read',
        description: 'Waits for and consumes one newline-delimited process response.',
      },
      {
        manifestPath: 'examples/process/tests/line-timeout.toml',
        label: 'Line timeout',
        description: 'Fail-loud resource timeout path with compact stderr reporting.',
      },
    ],
  },
  {
    label: 'Calcs',
    examples: [
      {
        manifestPath: 'examples/counter/tests/basic.toml',
        label: 'Counter',
        description: 'A numeric state machine that increments through repeated rewrites.',
      },
      {
        manifestPath: 'examples/fibonacci/tests/basic.toml',
        label: 'Fibonacci',
        description: 'Calculates a sequence with repeated pattern rewrites.',
      },
      {
        manifestPath: 'examples/builtin/tests/basic.toml',
        caseName: 'add replaces matched span',
        label: 'Add',
        description: 'Applies the built-in add primitive to a captured numeric span.',
      },
      {
        manifestPath: 'examples/builtin/tests/basic.toml',
        caseName: 'div exact rational',
        label: 'Rational division',
        description: 'Shows exact rational output instead of decimal approximation.',
      },
      {
        manifestPath: 'examples/builtin/tests/basic.toml',
        caseName: 'fraction arithmetic reduces',
        label: 'Fraction reduction',
        description: 'Reduces fraction arithmetic to canonical form.',
      },
      {
        manifestPath: 'examples/pct/tests/basic.toml',
        label: 'Percent rules',
        description: 'Uses % syntax for compact replacement rules.',
      },
    ],
  },
  {
    label: 'Forth',
    examples: [
      {
        manifestPath: 'examples/forth/tests/core.toml',
        caseName: 'push integers renders top first',
        label: 'Stack push',
        description: 'Pushes integers and renders the stack with the top value first.',
      },
      {
        manifestPath: 'examples/forth/tests/core.toml',
        caseName: 'addition',
        label: 'Addition',
        description: 'Runs a basic Forth-style binary operator over the stack.',
      },
      {
        manifestPath: 'examples/forth/tests/core.toml',
        caseName: 'dup',
        label: 'Dup',
        description: 'Duplicates the top stack value with the core dup word.',
      },
      {
        manifestPath: 'examples/forth/tests/core.toml',
        caseName: 'chained expression',
        label: 'Chained expression',
        description: 'Combines several stack words into one longer expression.',
      },
    ],
  },
  {
    label: 'Lisp',
    examples: [
      {
        manifestPath: 'examples/lisp/tests/core_acceptance.toml',
        caseName: 'nested math',
        label: 'Nested math',
        description: 'Evaluates nested arithmetic forms through the Lisp interpreter.',
      },
      {
        manifestPath: 'examples/lisp/tests/core_acceptance.toml',
        caseName: 'if lazy',
        label: 'Lazy if',
        description: 'Shows control forms evaluating only the selected branch.',
      },
      {
        manifestPath: 'examples/lisp/tests/eval_acceptance.toml',
        caseName: 'eval generated list code',
        label: 'Eval generated code',
        description: 'Builds list-shaped code data and evaluates it explicitly.',
      },
      {
        manifestPath: 'examples/lisp/tests/closure_binding_flattening.toml',
        caseName: 'zero arg closure call still evaluates body',
        label: 'Closure call',
        description: 'Calls a zero-argument closure and returns the body value.',
      },
      {
        manifestPath: 'examples/lisp/tests/quote_list_acceptance.toml',
        caseName: 'quote nested source list',
        label: 'Quote list',
        description: 'Treats nested Lisp source as data instead of evaluating it.',
      },
      {
        manifestPath: 'examples/lisp/tests/macroexpand_acceptance.toml',
        caseName: 'macroexpand simple macro to code data',
        label: 'Macroexpand',
        description: 'Expands a macro into code data without running the final expression.',
      },
    ],
  },
]

const menuGroups = computed<MenuGroup[]>(() => {
  const byManifest = new Map<string, TestCaseOption[]>()
  for (const option of props.options) {
    const options = byManifest.get(option.manifestPath) ?? []
    options.push(option)
    byManifest.set(option.manifestPath, options)
  }

  return curatedGroups
    .map(group => ({
      label: group.label,
      options: group.examples.flatMap(example => {
        const matches = byManifest.get(example.manifestPath) ?? []
        const selected = example.caseName
          ? matches.filter(option => option.caseName === example.caseName)
          : matches.slice(0, 1)
        return selected.map(option => ({ ...option, menuLabel: example.label, menuDescription: example.description }))
      }),
    }))
    .filter(group => group.options.length > 0)
})
</script>
