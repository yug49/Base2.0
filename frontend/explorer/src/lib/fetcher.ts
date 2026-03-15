// ============================================================================
// ShadowBase Explorer — Data Fetching Helpers
// Reads blocks, transactions, and pool state from the L2 devnet via RPC
// ============================================================================

import {
  type Block,
  type Transaction,
  type TransactionReceipt,
  type Log,
  formatEther,
  parseAbiItem,
  decodeEventLog,
} from 'viem';
import { publicClient, CONTRACTS, labelAddress } from './config';
import { SHIELDED_POOL_ABI } from './abis';

// ── Types ───────────────────────────────────────────────────────────

export interface ExplorerBlock {
  number: bigint;
  hash: string;
  timestamp: bigint;
  txCount: number;
  gasUsed: bigint;
  gasLimit: bigint;
  miner: string;
}

export type TxType = 'public' | 'shielded' | 'shield' | 'unshield' | 'transact' | 'claim' | 'bridge' | 'contract' | 'system';

export interface ExplorerTx {
  hash: string;
  blockNumber: bigint;
  from: string;
  to: string | null;
  toLabel: string | null;
  value: bigint;
  valueDisplay: string;
  txType: TxType;
  gasUsed: bigint;
  gasPrice: bigint;
  timestamp: bigint;
  methodId: string;
  isPrivacy: boolean;
}

export interface PoolStats {
  merkleRoot: string;
  treeNumber: bigint;
  nextLeafIndex: bigint;
  totalCommitments: bigint;
  totalShieldEvents: number;
  totalTransactEvents: number;
  totalNullifiers: number;
  totalShieldedValue: bigint; // sum of Shield event values
}

// ── Method ID → Name Mapping ────────────────────────────────────────

const METHOD_NAMES: Record<string, string> = {
  '0x': 'Transfer',
  '0xa9059cbb': 'transfer()',
  '0x23b872dd': 'transferFrom()',
  '0x095ea7b3': 'approve()',
  // ShieldedPool
  '0xd95a7b99': 'shield()',
  '0xb2e1e5b7': 'shieldETH()',
  '0xf2b06419': 'claimAutoShield()',
  '0x7e800e28': 'transact()',
  // PrivacyRouter
  '0x89f286f5': 'setMode()',
  '0x1a1c4005': 'setRules()',
  // PrivacyBridge
  '0xa4c0ed36': 'bridgeToL1()',
  '0x3dbb202b': 'sendMessage()',
};

function getMethodName(input: string): string {
  if (!input || input === '0x') return 'Transfer';
  const sig = input.slice(0, 10).toLowerCase();
  return METHOD_NAMES[sig] || sig;
}

// ── Transaction Classification ──────────────────────────────────────

function classifyTx(to: string | null, input: string, value: bigint): { txType: TxType; isPrivacy: boolean } {
  if (!to) return { txType: 'contract', isPrivacy: false };

  const lower = to.toLowerCase();
  const pool = CONTRACTS.SHIELDED_POOL.toLowerCase();
  const router = CONTRACTS.PRIVACY_ROUTER.toLowerCase();
  const bridge = CONTRACTS.PRIVACY_BRIDGE.toLowerCase();
  const cdm = CONTRACTS.L2_CDM.toLowerCase();
  const sig = input?.slice(0, 10).toLowerCase() || '0x';

  if (lower === pool) {
    if (sig === '0x7e800e28') return { txType: 'transact', isPrivacy: true };
    if (sig === '0xd95a7b99') return { txType: 'shield', isPrivacy: true };
    if (sig === '0xb2e1e5b7') return { txType: 'shield', isPrivacy: true };
    if (sig === '0xf2b06419') return { txType: 'claim', isPrivacy: true };
    return { txType: 'shielded', isPrivacy: true };
  }

  if (lower === router) return { txType: 'shielded', isPrivacy: true };
  if (lower === bridge) return { txType: 'bridge', isPrivacy: true };
  if (lower === cdm) return { txType: 'system', isPrivacy: false };

  // If it's a plain ETH transfer to router → auto-shielded
  if (input === '0x' && value > 0n) return { txType: 'public', isPrivacy: false };

  return { txType: 'public', isPrivacy: false };
}

// ── Fetch Latest Blocks ─────────────────────────────────────────────

export async function fetchLatestBlocks(count = 20): Promise<ExplorerBlock[]> {
  try {
    const blockNumber = await publicClient.getBlockNumber();
    const from = blockNumber > BigInt(count) ? blockNumber - BigInt(count - 1) : 0n;

    const blocks: ExplorerBlock[] = [];
    const promises: Promise<Block>[] = [];

    for (let i = blockNumber; i >= from; i--) {
      promises.push(publicClient.getBlock({ blockNumber: i }));
    }

    const results = await Promise.allSettled(promises);
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const block = result.value;
        if (block.number == null || block.hash == null) continue; // skip pending
        blocks.push({
          number: block.number,
          hash: block.hash,
          timestamp: block.timestamp,
          txCount: block.transactions.length,
          gasUsed: block.gasUsed,
          gasLimit: block.gasLimit,
          miner: block.miner,
        });
      }
    }

    return blocks.sort((a, b) => Number(b.number - a.number));
  } catch {
    return [];
  }
}

// ── Fetch Transactions from Recent Blocks ───────────────────────────

export async function fetchRecentTransactions(blockCount = 30): Promise<ExplorerTx[]> {
  try {
    const blockNumber = await publicClient.getBlockNumber();
    const from = blockNumber > BigInt(blockCount) ? blockNumber - BigInt(blockCount - 1) : 0n;

    const txs: ExplorerTx[] = [];
    const blockPromises: Promise<Block<bigint, true>>[] = [];

    for (let i = blockNumber; i >= from; i--) {
      blockPromises.push(
        publicClient.getBlock({ blockNumber: i, includeTransactions: true }) as Promise<Block<bigint, true>>
      );
    }

    const blocks = await Promise.allSettled(blockPromises);
    for (const result of blocks) {
      if (result.status !== 'fulfilled') continue;
      const block = result.value;
      if (block.number == null) continue; // skip pending

      for (const tx of block.transactions) {
        const input = (tx as any).input || '0x';
        const { txType, isPrivacy } = classifyTx(tx.to ?? null, input, tx.value);

        // Determine displayed value
        let valueDisplay: string;
        if (isPrivacy && txType === 'transact') {
          valueDisplay = 'SHIELDED';
        } else if (tx.value === 0n && input !== '0x') {
          valueDisplay = '0 ETH (contract call)';
        } else {
          valueDisplay = `${formatEther(tx.value)} ETH`;
        }

        // Determine displayed recipient
        let toLabel: string | null = null;
        if (tx.to) {
          toLabel = labelAddress(tx.to);
          if (isPrivacy && toLabel) {
            toLabel = `${toLabel} [SHIELDED]`;
          }
        }

        txs.push({
          hash: tx.hash,
          blockNumber: block.number,
          from: tx.from,
          to: tx.to ?? null,
          toLabel,
          value: tx.value,
          valueDisplay,
          txType,
          gasUsed: tx.gas,
          gasPrice: tx.gasPrice ?? 0n,
          timestamp: block.timestamp,
          methodId: getMethodName(input),
          isPrivacy,
        });
      }
    }

    return txs.sort((a, b) => Number(b.blockNumber - a.blockNumber));
  } catch {
    return [];
  }
}

// ── Fetch Pool Stats ────────────────────────────────────────────────

export async function fetchPoolStats(): Promise<PoolStats | null> {
  try {
    const [merkleRoot, treeNumber, nextLeafIndex] = await Promise.all([
      publicClient.readContract({
        address: CONTRACTS.SHIELDED_POOL,
        abi: SHIELDED_POOL_ABI,
        functionName: 'merkleRoot',
      }),
      publicClient.readContract({
        address: CONTRACTS.SHIELDED_POOL,
        abi: SHIELDED_POOL_ABI,
        functionName: 'treeNumber',
      }),
      publicClient.readContract({
        address: CONTRACTS.SHIELDED_POOL,
        abi: SHIELDED_POOL_ABI,
        functionName: 'nextLeafIndex',
      }),
    ]);

    // Count shield events (total shielded value)
    let totalShieldedValue = 0n;
    let totalShieldEvents = 0;
    let totalTransactEvents = 0;
    let totalNullifiers = 0;

    try {
      const blockNumber = await publicClient.getBlockNumber();
      const fromBlock = blockNumber > 10000n ? blockNumber - 10000n : 0n;

      const shieldLogs = await publicClient.getLogs({
        address: CONTRACTS.SHIELDED_POOL,
        event: parseAbiItem('event Shield(uint256 treeNumber, uint256 startPosition, (bytes32 npk, (uint8 tokenType, address tokenAddress, uint256 tokenSubID) token, uint120 value)[] commitments)'),
        fromBlock,
        toBlock: 'latest',
      });

      for (const log of shieldLogs) {
        totalShieldEvents++;
        const commitments = (log as any).args?.commitments;
        if (commitments) {
          for (const c of commitments) {
            totalShieldedValue += BigInt(c.value || 0);
          }
        }
      }

      const nullifiedLogs = await publicClient.getLogs({
        address: CONTRACTS.SHIELDED_POOL,
        event: parseAbiItem('event Nullified(uint256 treeNumber, bytes32[] nullifiers)'),
        fromBlock,
        toBlock: 'latest',
      });

      for (const log of nullifiedLogs) {
        const nullifiers = (log as any).args?.nullifiers;
        if (nullifiers) totalNullifiers += nullifiers.length;
        totalTransactEvents++;
      }
    } catch {
      // Events may not be available if devnet just started
    }

    return {
      merkleRoot: merkleRoot as string,
      treeNumber: treeNumber as bigint,
      nextLeafIndex: nextLeafIndex as bigint,
      totalCommitments: nextLeafIndex as bigint,
      totalShieldEvents,
      totalTransactEvents,
      totalNullifiers,
      totalShieldedValue,
    };
  } catch {
    return null;
  }
}

// ── Fetch Single Block ──────────────────────────────────────────────

export async function fetchBlock(blockNumber: bigint): Promise<ExplorerBlock | null> {
  try {
    const block = await publicClient.getBlock({ blockNumber });
    return {
      number: block.number,
      hash: block.hash,
      timestamp: block.timestamp,
      txCount: block.transactions.length,
      gasUsed: block.gasUsed,
      gasLimit: block.gasLimit,
      miner: block.miner,
    };
  } catch {
    return null;
  }
}

// ── Search: Transaction by Hash ─────────────────────────────────────

export interface TxDetail {
  hash: string;
  blockNumber: bigint;
  from: string;
  to: string | null;
  toLabel: string | null;
  value: bigint;
  valueDisplay: string;
  txType: TxType;
  gasUsed: bigint;
  gasPrice: bigint;
  timestamp: bigint;
  methodId: string;
  isPrivacy: boolean;
  // receipt fields
  status: 'success' | 'reverted';
  cumulativeGasUsed: bigint;
  effectiveGasPrice: bigint;
  logsCount: number;
  contractAddress: string | null;
  nonce: number;
  input: string;
}

export async function fetchTransactionByHash(hash: string): Promise<TxDetail | null> {
  try {
    const [tx, receipt] = await Promise.all([
      publicClient.getTransaction({ hash: hash as `0x${string}` }),
      publicClient.getTransactionReceipt({ hash: hash as `0x${string}` }),
    ]);
    if (!tx) return null;

    const block = await publicClient.getBlock({ blockNumber: tx.blockNumber! });
    const input = (tx as any).input || '0x';
    const { txType, isPrivacy } = classifyTx(tx.to ?? null, input, tx.value);

    let valueDisplay: string;
    if (isPrivacy && txType === 'transact') {
      valueDisplay = 'SHIELDED';
    } else if (tx.value === 0n && input !== '0x') {
      valueDisplay = '0 ETH (contract call)';
    } else {
      valueDisplay = `${formatEther(tx.value)} ETH`;
    }

    let toLabel: string | null = null;
    if (tx.to) {
      toLabel = labelAddress(tx.to);
      if (isPrivacy && toLabel) toLabel = `${toLabel} [SHIELDED]`;
    }

    return {
      hash: tx.hash,
      blockNumber: tx.blockNumber!,
      from: tx.from,
      to: tx.to ?? null,
      toLabel,
      value: tx.value,
      valueDisplay,
      txType,
      gasUsed: receipt.gasUsed,
      gasPrice: tx.gasPrice ?? 0n,
      timestamp: block.timestamp,
      methodId: getMethodName(input),
      isPrivacy,
      status: receipt.status === 'success' ? 'success' : 'reverted',
      cumulativeGasUsed: receipt.cumulativeGasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      logsCount: receipt.logs.length,
      contractAddress: receipt.contractAddress ?? null,
      nonce: tx.nonce,
      input,
    };
  } catch {
    return null;
  }
}

// ── Search: Account by Address ──────────────────────────────────────

export interface AccountDetail {
  address: string;
  label: string | null;
  balance: bigint;
  balanceDisplay: string;
  transactionCount: number;
  privacyMode: number | null; // 0=off, 1=auto-shield, 2=full privacy
  recentTxs: ExplorerTx[];
}

export async function fetchAccountByAddress(address: string): Promise<AccountDetail | null> {
  try {
    const addr = address as `0x${string}`;
    const [balance, txCount] = await Promise.all([
      publicClient.getBalance({ address: addr }),
      publicClient.getTransactionCount({ address: addr }),
    ]);

    // Try to get privacy mode from the router
    let privacyMode: number | null = null;
    try {
      const mode = await publicClient.readContract({
        address: CONTRACTS.PRIVACY_ROUTER,
        abi: [{ type: 'function', name: 'getMode', stateMutability: 'view', inputs: [{ name: '_account', type: 'address' }], outputs: [{ name: '', type: 'uint8' }] }] as const,
        functionName: 'getMode',
        args: [addr],
      });
      privacyMode = Number(mode);
    } catch {
      // Router may not be available
    }

    // Fetch recent transactions involving this address
    const allTxs = await fetchRecentTransactions(100);
    const lower = address.toLowerCase();
    const recentTxs = allTxs.filter(
      (tx) => tx.from.toLowerCase() === lower || tx.to?.toLowerCase() === lower,
    );

    return {
      address,
      label: labelAddress(address),
      balance,
      balanceDisplay: `${formatEther(balance)} ETH`,
      transactionCount: txCount,
      privacyMode,
      recentTxs,
    };
  } catch {
    return null;
  }
}

// ── Chain Info ───────────────────────────────────────────────────────

export async function fetchChainInfo() {
  try {
    const [blockNumber, chainId] = await Promise.all([
      publicClient.getBlockNumber(),
      publicClient.getChainId(),
    ]);
    return { blockNumber, chainId, connected: true };
  } catch {
    return { blockNumber: 0n, chainId: 0, connected: false };
  }
}
