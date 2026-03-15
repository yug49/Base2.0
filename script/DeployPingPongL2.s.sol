// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "forge-std/Script.sol";
import {PingPongL2} from "../contracts/test/PingPong.sol";

contract DeployPingPongL2 is Script {
    function run() external {
        vm.startBroadcast();
        PingPongL2 pingPong = new PingPongL2();
        console.log("PingPongL2 deployed at:", address(pingPong));
        vm.stopBroadcast();
    }
}
