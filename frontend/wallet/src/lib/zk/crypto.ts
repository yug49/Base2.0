// ============================================================================
// ShadowBase — ZK Crypto Utilities (Browser-Compatible)
// Poseidon hashing, AES encryption, key derivation
// Adapted from railgun-contract/helpers/global/crypto.ts for browser use
// ============================================================================

import { SNARK_SCALAR_FIELD } from './constants';

// ── Byte Utilities ──────────────────────────────────────────────────

/** Left-pad a Uint8Array to a fixed length */
export function padToLength(arr: Uint8Array, length: number): Uint8Array {
  if (arr.length > length) throw new Error(`Array length ${arr.length} exceeds target ${length}`);
  if (arr.length === length) return arr;
  const padded = new Uint8Array(length);
  padded.set(arr, length - arr.length);
  return padded;
}

/** Convert BigInt to big-endian Uint8Array of given byte length */
export function bigIntToBytes(bn: bigint, length: number): Uint8Array {
  let hex = bn.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const bytes = new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  return padToLength(bytes, length);
}

/** Convert big-endian Uint8Array to BigInt */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) {
    result = (result << 8n) + BigInt(b);
  }
  return result;
}

/** Convert hex string (with or without 0x) to Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const padded = h.length % 2 ? '0' + h : h;
  return new Uint8Array(padded.match(/.{2}/g)!.map(b => parseInt(b, 16)));
}

/** Convert Uint8Array to 0x-prefixed hex string */
export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Get cryptographically secure random bytes (browser) */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Convert Uint8Array to a proper ArrayBuffer for WebCrypto APIs.
 * Needed because TS 5.9 distinguishes ArrayBuffer from ArrayBufferLike.
 */
function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

// ── Poseidon Hash (via circomlibjs) ─────────────────────────────────

// Lazy-loaded Poseidon instance
let _poseidonFn: any = null;
let _poseidonF: any = null;
let _poseidonPromise: Promise<void> | null = null;

/**
 * Initialize Poseidon hasher. Must be called once before any hashing.
 * Safe to call multiple times (idempotent).
 */
export async function initPoseidon(): Promise<void> {
  if (_poseidonFn) return;
  if (_poseidonPromise) return _poseidonPromise;

  _poseidonPromise = (async () => {
    // Dynamic import for browser compatibility — circomlibjs works in browser
    const { buildPoseidonOpt } = await import('circomlibjs');
    const poseidon = await buildPoseidonOpt();
    _poseidonFn = poseidon;
    _poseidonF = poseidon.F;
  })();

  return _poseidonPromise;
}

/**
 * Poseidon hash of inputs (matching RAILGUN's implementation).
 * Inputs are big-endian 32-byte Uint8Arrays.
 * @returns 32-byte big-endian hash
 */
export async function poseidonHash(inputs: Uint8Array[]): Promise<Uint8Array> {
  await initPoseidon();

  // Convert inputs to LE montgomery representation, hash, convert back
  const result = _poseidonF.fromMontgomery(
    _poseidonFn(
      inputs.map((input: Uint8Array) =>
        _poseidonF.toMontgomery(new Uint8Array(input).reverse())
      ),
    ),
  );

  return padToLength(new Uint8Array(result).reverse(), 32);
}

/**
 * PoseidonT3 — hash 2 inputs (Merkle tree internal nodes)
 */
export async function poseidonT3(a: Uint8Array, b: Uint8Array): Promise<Uint8Array> {
  return poseidonHash([padToLength(a, 32), padToLength(b, 32)]);
}

/**
 * PoseidonT4 — hash 3 inputs (commitment hash: npk, tokenID, value)
 */
export async function poseidonT4(a: Uint8Array, b: Uint8Array, c: Uint8Array): Promise<Uint8Array> {
  return poseidonHash([padToLength(a, 32), padToLength(b, 32), padToLength(c, 32)]);
}

// ── Keccak256 ───────────────────────────────────────────────────────

/**
 * Keccak256 hash (using viem's keccak256)
 */
export async function keccak256(input: Uint8Array): Promise<Uint8Array> {
  const { keccak256: viemKeccak } = await import('viem');
  const hash = viemKeccak(bytesToHex(input));
  return hexToBytes(hash);
}

// ── AES-GCM-256 Encryption (Browser WebCrypto) ─────────────────────

/**
 * Encrypt data blocks with AES-256-GCM using WebCrypto API.
 * Output format: [iv(16) || tag(16)], ...encryptedBlocks
 * Compatible with RAILGUN's aes.gcm.encrypt
 */
export async function aesGcmEncrypt(
  plaintext: Uint8Array[],
  key: Uint8Array,
): Promise<Uint8Array[]> {
  const iv = randomBytes(16); // 128-bit IV (RAILGUN uses 16 bytes)

  // Concatenate all plaintext blocks
  const totalLen = plaintext.reduce((sum, b) => sum + b.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const block of plaintext) {
    combined.set(block, offset);
    offset += block.length;
  }

  // Import key (slice to get a fresh ArrayBuffer for WebCrypto TS compat)
  const cryptoKey = await crypto.subtle.importKey(
    'raw', toArrayBuffer(key), { name: 'AES-GCM' }, false, ['encrypt'],
  );

  // Encrypt (WebCrypto appends 16-byte tag at end of ciphertext)
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv), tagLength: 128 },
      cryptoKey,
      toArrayBuffer(combined),
    ),
  );

  // Split ciphertext and tag
  const ciphertext = encrypted.slice(0, encrypted.length - 16);
  const tag = encrypted.slice(encrypted.length - 16);

  // Reconstruct per-block outputs
  const result: Uint8Array[] = [new Uint8Array([...iv, ...tag])];
  let blockOffset = 0;
  for (const block of plaintext) {
    result.push(ciphertext.slice(blockOffset, blockOffset + block.length));
    blockOffset += block.length;
  }

  return result;
}

// ── AES-256-CTR Encryption (Browser WebCrypto) ──────────────────────

/**
 * Encrypt data blocks with AES-256-CTR using WebCrypto API.
 * Output format: iv, ...encryptedBlocks
 * Compatible with RAILGUN's aes.ctr.encrypt
 */
export async function aesCtrEncrypt(
  plaintext: Uint8Array[],
  key: Uint8Array,
): Promise<Uint8Array[]> {
  const iv = randomBytes(16);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', toArrayBuffer(key), { name: 'AES-CTR' }, false, ['encrypt'],
  );

  const result: Uint8Array[] = [iv];
  // CTR mode is stateful — counter advances across blocks
  // For simplicity, encrypt each block with incremented counter
  let counter: Uint8Array = new Uint8Array(16);
  counter.set(iv);
  for (const block of plaintext) {
    const encrypted = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-CTR', counter: toArrayBuffer(counter), length: 128 },
        cryptoKey,
        toArrayBuffer(block),
      ),
    );
    result.push(encrypted);
    // Advance counter by block length (in 16-byte increments)
    const blocks = Math.ceil(block.length / 16);
    counter = advanceCounter(counter, blocks);
  }

  return result;
}

function advanceCounter(counter: Uint8Array, blocks: number): Uint8Array {
  const c = new Uint8Array(16);
  c.set(counter);
  let carry = blocks;
  for (let i = 15; i >= 0 && carry > 0; i--) {
    const val = c[i] + carry;
    c[i] = val & 0xff;
    carry = val >> 8;
  }
  return c;
}

// ── EdDSA BabyJubJub (via circomlibjs) ──────────────────────────────

let _eddsaBuild: any = null;
let _eddsaPromise: Promise<void> | null = null;

export async function initEddsa(): Promise<void> {
  if (_eddsaBuild) return;
  if (_eddsaPromise) return _eddsaPromise;

  _eddsaPromise = (async () => {
    const { buildEddsa } = await import('circomlibjs');
    _eddsaBuild = await buildEddsa();
  })();

  return _eddsaPromise;
}

/**
 * Derive BabyJubJub public key from private key
 * @returns [Ax, Ay] as 32-byte big-endian arrays
 */
export async function eddsaPrivateToPublic(
  privateKey: Uint8Array,
): Promise<[Uint8Array, Uint8Array]> {
  await initEddsa();
  const pub = _eddsaBuild.prv2pub(privateKey);
  return pub.map((el: any) =>
    padToLength(new Uint8Array(_eddsaBuild.F.fromMontgomery(el)).reverse(), 32),
  ) as [Uint8Array, Uint8Array];
}

/**
 * EdDSA-Poseidon signature over a message
 * @returns [R8x, R8y, S] as 32-byte big-endian arrays
 */
export async function eddsaSignPoseidon(
  privateKey: Uint8Array,
  message: Uint8Array,
): Promise<[Uint8Array, Uint8Array, Uint8Array]> {
  await initEddsa();
  const montgomery = _eddsaBuild.F.toMontgomery(new Uint8Array(message).reverse());
  const sig = _eddsaBuild.signPoseidon(privateKey, montgomery);
  const r8 = sig.R8.map((el: any) =>
    padToLength(new Uint8Array(_eddsaBuild.F.fromMontgomery(el)).reverse(), 32),
  );
  return [r8[0], r8[1], bigIntToBytes(sig.S, 32)];
}

// ── Ed25519 Key Exchange (via @noble/ed25519) ───────────────────────

/**
 * Derive Ed25519 public key from private key (viewing key)
 */
export async function ed25519PublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
  const { getPublicKey } = await import('@noble/ed25519');
  return getPublicKey(privateKey);
}

/**
 * Ed25519 shared key derivation (Diffie-Hellman for encryption)
 */
export async function ed25519SharedKey(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Promise<Uint8Array> {
  const noble = await import('@noble/ed25519');
  const { sha256 } = await import('@noble/hashes/sha256');
  const { sha512 } = await import('@noble/hashes/sha512');

  // Compute private scalar (same as RAILGUN's adjustBytes25519)
  const keyHash = sha512(privateKey);
  const head = new Uint8Array(keyHash.slice(0, 32));
  // Adjust bits: LE format
  head[0] &= 0b11111000;
  head[31] &= 0b01111111;
  head[31] |= 0b01000000;
  const scalar = bytesToBigInt(new Uint8Array(head).reverse()) % noble.CURVE.n;
  const effectiveScalar = scalar > 0n ? scalar : noble.CURVE.n;

  // Multiply public key point by scalar
  const point = noble.Point.fromHex(publicKey);
  const sharedPoint = point.multiply(effectiveScalar);

  // SHA256 of the shared point = final key
  return sha256(sharedPoint.toRawBytes());
}

// ── Nullifying Key Derivation ───────────────────────────────────────

/**
 * Derive nullifying key from viewing key: poseidon(viewingKey)
 */
export async function deriveNullifyingKey(viewingKey: Uint8Array): Promise<Uint8Array> {
  return poseidonHash([viewingKey]);
}

/**
 * Derive master public key: poseidon(spendingPubX, spendingPubY, nullifyingKey)
 */
export async function deriveMasterPublicKey(
  spendingPublicKey: [Uint8Array, Uint8Array],
  nullifyingKey: Uint8Array,
): Promise<Uint8Array> {
  return poseidonHash([spendingPublicKey[0], spendingPublicKey[1], nullifyingKey]);
}

/**
 * Derive note public key (NPK): poseidon(masterPublicKey, random)
 */
export async function deriveNotePublicKey(
  masterPublicKey: Uint8Array,
  random: Uint8Array,
): Promise<Uint8Array> {
  return poseidonHash([masterPublicKey, padToLength(random, 32)]);
}

/**
 * Calculate nullifier for a note: poseidon(nullifyingKey, leafIndex)
 */
export async function calculateNullifier(
  nullifyingKey: Uint8Array,
  leafIndex: number,
): Promise<Uint8Array> {
  return poseidonHash([nullifyingKey, bigIntToBytes(BigInt(leafIndex), 32)]);
}
