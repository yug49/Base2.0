'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  fetchTransactionByHash,
  fetchAccountByAddress,
  type TxDetail,
  type AccountDetail,
} from '@/lib/fetcher';
import { TxTypeBadge } from './TxTypeBadge';

type SearchResult =
  | { type: 'tx'; data: TxDetail }
  | { type: 'account'; data: AccountDetail }
  | null;

function isValidTxHash(s: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

function isValidAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

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

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close results when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearching(true);
    setError(null);
    setResult(null);
    setShowResults(true);

    if (isValidTxHash(trimmed)) {
      const txData = await fetchTransactionByHash(trimmed);
      if (txData) {
        setResult({ type: 'tx', data: txData });
      } else {
        setError('Transaction not found. Make sure the hash is correct and the devnet is running.');
      }
    } else if (isValidAddress(trimmed)) {
      const accData = await fetchAccountByAddress(trimmed);
      if (accData) {
        setResult({ type: 'account', data: accData });
      } else {
        setError('Could not fetch account details. Is the devnet running?');
      }
    } else {
      setError('Invalid input. Enter a transaction hash (0x + 64 hex chars) or an account address (0x + 40 hex chars).');
    }

    setSearching(false);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
    if (e.key === 'Escape') setShowResults(false);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-3xl mx-auto">
      {/* Search Input */}
      <div className="flex items-center gap-2 glass rounded-xl px-4 py-3 focus-within:border-shadow-500/40 transition-colors">
        <svg
          className="w-5 h-5 text-gray-500 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by transaction hash or account address (0x…)"
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none font-mono"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="px-4 py-1.5 rounded-lg bg-shadow-600/80 hover:bg-shadow-500 disabled:opacity-40 text-xs font-medium text-white transition-colors"
        >
          {searching ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Searching…
            </span>
          ) : (
            'Search'
          )}
        </button>
      </div>

      {/* Results Panel */}
      {showResults && (searching || result || error) && (
        <div className="absolute z-50 mt-2 w-full glass-dark rounded-2xl p-5 shadow-2xl max-h-[80vh] overflow-y-auto">
          {/* Close button */}
          <button
            onClick={() => setShowResults(false)}
            className="absolute top-3 right-3 text-gray-500 hover:text-white transition-colors text-lg"
          >
            ✕
          </button>

          {/* Loading */}
          {searching && (
            <div className="flex items-center justify-center py-8">
              <span className="w-6 h-6 border-2 border-shadow-500/30 border-t-shadow-400 rounded-full animate-spin" />
              <span className="ml-3 text-sm text-gray-400">Searching…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 py-4 px-2">
              <span className="text-2xl">⚠️</span>
              <p className="text-sm text-gray-400">{error}</p>
            </div>
          )}

          {/* Transaction Result */}
          {result?.type === 'tx' && <TxResultView tx={result.data} />}

          {/* Account Result */}
          {result?.type === 'account' && <AccountResultView account={result.data} />}
        </div>
      )}
    </div>
  );
}

// ── Transaction Detail View ──────────────────────────────────────────

function TxResultView({ tx }: { tx: TxDetail }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-lg">📝</span>
        <h3 className="text-sm font-semibold text-white">Transaction Details</h3>
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
        <Row label="From" value={tx.from} mono />
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
        />
        {tx.contractAddress && <Row label="Contract Created" value={tx.contractAddress} mono />}
        <Row
          label="Value"
          value={tx.valueDisplay}
          highlight={tx.valueDisplay === 'SHIELDED'}
        />
        <Row label="Method" value={tx.methodId} />
        <Row label="Nonce" value={tx.nonce.toString()} />
        <Row label="Gas Used" value={tx.gasUsed.toLocaleString()} />
        <Row label="Effective Gas Price" value={`${tx.effectiveGasPrice.toLocaleString()} wei`} />
        <Row label="Cumulative Gas Used" value={tx.cumulativeGasUsed.toLocaleString()} />
        <Row label="Logs" value={`${tx.logsCount} event log(s)`} />
        {tx.isPrivacy && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-private-500/10 border border-private-500/20">
            <span className="text-private-400 text-xs font-medium">
              🛡️ This is a privacy transaction — recipient and/or value may be shielded
            </span>
          </div>
        )}
        {tx.input && tx.input !== '0x' && (
          <div className="mt-2">
            <span className="text-gray-500 text-[11px] font-medium block mb-1">Input Data</span>
            <div className="bg-white/[0.03] rounded-lg p-2 font-mono text-[11px] text-gray-400 break-all max-h-24 overflow-y-auto">
              {tx.input}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Account Detail View ──────────────────────────────────────────────

function AccountResultView({ account }: { account: AccountDetail }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-lg">👤</span>
        <h3 className="text-sm font-semibold text-white">Account Details</h3>
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

      {/* Recent Transactions for this Account */}
      {account.recentTxs.length > 0 && (
        <div className="mt-3">
          <h4 className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-2">
            Recent Transactions ({account.recentTxs.length})
          </h4>
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {account.recentTxs.slice(0, 25).map((tx) => (
              <div
                key={tx.hash}
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
                    <span className="text-[11px] text-private-400 font-medium">🔒 SHIELDED</span>
                  ) : (
                    <span className="text-[11px] text-gray-400 font-mono">{tx.valueDisplay}</span>
                  )}
                  <div className="text-[10px] text-gray-600">{timeAgo(tx.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {account.recentTxs.length === 0 && (
        <p className="text-xs text-gray-600 mt-2">No recent transactions found for this address.</p>
      )}
    </div>
  );
}

// ── Shared Row Component ─────────────────────────────────────────────

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
      <span className="text-gray-500 text-[11px] font-medium w-36 shrink-0">{label}</span>
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
