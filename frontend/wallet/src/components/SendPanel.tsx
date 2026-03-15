'use client';

import { useState, useCallback } from 'react';
import { useAccount, useSendTransaction, useWriteContract, useWaitForTransactionReceipt, useSignMessage } from 'wagmi';
import { parseEther, isAddress } from 'viem';
import { CONTRACTS } from '@/lib/chainConfig';
import { SHIELDED_POOL_ABI } from '@/lib/abis';

type Tab = 'public' | 'unshield' | 'claim';

export function SendPanel() {
  const { address } = useAccount();
  const [tab, setTab] = useState<Tab>('public');

  // ── Public Send ────────────────────────────────────────
  const [pubTo,    setPubTo]    = useState('');
  const [pubAmt,   setPubAmt]   = useState('');

  const {
    sendTransaction:   execPublicSend,
    data:              publicSendHash,
    isPending:         publicSendPending,
    error:             publicSendError,
  } = useSendTransaction();

  const { isLoading: publicSendConfirming, isSuccess: publicSendSuccess } =
    useWaitForTransactionReceipt({ hash: publicSendHash });

  const handlePublicSend = () => {
    if (!isAddress(pubTo) || !pubAmt) return;
    execPublicSend({ to: pubTo as `0x${string}`, value: parseEther(pubAmt) });
  };

  // ── Unshield (private → public) ─────────────────────────
  // Uses Rajat's Phase 5 zkUtils to generate a Groth16 proof client-side,
  // then submits the proven transaction to ShieldedPool.transact().
  const [unshieldTo,  setUnshieldTo]  = useState('');
  const [unshieldAmt, setUnshieldAmt] = useState('');
  const [proofStatus, setProofStatus] = useState<'idle' | 'generating' | 'submitting' | 'done' | 'error'>('idle');
  const [proofTimeMs, setProofTimeMs] = useState<number | null>(null);
  const [proofError,  setProofError]  = useState<string | null>(null);

  const {
    writeContract:   execUnshield,
    data:            unshieldHash,
    isPending:       unshieldPending,
    error:           unshieldError,
  } = useWriteContract();

  const { isLoading: unshieldConfirming, isSuccess: unshieldSuccess } =
    useWaitForTransactionReceipt({ hash: unshieldHash });

  const handleUnshield = useCallback(async () => {
    if (!isAddress(unshieldTo) || !unshieldAmt || !address) return;

    setProofStatus('generating');
    setProofError(null);
    setProofTimeMs(null);

    try {
      // Lazy-import zkUtils so snarkjs/circomlibjs WASM is only loaded when needed
      const {
        initZK,
        generateKeys,
        generateUnshieldProof,
        MerkleTree,
        Note,
        TokenType,
        NATIVE_ETH_ADDRESS,
      } = await import('@/lib/zk');

      await initZK();

      // For hackathon demo: generate ephemeral keys.
      // In production, derive from the user's wallet signature (EIP-712 seed).
      const keys = generateKeys();

      // Create a dummy input note with the requested value
      // In production: scan on-chain Shield events, reconstruct notes, verify ownership.
      const amount = parseEther(unshieldAmt);
      const inputNote = new Note(
        keys.spendingKey,
        keys.viewingKey,
        amount,
        crypto.getRandomValues(new Uint8Array(16)),
        { tokenType: TokenType.ERC20, tokenAddress: NATIVE_ETH_ADDRESS, tokenSubID: 0n },
      );

      // Build a local Merkle tree with the input note
      const merkleTree = await MerkleTree.create(0);
      const hash = await inputNote.getHash();
      await merkleTree.insertLeaves([hash]);

      // Generate Groth16 unshield proof
      const result = await generateUnshieldProof(
        merkleTree,
        [inputNote],
        unshieldTo,
        amount,
        { tokenType: TokenType.ERC20, tokenAddress: NATIVE_ETH_ADDRESS, tokenSubID: 0n },
        keys,
      );

      setProofTimeMs(result.proofTimeMs);
      setProofStatus('submitting');

      // Submit to ShieldedPool.transact()
      const tx = result.transaction;
      execUnshield({
        address: CONTRACTS.SHIELDED_POOL,
        abi: SHIELDED_POOL_ABI,
        functionName: 'transact',
        args: [[{
          proof: {
            a: { x: tx.proof.a.x, y: tx.proof.a.y },
            b: { x: tx.proof.b.x, y: tx.proof.b.y },
            c: { x: tx.proof.c.x, y: tx.proof.c.y },
          },
          merkleRoot: tx.merkleRoot,
          nullifiers: tx.nullifiers,
          commitments: tx.commitments,
          boundParams: {
            treeNumber: tx.boundParams.treeNumber,
            minGasPrice: tx.boundParams.minGasPrice,
            unshield: tx.boundParams.unshield,
            chainID: tx.boundParams.chainID,
            adaptContract: tx.boundParams.adaptContract,
            adaptParams: tx.boundParams.adaptParams,
            commitmentCiphertext: tx.boundParams.commitmentCiphertext,
          },
          unshieldPreimage: tx.unshieldPreimage,
        }]],
      });

      setProofStatus('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Unshield] Proof generation failed:', err);
      setProofError(msg.slice(0, 200));
      setProofStatus('error');
    }
  }, [unshieldTo, unshieldAmt, address, execUnshield]);

  // ── Claim Auto-Shield pending balance ─────────────────
  const [claimStatus, setClaimStatus] = useState<'idle' | 'signing' | 'deriving' | 'submitting' | 'done' | 'error'>('idle');
  const [claimErrorMsg, setClaimErrorMsg] = useState<string | null>(null);

  const { signMessageAsync } = useSignMessage();

  const {
    writeContract:   execClaim,
    data:            claimHash,
    isPending:       claimPending,
    error:           claimError,
  } = useWriteContract();

  const { isLoading: claimConfirming, isSuccess: claimSuccess } =
    useWaitForTransactionReceipt({ hash: claimHash });

  const handleClaim = useCallback(async () => {
    if (!address) return;
    setClaimStatus('signing');
    setClaimErrorMsg(null);

    try {
      // 1. Sign a deterministic message to derive a seed for RAILGUN keys
      const sig = await signMessageAsync({
        message: 'Base2.0: Derive private keys for address ' + address,
      });

      setClaimStatus('deriving');

      // 2. Derive deterministic RAILGUN keys from the signature
      const { initZK, deriveKeysFromSeed, generateClaimData, hexToBytes } = await import('@/lib/zk');
      await initZK();

      const seed = hexToBytes(sig);
      const keys = await deriveKeysFromSeed(seed);

      // 3. Generate npk + ciphertext for the claim
      const claimData = await generateClaimData(keys);

      setClaimStatus('submitting');

      // 4. Submit the claim transaction
      execClaim({
        address: CONTRACTS.SHIELDED_POOL,
        abi: SHIELDED_POOL_ABI,
        functionName: 'claimAutoShield',
        args: [claimData.npk, claimData.ciphertext],
      });

      setClaimStatus('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setClaimErrorMsg(msg.slice(0, 200));
      setClaimStatus('error');
    }
  }, [address, signMessageAsync, execClaim]);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'public',   label: 'Public Send',    icon: '' },
    { id: 'unshield', label: 'Unshield',        icon: '' },
    { id: 'claim',    label: 'Claim Auto-Shield', icon: '' },
  ];

  return (
    <div className="glass rounded-2xl p-6 space-y-5">
      <h2 className="text-lg font-semibold text-white">Send & Withdraw</h2>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-white/10 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Public Send ──────────────────────────────────── */}
      {tab === 'public' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">Standard ETH transfer — fully visible on-chain.</p>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Recipient Address</label>
            <input
              type="text"
              value={pubTo}
              onChange={e => setPubTo(e.target.value)}
              placeholder="0x…"
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Amount (ETH)</label>
            <input
              type="number"
              min="0"
              step="0.001"
              value={pubAmt}
              onChange={e => setPubAmt(e.target.value)}
              placeholder="0.0"
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500 text-sm"
            />
          </div>
          <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 text-xs text-blue-400">
            If the recipient has <strong>Auto-Shield enabled</strong>, the precompile will automatically redirect your ETH to their private sub-account. You don't need to do anything special.
          </div>
          <button
            onClick={handlePublicSend}
            disabled={publicSendPending || publicSendConfirming || !pubTo || !pubAmt || !address}
            className="w-full py-3 rounded-xl bg-shadow-600 hover:bg-shadow-500 disabled:opacity-50 font-semibold text-white transition-all"
          >
            {publicSendPending || publicSendConfirming ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {publicSendPending ? 'Confirm in MetaMask…' : 'Confirming…'}
              </span>
            ) : 'Send ETH'}
          </button>
          {publicSendSuccess && (
            <div className="flex flex-col gap-1 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
              <span>Transaction confirmed</span>
              {publicSendHash && (
                <span className="text-xs font-mono text-green-600 break-all">{publicSendHash}</span>
              )}
            </div>
          )}
          {publicSendError && (
            <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {publicSendError.message.slice(0, 120)}
            </div>
          )}
        </div>
      )}

      {/* ── Unshield ─────────────────────────────────────── */}
      {tab === 'unshield' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Withdraw ETH from your private sub-account to any public address.
            Requires a ZK proof generated by the RAILGUN SDK.
          </p>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Destination Address</label>
            <input
              type="text"
              value={unshieldTo}
              onChange={e => setUnshieldTo(e.target.value)}
              placeholder="0x… recipient"
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Amount (ETH)</label>
            <input
              type="number"
              min="0"
              step="0.001"
              value={unshieldAmt}
              onChange={e => setUnshieldAmt(e.target.value)}
              placeholder="0.0"
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500 text-sm"
            />
          </div>
          <div className="p-3 rounded-lg bg-private-500/5 border border-private-500/20 text-xs text-private-400">
            <strong>How it works:</strong> Your wallet generates a Groth16 ZK proof locally proving you own a commitment worth ≥ the unshield amount. The proof is submitted to <code>ShieldedPool.transact()</code>. No one can link your original deposit to this withdrawal.
          </div>
          <button
            onClick={handleUnshield}
            disabled={proofStatus === 'generating' || proofStatus === 'submitting' || unshieldPending || unshieldConfirming || !unshieldTo || !unshieldAmt || !address}
            className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #c23df5 0%, #3366ff 100%)' }}
          >
            {proofStatus === 'generating' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating ZK Proof…
              </span>
            ) : unshieldPending || unshieldConfirming ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {unshieldPending ? 'Confirm in MetaMask…' : 'Confirming on-chain…'}
              </span>
            ) : 'Generate Proof & Unshield'}
          </button>
          {proofTimeMs !== null && (
            <div className="px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs">
              Proof generated in {(proofTimeMs / 1000).toFixed(2)}s
            </div>
          )}
          {unshieldSuccess && (
            <div className="flex flex-col gap-1 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
              <span>Unshield transaction confirmed</span>
              {unshieldHash && (
                <span className="text-xs font-mono text-green-600 break-all">{unshieldHash}</span>
              )}
            </div>
          )}
          {proofError && (
            <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              Proof error: {proofError}
            </div>
          )}
          {unshieldError && (
            <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {unshieldError.message.slice(0, 120)}
            </div>
          )}
        </div>
      )}

      {/* ── Claim Auto-Shield ────────────────────────────── */}
      {tab === 'claim' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            When someone sends ETH to your address and you have Auto-Shield enabled, the precompile
            holds the ETH in a pending balance. Claim it here to create your private UTXO commitment.
          </p>
          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 text-xs text-amber-400">
            <strong>One-click claim:</strong> Your wallet will sign a message to derive your private RAILGUN keys,
            then automatically generate the NPK and ciphertext needed for the claim. No manual input required.
          </div>
          <button
            onClick={handleClaim}
            disabled={claimStatus === 'signing' || claimStatus === 'deriving' || claimStatus === 'submitting' || claimPending || claimConfirming || !address}
            className="w-full py-3 rounded-xl bg-amber-700 hover:bg-amber-600 disabled:opacity-50 font-semibold text-white transition-all"
          >
            {claimStatus === 'signing' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sign in MetaMask…
              </span>
            ) : claimStatus === 'deriving' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Deriving keys…
              </span>
            ) : claimPending || claimConfirming ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {claimPending ? 'Confirm in MetaMask…' : 'Confirming on-chain…'}
              </span>
            ) : 'Claim Auto-Shield Balance'}
          </button>
          {claimSuccess && (
            <div className="flex flex-col gap-1 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
              <span>Committed into private sub-account</span>
              {claimHash && (
                <span className="text-xs font-mono text-green-600 break-all">{claimHash}</span>
              )}
            </div>
          )}
          {(claimErrorMsg || claimError) && (
            <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {claimErrorMsg || claimError?.message.slice(0, 120)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
