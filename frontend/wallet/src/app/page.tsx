'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@/components/ConnectButton';
import { BalancePanel } from '@/components/BalancePanel';
import { PrivacyRulesPanel } from '@/components/PrivacyRulesPanel';
import { SendPanel } from '@/components/SendPanel';
import { PoolStats } from '@/components/PoolStats';
import { AddressCard } from '@/components/AddressCard';

type Tab = 'wallet' | 'privacy' | 'send';

export default function Home() {
  const { isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>('wallet');

  const navTabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'wallet',  label: 'Wallet',  icon: '💫' },
    { id: 'privacy', label: 'Privacy', icon: '🔒' },
    { id: 'send',    label: 'Send',    icon: '📤' },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c23df5 0%, #3366ff 100%)' }}>
              <span className="text-sm">🛡</span>
            </div>
            <div>
              <h1 className="font-bold text-white text-sm">ShadowBase</h1>
              <p className="text-xs text-gray-500">Privacy-Native Base Chain</p>
            </div>
          </div>
          <ConnectButton />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {!isConnected ? (
          /* Landing / not connected */
          <div className="text-center py-16 space-y-6">
            <div className="text-6xl">🛡️</div>
            <h2 className="text-3xl font-bold text-white">
              Privacy-Native Base
            </h2>
            <p className="text-gray-400 max-w-md mx-auto">
              Every wallet on ShadowBase has a built-in private sub-account.
              Toggle one switch — incoming ETH automatically goes into your
              shielded pool powered by RAILGUN ZK cryptography.
            </p>
            <div className="flex flex-col items-center gap-3">
              <ConnectButton />
              <p className="text-xs text-gray-600">
                Connect MetaMask to ShadowBase Devnet (Chain ID: 845311 · RPC: localhost:8545)
              </p>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-3 gap-4 mt-8">
              {[
                { icon: '⚡', title: 'One Toggle', desc: 'Enable privacy with a single switch. No special wallets.' },
                { icon: '🔒', title: 'Auto-Shield', desc: 'Incoming ETH is automatically shielded. Senders don\'t need to do anything.' },
                { icon: '🌉', title: 'Cross-Chain', desc: 'Bridge private funds to RAILGUN on Ethereum Sepolia.' },
              ].map(f => (
                <div key={f.title} className="glass rounded-xl p-4 text-left">
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <h3 className="text-sm font-semibold text-white mb-1">{f.title}</h3>
                  <p className="text-xs text-gray-500">{f.desc}</p>
                </div>
              ))}
            </div>

            {/* Pool stats — always visible */}
            <div className="mt-4">
              <PoolStats />
            </div>
          </div>
        ) : (
          /* Connected — main wallet UI */
          <>
            <AddressCard />

            {/* Navigation */}
            <nav className="flex gap-1 p-1 rounded-2xl glass">
              {navTabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
                    tab === t.id
                      ? 'bg-white/10 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </nav>

            {/* Tab content */}
            <div>
              {tab === 'wallet' && (
                <div className="space-y-4">
                  <BalancePanel />
                  <PoolStats />
                  <div className="glass rounded-2xl p-5 space-y-3">
                    <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">How it works</h3>
                    <div className="space-y-2 text-sm text-gray-400">
                      <div className="flex gap-3">
                        <span className="text-private-400 font-bold">1.</span>
                        <span>Go to <strong className="text-white">Privacy</strong> tab and toggle <strong className="text-private-300">Auto-Shield ON</strong></span>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-private-400 font-bold">2.</span>
                        <span>Ask Alice to send you ETH normally — she doesn't need to do anything special</span>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-private-400 font-bold">3.</span>
                        <span>The ShadowBase precompile intercepts the transfer and shields it automatically</span>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-private-400 font-bold">4.</span>
                        <span>Your public balance shows <strong className="text-white">0 ETH received</strong> — your private sub-account has the funds</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'privacy' && <PrivacyRulesPanel />}

              {tab === 'send' && <SendPanel />}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-4 mt-8">
        <div className="max-w-3xl mx-auto flex items-center justify-between text-xs text-gray-600">
          <span>ShadowBase — forked from <span className="text-gray-500">base/op-geth</span> &amp; <span className="text-gray-500">base/optimism</span></span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
            Devnet · Chain ID 845311 · Settles to Ethereum Sepolia
          </span>
        </div>
      </footer>
    </div>
  );
}
