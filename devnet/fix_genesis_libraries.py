#!/usr/bin/env python3
"""Fix genesis.json by deploying Poseidon libraries and linking ShieldedPool bytecode."""

import json
import re
import subprocess

# 1. Get Poseidon library deployed bytecodes
t3_bc = subprocess.run(
    ['forge', 'inspect', 'contracts/l2/Poseidon.sol:PoseidonT3', 'deployed-bytecode'],
    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
).stdout.strip()

t4_bc = subprocess.run(
    ['forge', 'inspect', 'contracts/l2/Poseidon.sol:PoseidonT4', 'deployed-bytecode'],
    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
).stdout.strip()

# Deterministic addresses for the Poseidon libraries (predeploy-style)
POSEIDON_T3_ADDR = "0x4200000000000000000000000000000000000073"
POSEIDON_T4_ADDR = "0x4200000000000000000000000000000000000074"

# Library deployed bytecode starts with: 73 + <20-byte self-address> + 30 14 ...
# Fix the self-reference to point to actual deploy address
t3_fixed = "0x73" + POSEIDON_T3_ADDR[2:].lower().zfill(40) + t3_bc[44:]
t4_fixed = "0x73" + POSEIDON_T4_ADDR[2:].lower().zfill(40) + t4_bc[44:]

print(f"PoseidonT3 addr: {POSEIDON_T3_ADDR}, bytecode len: {len(t3_fixed)}")
print(f"PoseidonT4 addr: {POSEIDON_T4_ADDR}, bytecode len: {len(t4_fixed)}")

# 2. Get ShieldedPool deployed bytecode and link it
sp_bc = subprocess.run(
    ['forge', 'inspect', 'contracts/l2/ShieldedPool.sol:ShieldedPool', 'deployed-bytecode'],
    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
).stdout.strip()

# Replace library placeholders with actual addresses
sp_linked = sp_bc.replace(
    '__$f7489691dc7aa9ccfaf8254a120bac7c8a$__',
    POSEIDON_T3_ADDR[2:].lower().zfill(40)
).replace(
    '__$36395c011c55f5580d23ba9f003b1189c0$__',
    POSEIDON_T4_ADDR[2:].lower().zfill(40)
)

remaining = re.findall(r'__\$[a-f0-9]+\$__', sp_linked)
if remaining:
    print(f"ERROR: Remaining placeholders: {remaining}")
    exit(1)
print(f"ShieldedPool linked bytecode len: {len(sp_linked)}")

# 3. Load and patch genesis.json
with open('devnet/genesis.json', 'r') as f:
    genesis = json.load(f)

# Add PoseidonT3 library
genesis['alloc'][POSEIDON_T3_ADDR] = {"code": t3_fixed, "balance": "0x0"}

# Add PoseidonT4 library  
genesis['alloc'][POSEIDON_T4_ADDR] = {"code": t4_fixed, "balance": "0x0"}

# Replace ShieldedPool bytecode with linked version
genesis['alloc']['0x4200000000000000000000000000000000000070']['code'] = sp_linked

# Verify all code fields are valid hex
for addr, info in genesis.get('alloc', {}).items():
    if 'code' in info:
        code = info['code']
        if not re.match(r'^0x[0-9a-fA-F]*$', code):
            print(f"ERROR: Bad hex at {addr}")
            exit(1)

print("All code fields valid hex: OK")

with open('devnet/genesis.json', 'w') as f:
    json.dump(genesis, f, indent=2)

print("Genesis patched successfully!")
