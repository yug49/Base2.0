'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

function isValidTxHash(s: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

function isValidAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSearch = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setError(null);

    if (isValidTxHash(trimmed)) {
      router.push(`/tx/${trimmed}`);
    } else if (isValidAddress(trimmed)) {
      router.push(`/address/${trimmed}`);
    } else {
      setError('Invalid input. Enter a transaction hash (0x + 64 hex chars) or an account address (0x + 40 hex chars).');
    }
  }, [query, router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-2">
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
          onChange={(e) => { setQuery(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder="Search by transaction hash or account address (0x…)"
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none font-mono"
        />
        <button
          onClick={handleSearch}
          disabled={!query.trim()}
          className="px-4 py-1.5 rounded-lg bg-shadow-600/80 hover:bg-shadow-500 disabled:opacity-40 text-xs font-medium text-white transition-colors"
        >
          Search
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 glass rounded-xl">
          <span className="text-lg"></span>
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      )}
    </div>
  );
}
