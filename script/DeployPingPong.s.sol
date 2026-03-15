// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "forge-std/Script.sol";
import {PingPongL1} from "../contracts/test/PingPong.sol";

/**
 * @title DeployPingPong
 * @notice Deploys PingPongL1 to Sepolia using the real L1CrossDomainMessengerProxy
 *
 * Usage:
 *   forge script script/DeployPingPong.s.sol:DeployPingPong \
 *     --rpc-url https://eth-sepolia.g.alchemy.com/v2/<KEY> \
 *     --private-key <DEPLOYER_PK> \
 *     --broadcast --verify
 */
contract DeployPingPong is Script {
    // L1CrossDomainMessengerProxy on Sepolia — from Yug's deployment
    address constant L1_CROSS_DOMAIN_MESSENGER = 0x579AAF4e08B072B3b53148A260913837518A0AB8;

    function run() external {
        vm.startBroadcast();

        PingPongL1 pingPong = new PingPongL1(L1_CROSS_DOMAIN_MESSENGER);

        console.log("PingPongL1 deployed at:", address(pingPong));
        console.log("  messenger:", address(pingPong.messenger()));

        vm.stopBroadcast();
    }
}
