'use client';

import { useState, useEffect } from 'react';
import { fetchLatestBlocks, type ExplorerBlock } from '@/lib/fetcher';

export function BlockList() {
  const [blocks, setBlocks] = useState<ExplorerBlock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const b = await fetchLatestBlocks(12);
      setBlocks(b);
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, []);

  function timeAgo(ts: bigint): string {
    const diff = Math.floor(Date.now() / 1000) - Number(ts);
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  return (
    <div className="glass rounded-2xl p-6">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Latest Blocks
      </h2>

      {loading && blocks.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      ) : blocks.length === 0 ? (
        <p className="text-sm text-gray-600">No blocks found. Is the devnet running?</p>
      ) : (
        <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
          {blocks.map((block) => (
            <div
              key={block.number.toString()}
              className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors border border-transparent hover:border-white/[0.06]"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-shadow-600/20 flex items-center justify-center text-shadow-400 text-xs font-bold">
                  #
                </div>
                <div>
                  <span className="text-sm font-mono text-white font-medium">
                    {block.number.toString()}
                  </span>
                  <div className="text-[11px] text-gray-600 font-mono">
                    {block.hash.slice(0, 18)}…
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-gray-500">{block.txCount} txs</span>
                <span className="text-gray-600 w-16 text-right">{timeAgo(block.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
