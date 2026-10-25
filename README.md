<div align="center">

# 🔍 txlens

**Paste a transaction hash, get a human-readable story: what was called, what moved, and what it cost.**

[![CI](https://github.com/DaddyUnikii/txlens/actions/workflows/ci.yml/badge.svg)](https://github.com/DaddyUnikii/txlens/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![Chains](https://img.shields.io/badge/chains-8%20%2B%20any%20RPC-orange)
![License](https://img.shields.io/badge/license-MIT-blue)

</div>

---

Block explorers show you everything, which is the problem. `txlens` reads the transaction and
its receipt straight from the chain and prints only what matters: the function and its decoded
arguments, every token and NFT that moved (mints and burns called out), approvals you just granted,
and the fee in native coin **and** USD, including the L1 data fee on OP-stack chains.

```
$ txlens 0xea85e4d40e234b414d0783a4f1e0063243c93cf5c143a3dc1dd02dd0e1648f43

  ✔ gm()  [SUCCESS]  ·  Soneium
  0xea85e4d40e234b414d0783a4f1e0063243c93cf5c143a3dc1dd02dd0e1648f43

  When          2026-10-24 16:53:29 UTC  (block 29863029)
  From          0xf36ac4fad24f6e89a81d5c400e609e7acd7e7633
  To            0x859a614683946d252a83ba947e88a2d2fea39e95
  Function      gm(string)
  Args          string hello world
  Fee           0.00000011 ETH  ≈ $0.0003
  Gas           34,804 / 35,164 @ 0.0032 gwei + L1 0.00000000390

  https://soneium.blockscout.com/tx/0xea85e4d40e234b414d0783a4f1e0063243c93cf5c143a3dc1dd02dd0e1648f43
```

No chain flag needed: txlens asks every known chain at once and uses the one that has the hash.

## Features

- 🌐 **Auto chain detection** across Ethereum, BNB Chain, Base, Arbitrum, OP, Polygon, Ink and Soneium, or `--rpc` for any EVM chain
- 🧩 **Calldata decoding** from a built-in signature book (transfers, approvals, mints, Uniswap/Pancake swaps, check-ins), falling back to the public [openchain.xyz](https://openchain.xyz) database
- 🔁 **Moves**: ERC-20 transfers with real decimals and symbols, ERC-721 / ERC-1155 transfers, `MINT` / `BURN` labels, and your own address shown as `you`
- ⚠️ **Approval warnings** for unlimited ERC-20 approvals and `setApprovalForAll`
- ⛽ **True fee**: gas × effective price + OP-stack L1 fee, with an optional USD estimate (CoinGecko)
- 🧾 `--json` output for scripts and bots, with a non-zero exit code on failed transactions
- 📦 **Zero dependencies**: Node 18+ `fetch` and a pure-JS keccak-256

## Install

```bash
git clone https://github.com/DaddyUnikii/txlens && cd txlens
npm link            # optional: puts `txlens` on your PATH
```

## Usage

```bash
txlens <txhash>                      # auto-detect the chain
txlens <txhash> --chain base         # skip detection
txlens <txhash> --rpc https://...    # any EVM chain
txlens <txhash> --json | jq .fee     # scripting
txlens <txhash> --offline            # no signature-db or price lookups
txlens --selector 0xa9059cbb         # what is this 4-byte selector?
```

| Flag | What it does |
|---|---|
| `--chain <name>` | `eth`, `bsc`, `base`, `arb`, `op`, `polygon`, `ink`, `soneium`, or `auto` (default) |
| `--rpc <url>` | use your own RPC endpoint; the chain is identified by `eth_chainId` |
| `--json` | print the full result as JSON (BigInts as strings) |
| `--no-price` | skip the USD lookup |
| `--offline` | built-in signatures only, no network calls besides the RPC |

Exit codes: `0` success · `1` error / not found · `2` the transaction reverted.

## Use it as a library

```js
import { lens, render } from './src/lens.js';

const tx = await lens('0x…', { chain: 'auto' });
console.log(tx.status, tx.call?.signature, tx.fee.total);
console.log(render(tx));
```

## How it works

1. `eth_getTransactionByHash` is sent to every known chain in parallel; the first hit wins.
2. The receipt and block give status, gas used, effective gas price, L1 fee and timestamp.
3. The first 4 bytes of the input are matched against selectors computed with keccak at load time,
   then against openchain.xyz, and the arguments are ABI-decoded.
4. Logs are matched by event topic (`Transfer`, `TransferSingle/Batch`, `Approval`, `ApprovalForAll`),
   and token symbol/decimals come from on-chain `symbol()` / `decimals()` calls.

More sample output lives in [`examples/`](examples).

## Development

```bash
npm test     # node:test, no network needed
```

## License

MIT © [Unikii](https://github.com/DaddyUnikii)
