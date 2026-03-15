'use client';

import { useState, useEffect } from 'react';
import { fetchRecentTransactions, type ExplorerTx } from '@/lib/fetcher';
import { TxTypeBadge } from './TxTypeBadge';
import { SEPOLIA_ETHERSCAN } from '@/lib/config';

function truncAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(ts: bigint): string {
  const diff = Math.floor(Date.now() / 1000) - Number(ts);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

type Filter = 'all' | 'privacy' | 'public';

export function TransactionTable() {
  const [txs, setTxs] = useState<ExplorerTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    const load = async () => {
      const t = await fetchRecentTransactions(50);
      setTxs(t);
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const filtered = txs.filter((tx) => {
    if (filter === 'privacy') return tx.isPrivacy;
    if (filter === 'public') return !tx.isPrivacy;
    return true;
  });

  const privacyCount = txs.filter((t) => t.isPrivacy).length;

  return (
    <div className="glass rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Recent Transactions
        </h2>
        <div className="flex gap-1 p-0.5 rounded-lg bg-white/5">
          {(['all', 'privacy', 'public'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                filter === f
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {f === 'all'
                ? `All (${txs.length})`
                : f === 'privacy'
                ? `Privacy (${privacyCount})`
                : `Public (${txs.length - privacyCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading && txs.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton h-14 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <div className="text-3xl mb-2"></div>
          <p className="text-sm">
            {txs.length === 0
              ? 'No transactions yet. Is the devnet running?'
              : 'No matching transactions for this filter.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-600 uppercase tracking-wider border-b border-white/5">
                <th className="text-left py-2 px-2 font-medium">Type</th>
                <th className="text-left py-2 px-2 font-medium">Tx Hash</th>
                <th className="text-left py-2 px-2 font-medium">Method</th>
                <th className="text-left py-2 px-2 font-medium">From</th>
                <th className="text-left py-2 px-2 font-medium">To</th>
                <th className="text-right py-2 px-2 font-medium">Value</th>
                <th className="text-left py-2 px-2 font-medium">Block</th>
                <th className="text-right py-2 px-2 font-medium">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {filtered.slice(0, 100).map((tx) => (
                <tr
                  key={tx.hash}
                  className={`hover:bg-white/[0.03] transition-colors ${
                    tx.isPrivacy ? 'privacy-glow' : ''
                  }`}
                >
                  {/* Type */}
                  <td className="py-2.5 px-2">
                    <TxTypeBadge type={tx.txType} />
                  </td>

                  {/* Hash */}
                  <td className="py-2.5 px-2">
                    <span className="font-mono text-xs text-shadow-400 cursor-pointer hover:text-shadow-300">
                      {tx.hash.slice(0, 10)}…{tx.hash.slice(-6)}
                    </span>
                  </td>

                  {/* Method */}
                  <td className="py-2.5 px-2">
                    <span className="text-xs text-gray-500 font-mono">{tx.methodId}</span>
                  </td>

                  {/* From */}
                  <td className="py-2.5 px-2">
                    <span className="font-mono text-xs text-gray-300">
                      {truncAddr(tx.from)}
                    </span>
                  </td>

                  {/* To — THIS IS THE KEY DEMO VISUAL */}
                  <td className="py-2.5 px-2">
                    {tx.to ? (
                      tx.toLabel ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-xs font-medium text-private-400">
                            {tx.toLabel}
                          </span>
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-gray-300">
                          {truncAddr(tx.to)}
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-gray-600 italic">Contract Create</span>
                    )}
                  </td>

                  {/* Value */}
                  <td className="py-2.5 px-2 text-right">
                    {tx.valueDisplay === 'SHIELDED' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-private-500/10 text-private-400 text-xs font-medium">
                        SHIELDED
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 font-mono">
                        {tx.valueDisplay}
                      </span>
                    )}
                  </td>

                  {/* Block */}
                  <td className="py-2.5 px-2">
                    <span className="text-xs text-gray-500 font-mono">
                      {tx.blockNumber.toString()}
                    </span>
                  </td>

                  {/* Age */}
                  <td className="py-2.5 px-2 text-right">
                    <span className="text-[11px] text-gray-600">
                      {timeAgo(tx.timestamp)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
