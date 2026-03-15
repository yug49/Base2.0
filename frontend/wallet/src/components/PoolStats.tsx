'use client';

import { useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { CONTRACTS } from '@/lib/chainConfig';
import { SHIELDED_POOL_ABI } from '@/lib/abis';

export function PoolStats() {
  const { data: nextLeaf } = useReadContract({
    address: CONTRACTS.SHIELDED_POOL,
    abi: SHIELDED_POOL_ABI,
    functionName: 'nextLeafIndex',
    query: { refetchInterval: 5000 },
  });

  const { data: treeNum } = useReadContract({
    address: CONTRACTS.SHIELDED_POOL,
    abi: SHIELDED_POOL_ABI,
    functionName: 'treeNumber',
    query: { refetchInterval: 5000 },
  });

  const { data: root } = useReadContract({
    address: CONTRACTS.SHIELDED_POOL,
    abi: SHIELDED_POOL_ABI,
    functionName: 'merkleRoot',
    query: { refetchInterval: 5000 },
  });

  const stats = [
    {
      label: 'Commitments',
      value: nextLeaf !== undefined ? nextLeaf.toString() : '—',
      sub: 'total UTXO leaves',
      icon: '',
    },
    {
      label: 'Merkle Tree',
      value: treeNum !== undefined ? `#${treeNum.toString()}` : '—',
      sub: 'current tree',
      icon: '',
    },
    {
      label: 'Merkle Root',
      value: root ? `${(root as string).slice(0, 10)}…` : '—',
      sub: 'current state root',
      icon: '',
      mono: true,
    },
  ];

  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
        Shielded Pool — Live Stats
      </h3>
      <div className="grid grid-cols-3 gap-4">
        {stats.map(s => (
          <div key={s.label} className="text-center">
            <div className="text-xl mb-1">{s.icon}</div>
            <div className={`text-lg font-bold text-white ${s.mono ? 'font-mono text-sm' : ''}`}>
              {s.value}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            <div className="text-xs text-gray-600">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
