// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "forge-std/Script.sol";
import {L1Companion} from "../contracts/l1/L1Companion.sol";

/**
 * @title DeployL1Companion
 * @notice Deploys L1Companion to Sepolia, connected to:
 *   - RAILGUN Sepolia: 0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea
 *   - L1CrossDomainMessenger: 0x579aaf4e08b072b3b53148a260913837518a0ab8
 *   - WETH Sepolia: 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9
 *
 * Usage:
 *   forge script script/DeployL1Companion.s.sol:DeployL1Companion \
 *     --rpc-url $SEPOLIA_RPC_URL \
 *     --private-key $DEPLOYER_PRIVATE_KEY \
 *     --broadcast --verify \
 *     --etherscan-api-key $ETHERSCAN_API_KEY
 */
contract DeployL1Companion is Script {
    // RAILGUN Sepolia (existing deployment — verified in Phase 1 & 2)
    address constant RAILGUN_SEPOLIA = 0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea;

    // L1CrossDomainMessengerProxy on Sepolia (deployed by Yug in Phase 1)
    address constant L1_CROSS_DOMAIN_MESSENGER = 0x579AAF4e08B072B3b53148A260913837518A0AB8;

    // WETH on Sepolia
    address constant WETH_SEPOLIA = 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;

    function run() external {
        vm.startBroadcast();

        L1Companion companion = new L1Companion(
            RAILGUN_SEPOLIA,
            L1_CROSS_DOMAIN_MESSENGER,
            WETH_SEPOLIA
        );

        console.log("=== L1Companion Deployed ===");
        console.log("  Address:    ", address(companion));
        console.log("  RAILGUN:    ", address(companion.RAILGUN()));
        console.log("  Messenger:  ", address(companion.MESSENGER()));
        console.log("  WETH:       ", address(companion.WETH()));
        console.log("  Admin:      ", companion.admin());
        console.log("  Bridge L2:  ", companion.PRIVACY_BRIDGE_L2());

        vm.stopBroadcast();
    }
}
