#!/usr/bin/env python3
"""
Deploy ShieldedPool implementation using debug APIs only (no transactions needed).

Uses debug_setCode to place contract bytecodes and debug_setStorageAt
to set EIP-1967 slots and initialization state.
"""
from web3 import Web3
import json

w3 = Web3(Web3.HTTPProvider('http://localhost:8545'))
print(f'Block: {w3.eth.block_number}')
print(f'Chain ID: {w3.eth.chain_id}')

POOL_PROXY = Web3.to_checksum_address('0x4200000000000000000000000000000000000070')
ACCOUNT0 = Web3.to_checksum_address('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')

IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

# Addresses for our deployed contracts (chosen arbitrarily in free address space)
POSEIDON_T3_ADDR = '0x5300000000000000000000000000000000000001'
POSEIDON_T4_ADDR = '0x5300000000000000000000000000000000000002'
IMPL_ADDR = '0x5300000000000000000000000000000000000003'

def debug_set_code(address, code_hex):
    """Set code at an address using debug_setCode."""
    if isinstance(code_hex, bytes):
        code_hex = '0x' + code_hex.hex()
    elif not code_hex.startswith('0x'):
        code_hex = '0x' + code_hex
    result = w3.provider.make_request('debug_setCode', [address, code_hex])
    if 'error' in result:
        raise RuntimeError(f'debug_setCode failed: {result["error"]}')
    return result

def debug_set_storage(address, slot, value):
    """Set storage at an address using debug_setStorageAt."""
    result = w3.provider.make_request('debug_setStorageAt', [address, slot, value])
    if 'error' in result:
        raise RuntimeError(f'debug_setStorageAt failed: {result["error"]}')
    return result

# ---- Step 1: Deploy Poseidon library bytecodes ----
print('\n=== Step 1: Deploy Poseidon Libraries via debug_setCode ===')

with open('out/Poseidon.sol/PoseidonT3.json') as f:
    pt3_deployed = json.load(f)['deployedBytecode']['object']

with open('out/Poseidon.sol/PoseidonT4.json') as f:
    pt4_deployed = json.load(f)['deployedBytecode']['object']

debug_set_code(POSEIDON_T3_ADDR, pt3_deployed)
code = w3.eth.get_code(Web3.to_checksum_address(POSEIDON_T3_ADDR))
print(f'  PoseidonT3 at {POSEIDON_T3_ADDR}: {len(code)} bytes')

debug_set_code(POSEIDON_T4_ADDR, pt4_deployed)
code = w3.eth.get_code(Web3.to_checksum_address(POSEIDON_T4_ADDR))
print(f'  PoseidonT4 at {POSEIDON_T4_ADDR}: {len(code)} bytes')

# ---- Step 2: Link libraries into ShieldedPool deployed bytecode ----
print('\n=== Step 2: Link Libraries ===')

with open('out/ShieldedPool.sol/ShieldedPool.json') as f:
    sp_artifact = json.load(f)

# Use deployedBytecode (runtime code, not init code)
sp_bytecode = sp_artifact['deployedBytecode']['object']
link_refs = sp_artifact['deployedBytecode'].get('linkReferences', {})

addr_map = {
    'PoseidonT3': POSEIDON_T3_ADDR[2:].lower(),
    'PoseidonT4': POSEIDON_T4_ADDR[2:].lower(),
}

for lib_name, refs in link_refs.get('contracts/l2/Poseidon.sol', {}).items():
    addr = addr_map[lib_name]
    for ref in refs:
        start = ref['start'] * 2
        length = ref['length'] * 2
        prefix = '0x' if sp_bytecode.startswith('0x') else ''
        offset = start + len(prefix)
        old = sp_bytecode[offset:offset + length]
        print(f'  Linking {lib_name} at offset {ref["start"]}: {old[:10]}... -> {addr}')
        sp_bytecode = sp_bytecode[:offset] + addr + sp_bytecode[offset + length:]

if '__$' in sp_bytecode:
    raise RuntimeError('Bytecode still has unlinked placeholders!')
print('  All libraries linked successfully')

# ---- Step 3: Set ShieldedPool runtime code at implementation address ----
print(f'\n=== Step 3: Set ShieldedPool Code at {IMPL_ADDR} ===')
debug_set_code(IMPL_ADDR, sp_bytecode)
code = w3.eth.get_code(Web3.to_checksum_address(IMPL_ADDR))
print(f'  Runtime code size: {len(code)} bytes')

# ---- Step 4: Set EIP-1967 implementation slot on the proxy ----
print('\n=== Step 4: Set EIP-1967 Implementation Slot ===')
impl_slot_value = '0x' + IMPL_ADDR[2:].lower().zfill(64)
debug_set_storage(POOL_PROXY, IMPL_SLOT, impl_slot_value)

new_impl = w3.eth.get_storage_at(POOL_PROXY, int(IMPL_SLOT, 16))
new_impl_addr = '0x' + new_impl.hex()[-40:]
assert new_impl_addr.lower() == IMPL_ADDR.lower(), f'Slot mismatch: {new_impl_addr} != {IMPL_ADDR}'
print(f'  Implementation slot set to: {new_impl_addr}')

# ---- Step 5: Initialize via storage slots ----
print('\n=== Step 5: Initialize ShieldedPool (via storage) ===')

# OZ v5 OwnableUpgradeable storage slot
OWNABLE_SLOT = '0x9016d09d72d40fdae2fd8ceac6b6234c7706214fd39c1cd1e609a0528c199300'
owner_value = '0x' + ACCOUNT0[2:].lower().zfill(64)
debug_set_storage(POOL_PROXY, OWNABLE_SLOT, owner_value)
print(f'  Owner set to: {ACCOUNT0}')

# Treasury at storage slot 0x3b (from contract layout)
treasury_value = '0x' + ACCOUNT0[2:].lower().zfill(64)
debug_set_storage(POOL_PROXY, hex(0x3b), treasury_value)
print(f'  Treasury set to: {ACCOUNT0}')

# OZ v5 Initializable storage location
INIT_SLOT = '0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00'
debug_set_storage(POOL_PROXY, INIT_SLOT, '0x' + '0' * 63 + '1')
print(f'  Initializable version set to 1')

# ---- Step 6: Verify ----
print('\n=== Step 6: Verification ===')

def eth_call(sig, *args):
    sel = w3.keccak(text=sig)[:4].hex()
    data = sel + ''.join(
        a[2:].lower().zfill(64) if isinstance(a, str) and a.startswith('0x')
        else str(a).zfill(64) for a in args
    )
    return w3.eth.call({'to': POOL_PROXY, 'data': bytes.fromhex(data)})

try:
    ps = int.from_bytes(eth_call('pendingShields(address)', ACCOUNT0), 'big')
    print(f'  pendingShields(account0): {ps} wei = {ps/1e18} ETH')
except Exception as e:
    print(f'  pendingShields ERROR: {e}')

try:
    nli = int.from_bytes(eth_call('nextLeafIndex()'), 'big')
    print(f'  nextLeafIndex: {nli}')
except Exception as e:
    print(f'  nextLeafIndex ERROR: {e}')

try:
    ts = '0x' + eth_call('treasury()').hex()[-40:]
    print(f'  treasury: {ts}')
except Exception as e:
    print(f'  treasury ERROR: {e}')

try:
    ow = '0x' + eth_call('owner()').hex()[-40:]
    print(f'  owner: {ow}')
except Exception as e:
    print(f'  owner ERROR: {e}')

print('\n=== DONE ===')
