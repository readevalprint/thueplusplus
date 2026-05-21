export class ThuePPWorker {
  constructor(workerURL, initOptions = {}) {
    // browser-worker.js deliberately stays a classic worker because Go's
    // wasm_exec.js is a classic script loaded with importScripts(). Module
    // workers do not expose importScripts(), so using one here makes the real
    // browser demo fail before the Go-WASM interpreter registers ThuePP.run.
    this.worker = new Worker(workerURL);
    this.nextId = 1;
    this.pending = new Map();
    this.worker.onmessage = (event) => this.handleMessage(event.data || {});
    this.ready = this.request({ type: 'init', ...initOptions });
  }

  handleMessage(message) {
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.type === 'error' || message.type === 'runtime-error') {
      pending.reject(new Error(message.error));
      return;
    }
    pending.resolve(message.result || message);
  }

  request(message) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...message, id });
    });
  }

  async run(options, initOptions = {}) {
    await this.ready;
    return this.request({ type: 'run', options, ...initOptions });
  }

  terminate() {
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      pending.reject(new Error('ThuePPWorker terminated'));
    }
    this.pending.clear();
  }
}
