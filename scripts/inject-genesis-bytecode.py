#!/usr/bin/env python3
"""Inject ShadowBase predeploy bytecodes into devnet genesis.json"""
import json
import sys

# Map of predeploy address → (artifact path, label)
PREDEPLOYS = {
    '0x4200000000000000000000000000000000000069': ('out/PrivacyRouter.sol/PrivacyRouter.json', 'PrivacyRouter'),
    '0x4200000000000000000000000000000000000070': ('out/ShieldedPool.sol/ShieldedPool.json', 'ShieldedPool'),
    '0x4200000000000000000000000000000000000071': ('out/PrivacyBridge.sol/PrivacyBridge.json', 'PrivacyBridge'),
}

# Read genesis
with open('devnet/genesis.json') as f:
    genesis = json.load(f)

for addr, (artifact_path, label) in PREDEPLOYS.items():
    try:
        with open(artifact_path) as f:
            artifact = json.load(f)
        bytecode = artifact['deployedBytecode']['object']
    except FileNotFoundError:
        print(f'  SKIP {addr} ({label}) — artifact not found at {artifact_path}')
        continue

    if addr in genesis['alloc']:
        old_code_len = len(genesis['alloc'][addr].get('code', ''))
        genesis['alloc'][addr]['code'] = bytecode
        genesis['alloc'][addr]['nonce'] = '0x1'
        print(f'  Updated {addr} ({label}):')
        print(f'    Old code: {old_code_len} chars → New code: {len(bytecode)} chars')
    else:
        genesis['alloc'][addr] = {
            'balance': '0x0',
            'code': bytecode,
            'nonce': '0x1',
            'storage': {}
        }
        print(f'  Created {addr} ({label}) with code length {len(bytecode)}')

# Write updated genesis
with open('devnet/genesis.json', 'w') as f:
    json.dump(genesis, f, indent=2)

print('\nGenesis updated successfully with ShadowBase predeploys.')
