// SPDX-License-Identifier: AGPL-3.0-or-later
export class ThuePPWorker {
  constructor(workerURL, initOptions = {}, clientOptions = {}) {
    // browser-worker.js deliberately stays a classic worker because Go's
    // wasm_exec.js is a classic script loaded with importScripts(). Module
    // workers do not expose importScripts(), so using one here makes the real
    // browser demo fail before the Go-WASM interpreter registers ThuePP.run.
    const WorkerImpl = clientOptions.Worker || globalThis.Worker;
    if (typeof WorkerImpl !== 'function') {
      throw new Error('Worker is not available in this environment');
    }
    this.worker = new WorkerImpl(workerURL);
    this.nextId = 1;
    this.pending = new Map();
    this.requestTimeoutMs = clientOptions.requestTimeoutMs ?? 15000;
    this.worker.onmessage = (event) => this.handleMessage(event.data || {});
    this.worker.onerror = (event) => {
      const detail = event && event.message ? event.message : 'worker script failed';
      this.rejectAll(new Error(`ThuePPWorker error: ${detail}`));
    };
    this.worker.onmessageerror = () => {
      this.rejectAll(new Error('ThuePPWorker message error'));
    };
    this.ready = this.request({ type: 'init', ...initOptions });
  }

  handleMessage(message) {
    if (message.type === 'runtime-error' && message.id === undefined) {
      this.rejectAll(new Error(message.error || 'ThuePP WASM runtime failed'));
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (pending.timer) clearTimeout(pending.timer);
    if (message.type === 'error' || message.type === 'runtime-error') {
      pending.reject(new Error(message.error));
      return;
    }
    pending.resolve(message.result || message);
  }

  request(message) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      let timer;
      if (this.requestTimeoutMs > 0) {
        timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`ThuePPWorker request timed out: ${message.type}`));
        }, this.requestTimeoutMs);
      }
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ ...message, id });
    });
  }

  async run(options, initOptions = {}) {
    await this.ready;
    return this.request({ type: 'run', options, ...initOptions });
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  terminate() {
    this.worker.terminate();
    this.rejectAll(new Error('ThuePPWorker terminated'));
  }
}
