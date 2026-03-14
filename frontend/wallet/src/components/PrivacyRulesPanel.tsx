'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { CONTRACTS, PrivacyMode } from '@/lib/chainConfig';
import { PRIVACY_ROUTER_ABI } from '@/lib/abis';

const MODE_LABELS: Record<number, { label: string; desc: string; color: string }> = {
  [PrivacyMode.PUBLIC]:      { label: 'Public',      desc: 'All incoming transfers are public. Standard behaviour.',                          color: 'text-gray-400'    },
  [PrivacyMode.AUTO_SHIELD]: { label: 'Auto-Shield', desc: 'All incoming ETH is automatically shielded into your private sub-account.',       color: 'text-private-400' },
  [PrivacyMode.CUSTOM]:      { label: 'Custom Rules', desc: 'Shielding based on your custom rules: min amount, token list, sender list.',      color: 'text-shadow-400'  },
};

export function PrivacyRulesPanel() {
  const { address } = useAccount();

  // ── Read current rules ──────────────────────────────────
  const { data: rulesData, isLoading: rulesLoading, refetch: refetchRules } = useReadContract({
    address: CONTRACTS.PRIVACY_ROUTER,
    abi: PRIVACY_ROUTER_ABI,
    functionName: 'getRules',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const currentMode  = rulesData ? Number(rulesData[0]) : PrivacyMode.PUBLIC;
  const currentMin   = rulesData ? rulesData[1] : BigInt(0);

  // ── Local form state ───────────────────────────────────
  const [selectedMode,   setSelectedMode]   = useState<PrivacyMode>(PrivacyMode.PUBLIC);
  const [minAmountEth,   setMinAmountEth]   = useState('0');
  const [tokenInput,     setTokenInput]     = useState('');
  const [senderInput,    setSenderInput]    = useState('');
  const [tokenList,      setTokenList]      = useState<string[]>([]);
  const [senderList,     setSenderList]     = useState<string[]>([]);

  // Sync local state when contract data loads
  useEffect(() => {
    if (rulesData) {
      setSelectedMode(Number(rulesData[0]) as PrivacyMode);
      setMinAmountEth(rulesData[1] ? (Number(rulesData[1]) / 1e18).toString() : '0');
      setTokenList((rulesData[2] as string[]) ?? []);
      setSenderList((rulesData[3] as string[]) ?? []);
    }
  }, [rulesData]);

  // ── setMode TX ─────────────────────────────────────────
  const {
    writeContract: execSetMode,
    data: setModeHash,
    isPending: setModePending,
  } = useWriteContract();

  const { isLoading: setModeConfirming, isSuccess: setModeSuccess } = useWaitForTransactionReceipt({
    hash: setModeHash,
  });

  useEffect(() => {
    if (setModeSuccess) refetchRules();
  }, [setModeSuccess, refetchRules]);

  // ── setRules TX ────────────────────────────────────────
  const {
    writeContract: execSetRules,
    data:  setRulesHash,
    isPending: setRulesPending,
  } = useWriteContract();

  const { isLoading: setRulesConfirming, isSuccess: setRulesSuccess } = useWaitForTransactionReceipt({
    hash: setRulesHash,
  });

  useEffect(() => {
    if (setRulesSuccess) refetchRules();
  }, [setRulesSuccess, refetchRules]);

  const handleToggle = () => {
    const next = currentMode === PrivacyMode.PUBLIC ? PrivacyMode.AUTO_SHIELD : PrivacyMode.PUBLIC;
    execSetMode({
      address: CONTRACTS.PRIVACY_ROUTER,
      abi: PRIVACY_ROUTER_ABI,
      functionName: 'setMode',
      args: [next],
    });
  };

  const handleSaveRules = () => {
    let minWei = BigInt(0);
    try { minWei = parseEther(minAmountEth || '0'); } catch { /* invalid input */ }

    execSetRules({
      address: CONTRACTS.PRIVACY_ROUTER,
      abi: PRIVACY_ROUTER_ABI,
      functionName: 'setRules',
      args: [minWei, tokenList as `0x${string}`[], senderList as `0x${string}`[]],
    });
  };

  const addToList = (list: string[], setList: (v: string[]) => void, value: string) => {
    if (!value || !value.startsWith('0x') || value.length !== 42) return;
    if (!list.includes(value)) setList([...list, value]);
  };

  const removeFromList = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.filter(v => v !== item));
  };

  const isAutoShield = currentMode === PrivacyMode.AUTO_SHIELD;
  const modeInfo     = MODE_LABELS[currentMode];
  const isBusy       = setModePending || setModeConfirming || setRulesPending || setRulesConfirming;

  return (
    <div className="glass rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Privacy Rules</h2>
          <p className="text-sm text-gray-400 mt-0.5">Configure how incoming transfers are handled for your address</p>
        </div>
        {rulesLoading && (
          <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        )}
      </div>

      {/* Auto-Shield Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
        <div>
          <p className="font-medium text-white">Auto-Shield</p>
          <p className="text-sm text-gray-400 mt-0.5">
            Automatically shield all incoming ETH into your private sub-account
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={isBusy || !address}
          className={`relative inline-flex h-7 w-13 items-center rounded-full transition-colors focus:outline-none ${
            isAutoShield ? 'bg-private-600' : 'bg-gray-600'
          } disabled:opacity-50 w-12`}
          aria-label="Toggle auto-shield"
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
              isAutoShield ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Current mode badge */}
      <div className={`flex items-center gap-2 text-sm ${modeInfo.color}`}>
        <span>{isAutoShield ? '🔒' : '🔓'}</span>
        <span className="font-medium">{modeInfo.label}</span>
        <span className="text-gray-500">—</span>
        <span className="text-gray-400">{modeInfo.desc}</span>
      </div>

      {/* Mode selector */}
      <div className="space-y-2">
        <p className="text-sm text-gray-400 font-medium">Privacy Mode</p>
        <div className="grid grid-cols-3 gap-2">
          {([PrivacyMode.PUBLIC, PrivacyMode.AUTO_SHIELD, PrivacyMode.CUSTOM] as PrivacyMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setSelectedMode(mode)}
              className={`p-3 rounded-xl text-sm font-medium text-center border transition-all ${
                selectedMode === mode
                  ? 'border-shadow-500 bg-shadow-600/20 text-shadow-300'
                  : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
              }`}
            >
              {MODE_LABELS[mode].label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Rules — shown when CUSTOM or AUTO_SHIELD */}
      {(selectedMode === PrivacyMode.AUTO_SHIELD || selectedMode === PrivacyMode.CUSTOM) && (
        <div className="space-y-4 pt-2 border-t border-white/10">
          {/* Min amount */}
          <div>
            <label className="text-sm text-gray-400 font-medium block mb-1.5">
              Minimum Amount (ETH)
              <span className="text-gray-600 ml-1">— only shield if amount ≥ this value (0 = shield all)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.001"
              value={minAmountEth}
              onChange={e => setMinAmountEth(e.target.value)}
              placeholder="0.0"
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500 text-sm"
            />
          </div>

          {/* Token whitelist */}
          <div>
            <label className="text-sm text-gray-400 font-medium block mb-1.5">
              Token Whitelist
              <span className="text-gray-600 ml-1">— only shield these tokens (empty = all tokens)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="0x… token address"
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500 text-sm font-mono"
              />
              <button
                onClick={() => { addToList(tokenList, setTokenList, tokenInput); setTokenInput(''); }}
                className="px-4 py-2.5 rounded-xl bg-shadow-700 hover:bg-shadow-600 text-white text-sm font-medium"
              >
                Add
              </button>
            </div>
            {tokenList.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tokenList.map(addr => (
                  <span key={addr} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-shadow-900/50 border border-shadow-700/30 text-xs font-mono text-shadow-300">
                    {addr.slice(0,6)}…{addr.slice(-4)}
                    <button onClick={() => removeFromList(tokenList, setTokenList, addr)} className="text-gray-500 hover:text-white">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Sender whitelist — senders to NOT shield */}
          <div>
            <label className="text-sm text-gray-400 font-medium block mb-1.5">
              Sender Whitelist
              <span className="text-gray-600 ml-1">— never shield transfers from these senders</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={senderInput}
                onChange={e => setSenderInput(e.target.value)}
                placeholder="0x… sender address"
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500 text-sm font-mono"
              />
              <button
                onClick={() => { addToList(senderList, setSenderList, senderInput); setSenderInput(''); }}
                className="px-4 py-2.5 rounded-xl bg-shadow-700 hover:bg-shadow-600 text-white text-sm font-medium"
              >
                Add
              </button>
            </div>
            {senderList.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {senderList.map(addr => (
                  <span key={addr} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-900/30 border border-amber-700/30 text-xs font-mono text-amber-400">
                    {addr.slice(0,6)}…{addr.slice(-4)}
                    <button onClick={() => removeFromList(senderList, setSenderList, addr)} className="text-gray-500 hover:text-white">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Save rules button */}
          <button
            onClick={handleSaveRules}
            disabled={isBusy || !address}
            className="w-full py-3 rounded-xl bg-shadow-600 hover:bg-shadow-500 disabled:opacity-50 font-semibold text-white transition-all"
          >
            {setRulesPending || setRulesConfirming ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving Rules…
              </span>
            ) : 'Save Privacy Rules'}
          </button>
        </div>
      )}

      {/* Status toasts */}
      {setModeSuccess && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          ✅ Privacy mode updated on-chain
        </div>
      )}
      {setRulesSuccess && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          ✅ Privacy rules saved on-chain
        </div>
      )}
    </div>
  );
}
