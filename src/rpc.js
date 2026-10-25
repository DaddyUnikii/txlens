// Minimal JSON-RPC client on the global fetch (Node 18+). No dependencies.
export function createRpc(url, { fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  let id = 0;
  async function send(method, params) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
        signal: ctrl.signal,
      });
      const body = await res.json();
      if (body.error) throw new Error(body.error.message || 'rpc error');
      return body.result;
    } finally {
      clearTimeout(t);
    }
  }
  return {
    url,
    send,
    getTx: (hash) => send('eth_getTransactionByHash', [hash]),
    getReceipt: (hash) => send('eth_getTransactionReceipt', [hash]),
    getBlock: (num) => send('eth_getBlockByNumber', [num, false]),
    /** eth_call that resolves to null instead of throwing. */
    call: async (to, data) => {
      try {
        return await send('eth_call', [{ to, data }, 'latest']);
      } catch {
        return null;
      }
    },
  };
}
