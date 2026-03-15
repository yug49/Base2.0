/**
 * ShadowBase — Phase 1: Extract Verification Keys from RAILGUN Circuit Artifacts
 *
 * Reads vkey.json from railgun-circuit-test-artifacts, formats them into
 * Solidity-compatible structs, and writes JSON fixtures that Foundry tests
 * can load via vm.readFile / vm.parseJson.
 *
 * Usage: node scripts/extract-vkeys.js
 */

const fs = require("fs");
const path = require("path");

const ARTIFACTS_DIR = path.join(
  __dirname,
  "../railgun-contract/node_modules/railgun-circuit-test-artifacts/circuits"
);
const OUTPUT_DIR = path.join(__dirname, "../circuits");

// Circuit configs we care about for testing (subset matching RAILGUN's testing subset)
const CIRCUIT_CONFIGS = [
  { nullifiers: 1, commitments: 2 },
  { nullifiers: 2, commitments: 3 },
  { nullifiers: 8, commitments: 4 },
  { nullifiers: 12, commitments: 2 },
];

// IPFS hashes from RAILGUN (for on-chain vkey metadata)
const IPFS_HASHES = {
  "01x02": "QmWFEVTTH3kdFxA8GLUKnCNZe5JwTVy7nJi2HgnzbVBLF4",
  "02x03": "QmTjRNAmvNx6p3rNJXmLdifygGTbxnwgj2wSJBBCVi2y1F",
  "08x04": "QmfCJTzk6yL9MGkieF3uiRJvqr4HpkJA7y3oPVLHzUGtC9",
  "12x02": "QmWqzXDZ6Kqy5imBM8TJBHDNo7oNWoLgrgohhsC3Ekuhwc",
};

function circuitName(n, c) {
  return `${n.toString().padStart(2, "0")}x${c.toString().padStart(2, "0")}`;
}

/**
 * Format a raw vkey.json into Solidity-compatible VerifyingKey struct values.
 * IMPORTANT: G2 point coordinate order is REVERSED for Solidity (x[1],x[0] → x[0]*z+x[1])
 */
function formatVKeyForSolidity(vkey, ipfsHash) {
  return {
    artifactsIPFSHash: ipfsHash,
    alpha1: {
      x: vkey.vk_alpha_1[0],
      y: vkey.vk_alpha_1[1],
    },
    beta2: {
      x: [vkey.vk_beta_2[0][1], vkey.vk_beta_2[0][0]],
      y: [vkey.vk_beta_2[1][1], vkey.vk_beta_2[1][0]],
    },
    gamma2: {
      x: [vkey.vk_gamma_2[0][1], vkey.vk_gamma_2[0][0]],
      y: [vkey.vk_gamma_2[1][1], vkey.vk_gamma_2[1][0]],
    },
    delta2: {
      x: [vkey.vk_delta_2[0][1], vkey.vk_delta_2[0][0]],
      y: [vkey.vk_delta_2[1][1], vkey.vk_delta_2[1][0]],
    },
    ic: vkey.IC.map((icEl) => ({
      x: icEl[0],
      y: icEl[1],
    })),
  };
}

function main() {
  // Ensure output dir exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const allKeys = {};

  for (const config of CIRCUIT_CONFIGS) {
    const name = circuitName(config.nullifiers, config.commitments);
    const vkeyPath = path.join(ARTIFACTS_DIR, name, "vkey.json");

    if (!fs.existsSync(vkeyPath)) {
      console.error(`[SKIP] vkey.json not found for ${name}`);
      continue;
    }

    const rawVkey = JSON.parse(fs.readFileSync(vkeyPath, "utf-8"));
    const ipfsHash = IPFS_HASHES[name] || "";
    const solidityVkey = formatVKeyForSolidity(rawVkey, ipfsHash);

    allKeys[name] = {
      nullifiers: config.nullifiers,
      commitments: config.commitments,
      nPublic: rawVkey.nPublic,
      rawVkey,
      solidityVkey,
    };

    console.log(
      `[OK] ${name}: nPublic=${rawVkey.nPublic}, IC length=${rawVkey.IC.length}`
    );
  }

  // Write combined output
  const outputPath = path.join(OUTPUT_DIR, "vkeys.json");
  fs.writeFileSync(outputPath, JSON.stringify(allKeys, null, 2));
  console.log(`\nWrote ${Object.keys(allKeys).length} vkeys to ${outputPath}`);

  // Also write a minimal vkey for the simplest circuit (1x02) for Foundry test fixture
  const primary = allKeys["01x02"];
  if (primary) {
    const fixturePath = path.join(OUTPUT_DIR, "vkey-1x2.json");
    fs.writeFileSync(
      fixturePath,
      JSON.stringify(primary.solidityVkey, null, 2)
    );
    console.log(`Wrote primary test vkey to ${fixturePath}`);
  }
}

main();
