// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "forge-std/Test.sol";
import {PrivacyBridge} from "../../contracts/bridge/PrivacyBridge.sol";
import {ICrossDomainMessenger} from "../../contracts/shared/interfaces/ICrossDomainMessenger.sol";
import {IShieldedPool} from "../../contracts/shared/interfaces/IShieldedPool.sol";
import {
    CommitmentPreimage,
    ShieldCiphertext,
    ShieldRequest,
    TokenType,
    TokenData,
    SnarkProof,
    G1Point,
    G2Point,
    SNARK_SCALAR_FIELD
} from "../../contracts/shared/Globals.sol";

// ============================================================================
// Mock Contracts for Testing
// ============================================================================

/// @dev Mock L2 CrossDomainMessenger
contract MockMessenger is ICrossDomainMessenger {
    address public xDomainSender;
    address public lastTarget;
    bytes public lastMessage;
    uint32 public lastGasLimit;
    uint256 public nonce;
    bool public messageWasSent;

    function setXDomainMessageSender(address _sender) external {
        xDomainSender = _sender;
    }

    function sendMessage(address _target, bytes calldata _message, uint32 _minGasLimit) external payable {
        lastTarget = _target;
        lastMessage = _message;
        lastGasLimit = _minGasLimit;
        messageWasSent = true;
        nonce++;
    }

    function xDomainMessageSender() external view returns (address) {
        return xDomainSender;
    }

    function messageNonce() external view returns (uint256) {
        return nonce;
    }

    function successfulMessages(bytes32) external pure returns (bool) {
        return false;
    }
}

/// @dev Mock ShieldedPool
contract MockShieldedPool is IShieldedPool {
    bytes32 public merkleRoot;
    uint256 public treeNumber;
    uint256 public nextLeafIndex;

    mapping(uint256 => mapping(bytes32 => bool)) private _nullifiers;
    mapping(uint256 => mapping(bytes32 => bool)) private _rootHistory;

    // Track bridge calls for assertions
    bytes32 public lastBridgeCommitmentHash;
    CommitmentPreimage public lastBridgePreimage;
    uint256 public lastBridgeNullifyTree;
    bytes32 public lastBridgeNullifier;
    bool public bridgeCommitmentCalled;
    bool public bridgeNullifyCalled;

    constructor() {
        merkleRoot = bytes32(uint256(1));
        treeNumber = 0;
        nextLeafIndex = 0;
    }

    function setRootValid(uint256 _tree, bytes32 _root) external {
        _rootHistory[_tree][_root] = true;
    }

    function setNullifierSpent(uint256 _tree, bytes32 _nullifier) external {
        _nullifiers[_tree][_nullifier] = true;
    }

    function shield(ShieldRequest[] calldata) external pure {
        // Not used by bridge directly
    }

    function bridgeCommitmentIn(
        bytes32 _commitmentHash,
        CommitmentPreimage calldata _preimage,
        ShieldCiphertext calldata
    ) external {
        lastBridgeCommitmentHash = _commitmentHash;
        lastBridgePreimage = _preimage;
        bridgeCommitmentCalled = true;
        nextLeafIndex++;
    }

    function bridgeNullify(uint256 _treeNumber, bytes32 _nullifier) external {
        lastBridgeNullifyTree = _treeNumber;
        lastBridgeNullifier = _nullifier;
        _nullifiers[_treeNumber][_nullifier] = true;
        bridgeNullifyCalled = true;
    }

    function nullifiers(uint256 _tree, bytes32 _nullifier) external view returns (bool) {
        return _nullifiers[_tree][_nullifier];
    }

    function rootHistory(uint256 _tree, bytes32 _root) external view returns (bool) {
        return _rootHistory[_tree][_root];
    }
}

// ============================================================================
// PrivacyBridge Test Suite
// ============================================================================

contract PrivacyBridgeTest is Test {
    PrivacyBridge public bridge;
    MockMessenger public messenger;
    MockShieldedPool public shieldedPool;

    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address l1Companion = makeAddr("l1Companion");

    // Predeploy addresses
    address constant MESSENGER_ADDR = 0x4200000000000000000000000000000000000007;
    address constant SHIELDED_POOL_ADDR = 0x4200000000000000000000000000000000000070;

    // Events
    event BridgeToL1Initiated(
        uint256 indexed nonce,
        bytes32 indexed nullifier,
        bytes32 commitmentHash,
        address indexed sender,
        uint256 timestamp
    );
    event BridgeFromL1Completed(
        bytes32 indexed commitmentHash,
        uint256 indexed nonce,
        uint256 timestamp
    );
    event L1CompanionSet(address indexed l1Companion);

    function setUp() public {
        // Deploy mocks at the predeploy addresses
        messenger = new MockMessenger();
        shieldedPool = new MockShieldedPool();

        // Use vm.etch to place mock bytecode at predeploy addresses
        vm.etch(MESSENGER_ADDR, address(messenger).code);
        vm.etch(SHIELDED_POOL_ADDR, address(shieldedPool).code);

        // Deploy bridge as admin
        vm.prank(admin);
        bridge = new PrivacyBridge();

        // Set L1Companion
        vm.prank(admin);
        bridge.setL1Companion(l1Companion);

        // Reinitialize the mock at predeploy with valid state
        // (vm.etch copies code but not storage, so we use the mock directly via calls)
    }

    // ──────────────────────────────────────────────
    // Helper functions
    // ──────────────────────────────────────────────

    function _makePreimage() internal pure returns (CommitmentPreimage memory) {
        return CommitmentPreimage({
            npk: bytes32(uint256(0xBEEF)),
            token: TokenData({
                tokenType: TokenType.ERC20,
                tokenAddress: address(0),
                tokenSubID: 0
            }),
            value: 1 ether
        });
    }

    function _makeCiphertext() internal pure returns (ShieldCiphertext memory) {
        return ShieldCiphertext({
            encryptedBundle: [bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3))],
            shieldKey: bytes32(uint256(0xCAFE))
        });
    }

    function _makeDummyProof() internal pure returns (SnarkProof memory) {
        return SnarkProof({
            a: G1Point(1, 2),
            b: G2Point([uint256(3), uint256(4)], [uint256(5), uint256(6)]),
            c: G1Point(7, 8)
        });
    }

    // ──────────────────────────────────────────────
    // Deployment & Admin tests
    // ──────────────────────────────────────────────

    function test_deployment() public view {
        assertEq(bridge.admin(), admin);
        assertEq(bridge.l1Companion(), l1Companion);
        assertEq(bridge.bridgeNonce(), 0);
    }

    function test_setL1Companion() public {
        address newCompanion = makeAddr("newCompanion");

        vm.prank(admin);
        vm.expectEmit(true, false, false, false);
        emit L1CompanionSet(newCompanion);
        bridge.setL1Companion(newCompanion);

        assertEq(bridge.l1Companion(), newCompanion);
    }

    function test_setL1Companion_rejectsNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert("PrivacyBridge: caller is not admin");
        bridge.setL1Companion(makeAddr("fake"));
    }

    function test_setL1Companion_rejectsZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("PrivacyBridge: zero address");
        bridge.setL1Companion(address(0));
    }

    // ──────────────────────────────────────────────
    // bridgeToL1 tests
    // ──────────────────────────────────────────────

    function test_bridgeToL1_basic() public {
        // Set up valid Merkle root in the mock pool
        bytes32 validRoot = bytes32(uint256(42));
        bytes32 nullifier = bytes32(uint256(123));

        // We need to call the mock at the predeploy address
        MockShieldedPool pool = MockShieldedPool(SHIELDED_POOL_ADDR);
        pool.setRootValid(0, validRoot);

        CommitmentPreimage memory preimage = _makePreimage();
        ShieldCiphertext memory ciphertext = _makeCiphertext();
        SnarkProof memory proof = _makeDummyProof();

        vm.prank(alice);
        bridge.bridgeToL1(
            0, // treeNumber
            nullifier,
            validRoot,
            proof,
            preimage,
            ciphertext
        );

        // Verify nonce incremented
        assertEq(bridge.bridgeNonce(), 1);

        // Verify nullifier was marked as spent
        assertTrue(pool.nullifiers(0, nullifier));

        // Verify cross-chain message was sent
        MockMessenger msg_ = MockMessenger(MESSENGER_ADDR);
        assertTrue(msg_.messageWasSent());
        assertEq(msg_.lastTarget(), l1Companion);
    }

    function test_bridgeToL1_invalidMerkleRoot() public {
        bytes32 invalidRoot = bytes32(uint256(999));
        bytes32 nullifier = bytes32(uint256(123));

        vm.prank(alice);
        vm.expectRevert("PrivacyBridge: invalid merkle root");
        bridge.bridgeToL1(
            0,
            nullifier,
            invalidRoot,
            _makeDummyProof(),
            _makePreimage(),
            _makeCiphertext()
        );
    }

    function test_bridgeToL1_spentNullifier() public {
        bytes32 validRoot = bytes32(uint256(42));
        bytes32 nullifier = bytes32(uint256(123));

        MockShieldedPool pool = MockShieldedPool(SHIELDED_POOL_ADDR);
        pool.setRootValid(0, validRoot);
        pool.setNullifierSpent(0, nullifier);

        vm.prank(alice);
        vm.expectRevert("PrivacyBridge: nullifier already spent");
        bridge.bridgeToL1(
            0,
            nullifier,
            validRoot,
            _makeDummyProof(),
            _makePreimage(),
            _makeCiphertext()
        );
    }

    function test_bridgeToL1_l1CompanionNotSet() public {
        // Deploy a fresh bridge without setting L1Companion
        vm.prank(admin);
        PrivacyBridge freshBridge = new PrivacyBridge();

        vm.prank(alice);
        vm.expectRevert("PrivacyBridge: L1Companion not set");
        freshBridge.bridgeToL1(
            0,
            bytes32(uint256(1)),
            bytes32(uint256(2)),
            _makeDummyProof(),
            _makePreimage(),
            _makeCiphertext()
        );
    }

    function test_bridgeToL1_incrementsNonce() public {
        bytes32 validRoot = bytes32(uint256(42));

        MockShieldedPool pool = MockShieldedPool(SHIELDED_POOL_ADDR);
        pool.setRootValid(0, validRoot);

        CommitmentPreimage memory preimage = _makePreimage();
        ShieldCiphertext memory ciphertext = _makeCiphertext();
        SnarkProof memory proof = _makeDummyProof();

        // First bridge
        vm.prank(alice);
        bridge.bridgeToL1(0, bytes32(uint256(1)), validRoot, proof, preimage, ciphertext);
        assertEq(bridge.bridgeNonce(), 1);

        // Second bridge (different nullifier)
        vm.prank(alice);
        bridge.bridgeToL1(0, bytes32(uint256(2)), validRoot, proof, preimage, ciphertext);
        assertEq(bridge.bridgeNonce(), 2);
    }

    function test_bridgeToL1_emitsEvent() public {
        bytes32 validRoot = bytes32(uint256(42));
        bytes32 nullifier = bytes32(uint256(123));

        MockShieldedPool pool = MockShieldedPool(SHIELDED_POOL_ADDR);
        pool.setRootValid(0, validRoot);

        CommitmentPreimage memory preimage = _makePreimage();

        // Compute expected commitment hash
        bytes32 expectedHash = bytes32(
            uint256(
                keccak256(
                    abi.encode(
                        preimage.npk,
                        preimage.token.tokenType,
                        preimage.token.tokenAddress,
                        preimage.token.tokenSubID,
                        preimage.value
                    )
                )
            ) % SNARK_SCALAR_FIELD
        );

        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit BridgeToL1Initiated(0, nullifier, expectedHash, alice, block.timestamp);
        bridge.bridgeToL1(
            0,
            nullifier,
            validRoot,
            _makeDummyProof(),
            preimage,
            _makeCiphertext()
        );
    }

    // ──────────────────────────────────────────────
    // receiveFromL1 tests
    // ──────────────────────────────────────────────

    function test_receiveFromL1_basic() public {
        bytes32 commitmentHash = bytes32(uint256(0xDEAD));
        uint256 nonce = 0;
        CommitmentPreimage memory preimage = _makePreimage();
        ShieldCiphertext memory ciphertext = _makeCiphertext();

        // Simulate call from CrossDomainMessenger with L1Companion as sender
        MockMessenger msg_ = MockMessenger(MESSENGER_ADDR);
        msg_.setXDomainMessageSender(l1Companion);

        vm.prank(MESSENGER_ADDR);
        bridge.receiveFromL1(commitmentHash, nonce, preimage, ciphertext);

        // Verify commitment was created in pool
        MockShieldedPool pool = MockShieldedPool(SHIELDED_POOL_ADDR);
        assertTrue(pool.bridgeCommitmentCalled());
        assertEq(pool.lastBridgeCommitmentHash(), commitmentHash);

        // Verify message marked as processed
        assertTrue(bridge.isMessageProcessed(commitmentHash, nonce));
    }

    function test_receiveFromL1_rejectsNonMessenger() public {
        vm.prank(alice);
        vm.expectRevert("PrivacyBridge: caller is not the messenger");
        bridge.receiveFromL1(
            bytes32(uint256(1)),
            0,
            _makePreimage(),
            _makeCiphertext()
        );
    }

    function test_receiveFromL1_rejectsWrongL1Sender() public {
        MockMessenger msg_ = MockMessenger(MESSENGER_ADDR);
        msg_.setXDomainMessageSender(makeAddr("wrongSender"));

        vm.prank(MESSENGER_ADDR);
        vm.expectRevert("PrivacyBridge: sender is not L1Companion");
        bridge.receiveFromL1(
            bytes32(uint256(1)),
            0,
            _makePreimage(),
            _makeCiphertext()
        );
    }

    function test_receiveFromL1_rejectsReplay() public {
        bytes32 commitmentHash = bytes32(uint256(0xDEAD));
        uint256 nonce = 0;

        MockMessenger msg_ = MockMessenger(MESSENGER_ADDR);
        msg_.setXDomainMessageSender(l1Companion);

        // First call succeeds
        vm.prank(MESSENGER_ADDR);
        bridge.receiveFromL1(commitmentHash, nonce, _makePreimage(), _makeCiphertext());

        // Second call with same hash+nonce should fail
        vm.prank(MESSENGER_ADDR);
        vm.expectRevert("PrivacyBridge: message already processed");
        bridge.receiveFromL1(commitmentHash, nonce, _makePreimage(), _makeCiphertext());
    }

    function test_receiveFromL1_differentNoncesAllowed() public {
        bytes32 commitmentHash = bytes32(uint256(0xDEAD));

        MockMessenger msg_ = MockMessenger(MESSENGER_ADDR);
        msg_.setXDomainMessageSender(l1Companion);

        // Nonce 0
        vm.prank(MESSENGER_ADDR);
        bridge.receiveFromL1(commitmentHash, 0, _makePreimage(), _makeCiphertext());

        // Nonce 1 with same commitment hash should succeed
        vm.prank(MESSENGER_ADDR);
        bridge.receiveFromL1(commitmentHash, 1, _makePreimage(), _makeCiphertext());

        assertTrue(bridge.isMessageProcessed(commitmentHash, 0));
        assertTrue(bridge.isMessageProcessed(commitmentHash, 1));
    }

    function test_receiveFromL1_emitsEvent() public {
        bytes32 commitmentHash = bytes32(uint256(0xDEAD));
        uint256 nonce = 42;

        MockMessenger msg_ = MockMessenger(MESSENGER_ADDR);
        msg_.setXDomainMessageSender(l1Companion);

        vm.prank(MESSENGER_ADDR);
        vm.expectEmit(true, true, false, true);
        emit BridgeFromL1Completed(commitmentHash, nonce, block.timestamp);
        bridge.receiveFromL1(commitmentHash, nonce, _makePreimage(), _makeCiphertext());
    }

    // ──────────────────────────────────────────────
    // View function tests
    // ──────────────────────────────────────────────

    function test_isMessageProcessed_false() public view {
        assertFalse(bridge.isMessageProcessed(bytes32(uint256(1)), 0));
    }

    function test_constants() public view {
        assertEq(bridge.L1_GAS_LIMIT(), 300_000);
        assertEq(bridge.L2_GAS_LIMIT(), 500_000);
    }
}
