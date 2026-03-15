'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { TxTypeBadge } from '@/components/TxTypeBadge';
import { fetchTransactionByHash, type TxDetail } from '@/lib/fetcher';

function timeAgo(ts: bigint): string {
  const diff = Math.floor(Date.now() / 1000) - Number(ts);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function TxPage() {
  const params = useParams();
  const hash = params.hash as string;
  const [tx, setTx] = useState<TxDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hash) return;
    setLoading(true);
    fetchTransactionByHash(hash)
      .then((data) => {
        if (data) {
          setTx(data);
        } else {
          setError('Transaction not found. Make sure the hash is correct and the devnet is running.');
        }
      })
      .catch(() => setError('Failed to fetch transaction.'))
      .finally(() => setLoading(false));
  }, [hash]);

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
            <span className="ml-3 text-sm text-gray-400">Loading transaction…</span>
          </div>
        )}

        {error && (
          <div className="glass rounded-2xl p-6 flex items-center gap-3">
            <span className="text-2xl"></span>
            <p className="text-sm text-gray-400">{error}</p>
          </div>
        )}

        {tx && (
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-lg"></span>
              <h1 className="text-sm font-semibold text-white">Transaction Details</h1>
              <TxTypeBadge type={tx.txType} />
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                  tx.status === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-red-500/10 text-red-400'
                }`}
              >
                {tx.status === 'success' ? '✓ Success' : '✗ Reverted'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs">
              <Row label="Tx Hash" value={tx.hash} mono />
              <Row label="Block" value={tx.blockNumber.toString()} />
              <Row label="Timestamp" value={`${new Date(Number(tx.timestamp) * 1000).toLocaleString()} (${timeAgo(tx.timestamp)})`} />
              <Row label="From" value={tx.from} mono link={`/address/${tx.from}`} />
              <Row
                label="To"
                value={
                  tx.to
                    ? tx.toLabel
                      ? `${tx.toLabel} (${tx.to})`
                      : tx.to
                    : 'Contract Creation'
                }
                mono={!!tx.to}
                highlight={tx.isPrivacy}
                link={tx.to ? `/address/${tx.to}` : undefined}
              />
              {tx.contractAddress && <Row label="Contract Created" value={tx.contractAddress} mono link={`/address/${tx.contractAddress}`} />}
              <Row label="Value" value={tx.valueDisplay} highlight={tx.valueDisplay === 'SHIELDED'} />
              <Row label="Method" value={tx.methodId} />
              <Row label="Nonce" value={tx.nonce.toString()} />
              <Row label="Gas Used" value={tx.gasUsed.toLocaleString()} />
              <Row label="Effective Gas Price" value={`${tx.effectiveGasPrice.toLocaleString()} wei`} />
              <Row label="Cumulative Gas Used" value={tx.cumulativeGasUsed.toLocaleString()} />
              <Row label="Logs" value={`${tx.logsCount} event log(s)`} />
              {tx.isPrivacy && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-private-500/10 border border-private-500/20">
                  <span className="text-private-400 text-xs font-medium">
                    This is a privacy transaction — recipient and/or value may be shielded
                  </span>
                </div>
              )}
              {tx.input && tx.input !== '0x' && (
                <div className="mt-2">
                  <span className="text-gray-500 text-[11px] font-medium block mb-1">Input Data</span>
                  <div className="bg-white/[0.03] rounded-lg p-2 font-mono text-[11px] text-gray-400 break-all max-h-40 overflow-y-auto">
                    {tx.input}
                  </div>
                </div>
              )}
            </div>
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
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  link?: string;
}) {
  const textClass = `text-xs break-all ${
    highlight
      ? 'text-private-400 font-medium'
      : mono
      ? 'font-mono text-gray-300'
      : 'text-gray-300'
  }`;

  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-gray-500 text-[11px] font-medium w-40 shrink-0">{label}</span>
      {link ? (
        <Link href={link} className={`${textClass} hover:text-shadow-400 transition-colors`}>
          {value}
        </Link>
      ) : (
        <span className={textClass}>{value}</span>
      )}
    </div>
  );
}
