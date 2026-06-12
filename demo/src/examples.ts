// SPDX-License-Identifier: AGPL-3.0-or-later
export interface DemoResourceExample {
  name: string
  inputText: string
  readError?: string
}

export interface DemoExample {
  id: string
  name: string
  description: string
  sourcePath: string
  sourceText: string
  input: string
  resources: DemoResourceExample[]
  coverage?: boolean
  evalLimit?: number
  maxStateBytes?: number
}

export const examples: DemoExample[] = [
  {
    id: 'hello',
    name: 'Hello stdout',
    description: 'Writes a greeting through the WASM stdout resource.',
    sourcePath: 'hello.tpp',
    sourceText: `^hello$ ::> stdout Hello from Go-WASM!\\n

hello
`,
    input: '',
    resources: [],
    coverage: true,
  },
  {
    id: 'stdin',
    name: 'Stdin greeting',
    description: 'Reads one browser-provided stdin line and writes a greeting.',
    sourcePath: 'stdin-greeting.tpp',
    sourceText: `^start$ ::< 1s 1 lines stdin
^(?<name>[A-Za-z]+)$ ::> stdout hello {{name|pctdec}}!\\n

start
`,
    input: 'Ada\n',
    resources: [],
  },
  {
    id: 'resource-echo',
    name: 'Custom resource echo',
    description: 'Uses a named callback resource. Writes are logged, and reads consume its input text.',
    sourcePath: 'resource-echo.tpp',
    sourceText: `^start$ ::= WRITE\\nread
^WRITE$ ::> echo ping\\n
^read$ ::= response:@R@
@R@ ::< 1s 1 lines echo
^response:(?<value>(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*)$ ::> stdout {{value|pctdec}}\\n

start
`,
    input: '',
    resources: [{ name: 'echo', inputText: 'ping\n' }],
  },
  {
    id: 'coverage',
    name: 'Coverage TSV',
    description: 'Runs with coverage enabled and shows both raw TSV and a parsed table.',
    sourcePath: 'coverage-demo.tpp',
    sourceText: `^start$ ::= middle
^middle$ ::= done
^done$ ::> stdout covered\\n

start
`,
    input: '',
    resources: [],
    coverage: true,
  },
  {
    id: 'error',
    name: 'Resource error',
    description: 'A callback read error is surfaced intact as ERR:resource:<name>:...',
    sourcePath: 'resource-error.tpp',
    sourceText: `^start$ ::< 1s 1 lines broken
start
`,
    input: '',
    resources: [{ name: 'broken', inputText: '', readError: 'boom' }],
  },
  {
    id: 'timeout',
    name: 'Resource timeout',
    description: 'A resource timeout callback returns an error without any JS subprocess emulation.',
    sourcePath: 'timeout.tpp',
    sourceText: `^start$ ::< 1s 1 lines sleepy
start
`,
    input: '',
    resources: [{ name: 'sleepy', inputText: '', readError: 'timeout' }],
  },
]
