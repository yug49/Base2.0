/**
 * ShadowBase — Phase 1: Verify VKey Matches RAILGUN Sepolia Deployment
 *
 * Queries the RAILGUN contract on Sepolia at 0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea
 * for the verification key of the 01x02 circuit (1 nullifier, 2 commitments),
 * and compares it against our local vkey extracted from railgun-circuit-test-artifacts.
 *
 * Uses `cast call` (Foundry) to query the on-chain data, then decodes and compares.
 *
 * Usage: node scripts/verify-sepolia-vkey.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAILGUN_SEPOLIA = "0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea";
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const LOCAL_VKEY_PATH = path.join(__dirname, "../circuits/vkey-1x2.json");

// Function selector: getVerificationKey(uint256,uint256) = 0x7b12ae83
const FUNC_SELECTOR = "0x7b12ae83";

function encodeUint256(n) {
  return BigInt(n).toString(16).padStart(64, "0");
}

function decodeUint256(hex64) {
  return BigInt("0x" + hex64).toString("10");
}

/**
 * Decode a VerifyingKey struct from ABI-encoded hex data.
 *
 * Layout (all offsets relative to struct start at slot 1):
 *   slot 0: offset to struct (0x20)
 *   slot 1+0: offset to artifactsIPFSHash string
 *   slot 1+1: alpha1.x
 *   slot 1+2: alpha1.y
 *   slot 1+3..6: beta2 (x[0], x[1], y[0], y[1])
 *   slot 1+7..10: gamma2
 *   slot 1+11..14: delta2
 *   slot 1+15: offset to ic[] array
 *   ... then dynamic data (string content, array elements)
 */
function decodeVerifyingKey(hexData) {
  const data = hexData.startsWith("0x") ? hexData.slice(2) : hexData;
  const slot = (i) => data.slice(i * 64, (i + 1) * 64);
  const slotVal = (i) => decodeUint256(slot(i));

  const structOffset = parseInt(slot(0), 16) / 32;
  const base = structOffset;

  // IPFS hash string
  const ipfsOffset = parseInt(slot(base + 0), 16) / 32;
  const ipfsLenSlot = base + ipfsOffset;
  const ipfsLen = parseInt(slot(ipfsLenSlot), 16);
  const ipfsHex = data.slice((ipfsLenSlot + 1) * 64, (ipfsLenSlot + 1) * 64 + ipfsLen * 2);
  const ipfsHash = Buffer.from(ipfsHex, "hex").toString("utf8");

  const alpha1 = { x: slotVal(base + 1), y: slotVal(base + 2) };
  const beta2 = {
    x: [slotVal(base + 3), slotVal(base + 4)],
    y: [slotVal(base + 5), slotVal(base + 6)],
  };
  const gamma2 = {
    x: [slotVal(base + 7), slotVal(base + 8)],
    y: [slotVal(base + 9), slotVal(base + 10)],
  };
  const delta2 = {
    x: [slotVal(base + 11), slotVal(base + 12)],
    y: [slotVal(base + 13), slotVal(base + 14)],
  };

  // IC array
  const icOffset = parseInt(slot(base + 15), 16) / 32;
  const icBase = base + icOffset;
  const icLen = parseInt(slot(icBase), 16);
  const ic = [];
  for (let i = 0; i < icLen; i++) {
    ic.push({ x: slotVal(icBase + 1 + i * 2), y: slotVal(icBase + 2 + i * 2) });
  }

  return { artifactsIPFSHash: ipfsHash, alpha1, beta2, gamma2, delta2, ic };
}

/**
 * Query Sepolia using cast call (Foundry CLI)
 */
function queryViaCast(nullifiers, commitments) {
  const calldata = FUNC_SELECTOR + encodeUint256(nullifiers) + encodeUint256(commitments);
  try {
    const result = execSync(
      `cast call ${RAILGUN_SEPOLIA} ${calldata} --rpc-url ${SEPOLIA_RPC} 2>/dev/null`,
      { encoding: "utf-8", timeout: 30000 }
    ).trim();
    return result;
  } catch (e) {
    return null;
  }
}

/**
 * Query Sepolia using fetch (fallback)
 */
async function queryViaFetch(nullifiers, commitments) {
  const calldata = FUNC_SELECTOR + encodeUint256(nullifiers) + encodeUint256(commitments);
  const rpcs = [
    SEPOLIA_RPC,
    "https://rpc.sepolia.org",
    "https://sepolia.gateway.tenderly.co",
    "https://1rpc.io/sepolia",
  ];
  for (const rpc of rpcs) {
    try {
      const resp = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "eth_call",
          params: [{ to: RAILGUN_SEPOLIA, data: "0x" + calldata }, "latest"],
        }),
        signal: AbortSignal.timeout(10000),
      });
      const json = await resp.json();
      if (json.result && json.result !== "0x") return json.result;
    } catch {}
  }
  return null;
}

/**
 * Compare two vkeys field by field, return true if all match
 */
function compareVKeys(onchain, local) {
  let allMatch = true;
  let checked = 0;

  function check(label, a, b) {
    checked++;
    if (a === b) {
      console.log(`  [OK] ${label}`);
    } else {
      console.log(`  [FAIL] ${label}`);
      console.log(`    on-chain: ${a}`);
      console.log(`    local:    ${b}`);
      allMatch = false;
    }
  }

  check("artifactsIPFSHash", onchain.artifactsIPFSHash, local.artifactsIPFSHash);
  check("alpha1.x", onchain.alpha1.x, local.alpha1.x);
  check("alpha1.y", onchain.alpha1.y, local.alpha1.y);

  for (const g2 of ["beta2", "gamma2", "delta2"]) {
    check(`${g2}.x[0]`, onchain[g2].x[0], local[g2].x[0]);
    check(`${g2}.x[1]`, onchain[g2].x[1], local[g2].x[1]);
    check(`${g2}.y[0]`, onchain[g2].y[0], local[g2].y[0]);
    check(`${g2}.y[1]`, onchain[g2].y[1], local[g2].y[1]);
  }

  if (onchain.ic.length !== local.ic.length) {
    console.log(`  [FAIL] ic.length: on-chain=${onchain.ic.length}, local=${local.ic.length}`);
    allMatch = false;
  } else {
    console.log(`  [OK] ic.length: ${onchain.ic.length}`);
    for (let i = 0; i < onchain.ic.length; i++) {
      check(`ic[${i}].x`, onchain.ic[i].x, local.ic[i].x);
      check(`ic[${i}].y`, onchain.ic[i].y, local.ic[i].y);
    }
  }

  return { allMatch, checked };
}

async function main() {
  console.log("=== ShadowBase Phase 1: Sepolia VKey Verification ===\n");
  console.log(`RAILGUN Sepolia: ${RAILGUN_SEPOLIA}`);
  console.log(`Circuit: 01x02 (1 nullifier, 2 commitments)\n`);

  // Load local vkey
  if (!fs.existsSync(LOCAL_VKEY_PATH)) {
    console.error("ERROR: Local vkey not found. Run 'npm run extract-vkeys' first.");
    process.exit(1);
  }
  const localVkey = JSON.parse(fs.readFileSync(LOCAL_VKEY_PATH, "utf-8"));
  console.log("[OK] Loaded local vkey from circuits/vkey-1x2.json\n");

  // Query Sepolia — try cast first, then fetch
  console.log("[..] Querying RAILGUN Sepolia for getVerificationKey(1, 2)...");
  let result = queryViaCast(1, 2);
  if (result) {
    console.log("[OK] Got response via cast\n");
  } else {
    console.log("[..] cast failed, trying fetch...");
    result = await queryViaFetch(1, 2);
    if (result) {
      console.log("[OK] Got response via fetch\n");
    } else {
      console.error("\nERROR: Could not reach Sepolia. Try manually:");
      console.error(`  cast call ${RAILGUN_SEPOLIA} "getVerificationKey(uint256,uint256)" 1 2 --rpc-url <YOUR_RPC>`);
      process.exit(1);
    }
  }

  // Check for empty/zero response
  const nonZero = result.replace(/0/g, "").replace("x", "");
  if (nonZero.length < 10) {
    console.log("WARNING: On-chain vkey appears empty (key not set for 1x2 config).");
    process.exit(1);
  }

  // Decode on-chain vkey
  console.log("[..] Decoding on-chain VerifyingKey struct...");
  const onchainVkey = decodeVerifyingKey(result);
  console.log("[OK] Decoded successfully\n");

  // Print on-chain values
  console.log("=== On-Chain VKey ===");
  console.log(`  artifactsIPFSHash: ${onchainVkey.artifactsIPFSHash}`);
  console.log(`  alpha1: (${onchainVkey.alpha1.x.slice(0, 30)}..., ${onchainVkey.alpha1.y.slice(0, 30)}...)`);
  console.log(`  ic.length: ${onchainVkey.ic.length}`);
  console.log("");

  // Compare
  console.log("=== Comparing with local vkey-1x2.json ===\n");
  const { allMatch, checked } = compareVKeys(onchainVkey, localVkey);

  console.log("");
  if (allMatch) {
    console.log(`RESULT: ALL ${checked} FIELDS MATCH - our local vkey is identical to RAILGUN Sepolia`);
  } else {
    console.log("RESULT: SOME FIELDS DIFFER - check output above for mismatches");
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
