'use client';

import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { shadowBase } from './chainConfig';

export const wagmiConfig = createConfig({
  chains: [shadowBase],
  connectors: [
    injected({ target: 'metaMask' }),
  ],
  transports: {
    [shadowBase.id]: http('http://localhost:8545'),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
