#!/usr/bin/env node
import { lens, render, toJSON } from '../src/lens.js';
import { CHAINS } from '../src/chains.js';
import { lookupSelector } from '../src/signatures.js';
import { readFileSync } from 'node:fs';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const HELP = `txlens: read any EVM transaction like a human.

Usage
  txlens <txhash> [options]
  txlens --selector <0x12345678>     look up a 4-byte function selector

Options
  --chain <name>   ${Object.keys(CHAINS).join(' | ')} | auto (default: auto)
  --rpc <url>      use your own RPC (any EVM chain)
  --json           machine-readable output
  --offline        no signature-database or price lookups
  --no-price       skip the USD fee lookup
  -v, --version    print the version
  -h, --help       show this help

Examples
  txlens 0xabc...def
  txlens 0xabc...def --chain base --json
`;

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};

async function main() {
  if (flag('-v') || flag('--version')) {
    console.log(`txlens ${VERSION}`);
    return;
  }
  if (!argv.length || flag('-h') || flag('--help')) {
    process.stdout.write(HELP);
    return;
  }
  const online = !flag('--offline');
  if (flag('--selector')) {
    const sel = opt('--selector');
    const sig = await lookupSelector(sel || '', { online });
    console.log(sig ? `${sel}  ${sig}` : `${sel}  (no match)`);
    if (!sig) process.exitCode = 1;
    return;
  }
  const hash = argv.find((a) => /^0x[0-9a-fA-F]{64}$/.test(a));
  if (!hash) throw new Error('give me a transaction hash (0x + 64 hex chars)');
  const r = await lens(hash, { chain: opt('--chain') || 'auto', rpc: opt('--rpc'), online, price: !flag('--no-price') });
  process.stdout.write(flag('--json') ? toJSON(r) + '\n' : render(r));
  if (r.status === 'failed') process.exitCode = 2;
}

main().catch((e) => {
  console.error(`txlens: ${e.message}`);
  process.exitCode = 1;
});
