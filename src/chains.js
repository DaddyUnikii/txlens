// Chains txlens knows out of the box. Any other EVM chain works with --rpc.
// `coingecko` is the id used for the optional USD fee lookup.
export const CHAINS = {
  eth: { id: 1, name: 'Ethereum', symbol: 'ETH', coingecko: 'ethereum', rpc: 'https://ethereum-rpc.publicnode.com', explorer: 'https://etherscan.io' },
  bsc: { id: 56, name: 'BNB Smart Chain', symbol: 'BNB', coingecko: 'binancecoin', rpc: 'https://bsc-dataseed.binance.org', explorer: 'https://bscscan.com' },
  base: { id: 8453, name: 'Base', symbol: 'ETH', coingecko: 'ethereum', rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
  arb: { id: 42161, name: 'Arbitrum One', symbol: 'ETH', coingecko: 'ethereum', rpc: 'https://arb1.arbitrum.io/rpc', explorer: 'https://arbiscan.io' },
  op: { id: 10, name: 'OP Mainnet', symbol: 'ETH', coingecko: 'ethereum', rpc: 'https://mainnet.optimism.io', explorer: 'https://optimistic.etherscan.io' },
  polygon: { id: 137, name: 'Polygon', symbol: 'POL', coingecko: 'polygon-ecosystem-token', rpc: 'https://polygon-bor-rpc.publicnode.com', explorer: 'https://polygonscan.com' },
  ink: { id: 57073, name: 'Ink', symbol: 'ETH', coingecko: 'ethereum', rpc: 'https://rpc-gel.inkonchain.com', explorer: 'https://explorer.inkonchain.com' },
  soneium: { id: 1868, name: 'Soneium', symbol: 'ETH', coingecko: 'ethereum', rpc: 'https://rpc.soneium.org', explorer: 'https://soneium.blockscout.com' },
};

/** Order used by --chain auto: busiest / cheapest chains first. */
export const AUTO_ORDER = ['bsc', 'base', 'eth', 'arb', 'op', 'polygon', 'ink', 'soneium'];
