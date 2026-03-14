// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;
pragma abicoder v2;

// ============================================================================
// ShadowBase — Forked from RAILGUN (Railgun-Privacy/contract)
// ZK Groth16 types for on-chain verification
// ============================================================================

// BN254 scalar field order
uint256 constant SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

// Verification bypass address for gas estimation (relayer fee calc without proof)
address constant VERIFICATION_BYPASS = 0x000000000000000000000000000000000000dEaD;

struct G1Point {
    uint256 x;
    uint256 y;
}

// Encoding of field elements is: X[0] * z + X[1]
struct G2Point {
    uint256[2] x;
    uint256[2] y;
}

struct VerifyingKey {
    string artifactsIPFSHash;
    G1Point alpha1;
    G2Point beta2;
    G2Point gamma2;
    G2Point delta2;
    G1Point[] ic;
}

struct SnarkProof {
    G1Point a;
    G2Point b;
    G1Point c;
}

enum TokenType {
    ERC20,
    ERC721,
    ERC1155
}

struct TokenData {
    TokenType tokenType;
    address tokenAddress;
    uint256 tokenSubID;
}

struct CommitmentPreimage {
    bytes32 npk;
    TokenData token;
    uint120 value;
}

struct CommitmentCiphertext {
    bytes32[4] ciphertext;
    bytes32 blindedSenderViewingKey;
    bytes32 blindedReceiverViewingKey;
    bytes annotationData;
    bytes memo;
}

struct ShieldCiphertext {
    bytes32[3] encryptedBundle;
    bytes32 shieldKey;
}

enum UnshieldType {
    NONE,
    NORMAL,
    REDIRECT
}

struct BoundParams {
    uint16 treeNumber;
    uint72 minGasPrice;
    UnshieldType unshield;
    uint64 chainID;
    address adaptContract;
    bytes32 adaptParams;
    CommitmentCiphertext[] commitmentCiphertext;
}

struct Transaction {
    SnarkProof proof;
    bytes32 merkleRoot;
    bytes32[] nullifiers;
    bytes32[] commitments;
    BoundParams boundParams;
    CommitmentPreimage unshieldPreimage;
}

struct ShieldRequest {
    CommitmentPreimage preimage;
    ShieldCiphertext ciphertext;
}

bytes32 constant ACCEPT_RAILGUN_RESPONSE = keccak256(abi.encodePacked("Accept Railgun Session"));
