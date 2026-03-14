'use client';

import { useState, useEffect } from 'react';
import { fetchChainInfo } from '@/lib/fetcher';

export function Header() {
  const [chainInfo, setChainInfo] = useState<{
    blockNumber: bigint;
    chainId: number;
    connected: boolean;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      const info = await fetchChainInfo();
      setChainInfo(info);
    };
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo / Name */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-shadow-500 to-private-500 flex items-center justify-center text-lg font-bold">
            🔍
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              ShadowBase Explorer
            </h1>
            <p className="text-[11px] text-gray-500 -mt-0.5">
              Privacy-Native Base L2 Block Explorer
            </p>
          </div>
        </div>

        {/* Chain status */}
        <div className="flex items-center gap-4">
          {chainInfo?.connected ? (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
                <span className="text-xs text-emerald-400 font-medium">Connected</span>
              </div>
              <div className="text-xs text-gray-500 font-mono">
                Chain {chainInfo.chainId} &middot; Block #{chainInfo.blockNumber.toString()}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-xs text-red-400 font-medium">
                Devnet Offline — start with <code className="ml-1 font-mono">start-devnet.sh</code>
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
