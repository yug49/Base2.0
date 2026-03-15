// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;
pragma abicoder v2;

// ============================================================================
// ShadowBase — PrivacyRouter
// System predeploy at 0x4200000000000000000000000000000000000069
// Stores per-address privacy rules. The EVM precompile calls shouldShield()
// on every value transfer to decide whether to auto-shield into the pool.
// ============================================================================

import {IPrivacyRouter, PrivacyMode, PrivacyRules} from "../shared/interfaces/IPrivacyRouter.sol";

contract PrivacyRouter is IPrivacyRouter {
    /// @notice Privacy rules per address
    mapping(address => PrivacyRules) private _rules;

    /// @notice Sender whitelist per address (sender => true if whitelisted)
    mapping(address => mapping(address => bool)) private _senderWhitelisted;

    /// @notice Token whitelist per address (token => true if whitelisted)
    mapping(address => mapping(address => bool)) private _tokenWhitelisted;

    /// @notice Sender whitelist arrays for enumeration
    mapping(address => address[]) private _senderWhitelistArray;

    /// @notice Token whitelist arrays for enumeration
    mapping(address => address[]) private _tokenWhitelistArray;

    // ──────────────────────────────────────────────
    // Mode & Rules
    // ──────────────────────────────────────────────

    /// @inheritdoc IPrivacyRouter
    function setMode(PrivacyMode _mode) external {
        _rules[msg.sender].mode = _mode;
        emit ModeChanged(msg.sender, _mode);
    }

    /// @inheritdoc IPrivacyRouter
    function setRules(uint256 _minAmount, address[] calldata _tokenWhitelist, address[] calldata _senderWhitelist)
        external
    {
        PrivacyRules storage rules = _rules[msg.sender];
        rules.minAmount = _minAmount;

        // Clear old token whitelist
        address[] storage oldTokens = _tokenWhitelistArray[msg.sender];
        for (uint256 i = 0; i < oldTokens.length; i++) {
            _tokenWhitelisted[msg.sender][oldTokens[i]] = false;
        }
        delete _tokenWhitelistArray[msg.sender];

        // Set new token whitelist
        for (uint256 i = 0; i < _tokenWhitelist.length; i++) {
            _tokenWhitelisted[msg.sender][_tokenWhitelist[i]] = true;
        }
        _tokenWhitelistArray[msg.sender] = _tokenWhitelist;

        // Clear old sender whitelist
        address[] storage oldSenders = _senderWhitelistArray[msg.sender];
        for (uint256 i = 0; i < oldSenders.length; i++) {
            _senderWhitelisted[msg.sender][oldSenders[i]] = false;
        }
        delete _senderWhitelistArray[msg.sender];

        // Set new sender whitelist
        for (uint256 i = 0; i < _senderWhitelist.length; i++) {
            _senderWhitelisted[msg.sender][_senderWhitelist[i]] = true;
        }
        _senderWhitelistArray[msg.sender] = _senderWhitelist;

        emit RulesChanged(msg.sender, _minAmount, _tokenWhitelist, _senderWhitelist);
    }

    // ──────────────────────────────────────────────
    // Read functions
    // ──────────────────────────────────────────────

    /// @inheritdoc IPrivacyRouter
    function getRules(address _account)
        external
        view
        returns (PrivacyMode mode, uint256 minAmount, address[] memory tokenWhitelist, address[] memory senderWhitelist)
    {
        PrivacyRules storage rules = _rules[_account];
        return (rules.mode, rules.minAmount, _tokenWhitelistArray[_account], _senderWhitelistArray[_account]);
    }

    /// @inheritdoc IPrivacyRouter
    function getMode(address _account) external view returns (PrivacyMode) {
        return _rules[_account].mode;
    }

    // ──────────────────────────────────────────────
    // Decision function (called by precompile)
    // ──────────────────────────────────────────────

    /// @inheritdoc IPrivacyRouter
    function shouldShield(address _recipient, address _sender, uint256 _amount, address _token)
        external
        view
        returns (bool)
    {
        PrivacyRules storage rules = _rules[_recipient];

        // 1. PUBLIC mode → never shield
        if (rules.mode == PrivacyMode.PUBLIC) {
            return false;
        }

        // 2. AUTO_SHIELD or CUSTOM mode → evaluate rules
        // 2a. Sender is whitelisted → don't shield (keep public)
        if (_senderWhitelisted[_recipient][_sender]) {
            return false;
        }

        // 2b. Amount below minimum → don't shield
        if (_amount < rules.minAmount) {
            return false;
        }

        // 2c. Token whitelist is non-empty and token is not in it → don't shield
        if (_tokenWhitelistArray[_recipient].length > 0 && !_tokenWhitelisted[_recipient][_token]) {
            return false;
        }

        // 2d. All checks passed → shield this transfer
        return true;
    }

    // ──────────────────────────────────────────────
    // Shielded routing
    // ──────────────────────────────────────────────

    /// @notice ShieldedPool predeploy address
    address constant SHIELDED_POOL = 0x4200000000000000000000000000000000000070;

    /// @inheritdoc IPrivacyRouter
    function routeShield(address _recipient) external payable {
        require(msg.value > 0, "PrivacyRouter: zero value");
        require(
            _rules[_recipient].mode == PrivacyMode.AUTO_SHIELD || _rules[_recipient].mode == PrivacyMode.CUSTOM,
            "PrivacyRouter: recipient not shielded"
        );

        // ETH routing is handled by the Transfer hook in core/evm.go at the
        // StateDB level — it redirects the value to ShieldedPool and writes
        // pending shields, bypassing the proxy contract entirely.
        // This contract only validates and emits the event.

        emit AutoShielded(msg.sender, _recipient, msg.value);
    }

    /// @notice Accept ETH so the sequencer can route value here
    receive() external payable {}
}
