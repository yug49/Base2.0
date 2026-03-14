// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

// ============================================================================
// ShadowBase  - Phase 2: L1<->L2 Ping-Pong Test Contracts
//
// Simple contracts to test OP Stack CrossDomainMessenger message passing
// between Sepolia (L1) and ShadowBase devnet (L2).
//
// PingPongL1: Deployed on Sepolia  - sends ping to L2, receives pong from L2
// PingPongL2: Deployed on L2 devnet  - receives ping from L1, sends pong back
//
// Flow:
//   1. PingPongL1.ping() -> CrossDomainMessenger -> PingPongL2.receivePing()
//   2. PingPongL2 auto-responds -> CrossDomainMessenger -> PingPongL1.receivePong()
//
// This validates the full L1->L2->L1 message round-trip before building
// the real PrivacyBridge and L1Companion.
// ============================================================================

import {ICrossDomainMessenger} from "../shared/interfaces/ICrossDomainMessenger.sol";

/// @title PingPongL1  - L1 side of the ping-pong test (deploy on Sepolia)
contract PingPongL1 {
    /// @notice The L1 CrossDomainMessenger (set after Yug deploys on Sepolia)
    ICrossDomainMessenger public immutable messenger;

    /// @notice The counterpart PingPongL2 contract address on L2
    address public counterpart;

    /// @notice Ping counter
    uint256 public pingsSent;

    /// @notice Pong counter
    uint256 public pongsReceived;

    /// @notice Last pong data received
    bytes32 public lastPongData;

    /// @notice Timestamp of last pong
    uint256 public lastPongTimestamp;

    /// @notice Emitted when a ping is sent to L2
    event PingSent(uint256 indexed pingId, bytes32 data, uint256 timestamp);

    /// @notice Emitted when a pong is received from L2
    event PongReceived(uint256 indexed pongId, bytes32 data, uint256 timestamp);

    /// @param _messenger L1 CrossDomainMessenger address on Sepolia
    constructor(address _messenger) {
        messenger = ICrossDomainMessenger(_messenger);
    }

    /// @notice Set the L2 counterpart address (call after deploying PingPongL2)
    function setCounterpart(address _counterpart) external {
        require(counterpart == address(0), "PingPongL1: counterpart already set");
        counterpart = _counterpart;
    }

    /// @notice Send a ping to L2
    /// @param _data Arbitrary 32-byte payload to echo back
    /// @param _minGasLimit Minimum gas for the L2 execution
    function ping(bytes32 _data, uint32 _minGasLimit) external {
        require(counterpart != address(0), "PingPongL1: counterpart not set");

        pingsSent++;

        // Encode the receivePing call for the L2 contract
        bytes memory message = abi.encodeCall(
            PingPongL2.receivePing,
            (pingsSent, _data)
        );

        // Send via CrossDomainMessenger
        messenger.sendMessage(counterpart, message, _minGasLimit);

        emit PingSent(pingsSent, _data, block.timestamp);
    }

    /// @notice Called by CrossDomainMessenger when L2 sends a pong back
    /// @param _pongId The pong ID (matches the ping ID)
    /// @param _data The echoed data
    function receivePong(uint256 _pongId, bytes32 _data) external {
        // Verify the call comes from the messenger
        require(
            msg.sender == address(messenger),
            "PingPongL1: caller is not messenger"
        );

        // Verify the cross-domain sender is our L2 counterpart
        require(
            messenger.xDomainMessageSender() == counterpart,
            "PingPongL1: wrong counterpart"
        );

        pongsReceived++;
        lastPongData = _data;
        lastPongTimestamp = block.timestamp;

        emit PongReceived(_pongId, _data, block.timestamp);
    }
}

/// @title PingPongL2  - L2 side of the ping-pong test (deploy on ShadowBase devnet)
contract PingPongL2 {
    /// @notice The L2 CrossDomainMessenger (predeploy at 0x4200...0007)
    ICrossDomainMessenger public constant MESSENGER =
        ICrossDomainMessenger(0x4200000000000000000000000000000000000007);

    /// @notice The counterpart PingPongL1 contract address on L1
    address public counterpart;

    /// @notice Ping counter (received from L1)
    uint256 public pingsReceived;

    /// @notice Whether to auto-respond with a pong
    bool public autoRespond;

    /// @notice Gas limit for the pong response
    uint32 public pongGasLimit;

    /// @notice Last ping data received
    bytes32 public lastPingData;

    /// @notice Timestamp of last ping
    uint256 public lastPingTimestamp;

    /// @notice Emitted when a ping is received from L1
    event PingReceived(uint256 indexed pingId, bytes32 data, uint256 timestamp);

    /// @notice Emitted when a pong is sent back to L1
    event PongSent(uint256 indexed pongId, bytes32 data, uint256 timestamp);

    constructor() {
        autoRespond = true;
        pongGasLimit = 200_000;
    }

    /// @notice Set the L1 counterpart address
    function setCounterpart(address _counterpart) external {
        require(counterpart == address(0), "PingPongL2: counterpart already set");
        counterpart = _counterpart;
    }

    /// @notice Toggle auto-respond behavior
    function setAutoRespond(bool _autoRespond) external {
        autoRespond = _autoRespond;
    }

    /// @notice Set gas limit for pong responses
    function setPongGasLimit(uint32 _gasLimit) external {
        pongGasLimit = _gasLimit;
    }

    /// @notice Called by CrossDomainMessenger when L1 sends a ping
    /// @param _pingId The ping ID
    /// @param _data The payload data
    function receivePing(uint256 _pingId, bytes32 _data) external {
        // Verify the call comes from the messenger
        require(
            msg.sender == address(MESSENGER),
            "PingPongL2: caller is not messenger"
        );

        // Verify the cross-domain sender is our L1 counterpart
        require(
            MESSENGER.xDomainMessageSender() == counterpart,
            "PingPongL2: wrong counterpart"
        );

        pingsReceived++;
        lastPingData = _data;
        lastPingTimestamp = block.timestamp;

        emit PingReceived(_pingId, _data, block.timestamp);

        // Auto-respond with pong if enabled
        if (autoRespond) {
            _sendPong(_pingId, _data);
        }
    }

    /// @notice Manually send a pong (if autoRespond is off)
    function manualPong(uint256 _pongId, bytes32 _data) external {
        require(counterpart != address(0), "PingPongL2: counterpart not set");
        _sendPong(_pongId, _data);
    }

    function _sendPong(uint256 _pongId, bytes32 _data) internal {
        bytes memory message = abi.encodeCall(
            PingPongL1.receivePong,
            (_pongId, _data)
        );

        MESSENGER.sendMessage(counterpart, message, pongGasLimit);

        emit PongSent(_pongId, _data, block.timestamp);
    }
}
