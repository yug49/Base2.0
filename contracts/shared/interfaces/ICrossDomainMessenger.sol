// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;
pragma abicoder v2;

// ============================================================================
// ShadowBase  - ICrossDomainMessenger Interface
// OP Stack's CrossDomainMessenger interface for L1 <-> L2 message passing.
// Used by PrivacyBridge (L2), L1Companion (L1), and PingPong test contracts.
//
// L1: CrossDomainMessenger deployed by Yug on Sepolia (address TBD)
// L2: Predeploy at 0x4200000000000000000000000000000000000007
// ============================================================================

interface ICrossDomainMessenger {
    /// @notice Sends a cross domain message to the target messenger.
    /// @param _target  Target contract address.
    /// @param _message Message to send to the target.
    /// @param _minGasLimit Minimum gas limit that the message can be executed with.
    function sendMessage(
        address _target,
        bytes calldata _message,
        uint32 _minGasLimit
    ) external payable;

    /// @notice Retrieves the address of the contract or wallet that initiated the
    ///         currently executing message on the other chain. Will throw an error if
    ///         there is no message currently being executed. Allows the recipient of a
    ///         call to see who triggered it.
    /// @return Address of the sender of the currently executing message on the other chain.
    function xDomainMessageSender() external view returns (address);

    /// @notice Retrieves the next message nonce. Message version will be added to the
    ///         upper two bytes of the message nonce. Message version allows us to treat
    ///         messages as having different structures.
    /// @return Nonce of the next message to be sent, with added message version.
    function messageNonce() external view returns (uint256);

    /// @notice Checks if a message hash has been successfully relayed.
    /// @param _msgHash Hash of the message to check.
    /// @return True if the message has been relayed.
    function successfulMessages(bytes32 _msgHash) external view returns (bool);
}
