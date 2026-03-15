// ============================================================================
// ShadowBase — ZK Note Types & Logic (Browser-Compatible)
// RAILGUN-compatible note construction, hashing, encryption
// Adapted from railgun-contract/helpers/logic/note.ts
// ============================================================================

import {
  SNARK_SCALAR_FIELD,
  TokenType,
  NATIVE_ETH_ADDRESS,
} from './constants';

import {
  bigIntToBytes,
  bytesToBigInt,
  bytesToHex,
  hexToBytes,
  padToLength,
  randomBytes,
  poseidonT4,
  poseidonHash,
  eddsaPrivateToPublic,
  eddsaSignPoseidon,
  ed25519PublicKey,
  ed25519SharedKey,
  aesGcmEncrypt,
  aesCtrEncrypt,
  deriveNullifyingKey,
  deriveMasterPublicKey,
  deriveNotePublicKey,
  calculateNullifier,
  keccak256,
} from './crypto';

// ── Types ───────────────────────────────────────────────────────────

export interface TokenData {
  tokenType: TokenType;
  tokenAddress: string; // 0x-prefixed, 20 bytes
  tokenSubID: bigint;
}

export interface CommitmentPreimage {
  npk: Uint8Array;    // 32 bytes — note public key
  token: TokenData;
  value: bigint;       // uint120
}

export interface ShieldCiphertext {
  encryptedBundle: [Uint8Array, Uint8Array, Uint8Array]; // bytes32[3]
  shieldKey: Uint8Array; // bytes32
}

export interface CommitmentCiphertext {
  ciphertext: [Uint8Array, Uint8Array, Uint8Array, Uint8Array]; // bytes32[4]
  blindedSenderViewingKey: Uint8Array;   // bytes32
  blindedReceiverViewingKey: Uint8Array;  // bytes32
  annotationData: Uint8Array;
  memo: Uint8Array;
}

export interface ShieldRequest {
  preimage: CommitmentPreimage;
  ciphertext: ShieldCiphertext;
}

// ── Token ID ────────────────────────────────────────────────────────

/**
 * Get token ID from token data (matching RAILGUN/ShieldedPool.getTokenID)
 * ERC20: bytes32(uint256(uint160(tokenAddress)))
 * Others: keccak256(abi.encode(tokenData)) % SNARK_SCALAR_FIELD
 */
export async function getTokenID(tokenData: TokenData): Promise<Uint8Array> {
  if (tokenData.tokenType === TokenType.ERC20) {
    // For ERC20, tokenID = address padded to 32 bytes (left-padded with zeros)
    const addrBytes = hexToBytes(tokenData.tokenAddress);
    return padToLength(addrBytes, 32);
  }

  // For ERC721/ERC1155: keccak256(abi.encode(type, address, subID)) % SNARK_SCALAR_FIELD
  const encoded = new Uint8Array(96);
  encoded.set(bigIntToBytes(BigInt(tokenData.tokenType), 32), 0);
  encoded.set(padToLength(hexToBytes(tokenData.tokenAddress), 32), 32);
  encoded.set(bigIntToBytes(tokenData.tokenSubID, 32), 64);

  const hash = await keccak256(encoded);
  const value = bytesToBigInt(hash) % SNARK_SCALAR_FIELD;
  return bigIntToBytes(value, 32);
}

// ── Note Class ──────────────────────────────────────────────────────

/**
 * Represents a RAILGUN-compatible private note.
 * A note is a UTXO in the shielded pool's Merkle tree.
 */
export class Note {
  /** BabyJubJub spending private key (32 bytes) */
  readonly spendingKey: Uint8Array;
  /** Ed25519 viewing private key (32 bytes) */
  readonly viewingKey: Uint8Array;
  /** Note value (uint120) */
  readonly value: bigint;
  /** Random field (16 bytes) — provides commitment uniqueness */
  readonly random: Uint8Array;
  /** Token data */
  readonly tokenData: TokenData;
  /** Optional memo text */
  readonly memo: string;

  constructor(
    spendingKey: Uint8Array,
    viewingKey: Uint8Array,
    value: bigint,
    random: Uint8Array,
    tokenData: TokenData,
    memo: string = '',
  ) {
    if (spendingKey.length !== 32) throw new Error('Invalid spending key length');
    if (viewingKey.length !== 32) throw new Error('Invalid viewing key length');
    if (value > 2n ** 128n - 1n) throw new Error('Value too high');
    if (random.length !== 16) throw new Error('Invalid random length');

    this.spendingKey = spendingKey;
    this.viewingKey = viewingKey;
    this.value = value;
    this.random = random;
    this.tokenData = tokenData;
    this.memo = memo;
  }

  /** Create a note for native ETH with random keys (for testing/demo) */
  static createEthNote(value: bigint, spendingKey?: Uint8Array, viewingKey?: Uint8Array): Note {
    return new Note(
      spendingKey ?? randomBytes(32),
      viewingKey ?? randomBytes(32),
      value,
      randomBytes(16),
      { tokenType: TokenType.ERC20, tokenAddress: NATIVE_ETH_ADDRESS, tokenSubID: 0n },
    );
  }

  /** Create a note for an ERC20 token */
  static createERC20Note(
    tokenAddress: string,
    value: bigint,
    spendingKey?: Uint8Array,
    viewingKey?: Uint8Array,
  ): Note {
    return new Note(
      spendingKey ?? randomBytes(32),
      viewingKey ?? randomBytes(32),
      value,
      randomBytes(16),
      { tokenType: TokenType.ERC20, tokenAddress, tokenSubID: 0n },
    );
  }

  // ── Derived Keys ────────────────────────────────────────────

  /** Nullifying key: poseidon(viewingKey) */
  async getNullifyingKey(): Promise<Uint8Array> {
    return deriveNullifyingKey(this.viewingKey);
  }

  /** Spending public key: edBabyJubJub(spendingKey) → [Ax, Ay] */
  async getSpendingPublicKey(): Promise<[Uint8Array, Uint8Array]> {
    return eddsaPrivateToPublic(this.spendingKey);
  }

  /** Viewing public key: ed25519(viewingKey) */
  async getViewingPublicKey(): Promise<Uint8Array> {
    return ed25519PublicKey(this.viewingKey);
  }

  /** Master public key: poseidon(spendingPubX, spendingPubY, nullifyingKey) */
  async getMasterPublicKey(): Promise<Uint8Array> {
    const spendingPub = await this.getSpendingPublicKey();
    const nullifyingKey = await this.getNullifyingKey();
    return deriveMasterPublicKey(spendingPub, nullifyingKey);
  }

  /** Note public key (NPK): poseidon(masterPublicKey, random) */
  async getNotePublicKey(): Promise<Uint8Array> {
    const mpk = await this.getMasterPublicKey();
    return deriveNotePublicKey(mpk, this.random);
  }

  /** Token ID */
  async getTokenID(): Promise<Uint8Array> {
    return getTokenID(this.tokenData);
  }

  /** Note hash (commitment): PoseidonT4(npk, tokenID, value) */
  async getHash(): Promise<Uint8Array> {
    const npk = await this.getNotePublicKey();
    const tokenID = await this.getTokenID();
    const valueBytes = bigIntToBytes(this.value, 32);
    return poseidonT4(npk, tokenID, valueBytes);
  }

  /** Calculate nullifier: poseidon(nullifyingKey, leafIndex) */
  async getNullifier(leafIndex: number): Promise<Uint8Array> {
    const nullifyingKey = await this.getNullifyingKey();
    return calculateNullifier(nullifyingKey, leafIndex);
  }

  /** Sign a transaction (EdDSA-Poseidon) */
  async sign(
    merkleRoot: Uint8Array,
    boundParamsHash: Uint8Array,
    nullifiers: Uint8Array[],
    commitmentsOut: Uint8Array[],
  ): Promise<[Uint8Array, Uint8Array, Uint8Array]> {
    const sighash = await poseidonHash([
      merkleRoot,
      boundParamsHash,
      ...nullifiers,
      ...commitmentsOut,
    ]);
    return eddsaSignPoseidon(this.spendingKey, sighash);
  }

  // ── Commitment Preimage ─────────────────────────────────────

  /** Get commitment preimage for on-chain submission */
  async getCommitmentPreimage(): Promise<CommitmentPreimage> {
    return {
      npk: await this.getNotePublicKey(),
      token: this.tokenData,
      value: this.value,
    };
  }

  // ── Shield Encryption ───────────────────────────────────────

  /**
   * Encrypt note data for shielding (deposit).
   * Creates a ShieldRequest with encrypted ciphertext that only
   * the recipient (viewing key holder) can decrypt.
   */
  async encryptForShield(): Promise<ShieldRequest> {
    const shieldPrivateKey = randomBytes(32);
    const viewingPub = await this.getViewingPublicKey();

    // Shared key via ECDH
    const sharedKey = await ed25519SharedKey(shieldPrivateKey, viewingPub);

    // Encrypt random value with AES-GCM
    const encryptedRandom = await aesGcmEncrypt([this.random], sharedKey);

    // Encrypt receiver viewing key with AES-CTR
    const encryptedReceiver = await aesCtrEncrypt([viewingPub], shieldPrivateKey);

    // Build ShieldCiphertext
    const ciphertext: ShieldCiphertext = {
      encryptedBundle: [
        padToLength(encryptedRandom[0], 32),   // IV(16) + tag(16)
        padToLength(
          new Uint8Array([...encryptedRandom[1], ...encryptedReceiver[0]]),
          32,
        ),
        padToLength(encryptedReceiver[1], 32),
      ],
      shieldKey: padToLength(await ed25519PublicKey(shieldPrivateKey), 32),
    };

    return {
      ciphertext,
      preimage: await this.getCommitmentPreimage(),
    };
  }

  // ── Transact Encryption ─────────────────────────────────────

  /**
   * Encrypt note data for a private transaction.
   * Creates CommitmentCiphertext for inclusion in transact() boundParams.
   */
  async encryptForTransact(
    senderViewingPrivateKey: Uint8Array,
  ): Promise<CommitmentCiphertext> {
    const senderViewingPub = await ed25519PublicKey(senderViewingPrivateKey);
    const receiverViewingPub = await this.getViewingPublicKey();
    const senderRandom = randomBytes(15);

    // Blind keys (RAILGUN key exchange)
    const { sha512 } = await import('@noble/hashes/sha512');
    const noble = await import('@noble/ed25519');

    // Compute blinding scalar
    const sharedRandom = this.random;
    const xorLen = Math.max(sharedRandom.length, senderRandom.length);
    const finalRandom = new Uint8Array(32);
    for (let i = 0; i < xorLen; i++) {
      finalRandom[32 - xorLen + i] =
        (sharedRandom[sharedRandom.length - xorLen + i] || 0) ^
        (senderRandom[senderRandom.length - xorLen + i] || 0);
    }

    // Seed to scalar
    const seedHash = sha512(finalRandom);
    const seedScalar = (bytesToBigInt(new Uint8Array(seedHash)) % noble.CURVE.n - 1n) + 1n;

    // Blind both keys
    const senderPoint = noble.Point.fromHex(senderViewingPub);
    const receiverPoint = noble.Point.fromHex(receiverViewingPub);
    const blindedSender = senderPoint.multiply(seedScalar).toRawBytes();
    const blindedReceiver = receiverPoint.multiply(seedScalar).toRawBytes();

    // Shared key
    const sharedKey = await ed25519SharedKey(senderViewingPrivateKey, blindedReceiver);

    // Encrypt: [mpk, random||value, tokenID, memo]
    const mpk = await this.getMasterPublicKey();
    const randomValue = new Uint8Array([
      ...this.random,
      ...bigIntToBytes(this.value, 16),
    ]);
    const tokenID = await this.getTokenID();
    const memoBytes = new TextEncoder().encode(this.memo);

    const encryptedShared = await aesGcmEncrypt(
      [mpk, randomValue, tokenID, memoBytes],
      sharedKey,
    );

    // Encrypt sender annotation with CTR
    const outputType = bigIntToBytes(0n, 1);
    const appId = new TextEncoder().encode('shadowbase');
    const senderData = new Uint8Array([...outputType, ...senderRandom, ...appId]);
    const encryptedSender = await aesCtrEncrypt([senderData], senderViewingPrivateKey);

    return {
      ciphertext: [
        padToLength(encryptedShared[0], 32),
        padToLength(encryptedShared[1], 32),
        padToLength(encryptedShared[2], 32),
        padToLength(encryptedSender[1], 32),
      ],
      blindedSenderViewingKey: padToLength(blindedSender, 32),
      blindedReceiverViewingKey: padToLength(blindedReceiver, 32),
      annotationData: encryptedSender[0], // IV
      memo: memoBytes.length > 0 ? encryptedShared[4] : new Uint8Array(0),
    };
  }
}

/**
 * Unshield note — represents a withdrawal destination.
 * NPK is set to address(recipient) for unshield preimage matching.
 */
export class UnshieldNote {
  readonly value: bigint;
  readonly tokenData: TokenData;
  readonly recipientAddress: string; // 0x-prefixed ETH address

  constructor(recipientAddress: string, value: bigint, tokenData: TokenData) {
    this.recipientAddress = recipientAddress;
    this.value = value;
    this.tokenData = tokenData;
  }

  /** NPK for unshield = bytes32(uint256(uint160(recipientAddress))) */
  async getNotePublicKey(): Promise<Uint8Array> {
    const addr = hexToBytes(this.recipientAddress);
    return padToLength(addr, 32);
  }

  async getTokenID(): Promise<Uint8Array> {
    return getTokenID(this.tokenData);
  }

  /** Hash for unshield commitment */
  async getHash(): Promise<Uint8Array> {
    const npk = await this.getNotePublicKey();
    const tokenID = await this.getTokenID();
    return poseidonT4(npk, tokenID, bigIntToBytes(this.value, 32));
  }

  /** Unshield notes don't have viewing keys — no-op encrypt */
  async encryptForTransact(
    _senderViewingPrivateKey: Uint8Array,
  ): Promise<CommitmentCiphertext> {
    // Unshield commitment doesn't need ciphertext (it's the last commitment)
    return {
      ciphertext: [new Uint8Array(32), new Uint8Array(32), new Uint8Array(32), new Uint8Array(32)],
      blindedSenderViewingKey: new Uint8Array(32),
      blindedReceiverViewingKey: new Uint8Array(32),
      annotationData: new Uint8Array(0),
      memo: new Uint8Array(0),
    };
  }
}

// ── Formatting Helpers ──────────────────────────────────────────────

/** Convert CommitmentPreimage to Solidity-compatible format */
export function preimageToSolidity(preimage: CommitmentPreimage) {
  return {
    npk: bytesToHex(preimage.npk),
    token: {
      tokenType: preimage.token.tokenType,
      tokenAddress: preimage.token.tokenAddress as `0x${string}`,
      tokenSubID: preimage.token.tokenSubID,
    },
    value: preimage.value,
  };
}

/** Convert ShieldCiphertext to Solidity-compatible format */
export function shieldCiphertextToSolidity(ct: ShieldCiphertext) {
  return {
    encryptedBundle: ct.encryptedBundle.map(b => bytesToHex(padToLength(b, 32))) as [
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
    ],
    shieldKey: bytesToHex(padToLength(ct.shieldKey, 32)),
  };
}

/** Convert CommitmentCiphertext to Solidity-compatible format */
export function commitmentCiphertextToSolidity(ct: CommitmentCiphertext) {
  return {
    ciphertext: ct.ciphertext.map(b => bytesToHex(padToLength(b, 32))) as [
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
    ],
    blindedSenderViewingKey: bytesToHex(padToLength(ct.blindedSenderViewingKey, 32)),
    blindedReceiverViewingKey: bytesToHex(padToLength(ct.blindedReceiverViewingKey, 32)),
    annotationData: bytesToHex(ct.annotationData),
    memo: bytesToHex(ct.memo),
  };
}
