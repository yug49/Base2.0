'use client';

import { SEPOLIA_ETHERSCAN, L1_CONTRACTS } from '@/lib/config';

interface LinkItem {
  label: string;
  address: string;
  description: string;
  icon: string;
}

const LINKS: LinkItem[] = [
  {
    label: 'RAILGUN Smart Wallet',
    address: L1_CONTRACTS.RAILGUN,
    description: 'Sepolia RAILGUN contract for L1 shield/unshield',
    icon: '',
  },
  {
    label: 'L1 CrossDomainMessenger',
    address: L1_CONTRACTS.CROSS_DOMAIN_MESSENGER,
    description: 'OP Stack bridge messenger on Sepolia',
    icon: '',
  },
  ...(L1_CONTRACTS.L1_COMPANION !== '0x0000000000000000000000000000000000000000'
    ? [
        {
          label: 'L1Companion',
          address: L1_CONTRACTS.L1_COMPANION,
          description: 'Privacy bridge relay on Sepolia L1',
          icon: '',
        },
      ]
    : []),
];

function truncAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function SepoliaLinks() {
  return (
    <div className="glass rounded-2xl p-6 h-full">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Sepolia L1 Contracts
      </h2>

      <div className="space-y-3">
        {LINKS.map((link) => (
          <a
            key={link.address}
            href={`${SEPOLIA_ETHERSCAN}/address/${link.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all group"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">{link.icon}</span>
              <span className="text-xs font-medium text-white group-hover:text-shadow-400 transition-colors">
                {link.label}
              </span>
              <svg
                className="w-3 h-3 text-gray-600 group-hover:text-shadow-400 transition-colors ml-auto"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </div>
            <p className="text-[11px] text-gray-600 mb-1.5">{link.description}</p>
            <span className="font-mono text-[10px] text-gray-500">{truncAddr(link.address)}</span>
          </a>
        ))}

        {LINKS.length === 0 && (
          <p className="text-sm text-gray-600">No L1 contracts configured yet.</p>
        )}
      </div>

      {/* Info note */}
      <div className="mt-4 rounded-lg bg-shadow-600/5 border border-shadow-600/10 p-3">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          <span className="text-shadow-400 font-medium">L1 ↔ L2 Bridge:</span> Privacy-preserving
          cross-chain deposits flow through RAILGUN on Sepolia, relayed via OP Stack&apos;s
          CrossDomainMessenger to the L2 ShieldedPool.
        </p>
      </div>
    </div>
  );
}
