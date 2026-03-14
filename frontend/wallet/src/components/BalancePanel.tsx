'use client';

import { useState, useEffect } from 'react';
import { useAccount, useBalance, useReadContract } from 'wagmi';
import { formatEther, createPublicClient, http } from 'viem';
import { CONTRACTS } from '@/lib/chainConfig';
import { shadowBase } from '@/lib/chainConfig';
import { SHIELDED_POOL_ABI } from '@/lib/abis';

export function BalancePanel() {
  const { address } = useAccount();
  const [privateBalance, setPrivateBalance] = useState<bigint>(0n);
  const [privateLoading, setPrivateLoading] = useState(false);

  // Public balance
  const { data: publicBalance, isLoading: publicLoading } = useBalance({
    address,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  // Pending auto-shield balance (ETH waiting to be claimed as a commitment)
  const { data: pendingBalance, isLoading: pendingLoading } = useReadContract({
    address: CONTRACTS.SHIELDED_POOL,
    abi: SHIELDED_POOL_ABI,
    functionName: 'pendingShields',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  // Commitment count in the pool (proxy for private activity)
  const { data: nextLeaf } = useReadContract({
    address: CONTRACTS.SHIELDED_POOL,
    abi: SHIELDED_POOL_ABI,
    functionName: 'nextLeafIndex',
    query: { refetchInterval: 5000 },
  });

  // Scan AutoShieldClaimed events to compute private balance
  useEffect(() => {
    if (!address) { setPrivateBalance(0n); return; }

    let cancelled = false;
    const fetchPrivateBalance = async () => {
      setPrivateLoading(true);
      try {
        const client = createPublicClient({ chain: shadowBase, transport: http() });
        const logs = await client.getLogs({
          address: CONTRACTS.SHIELDED_POOL,
          event: {
            type: 'event',
            name: 'AutoShieldClaimed',
            inputs: [
              { name: 'recipient', type: 'address', indexed: true },
              { name: 'amount', type: 'uint256', indexed: false },
              { name: 'commitmentHash', type: 'bytes32', indexed: false },
            ],
          },
          args: { recipient: address },
          fromBlock: 0n,
          toBlock: 'latest',
        });
        if (cancelled) return;
        const total = logs.reduce((sum, log) => sum + (log.args.amount ?? 0n), 0n);
        setPrivateBalance(total);
      } catch (err) {
        console.error('[BalancePanel] Failed to scan AutoShieldClaimed events:', err);
      } finally {
        if (!cancelled) setPrivateLoading(false);
      }
    };

    fetchPrivateBalance();
    const interval = setInterval(fetchPrivateBalance, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [address]);

  const publicEth = publicBalance ? formatEther(publicBalance.value) : '—';
  const pendingEth = pendingBalance ? formatEther(pendingBalance as bigint) : '0';
  const privateEth = formatEther(privateBalance);
  const poolCommitments = nextLeaf?.toString() ?? '—';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Public balance */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">🏦</span>
          <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">Public Account</span>
        </div>
        <div className="mt-2">
          {publicLoading ? (
            <div className="h-8 w-32 bg-white/10 rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-white">
              {parseFloat(publicEth).toFixed(4)}
              <span className="text-lg text-gray-400 ml-2">ETH</span>
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1">Standard on-chain balance — visible to everyone</p>
        </div>
      </div>

      {/* Private balance */}
      <div className="rounded-2xl p-6" style={{ background: 'linear-gradient(135deg, rgba(194,61,245,0.12) 0%, rgba(51,102,255,0.12) 100%)', border: '1px solid rgba(194,61,245,0.2)' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">🔒</span>
          <span className="text-private-400 text-sm font-medium uppercase tracking-wider">Private Sub-Account</span>
        </div>
        <div className="mt-2">
          {pendingLoading || privateLoading ? (
            <div className="h-8 w-32 bg-white/10 rounded animate-pulse" />
          ) : (
            <>
              <p className="text-3xl font-bold text-white">
                {parseFloat(privateEth).toFixed(4)}
                <span className="text-lg text-private-400 ml-2">ETH</span>
              </p>
              {pendingBalance && (pendingBalance as bigint) > BigInt(0) && (
                <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <span className="text-amber-400 text-xs">⏳</span>
                  <span className="text-amber-400 text-xs font-medium">
                    + {parseFloat(pendingEth).toFixed(4)} ETH pending — claim to add to private balance
                  </span>
                </div>
              )}
            </>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Scanned from on-chain commitments • {poolCommitments} total in pool
          </p>
        </div>
      </div>
    </div>
  );
}
