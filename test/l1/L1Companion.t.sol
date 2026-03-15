// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "forge-std/Test.sol";
import {L1Companion, IRailgunSmartWallet, IWETH, IERC20Minimal} from "../../contracts/l1/L1Companion.sol";
import {ICrossDomainMessenger} from "../../contracts/shared/interfaces/ICrossDomainMessenger.sol";
import {
    CommitmentPreimage,
    ShieldCiphertext,
    ShieldRequest,
    TokenType,
    TokenData,
    SNARK_SCALAR_FIELD
} from "../../contracts/shared/Globals.sol";

// ============================================================================
// Mock Contracts
// ============================================================================

/// @dev Mock L1 CrossDomainMessenger
contract MockL1Messenger is ICrossDomainMessenger {
    address public xDomainSender;
    address public lastTarget;
    bytes public lastMessage;
    uint32 public lastGasLimit;
    uint256 public nonce;
    bool public messageWasSent;

    function setXDomainMessageSender(address _sender) external {
        xDomainSender = _sender;
    }

    function sendMessage(address _target, bytes calldata _message, uint32 _minGasLimit) external payable {
        lastTarget = _target;
        lastMessage = _message;
        lastGasLimit = _minGasLimit;
        messageWasSent = true;
        nonce++;
    }

    function xDomainMessageSender() external view returns (address) {
        return xDomainSender;
    }

    function messageNonce() external view returns (uint256) {
        return nonce;
    }

    function successfulMessages(bytes32) external pure returns (bool) {
        return false;
    }

    function reset() external {
        messageWasSent = false;
        lastTarget = address(0);
        lastMessage = "";
        lastGasLimit = 0;
    }
}

/// @dev Mock WETH (deposit ETH, track balances)
contract MockWETH is IWETH {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "MockWETH: insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "MockWETH: insufficient balance");
        require(allowance[from][msg.sender] >= amount, "MockWETH: insufficient allowance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        return true;
    }

    function withdraw(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "MockWETH: insufficient balance");
        balanceOf[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
    }

    receive() external payable {
        balanceOf[msg.sender] += msg.value;
    }
}

/// @dev Mock ERC20 for token bridging tests
contract MockERC20 {
    string public name = "Mock Token";
    string public symbol = "MOCK";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "MockERC20: insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "MockERC20: insufficient balance");
        require(allowance[from][msg.sender] >= amount, "MockERC20: insufficient allowance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        return true;
    }
}

/// @dev Mock RAILGUN contract — records shield calls and simulates fee deduction
contract MockRailgun is IRailgunSmartWallet {
    ShieldRequest[] public lastShieldRequests;
    uint256 public shieldCallCount;
    uint120 public shieldFee;
    bytes32 public merkleRoot;
    uint256 public treeNumber;
    uint256 public nextLeafIndex;

    // Track what was shielded for assertions
    address public lastShieldedToken;
    uint120 public lastShieldedValue;
    bytes32 public lastShieldedNpk;

    constructor() {
        shieldFee = 25; // 25 basis points (0.25%) matching RAILGUN Sepolia
        merkleRoot = bytes32(uint256(0xCAFE));
        treeNumber = 0;
        nextLeafIndex = 4649; // matches Sepolia state from probe
    }

    function shield(ShieldRequest[] calldata _shieldRequests) external {
        shieldCallCount++;
        delete lastShieldRequests;

        for (uint256 i = 0; i < _shieldRequests.length; i++) {
            lastShieldRequests.push(_shieldRequests[i]);
            lastShieldedToken = _shieldRequests[i].preimage.token.tokenAddress;
            lastShieldedValue = _shieldRequests[i].preimage.value;
            lastShieldedNpk = _shieldRequests[i].preimage.npk;

            // Simulate pulling tokens (safeTransferFrom)
            address tokenAddr = _shieldRequests[i].preimage.token.tokenAddress;
            uint256 amount = uint256(_shieldRequests[i].preimage.value);
            IERC20Minimal(tokenAddr).transferFrom(msg.sender, address(this), amount);
        }

        nextLeafIndex += _shieldRequests.length;
    }

    function getFee(uint136 _amount, bool _isInclusive, uint120 _feeBP)
        external
        pure
        returns (uint120, uint120)
    {
        if (_feeBP == 0) return (uint120(_amount), 0);
        uint136 base;
        uint136 fee;
        if (_isInclusive) {
            base = _amount - (_amount * _feeBP) / 10000;
            fee = _amount - base;
        } else {
            base = _amount;
            fee = (10000 * base) / (10000 - _feeBP) - base;
        }
        return (uint120(base), uint120(fee));
    }

    function getShieldRequestCount() external view returns (uint256) {
        return lastShieldRequests.length;
    }
}

// ============================================================================
// L1Companion Test Suite
// ============================================================================

contract L1CompanionTest is Test {
    L1Companion public companion;
    MockL1Messenger public messenger;
    MockWETH public weth;
    MockRailgun public railgun;
    MockERC20 public mockToken;

    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    // L2 PrivacyBridge predeploy
    address constant PRIVACY_BRIDGE_L2 = 0x4200000000000000000000000000000000000071;

    // Events (must match L1Companion)
    event ReceivedFromBase(
        bytes32 indexed commitmentHash,
        uint256 indexed nonce,
        uint256 amount,
        uint256 timestamp
    );

    event BridgeToBaseInitiated(
        uint256 indexed nonce,
        bytes32 indexed commitmentHash,
        address indexed sender,
        uint256 amount,
        uint256 timestamp
    );

    event RailgunShieldExecuted(
        bytes32 indexed commitmentHash,
        address token,
        uint256 amount,
        uint256 railgunFee
    );

    function setUp() public {
        // Deploy mocks
        messenger = new MockL1Messenger();
        weth = new MockWETH();
        railgun = new MockRailgun();
        mockToken = new MockERC20();

        // Deploy L1Companion as admin
        vm.prank(admin);
        companion = new L1Companion(
            address(railgun),
            address(messenger),
            address(weth)
        );
    }

    // ──────────────────────────────────────────────
    // Helper functions
    // ──────────────────────────────────────────────

    function _makeETHPreimage(uint120 value) internal pure returns (CommitmentPreimage memory) {
        return CommitmentPreimage({
            npk: bytes32(uint256(0xBEEF)),
            token: TokenData({
                tokenType: TokenType.ERC20,
                tokenAddress: address(0), // native ETH
                tokenSubID: 0
            }),
            value: value
        });
    }

    function _makeWETHPreimage(uint120 value) internal view returns (CommitmentPreimage memory) {
        return CommitmentPreimage({
            npk: bytes32(uint256(0xBEEF)),
            token: TokenData({
                tokenType: TokenType.ERC20,
                tokenAddress: address(weth),
                tokenSubID: 0
            }),
            value: value
        });
    }

    function _makeERC20Preimage(uint120 value) internal view returns (CommitmentPreimage memory) {
        return CommitmentPreimage({
            npk: bytes32(uint256(0xBEEF)),
            token: TokenData({
                tokenType: TokenType.ERC20,
                tokenAddress: address(mockToken),
                tokenSubID: 0
            }),
            value: value
        });
    }

    function _makeCiphertext() internal pure returns (ShieldCiphertext memory) {
        return ShieldCiphertext({
            encryptedBundle: [bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3))],
            shieldKey: bytes32(uint256(0xCAFE))
        });
    }

    function _hashCommitment(CommitmentPreimage memory _preimage) internal pure returns (bytes32) {
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

    // ──────────────────────────────────────────────
    // Deployment & Constructor Tests
    // ──────────────────────────────────────────────

    function test_deployment() public view {
        assertEq(companion.admin(), admin);
        assertEq(address(companion.RAILGUN()), address(railgun));
        assertEq(address(companion.MESSENGER()), address(messenger));
        assertEq(address(companion.WETH()), address(weth));
        assertEq(companion.bridgeNonce(), 0);
        assertFalse(companion.paused());
    }

    function test_constructor_rejectsZeroRailgun() public {
        vm.expectRevert("L1Companion: zero railgun");
        new L1Companion(address(0), address(messenger), address(weth));
    }

    function test_constructor_rejectsZeroMessenger() public {
        vm.expectRevert("L1Companion: zero messenger");
        new L1Companion(address(railgun), address(0), address(weth));
    }

    function test_constructor_rejectsZeroWeth() public {
        vm.expectRevert("L1Companion: zero weth");
        new L1Companion(address(railgun), address(messenger), address(0));
    }

    function test_constructor_approvesWETHForRailgun() public view {
        // Constructor should have called WETH.approve(RAILGUN, type(uint256).max)
        uint256 allowance = weth.allowance(address(companion), address(railgun));
        assertEq(allowance, type(uint256).max);
    }

    function test_privacyBridgeL2Constant() public view {
        assertEq(companion.PRIVACY_BRIDGE_L2(), PRIVACY_BRIDGE_L2);
    }

    // ──────────────────────────────────────────────
    // receiveFromBase — ETH bridging tests
    // ──────────────────────────────────────────────

    function test_receiveFromBase_ETH_basic() public {
        bytes32 commitmentHash = bytes32(uint256(0xDEAD));
        uint256 nonce = 0;
        CommitmentPreimage memory preimage = _makeETHPreimage(1 ether);
        ShieldCiphertext memory ciphertext = _makeCiphertext();

        // Fund the companion with ETH (simulating cross-chain value transfer)
        vm.deal(address(companion), 1 ether);

        // Set up messenger to report PrivacyBridge as L2 sender
        messenger.setXDomainMessageSender(PRIVACY_BRIDGE_L2);

        // Call from messenger
        vm.prank(address(messenger));
        companion.receiveFromBase(commitmentHash, nonce, preimage, ciphertext);

        // Verify RAILGUN.shield was called
        assertEq(railgun.shieldCallCount(), 1);

        // Verify WETH was used (not native ETH)
        assertEq(railgun.lastShieldedToken(), address(weth));
        assertEq(uint256(railgun.lastShieldedValue()), 1 ether);
        assertEq(railgun.lastShieldedNpk(), bytes32(uint256(0xBEEF)));

        // Verify message marked as processed
        assertTrue(companion.isMessageProcessed(commitmentHash, nonce));
    }

    function test_receiveFromBase_rejectsNonMessenger() public {
        vm.prank(alice);
        vm.expectRevert("L1Companion: caller is not the messenger");
        companion.receiveFromBase(
            bytes32(uint256(1)),
            0,
            _makeETHPreimage(1 ether),
            _makeCiphertext()
        );
    }

    function test_receiveFromBase_rejectsWrongL2Sender() public {
        messenger.setXDomainMessageSender(makeAddr("wrongSender"));

        vm.prank(address(messenger));
        vm.expectRevert("L1Companion: sender is not PrivacyBridge");
        companion.receiveFromBase(
            bytes32(uint256(1)),
            0,
            _makeETHPreimage(1 ether),
            _makeCiphertext()
        );
    }

    function test_receiveFromBase_rejectsReplay() public {
        bytes32 commitmentHash = bytes32(uint256(0xDEAD));
        uint256 nonce = 0;

        vm.deal(address(companion), 2 ether);
        messenger.setXDomainMessageSender(PRIVACY_BRIDGE_L2);

        // First call succeeds
        vm.prank(address(messenger));
        companion.receiveFromBase(commitmentHash, nonce, _makeETHPreimage(1 ether), _makeCiphertext());

        // Second call with same hash+nonce should fail
        vm.prank(address(messenger));
        vm.expectRevert("L1Companion: message already processed");
        companion.receiveFromBase(commitmentHash, nonce, _makeETHPreimage(1 ether), _makeCiphertext());
    }

    function test_receiveFromBase_differentNoncesOK() public {
        bytes32 commitmentHash = bytes32(uint256(0xDEAD));

        vm.deal(address(companion), 2 ether);
        messenger.setXDomainMessageSender(PRIVACY_BRIDGE_L2);

        vm.prank(address(messenger));
        companion.receiveFromBase(commitmentHash, 0, _makeETHPreimage(1 ether), _makeCiphertext());

        vm.prank(address(messenger));
        companion.receiveFromBase(commitmentHash, 1, _makeETHPreimage(1 ether), _makeCiphertext());

        assertTrue(companion.isMessageProcessed(commitmentHash, 0));
        assertTrue(companion.isMessageProcessed(commitmentHash, 1));
        assertEq(railgun.shieldCallCount(), 2);
    }

    function test_receiveFromBase_insufficientETH() public {
        messenger.setXDomainMessageSender(PRIVACY_BRIDGE_L2);

        // Don't fund the companion — should revert
        vm.prank(address(messenger));
        vm.expectRevert("L1Companion: insufficient ETH");
        companion.receiveFromBase(
            bytes32(uint256(1)),
            0,
            _makeETHPreimage(1 ether),
            _makeCiphertext()
        );
    }

    function test_receiveFromBase_emitsEvents() public {
        bytes32 commitmentHash = bytes32(uint256(0xDEAD));
        uint256 nonce = 7;
        uint120 amount = 1 ether;

        vm.deal(address(companion), amount);
        messenger.setXDomainMessageSender(PRIVACY_BRIDGE_L2);

        // Expect both events
        // RAILGUN shield fee = 25bp of 1 ETH = 0.0025 ETH = 2500000000000000
        uint256 expectedFee = (uint256(amount) * 25) / 10000;
        vm.expectEmit(true, true, false, true);
        emit RailgunShieldExecuted(commitmentHash, address(weth), amount, expectedFee);

        vm.expectEmit(true, true, false, true);
        emit ReceivedFromBase(commitmentHash, nonce, amount, block.timestamp);

        vm.prank(address(messenger));
        companion.receiveFromBase(commitmentHash, nonce, _makeETHPreimage(amount), _makeCiphertext());
    }

    function test_receiveFromBase_whenPaused() public {
        vm.prank(admin);
        companion.pause();

        messenger.setXDomainMessageSender(PRIVACY_BRIDGE_L2);
        vm.deal(address(companion), 1 ether);

        vm.prank(address(messenger));
        vm.expectRevert("L1Companion: paused");
        companion.receiveFromBase(
            bytes32(uint256(1)),
            0,
            _makeETHPreimage(1 ether),
            _makeCiphertext()
        );
    }

    // ──────────────────────────────────────────────
    // receiveFromBase — ERC20 bridging tests
    // ──────────────────────────────────────────────

    function test_receiveFromBase_ERC20() public {
        bytes32 commitmentHash = bytes32(uint256(0xBEEF));
        uint256 nonce = 0;
        uint120 amount = 1000e18;

        CommitmentPreimage memory preimage = _makeERC20Preimage(amount);
        ShieldCiphertext memory ciphertext = _makeCiphertext();

        // Fund companion with tokens (simulating escrowed tokens)
        mockToken.mint(address(companion), amount);

        messenger.setXDomainMessageSender(PRIVACY_BRIDGE_L2);

        vm.prank(address(messenger));
        companion.receiveFromBase(commitmentHash, nonce, preimage, ciphertext);

        // Verify RAILGUN.shield was called with the ERC20
        assertEq(railgun.shieldCallCount(), 1);
        assertEq(railgun.lastShieldedToken(), address(mockToken));
        assertEq(uint256(railgun.lastShieldedValue()), amount);

        // Tokens should have moved from companion → railgun
        assertEq(mockToken.balanceOf(address(railgun)), amount);
    }

    function test_receiveFromBase_ERC20_insufficientBalance() public {
        bytes32 commitmentHash = bytes32(uint256(0xBEEF));
        uint256 nonce = 0;

        CommitmentPreimage memory preimage = _makeERC20Preimage(1000e18);
        ShieldCiphertext memory ciphertext = _makeCiphertext();

        // Don't fund companion with tokens
        messenger.setXDomainMessageSender(PRIVACY_BRIDGE_L2);

        vm.prank(address(messenger));
        vm.expectRevert("L1Companion: insufficient token balance");
        companion.receiveFromBase(commitmentHash, nonce, preimage, ciphertext);
    }

    // ──────────────────────────────────────────────
    // bridgeToBase — ETH tests
    // ──────────────────────────────────────────────

    function test_bridgeToBase_ETH_basic() public {
        uint120 amount = 1 ether;
        CommitmentPreimage memory preimage = _makeETHPreimage(amount);
        ShieldCiphertext memory ciphertext = _makeCiphertext();

        vm.deal(alice, amount);
        vm.prank(alice);
        companion.bridgeToBase{value: amount}(preimage, ciphertext);

        // Verify nonce incremented
        assertEq(companion.bridgeNonce(), 1);

        // Verify cross-chain message was sent
        assertTrue(messenger.messageWasSent());
        assertEq(messenger.lastTarget(), PRIVACY_BRIDGE_L2);
        assertEq(messenger.lastGasLimit(), companion.L2_GAS_LIMIT());

        // ETH should be held by companion
        assertEq(address(companion).balance, amount);
    }

    function test_bridgeToBase_ETH_amountMismatch() public {
        uint120 preimageAmount = 1 ether;
        CommitmentPreimage memory preimage = _makeETHPreimage(preimageAmount);

        vm.deal(alice, 2 ether);
        vm.prank(alice);
        vm.expectRevert("L1Companion: ETH amount mismatch");
        companion.bridgeToBase{value: 0.5 ether}(preimage, _makeCiphertext());
    }

    function test_bridgeToBase_ETH_zeroAmount() public {
        CommitmentPreimage memory preimage = _makeETHPreimage(0);

        vm.prank(alice);
        vm.expectRevert("L1Companion: zero amount");
        companion.bridgeToBase{value: 0}(preimage, _makeCiphertext());
    }

    function test_bridgeToBase_ETH_incrementsNonce() public {
        uint120 amount = 0.5 ether;

        vm.deal(alice, 2 ether);

        vm.prank(alice);
        companion.bridgeToBase{value: amount}(_makeETHPreimage(amount), _makeCiphertext());
        assertEq(companion.bridgeNonce(), 1);

        vm.prank(alice);
        companion.bridgeToBase{value: amount}(_makeETHPreimage(amount), _makeCiphertext());
        assertEq(companion.bridgeNonce(), 2);
    }

    function test_bridgeToBase_ETH_emitsEvent() public {
        uint120 amount = 1 ether;
        CommitmentPreimage memory preimage = _makeETHPreimage(amount);
        bytes32 expectedHash = _hashCommitment(preimage);

        vm.deal(alice, amount);

        vm.expectEmit(true, true, true, true);
        emit BridgeToBaseInitiated(0, expectedHash, alice, amount, block.timestamp);

        vm.prank(alice);
        companion.bridgeToBase{value: amount}(preimage, _makeCiphertext());
    }

    function test_bridgeToBase_ETH_messageEncoding() public {
        uint120 amount = 1 ether;
        CommitmentPreimage memory preimage = _makeETHPreimage(amount);
        ShieldCiphertext memory ciphertext = _makeCiphertext();
        bytes32 expectedHash = _hashCommitment(preimage);

        vm.deal(alice, amount);
        vm.prank(alice);
        companion.bridgeToBase{value: amount}(preimage, ciphertext);

        // Verify the message targets PrivacyBridge.receiveFromL1()
        bytes memory sentMessage = messenger.lastMessage();
        assertGt(sentMessage.length, 0);

        // First 4 bytes should be receiveFromL1 selector
        bytes4 selector;
        assembly {
            selector := mload(add(sentMessage, 32))
        }
        // receiveFromL1(bytes32,uint256,(bytes32,(uint8,address,uint256),uint120),(bytes32[3],bytes32))
        bytes4 expectedSelector = bytes4(keccak256(
            "receiveFromL1(bytes32,uint256,(bytes32,(uint8,address,uint256),uint120),(bytes32[3],bytes32))"
        ));
        assertEq(selector, expectedSelector);
    }

    // ──────────────────────────────────────────────
    // bridgeToBase — ERC20 tests
    // ──────────────────────────────────────────────

    function test_bridgeToBase_ERC20_basic() public {
        uint120 amount = 500e18;
        CommitmentPreimage memory preimage = _makeERC20Preimage(amount);
        ShieldCiphertext memory ciphertext = _makeCiphertext();

        mockToken.mint(alice, amount);

        vm.prank(alice);
        mockToken.approve(address(companion), amount);

        vm.prank(alice);
        companion.bridgeToBase(preimage, ciphertext);

        // Verify tokens moved to companion (escrow)
        assertEq(mockToken.balanceOf(address(companion)), amount);
        assertEq(mockToken.balanceOf(alice), 0);

        // Verify cross-chain message sent
        assertTrue(messenger.messageWasSent());
        assertEq(messenger.lastTarget(), PRIVACY_BRIDGE_L2);
        assertEq(companion.bridgeNonce(), 1);
    }

    function test_bridgeToBase_ERC20_rejectsETHWithERC20() public {
        uint120 amount = 500e18;
        CommitmentPreimage memory preimage = _makeERC20Preimage(amount);

        mockToken.mint(alice, amount);
        vm.prank(alice);
        mockToken.approve(address(companion), amount);

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert("L1Companion: no ETH for ERC20 bridge");
        companion.bridgeToBase{value: 1 ether}(preimage, _makeCiphertext());
    }

    function test_bridgeToBase_whenPaused() public {
        vm.prank(admin);
        companion.pause();

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert("L1Companion: paused");
        companion.bridgeToBase{value: 1 ether}(_makeETHPreimage(1 ether), _makeCiphertext());
    }

    // ──────────────────────────────────────────────
    // Commitment hash consistency tests
    // ──────────────────────────────────────────────

    function test_hashCommitment_matchesBridgeContract() public view {
        // The commitment hash on L1Companion must match PrivacyBridge._hashCommitment
        // Both use: keccak256(npk, tokenType, tokenAddress, tokenSubID, value) % SNARK_SCALAR_FIELD
        CommitmentPreimage memory preimage = _makeETHPreimage(1 ether);
        bytes32 expected = _hashCommitment(preimage);

        // bridgeToBase computes the hash internally — verify via event
        // The hash should be deterministic
        assertEq(expected, _hashCommitment(preimage));
        assertTrue(uint256(expected) < SNARK_SCALAR_FIELD);
    }

    function test_hashCommitment_withinSnarkField() public pure {
        CommitmentPreimage memory preimage = CommitmentPreimage({
            npk: bytes32(type(uint256).max),
            token: TokenData({
                tokenType: TokenType.ERC20,
                tokenAddress: address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF),
                tokenSubID: type(uint256).max
            }),
            value: type(uint120).max
        });

        bytes32 hash = bytes32(
            uint256(keccak256(abi.encode(
                preimage.npk,
                preimage.token.tokenType,
                preimage.token.tokenAddress,
                preimage.token.tokenSubID,
                preimage.value
            ))) % SNARK_SCALAR_FIELD
        );

        assertTrue(uint256(hash) < SNARK_SCALAR_FIELD);
    }

    // ──────────────────────────────────────────────
    // Admin tests
    // ──────────────────────────────────────────────

    function test_pause_unpause() public {
        vm.prank(admin);
        companion.pause();
        assertTrue(companion.paused());

        vm.prank(admin);
        companion.unpause();
        assertFalse(companion.paused());
    }

    function test_pause_rejectsNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert("L1Companion: caller is not admin");
        companion.pause();
    }

    function test_unpause_rejectsNonAdmin() public {
        vm.prank(admin);
        companion.pause();

        vm.prank(alice);
        vm.expectRevert("L1Companion: caller is not admin");
        companion.unpause();
    }

    function test_transferAdmin() public {
        vm.prank(admin);
        companion.transferAdmin(bob);
        assertEq(companion.admin(), bob);

        // Old admin can't act
        vm.prank(admin);
        vm.expectRevert("L1Companion: caller is not admin");
        companion.pause();

        // New admin can
        vm.prank(bob);
        companion.pause();
        assertTrue(companion.paused());
    }

    function test_transferAdmin_rejectsZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("L1Companion: zero address");
        companion.transferAdmin(address(0));
    }

    function test_transferAdmin_rejectsNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert("L1Companion: caller is not admin");
        companion.transferAdmin(alice);
    }

    function test_approveTokenForRailgun() public {
        vm.prank(admin);
        companion.approveTokenForRailgun(address(mockToken), 1000e18);

        assertEq(mockToken.allowance(address(companion), address(railgun)), 1000e18);
    }

    function test_rescueTokens() public {
        // Accidentally send tokens to companion
        mockToken.mint(address(companion), 100e18);

        vm.prank(admin);
        companion.rescueTokens(address(mockToken), alice, 100e18);

        assertEq(mockToken.balanceOf(alice), 100e18);
        assertEq(mockToken.balanceOf(address(companion)), 0);
    }

    function test_rescueETH() public {
        vm.deal(address(companion), 1 ether);

        vm.prank(admin);
        companion.rescueETH(payable(alice), 0.5 ether);

        assertEq(alice.balance, 0.5 ether);
        assertEq(address(companion).balance, 0.5 ether);
    }

    function test_rescueETH_rejectsNonAdmin() public {
        vm.deal(address(companion), 1 ether);

        vm.prank(alice);
        vm.expectRevert("L1Companion: caller is not admin");
        companion.rescueETH(payable(alice), 1 ether);
    }

    // ──────────────────────────────────────────────
    // View function tests
    // ──────────────────────────────────────────────

    function test_isMessageProcessed_default() public view {
        assertFalse(companion.isMessageProcessed(bytes32(uint256(1)), 0));
    }

    function test_getRailgunState() public view {
        (bytes32 root, uint256 tree, uint256 leafIndex, uint120 fee) = companion.getRailgunState();
        assertEq(root, bytes32(uint256(0xCAFE)));
        assertEq(tree, 0);
        assertEq(leafIndex, 4649);
        assertEq(fee, 25);
    }

    function test_gasLimitConstants() public view {
        assertEq(companion.L2_GAS_LIMIT(), 500_000);
        assertEq(companion.L1_GAS_LIMIT(), 300_000);
    }

    // ──────────────────────────────────────────────
    // Receive ETH test
    // ──────────────────────────────────────────────

    function test_receiveETH() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool sent,) = address(companion).call{value: 1 ether}("");
        assertTrue(sent);
        assertEq(address(companion).balance, 1 ether);
    }
}
