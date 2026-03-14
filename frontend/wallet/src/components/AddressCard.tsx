'use client';

import { useAccount, useReadContract } from 'wagmi';
import { CONTRACTS, PrivacyMode } from '@/lib/chainConfig';
import { PRIVACY_ROUTER_ABI } from '@/lib/abis';

export function AddressCard() {
  const { address, isConnected } = useAccount();

  const { data: mode } = useReadContract({
    address: CONTRACTS.PRIVACY_ROUTER,
    abi: PRIVACY_ROUTER_ABI,
    functionName: 'getMode',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 3000 },
  });

  const isAutoShield = Number(mode) === PrivacyMode.AUTO_SHIELD;

  if (!isConnected) return null;

  return (
    <div className="glass rounded-2xl p-5 flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Connected Address</p>
        <p className="font-mono text-sm text-white">{address}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className={`w-2 h-2 rounded-full ${isAutoShield ? 'bg-private-500 animate-pulse' : 'bg-gray-600'}`} />
          <span className={`text-xs font-medium ${isAutoShield ? 'text-private-400' : 'text-gray-500'}`}>
            {isAutoShield ? '🔒 Auto-Shield ON — incoming ETH goes to private sub-account' : '🔓 Public mode — incoming ETH goes to public balance'}
          </span>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs text-gray-500 mb-1">PrivacyRouter</p>
        <p className="text-xs font-mono text-gray-600">{CONTRACTS.PRIVACY_ROUTER.slice(0,10)}…</p>
      </div>
    </div>
  );
}
