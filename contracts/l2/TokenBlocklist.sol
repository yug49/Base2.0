// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

/**
 * @title TokenBlocklist
 * @author Railgun Contributors (forked for ShadowBase)
 * @notice Blocklist for tokens that should not be shielded
 */
contract TokenBlocklist {
    mapping(address => bool) public tokenBlocklist;

    uint256[10] private __gap;
}
