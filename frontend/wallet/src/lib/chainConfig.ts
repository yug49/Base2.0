import { defineChain } from 'viem';

// ShadowBase Devnet — forked from Base (OP Stack), settling to Ethereum Sepolia
export const shadowBase = defineChain({
  id: 845311,
  name: 'Base2.0 Devnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://localhost:8545'],
      webSocket: ['ws://localhost:8546'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Base2.0 Explorer',
      url: 'http://localhost:3001',
    },
  },
  testnet: true,
});

// Predeploy addresses (from devnet/deploy-config)
export const CONTRACTS = {
  PRIVACY_ROUTER:  '0x4200000000000000000000000000000000000069' as const,
  SHIELDED_POOL:   '0x4200000000000000000000000000000000000070' as const,
  PRIVACY_BRIDGE:  '0x4200000000000000000000000000000000000071' as const,
  L2_CDM:          '0x4200000000000000000000000000000000000007' as const,
} as const;

// PrivacyMode enum (must match Solidity)
export enum PrivacyMode {
  PUBLIC      = 0,
  AUTO_SHIELD = 1,
  CUSTOM      = 2,
}
