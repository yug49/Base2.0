#!/usr/bin/env python3
"""Patch genesis.json to inject actual PrivacyRouter bytecode instead of proxy."""
import json
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GENESIS_FILE = os.path.join(SCRIPT_DIR, "genesis.json")
BYTECODE_FILE = "/tmp/privacy_router_bytecode.txt"

PRIVACY_ROUTER_ADDR = "0x4200000000000000000000000000000000000069"

# Read bytecode
with open(BYTECODE_FILE, "r") as f:
    bytecode = f.read().strip()
print(f"Bytecode length: {len(bytecode)} chars")

# Read genesis
with open(GENESIS_FILE, "r") as f:
    genesis = json.load(f)

# Try to find the address key (with or without 0x)
alloc = genesis["alloc"]
if PRIVACY_ROUTER_ADDR in alloc:
    addr_key = PRIVACY_ROUTER_ADDR
elif PRIVACY_ROUTER_ADDR[2:] in alloc:
    addr_key = PRIVACY_ROUTER_ADDR[2:]
else:
    addr_key = PRIVACY_ROUTER_ADDR
    alloc[addr_key] = {"balance": "0x0", "nonce": "0x1"}

old_code_len = len(alloc[addr_key].get("code", ""))
print(f"Old code length at {addr_key}: {old_code_len}")

# Replace code and clear storage
alloc[addr_key]["code"] = bytecode
alloc[addr_key]["storage"] = {}

print(f"New code length: {len(bytecode)}")

# Write back
with open(GENESIS_FILE, "w") as f:
    json.dump(genesis, f)
print(f"genesis.json updated at {GENESIS_FILE}")
