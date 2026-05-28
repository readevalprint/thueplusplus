// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';

const { parentPort, workerData } = require('worker_threads');
const { initThuePP } = require('./node.cjs');

let ready;

function init(options = {}) {
  if (!ready) ready = initThuePP({ ...(workerData || {}), ...options });
  return ready;
}

parentPort.on('message', async (message) => {
  try {
    if (message.type === 'run') {
      const api = await init(message);
      const result = await api.run(message.options || {});
      parentPort.postMessage({ type: 'result', id: message.id, result });
      return;
    }
    parentPort.postMessage({ type: 'error', id: message.id, error: `unknown worker message type ${message.type}` });
  } catch (err) {
    parentPort.postMessage({ type: 'error', id: message.id, error: String(err && err.stack || err) });
  }
});
