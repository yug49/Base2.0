// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;
pragma abicoder v2;

// ============================================================================
// ShadowBase — ShieldedPool
// System predeploy at 0x4200000000000000000000000000000000000070
//
// Forked from RAILGUN (Railgun-Privacy/contract). Implements the full shielded
// transaction system: shield (deposit), transact (ZK transfer), unshield
// (withdraw), plus ShadowBase-specific extensions for auto-shielding and
// native ETH support.
//
// Key differences from upstream RAILGUN:
//   - Native ETH shielding (address(0) as ERC20 token address)
//   - Auto-shield claim flow (precompile redirects ETH, user claims commitment)
//   - Bridge integration (PrivacyBridge at 0x4200...0071)
//   - Deployed as L2 predeploy (not behind proxy)
// ============================================================================

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {
    SNARK_SCALAR_FIELD,
    VERIFICATION_BYPASS,
    TokenType,
    TokenData,
    UnshieldType,
    CommitmentPreimage,
    CommitmentCiphertext,
    ShieldCiphertext,
    ShieldRequest,
    Transaction
} from "../shared/Globals.sol";

import {IShieldedPool} from "../shared/interfaces/IShieldedPool.sol";
import {IVerifier} from "../shared/interfaces/IVerifier.sol";
import {Commitments} from "./Commitments.sol";
import {TokenBlocklist} from "./TokenBlocklist.sol";
import {PoseidonT4} from "./Poseidon.sol";

/**
 * @title ShieldedPool
 * @author ShadowBase (forked from RAILGUN)
 * @notice Privacy pool with Merkle tree commitments, ZK proof verification,
 *         native ETH support, auto-shield claims, and bridge integration
 */
contract ShieldedPool is Initializable, OwnableUpgradeable, Commitments, TokenBlocklist, IShieldedPool {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────
    // Constants
    // ──────────────────────────────────────────────

    /// @notice PrivacyBridge predeploy address
    address constant PRIVACY_BRIDGE = 0x4200000000000000000000000000000000000071;

    /// @notice Basis points denominator
    uint120 private constant BASIS_POINTS = 10000;

    /// @notice Storage slot for pending auto-shield balances.
    ///         Uses a fixed keccak slot to avoid storage layout conflicts with inheritance.
    ///         Go precompile writes to the same slot: keccak256(abi.encode(recipient, this_slot))
    bytes32 private constant _PENDING_SHIELDS_SLOT = keccak256("shadowbase.shieldedpool.pendingShields");

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    /// @notice Treasury address for fee collection
    address payable public treasury;

    /// @notice Shield fee in basis points
    uint120 public shieldFee;

    /// @notice Unshield fee in basis points
    uint120 public unshieldFee;

    /// @notice Verifier contract for SNARK proof verification
    IVerifier public verifier;

    /// @notice Token ID mapping (tokenID -> TokenData) for reverse lookups
    mapping(bytes32 => TokenData) public tokenIDMapping;

    /// @notice Last event block — assists wallet scanning
    uint256 public lastEventBlock;

    /// @notice Total ETH that has been committed to the Merkle tree
    uint256 public totalCommittedETH;

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    // Shield and Nullified events are inherited from IShieldedPool

    event Transact(uint256 treeNumber, uint256 startPosition, bytes32[] hash, CommitmentCiphertext[] ciphertext);

    event Unshield(address to, TokenData token, uint256 amount, uint256 fee);

    event AutoShieldClaimed(address indexed recipient, uint256 amount, bytes32 commitmentHash);

    event TreasuryChange(address treasury);
    event FeeChange(uint256 shieldFee, uint256 unshieldFee);

    // ──────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────

    modifier onlyBridge() {
        require(msg.sender == PRIVACY_BRIDGE, "ShieldedPool: caller is not bridge");
        _;
    }

    // ──────────────────────────────────────────────
    // IShieldedPool view overrides (state lives in Commitments)
    // ──────────────────────────────────────────────

    function merkleRoot() external view override returns (bytes32) {
        return _merkleRoot;
    }

    function treeNumber() external view override returns (uint256) {
        return _treeNumber;
    }

    function nextLeafIndex() external view override returns (uint256) {
        return _nextLeafIndex;
    }

    function nullifiers(uint256 _tree, bytes32 _nullifier) external view override returns (bool) {
        return _nullifiers[_tree][_nullifier];
    }

    function rootHistory(uint256 _tree, bytes32 _root) external view override returns (bool) {
        return _rootHistory[_tree][_root];
    }

    // ──────────────────────────────────────────────
    // Initialization
    // ──────────────────────────────────────────────

    /// @notice Initialize the ShieldedPool
    /// @param _treasury - fee recipient address
    /// @param _verifier - Verifier contract address for SNARK proofs
    /// @param _owner - admin/governance address
    function initialize(address payable _treasury, address _verifier, address _owner) external initializer {
        OwnableUpgradeable.__Ownable_init(_owner);
        Commitments.initializeCommitments();
        treasury = _treasury;
        if (_verifier != address(0)) {
            verifier = IVerifier(_verifier);
        }
    }

    // ════════════════════════════════════════════════
    // SHIELD — ERC20 Tokens
    // ════════════════════════════════════════════════

    /// @notice Shield ERC20 tokens into the private pool
    /// @param _shieldRequests - array of shield requests with preimage + ciphertext
    function shield(ShieldRequest[] calldata _shieldRequests) external override {
        uint256 len = _shieldRequests.length;
        require(len > 0, "ShieldedPool: empty request");

        (uint256 insertTreeNumber, uint256 insertStartPosition) = getInsertionTreeNumberAndStartingIndex(len);

        bytes32[] memory hashes = new bytes32[](len);
        CommitmentPreimage[] memory commitments = new CommitmentPreimage[](len);
        ShieldCiphertext[] memory ciphertexts = new ShieldCiphertext[](len);
        uint256[] memory fees = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            ShieldRequest calldata req = _shieldRequests[i];

            // Validate
            require(req.preimage.value > 0, "ShieldedPool: zero value");
            require(uint256(req.preimage.npk) < SNARK_SCALAR_FIELD, "ShieldedPool: invalid npk");
            require(!tokenBlocklist[req.preimage.token.tokenAddress], "ShieldedPool: blocked token");
            require(req.preimage.token.tokenAddress != address(0), "ShieldedPool: use shieldETH for native ETH");

            // Transfer ERC20 tokens in (with fee)
            (CommitmentPreimage memory adjustedNote, uint256 fee) = _transferTokenIn(req.preimage);

            // Hash commitment
            bytes32 hash = hashCommitment(adjustedNote);

            hashes[i] = hash;
            commitments[i] = adjustedNote;
            ciphertexts[i] = req.ciphertext;
            fees[i] = fee;
        }

        // Insert all leaves into Merkle tree
        insertLeaves(hashes);
        lastEventBlock = block.number;

        emit Shield(insertTreeNumber, insertStartPosition, commitments, ciphertexts, fees);
    }

    // ════════════════════════════════════════════════
    // SHIELD — Native ETH
    // ════════════════════════════════════════════════

    /// @notice Shield native ETH into the private pool
    /// @param _npk - recipient's RAILGUN spending public key
    /// @param _ciphertext - encrypted data for recipient wallet scanning
    function shieldETH(bytes32 _npk, ShieldCiphertext calldata _ciphertext) external payable {
        require(msg.value > 0, "ShieldedPool: zero value");
        require(uint256(_npk) < SNARK_SCALAR_FIELD, "ShieldedPool: invalid npk");

        // Apply fee
        (uint120 base, uint120 fee) = getFee(uint136(msg.value), true, shieldFee);

        // Create preimage for native ETH (address(0))
        CommitmentPreimage memory preimage =
            CommitmentPreimage({npk: _npk, token: TokenData(TokenType.ERC20, address(0), 0), value: base});

        bytes32 hash = hashCommitment(preimage);

        (uint256 insertTreeNumber, uint256 insertStartPosition) = getInsertionTreeNumberAndStartingIndex(1);

        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = hash;
        insertLeaves(hashes);

        totalCommittedETH += base;

        // Send fee to treasury
        if (fee > 0 && treasury != address(0)) {
            (bool sent,) = treasury.call{value: fee}("");
            require(sent, "ShieldedPool: fee transfer failed");
        }

        // Emit events
        CommitmentPreimage[] memory commitments = new CommitmentPreimage[](1);
        commitments[0] = preimage;
        ShieldCiphertext[] memory ciphertexts = new ShieldCiphertext[](1);
        ciphertexts[0] = _ciphertext;
        uint256[] memory fees = new uint256[](1);
        fees[0] = fee;

        lastEventBlock = block.number;
        emit Shield(insertTreeNumber, insertStartPosition, commitments, ciphertexts, fees);
    }

    // ════════════════════════════════════════════════
    // AUTO-SHIELD CLAIM
    // ════════════════════════════════════════════════

    /// @notice Claim auto-shielded ETH that was redirected by the EVM precompile.
    ///         The precompile writes pending balances to a keccak storage slot.
    ///         The user calls this to create a proper Merkle tree commitment.
    /// @param _npk - recipient's RAILGUN spending public key
    /// @param _ciphertext - encrypted data for wallet scanning
    function claimAutoShield(bytes32 _npk, ShieldCiphertext calldata _ciphertext) external {
        uint256 amount = _getPendingShields(msg.sender);
        require(amount > 0, "ShieldedPool: nothing to claim");
        require(uint256(_npk) < SNARK_SCALAR_FIELD, "ShieldedPool: invalid npk");

        // Clear pending balance
        _setPendingShields(msg.sender, 0);

        // Apply fee
        (uint120 base, uint120 fee) = getFee(uint136(amount), true, shieldFee);

        // Create commitment for native ETH
        CommitmentPreimage memory preimage =
            CommitmentPreimage({npk: _npk, token: TokenData(TokenType.ERC20, address(0), 0), value: base});

        bytes32 hash = hashCommitment(preimage);

        (uint256 insertTreeNumber, uint256 insertStartPosition) = getInsertionTreeNumberAndStartingIndex(1);

        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = hash;
        insertLeaves(hashes);

        totalCommittedETH += base;

        if (fee > 0 && treasury != address(0)) {
            (bool sent,) = treasury.call{value: fee}("");
            require(sent, "ShieldedPool: fee transfer failed");
        }

        // Emit events
        CommitmentPreimage[] memory commitments = new CommitmentPreimage[](1);
        commitments[0] = preimage;
        ShieldCiphertext[] memory ciphertexts = new ShieldCiphertext[](1);
        ciphertexts[0] = _ciphertext;
        uint256[] memory fees = new uint256[](1);
        fees[0] = fee;

        lastEventBlock = block.number;
        emit Shield(insertTreeNumber, insertStartPosition, commitments, ciphertexts, fees);
        emit AutoShieldClaimed(msg.sender, base, hash);
    }

    // ════════════════════════════════════════════════
    // TRANSACT — ZK proof-based transfers
    // ════════════════════════════════════════════════

    /// @notice Process shielded transactions with ZK proof verification.
    ///         Each transaction nullifies spent notes and creates new commitments.
    /// @param _transactions - array of transactions to process
    function transact(Transaction[] calldata _transactions) external {
        uint256 totalCommitmentCount = _sumCommitments(_transactions);

        (uint256 insertTreeNumber, uint256 insertStartPosition) =
            getInsertionTreeNumberAndStartingIndex(totalCommitmentCount);

        bytes32[] memory commitmentHashes = new bytes32[](totalCommitmentCount);
        CommitmentCiphertext[] memory ciphertexts = new CommitmentCiphertext[](totalCommitmentCount);

        uint256 commitmentOffset = 0;

        for (uint256 i = 0; i < _transactions.length; i++) {
            Transaction calldata txn = _transactions[i];

            // 1. Validate transaction (checks merkle root, chain ID, proof, etc.)
            _validateTransaction(txn);

            // 2. Nullify spent notes and accumulate new commitments
            commitmentOffset = _accumulateAndNullify(txn, commitmentHashes, commitmentOffset, ciphertexts);

            // 3. Process unshield if present
            if (txn.boundParams.unshield != UnshieldType.NONE) {
                _processUnshield(txn.unshieldPreimage);
            }
        }

        // Insert all commitment leaves into Merkle tree
        insertLeaves(commitmentHashes);
        lastEventBlock = block.number;

        emit Transact(insertTreeNumber, insertStartPosition, commitmentHashes, ciphertexts);
    }

    // ════════════════════════════════════════════════
    // BRIDGE FUNCTIONS (IShieldedPool)
    // ════════════════════════════════════════════════

    /// @notice Create a commitment from a bridge deposit (called by PrivacyBridge only)
    function bridgeCommitmentIn(
        bytes32 _commitmentHash,
        CommitmentPreimage calldata _preimage,
        ShieldCiphertext calldata _ciphertext
    ) external override onlyBridge {
        (uint256 insertTreeNumber, uint256 insertStartPosition) = getInsertionTreeNumberAndStartingIndex(1);

        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = _commitmentHash;
        insertLeaves(hashes);

        CommitmentPreimage[] memory commitments = new CommitmentPreimage[](1);
        commitments[0] = _preimage;
        ShieldCiphertext[] memory ciphertexts = new ShieldCiphertext[](1);
        ciphertexts[0] = _ciphertext;
        uint256[] memory fees = new uint256[](1);
        fees[0] = 0;

        lastEventBlock = block.number;
        emit Shield(insertTreeNumber, insertStartPosition, commitments, ciphertexts, fees);
    }

    /// @notice Mark a commitment as spent/burned for bridging out
    function bridgeNullify(uint256 _treeNumber, bytes32 _nullifier) external override onlyBridge {
        require(!_nullifiers[_treeNumber][_nullifier], "ShieldedPool: nullifier already spent");
        _nullifiers[_treeNumber][_nullifier] = true;

        bytes32[] memory nullifierArray = new bytes32[](1);
        nullifierArray[0] = _nullifier;
        emit Nullified(uint16(_treeNumber), nullifierArray);
    }

    // ════════════════════════════════════════════════
    // INTERNAL — Transaction validation
    // ════════════════════════════════════════════════

    function _validateTransaction(Transaction calldata _txn) internal view {
        // Chain ID must match
        require(_txn.boundParams.chainID == block.chainid, "ShieldedPool: chainID mismatch");

        // Adapt contract must be 0 or msg.sender
        require(
            _txn.boundParams.adaptContract == address(0) || _txn.boundParams.adaptContract == msg.sender,
            "ShieldedPool: invalid adapt contract"
        );

        // Merkle root must be valid
        require(_rootHistory[_txn.boundParams.treeNumber][_txn.merkleRoot], "ShieldedPool: invalid merkle root");

        // Validate array lengths and unshield preimage
        if (_txn.boundParams.unshield != UnshieldType.NONE) {
            require(
                _txn.boundParams.commitmentCiphertext.length == _txn.commitments.length - 1,
                "ShieldedPool: invalid ciphertext length"
            );

            // Verify unshield preimage hash matches last commitment
            bytes32 hash;
            if (_txn.boundParams.unshield == UnshieldType.REDIRECT) {
                hash = hashCommitment(
                    CommitmentPreimage({
                        npk: bytes32(uint256(uint160(msg.sender))),
                        token: _txn.unshieldPreimage.token,
                        value: _txn.unshieldPreimage.value
                    })
                );
            } else {
                hash = hashCommitment(_txn.unshieldPreimage);
            }

            require(hash == _txn.commitments[_txn.commitments.length - 1], "ShieldedPool: invalid unshield note");
        } else {
            require(
                _txn.boundParams.commitmentCiphertext.length == _txn.commitments.length,
                "ShieldedPool: invalid ciphertext length"
            );
        }

        // Verify SNARK proof (skip for VERIFICATION_BYPASS — gas estimation)
        if (tx.origin != VERIFICATION_BYPASS) {
            require(address(verifier) != address(0), "ShieldedPool: verifier not set");
            require(verifier.verify(_txn), "ShieldedPool: invalid proof");
        }
    }

    function _accumulateAndNullify(
        Transaction calldata _txn,
        bytes32[] memory _commitments,
        uint256 _offset,
        CommitmentCiphertext[] memory _ciphertext
    ) internal returns (uint256) {
        // Nullify spent notes
        for (uint256 j = 0; j < _txn.nullifiers.length; j++) {
            require(!_nullifiers[_txn.boundParams.treeNumber][_txn.nullifiers[j]], "ShieldedPool: note already spent");
            _nullifiers[_txn.boundParams.treeNumber][_txn.nullifiers[j]] = true;
        }

        emit Nullified(_txn.boundParams.treeNumber, _txn.nullifiers);

        // Accumulate new commitments
        for (uint256 j = 0; j < _txn.boundParams.commitmentCiphertext.length; j++) {
            _commitments[_offset + j] = _txn.commitments[j];
            _ciphertext[_offset + j] = _txn.boundParams.commitmentCiphertext[j];
        }

        return _offset + _txn.boundParams.commitmentCiphertext.length;
    }

    function _processUnshield(CommitmentPreimage calldata _note) internal {
        address to = address(uint160(uint256(_note.npk)));

        if (_note.token.tokenType == TokenType.ERC20) {
            (uint120 base, uint120 fee) = getFee(_note.value, true, unshieldFee);

            if (_note.token.tokenAddress == address(0)) {
                // Native ETH unshield
                (bool sent,) = to.call{value: base}("");
                require(sent, "ShieldedPool: ETH transfer failed");
                if (fee > 0 && treasury != address(0)) {
                    (bool feeSent,) = treasury.call{value: fee}("");
                    require(feeSent, "ShieldedPool: fee transfer failed");
                }
                totalCommittedETH -= _note.value;
            } else {
                // ERC20 unshield
                IERC20 token = IERC20(_note.token.tokenAddress);
                token.safeTransfer(to, base);
                if (fee > 0 && treasury != address(0)) {
                    token.safeTransfer(treasury, fee);
                }
            }

            emit Unshield(to, _note.token, base, fee);
        } else {
            revert("ShieldedPool: unsupported token type");
        }
    }

    function _sumCommitments(Transaction[] calldata _txns) internal pure returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < _txns.length; i++) {
            total += _txns[i].boundParams.commitmentCiphertext.length;
        }
        return total;
    }

    // ════════════════════════════════════════════════
    // INTERNAL — Token transfers
    // ════════════════════════════════════════════════

    function _transferTokenIn(CommitmentPreimage calldata _note)
        internal
        returns (CommitmentPreimage memory, uint256)
    {
        IERC20 token = IERC20(_note.token.tokenAddress);

        (uint120 base, uint120 fee) = getFee(_note.value, true, shieldFee);

        CommitmentPreimage memory adjustedNote = CommitmentPreimage({npk: _note.npk, value: base, token: _note.token});

        // Transfer base to contract
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), base);
        uint256 balanceAfter = token.balanceOf(address(this));
        require(balanceAfter - balanceBefore == base, "ShieldedPool: ERC20 transfer failed");

        // Transfer fee to treasury
        if (fee > 0 && treasury != address(0)) {
            token.safeTransferFrom(msg.sender, treasury, fee);
        }

        // Store token ID mapping
        tokenIDMapping[getTokenID(_note.token)] = _note.token;

        return (adjustedNote, fee);
    }

    // ════════════════════════════════════════════════
    // PUBLIC — Hashing (matching RAILGUN exactly)
    // ════════════════════════════════════════════════

    /// @notice Gets token ID value from tokenData
    function getTokenID(TokenData memory _tokenData) public pure returns (bytes32) {
        if (_tokenData.tokenType == TokenType.ERC20) {
            return bytes32(uint256(uint160(_tokenData.tokenAddress)));
        }
        return bytes32(uint256(keccak256(abi.encode(_tokenData))) % SNARK_SCALAR_FIELD);
    }

    /// @notice Hash a commitment preimage using PoseidonT4
    function hashCommitment(CommitmentPreimage memory _preimage) public pure returns (bytes32) {
        return PoseidonT4.poseidon([_preimage.npk, getTokenID(_preimage.token), bytes32(uint256(_preimage.value))]);
    }

    /// @notice Get base and fee amounts
    function getFee(uint136 _amount, bool _isInclusive, uint120 _feeBP) public pure returns (uint120, uint120) {
        if (_feeBP == 0) return (uint120(_amount), 0);

        uint136 base;
        uint136 fee;

        if (_isInclusive) {
            base = _amount - (_amount * _feeBP) / BASIS_POINTS;
            fee = _amount - base;
        } else {
            base = _amount;
            fee = (BASIS_POINTS * base) / (BASIS_POINTS - _feeBP) - base;
        }

        return (uint120(base), uint120(fee));
    }

    // ════════════════════════════════════════════════
    // Pending shields (auto-shield tracking via keccak storage)
    // ════════════════════════════════════════════════

    /// @notice Get pending auto-shield balance for a recipient
    function pendingShields(address _recipient) public view returns (uint256) {
        return _getPendingShields(_recipient);
    }

    function _getPendingShields(address _recipient) internal view returns (uint256) {
        bytes32 slot = _pendingShieldsSlot(_recipient);
        uint256 value;
        assembly {
            value := sload(slot)
        }
        return value;
    }

    function _setPendingShields(address _recipient, uint256 _amount) internal {
        bytes32 slot = _pendingShieldsSlot(_recipient);
        assembly {
            sstore(slot, _amount)
        }
    }

    function _pendingShieldsSlot(address _recipient) internal pure returns (bytes32) {
        return keccak256(abi.encode(_recipient, _PENDING_SHIELDS_SLOT));
    }

    // ════════════════════════════════════════════════
    // ADMIN
    // ════════════════════════════════════════════════

    function changeTreasury(address payable _treasury) external onlyOwner {
        if (treasury != _treasury) {
            treasury = _treasury;
            emit TreasuryChange(_treasury);
        }
    }

    function changeFee(uint120 _shieldFee, uint120 _unshieldFee) external onlyOwner {
        require(_shieldFee <= BASIS_POINTS / 2, "ShieldedPool: shield fee too high");
        require(_unshieldFee <= BASIS_POINTS / 2, "ShieldedPool: unshield fee too high");
        shieldFee = _shieldFee;
        unshieldFee = _unshieldFee;
        emit FeeChange(_shieldFee, _unshieldFee);
    }

    function setVerifier(address _verifier) external onlyOwner {
        verifier = IVerifier(_verifier);
    }

    function blockToken(address _token) external onlyOwner {
        tokenBlocklist[_token] = true;
    }

    function unblockToken(address _token) external onlyOwner {
        tokenBlocklist[_token] = false;
    }

    // Accept ETH from precompile auto-shield and direct transfers
    receive() external payable {}
}
