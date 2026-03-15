// ============================================================================
// ShadowBase — ZK Constants
// RAILGUN-compatible constants for client-side proof generation
// ============================================================================

/** BN254 scalar field order — must match Globals.sol */
export const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Merkle tree depth — must match Commitments.sol */
export const TREE_DEPTH = 16;

/** Max leaves per tree (2^16) */
export const MAX_LEAVES = 65536;

/** Basis points denominator for fee calculations */
export const BASIS_POINTS = 10000n;

/** Zero value for Merkle tree — keccak256("Railgun") % SNARK_SCALAR_FIELD */
// Precomputed to avoid runtime dependency on keccak
export const ZERO_VALUE = 0x0a2129f49e20271defaf63c698a48a29eae5724c1f7b0b8db9c40e9a1d1f2f0en;

/** ShadowBase L2 chain ID */
export const SHADOWBASE_CHAIN_ID = 845311n;

/** Sepolia chain ID */
export const SEPOLIA_CHAIN_ID = 11155111n;

// ── Contract Addresses ──────────────────────────────────────────────

/** L2 Predeploy addresses */
export const L2_CONTRACTS = {
  PRIVACY_ROUTER: '0x4200000000000000000000000000000000000069' as const,
  SHIELDED_POOL: '0x4200000000000000000000000000000000000070' as const,
  PRIVACY_BRIDGE: '0x4200000000000000000000000000000000000071' as const,
  L2_CROSS_DOMAIN_MESSENGER: '0x4200000000000000000000000000000000000007' as const,
} as const;

/** L1 Sepolia addresses */
export const L1_CONTRACTS = {
  RAILGUN: '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea' as const,
  CROSS_DOMAIN_MESSENGER: '0x579aaf4e08b072b3b53148a260913837518a0ab8' as const,
  WETH: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9' as const,
  // L1Companion — filled after Sepolia deploy
  L1_COMPANION: '0x0000000000000000000000000000000000000000' as const,
} as const;

// ── Circuit Configurations ──────────────────────────────────────────

export interface CircuitConfig {
  nullifiers: number;
  commitments: number;
  /** Number of public signals = 2 + nullifiers + commitments (merkleRoot, boundParamsHash, nullifiers..., commitments...) */
  nPublic: number;
}

/** Supported circuit configs — must match VKeys registered on-chain */
export const CIRCUIT_CONFIGS: CircuitConfig[] = [
  { nullifiers: 1, commitments: 2, nPublic: 5 },
  { nullifiers: 2, commitments: 3, nPublic: 7 },
  { nullifiers: 8, commitments: 4, nPublic: 14 },
  // { nullifiers: 12, commitments: 2, nPublic: 16 }, // available but rarely used
];

/** Token types matching Globals.sol */
export enum TokenType {
  ERC20 = 0,
  ERC721 = 1,
  ERC1155 = 2,
}

/** Unshield types matching Globals.sol */
export enum UnshieldType {
  NONE = 0,
  NORMAL = 1,
  REDIRECT = 2,
}

/** Native ETH represented as address(0) in ShieldedPool */
export const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

/** Artifacts base URL — served from /public/circuits/ in the wallet app */
export const ARTIFACTS_BASE_URL = '/circuits' as const;
