// Built-in signature book. Selectors are computed with keccak at load time,
// so the table stays readable and can't drift from the real hashes.
import { keccak256, selector } from './keccak.js';

const FUNCTIONS = [
  // tokens
  'transfer(address,uint256)',
  'transferFrom(address,address,uint256)',
  'approve(address,uint256)',
  'safeTransferFrom(address,address,uint256)',
  'safeTransferFrom(address,address,uint256,bytes)',
  'safeTransferFrom(address,address,uint256,uint256,bytes)',
  'setApprovalForAll(address,bool)',
  'deposit()',
  'withdraw(uint256)',
  // mints
  'mint()',
  'mint(uint256)',
  'mint(address,uint256)',
  'publicMint(uint256)',
  'freeMint(uint256)',
  'claim()',
  'claim(uint256)',
  'freeMintWithPunk(uint256,uint256)',
  'mintPublic(address,address,address,uint256)',
  // swaps (Uniswap/Pancake v2 + v3 + universal router)
  'swapExactETHForTokens(uint256,address[],address,uint256)',
  'swapExactTokensForETH(uint256,uint256,address[],address,uint256)',
  'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
  'swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)',
  'swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)',
  'swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)',
  'execute(bytes,bytes[],uint256)',
  'execute(bytes,bytes[])',
  'multicall(bytes[])',
  'multicall(uint256,bytes[])',
  // daily check-ins / social contracts
  'checkIn()',
  'gm()',
  'gm(string)',
  'waterTree()',
  'writeNote(string)',
  'rollDice()',
  'setMood(uint8)',
  'vote(uint256)',
];

const EVENTS = {
  Transfer: 'Transfer(address,address,uint256)',
  Approval: 'Approval(address,address,uint256)',
  ApprovalForAll: 'ApprovalForAll(address,address,bool)',
  TransferSingle: 'TransferSingle(address,address,address,uint256,uint256)',
  TransferBatch: 'TransferBatch(address,address,address,uint256[],uint256[])',
  Deposit: 'Deposit(address,uint256)',
  Withdrawal: 'Withdrawal(address,uint256)',
  Swap: 'Swap(address,uint256,uint256,uint256,uint256,address)',
};

export const FUNCTION_BOOK = new Map(FUNCTIONS.map((sig) => [selector(sig), sig]));

export const TOPICS = Object.fromEntries(Object.entries(EVENTS).map(([k, sig]) => ['0x' + keccak256(sig), k]));
export const TOPIC = Object.fromEntries(Object.entries(TOPICS).map(([t, k]) => [k, t]));

/**
 * Looks up a 4-byte selector: built-in book first, then (optionally) the public
 * openchain.xyz signature database. Returns null when nothing matches.
 */
export async function lookupSelector(sel, { online = true, fetchImpl = globalThis.fetch } = {}) {
  const key = sel.replace(/^0x/, '').toLowerCase();
  if (FUNCTION_BOOK.has(key)) return FUNCTION_BOOK.get(key);
  if (!online) return null;
  try {
    const res = await fetchImpl(`https://api.openchain.xyz/signature-database/v1/lookup?function=0x${key}&filter=true`);
    const body = await res.json();
    const hits = body?.result?.function?.['0x' + key];
    return hits && hits.length ? hits[0].name : null;
  } catch {
    return null;
  }
}
