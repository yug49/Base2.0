// ============================================================================
// ShadowBase Explorer — Chain & Contract Configuration
// ============================================================================

import { createPublicClient, http, defineChain } from 'viem';

// ── Chain Definition ────────────────────────────────────────────────

export const shadowBase = defineChain({
  id: 845311,
  name: 'Base2.0 Devnet',
  nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  rpcUrls: {
    default: {
      http: ['http://localhost:8545'],
      webSocket: ['ws://localhost:8546'],
    },
  },
  testnet: true,
});

// ── Predeploy Addresses ─────────────────────────────────────────────

export const CONTRACTS = {
  PRIVACY_ROUTER: '0x4200000000000000000000000000000000000069' as const,
  SHIELDED_POOL:  '0x4200000000000000000000000000000000000070' as const,
  PRIVACY_BRIDGE: '0x4200000000000000000000000000000000000071' as const,
  L2_CDM:         '0x4200000000000000000000000000000000000007' as const,
} as const;

/** Known predeploy addresses set — used to tag txs */
export const PREDEPLOY_SET = new Set<string>(
  Object.values(CONTRACTS).map((a) => a.toLowerCase()),
);

/** Label for known contracts */
export function labelAddress(addr: string): string | null {
  const lower = addr.toLowerCase();
  if (lower === CONTRACTS.PRIVACY_ROUTER.toLowerCase()) return 'PrivacyRouter';
  if (lower === CONTRACTS.SHIELDED_POOL.toLowerCase()) return 'ShieldedPool';
  if (lower === CONTRACTS.PRIVACY_BRIDGE.toLowerCase()) return 'PrivacyBridge';
  if (lower === CONTRACTS.L2_CDM.toLowerCase()) return 'L2 CrossDomainMessenger';
  return null;
}

// ── Viem Public Client ──────────────────────────────────────────────

export const publicClient = createPublicClient({
  chain: shadowBase,
  transport: http('http://localhost:8545'),
});

// ── Sepolia L1 ──────────────────────────────────────────────────────

export const SEPOLIA_ETHERSCAN = 'https://sepolia.etherscan.io';

export const L1_CONTRACTS = {
  L1_COMPANION: '0x0000000000000000000000000000000000000000' as const, // filled after deploy
  RAILGUN: '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea' as const,
  CROSS_DOMAIN_MESSENGER: '0x579aaf4e08b072b3b53148a260913837518a0ab8' as const,
} as const;
