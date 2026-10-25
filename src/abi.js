// Small ABI toolkit: parse a signature, decode calldata, format amounts.
export const strip0x = (h) => (h && h.startsWith('0x') ? h.slice(2) : h || '');

/** Splits "swap(address,(uint256,bytes)[],bool)" into its top-level parameter types. */
export function parseSignature(sig) {
  const open = sig.indexOf('(');
  if (open < 1 || !sig.endsWith(')')) throw new Error(`bad signature: ${sig}`);
  const name = sig.slice(0, open);
  const inner = sig.slice(open + 1, -1);
  const types = [];
  let depth = 0;
  let cur = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      types.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) types.push(cur);
  return { name, types };
}

const isDynamic = (t) => t === 'string' || t === 'bytes' || t.endsWith('[]') || t.startsWith('(');

const word = (h, i) => h.slice(i * 64, i * 64 + 64);

function decodeStatic(type, w) {
  if (!w || w.length < 64) return null;
  if (type === 'address') return '0x' + w.slice(24);
  if (type === 'bool') return BigInt('0x' + w) !== 0n;
  if (type.startsWith('uint')) return BigInt('0x' + w);
  if (type.startsWith('int')) {
    const bits = Number(type.slice(3) || 256);
    let v = BigInt('0x' + w) & ((1n << BigInt(bits)) - 1n);
    if (v >> BigInt(bits - 1)) v -= 1n << BigInt(bits);
    return v;
  }
  if (type.startsWith('bytes')) return '0x' + w.slice(0, Number(type.slice(5)) * 2);
  return '0x' + w;
}

/** Decodes the arguments of ABI-encoded data (selector already removed). Unknown shapes come back as raw hex. */
export function decodeParams(types, dataHex) {
  const h = strip0x(dataHex);
  return types.map((type, i) => {
    try {
      if (!isDynamic(type)) return decodeStatic(type, word(h, i));
      const off = Number(BigInt('0x' + word(h, i))) * 2;
      const len = Number(BigInt('0x' + h.slice(off, off + 64)));
      const body = h.slice(off + 64);
      if (type === 'bytes') return '0x' + body.slice(0, len * 2);
      if (type === 'string') return Buffer.from(body.slice(0, len * 2), 'hex').toString('utf8');
      const base = type.slice(0, -2);
      if (type.endsWith('[]') && !isDynamic(base) && len <= 64) {
        return Array.from({ length: len }, (_, k) => decodeStatic(base, word(body, k)));
      }
      return `<${type}>`;
    } catch {
      return `<${type}>`;
    }
  });
}

export function decodeString(hex) {
  const h = strip0x(hex);
  if (h.length < 64) return null;
  if (h.length >= 128) {
    const [s] = decodeParams(['string'], h);
    if (typeof s === 'string' && !s.startsWith('<')) return s;
  }
  return Buffer.from(h.slice(0, 64), 'hex').toString('utf8').replace(/\0+$/, '') || null;
}

/** Formats an integer amount with `decimals`, trimming to `maxFrac` fraction digits. */
export function formatUnits(value, decimals = 18, maxFrac = 6) {
  const v = BigInt(value);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '');
  if (!frac && abs % base !== 0n && whole === 0n) {
    // tiny amount: keep significant digits instead of printing 0
    frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
    frac = frac.slice(0, frac.search(/[1-9]/) + 3);
  }
  return (neg ? '-' : '') + whole.toLocaleString('en-US') + (frac ? '.' + frac : '');
}

export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
