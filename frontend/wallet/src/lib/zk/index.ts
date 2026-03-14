// ============================================================================
// ShadowBase — ZK Utils Barrel Export
// Import everything from here: import { initZK, generateShieldProof, ... } from '@/lib/zk'
// ============================================================================

export {
  // Initialization
  initZK,
  generateKeys,
  deriveKeysFromSeed,

  // Proof generation
  generateShieldProof,
  generateShieldETHProof,
  generateClaimData,
  generateTransferProof,
  generateUnshieldProof,
  generateBridgeProof,

  // Classes
  Note,
  UnshieldNote,
  MerkleTree,

  // Formatting helpers
  preimageToSolidity,
  shieldCiphertextToSolidity,
  commitmentCiphertextToSolidity,

  // Byte utilities
  bytesToHex,
  hexToBytes,
  bigIntToBytes,
  bytesToBigInt,
  randomBytes,

  // Constants
  SNARK_SCALAR_FIELD,
  SHADOWBASE_CHAIN_ID,
  L2_CONTRACTS,
  L1_CONTRACTS,
  TokenType,
  UnshieldType,
  NATIVE_ETH_ADDRESS,

  // Types
  type RailgunKeys,
  type SolidityProof,
  type ShieldProofResult,
  type ShieldETHProofResult,
  type TransactProofResult,
  type TransactionData,
  type BoundParams,
  type BridgeData,
  type TokenData,
  type CommitmentPreimage,
  type ShieldCiphertext,
  type ShieldRequest,
} from './zkUtils';
