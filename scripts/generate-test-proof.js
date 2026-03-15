/**
 * ShadowBase — Phase 1: Generate Test Proof from RAILGUN Circuit Test Vectors
 *
 * Uses the 01x02 circuit (1 nullifier, 2 commitments) with test vectors from
 * railgun-circuits/test/vectors.json to generate a real Groth16 proof via snarkjs.
 * Outputs proof + public signals as JSON fixture for Foundry tests.
 *
 * Usage: node scripts/generate-test-proof.js
 */

const fs = require("fs");
const path = require("path");
const { groth16 } = require("snarkjs");

// Paths — use process.cwd() for reliable resolution from project root
const ROOT = process.cwd();
const VECTORS_PATH = path.join(
  ROOT,
  "railgun-circuits/test/vectors.json"
);
const ARTIFACTS_PKG = path.join(
  ROOT,
  "railgun-contract/node_modules/railgun-circuit-test-artifacts"
);
const OUTPUT_DIR = path.join(ROOT, "circuits");

/**
 * Format snarkjs proof to Solidity-compatible format.
 * IMPORTANT: G2 point (pi_b) coordinate order is REVERSED for Solidity
 */
function formatProofForSolidity(proof) {
  return {
    a: {
      x: proof.pi_a[0],
      y: proof.pi_a[1],
    },
    b: {
      // G2 reversal: [inner1, inner0] for both x and y
      x: [proof.pi_b[0][1], proof.pi_b[0][0]],
      y: [proof.pi_b[1][1], proof.pi_b[1][0]],
    },
    c: {
      x: proof.pi_c[0],
      y: proof.pi_c[1],
    },
  };
}

async function main() {
  console.log("=== ShadowBase Phase 1: Proof Generation ===\n");

  // 1. Load test vectors
  if (!fs.existsSync(VECTORS_PATH)) {
    console.error("ERROR: Test vectors not found at", VECTORS_PATH);
    process.exit(1);
  }
  const vectors = JSON.parse(fs.readFileSync(VECTORS_PATH, "utf-8"));
  const testInput = vectors.testInputs["01x02"];
  if (!testInput) {
    console.error('ERROR: No test input found for circuit config "01x02"');
    process.exit(1);
  }
  console.log("[OK] Loaded test vectors for 01x02");

  // 2. Load circuit artifacts (wasm + zkey via the artifacts package, which handles brotli decompression)
  const artifactsPkg = require(ARTIFACTS_PKG);
  console.log("[..] Loading artifacts (brotli decompression)...");
  const artifact = artifactsPkg.getArtifact(1, 2);
  console.log(
    `[OK] Loaded artifacts: wasm=${artifact.wasm.length} bytes, zkey=${artifact.zkey.length} bytes`
  );

  // 3. Format circuit inputs exactly as RAILGUN expects them
  // The circuit template is JoinSplit(nInputs=1, nOutputs=2, MerkleTreeDepth=16)
  // Public signals: merkleRoot, boundParamsHash, nullifiers[1], commitmentsOut[2]
  // Private signals: token, publicKey[2], signature[3], randomIn[1], valueIn[1],
  //                  pathElements[1][16], leavesIndices[1], nullifyingKey, npkOut[2], valueOut[2]
  const circuitInputs = {
    merkleRoot: testInput.merkleRoot,
    boundParamsHash: testInput.boundParamsHash,
    nullifiers: testInput.nullifiers,
    commitmentsOut: testInput.commitmentsOut,
    token: testInput.token,
    publicKey: testInput.publicKey,
    signature: testInput.signature,
    randomIn: testInput.randomIn,
    valueIn: testInput.valueIn,
    pathElements: testInput.pathElements,
    leavesIndices: testInput.leavesIndices,
    nullifyingKey: testInput.nullifyingKey,
    npkOut: testInput.npkOut,
    valueOut: testInput.valueOut,
  };
  console.log("[OK] Formatted circuit inputs");

  // 4. Generate proof
  console.log("[..] Generating Groth16 proof (this may take a moment)...");
  const startTime = Date.now();
  const { proof, publicSignals } = await groth16.fullProve(
    circuitInputs,
    artifact.wasm,
    artifact.zkey
  );
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[OK] Proof generated in ${elapsed}s`);
  console.log(`     Public signals (${publicSignals.length}):`, publicSignals);

  // 5. Verify proof locally with snarkjs before writing
  const vkey = artifactsPkg.getVKey(1, 2);
  const valid = await groth16.verify(vkey, publicSignals, proof);
  console.log(`[${valid ? "OK" : "FAIL"}] Local snarkjs verification: ${valid}`);
  if (!valid) {
    console.error("ERROR: Proof failed local verification! Aborting.");
    process.exit(1);
  }

  // 6. Format for Solidity and write output
  const solidityProof = formatProofForSolidity(proof);

  // Public signals order from snarkjs: merkleRoot, boundParamsHash, nullifiers..., commitments...
  // This matches the order in Verifier.sol's verify() function
  const fixture = {
    nullifiers: 1,
    commitments: 2,
    proof: solidityProof,
    publicSignals: publicSignals,
    // Break out individual signals for clarity
    merkleRoot: publicSignals[0],
    boundParamsHash: publicSignals[1],
    nullifiersList: publicSignals.slice(2, 3),
    commitmentsList: publicSignals.slice(3, 5),
    // Raw snarkjs proof for reference
    rawProof: proof,
  };

  // Ensure output dir exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, "test-proof-1x2.json");
  fs.writeFileSync(outputPath, JSON.stringify(fixture, null, 2));
  console.log(`\n[OK] Wrote test proof fixture to ${outputPath}`);

  // Also output a summary for quick reference
  console.log("\n=== Fixture Summary ===");
  console.log(`Proof A: (${solidityProof.a.x.substring(0, 20)}..., ${solidityProof.a.y.substring(0, 20)}...)`);
  console.log(`Proof B.x: [${solidityProof.b.x[0].substring(0, 20)}..., ${solidityProof.b.x[1].substring(0, 20)}...]`);
  console.log(`Proof C: (${solidityProof.c.x.substring(0, 20)}..., ${solidityProof.c.y.substring(0, 20)}...)`);
  console.log(`Merkle Root: ${fixture.merkleRoot}`);
  console.log(`Bound Params Hash: ${fixture.boundParamsHash}`);
  console.log(`Nullifiers: [${fixture.nullifiersList.join(", ")}]`);
  console.log(`Commitments: [${fixture.commitmentsList.join(", ")}]`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
