export interface DemoResourceExample {
  name: string
  inputText: string
  readError?: string
}

export interface DemoIncludeExample {
  path: string
  sourceText: string
}

export interface DemoExample {
  id: string
  name: string
  description: string
  sourcePath: string
  sourceText: string
  input: string
  resources: DemoResourceExample[]
  includes: DemoIncludeExample[]
  coverage?: boolean
  maxEvals?: number
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
    includes: [],
    coverage: true,
  },
  {
    id: 'stdin',
    name: 'Stdin greeting',
    description: 'Reads one browser-provided stdin line and writes a greeting.',
    sourcePath: 'stdin-greeting.tpp',
    sourceText: `^start$ ::< 1 stdin
^(?<name>[A-Za-z]+)$ ::> stdout hello {{name|pctdec}}!\\n

start
`,
    input: 'Ada\n',
    resources: [],
    includes: [],
  },
  {
    id: 'resource-echo',
    name: 'Custom resource echo',
    description: 'Uses a named callback resource. Writes are logged, and reads consume its input text.',
    sourcePath: 'resource-echo.tpp',
    sourceText: `^start$ ::= WRITE\\nread
^WRITE$ ::> echo ping\\n
^read$ ::= response:@R@
@R@ ::< 1 echo
^response:(?<value>(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*)$ ::> stdout {{value|pctdec}}\\n

start
`,
    input: '',
    resources: [{ name: 'echo', inputText: 'ping\n' }],
    includes: [],
  },
  {
    id: 'include',
    name: 'Include map',
    description: 'Resolves @include through the browser include map, not the filesystem.',
    sourcePath: 'main.tpp',
    sourceText: `@include lib/greet.tpp
hello
`,
    input: '',
    resources: [],
    includes: [{ path: 'lib/greet.tpp', sourceText: '^hello$ ::> stdout included from map\\n' }],
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
    includes: [],
    coverage: true,
  },
  {
    id: 'error',
    name: 'Resource error',
    description: 'A callback read error is surfaced intact as ERR:resource:<name>:...',
    sourcePath: 'resource-error.tpp',
    sourceText: `^start$ ::< 1 broken
start
`,
    input: '',
    resources: [{ name: 'broken', inputText: '', readError: 'boom' }],
    includes: [],
  },
  {
    id: 'timeout',
    name: 'Resource timeout',
    description: 'A resource timeout callback returns an error without any JS subprocess emulation.',
    sourcePath: 'timeout.tpp',
    sourceText: `^start$ ::< 1 sleepy
start
`,
    input: '',
    resources: [{ name: 'sleepy', inputText: '', readError: 'timeout' }],
    includes: [],
  },
]
