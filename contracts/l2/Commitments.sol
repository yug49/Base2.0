// SPDX-License-Identifier: UNLICENSED
// Based on code from MACI
// (https://github.com/appliedzkp/maci/blob/7f36a915244a6e8f98bacfe255f8bd44193e7919/contracts/sol/IncrementalMerkleTree.sol)
pragma solidity ^0.8.7;
pragma abicoder v2;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {SNARK_SCALAR_FIELD} from "../shared/Globals.sol";
import {PoseidonT3} from "./Poseidon.sol";

/**
 * @title Commitments
 * @author Railgun Contributors (forked for ShadowBase)
 * @notice Batch Incremental Merkle Tree for shielded commitments
 * @dev Depth-16 Merkle tree (65,536 leaves per tree). When full, a new tree is created.
 *      Uses PoseidonT3 for internal hashing (matching RAILGUN on Sepolia).
 */
contract Commitments is Initializable {
    // Commitment nullifiers (tree number -> nullifier -> seen)
    mapping(uint256 => mapping(bytes32 => bool)) internal _nullifiers;

    // The tree depth
    uint256 internal constant TREE_DEPTH = 16;

    // Tree zero value — must match RAILGUN exactly
    bytes32 public constant ZERO_VALUE = bytes32(uint256(keccak256("Railgun")) % SNARK_SCALAR_FIELD);

    // Next leaf index (number of inserted leaves in the current tree)
    uint256 internal _nextLeafIndex;

    // The Merkle root
    bytes32 internal _merkleRoot;

    // Store new tree root to quickly migrate to a new tree
    bytes32 private newTreeRoot;

    // Tree number
    uint256 internal _treeNumber;

    // The Merkle path to the leftmost leaf upon initialization.
    // Caching these values is essential to efficient appends.
    bytes32[TREE_DEPTH] public zeros;

    // Right-most elements at each level
    bytes32[TREE_DEPTH] private filledSubTrees;

    // Whether the contract has already seen a particular Merkle tree root
    // treeNumber -> root -> seen
    mapping(uint256 => mapping(bytes32 => bool)) internal _rootHistory;

    /**
     * @notice Calculates initial values for Merkle Tree
     * @dev OpenZeppelin initializer ensures this can only be called once
     */
    function initializeCommitments() internal onlyInitializing {
        // Calculate zero values
        zeros[0] = ZERO_VALUE;
        bytes32 currentZero = ZERO_VALUE;

        for (uint256 i = 0; i < TREE_DEPTH; i += 1) {
            zeros[i] = currentZero;
            filledSubTrees[i] = currentZero;
            currentZero = hashLeftRight(currentZero, currentZero);
        }

        // Set merkle root and store root to quickly retrieve later
        newTreeRoot = _merkleRoot = currentZero;
        _rootHistory[_treeNumber][currentZero] = true;
    }

    /**
     * @notice Hash 2 uint256 values
     * @param _left - Left side of hash
     * @param _right - Right side of hash
     * @return hash result
     */
    function hashLeftRight(bytes32 _left, bytes32 _right) public pure returns (bytes32) {
        return PoseidonT3.poseidon([_left, _right]);
    }

    /**
     * @notice Insert leaves into the current merkle tree
     * @dev This function INTENTIONALLY causes side effects to save on gas.
     *      _leafHashes and _count should never be reused.
     * @param _leafHashes - array of leaf hashes to be added to the merkle tree
     */
    function insertLeaves(bytes32[] memory _leafHashes) internal {
        uint256 count = _leafHashes.length;

        // If 0 leaves are passed in no-op
        if (count == 0) {
            return;
        }

        // Create new tree if current one can't contain new leaves
        if ((_nextLeafIndex + count) > (2 ** TREE_DEPTH)) {
            newTree();
        }

        // Current index is the index at each level to insert the hash
        uint256 levelInsertionIndex = _nextLeafIndex;

        // Update nextLeafIndex
        _nextLeafIndex += count;

        // Variables for starting point at next tree level
        uint256 nextLevelHashIndex;
        uint256 nextLevelStartIndex;

        // Loop through each level of the merkle tree and update
        for (uint256 level = 0; level < TREE_DEPTH; level += 1) {
            // Calculate the index to start at for the next level
            nextLevelStartIndex = levelInsertionIndex >> 1;

            uint256 insertionElement = 0;

            // If we're on the right, hash and increment to get on the left
            if (levelInsertionIndex % 2 == 1) {
                nextLevelHashIndex = (levelInsertionIndex >> 1) - nextLevelStartIndex;

                _leafHashes[nextLevelHashIndex] = hashLeftRight(filledSubTrees[level], _leafHashes[insertionElement]);

                insertionElement += 1;
                levelInsertionIndex += 1;
            }

            // We'll always be on the left side now
            for (insertionElement; insertionElement < count; insertionElement += 2) {
                bytes32 right;

                if (insertionElement < count - 1) {
                    right = _leafHashes[insertionElement + 1];
                } else {
                    right = zeros[level];
                }

                if (insertionElement == count - 1 || insertionElement == count - 2) {
                    filledSubTrees[level] = _leafHashes[insertionElement];
                }

                nextLevelHashIndex = (levelInsertionIndex >> 1) - nextLevelStartIndex;

                _leafHashes[nextLevelHashIndex] = hashLeftRight(_leafHashes[insertionElement], right);

                levelInsertionIndex += 2;
            }

            // Get starting levelInsertionIndex value for next level
            levelInsertionIndex = nextLevelStartIndex;

            // Get count of elements for next level
            count = nextLevelHashIndex + 1;
        }

        // Update the Merkle tree root
        _merkleRoot = _leafHashes[0];
        _rootHistory[_treeNumber][_merkleRoot] = true;
    }

    /**
     * @notice Creates new merkle tree
     */
    function newTree() internal {
        _merkleRoot = newTreeRoot;
        _nextLeafIndex = 0;
        _treeNumber += 1;
    }

    /**
     * @notice Gets tree number that new commitments will get inserted to
     * @param _newCommitments - number of new commitments
     * @return treeNumber, startingIndex
     */
    function getInsertionTreeNumberAndStartingIndex(uint256 _newCommitments) public view returns (uint256, uint256) {
        if ((_nextLeafIndex + _newCommitments) > (2 ** TREE_DEPTH)) {
            return (_treeNumber + 1, 0);
        }
        return (_treeNumber, _nextLeafIndex);
    }

    uint256[10] private __gap;
}
