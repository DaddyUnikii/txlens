// Core: fetch a transaction + receipt and turn it into a readable summary.
import { createRpc } from './rpc.js';
import { CHAINS, AUTO_ORDER } from './chains.js';
import { strip0x, parseSignature, decodeParams, decodeString, formatUnits, shortAddr } from './abi.js';
import { lookupSelector, TOPICS } from './signatures.js';

const big = (h) => (h == null ? null : BigInt(h));
const topicAddr = (t) => '0x' + strip0x(t).slice(24);

/** Finds which known chain has the transaction. Returns { key, chain, rpc, tx } or null. */
export async function detectChain(hash, { rpcFactory = createRpc, order = AUTO_ORDER } = {}) {
  const tries = order.map(async (key) => {
    const rpc = rpcFactory(CHAINS[key].rpc, { timeoutMs: 10000 });
    const tx = await rpc.getTx(hash);
    if (!tx) throw new Error('not here');
    return { key, chain: CHAINS[key], rpc, tx };
  });
  try {
    return await Promise.any(tries);
  } catch {
    return null;
  }
}

/** Reads symbol/decimals/name for a token contract, cached per run. */
function tokenReader(rpc) {
  const cache = new Map();
  return async (addr) => {
    const key = addr.toLowerCase();
    if (!cache.has(key)) {
      cache.set(
        key,
        (async () => {
          const [sym, dec, name] = await Promise.all([
            rpc.call(addr, '0x95d89b41'), // symbol()
            rpc.call(addr, '0x313ce567'), // decimals()
            rpc.call(addr, '0x06fdde03'), // name()
          ]);
          const decimals = dec && strip0x(dec).length >= 64 ? Number(BigInt(dec)) : null;
          return { symbol: decodeString(sym) || shortAddr(addr), name: decodeString(name), decimals };
        })(),
      );
    }
    return cache.get(key);
  };
}

/** Turns receipt logs into transfers/approvals. Exported for tests. */
export async function decodeLogs(logs, readToken) {
  const out = [];
  for (const log of logs) {
    const kind = TOPICS[log.topics?.[0]];
    if (!kind) continue;
    const t = log.topics;
    const data = strip0x(log.data);
    if (kind === 'Transfer' && t.length === 3) {
      const tok = await readToken(log.address);
      const amount = BigInt('0x' + (data.slice(0, 64) || '0'));
      out.push({ type: 'erc20', token: log.address, symbol: tok.symbol, from: topicAddr(t[1]), to: topicAddr(t[2]), amount, decimals: tok.decimals ?? 18 });
    } else if (kind === 'Transfer' && t.length === 4) {
      const tok = await readToken(log.address);
      out.push({ type: 'nft', standard: 'ERC-721', token: log.address, symbol: tok.symbol, from: topicAddr(t[1]), to: topicAddr(t[2]), tokenId: BigInt(t[3]) });
    } else if (kind === 'TransferSingle') {
      const tok = await readToken(log.address);
      const [id, value] = decodeParams(['uint256', 'uint256'], data);
      out.push({ type: 'nft', standard: 'ERC-1155', token: log.address, symbol: tok.symbol, from: topicAddr(t[2]), to: topicAddr(t[3]), tokenId: id, amount: value });
    } else if (kind === 'TransferBatch') {
      const tok = await readToken(log.address);
      const [ids, values] = decodeParams(['uint256[]', 'uint256[]'], data);
      (Array.isArray(ids) ? ids : []).forEach((id, i) =>
        out.push({ type: 'nft', standard: 'ERC-1155', token: log.address, symbol: tok.symbol, from: topicAddr(t[2]), to: topicAddr(t[3]), tokenId: id, amount: values?.[i] }),
      );
    } else if (kind === 'Approval' && t.length === 3) {
      const tok = await readToken(log.address);
      const amount = BigInt('0x' + (data.slice(0, 64) || '0'));
      out.push({ type: 'approval', token: log.address, symbol: tok.symbol, owner: topicAddr(t[1]), spender: topicAddr(t[2]), amount, decimals: tok.decimals ?? 18, unlimited: amount >= 2n ** 255n });
    } else if (kind === 'ApprovalForAll') {
      const tok = await readToken(log.address);
      out.push({ type: 'approval-all', token: log.address, symbol: tok.symbol, owner: topicAddr(t[1]), operator: topicAddr(t[2]), approved: BigInt('0x' + (data || '0')) !== 0n });
    }
  }
  return out;
}

/** USD price for a CoinGecko id, or null (never throws). */
export async function usdPrice(id, fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    const body = await res.json();
    return body?.[id]?.usd ?? null;
  } catch {
    return null;
  }
}

/**
 * Main entry. opts: { chain: 'auto'|key, rpc: url, online: bool, price: bool }
 * Returns a plain object (BigInts included) describing the transaction.
 */
export async function lens(hash, opts = {}) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('expected a 0x-prefixed 32-byte transaction hash');
  const online = opts.online !== false;
  let chain;
  let rpc;
  let tx;
  if (opts.rpc) {
    rpc = createRpc(opts.rpc);
    tx = await rpc.getTx(hash);
    const id = Number(await rpc.send('eth_chainId', []));
    chain = Object.values(CHAINS).find((c) => c.id === id) || { id, name: `chain ${id}`, symbol: 'ETH' };
  } else if (!opts.chain || opts.chain === 'auto') {
    const hit = await detectChain(hash);
    if (!hit) throw new Error('transaction not found on any known chain (try --chain or --rpc)');
    ({ chain, rpc, tx } = hit);
  } else {
    chain = CHAINS[opts.chain];
    if (!chain) throw new Error(`unknown chain "${opts.chain}" (known: ${Object.keys(CHAINS).join(', ')})`);
    rpc = createRpc(chain.rpc);
    tx = await rpc.getTx(hash);
  }
  if (!tx) throw new Error(`transaction not found on ${chain.name}`);

  const receipt = await rpc.getReceipt(hash);
  const block = tx.blockNumber ? await rpc.getBlock(tx.blockNumber) : null;
  const readToken = tokenReader(rpc);

  // call
  const input = strip0x(tx.input);
  let call = null;
  if (input.length >= 8) {
    const sel = input.slice(0, 8);
    const sig = await lookupSelector(sel, { online });
    call = { selector: '0x' + sel, signature: sig, args: [] };
    if (sig) {
      try {
        const { name, types } = parseSignature(sig);
        call.name = name;
        call.args = decodeParams(types, input.slice(8)).map((value, i) => ({ type: types[i], value }));
      } catch {
        /* keep selector only */
      }
    }
  }

  // fee
  let fee = null;
  if (receipt) {
    const gasUsed = big(receipt.gasUsed);
    const price = big(receipt.effectiveGasPrice ?? tx.gasPrice) ?? 0n;
    const l1 = big(receipt.l1Fee) ?? 0n; // OP-stack chains add an L1 data fee
    fee = { gasUsed, gasLimit: big(tx.gas), gasPrice: price, l1Fee: l1, total: gasUsed * price + l1 };
    if (opts.price !== false && online && chain.coingecko) {
      const usd = await usdPrice(chain.coingecko);
      if (usd != null) fee.usd = (Number(fee.total) / 1e18) * usd;
      if (usd != null) fee.nativeUsd = usd;
    }
  }

  return {
    hash,
    chain: { key: opts.chain && opts.chain !== 'auto' ? opts.chain : Object.keys(CHAINS).find((k) => CHAINS[k].id === chain.id), id: chain.id, name: chain.name, symbol: chain.symbol, explorer: chain.explorer },
    status: receipt ? (receipt.status === '0x1' ? 'success' : 'failed') : 'pending',
    block: big(tx.blockNumber),
    timestamp: block ? Number(BigInt(block.timestamp)) : null,
    from: tx.from,
    to: tx.to,
    created: receipt?.contractAddress || null,
    nonce: Number(BigInt(tx.nonce)),
    value: big(tx.value) ?? 0n,
    call,
    fee,
    events: receipt ? await decodeLogs(receipt.logs || [], readToken) : [],
  };
}

// ---------- rendering ----------

const fmtArg = (a) => {
  if (Array.isArray(a.value)) return `[${a.value.map((v) => String(v)).join(', ')}]`;
  if (typeof a.value === 'bigint' && a.value >= 2n ** 255n) return 'MAX (unlimited)';
  if (typeof a.value === 'string' && a.value.length > 66) return a.value.slice(0, 66) + '…';
  return String(a.value);
};

function describeEvent(e, me) {
  const tag = (addr) => (me && addr.toLowerCase() === me.toLowerCase() ? 'you' : shortAddr(addr));
  const zero = (addr) => /^0x0{40}$/i.test(addr);
  if (e.type === 'erc20') return `${formatUnits(e.amount, e.decimals)} ${e.symbol}  ${tag(e.from)} → ${tag(e.to)}`;
  if (e.type === 'nft') {
    const what = `${e.symbol} #${e.tokenId}${e.amount && e.amount !== 1n ? ` ×${e.amount}` : ''}`;
    if (zero(e.from)) return `MINT  ${what} → ${tag(e.to)}`;
    if (zero(e.to)) return `BURN  ${what} from ${tag(e.from)}`;
    return `${what}  ${tag(e.from)} → ${tag(e.to)}`;
  }
  if (e.type === 'approval') return `APPROVE ${e.unlimited ? 'UNLIMITED' : formatUnits(e.amount, e.decimals)} ${e.symbol} to ${shortAddr(e.spender)}`;
  if (e.type === 'approval-all') return `${e.approved ? 'APPROVE ALL' : 'REVOKE ALL'} ${e.symbol} to ${shortAddr(e.operator)}`;
  return e.type;
}

/** Plain-text report for the terminal. */
export function render(r) {
  const L = [];
  const row = (k, v) => L.push(`  ${k.padEnd(12)}  ${v}`);
  const icon = r.status === 'success' ? '✔' : r.status === 'failed' ? '✘' : '…';
  const title = r.call?.name ? `${r.call.name}()` : r.created ? 'contract deploy' : r.value > 0n && !r.call ? 'native transfer' : r.call ? 'contract call' : 'transaction';
  L.push('');
  L.push(`  ${icon} ${title}  [${r.status.toUpperCase()}]  ·  ${r.chain.name}`);
  L.push(`  ${r.hash}`);
  L.push('');
  if (r.timestamp) row('When', new Date(r.timestamp * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC') + `  (block ${r.block})`);
  row('From', r.from);
  row('To', r.created ? `(new contract) ${r.created}` : r.to);
  if (r.value > 0n) row('Value', `${formatUnits(r.value, 18)} ${r.chain.symbol}`);
  if (r.call) {
    row('Function', r.call.signature || `${r.call.selector} (unknown selector)`);
    r.call.args.forEach((a, i) => row(i === 0 ? 'Args' : '', `${a.type} ${fmtArg(a)}`));
  }
  if (r.fee) {
    const usd = r.fee.usd != null ? `  ≈ $${r.fee.usd < 0.01 ? r.fee.usd.toFixed(4) : r.fee.usd.toFixed(2)}` : '';
    row('Fee', `${formatUnits(r.fee.total, 18, 8)} ${r.chain.symbol}${usd}`);
    row('Gas', `${r.fee.gasUsed.toLocaleString('en-US')} / ${r.fee.gasLimit?.toLocaleString('en-US')} @ ${formatUnits(r.fee.gasPrice, 9, 4)} gwei${r.fee.l1Fee ? ` + L1 ${formatUnits(r.fee.l1Fee, 18, 8)}` : ''}`);
  }
  if (r.events.length) {
    L.push('');
    L.push(`  Moves (${r.events.length})`);
    r.events.slice(0, 25).forEach((e) => L.push(`    • ${describeEvent(e, r.from)}`));
    if (r.events.length > 25) L.push(`    … ${r.events.length - 25} more`);
  }
  const warn = r.events.filter((e) => (e.type === 'approval' && e.unlimited) || (e.type === 'approval-all' && e.approved));
  if (warn.length) {
    L.push('');
    warn.forEach((e) => L.push(`  ⚠ Heads up  ${e.type === 'approval' ? 'unlimited' : 'collection-wide'} approval for ${e.symbol}: revoke it if you don't use ${shortAddr(e.spender || e.operator)} anymore`));
  }
  if (r.chain.explorer) {
    L.push('');
    L.push(`  ${r.chain.explorer}/tx/${r.hash}`);
  }
  L.push('');
  return L.join('\n');
}

/** JSON.stringify that turns BigInts into strings. */
export const toJSON = (r) => JSON.stringify(r, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
