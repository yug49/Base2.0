// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

// ============================================================================
// ShadowBase  - Phase 2: PingPong Contract Tests
//
// Tests the L1<->L2 ping-pong message passing contracts locally using
// a mock CrossDomainMessenger. Validates:
//   1. Contracts deploy and initialize correctly
//   2. Counterpart addresses can be set (once only)
//   3. Ping sends correct message encoding
//   4. Pong is received and state updates
//   5. Auth checks: only messenger can call receive functions
//   6. Auth checks: xDomainMessageSender must match counterpart
//   7. Auto-respond toggle works
//   8. Event emissions are correct
// ============================================================================

import "forge-std/Test.sol";
import {PingPongL1, PingPongL2} from "../../contracts/test/PingPong.sol";
import {ICrossDomainMessenger} from "../../contracts/shared/interfaces/ICrossDomainMessenger.sol";

/// @dev Mock CrossDomainMessenger for local testing
contract MockMessenger is ICrossDomainMessenger {
    address private _xDomainSender;
    
    // Capture last sendMessage call
    address public lastTarget;
    bytes public lastMessage;
    uint32 public lastMinGasLimit;
    uint256 public messageCount;

    function sendMessage(
        address _target,
        bytes calldata _message,
        uint32 _minGasLimit
    ) external payable override {
        lastTarget = _target;
        lastMessage = _message;
        lastMinGasLimit = _minGasLimit;
        messageCount++;
    }

    function xDomainMessageSender() external view override returns (address) {
        return _xDomainSender;
    }

    function messageNonce() external pure override returns (uint256) {
        return 0;
    }

    function successfulMessages(bytes32) external pure override returns (bool) {
        return false;
    }

    /// @dev Test helper: set the xDomainMessageSender for auth testing
    function setXDomainSender(address _sender) external {
        _xDomainSender = _sender;
    }

    /// @dev Test helper: relay the captured message to the target
    function relayLastMessage() external {
        (bool success, bytes memory ret) = lastTarget.call(lastMessage);
        require(success, string(abi.encodePacked("Relay failed: ", ret)));
    }
}

contract PingPongTest is Test {
    MockMessenger public l1Messenger;
    MockMessenger public l2Messenger;
    PingPongL1 public l1;
    PingPongL2 public l2;

    // Events (re-declared for expectEmit)
    event PingSent(uint256 indexed pingId, bytes32 data, uint256 timestamp);
    event PongReceived(uint256 indexed pongId, bytes32 data, uint256 timestamp);
    event PingReceived(uint256 indexed pingId, bytes32 data, uint256 timestamp);
    event PongSent(uint256 indexed pongId, bytes32 data, uint256 timestamp);

    function setUp() public {
        // Deploy mock messengers
        l1Messenger = new MockMessenger();
        l2Messenger = new MockMessenger();

        // Deploy ping-pong contracts
        l1 = new PingPongL1(address(l1Messenger));

        // For L2, we need to deploy at a normal address and deal with the
        // hardcoded MESSENGER constant. We'll use etch to place a mock messenger
        // at the predeploy address.
        vm.etch(
            0x4200000000000000000000000000000000000007,
            address(l2Messenger).code
        );
        // Copy storage from l2Messenger to the predeploy address
        // (not needed for basic tests since mock starts with zero state)

        l2 = new PingPongL2();

        // Set counterparts
        l1.setCounterpart(address(l2));
        l2.setCounterpart(address(l1));
    }

    // --- Deployment Tests ---------------------------------------------------

    function test_L1DeploysCorrectly() public view {
        assertEq(address(l1.messenger()), address(l1Messenger));
        assertEq(l1.counterpart(), address(l2));
        assertEq(l1.pingsSent(), 0);
        assertEq(l1.pongsReceived(), 0);
    }

    function test_L2DeploysCorrectly() public view {
        assertEq(l2.counterpart(), address(l1));
        assertEq(l2.pingsReceived(), 0);
        assertEq(l2.autoRespond(), true);
        assertEq(l2.pongGasLimit(), 200_000);
    }

    // --- Counterpart Tests ---------------------------------------------------

    function test_CannotSetCounterpartTwice_L1() public {
        vm.expectRevert("PingPongL1: counterpart already set");
        l1.setCounterpart(address(0x1234));
    }

    function test_CannotSetCounterpartTwice_L2() public {
        vm.expectRevert("PingPongL2: counterpart already set");
        l2.setCounterpart(address(0x1234));
    }

    // --- Ping Tests ---------------------------------------------------------

    function test_PingSendsMessage() public {
        bytes32 data = keccak256("hello shadowbase");

        vm.expectEmit(true, false, false, true);
        emit PingSent(1, data, block.timestamp);

        l1.ping(data, 100_000);

        assertEq(l1.pingsSent(), 1);
        assertEq(l1Messenger.messageCount(), 1);
        assertEq(l1Messenger.lastTarget(), address(l2));
        assertEq(l1Messenger.lastMinGasLimit(), 100_000);

        // Verify the encoded message matches expected
        bytes memory expectedMsg = abi.encodeCall(PingPongL2.receivePing, (1, data));
        assertEq(l1Messenger.lastMessage(), expectedMsg);
    }

    function test_PingRequiresCounterpart() public {
        // Deploy a fresh L1 without counterpart set
        PingPongL1 fresh = new PingPongL1(address(l1Messenger));
        vm.expectRevert("PingPongL1: counterpart not set");
        fresh.ping(bytes32(0), 100_000);
    }

    function test_MultiplePingsIncrementCounter() public {
        l1.ping(keccak256("ping1"), 100_000);
        l1.ping(keccak256("ping2"), 100_000);
        l1.ping(keccak256("ping3"), 100_000);

        assertEq(l1.pingsSent(), 3);
        assertEq(l1Messenger.messageCount(), 3);
    }

    // --- ReceivePong Tests ---------------------------------------------------

    function test_ReceivePongUpdatesState() public {
        bytes32 data = keccak256("pong data");

        // Set up: pretend the messenger is calling us
        l1Messenger.setXDomainSender(address(l2));

        vm.expectEmit(true, false, false, true);
        emit PongReceived(42, data, block.timestamp);

        // Call receivePong as the messenger
        vm.prank(address(l1Messenger));
        l1.receivePong(42, data);

        assertEq(l1.pongsReceived(), 1);
        assertEq(l1.lastPongData(), data);
        assertEq(l1.lastPongTimestamp(), block.timestamp);
    }

    function test_ReceivePongRejectsNonMessenger() public {
        vm.expectRevert("PingPongL1: caller is not messenger");
        l1.receivePong(1, bytes32(0));
    }

    function test_ReceivePongRejectsWrongCounterpart() public {
        l1Messenger.setXDomainSender(address(0xBEEF));

        vm.prank(address(l1Messenger));
        vm.expectRevert("PingPongL1: wrong counterpart");
        l1.receivePong(1, bytes32(0));
    }

    // --- ReceivePing Tests (L2 side) ---------------------------------------

    function test_ReceivePingUpdatesState() public {
        bytes32 data = keccak256("ping from L1");

        // The L2 messenger is at the predeploy address
        address messengerAddr = 0x4200000000000000000000000000000000000007;

        // Set xDomainMessageSender on the predeploy
        MockMessenger(messengerAddr).setXDomainSender(address(l1));

        vm.expectEmit(true, false, false, true);
        emit PingReceived(7, data, block.timestamp);

        // Call receivePing as the L2 messenger
        vm.prank(messengerAddr);
        l2.receivePing(7, data);

        assertEq(l2.pingsReceived(), 1);
        assertEq(l2.lastPingData(), data);
        assertEq(l2.lastPingTimestamp(), block.timestamp);
    }

    function test_ReceivePingAutoResponds() public {
        bytes32 data = keccak256("auto respond test");
        address messengerAddr = 0x4200000000000000000000000000000000000007;

        MockMessenger(messengerAddr).setXDomainSender(address(l1));

        vm.prank(messengerAddr);
        l2.receivePing(1, data);

        // Check that a pong was sent via the messenger
        assertEq(MockMessenger(messengerAddr).messageCount(), 1);
        assertEq(MockMessenger(messengerAddr).lastTarget(), address(l1));

        bytes memory expectedPong = abi.encodeCall(PingPongL1.receivePong, (1, data));
        assertEq(MockMessenger(messengerAddr).lastMessage(), expectedPong);
    }

    function test_ReceivePingNoAutoRespondWhenDisabled() public {
        address messengerAddr = 0x4200000000000000000000000000000000000007;
        MockMessenger(messengerAddr).setXDomainSender(address(l1));

        l2.setAutoRespond(false);

        vm.prank(messengerAddr);
        l2.receivePing(1, keccak256("no auto"));

        // No message should have been sent
        assertEq(MockMessenger(messengerAddr).messageCount(), 0);
        assertEq(l2.pingsReceived(), 1);
    }

    function test_ReceivePingRejectsNonMessenger() public {
        vm.expectRevert("PingPongL2: caller is not messenger");
        l2.receivePing(1, bytes32(0));
    }

    function test_ReceivePingRejectsWrongCounterpart() public {
        address messengerAddr = 0x4200000000000000000000000000000000000007;
        MockMessenger(messengerAddr).setXDomainSender(address(0xDEAD));

        vm.prank(messengerAddr);
        vm.expectRevert("PingPongL2: wrong counterpart");
        l2.receivePing(1, bytes32(0));
    }

    // --- Manual Pong Test ---------------------------------------------------

    function test_ManualPong() public {
        bytes32 data = keccak256("manual pong");
        address messengerAddr = 0x4200000000000000000000000000000000000007;

        vm.expectEmit(true, false, false, true);
        emit PongSent(99, data, block.timestamp);

        l2.manualPong(99, data);

        assertEq(MockMessenger(messengerAddr).messageCount(), 1);
    }

    function test_ManualPongRequiresCounterpart() public {
        PingPongL2 fresh = new PingPongL2();
        vm.expectRevert("PingPongL2: counterpart not set");
        fresh.manualPong(1, bytes32(0));
    }

    // --- Configuration Tests ------------------------------------------------

    function test_SetAutoRespond() public {
        assertEq(l2.autoRespond(), true);
        l2.setAutoRespond(false);
        assertEq(l2.autoRespond(), false);
        l2.setAutoRespond(true);
        assertEq(l2.autoRespond(), true);
    }

    function test_SetPongGasLimit() public {
        assertEq(l2.pongGasLimit(), 200_000);
        l2.setPongGasLimit(500_000);
        assertEq(l2.pongGasLimit(), 500_000);
    }

    // --- Full Round Trip Simulation ------------------------------------------

    function test_FullRoundTrip() public {
        bytes32 data = keccak256("round trip test");
        address messengerAddr = 0x4200000000000000000000000000000000000007;

        // Step 1: L1 sends ping
        l1.ping(data, 100_000);
        assertEq(l1.pingsSent(), 1);

        // Step 2: Simulate L2 receiving the ping (messenger relays)
        MockMessenger(messengerAddr).setXDomainSender(address(l1));
        vm.prank(messengerAddr);
        l2.receivePing(1, data);
        assertEq(l2.pingsReceived(), 1);

        // Step 3: L2 auto-responded with pong  - verify pong message was sent
        bytes memory pongMsg = MockMessenger(messengerAddr).lastMessage();
        assertEq(pongMsg, abi.encodeCall(PingPongL1.receivePong, (1, data)));

        // Step 4: Simulate L1 receiving the pong
        l1Messenger.setXDomainSender(address(l2));
        vm.prank(address(l1Messenger));
        l1.receivePong(1, data);
        assertEq(l1.pongsReceived(), 1);
        assertEq(l1.lastPongData(), data);

        // Full round trip complete!
    }
}
