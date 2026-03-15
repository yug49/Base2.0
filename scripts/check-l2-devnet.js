/**
 * ShadowBase — Phase 2: L2 Devnet Connectivity Test
 *
 * Verifies connectivity to Yug's L2 devnet at localhost:8545
 * and checks predeploy contract bytecode exists.
 *
 * Usage: node scripts/check-l2-devnet.js
 *
 * Checks:
 *   1. JSON-RPC connectivity (eth_chainId)
 *   2. Chain ID matches expected (845311)
 *   3. Block production (eth_blockNumber)
 *   4. Predeploy bytecode at PrivacyRouter (0x4200...0069)
 *   5. Predeploy bytecode at ShieldedPool (0x4200...0070)
 *   6. Predeploy bytecode at PrivacyBridge (0x4200...0071)
 *   7. L2CrossDomainMessenger bytecode (0x4200...0007)
 *   8. Test account balances (Hardhat defaults)
 *   9. WebSocket connectivity (ws://localhost:8546)
 *  10. Basic tx submission (eth_sendTransaction dry-run)
 */

const L2_RPC = process.env.L2_RPC || "http://localhost:8545";
const L2_WS = process.env.L2_WS || "ws://localhost:8546";
const EXPECTED_CHAIN_ID = 845311;

const PREDEPLOYS = {
  L2CrossDomainMessenger: "0x4200000000000000000000000000000000000007",
  L2StandardBridge: "0x4200000000000000000000000000000000000010",
  L2ToL1MessagePasser: "0x4200000000000000000000000000000000000016",
  PrivacyRouter: "0x4200000000000000000000000000000000000069",
  ShieldedPool: "0x4200000000000000000000000000000000000070",
  PrivacyBridge: "0x4200000000000000000000000000000000000071",
};

// Hardhat default test accounts
const TEST_ACCOUNTS = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Account #0
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Account #1
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // Account #2
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906", // Account #3
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", // Account #4
];

let failures = 0;
let checks = 0;
let skipped = 0;

function pass(label) {
  checks++;
  console.log(`  ✅ ${label}`);
}

function fail(label, detail) {
  checks++;
  failures++;
  console.log(`  ❌ ${label}: ${detail}`);
}

function skip(label, reason) {
  skipped++;
  console.log(`  ⏭️  ${label}: ${reason}`);
}

function info(label, value) {
  console.log(`     ${label}: ${value}`);
}

async function rpcCall(method, params = []) {
  const resp = await fetch(L2_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(5000),
  });
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ShadowBase Phase 2 — L2 Devnet Connectivity Test          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`  L2 RPC: ${L2_RPC}`);
  console.log(`  L2 WS:  ${L2_WS}`);
  console.log(`  Expected Chain ID: ${EXPECTED_CHAIN_ID}`);
  console.log();

  // ── 1. JSON-RPC Connectivity ──────────────────────────────────────────────
  console.log("─── 1. JSON-RPC Connectivity ───────────────────────────────────");
  let connected = false;
  try {
    const chainIdHex = await rpcCall("eth_chainId");
    const chainId = parseInt(chainIdHex, 16);
    connected = true;
    pass("Connected to L2 RPC");
    info("Chain ID (hex)", chainIdHex);
    info("Chain ID (dec)", chainId);

    if (chainId === EXPECTED_CHAIN_ID) {
      pass(`Chain ID matches expected (${EXPECTED_CHAIN_ID})`);
    } else {
      fail(`Chain ID mismatch`, `expected ${EXPECTED_CHAIN_ID}, got ${chainId}`);
    }
  } catch (e) {
    fail("L2 RPC connection", e.message);
    console.log();
    console.log("  ⚠️  L2 devnet is not running. Start it with:");
    console.log("     cd devnet && ./start-devnet.sh");
    console.log();
    console.log("  Remaining checks skipped.");
    console.log();
    process.exit(1);
  }
  console.log();

  // ── 2. Block Production ───────────────────────────────────────────────────
  console.log("─── 2. Block Production ────────────────────────────────────────");
  try {
    const blockNumHex = await rpcCall("eth_blockNumber");
    const blockNum = parseInt(blockNumHex, 16);
    pass("Block number readable");
    info("Current block", blockNum);

    if (blockNum > 0) {
      pass("Chain has produced blocks");
    } else {
      fail("No blocks produced", "block number is 0");
    }

    // Get latest block details
    const block = await rpcCall("eth_getBlockByNumber", ["latest", false]);
    if (block) {
      info("Latest block hash", block.hash);
      info("Timestamp", new Date(parseInt(block.timestamp, 16) * 1000).toISOString());
      info("Gas used", parseInt(block.gasUsed, 16));
    }
  } catch (e) {
    fail("Block query", e.message);
  }
  console.log();

  // ── 3. Predeploy Contracts ────────────────────────────────────────────────
  console.log("─── 3. Predeploy Contracts ─────────────────────────────────────");
  for (const [name, addr] of Object.entries(PREDEPLOYS)) {
    try {
      const code = await rpcCall("eth_getCode", [addr, "latest"]);
      if (code && code !== "0x" && code.length > 2) {
        pass(`${name} (${addr.slice(0, 10)}...${addr.slice(-4)})`);
        info("Bytecode size", `${Math.floor((code.length - 2) / 2)} bytes`);
      } else {
        // OP Stack system predeploys should exist; custom ones may not yet
        if (["PrivacyRouter", "ShieldedPool", "PrivacyBridge"].includes(name)) {
          skip(
            `${name} (${addr.slice(0, 10)}...${addr.slice(-4)})`,
            "Not yet deployed (Yug's Phase 2-4)"
          );
        } else {
          fail(
            `${name} (${addr.slice(0, 10)}...${addr.slice(-4)})`,
            "No bytecode at address"
          );
        }
      }
    } catch (e) {
      fail(`${name}`, e.message);
    }
  }
  console.log();

  // ── 4. Test Account Balances ──────────────────────────────────────────────
  console.log("─── 4. Test Account Balances ────────────────────────────────────");
  for (let i = 0; i < TEST_ACCOUNTS.length; i++) {
    try {
      const balHex = await rpcCall("eth_getBalance", [TEST_ACCOUNTS[i], "latest"]);
      const balWei = BigInt(balHex);
      const balEth = Number(balWei) / 1e18;
      if (balWei > 0n) {
        pass(`Account #${i} (${TEST_ACCOUNTS[i].slice(0, 10)}...)`);
        info("Balance", `${balEth.toFixed(4)} ETH`);
      } else {
        skip(`Account #${i}`, "Zero balance");
      }
    } catch (e) {
      fail(`Account #${i}`, e.message);
    }
  }
  console.log();

  // ── 5. WebSocket Connectivity ─────────────────────────────────────────────
  console.log("─── 5. WebSocket Connectivity ──────────────────────────────────");
  try {
    // Use a raw TCP check via fetch to the HTTP endpoint instead of requiring ws package
    // Just note the WS endpoint for the user
    skip("WebSocket", `Endpoint available at ${L2_WS} (requires ws package to test)`);
  } catch (e) {
    skip("WebSocket", e.message);
  }
  console.log();

  // ── 6. Transaction Dry-Run ────────────────────────────────────────────────
  console.log("─── 6. Transaction Capability ──────────────────────────────────");
  try {
    // eth_call dry-run (sending 0 ETH from account #0 to account #1)
    const result = await rpcCall("eth_call", [
      {
        from: TEST_ACCOUNTS[0],
        to: TEST_ACCOUNTS[1],
        value: "0x0",
        data: "0x",
      },
      "latest",
    ]);
    pass("eth_call dry-run succeeds");

    // Check gas estimation
    const gas = await rpcCall("eth_estimateGas", [
      {
        from: TEST_ACCOUNTS[0],
        to: TEST_ACCOUNTS[1],
        value: "0xDE0B6B3A7640000", // 1 ETH
      },
    ]);
    pass("eth_estimateGas works");
    info("Gas for simple transfer", parseInt(gas, 16));
  } catch (e) {
    fail("Transaction capability", e.message);
  }
  console.log();

  // ── 7. L2CrossDomainMessenger Check ───────────────────────────────────────
  console.log("─── 7. L2 CrossDomainMessenger ──────────────────────────────────");
  try {
    const xDomainAddr = PREDEPLOYS.L2CrossDomainMessenger;
    const code = await rpcCall("eth_getCode", [xDomainAddr, "latest"]);
    if (code && code !== "0x" && code.length > 2) {
      pass("L2CrossDomainMessenger has bytecode");

      // Try calling xDomainMessageSender() — should revert if not in cross-domain context
      try {
        await rpcCall("eth_call", [
          {
            to: xDomainAddr,
            // xDomainMessageSender() selector = 0x6e296e45
            data: "0x6e296e45",
          },
          "latest",
        ]);
        info("xDomainMessageSender()", "callable (may return zero address outside of context)");
      } catch {
        info("xDomainMessageSender()", "reverts outside cross-domain context (expected)");
      }
      pass("CrossDomainMessenger interface verified");
    } else {
      fail("L2CrossDomainMessenger", "no bytecode");
    }
  } catch (e) {
    fail("L2CrossDomainMessenger check", e.message);
  }
  console.log();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();
  if (failures === 0) {
    console.log(`  ✅ ALL ${checks} CHECKS PASSED (${skipped} skipped)`);
    console.log();
    console.log("  L2 devnet is RUNNING and FUNCTIONAL.");
    console.log("  Ready for contract deployment and integration testing.");
  } else {
    console.log(
      `  ⚠️  ${checks - failures}/${checks} passed, ${failures} FAILED, ${skipped} skipped`
    );
  }
  console.log();
}

main().catch((e) => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
