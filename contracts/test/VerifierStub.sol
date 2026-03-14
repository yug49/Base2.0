// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;
pragma abicoder v2;

// ============================================================================
// ShadowBase — VerifierStub for testing
// Wraps Verifier with a constructor that calls OwnableUpgradeable.__Ownable_init()
// so we can deploy it in Foundry tests without a proxy.
// ============================================================================

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Verifier} from "../l1/Verifier.sol";

contract VerifierStub is Verifier {
    /// @dev Mimics proxy initialization in a non-proxy deployment for testing
    function initializeStub() external initializer {
        OwnableUpgradeable.__Ownable_init(msg.sender);
    }
}
