'use strict'

// Reads the process stdin on this thread so the CLI can stop waiting when a
// ::< deadline passes. Lines are published one at a time through a shared
// header: [0] is 0 while empty and 1 when a record is ready, [1] is the byte
// length, [2] is the kind (1 line, 2 EOF, 3 error).

const { parentPort } = require('worker_threads')
const fs = require('fs')

const HEADER_BYTES = 16
const MAX_PAYLOAD = 1024 * 1024

parentPort.on('message', (message) => {
  const header = new Int32Array(message.sab, 0, 4)
  const payload = new Uint8Array(message.sab, HEADER_BYTES, MAX_PAYLOAD)
  const chunk = Buffer.alloc(4096)
  let pending = Buffer.alloc(0)

  const publish = (kind, bytes) => {
    const body = bytes.length > MAX_PAYLOAD ? Buffer.from('line exceeds host buffer') : bytes
    const reportedKind = bytes.length > MAX_PAYLOAD ? 3 : kind
    while (true) {
      const current = Atomics.load(header, 0)
      if (current === 0) break
      Atomics.wait(header, 0, current)
    }
    payload.set(body.subarray(0, Math.min(body.length, MAX_PAYLOAD)), 0)
    Atomics.store(header, 1, Math.min(body.length, MAX_PAYLOAD))
    Atomics.store(header, 2, reportedKind)
    Atomics.store(header, 0, 1)
    Atomics.notify(header, 0, 1)
    if (bytes.length > MAX_PAYLOAD) return false
    return true
  }

  try {
    while (true) {
      const n = fs.readSync(0, chunk, 0, chunk.length, null)
      if (n === 0) {
        if (pending.length > 0) publish(3, Buffer.from('EOF before newline'))
        else publish(2, Buffer.alloc(0))
        return
      }
      pending = Buffer.concat([pending, chunk.subarray(0, n)])
      if (pending.length > MAX_PAYLOAD) {
        publish(3, Buffer.from('line exceeds host buffer'))
        return
      }
      let newline = pending.indexOf(0x0a)
      while (newline >= 0) {
        let line = pending.subarray(0, newline)
        pending = pending.subarray(newline + 1)
        if (line.length > 0 && line[line.length - 1] === 0x0d) line = line.subarray(0, -1)
        if (!publish(1, line)) return
        newline = pending.indexOf(0x0a)
      }
    }
  } catch (error) {
    publish(3, Buffer.from(error && error.message ? error.message : String(error)))
  }
})
