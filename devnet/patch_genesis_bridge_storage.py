#!/usr/bin/env python3
"""
Patches devnet/genesis.json to initialize PrivacyBridge predeploy storage:
  - slot 0 (l1Companion) = L1Companion address on Sepolia
  - slot 1 (admin)       = Hardhat #0 deployer (funded test account on L2)

Run BEFORE `geth init` (i.e., before devnet restart).
"""
import json
import os

GENESIS = os.path.join(os.path.dirname(__file__), "genesis.json")
BRIDGE_ADDR = "0x4200000000000000000000000000000000000071"

# L1Companion deployed on Sepolia in Phase 4
L1_COMPANION = "0xC4e2b9f884BF8D06c42f4B8B6f2ce2678Aa8B43e"
# Hardhat deployer #0 — funded 10,000 ETH in genesis, used for L2 deployments
L2_ADMIN = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

with open(GENESIS) as f:
    g = json.load(f)

assert BRIDGE_ADDR in g["alloc"], f"PrivacyBridge not found in genesis at {BRIDGE_ADDR}"

g["alloc"][BRIDGE_ADDR]["storage"] = {
    # slot 0: l1Companion
    "0x0000000000000000000000000000000000000000000000000000000000000000":
        "0x000000000000000000000000" + L1_COMPANION[2:].lower(),
    # slot 1: admin
    "0x0000000000000000000000000000000000000000000000000000000000000001":
        "0x000000000000000000000000" + L2_ADMIN[2:].lower(),
}

with open(GENESIS, "w") as f:
    json.dump(g, f, indent=2)

print("✅  Patched genesis.json PrivacyBridge storage:")
print(f"   slot 0 (l1Companion) = {L1_COMPANION}")
print(f"   slot 1 (admin)       = {L2_ADMIN}")
print()
print("NOTE: Re-run `geth init` and restart the devnet for these changes to take effect.")
