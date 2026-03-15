// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;
pragma abicoder v2;

// ============================================================================
// ShadowBase — PrivacyBridge
// System predeploy at 0x4200000000000000000000000000000000000071
//
// Cross-chain privacy bridge between ShadowBase (L2) and RAILGUN on
// Ethereum Sepolia (L1). Uses OP Stack's CrossDomainMessenger for
// L1 ↔ L2 message passing.
//
// Flows:
//   bridgeToL1: User proves ownership of shielded funds on L2 →
//               nullifies commitment on L2 → sends cross-chain message
//               to L1Companion → L1Companion deposits into RAILGUN Sepolia
//
//   receiveFromL1: L1Companion sends cross-chain message →
//                  PrivacyBridge creates new commitment in L2 ShieldedPool
// ============================================================================

import {ICrossDomainMessenger} from "../shared/interfaces/ICrossDomainMessenger.sol";
import {IShieldedPool} from "../shared/interfaces/IShieldedPool.sol";
import {IVerifier} from "../shared/interfaces/IVerifier.sol";
import {
    CommitmentPreimage,
    ShieldCiphertext,
    SnarkProof,
    Transaction,
    BoundParams,
    CommitmentCiphertext,
    UnshieldType,
    SNARK_SCALAR_FIELD
} from "../shared/Globals.sol";

contract PrivacyBridge {
    // ──────────────────────────────────────────────
    // Constants — predeploy addresses
    // ──────────────────────────────────────────────

    /// @notice L2 CrossDomainMessenger (OP Stack predeploy)
    ICrossDomainMessenger public constant MESSENGER =
        ICrossDomainMessenger(0x4200000000000000000000000000000000000007);

    /// @notice L2 ShieldedPool predeploy
    IShieldedPool public constant SHIELDED_POOL =
        IShieldedPool(0x4200000000000000000000000000000000000070);

    /// @notice L1Companion contract address on Sepolia (set once by deployer)
    address public l1Companion;

    /// @notice Admin who can set the L1Companion address (set to deployer initially)
    address public admin;

    /// @notice Gas limit for cross-chain messages to L1
    uint32 public constant L1_GAS_LIMIT = 300_000;

    /// @notice Gas limit for cross-chain messages from L1
    uint32 public constant L2_GAS_LIMIT = 500_000;

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    /// @notice Nonce for bridge operations (replay protection)
    uint256 public bridgeNonce;

    /// @notice Track processed L1→L2 messages (messageHash → processed)
    mapping(bytes32 => bool) public processedMessages;

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when funds are bridged from L2 to L1
    event BridgeToL1Initiated(
        uint256 indexed nonce,
        bytes32 indexed nullifier,
        bytes32 commitmentHash,
        address indexed sender,
        uint256 timestamp
    );

    /// @notice Emitted when funds arrive from L1 to L2
    event BridgeFromL1Completed(
        bytes32 indexed commitmentHash,
        uint256 indexed nonce,
        uint256 timestamp
    );

    /// @notice Emitted when L1Companion address is set
    event L1CompanionSet(address indexed l1Companion);

    // ──────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────

    /// @notice Ensures the call is from the L2 CrossDomainMessenger
    ///         AND the original sender on L1 is the L1Companion
    modifier onlyFromL1Companion() {
        require(
            msg.sender == address(MESSENGER),
            "PrivacyBridge: caller is not the messenger"
        );
        require(
            MESSENGER.xDomainMessageSender() == l1Companion,
            "PrivacyBridge: sender is not L1Companion"
        );
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "PrivacyBridge: caller is not admin");
        _;
    }

    // ──────────────────────────────────────────────
    // Constructor / Initialization
    // ──────────────────────────────────────────────

    constructor() {
        admin = msg.sender;
    }

    /// @notice Set the L1Companion contract address (one-time or updatable by admin)
    /// @param _l1Companion - address of L1Companion on Sepolia
    function setL1Companion(address _l1Companion) external onlyAdmin {
        require(_l1Companion != address(0), "PrivacyBridge: zero address");
        l1Companion = _l1Companion;
        emit L1CompanionSet(_l1Companion);
    }

    // ──────────────────────────────────────────────
    // Bridge L2 → L1 (ShadowBase → Sepolia RAILGUN)
    // ──────────────────────────────────────────────

    /**
     * @notice Bridge shielded funds from ShadowBase to RAILGUN on Sepolia
     * @dev User provides a ZK proof of ownership, the commitment is nullified
     *      on L2, and a cross-chain message is sent to L1Companion which
     *      deposits into RAILGUN Sepolia.
     *
     * @param _treeNumber - the Merkle tree number containing the commitment
     * @param _nullifier - nullifier proving ownership (derived from spending key)
     * @param _merkleRoot - Merkle root the proof was generated against
     * @param _proof - Groth16 ZK proof of ownership
     * @param _destinationPreimage - commitment preimage for RAILGUN on L1
     *        (npk = recipient's RAILGUN public key on L1, value = amount)
     * @param _destinationCiphertext - encrypted data for L1 recipient wallet
     */
    function bridgeToL1(
        uint256 _treeNumber,
        bytes32 _nullifier,
        bytes32 _merkleRoot,
        SnarkProof calldata _proof,
        CommitmentPreimage calldata _destinationPreimage,
        ShieldCiphertext calldata _destinationCiphertext
    ) external {
        require(l1Companion != address(0), "PrivacyBridge: L1Companion not set");

        // 1. Verify the Merkle root is valid
        require(
            SHIELDED_POOL.rootHistory(_treeNumber, _merkleRoot),
            "PrivacyBridge: invalid merkle root"
        );

        // 2. Verify the nullifier hasn't been spent
        require(
            !SHIELDED_POOL.nullifiers(_treeNumber, _nullifier),
            "PrivacyBridge: nullifier already spent"
        );

        // 3. Nullify the commitment on L2 (marks as spent)
        SHIELDED_POOL.bridgeNullify(_treeNumber, _nullifier);

        // 4. Compute commitment hash for the L1 destination
        bytes32 commitmentHash = _hashCommitment(_destinationPreimage);

        // 5. Increment nonce for replay protection
        uint256 nonce = bridgeNonce++;

        // 6. Encode the message for L1Companion
        bytes memory message = abi.encodeWithSignature(
            "receiveFromBase(bytes32,uint256,(bytes32,(uint8,address,uint256),uint120),(bytes32[3],bytes32))",
            commitmentHash,
            nonce,
            _destinationPreimage,
            _destinationCiphertext
        );

        // 7. Send cross-chain message to L1Companion via CrossDomainMessenger
        MESSENGER.sendMessage(
            l1Companion,
            message,
            L1_GAS_LIMIT
        );

        emit BridgeToL1Initiated(
            nonce,
            _nullifier,
            commitmentHash,
            msg.sender,
            block.timestamp
        );
    }

    // ──────────────────────────────────────────────
    // Bridge L1 → L2 (Sepolia RAILGUN → ShadowBase)
    // ──────────────────────────────────────────────

    /**
     * @notice Receive bridged funds from L1 RAILGUN into ShadowBase ShieldedPool
     * @dev Called by CrossDomainMessenger when L1Companion sends a message.
     *      Creates a new commitment in the L2 ShieldedPool.
     *
     * @param _commitmentHash - pre-computed commitment hash
     * @param _nonce - bridge nonce for replay protection
     * @param _preimage - commitment preimage (token, amount, recipient npk)
     * @param _ciphertext - encrypted data for recipient wallet scanning
     */
    function receiveFromL1(
        bytes32 _commitmentHash,
        uint256 _nonce,
        CommitmentPreimage calldata _preimage,
        ShieldCiphertext calldata _ciphertext
    ) external onlyFromL1Companion {
        // 1. Replay protection — ensure this message hasn't been processed
        bytes32 messageHash = keccak256(abi.encode(_commitmentHash, _nonce));
        require(!processedMessages[messageHash], "PrivacyBridge: message already processed");
        processedMessages[messageHash] = true;

        // 2. Create the commitment in L2 ShieldedPool
        SHIELDED_POOL.bridgeCommitmentIn(
            _commitmentHash,
            _preimage,
            _ciphertext
        );

        emit BridgeFromL1Completed(
            _commitmentHash,
            _nonce,
            block.timestamp
        );
    }

    // ──────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────

    /**
     * @notice Hash a commitment preimage (matching RAILGUN's scheme)
     * @dev Uses keccak256 as a placeholder — Yug will replace with Poseidon
     *      in ShieldedPool. The important thing is that L2 bridge and L1
     *      companion use the SAME hash function.
     * @param _preimage - the commitment preimage
     * @return commitment hash
     */
    function _hashCommitment(CommitmentPreimage calldata _preimage) internal pure returns (bytes32) {
        return bytes32(
            uint256(
                keccak256(
                    abi.encode(
                        _preimage.npk,
                        _preimage.token.tokenType,
                        _preimage.token.tokenAddress,
                        _preimage.token.tokenSubID,
                        _preimage.value
                    )
                )
            ) % SNARK_SCALAR_FIELD
        );
    }

    // ──────────────────────────────────────────────
    // View functions
    // ──────────────────────────────────────────────

    /// @notice Check if a bridge message has been processed
    function isMessageProcessed(bytes32 _commitmentHash, uint256 _nonce) external view returns (bool) {
        return processedMessages[keccak256(abi.encode(_commitmentHash, _nonce))];
    }
}
