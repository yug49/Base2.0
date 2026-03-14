// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "forge-std/Script.sol";
import {CommitmentPreimage, TokenData, TokenType, ShieldCiphertext} from "../contracts/shared/Globals.sol";

interface IL1Companion {
    function bridgeToBase(
        CommitmentPreimage calldata _destinationPreimage,
        ShieldCiphertext calldata _destinationCiphertext
    ) external payable;

    function bridgeNonce() external view returns (uint256);
}

/**
 * @title TestBridgeFlow
 * @notice Tests the L1→L2 bridge flow by calling bridgeToBase on L1Companion.
 *         Sends 0.001 ETH cross-chain to ShadowBase L2 devnet.
 *
 * Usage:
 *   forge script script/TestBridgeFlow.s.sol:TestBridgeFlow \
 *     --rpc-url <SEPOLIA_RPC> --private-key <KEY> --broadcast
 */
contract TestBridgeFlow is Script {
    // Deployed in Rajat Phase 4
    address constant L1_COMPANION = 0xC4e2b9f884BF8D06c42f4B8B6f2ce2678Aa8B43e;

    // 0.001 ETH bridge amount (must have Sepolia ETH)
    uint120 constant BRIDGE_AMOUNT = 0.001 ether;

    function run() external {
        uint256 nonceBefore = IL1Companion(L1_COMPANION).bridgeNonce();
        console.log("=== ShadowBase Bridge Flow Test (L1 -> L2) ===");
        console.log("L1Companion:  ", L1_COMPANION);
        console.log("Bridge amount:", BRIDGE_AMOUNT, "wei");
        console.log("Nonce before: ", nonceBefore);

        // Dummy NPK — recipient's shielded address nullifying public key (32 bytes)
        // In production this comes from the user's RAILGUN wallet scanning key
        bytes32 npk = 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef;

        // Native ETH preimage (tokenAddress = 0 means ETH)
        CommitmentPreimage memory preimage = CommitmentPreimage({
            npk: npk,
            token: TokenData({
                tokenType: TokenType.ERC20,
                tokenAddress: address(0), // ETH
                tokenSubID: 0
            }),
            value: BRIDGE_AMOUNT
        });

        // Dummy ciphertext (zeroed — in production from RAILGUN wallet encryption)
        ShieldCiphertext memory ciphertext = ShieldCiphertext({
            encryptedBundle: [bytes32(0), bytes32(0), bytes32(0)],
            shieldKey: bytes32(0)
        });

        vm.startBroadcast();
        IL1Companion(L1_COMPANION).bridgeToBase{value: BRIDGE_AMOUNT}(preimage, ciphertext);
        vm.stopBroadcast();

        uint256 nonceAfter = IL1Companion(L1_COMPANION).bridgeNonce();
        console.log("Nonce after:  ", nonceAfter);
        console.log("Bridge message dispatched to L2 via CrossDomainMessenger!");
        console.log("L2 will receive: PrivacyBridge.receiveFromL1(commitmentHash, nonce, preimage, ciphertext)");
        console.log("Check Sepolia Etherscan for the L1CrossDomainMessenger SentMessage event.");
    }
}
