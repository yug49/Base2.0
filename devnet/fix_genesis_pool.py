#!/usr/bin/env python3
"""Restore ShieldedPool and PrivacyBridge from old genesis (they weren't changed).
Only PrivacyRouter was updated with routeShield + receive."""
import json

with open('devnet/genesis-old.json') as f:
    old = json.load(f)
with open('devnet/genesis.json') as f:
    new = json.load(f)

pool_old_key = '4200000000000000000000000000000000000070'
bridge_old_key = '4200000000000000000000000000000000000071'

# Find keys in new genesis (may have 0x prefix)
new_pool_key = None
new_bridge_key = None
for k in new['alloc']:
    stripped = k.lower().replace('0x', '')
    if stripped == pool_old_key:
        new_pool_key = k
    if stripped == bridge_old_key:
        new_bridge_key = k

if new_pool_key:
    new['alloc'][new_pool_key] = old['alloc'][pool_old_key]
    print(f'Restored ShieldedPool ({new_pool_key})')
else:
    print('WARNING: ShieldedPool not found in new genesis')

if new_bridge_key:
    new['alloc'][new_bridge_key] = old['alloc'][bridge_old_key]
    print(f'Restored PrivacyBridge ({new_bridge_key})')
else:
    print('WARNING: PrivacyBridge not found in new genesis')

with open('devnet/genesis.json', 'w') as f:
    json.dump(new, f, indent=2)

# Verify
import re
for addr in new['alloc']:
    code = new['alloc'][addr].get('code', '')
    if code and not re.match(r'^0x[0-9a-fA-F]*$', code):
        print(f'STILL INVALID: {addr}')
        break
else:
    print('All bytecodes valid!')
