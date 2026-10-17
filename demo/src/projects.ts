export interface SandboxProject {
  id: string
  name: string
  description: string
  program: string
}

export const projects: SandboxProject[] = [
  {
    id: 'forth',
    name: 'Forth',
    description: 'A stack language. The script is the program input.',
    program: 'langs/forth/forth.tpp',
  },
  {
    id: 'lisp',
    name: 'Lisp',
    description: 'A Lisp evaluator. The script is the program input.',
    program: 'langs/lisp/lisp.tpp',
  },
  {
    id: 'basic',
    name: 'BASIC',
    description: 'A line-oriented BASIC. The script is the program input.',
    program: 'langs/basic/basic.tpp',
  },
  {
    id: 'brainfuck',
    name: 'Brainfuck',
    description: 'An 8-bit wrapping Brainfuck machine. The script is the program input.',
    program: 'examples/brainfuck/brainfuck.tpp',
  },
  {
    id: 'hello',
    name: 'Hello',
    description: 'Writes a greeting to stdout and stops.',
    program: 'examples/hello/hello.tpp',
  },
  {
    id: 'guess-the-number',
    name: 'Guess the number',
    description: 'Reads guesses and answers higher, lower, or correct.',
    program: 'examples/guess-number/guess-number.tpp',
  },
  {
    id: 'echo',
    name: 'Echo',
    description: 'Reads a line and writes it back.',
    program: 'examples/echo/echo.tpp',
  },
  {
    id: 'fibonacci',
    name: 'Fibonacci',
    description: 'Prints Fibonacci numbers by rewriting the state.',
    program: 'examples/fibonacci/fibonacci.tpp',
  },
  {
    id: 'counter',
    name: 'Counter',
    description: 'Counts by rewriting one state string.',
    program: 'examples/counter/counter.tpp',
  },
  {
    id: 'cow-kv',
    name: 'Copy-on-write KV',
    description: 'A key-value protocol encoded in one state string.',
    program: 'examples/cow-kv/cow-kv.tpp',
  },
]

const ids = projects.map(project => project.id)
if (new Set(ids).size !== ids.length) throw new Error('sandboxed projects have a duplicate id')
for (const project of projects) {
  if (project.name.length === 0 || project.description.length === 0 || !project.program.endsWith('.tpp')) {
    throw new Error(`sandboxed project ${project.id} is incomplete`)
  }
}
