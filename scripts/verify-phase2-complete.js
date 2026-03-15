/**
 * ShadowBase — Phase 2 Completion Verification
 * 
 * Verifies all L1 OP Stack contracts deployed by Yug on Sepolia have bytecode,
 * confirms CrossDomainMessenger is live, and validates deployment addresses.
 *
 * Usage: node scripts/verify-phase2-complete.js
 */

const { execSync } = require("child_process");

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

// All addresses from Yug's deployment (devnet/ADDRESSES.md)
const L1_CONTRACTS = {
  OptimismPortalProxy: "0x616e29f64cadd5da342aed7a0ee73e2afb703941",
  L1CrossDomainMessengerProxy: "0x579aaf4e08b072b3b53148a260913837518a0ab8",
  L1StandardBridgeProxy: "0x8ca729aa55033424619187f1231f2e9be4c50f62",
  SystemConfigProxy: "0xda24880f952e68e32ed1efdd13831d86313af906",
  DisputeGameFactoryProxy: "0x36b9a2d477707ad4cacfa64ec74db3fe30425e90",
  L1ERC721BridgeProxy: "0xe3a1f68e2de91f4a9bc9031b02a92739d98befa1",
  AnchorStateRegistryProxy: "0xf0601ab153fdc1e389449b23fd3d52647e3a0829",
  SuperchainConfigProxy: "0x52a14d4d1d8fdd569c5f4eae7ab445a5a812cc62",
  EthLockboxProxy: "0xf8e78c7dea155c2996719ea0e956bda9edf6135a",
  OptimismMintableERC20FactoryProxy: "0x37e74250329240f1cb783776476f89d3f2ad5682",
};

const RAILGUN_SEPOLIA = "0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea";

let passed = 0;
let failed = 0;

function cast(args) {
  try {
    return execSync(`cast ${args} --rpc-url ${SEPOLIA_RPC} 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 15000,
    }).trim();
  } catch {
    return null;
  }
}

function check(label, result) {
  if (result) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
}

function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ShadowBase Phase 2 — L1 Deployment Verification           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();

  // 1. Verify all L1 OP Stack contracts have bytecode
  console.log("─── 1. L1 OP Stack Contracts (Sepolia) ─────────────────────────");
  for (const [name, addr] of Object.entries(L1_CONTRACTS)) {
    const code = cast(`code ${addr}`);
    const hasBytecode = code && code !== "0x" && code.length > 10;
    check(`${name} (${addr.slice(0, 10)}...)`, hasBytecode);
    if (hasBytecode) {
      console.log(`     Bytecode size: ${(code.length - 2) / 2} bytes`);
    }
  }

  // 2. CrossDomainMessenger specific checks
  console.log();
  console.log("─── 2. CrossDomainMessenger Detailed Check ─────────────────────");
  const messengerAddr = L1_CONTRACTS.L1CrossDomainMessengerProxy;
  
  // Check messageNonce
  const nonce = cast(`call ${messengerAddr} "messageNonce()(uint256)"`);
  check("messageNonce() callable", nonce !== null);
  if (nonce) console.log(`     Message nonce: ${nonce}`);

  // Check OTHER target — should have the L2 messenger as target
  const otherMessenger = cast(`call ${messengerAddr} "OTHER_MESSENGER()(address)"`);
  if (otherMessenger) {
    check("OTHER_MESSENGER() returns L2 predeploy", 
      otherMessenger.toLowerCase().includes("4200000000000000000000000000000000000007"));
    console.log(`     OTHER_MESSENGER: ${otherMessenger}`);
  } else {
    // Try otherMessenger() (different naming convention)
    const other2 = cast(`call ${messengerAddr} "otherMessenger()(address)"`);
    check("otherMessenger() callable", other2 !== null);
    if (other2) console.log(`     otherMessenger: ${other2}`);
  }

  // 3. OptimismPortal check
  console.log();
  console.log("─── 3. OptimismPortal Check ────────────────────────────────────");
  const portalAddr = L1_CONTRACTS.OptimismPortalProxy;
  const guardian = cast(`call ${portalAddr} "guardian()(address)"`);
  check("guardian() callable", guardian !== null);
  if (guardian) console.log(`     Guardian: ${guardian}`);
  
  const paused = cast(`call ${portalAddr} "paused()(bool)"`);
  check("paused() callable", paused !== null);
  if (paused) console.log(`     Paused: ${paused}`);

  // 4. RAILGUN still accessible
  console.log();
  console.log("─── 4. RAILGUN Sepolia ─────────────────────────────────────────");
  const railCode = cast(`code ${RAILGUN_SEPOLIA}`);
  check("RAILGUN contract has bytecode", railCode && railCode !== "0x" && railCode.length > 10);

  // Summary
  console.log();
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();
  if (failed === 0) {
    console.log(`  ✅ ALL ${passed} CHECKS PASSED`);
    console.log();
    console.log("  Phase 2 L1 verification COMPLETE.");
    console.log("  All OP Stack contracts are live on Sepolia.");
    console.log("  CrossDomainMessenger ready for L1↔L2 messaging.");
    console.log("  RAILGUN Sepolia accessible for L1Companion integration.");
  } else {
    console.log(`  ⚠️  ${passed} passed, ${failed} failed`);
  }
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

main();
