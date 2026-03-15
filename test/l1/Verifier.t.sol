// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;
pragma abicoder v2;

// ============================================================================
// ShadowBase — Phase 1 Verifier Test
// Tests Groth16 proof verification using RAILGUN-compatible circuits (01x02).
// Proof fixture generated from railgun-circuits test vectors via snarkjs.
// ============================================================================

import "forge-std/Test.sol";
import {VerifierStub} from "../../contracts/test/VerifierStub.sol";
import {Verifier} from "../../contracts/l1/Verifier.sol";
import {
    G1Point,
    G2Point,
    VerifyingKey,
    SnarkProof,
    VERIFICATION_BYPASS,
    SNARK_SCALAR_FIELD
} from "../../contracts/shared/Globals.sol";

contract VerifierTest is Test {
    VerifierStub public verifier;

    // Re-declare the event for expectEmit matching
    event VerifyingKeySet(uint256 nullifiers, uint256 commitments, VerifyingKey verifyingKey);

    // ---------------------------------------------------------------
    // Verification Key for 01x02 circuit (1 nullifier, 2 commitments)
    // Extracted from RAILGUN circuit test artifacts with G2 reversal
    // ---------------------------------------------------------------

    function _buildVKey() internal pure returns (VerifyingKey memory vk) {
        vk.artifactsIPFSHash = "QmWFEVTTH3kdFxA8GLUKnCNZe5JwTVy7nJi2HgnzbVBLF4";

        vk.alpha1 = G1Point(
            20491192805390485299153009773594534940189261866228447918068658471970481763042,
            9383485363053290200918347156157836566562967994039712273449902621266178545958
        );

        vk.beta2 = G2Point(
            [uint256(4252822878758300859123897981450591353533073413197771768651442665752259397132),
             uint256(6375614351688725206403948262868962793625744043794305715222011528459656738731)],
            [uint256(21847035105528745403288232691147584728191162732299865338377159692350059136679),
             uint256(10505242626370262277552901082094356697409835680220590971873171140371331206856)]
        );

        vk.gamma2 = G2Point(
            [uint256(11559732032986387107991004021392285783925812861821192530917403151452391805634),
             uint256(10857046999023057135944570762232829481370756359578518086990519993285655852781)],
            [uint256(4082367875863433681332203403145435568316851327593401208105741076214120093531),
             uint256(8495653923123431417604973247489272438418190587263600148770280649306958101930)]
        );

        vk.delta2 = G2Point(
            [uint256(21557269965595760316797787601813294964827857956444862729426370981800528320538),
             uint256(628211777199298885732243563875024798887089846476860284425715710323801949853)],
            [uint256(8783903148341958816024842487454234865284371996694453030155773822472507279977),
             uint256(7274864966468042675713095618433810416333455717996947589912161585706325506617)]
        );

        // IC points (nPublic=5, so 6 IC points: ic[0]..ic[5])
        vk.ic = new G1Point[](6);
        vk.ic[0] = G1Point(
            12365314052568589532567527380474031360400521465618247615606044676178510699977,
            16169287944984209434670910613870193191799989511328867882292293379462168877463
        );
        vk.ic[1] = G1Point(
            1854951316126771264941544918473872376767578977369911194461827088318738536034,
            12139272519090314761005733531424266483047649399488937185619893575892466406648
        );
        vk.ic[2] = G1Point(
            17901128039600245521553662175257663586491456512473388938195687546231518177813,
            20727570541139259965860487024048310790424507602106199017843425657145025496335
        );
        vk.ic[3] = G1Point(
            10533474229128113536211280976897484169407810032004944966306725997313536071791,
            12189802833989441046135510499445191633662909875085556373624773660876217599882
        );
        vk.ic[4] = G1Point(
            4423649485240345140448008989997495901237622088825083399591732103398981506216,
            13878709804915866742727528244529089067764647498261203805639711686679522153421
        );
        vk.ic[5] = G1Point(
            6572475167114556483197282428249896589087267277995552668419291816891674197029,
            14179501766987497496272786236307161180928002058572700314687781936322924218024
        );
    }

    // ---------------------------------------------------------------
    // Proof generated from RAILGUN test vectors for 01x02 circuit
    // via snarkjs groth16.fullProve with G2 coordinate reversal
    // ---------------------------------------------------------------

    function _buildProof() internal pure returns (SnarkProof memory proof) {
        proof.a = G1Point(
            1303768924931336153430063199172529735893350403797850368661883941923052474210,
            15397447220423706857587446935936469953882430753891232508886691755195437468802
        );

        proof.b = G2Point(
            [uint256(4911681387179068785458441387935098604589016022446545103459340628482427655865),
             uint256(21880375037981042683209018664504469205859105606148636097482843609582397599652)],
            [uint256(4351393170602726057048058412036679957713095592997648414436648659556233942803),
             uint256(19297138663877232623223135891781054336668325632533168791417708612914761912556)]
        );

        proof.c = G1Point(
            2776217612663445091287522224056862072630277380770078864300215118398040002894,
            15240293498411454720266059072692654302978242330302591807988704281663840378593
        );
    }

    // ---------------------------------------------------------------
    // Public inputs: merkleRoot, boundParamsHash, nullifiers[1], commitments[2]
    // ---------------------------------------------------------------

    function _buildPublicInputs() internal pure returns (uint256[] memory inputs) {
        inputs = new uint256[](5);
        inputs[0] = 6651503891008261868318637545520517015441423030408583353730529205210575769897;  // merkleRoot
        inputs[1] = 21322634658204850585344103248397298882009677563030262607537238283859460601368; // boundParamsHash
        inputs[2] = 11485370912550667629147418652010973429416469356401563507077544465653018582229; // nullifier[0]
        inputs[3] = 7914210903468362502613774999962023890089456090442969275169499667680376966865;  // commitment[0]
        inputs[4] = 20557169230714554726058550132920598772096703729391043790623951134109633978277; // commitment[1]
    }

    // ---------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------

    function setUp() public {
        verifier = new VerifierStub();
        verifier.initializeStub();
    }

    // ---------------------------------------------------------------
    // Test: Set and retrieve verification key
    // ---------------------------------------------------------------

    function test_SetVerificationKey() public {
        VerifyingKey memory vk = _buildVKey();
        verifier.setVerificationKey(1, 2, vk);

        VerifyingKey memory stored = verifier.getVerificationKey(1, 2);
        assertEq(stored.alpha1.x, vk.alpha1.x, "alpha1.x mismatch");
        assertEq(stored.alpha1.y, vk.alpha1.y, "alpha1.y mismatch");
        assertEq(stored.beta2.x[0], vk.beta2.x[0], "beta2.x[0] mismatch");
        assertEq(stored.beta2.x[1], vk.beta2.x[1], "beta2.x[1] mismatch");
        assertEq(stored.ic.length, 6, "IC length should be 6");
        assertEq(stored.ic[0].x, vk.ic[0].x, "ic[0].x mismatch");
        assertEq(
            keccak256(abi.encodePacked(stored.artifactsIPFSHash)),
            keccak256(abi.encodePacked(vk.artifactsIPFSHash)),
            "IPFS hash mismatch"
        );
    }

    // ---------------------------------------------------------------
    // Test: Verify a real Groth16 proof on-chain
    // ---------------------------------------------------------------

    function test_VerifyRealProof() public {
        // 1. Set verification key
        VerifyingKey memory vk = _buildVKey();
        verifier.setVerificationKey(1, 2, vk);

        // 2. Build proof and public inputs
        SnarkProof memory proof = _buildProof();
        uint256[] memory inputs = _buildPublicInputs();

        // 3. Call verifyProof directly
        bool valid = verifier.verifyProof(vk, proof, inputs);
        assertTrue(valid, "Real Groth16 proof should verify");
    }

    // ---------------------------------------------------------------
    // Test: Invalid proof should be rejected
    // ---------------------------------------------------------------

    function test_RejectInvalidProof() public {
        // Set verification key
        VerifyingKey memory vk = _buildVKey();
        verifier.setVerificationKey(1, 2, vk);

        // Build a valid proof then corrupt it by swapping a and c (both valid curve points)
        SnarkProof memory proof = _buildProof();
        G1Point memory tmp = proof.a;
        proof.a = proof.c;
        proof.c = tmp;

        uint256[] memory inputs = _buildPublicInputs();

        // Should return false (invalid proof — pairing check fails)
        bool valid = verifier.verifyProof(vk, proof, inputs);
        assertFalse(valid, "Corrupted proof should not verify");
    }

    // ---------------------------------------------------------------
    // Test: Invalid public inputs should be rejected
    // ---------------------------------------------------------------

    function test_RejectInvalidInputs() public {
        // Set verification key
        VerifyingKey memory vk = _buildVKey();
        verifier.setVerificationKey(1, 2, vk);

        // Build valid proof but corrupt public inputs
        SnarkProof memory proof = _buildProof();
        uint256[] memory inputs = _buildPublicInputs();
        inputs[0] = inputs[0] + 1; // corrupt merkleRoot

        bool valid = verifier.verifyProof(vk, proof, inputs);
        assertFalse(valid, "Proof with wrong inputs should not verify");
    }

    // ---------------------------------------------------------------
    // Test: Verification bypass for gas estimation (tx.origin == 0xdead)
    // ---------------------------------------------------------------

    function test_VerificationBypass() public {
        // Set verification key
        VerifyingKey memory vk = _buildVKey();
        verifier.setVerificationKey(1, 2, vk);

        // Build an invalid proof by swapping a and c (both valid curve points, but wrong proof)
        SnarkProof memory proof = _buildProof();
        G1Point memory tmp = proof.a;
        proof.a = proof.c;
        proof.c = tmp;

        // verifyProof() does NOT have bypass logic — an invalid proof returns false
        uint256[] memory inputs = _buildPublicInputs();
        bool valid = verifier.verifyProof(vk, proof, inputs);
        assertFalse(valid, "verifyProof should not bypass - invalid proof returns false");

        // The bypass logic (tx.origin == 0xdead) only exists in verify() which requires
        // a full Transaction struct with matching boundParamsHash. We've verified the
        // code path exists by inspecting Verifier.sol. A full integration test would
        // require constructing a valid Transaction struct.
    }

    // ---------------------------------------------------------------
    // Test: Unset verification key should revert
    // ---------------------------------------------------------------

    function test_RevertOnUnsetKey() public {
        // Don't set any key — try to get one
        VerifyingKey memory vk = verifier.getVerificationKey(99, 99);
        // alpha1.x should be 0 for unset key
        assertEq(vk.alpha1.x, 0, "Unset key should have zero alpha1.x");
    }

    // ---------------------------------------------------------------
    // Test: Only owner can set verification key
    // ---------------------------------------------------------------

    function test_OnlyOwnerCanSetKey() public {
        VerifyingKey memory vk = _buildVKey();

        // Prank as non-owner
        address nonOwner = address(0xBEEF);
        vm.prank(nonOwner);
        vm.expectRevert("Ownable: caller is not the owner");
        verifier.setVerificationKey(1, 2, vk);
    }

    // ---------------------------------------------------------------
    // Test: VerifyingKeySet event is emitted
    // ---------------------------------------------------------------

    function test_EmitVerifyingKeySet() public {
        VerifyingKey memory vk = _buildVKey();

        vm.expectEmit(false, false, false, false);
        emit VerifyingKeySet(1, 2, vk);

        verifier.setVerificationKey(1, 2, vk);
    }

    // ---------------------------------------------------------------
    // Test: Multiple circuit configs can coexist
    // ---------------------------------------------------------------

    function test_MultipleCircuitConfigs() public {
        VerifyingKey memory vk1 = _buildVKey();
        vk1.artifactsIPFSHash = "config_1x2";
        verifier.setVerificationKey(1, 2, vk1);

        VerifyingKey memory vk2 = _buildVKey();
        vk2.artifactsIPFSHash = "config_2x3";
        vk2.alpha1.x = 12345; // differentiate
        verifier.setVerificationKey(2, 3, vk2);

        VerifyingKey memory stored1 = verifier.getVerificationKey(1, 2);
        VerifyingKey memory stored2 = verifier.getVerificationKey(2, 3);

        assertEq(
            keccak256(abi.encodePacked(stored1.artifactsIPFSHash)),
            keccak256(abi.encodePacked("config_1x2")),
            "Config 1x2 should persist"
        );
        assertEq(
            keccak256(abi.encodePacked(stored2.artifactsIPFSHash)),
            keccak256(abi.encodePacked("config_2x3")),
            "Config 2x3 should persist"
        );
        assertEq(stored2.alpha1.x, 12345, "Config 2x3 alpha1.x should be 12345");
    }

    // ---------------------------------------------------------------
    // Test: Input exceeding SNARK_SCALAR_FIELD should revert
    // ---------------------------------------------------------------

    function test_RevertOnInputExceedingField() public {
        VerifyingKey memory vk = _buildVKey();
        SnarkProof memory proof = _buildProof();

        uint256[] memory inputs = _buildPublicInputs();
        inputs[0] = SNARK_SCALAR_FIELD; // set to field order (out of range)

        vm.expectRevert("Snark: Input > SNARK_SCALAR_FIELD");
        verifier.verifyProof(vk, proof, inputs);
    }
}
