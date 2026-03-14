#!/usr/bin/env python3
"""Patch genesis.json to inject PrivacyBridge bytecode at predeploy 0x...0071.

Usage:
    python3 patch_genesis_bridge.py [--genesis PATH] [--bytecode PATH]

Defaults:
    --genesis  devnet/genesis.json
    --bytecode devnet/privacy_bridge_bytecode.txt
"""
import json
import sys
import os
import argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

PRIVACY_BRIDGE_ADDR = "0x4200000000000000000000000000000000000071"

def main():
    parser = argparse.ArgumentParser(description="Patch PrivacyBridge into genesis.json")
    parser.add_argument("--genesis", default=os.path.join(SCRIPT_DIR, "genesis.json"),
                        help="Path to genesis.json")
    parser.add_argument("--bytecode", default=os.path.join(SCRIPT_DIR, "privacy_bridge_bytecode.txt"),
                        help="Path to bytecode file")
    args = parser.parse_args()

    # Read bytecode
    with open(args.bytecode, "r") as f:
        bytecode = f.read().strip()

    if not bytecode.startswith("0x"):
        bytecode = "0x" + bytecode

    print(f"PrivacyBridge bytecode: {len(bytecode)} chars")
    print(f"  starts: {bytecode[:60]}...")
    print(f"  ends:   ...{bytecode[-40:]}")

    # Read genesis
    with open(args.genesis, "r") as f:
        genesis = json.load(f)

    alloc = genesis["alloc"]

    # Find address key (genesis may use with or without 0x prefix)
    addr_key = None
    for candidate in [PRIVACY_BRIDGE_ADDR, PRIVACY_BRIDGE_ADDR[2:], PRIVACY_BRIDGE_ADDR.lower(), PRIVACY_BRIDGE_ADDR[2:].lower()]:
        if candidate in alloc:
            addr_key = candidate
            break

    if addr_key is None:
        # Create the entry if it doesn't exist
        addr_key = PRIVACY_BRIDGE_ADDR
        alloc[addr_key] = {"balance": "0x0", "nonce": "0x1"}
        print(f"Created new alloc entry for {addr_key}")
    else:
        print(f"Found existing alloc entry: {addr_key}")

    old_code = alloc[addr_key].get("code", "")
    old_len = len(old_code) if old_code else 0
    print(f"Old code length: {old_len}")

    # Inject bytecode
    alloc[addr_key]["code"] = bytecode
    # Clear storage (PrivacyBridge uses initializer pattern, storage set at runtime)
    alloc[addr_key]["storage"] = {}
    # Ensure nonce is 1 (contract account)
    alloc[addr_key]["nonce"] = "0x1"

    print(f"New code length: {len(bytecode)}")

    # Write back
    with open(args.genesis, "w") as f:
        json.dump(genesis, f, indent=2)

    print(f"\n✅ genesis.json updated at {args.genesis}")
    print(f"   PrivacyBridge injected at {PRIVACY_BRIDGE_ADDR}")

if __name__ == "__main__":
    main()
