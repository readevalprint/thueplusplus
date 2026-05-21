export interface DemoExample {
  id: string
  name: string
  description: string
  sourceText: string
  input: string
}

export const examples: DemoExample[] = [
  {
    id: 'hello',
    name: 'Hello stdout',
    description: 'Writes a greeting through the WASM stdout resource.',
    sourceText: `hello ::> stdout Hello from Go-WASM!\\n
stop ::- 0
::=
hello
stop
`,
    input: '',
  },
  {
    id: 'stdin',
    name: 'Stdin greeting',
    description: 'Reads one line from browser-provided stdin and writes a greeting.',
    sourceText: `^start$ ::< 1 stdin
^(?<name>[A-Za-z]+)$ ::> stdout hello {{name|pctdec}}!\\n
::=
start
`,
    input: 'Ada\n',
  },
]
