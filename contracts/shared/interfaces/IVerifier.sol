// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;
pragma abicoder v2;

// ============================================================================
// ShadowBase — IVerifier Interface
// For Yug's ShieldedPool and other L2 contracts to interact with the Verifier.
// ============================================================================

import {VerifyingKey, SnarkProof, Transaction, BoundParams} from "../Globals.sol";

interface IVerifier {
    /// @notice Emitted when a verification key is set
    event VerifyingKeySet(uint256 nullifiers, uint256 commitments, VerifyingKey verifyingKey);

    /// @notice Sets verification key for a circuit config
    /// @param _nullifiers - number of nullifiers
    /// @param _commitments - number of commitments
    /// @param _verifyingKey - verification key to set
    function setVerificationKey(
        uint256 _nullifiers,
        uint256 _commitments,
        VerifyingKey calldata _verifyingKey
    ) external;

    /// @notice Gets verification key for a circuit config
    /// @param _nullifiers - number of nullifiers
    /// @param _commitments - number of commitments
    /// @return the verification key
    function getVerificationKey(
        uint256 _nullifiers,
        uint256 _commitments
    ) external view returns (VerifyingKey memory);

    /// @notice Hashes bound params for SNARK public input
    /// @param _boundParams - bound parameters
    /// @return hash of bound parameters (mod SNARK_SCALAR_FIELD)
    function hashBoundParams(
        BoundParams calldata _boundParams
    ) external pure returns (uint256);

    /// @notice Verifies a SNARK proof against a verification key
    /// @param _verifyingKey - verification key
    /// @param _proof - Groth16 proof
    /// @param _inputs - public inputs
    /// @return proof validity
    function verifyProof(
        VerifyingKey memory _verifyingKey,
        SnarkProof calldata _proof,
        uint256[] memory _inputs
    ) external view returns (bool);

    /// @notice Verifies a complete shielded transaction
    /// @param _transaction - transaction to verify
    /// @return transaction validity
    function verify(Transaction calldata _transaction) external view returns (bool);
}
