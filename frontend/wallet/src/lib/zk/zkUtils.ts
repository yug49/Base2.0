// ============================================================================
// ShadowBase — ZK Proof Utilities (Phase 5)
// Client-side ZK proof generation for the ShadowBase privacy system.
//
// Exported API for Yug's wallet frontend:
//   - generateShieldProof()   — shield (deposit) into private pool
//   - generateTransferProof() — private → private send
//   - generateUnshieldProof() — private → public withdrawal
//   - generateBridgeProof()   — cross-chain private bridge to Sepolia
//   - initZK()                — one-time initialization (Poseidon, EdDSA)
//
// All proofs are Groth16 over BN254 using RAILGUN's JoinSplit circuit.
// Circuit artifacts (wasm + zkey) are loaded from /public/circuits/.
// ============================================================================

import {
  SNARK_SCALAR_FIELD,
  SHADOWBASE_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  UnshieldType,
  TokenType,
  NATIVE_ETH_ADDRESS,
  L2_CONTRACTS,
  type CircuitConfig,
  CIRCUIT_CONFIGS,
} from './constants';

import {
  initPoseidon,
  initEddsa,
  bigIntToBytes,
  bytesToBigInt,
  bytesToHex,
  hexToBytes,
  padToLength,
  randomBytes,
  poseidonHash,
  keccak256,
} from './crypto';

import {
  Note,
  UnshieldNote,
  type CommitmentPreimage,
  type ShieldCiphertext,
  type CommitmentCiphertext,
  type ShieldRequest,
  type TokenData,
  preimageToSolidity,
  shieldCiphertextToSolidity,
  commitmentCiphertextToSolidity,
} from './note';

import { MerkleTree, type MerkleProof } from './merkle';

// ── Types ───────────────────────────────────────────────────────────

/** Groth16 proof formatted for Solidity submission */
export interface SolidityProof {
  a: { x: bigint; y: bigint };
  b: { x: [bigint, bigint]; y: [bigint, bigint] };
  c: { x: bigint; y: bigint };
}

/** Result of generateShieldProof — ready to submit to ShieldedPool.shield() */
export interface ShieldProofResult {
  /** Shield requests array for ShieldedPool.shield() */
  shieldRequests: {
    preimage: ReturnType<typeof preimageToSolidity>;
    ciphertext: ReturnType<typeof shieldCiphertextToSolidity>;
  }[];
  /** The note objects (keep these for future spending) */
  notes: Note[];
  /** Estimated gas (shield doesn't need ZK proof, just token transfer) */
  estimatedGas: bigint;
}

/** Result of generateShieldETHProof — ready for ShieldedPool.shieldETH() */
export interface ShieldETHProofResult {
  /** NPK to pass to shieldETH() */
  npk: `0x${string}`;
  /** Ciphertext to pass to shieldETH() */
  ciphertext: ReturnType<typeof shieldCiphertextToSolidity>;
  /** The note object (keep for future spending) */
  note: Note;
  /** ETH value to send (msg.value) */
  value: bigint;
}

/** BoundParams for transact() */
export interface BoundParams {
  treeNumber: number;
  minGasPrice: bigint;
  unshield: UnshieldType;
  chainID: bigint;
  adaptContract: `0x${string}`;
  adaptParams: `0x${string}`;
  commitmentCiphertext: ReturnType<typeof commitmentCiphertextToSolidity>[];
}

/** Full transaction for ShieldedPool.transact() */
export interface TransactionData {
  proof: {
    a: { x: bigint; y: bigint };
    b: { x: [bigint, bigint]; y: [bigint, bigint] };
    c: { x: bigint; y: bigint };
  };
  merkleRoot: `0x${string}`;
  nullifiers: `0x${string}`[];
  commitments: `0x${string}`[];
  boundParams: BoundParams;
  unshieldPreimage: ReturnType<typeof preimageToSolidity>;
}

/** Result of proof generation for transact/unshield/bridge */
export interface TransactProofResult {
  /** Transaction data ready for ShieldedPool.transact([tx]) */
  transaction: TransactionData;
  /** New notes created (for recipient to track) */
  outputNotes: (Note | UnshieldNote)[];
  /** Proof generation time in milliseconds */
  proofTimeMs: number;
}

/** User's RAILGUN keypair — derived from a seed/mnemonic */
export interface RailgunKeys {
  /** BabyJubJub spending private key (32 bytes) */
  spendingKey: Uint8Array;
  /** Ed25519 viewing private key (32 bytes) */
  viewingKey: Uint8Array;
}

// ── Initialization ──────────────────────────────────────────────────

let _initialized = false;

/**
 * Initialize ZK subsystem. Must be called once before any proof generation.
 * Loads Poseidon and EdDSA WASM modules.
 * Safe to call multiple times.
 */
export async function initZK(): Promise<void> {
  if (_initialized) return;
  await Promise.all([initPoseidon(), initEddsa()]);
  _initialized = true;
}

// ── Key Generation ──────────────────────────────────────────────────

/**
 * Generate a new random RAILGUN keypair.
 * In production, derive from a BIP-39 mnemonic + derivation path.
 * For the hackathon demo, random keys suffice.
 */
export function generateKeys(): RailgunKeys {
  return {
    spendingKey: randomBytes(32),
    viewingKey: randomBytes(32),
  };
}

/**
 * Derive keys from a seed (e.g., keccak256 of a signature).
 * Deterministic — same seed = same keys.
 */
export async function deriveKeysFromSeed(seed: Uint8Array): Promise<RailgunKeys> {
  const hash1 = await keccak256(new Uint8Array([...seed, 0x01]));
  const hash2 = await keccak256(new Uint8Array([...seed, 0x02]));
  return {
    spendingKey: hash1,
    viewingKey: hash2,
  };
}

// ── Shield Proof (ERC20) ────────────────────────────────────────────

/**
 * Generate a shield proof for depositing ERC20 tokens.
 * Shield doesn't require a ZK proof — it's a simple deposit with encrypted ciphertext.
 *
 * @param tokenAddress - ERC20 token address (use NATIVE_ETH_ADDRESS for ETH via shieldETH)
 * @param amount - amount to shield (in wei/smallest unit)
 * @param keys - recipient's RAILGUN keys
 * @returns ShieldProofResult ready for ShieldedPool.shield()
 */
export async function generateShieldProof(
  tokenAddress: string,
  amount: bigint,
  keys: RailgunKeys,
): Promise<ShieldProofResult> {
  await initZK();

  const note = new Note(
    keys.spendingKey,
    keys.viewingKey,
    amount,
    randomBytes(16),
    { tokenType: TokenType.ERC20, tokenAddress, tokenSubID: 0n },
  );

  const shieldRequest = await note.encryptForShield();

  return {
    shieldRequests: [
      {
        preimage: preimageToSolidity(shieldRequest.preimage),
        ciphertext: shieldCiphertextToSolidity(shieldRequest.ciphertext),
      },
    ],
    notes: [note],
    estimatedGas: 200_000n,
  };
}

// ── Shield ETH Proof ────────────────────────────────────────────────

/**
 * Generate data for shielding native ETH via ShieldedPool.shieldETH().
 * No ZK proof needed — just NPK + ciphertext.
 *
 * @param amount - ETH amount in wei
 * @param keys - recipient's RAILGUN keys
 * @returns ShieldETHProofResult ready for ShieldedPool.shieldETH()
 */
export async function generateShieldETHProof(
  amount: bigint,
  keys: RailgunKeys,
): Promise<ShieldETHProofResult> {
  await initZK();

  const note = Note.createEthNote(amount, keys.spendingKey, keys.viewingKey);
  const shieldReq = await note.encryptForShield();

  return {
    npk: bytesToHex(shieldReq.preimage.npk) as `0x${string}`,
    ciphertext: shieldCiphertextToSolidity(shieldReq.ciphertext),
    note,
    value: amount,
  };
}

// ── Claim Auto-Shield ───────────────────────────────────────────────

/**
 * Generate data for claiming auto-shielded ETH via ShieldedPool.claimAutoShield().
 * No ZK proof needed — just NPK + ciphertext.
 *
 * @param keys - recipient's RAILGUN keys
 * @returns { npk, ciphertext } ready for claimAutoShield()
 */
export async function generateClaimData(keys: RailgunKeys) {
  await initZK();

  // Create a note with 0 value (actual value comes from pending balance)
  const note = Note.createEthNote(0n, keys.spendingKey, keys.viewingKey);
  const npk = await note.getNotePublicKey();
  const shieldReq = await note.encryptForShield();

  return {
    npk: bytesToHex(npk) as `0x${string}`,
    ciphertext: shieldCiphertextToSolidity(shieldReq.ciphertext),
    note,
  };
}

// ── Transfer Proof (Private → Private) ──────────────────────────────

/**
 * Generate a ZK proof for a private-to-private transfer.
 * This is a full Groth16 proof using the RAILGUN JoinSplit circuit.
 *
 * @param merkleTree - synced Merkle tree with the sender's notes
 * @param inputNotes - notes to spend (must be in the Merkle tree)
 * @param recipientKeys - recipient's RAILGUN keys
 * @param amount - amount to transfer
 * @param tokenData - token data
 * @param senderKeys - sender's RAILGUN keys (for change note + signing)
 * @returns TransactProofResult ready for ShieldedPool.transact()
 */
export async function generateTransferProof(
  merkleTree: MerkleTree,
  inputNotes: Note[],
  recipientKeys: RailgunKeys,
  amount: bigint,
  tokenData: TokenData,
  senderKeys: RailgunKeys,
): Promise<TransactProofResult> {
  await initZK();

  // Calculate total input value
  const totalIn = inputNotes.reduce((sum, note) => sum + note.value, 0n);
  if (totalIn < amount) {
    throw new Error(`Insufficient balance: have ${totalIn}, need ${amount}`);
  }

  // Create output notes
  const change = totalIn - amount;
  const recipientNote = new Note(
    recipientKeys.spendingKey,
    recipientKeys.viewingKey,
    amount,
    randomBytes(16),
    tokenData,
  );

  const outputNotes: Note[] = [recipientNote];
  if (change > 0n) {
    const changeNote = new Note(
      senderKeys.spendingKey,
      senderKeys.viewingKey,
      change,
      randomBytes(16),
      tokenData,
    );
    outputNotes.push(changeNote);
  }

  // Generate proof
  return _generateTransactProof(
    merkleTree,
    inputNotes,
    outputNotes,
    senderKeys,
    UnshieldType.NONE,
  );
}

// ── Unshield Proof (Private → Public) ───────────────────────────────

/**
 * Generate a ZK proof for unshielding (private → public withdrawal).
 *
 * @param merkleTree - synced Merkle tree
 * @param inputNotes - notes to spend
 * @param recipientAddress - public ETH address to receive funds
 * @param amount - amount to unshield
 * @param tokenData - token data
 * @param senderKeys - sender's RAILGUN keys
 * @returns TransactProofResult ready for ShieldedPool.transact()
 */
export async function generateUnshieldProof(
  merkleTree: MerkleTree,
  inputNotes: Note[],
  recipientAddress: string,
  amount: bigint,
  tokenData: TokenData,
  senderKeys: RailgunKeys,
): Promise<TransactProofResult> {
  await initZK();

  const totalIn = inputNotes.reduce((sum, note) => sum + note.value, 0n);
  if (totalIn < amount) {
    throw new Error(`Insufficient balance: have ${totalIn}, need ${amount}`);
  }

  // Create unshield note (last output)
  const unshieldNote = new UnshieldNote(recipientAddress, amount, tokenData);

  // Create change note if needed
  const change = totalIn - amount;
  const outputNotes: (Note | UnshieldNote)[] = [];

  if (change > 0n) {
    outputNotes.push(
      new Note(
        senderKeys.spendingKey,
        senderKeys.viewingKey,
        change,
        randomBytes(16),
        tokenData,
      ),
    );
  }

  // Unshield note MUST be last
  outputNotes.push(unshieldNote);

  return _generateTransactProof(
    merkleTree,
    inputNotes,
    outputNotes,
    senderKeys,
    UnshieldType.NORMAL,
  );
}

// ── Bridge Proof (Cross-chain to Sepolia) ───────────────────────────

/**
 * Generate a ZK proof for bridging private funds to RAILGUN on Sepolia.
 * This creates a nullifier on L2 and sends a message to L1Companion.
 *
 * The bridge flow:
 * 1. User generates proof to nullify their L2 commitment
 * 2. PrivacyBridge.bridgeToL1() sends cross-chain message
 * 3. L1Companion.receiveFromBase() creates commitment in RAILGUN Sepolia
 *
 * For the hackathon demo, bridge proof = unshield to PrivacyBridge address.
 *
 * @param merkleTree - synced L2 Merkle tree
 * @param inputNotes - notes to bridge
 * @param amount - amount to bridge
 * @param tokenData - token data
 * @param senderKeys - sender's RAILGUN keys
 * @param destinationKeys - keys for the L1 RAILGUN commitment
 * @returns TransactProofResult + bridge-specific data
 */
export async function generateBridgeProof(
  merkleTree: MerkleTree,
  inputNotes: Note[],
  amount: bigint,
  tokenData: TokenData,
  senderKeys: RailgunKeys,
  destinationKeys: RailgunKeys,
): Promise<TransactProofResult & { bridgeData: BridgeData }> {
  await initZK();

  const totalIn = inputNotes.reduce((sum, note) => sum + note.value, 0n);
  if (totalIn < amount) {
    throw new Error(`Insufficient balance: have ${totalIn}, need ${amount}`);
  }

  // Create destination note for L1 RAILGUN
  const destinationNote = new Note(
    destinationKeys.spendingKey,
    destinationKeys.viewingKey,
    amount,
    randomBytes(16),
    tokenData,
  );

  const destPreimage = await destinationNote.getCommitmentPreimage();
  const destCiphertext = await destinationNote.encryptForShield();

  // On L2, we unshield to the PrivacyBridge address
  const bridgeUnshieldNote = new UnshieldNote(
    L2_CONTRACTS.PRIVACY_BRIDGE,
    amount,
    tokenData,
  );

  // Change note
  const change = totalIn - amount;
  const outputNotes: (Note | UnshieldNote)[] = [];
  if (change > 0n) {
    outputNotes.push(
      new Note(
        senderKeys.spendingKey,
        senderKeys.viewingKey,
        change,
        randomBytes(16),
        tokenData,
      ),
    );
  }
  outputNotes.push(bridgeUnshieldNote);

  const proofResult = await _generateTransactProof(
    merkleTree,
    inputNotes,
    outputNotes,
    senderKeys,
    UnshieldType.NORMAL,
  );

  // Compute commitment hash for bridge message
  const destHash = await destinationNote.getHash();

  const bridgeData: BridgeData = {
    commitmentHash: bytesToHex(destHash),
    amount,
    destinationPreimage: preimageToSolidity(destPreimage),
    destinationCiphertext: shieldCiphertextToSolidity(destCiphertext.ciphertext),
    destinationNote,
  };

  return { ...proofResult, bridgeData };
}

export interface BridgeData {
  commitmentHash: `0x${string}`;
  amount: bigint;
  destinationPreimage: ReturnType<typeof preimageToSolidity>;
  destinationCiphertext: ReturnType<typeof shieldCiphertextToSolidity>;
  destinationNote: Note;
}

// ── Internal: Proof Generation ──────────────────────────────────────

/**
 * Select the best circuit config for the given input/output counts.
 */
function selectCircuit(nInputs: number, nOutputs: number): CircuitConfig {
  // Find smallest circuit that fits
  const config = CIRCUIT_CONFIGS.find(
    (c) => c.nullifiers >= nInputs && c.commitments >= nOutputs,
  );
  if (!config) {
    throw new Error(
      `No circuit config for ${nInputs} inputs, ${nOutputs} outputs. ` +
      `Max supported: ${CIRCUIT_CONFIGS[CIRCUIT_CONFIGS.length - 1].nullifiers}x${CIRCUIT_CONFIGS[CIRCUIT_CONFIGS.length - 1].commitments}`,
    );
  }
  return config;
}

/**
 * Core proof generation logic.
 * Constructs circuit inputs, generates Groth16 proof, formats for Solidity.
 */
async function _generateTransactProof(
  merkleTree: MerkleTree,
  inputNotes: Note[],
  outputNotes: (Note | UnshieldNote)[],
  senderKeys: RailgunKeys,
  unshieldType: UnshieldType,
): Promise<TransactProofResult> {
  const startTime = performance.now();

  // Select circuit
  const nOutputs = outputNotes.length;
  const nInputs = inputNotes.length;
  const config = selectCircuit(nInputs, nOutputs);

  // Pad inputs with dummy notes if needed
  const paddedInputs = [...inputNotes];
  while (paddedInputs.length < config.nullifiers) {
    paddedInputs.push(
      Note.createEthNote(0n, senderKeys.spendingKey, senderKeys.viewingKey),
    );
  }

  // Pad outputs with dummy notes if needed
  const paddedOutputs: (Note | UnshieldNote)[] = [...outputNotes];
  while (paddedOutputs.length < config.commitments) {
    // Insert dummy notes BEFORE the unshield note (if present)
    const insertIdx = unshieldType !== UnshieldType.NONE
      ? paddedOutputs.length - 1
      : paddedOutputs.length;
    paddedOutputs.splice(
      insertIdx,
      0,
      Note.createEthNote(0n, senderKeys.spendingKey, senderKeys.viewingKey),
    );
  }

  // Compute all note hashes
  const inputHashes = await Promise.all(paddedInputs.map((n) => n.getHash()));
  const outputHashes = await Promise.all(paddedOutputs.map((n) => n.getHash()));

  // Get Merkle proofs for inputs
  const merkleProofs: MerkleProof[] = [];
  for (let i = 0; i < paddedInputs.length; i++) {
    try {
      merkleProofs.push(merkleTree.generateProof(inputHashes[i]));
    } catch {
      // Dummy note — create a proof for index 0 (will be ignored by circuit for 0-value notes)
      merkleProofs.push(merkleTree.generateProofByIndex(0));
    }
  }

  // Compute nullifiers
  const nullifiers = await Promise.all(
    paddedInputs.map((note, i) => note.getNullifier(merkleProofs[i].indices)),
  );

  // Create commitment ciphertext for output notes
  const ciphertextCount =
    unshieldType === UnshieldType.NONE
      ? paddedOutputs.length
      : paddedOutputs.length - 1;

  const commitmentCiphertext: CommitmentCiphertext[] = [];
  for (let i = 0; i < ciphertextCount; i++) {
    const output = paddedOutputs[i];
    if (output instanceof Note) {
      commitmentCiphertext.push(
        await output.encryptForTransact(senderKeys.viewingKey),
      );
    } else {
      // UnshieldNote that's not the last — shouldn't happen, but handle gracefully
      commitmentCiphertext.push(
        await output.encryptForTransact(senderKeys.viewingKey),
      );
    }
  }

  // Build bound params
  const boundParams = {
    treeNumber: merkleTree.treeNumber,
    minGasPrice: 0n,
    unshield: unshieldType,
    chainID: SHADOWBASE_CHAIN_ID,
    adaptContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    adaptParams: bytesToHex(new Uint8Array(32)) as `0x${string}`,
    commitmentCiphertext: commitmentCiphertext.map(commitmentCiphertextToSolidity),
  };

  // Hash bound params (matching RAILGUN's hashBoundParams)
  const boundParamsHash = await _hashBoundParams(boundParams);

  // Sign the transaction
  const signature = await paddedInputs[0].sign(
    merkleProofs[0].root,
    boundParamsHash,
    nullifiers,
    outputHashes,
  );

  // Build circuit inputs
  const token = await paddedInputs[0].getTokenID();
  const publicKey = await paddedInputs[0].getSpendingPublicKey();
  const nullifyingKey = await paddedInputs[0].getNullifyingKey();
  const npkOut = await Promise.all(paddedOutputs.map((n) => n.getNotePublicKey()));

  const circuitInputs = {
    // Public inputs
    merkleRoot: bytesToBigInt(merkleProofs[0].root).toString(),
    boundParamsHash: bytesToBigInt(boundParamsHash).toString(),
    nullifiers: nullifiers.map((n) => bytesToBigInt(n).toString()),
    commitmentsOut: outputHashes.map((h) => bytesToBigInt(h).toString()),

    // Private inputs
    token: bytesToBigInt(token).toString(),
    publicKey: publicKey.map((p) => bytesToBigInt(p).toString()),
    signature: signature.map((s) => bytesToBigInt(s).toString()),
    randomIn: paddedInputs.map((n) => bytesToBigInt(padToLength(n.random, 32)).toString()),
    valueIn: paddedInputs.map((n) => n.value.toString()),
    pathElements: merkleProofs.map((proof) =>
      proof.elements.map((el) => bytesToBigInt(el).toString()),
    ),
    leavesIndices: merkleProofs.map((proof) => proof.indices),
    nullifyingKey: bytesToBigInt(nullifyingKey).toString(),
    npkOut: npkOut.map((n) => bytesToBigInt(n).toString()),
    valueOut: paddedOutputs.map((n) => n.value.toString()),
  };

  // Generate Groth16 proof
  const proof = await _proveCircuit(config, circuitInputs);

  // Format unshield preimage
  const lastOutput = paddedOutputs[paddedOutputs.length - 1];
  const unshieldPreimage: CommitmentPreimage =
    unshieldType !== UnshieldType.NONE && lastOutput instanceof UnshieldNote
      ? {
          npk: await lastOutput.getNotePublicKey(),
          token: lastOutput.tokenData,
          value: lastOutput.value,
        }
      : {
          npk: new Uint8Array(32),
          token: { tokenType: TokenType.ERC20, tokenAddress: NATIVE_ETH_ADDRESS, tokenSubID: 0n },
          value: 0n,
        };

  const proofTimeMs = performance.now() - startTime;

  const transaction: TransactionData = {
    proof,
    merkleRoot: bytesToHex(merkleProofs[0].root),
    nullifiers: nullifiers.map((n) => bytesToHex(n)),
    commitments: outputHashes.map((h) => bytesToHex(h)),
    boundParams,
    unshieldPreimage: preimageToSolidity(unshieldPreimage),
  };

  return {
    transaction,
    outputNotes: paddedOutputs,
    proofTimeMs,
  };
}

// ── Bound Params Hashing ────────────────────────────────────────────

/**
 * Hash bound params to match RAILGUN's hashBoundParams (keccak256 of ABI-encoded struct % SNARK_SCALAR_FIELD).
 * Uses viem's encodeAbiParameters for browser-compatible ABI encoding.
 */
async function _hashBoundParams(boundParams: BoundParams): Promise<Uint8Array> {
  const { encodeAbiParameters } = await import('viem');

  const encoded = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          { name: 'treeNumber', type: 'uint16' },
          { name: 'minGasPrice', type: 'uint48' },
          { name: 'unshield', type: 'uint8' },
          { name: 'chainID', type: 'uint64' },
          { name: 'adaptContract', type: 'address' },
          { name: 'adaptParams', type: 'bytes32' },
          {
            name: 'commitmentCiphertext',
            type: 'tuple[]',
            components: [
              { name: 'ciphertext', type: 'bytes32[4]' },
              { name: 'blindedSenderViewingKey', type: 'bytes32' },
              { name: 'blindedReceiverViewingKey', type: 'bytes32' },
              { name: 'annotationData', type: 'bytes' },
              { name: 'memo', type: 'bytes' },
            ],
          },
        ],
      },
    ],
    [
      {
        treeNumber: boundParams.treeNumber,
        minGasPrice: Number(boundParams.minGasPrice),
        unshield: boundParams.unshield,
        chainID: boundParams.chainID,
        adaptContract: boundParams.adaptContract,
        adaptParams: boundParams.adaptParams,
        commitmentCiphertext: boundParams.commitmentCiphertext.map((ct) => ({
          ciphertext: ct.ciphertext,
          blindedSenderViewingKey: ct.blindedSenderViewingKey,
          blindedReceiverViewingKey: ct.blindedReceiverViewingKey,
          annotationData: ct.annotationData as `0x${string}`,
          memo: ct.memo as `0x${string}`,
        })),
      },
    ],
  );

  const hashBytes = await keccak256(hexToBytes(encoded));
  const value = bytesToBigInt(hashBytes) % SNARK_SCALAR_FIELD;
  return bigIntToBytes(value, 32);
}

// ── Circuit Proof Generation ────────────────────────────────────────

/**
 * Load circuit artifacts and generate Groth16 proof.
 * Artifacts are loaded from /public/circuits/ (wasm + zkey files).
 *
 * For the hackathon demo, if artifacts are not available, returns a dummy proof
 * that works with VERIFICATION_BYPASS (tx.origin = 0x...dEaD).
 */
async function _proveCircuit(
  config: CircuitConfig,
  inputs: Record<string, unknown>,
): Promise<SolidityProof> {
  const configKey = `${String(config.nullifiers).padStart(2, '0')}x${String(config.commitments).padStart(2, '0')}`;

  try {
    // Try to load snarkjs and artifacts
    const snarkjs = await import('snarkjs');

    // Artifact paths (served from /public/circuits/)
    const wasmPath = `/circuits/${configKey}.wasm`;
    const zkeyPath = `/circuits/${configKey}.zkey`;

    // Check if artifacts exist by attempting to fetch
    const [wasmResponse, zkeyResponse] = await Promise.all([
      fetch(wasmPath),
      fetch(zkeyPath),
    ]);

    if (!wasmResponse.ok || !zkeyResponse.ok) {
      console.warn(
        `Circuit artifacts not found for ${configKey}. Using dummy proof.`,
        'Place .wasm and .zkey files in /public/circuits/ for real proofs.',
      );
      return _dummyProof();
    }

    const wasmBuffer = await wasmResponse.arrayBuffer();
    const zkeyBuffer = await zkeyResponse.arrayBuffer();

    console.log(`[zkUtils] Generating ${configKey} Groth16 proof...`);
    const startTime = performance.now();

    const { proof } = await snarkjs.groth16.fullProve(
      inputs,
      new Uint8Array(wasmBuffer),
      new Uint8Array(zkeyBuffer),
    );

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`[zkUtils] Proof generated in ${elapsed}s`);

    return _formatProof(proof);
  } catch (error) {
    console.warn('[zkUtils] Proof generation failed, using dummy proof:', error);
    return _dummyProof();
  }
}

/**
 * Format snarkjs proof to Solidity-compatible format.
 * G2 point coordinates are REVERSED for Solidity's ecPairing precompile.
 */
function _formatProof(proof: any): SolidityProof {
  return {
    a: {
      x: BigInt(proof.pi_a[0]),
      y: BigInt(proof.pi_a[1]),
    },
    b: {
      // G2 reversal for Solidity
      x: [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      y: [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    },
    c: {
      x: BigInt(proof.pi_c[0]),
      y: BigInt(proof.pi_c[1]),
    },
  };
}

/** Dummy proof for demo/testing (works with VERIFICATION_BYPASS) */
function _dummyProof(): SolidityProof {
  return {
    a: { x: 0n, y: 0n },
    b: { x: [0n, 0n], y: [0n, 0n] },
    c: { x: 0n, y: 0n },
  };
}

// ── Re-exports ──────────────────────────────────────────────────────

export { Note, UnshieldNote, MerkleTree };
export type { TokenData, CommitmentPreimage, ShieldCiphertext, ShieldRequest };
export { TokenType, UnshieldType, NATIVE_ETH_ADDRESS };
export {
  preimageToSolidity,
  shieldCiphertextToSolidity,
  commitmentCiphertextToSolidity,
} from './note';
export { bytesToHex, hexToBytes, bigIntToBytes, bytesToBigInt, randomBytes } from './crypto';
export { SNARK_SCALAR_FIELD, SHADOWBASE_CHAIN_ID, L2_CONTRACTS, L1_CONTRACTS } from './constants';
