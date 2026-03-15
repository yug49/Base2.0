'use client';

import { useState, useEffect } from 'react';
import { formatEther } from 'viem';
import { fetchPoolStats, type PoolStats as PoolStatsType } from '@/lib/fetcher';

export function PoolStats() {
  const [stats, setStats] = useState<PoolStatsType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const s = await fetchPoolStats();
      setStats(s);
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      <div className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Shielded Pool
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Shielded Pool
        </h2>
        <p className="text-sm text-gray-600">
          Could not read pool state. Is the devnet running?
        </p>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Commitments',
      value: stats.totalCommitments.toString(),
      sub: `Tree #${stats.treeNumber.toString()}`,
      color: 'text-private-400',
      icon: '',
    },
    {
      label: 'Total Shielded',
      value: `${formatEther(stats.totalShieldedValue)} ETH`,
      sub: `${stats.totalShieldEvents} shield events`,
      color: 'text-emerald-400',
      icon: '',
    },
    {
      label: 'Nullifiers Spent',
      value: stats.totalNullifiers.toString(),
      sub: `${stats.totalTransactEvents} transact events`,
      color: 'text-amber-400',
      icon: '',
    },
    {
      label: 'Merkle Root',
      value: `${stats.merkleRoot.slice(0, 10)}…${stats.merkleRoot.slice(-6)}`,
      sub: `Leaf index: ${stats.nextLeafIndex.toString()}`,
      color: 'text-shadow-400',
      icon: '',
    },
  ];

  return (
    <div className="glass rounded-2xl p-6">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        ShieldedPool &mdash; Privacy Stats
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-1"
          >
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span>{card.icon}</span>
              {card.label}
            </div>
            <div className={`text-lg font-bold ${card.color} font-mono`}>
              {card.value}
            </div>
            <div className="text-[11px] text-gray-600">{card.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
