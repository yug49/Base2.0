// ============================================================================
// ShadowBase — Client-Side Merkle Tree
// RAILGUN-compatible incremental Merkle tree for proof generation
// Adapted from railgun-contract/helpers/logic/merkletree.ts
// ============================================================================

import { TREE_DEPTH, SNARK_SCALAR_FIELD } from './constants';
import {
  poseidonT3,
  keccak256,
  bigIntToBytes,
  bytesToBigInt,
  padToLength,
  bytesToHex,
  hexToBytes,
} from './crypto';

export interface MerkleProof {
  /** The leaf element being proved */
  element: Uint8Array;
  /** Sibling elements along the path (depth elements) */
  elements: Uint8Array[];
  /** Leaf index (encodes left/right path as bits) */
  indices: number;
  /** Current root */
  root: Uint8Array;
}

/**
 * Client-side Merkle tree that mirrors the on-chain Commitments.sol tree.
 * Used to generate inclusion proofs for transact/unshield operations.
 */
export class MerkleTree {
  readonly treeNumber: number;
  readonly depth: number;
  readonly zeros: Uint8Array[];
  tree: Uint8Array[][];
  nullifiers: Set<string> = new Set();

  private constructor(
    treeNumber: number,
    depth: number,
    zeros: Uint8Array[],
    tree: Uint8Array[][],
  ) {
    this.treeNumber = treeNumber;
    this.depth = depth;
    this.zeros = zeros;
    this.tree = tree;
  }

  // ── Factory ─────────────────────────────────────────────────

  /**
   * Create a new empty Merkle tree.
   * Zero values are computed the same way as Commitments.sol:
   *   zeros[0] = keccak256("Railgun") % SNARK_SCALAR_FIELD
   *   zeros[i] = PoseidonT3(zeros[i-1], zeros[i-1])
   */
  static async create(treeNumber = 0, depth = TREE_DEPTH): Promise<MerkleTree> {
    // Compute zero values
    const zeros: Uint8Array[] = [];
    const kHash = await keccak256(new TextEncoder().encode('Railgun'));
    zeros[0] = bigIntToBytes(bytesToBigInt(kHash) % SNARK_SCALAR_FIELD, 32);

    for (let i = 1; i < depth; i++) {
      zeros[i] = await poseidonT3(zeros[i - 1], zeros[i - 1]);
    }

    // Initialize tree with empty levels
    const tree: Uint8Array[][] = Array(depth + 1)
      .fill(null)
      .map(() => []);

    // Root = hash(zeros[depth-1], zeros[depth-1])
    tree[depth] = [await poseidonT3(zeros[depth - 1], zeros[depth - 1])];

    return new MerkleTree(treeNumber, depth, zeros, tree);
  }

  // ── Properties ──────────────────────────────────────────────

  /** Get current root */
  get root(): Uint8Array {
    return this.tree[this.depth][0];
  }

  /** Get number of leaves inserted */
  get length(): number {
    return this.tree[0].length;
  }

  // ── Insert ──────────────────────────────────────────────────

  /**
   * Insert leaves into the tree at the next available positions.
   * Mirrors Commitments.insertLeaves().
   */
  async insertLeaves(leaves: Uint8Array[]): Promise<void> {
    const startPos = this.tree[0].length;

    // Add leaves at level 0
    for (const leaf of leaves) {
      this.tree[0].push(leaf);
    }

    // Rebuild affected subtrees
    await this.rebuildFromPosition(startPos);
  }

  /**
   * Rebuild the tree from a given starting position upward.
   */
  private async rebuildFromPosition(startPos: number): Promise<void> {
    // Full rebuild for simplicity (fine for demo trees)
    for (let level = 0; level < this.depth; level++) {
      this.tree[level + 1] = [];
      for (let pos = 0; pos < this.tree[level].length; pos += 2) {
        const left = this.tree[level][pos];
        const right = this.tree[level][pos + 1] ?? this.zeros[level];
        this.tree[level + 1].push(await poseidonT3(left, right));
      }
    }

    // If tree is empty, use the zero root
    if (this.tree[0].length === 0) {
      this.tree[this.depth] = [
        await poseidonT3(this.zeros[this.depth - 1], this.zeros[this.depth - 1]),
      ];
    }
  }

  // ── Merkle Proof ────────────────────────────────────────────

  /**
   * Generate a Merkle inclusion proof for a leaf.
   * @param leafHash - the commitment hash to prove inclusion for
   * @returns MerkleProof with sibling elements and index
   */
  generateProof(leafHash: Uint8Array): MerkleProof {
    const leafHex = bytesToHex(leafHash);

    // Find leaf index
    const leafIndex = this.tree[0].findIndex(
      (leaf) => bytesToHex(leaf) === leafHex,
    );

    if (leafIndex === -1) {
      throw new Error(`Leaf not found in tree: ${leafHex}`);
    }

    return this.generateProofByIndex(leafIndex);
  }

  /**
   * Generate proof by leaf index
   */
  generateProofByIndex(leafIndex: number): MerkleProof {
    if (leafIndex < 0 || leafIndex >= this.tree[0].length) {
      throw new Error(`Leaf index ${leafIndex} out of bounds (tree has ${this.tree[0].length} leaves)`);
    }

    const elements: Uint8Array[] = [];
    let currentIndex = leafIndex;

    for (let level = 0; level < this.depth; level++) {
      // Determine sibling
      const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

      // Get sibling value (or zero if beyond tree)
      const sibling =
        siblingIndex < this.tree[level].length
          ? this.tree[level][siblingIndex]
          : this.zeros[level];

      elements.push(sibling);
      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      element: this.tree[0][leafIndex],
      elements,
      indices: leafIndex,
      root: this.root,
    };
  }

  // ── Sync from Chain ─────────────────────────────────────────

  /**
   * Populate the tree from on-chain Shield events.
   * Call this to sync the client tree with the on-chain state.
   * @param commitmentHashes - ordered list of all commitment hashes from events
   */
  async syncFromCommitments(commitmentHashes: Uint8Array[]): Promise<void> {
    this.tree = Array(this.depth + 1)
      .fill(null)
      .map(() => []);

    if (commitmentHashes.length > 0) {
      this.tree[0] = commitmentHashes;
      await this.rebuildFromPosition(0);
    } else {
      this.tree[this.depth] = [
        await poseidonT3(this.zeros[this.depth - 1], this.zeros[this.depth - 1]),
      ];
    }
  }

  /**
   * Add a nullifier to the local set (from Nullified events)
   */
  addNullifier(nullifier: Uint8Array): void {
    this.nullifiers.add(bytesToHex(nullifier));
  }

  /**
   * Check if a nullifier has been seen
   */
  isNullified(nullifier: Uint8Array): boolean {
    return this.nullifiers.has(bytesToHex(nullifier));
  }
}
