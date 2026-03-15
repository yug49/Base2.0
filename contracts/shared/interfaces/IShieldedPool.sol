// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;
pragma abicoder v2;

// ============================================================================
// ShadowBase — IShieldedPool Interface
// Interface for the ShieldedPool predeploy (0x4200...0070).
// Used by PrivacyBridge (L2) to create/burn commitments during bridging.
//
// Based on RAILGUN's RailgunSmartWallet + Commitments contracts.
// Yug's ShieldedPool will implement this interface.
// ============================================================================

import {
    CommitmentPreimage,
    ShieldCiphertext,
    ShieldRequest,
    Transaction
} from "../Globals.sol";

interface IShieldedPool {
    // ──────────────────────────────────────────────
    // Events (mirroring RAILGUN)
    // ──────────────────────────────────────────────

    event Shield(
        uint256 treeNumber,
        uint256 startPosition,
        CommitmentPreimage[] commitments,
        ShieldCiphertext[] shieldCiphertext,
        uint256[] fees
    );

    event Nullified(uint16 treeNumber, bytes32[] nullifier);

    // ──────────────────────────────────────────────
    // Shield — create new commitments in the Merkle tree
    // ──────────────────────────────────────────────

    /// @notice Shield tokens into the private pool (creates commitments)
    /// @param _shieldRequests - array of shield requests with preimage + ciphertext
    function shield(ShieldRequest[] calldata _shieldRequests) external;

    // ──────────────────────────────────────────────
    // Bridge-specific functions
    // ──────────────────────────────────────────────

    /// @notice Create a commitment from a bridge deposit (called by PrivacyBridge only)
    /// @dev Inserts a pre-computed commitment hash directly into the Merkle tree
    ///      without requiring token transfer (tokens are locked in the bridge)
    /// @param _commitmentHash - the commitment hash to insert
    /// @param _preimage - the commitment preimage (for event emission)
    /// @param _ciphertext - encrypted data for the recipient's wallet to scan
    function bridgeCommitmentIn(
        bytes32 _commitmentHash,
        CommitmentPreimage calldata _preimage,
        ShieldCiphertext calldata _ciphertext
    ) external;

    /// @notice Mark a commitment as spent/burned for bridging out
    /// @dev Called by PrivacyBridge after verifying ZK proof of ownership
    /// @param _treeNumber - the tree number containing the nullifier
    /// @param _nullifier - the nullifier to mark as spent
    function bridgeNullify(
        uint256 _treeNumber,
        bytes32 _nullifier
    ) external;

    // ──────────────────────────────────────────────
    // Read functions
    // ──────────────────────────────────────────────

    /// @notice Get the current Merkle root
    function merkleRoot() external view returns (bytes32);

    /// @notice Get the current tree number
    function treeNumber() external view returns (uint256);

    /// @notice Get the next leaf index
    function nextLeafIndex() external view returns (uint256);

    /// @notice Check if a nullifier has been seen
    /// @param _treeNumber - tree number
    /// @param _nullifier - nullifier to check
    function nullifiers(uint256 _treeNumber, bytes32 _nullifier) external view returns (bool);

    /// @notice Check if a Merkle root has been seen
    /// @param _treeNumber - tree number
    /// @param _root - root to check
    function rootHistory(uint256 _treeNumber, bytes32 _root) external view returns (bool);
}
