const assert = require('assert')

class MockWorker {
  constructor(url, options) {
    this.url = url
    this.options = options
    this.messages = []
    this.terminated = false
    MockWorker.last = this
  }

  postMessage(message) {
    this.messages.push(message)
  }

  terminate() {
    this.terminated = true
  }
}

async function rejectsWith(promise, pattern) {
  let rejected = false
  try {
    await promise
  } catch (err) {
    rejected = true
    assert.match(String(err && err.message || err), pattern)
  }
  assert.ok(rejected, `expected rejection matching ${pattern}`)
}

;(async () => {
  const { ThueWorker } = await import('./src/worker-client.js')

  const errorClient = new ThueWorker('worker.js', {}, { Worker: MockWorker, requestTimeoutMs: 0 })
  assert.deepStrictEqual(MockWorker.last.options, { type: 'module' })
  MockWorker.last.onerror({ message: 'blocked by CSP' })
  await rejectsWith(errorClient.ready, /blocked by CSP/)

  const runtimeClient = new ThueWorker('worker.js', {}, { Worker: MockWorker, requestTimeoutMs: 0 })
  MockWorker.last.onmessage({ data: { type: 'runtime-error', error: 'worker died' } })
  await rejectsWith(runtimeClient.ready, /worker died/)

  const timeoutClient = new ThueWorker('worker.js', {}, { Worker: MockWorker, requestTimeoutMs: 5 })
  await rejectsWith(timeoutClient.ready, /request timed out: init/)
  assert.strictEqual(MockWorker.last.messages[0].type, 'init')

  const { buildResources, shiftLine, splitLines } = await import('./src/browser-worker.js')
  assert.deepStrictEqual(splitLines('a\r\nb\n'), ['a', 'b'])
  const buffer = { text: 'one\r\ntwo\n' }
  assert.strictEqual(shiftLine(buffer), 'one')
  assert.strictEqual(shiftLine(buffer), 'two')

  const stdin = buildResources({ input: 'a\n\n' })
  assert.strictEqual(stdin.resources.stdin.readLine(), 'a')
  assert.strictEqual(stdin.resources.stdin.readLine(), '')
  assert.deepStrictEqual(stdin.logs[0].reads, ['a', ''])

  const resource = buildResources({
    resourceConfig: [{ name: 'echo', inputText: '  ping  \nlast' }],
  })
  resource.resources.echo.write('ignored by reads\n')
  assert.strictEqual(resource.resources.echo.readLine(), '  ping  \nlast')
  assert.strictEqual(resource.resources.echo.readLine().error, 'pending_input:echo')
  const echoLog = resource.logs.find((log) => log.name === 'echo')
  assert.deepStrictEqual(echoLog.writes, ['ignored by reads\n'])
  assert.deepStrictEqual(echoLog.reads, ['  ping  \nlast'])
  assert.deepStrictEqual(echoLog.errors, ['pending_input:echo'])
  assert.strictEqual(echoLog.remainingInputText, '')
  assert.strictEqual(echoLog.outputText, 'ignored by reads\n')

  console.log('browser adapter unit tests ok')
})().catch((err) => {
  console.error(err && err.stack || err)
  process.exit(1)
})
