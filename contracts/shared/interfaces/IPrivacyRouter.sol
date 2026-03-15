// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;
pragma abicoder v2;

// ============================================================================
// ShadowBase — IPrivacyRouter Interface
// Shared interface for the PrivacyRouter system predeploy.
// Used by: EVM precompile (Go), ShieldedPool, PrivacyBridge, frontend.
// ============================================================================

/// @notice Privacy mode for an address
enum PrivacyMode {
    PUBLIC, // Default — normal transfers, no shielding
    AUTO_SHIELD, // All incoming transfers are auto-shielded
    CUSTOM // Shielding based on custom rules (min amount, whitelists)

}

/// @notice Privacy rules for an address
struct PrivacyRules {
    PrivacyMode mode;
    uint256 minAmount; // Only shield transfers >= this amount (0 = shield all)
        // Token and sender whitelists are stored separately in mappings for O(1) lookup
}

interface IPrivacyRouter {
    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when an address changes its privacy mode
    event ModeChanged(address indexed account, PrivacyMode mode);

    /// @notice Emitted when an address updates its privacy rules
    event RulesChanged(address indexed account, uint256 minAmount, address[] tokenWhitelist, address[] senderWhitelist);

    // ──────────────────────────────────────────────
    // Write functions
    // ──────────────────────────────────────────────

    /// @notice Set the privacy mode for msg.sender
    /// @param _mode — PUBLIC, AUTO_SHIELD, or CUSTOM
    function setMode(PrivacyMode _mode) external;

    /// @notice Set privacy rules for msg.sender
    /// @param _minAmount — minimum transfer amount to trigger shielding (0 = all)
    /// @param _tokenWhitelist — only shield these tokens (empty = all tokens)
    /// @param _senderWhitelist — never shield transfers from these senders
    function setRules(uint256 _minAmount, address[] calldata _tokenWhitelist, address[] calldata _senderWhitelist)
        external;

    // ──────────────────────────────────────────────
    // Read functions
    // ──────────────────────────────────────────────

    /// @notice Get the full privacy rules for an address
    /// @param _account — address to query
    /// @return mode — current privacy mode
    /// @return minAmount — minimum amount threshold
    /// @return tokenWhitelist — whitelisted tokens
    /// @return senderWhitelist — whitelisted senders
    function getRules(address _account)
        external
        view
        returns (PrivacyMode mode, uint256 minAmount, address[] memory tokenWhitelist, address[] memory senderWhitelist);

    /// @notice Get just the privacy mode for an address (cheaper than getRules)
    /// @param _account — address to query
    /// @return the privacy mode
    function getMode(address _account) external view returns (PrivacyMode);

    // ──────────────────────────────────────────────
    // Decision function (called by EVM precompile)
    // ──────────────────────────────────────────────

    /// @notice Determines whether a transfer should be auto-shielded
    /// @param _recipient — who is receiving the transfer
    /// @param _sender — who is sending the transfer
    /// @param _amount — transfer amount in wei
    /// @param _token — token address (address(0) for native ETH)
    /// @return true if the transfer should be routed to the shielded pool
    function shouldShield(address _recipient, address _sender, uint256 _amount, address _token)
        external
        view
        returns (bool);

    // ──────────────────────────────────────────────
    // Shielded routing (called by sequencer msg-rewrite)
    // ──────────────────────────────────────────────

    /// @notice Emitted when ETH is auto-shielded through the router
    event AutoShielded(address indexed sender, address indexed recipient, uint256 amount);

    /// @notice Route an ETH transfer to the ShieldedPool on behalf of a recipient.
    ///         Called by the sequencer's message-level rewrite when the original
    ///         tx targets a recipient with auto-shield enabled.
    /// @param _recipient — the intended recipient whose funds are being shielded
    function routeShield(address _recipient) external payable;
}
