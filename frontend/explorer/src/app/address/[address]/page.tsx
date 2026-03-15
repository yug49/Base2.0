'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { TxTypeBadge } from '@/components/TxTypeBadge';
import { fetchAccountByAddress, type AccountDetail } from '@/lib/fetcher';

function truncAddr(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function timeAgo(ts: bigint): string {
  const diff = Math.floor(Date.now() / 1000) - Number(ts);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function privacyModeLabel(mode: number | null): string {
  if (mode === null) return 'Unknown';
  if (mode === 0) return 'Off';
  if (mode === 1) return 'Auto-Shield';
  if (mode === 2) return 'Full Privacy';
  return `Mode ${mode}`;
}

export default function AddressPage() {
  const params = useParams();
  const address = params.address as string;
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetchAccountByAddress(address)
      .then((data) => {
        if (data) {
          setAccount(data);
        } else {
          setError('Could not fetch account details. Is the devnet running?');
        }
      })
      .catch(() => setError('Failed to fetch account.'))
      .finally(() => setLoading(false));
  }, [address]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-8">
        <Link href="/" className="text-sm text-shadow-400 hover:text-shadow-300 transition-colors mb-6 inline-block">
          ← Back to Explorer
        </Link>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <span className="w-6 h-6 border-2 border-shadow-500/30 border-t-shadow-400 rounded-full animate-spin" />
            <span className="ml-3 text-sm text-gray-400">Loading account…</span>
          </div>
        )}

        {error && (
          <div className="glass rounded-2xl p-6 flex items-center gap-3">
            <span className="text-2xl"></span>
            <p className="text-sm text-gray-400">{error}</p>
          </div>
        )}

        {account && (
          <div className="space-y-6">
            {/* Account Info */}
            <div className="glass rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-lg"></span>
                <h1 className="text-sm font-semibold text-white">Account Details</h1>
                {account.label && (
                  <span className="px-2 py-0.5 rounded bg-shadow-500/10 text-shadow-400 text-[11px] font-medium">
                    {account.label}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs">
                <Row label="Address" value={account.address} mono />
                <Row label="Balance" value={account.balanceDisplay} />
                <Row label="Transaction Count" value={account.transactionCount.toString()} />
                <Row
                  label="Privacy Mode"
                  value={privacyModeLabel(account.privacyMode)}
                  highlight={account.privacyMode !== null && account.privacyMode > 0}
                />
              </div>
            </div>

            {/* Recent Transactions */}
            {account.recentTxs.length > 0 && (
              <div className="glass rounded-2xl p-6">
                <h2 className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-4">
                  Recent Transactions ({account.recentTxs.length})
                </h2>
                <div className="space-y-1">
                  {account.recentTxs.slice(0, 50).map((tx) => (
                    <Link
                      key={tx.hash}
                      href={`/tx/${tx.hash}`}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors ${
                        tx.isPrivacy ? 'privacy-glow' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <TxTypeBadge type={tx.txType} />
                        <div>
                          <span className="font-mono text-[11px] text-shadow-400">
                            {tx.hash.slice(0, 10)}…{tx.hash.slice(-6)}
                          </span>
                          <div className="text-[10px] text-gray-600">
                            {tx.from.toLowerCase() === account.address.toLowerCase() ? 'OUT → ' : 'IN ← '}
                            {tx.to ? truncAddr(tx.to) : 'Contract Create'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {tx.valueDisplay === 'SHIELDED' ? (
                          <span className="text-[11px] text-private-400 font-medium">SHIELDED</span>
                        ) : (
                          <span className="text-[11px] text-gray-400 font-mono">{tx.valueDisplay}</span>
                        )}
                        <div className="text-[10px] text-gray-600">{timeAgo(tx.timestamp)}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {account.recentTxs.length === 0 && (
              <p className="text-xs text-gray-600">No recent transactions found for this address.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
  highlight = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-gray-500 text-[11px] font-medium w-40 shrink-0">{label}</span>
      <span
        className={`text-xs break-all ${
          highlight
            ? 'text-private-400 font-medium'
            : mono
            ? 'font-mono text-gray-300'
            : 'text-gray-300'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
