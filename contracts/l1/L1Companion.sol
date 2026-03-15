// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;
pragma abicoder v2;

// ============================================================================
// ShadowBase — L1Companion
// Deployed on Ethereum Sepolia. Connects ShadowBase L2 ↔ RAILGUN Sepolia.
//
// Flows:
//   receiveFromBase: PrivacyBridge on L2 calls bridgeToL1() →
//                    CrossDomainMessenger relays to L1Companion →
//                    L1Companion deposits into RAILGUN Sepolia via shield()
//
//   bridgeToBase:    User calls bridgeToBase() on L1 →
//                    L1Companion sends cross-chain message to PrivacyBridge →
//                    PrivacyBridge creates commitment in L2 ShieldedPool
//
// Key insight from Phase 2 probe:
//   - RAILGUN shield() calls transferTokenIn() → ERC20.safeTransferFrom()
//   - For native ETH: wrap to WETH first, approve RAILGUN, then shield WETH
//   - Commitment hash: PoseidonT4(npk, tokenID, value) — matches L2 ShieldedPool
//   - RAILGUN has 25bp shield fee (deducted from value)
// ============================================================================

import {ICrossDomainMessenger} from "../shared/interfaces/ICrossDomainMessenger.sol";
import {
    CommitmentPreimage,
    ShieldCiphertext,
    ShieldRequest,
    TokenType,
    TokenData,
    SNARK_SCALAR_FIELD
} from "../shared/Globals.sol";

/// @notice Minimal WETH interface (Sepolia WETH)
interface IWETH {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function withdraw(uint256 amount) external;
}

/// @notice Minimal interface for RAILGUN's shield function on L1 Sepolia
interface IRailgunSmartWallet {
    function shield(ShieldRequest[] calldata _shieldRequests) external;
    function getFee(uint136 _amount, bool _isInclusive, uint120 _feeBP)
        external
        pure
        returns (uint120, uint120);
    function shieldFee() external view returns (uint120);
    function merkleRoot() external view returns (bytes32);
    function treeNumber() external view returns (uint256);
    function nextLeafIndex() external view returns (uint256);
}

/// @notice Minimal ERC20 interface for token approvals
interface IERC20Minimal {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract L1Companion {
    // ──────────────────────────────────────────────
    // Constants & Immutables
    // ──────────────────────────────────────────────

    /// @notice RAILGUN Sepolia contract (existing deployment)
    IRailgunSmartWallet public immutable RAILGUN;

    /// @notice L1 CrossDomainMessenger (OP Stack, deployed by Yug on Sepolia)
    ICrossDomainMessenger public immutable MESSENGER;

    /// @notice WETH on Sepolia (for wrapping native ETH before RAILGUN shield)
    IWETH public immutable WETH;

    /// @notice PrivacyBridge predeploy address on L2 ShadowBase
    address public constant PRIVACY_BRIDGE_L2 = 0x4200000000000000000000000000000000000071;

    /// @notice Gas limit for cross-chain messages to L2
    uint32 public constant L2_GAS_LIMIT = 500_000;

    /// @notice Gas limit for cross-chain messages from L2 to L1
    uint32 public constant L1_GAS_LIMIT = 300_000;

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    /// @notice Admin (deployer)
    address public admin;

    /// @notice Bridge nonce for L1→L2 replay protection
    uint256 public bridgeNonce;

    /// @notice Track processed L2→L1 messages (messageHash → processed)
    mapping(bytes32 => bool) public processedMessages;

    /// @notice Pause flag for emergency stops
    bool public paused;

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when funds arrive from L2 and are deposited into RAILGUN
    event ReceivedFromBase(
        bytes32 indexed commitmentHash,
        uint256 indexed nonce,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice Emitted when a user bridges funds from L1 RAILGUN to L2 ShadowBase
    event BridgeToBaseInitiated(
        uint256 indexed nonce,
        bytes32 indexed commitmentHash,
        address indexed sender,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice Emitted when RAILGUN shield is executed for a bridge-in
    event RailgunShieldExecuted(
        bytes32 indexed commitmentHash,
        address token,
        uint256 amount,
        uint256 railgunFee
    );

    // ──────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────

    /// @notice Ensures the call is from L1 CrossDomainMessenger
    ///         AND the original sender on L2 is the PrivacyBridge
    modifier onlyFromL2Bridge() {
        require(
            msg.sender == address(MESSENGER),
            "L1Companion: caller is not the messenger"
        );
        require(
            MESSENGER.xDomainMessageSender() == PRIVACY_BRIDGE_L2,
            "L1Companion: sender is not PrivacyBridge"
        );
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "L1Companion: caller is not admin");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "L1Companion: paused");
        _;
    }

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    /// @param _railgun RAILGUN Sepolia contract address
    /// @param _messenger L1 CrossDomainMessenger address on Sepolia
    /// @param _weth WETH contract address on Sepolia
    constructor(address _railgun, address _messenger, address _weth) {
        require(_railgun != address(0), "L1Companion: zero railgun");
        require(_messenger != address(0), "L1Companion: zero messenger");
        require(_weth != address(0), "L1Companion: zero weth");

        RAILGUN = IRailgunSmartWallet(_railgun);
        MESSENGER = ICrossDomainMessenger(_messenger);
        WETH = IWETH(_weth);
        admin = msg.sender;

        // Pre-approve RAILGUN to spend WETH (max approval for gas efficiency)
        IWETH(_weth).approve(_railgun, type(uint256).max);
    }

    // ════════════════════════════════════════════════
    // Flow 1: L2 → L1 (PrivacyBridge → L1Companion → RAILGUN Sepolia)
    // ════════════════════════════════════════════════

    /**
     * @notice Receive bridged funds from ShadowBase and deposit into RAILGUN Sepolia
     * @dev Called by CrossDomainMessenger when PrivacyBridge.bridgeToL1() is executed on L2.
     *      The commitment is recreated in RAILGUN's Merkle tree on L1.
     *
     *      For ETH bridging: L2 locks ETH in bridge, this contract wraps ETH→WETH
     *      and shields WETH into RAILGUN.
     *
     * @param _commitmentHash - pre-computed commitment hash from L2
     * @param _nonce - bridge nonce for replay protection
     * @param _preimage - commitment preimage (npk, token, value) for RAILGUN shield
     * @param _ciphertext - encrypted data for recipient's RAILGUN wallet scanning
     */
    function receiveFromBase(
        bytes32 _commitmentHash,
        uint256 _nonce,
        CommitmentPreimage calldata _preimage,
        ShieldCiphertext calldata _ciphertext
    ) external payable onlyFromL2Bridge whenNotPaused {
        // 1. Replay protection
        bytes32 messageHash = keccak256(abi.encode(_commitmentHash, _nonce));
        require(!processedMessages[messageHash], "L1Companion: message already processed");
        processedMessages[messageHash] = true;

        uint256 amount = uint256(_preimage.value);

        // 2. Handle the deposit into RAILGUN based on token type
        if (_preimage.token.tokenAddress == address(0)) {
            // Native ETH bridging: wrap to WETH, then shield into RAILGUN
            _shieldETHToRailgun(_commitmentHash, _preimage, _ciphertext, amount);
        } else {
            // ERC20 bridging: the tokens must already be in this contract
            // (transferred separately or escrowed)
            _shieldERC20ToRailgun(_commitmentHash, _preimage, _ciphertext);
        }

        emit ReceivedFromBase(_commitmentHash, _nonce, amount, block.timestamp);
    }

    // ════════════════════════════════════════════════
    // Flow 2: L1 → L2 (User on L1 → L1Companion → PrivacyBridge on L2)
    // ════════════════════════════════════════════════

    /**
     * @notice Bridge funds from L1 to ShadowBase L2 ShieldedPool
     * @dev User deposits ETH (or ERC20) on L1, and a cross-chain message is sent
     *      to PrivacyBridge on L2 which creates a new commitment in ShieldedPool.
     *
     *      For ETH: user sends ETH with this call (msg.value)
     *      For ERC20: user must approve this contract first, tokens are pulled
     *
     * @param _destinationPreimage - commitment preimage for L2 ShieldedPool
     *        (npk = recipient's RAILGUN public key on L2, value = amount)
     * @param _destinationCiphertext - encrypted data for L2 recipient wallet scanning
     */
    function bridgeToBase(
        CommitmentPreimage calldata _destinationPreimage,
        ShieldCiphertext calldata _destinationCiphertext
    ) external payable whenNotPaused {
        uint256 amount = uint256(_destinationPreimage.value);
        require(amount > 0, "L1Companion: zero amount");

        if (_destinationPreimage.token.tokenAddress == address(0)) {
            // Native ETH → L2
            require(msg.value == amount, "L1Companion: ETH amount mismatch");
        } else {
            // ERC20 → L2: pull tokens from sender (held in escrow by this contract)
            require(msg.value == 0, "L1Companion: no ETH for ERC20 bridge");
            IERC20Minimal token = IERC20Minimal(_destinationPreimage.token.tokenAddress);
            bool success = token.transferFrom(msg.sender, address(this), amount);
            require(success, "L1Companion: ERC20 transfer failed");
        }

        // Compute commitment hash (must match PrivacyBridge._hashCommitment on L2)
        bytes32 commitmentHash = _hashCommitment(_destinationPreimage);

        // Increment nonce
        uint256 nonce = bridgeNonce++;

        // Encode the message for PrivacyBridge.receiveFromL1()
        bytes memory message = abi.encodeWithSignature(
            "receiveFromL1(bytes32,uint256,(bytes32,(uint8,address,uint256),uint120),(bytes32[3],bytes32))",
            commitmentHash,
            nonce,
            _destinationPreimage,
            _destinationCiphertext
        );

        // Send cross-chain message to PrivacyBridge via L1 CrossDomainMessenger
        MESSENGER.sendMessage(
            PRIVACY_BRIDGE_L2,
            message,
            L2_GAS_LIMIT
        );

        emit BridgeToBaseInitiated(
            nonce,
            commitmentHash,
            msg.sender,
            amount,
            block.timestamp
        );
    }

    // ════════════════════════════════════════════════
    // Internal — RAILGUN Shield Helpers
    // ════════════════════════════════════════════════

    /**
     * @notice Wrap ETH to WETH and shield into RAILGUN Sepolia
     * @dev RAILGUN's shield() expects ERC20 tokens. For native ETH:
     *      1. Wrap ETH → WETH
     *      2. Approve RAILGUN to spend WETH (done in constructor, max approval)
     *      3. Call RAILGUN.shield() with WETH as the token
     *
     *      The commitment preimage is adapted: token.tokenAddress = WETH address
     */
    function _shieldETHToRailgun(
        bytes32 _commitmentHash,
        CommitmentPreimage calldata _preimage,
        ShieldCiphertext calldata _ciphertext,
        uint256 _amount
    ) internal {
        // Wrap ETH → WETH
        // Note: ETH comes with the cross-chain message via OptimismPortal
        // For hackathon MVP, we use contract's ETH balance
        require(address(this).balance >= _amount, "L1Companion: insufficient ETH");
        WETH.deposit{value: _amount}();

        // Build the shield request with WETH as the token (not address(0))
        // RAILGUN doesn't support native ETH — must use WETH
        CommitmentPreimage memory wethPreimage = CommitmentPreimage({
            npk: _preimage.npk,
            token: TokenData({
                tokenType: TokenType.ERC20,
                tokenAddress: address(WETH),
                tokenSubID: 0
            }),
            value: _preimage.value
        });

        ShieldRequest[] memory requests = new ShieldRequest[](1);
        requests[0] = ShieldRequest({
            preimage: wethPreimage,
            ciphertext: _ciphertext
        });

        // Shield into RAILGUN (WETH approval already set in constructor)
        RAILGUN.shield(requests);

        // Get the fee that was deducted
        uint120 shieldFee = RAILGUN.shieldFee();
        (, uint120 fee) = RAILGUN.getFee(uint136(_amount), true, shieldFee);

        emit RailgunShieldExecuted(
            _commitmentHash,
            address(WETH),
            _amount,
            fee
        );
    }

    /**
     * @notice Shield ERC20 tokens into RAILGUN Sepolia
     * @dev For ERC20 bridging:
     *      1. Tokens must already be in this contract
     *      2. Approve RAILGUN to spend tokens
     *      3. Call RAILGUN.shield()
     */
    function _shieldERC20ToRailgun(
        bytes32 _commitmentHash,
        CommitmentPreimage calldata _preimage,
        ShieldCiphertext calldata _ciphertext
    ) internal {
        address tokenAddr = _preimage.token.tokenAddress;
        uint256 amount = uint256(_preimage.value);

        // Approve RAILGUN to spend the tokens
        IERC20Minimal token = IERC20Minimal(tokenAddr);
        require(token.balanceOf(address(this)) >= amount, "L1Companion: insufficient token balance");
        token.approve(address(RAILGUN), amount);

        // Build shield request
        ShieldRequest[] memory requests = new ShieldRequest[](1);
        requests[0] = ShieldRequest({
            preimage: _preimage,
            ciphertext: _ciphertext
        });

        // Shield into RAILGUN
        RAILGUN.shield(requests);

        // Get the fee
        uint120 shieldFee = RAILGUN.shieldFee();
        (, uint120 fee) = RAILGUN.getFee(uint136(amount), true, shieldFee);

        emit RailgunShieldExecuted(
            _commitmentHash,
            tokenAddr,
            amount,
            fee
        );
    }

    // ════════════════════════════════════════════════
    // Internal — Commitment Hashing
    // ════════════════════════════════════════════════

    /**
     * @notice Hash a commitment preimage (must match PrivacyBridge._hashCommitment on L2)
     * @dev Uses keccak256 matching the L2 bridge. Both sides MUST use the same function.
     *      Note: This is a placeholder hash. Real RAILGUN uses PoseidonT4 — but for
     *      bridge messages the hash just needs to be consistent between L1 and L2.
     *      The actual RAILGUN deposit uses RAILGUN's own internal hashing.
     */
    function _hashCommitment(CommitmentPreimage calldata _preimage) internal pure returns (bytes32) {
        return bytes32(
            uint256(
                keccak256(
                    abi.encode(
                        _preimage.npk,
                        _preimage.token.tokenType,
                        _preimage.token.tokenAddress,
                        _preimage.token.tokenSubID,
                        _preimage.value
                    )
                )
            ) % SNARK_SCALAR_FIELD
        );
    }

    // ════════════════════════════════════════════════
    // View Functions
    // ════════════════════════════════════════════════

    /// @notice Check if a bridge message has been processed
    function isMessageProcessed(bytes32 _commitmentHash, uint256 _nonce) external view returns (bool) {
        return processedMessages[keccak256(abi.encode(_commitmentHash, _nonce))];
    }

    /// @notice Get RAILGUN state for debugging
    function getRailgunState() external view returns (
        bytes32 root,
        uint256 tree,
        uint256 leafIndex,
        uint120 fee
    ) {
        root = RAILGUN.merkleRoot();
        tree = RAILGUN.treeNumber();
        leafIndex = RAILGUN.nextLeafIndex();
        fee = RAILGUN.shieldFee();
    }

    // ════════════════════════════════════════════════
    // Admin
    // ════════════════════════════════════════════════

    /// @notice Pause the bridge (emergency)
    function pause() external onlyAdmin {
        paused = true;
    }

    /// @notice Unpause the bridge
    function unpause() external onlyAdmin {
        paused = false;
    }

    /// @notice Transfer admin role
    function transferAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "L1Companion: zero address");
        admin = _newAdmin;
    }

    /// @notice Approve a token for RAILGUN spending (in case max approval expires or new token)
    function approveTokenForRailgun(address _token, uint256 _amount) external onlyAdmin {
        IERC20Minimal(_token).approve(address(RAILGUN), _amount);
    }

    /// @notice Rescue stuck tokens (emergency recovery)
    function rescueTokens(address _token, address _to, uint256 _amount) external onlyAdmin {
        IERC20Minimal(_token).transfer(_to, _amount);
    }

    /// @notice Rescue stuck ETH (emergency recovery)
    function rescueETH(address payable _to, uint256 _amount) external onlyAdmin {
        (bool sent,) = _to.call{value: _amount}("");
        require(sent, "L1Companion: ETH transfer failed");
    }

    // Accept ETH deposits (for bridging and wrapping)
    receive() external payable {}
}
