import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selector } from '../src/keccak.js';
import { parseSignature, decodeParams, formatUnits } from '../src/abi.js';
import { FUNCTION_BOOK, TOPIC, lookupSelector } from '../src/signatures.js';
import { decodeLogs, render, toJSON } from '../src/lens.js';

const pad = (h) => h.replace(/^0x/, '').padStart(64, '0');
const addrTopic = (a) => '0x' + pad(a);
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const ZERO = '0x0000000000000000000000000000000000000000';
const fakeToken = async () => ({ symbol: 'TKN', decimals: 6 });

test('known selectors', () => {
  assert.equal(selector('transfer(address,uint256)'), 'a9059cbb');
  assert.equal(selector('approve(address,uint256)'), '095ea7b3');
  assert.equal(FUNCTION_BOOK.get('a0712d68'), 'mint(uint256)');
  assert.equal(TOPIC.Transfer, '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
});

test('offline selector lookup', async () => {
  assert.equal(await lookupSelector('0xa9059cbb', { online: false }), 'transfer(address,uint256)');
  assert.equal(await lookupSelector('0xdeadbeef', { online: false }), null);
});

test('parseSignature handles tuples', () => {
  assert.deepEqual(parseSignature('f(address,(uint256,bytes)[],bool)'), { name: 'f', types: ['address', '(uint256,bytes)[]', 'bool'] });
  assert.deepEqual(parseSignature('mint()'), { name: 'mint', types: [] });
});

test('decodeParams: static, string, array', () => {
  const [to, amt] = decodeParams(['address', 'uint256'], pad(A) + pad('0x2a'));
  assert.equal(to, A);
  assert.equal(amt, 42n);
  const str = Buffer.from('gm').toString('hex');
  const [s] = decodeParams(['string'], pad('0x20') + pad('0x2') + str.padEnd(64, '0'));
  assert.equal(s, 'gm');
  const [arr] = decodeParams(['address[]'], pad('0x20') + pad('0x2') + pad(A) + pad(B));
  assert.deepEqual(arr, [A, B]);
  const [neg] = decodeParams(['int8'], 'f'.repeat(64));
  assert.equal(neg, -1n);
});

test('formatUnits', () => {
  assert.equal(formatUnits(1500000000000000000n), '1.5');
  assert.equal(formatUnits(1234567890n, 6), '1,234.56789');
  assert.equal(formatUnits(12000000000n, 18), '0.000000012');
  assert.equal(formatUnits(0n), '0');
});

test('decodeLogs: erc20, mint, approval', async () => {
  const logs = [
    { address: B, topics: [TOPIC.Transfer, addrTopic(A), addrTopic(B)], data: '0x' + pad('0xf4240') },
    { address: B, topics: [TOPIC.Transfer, addrTopic(ZERO), addrTopic(A), '0x' + pad('0x7b')], data: '0x' },
    { address: B, topics: [TOPIC.Approval, addrTopic(A), addrTopic(B)], data: '0x' + 'f'.repeat(64) },
    { address: B, topics: ['0x' + '9'.repeat(64)], data: '0x' },
  ];
  const ev = await decodeLogs(logs, fakeToken);
  assert.equal(ev.length, 3);
  assert.equal(ev[0].type, 'erc20');
  assert.equal(ev[0].amount, 1000000n);
  assert.equal(ev[1].type, 'nft');
  assert.equal(ev[1].tokenId, 123n);
  assert.equal(ev[2].unlimited, true);
});

test('render + json', () => {
  const r = {
    hash: '0x' + 'ab'.repeat(32),
    chain: { name: 'BNB Smart Chain', symbol: 'BNB', explorer: 'https://bscscan.com' },
    status: 'success',
    block: 1n,
    timestamp: 1761300000,
    from: A,
    to: B,
    created: null,
    nonce: 0,
    value: 0n,
    call: { selector: '0xa0712d68', signature: 'mint(uint256)', name: 'mint', args: [{ type: 'uint256', value: 1n }] },
    fee: { gasUsed: 100000n, gasLimit: 150000n, gasPrice: 100000000n, l1Fee: 0n, total: 10000000000000n, usd: 0.0062 },
    events: [{ type: 'nft', standard: 'ERC-721', symbol: 'FACEID', from: ZERO, to: A, tokenId: 123n }],
  };
  const out = render(r);
  assert.match(out, /mint\(\)  \[SUCCESS\]/);
  assert.match(out, /MINT  FACEID #123 → you/);
  assert.match(out, /≈ \$0\.0062/);
  assert.equal(JSON.parse(toJSON(r)).fee.total, '10000000000000');
});

test('--version prints the package version', async () => {
  const { execFileSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const out = execFileSync(process.execPath, [new URL('../bin/txlens.js', import.meta.url).pathname, '--version'], { encoding: 'utf8' });
  assert.equal(out.trim(), `txlens ${pkg.version}`);
});
