#!/usr/bin/env python3
"""Diagnose ShieldedPool proxy state and find the admin/implementation slots."""
from web3 import Web3

w3 = Web3(Web3.HTTPProvider('http://localhost:8545'))
pool = Web3.to_checksum_address('0x4200000000000000000000000000000000000070')

# EIP-1967 storage slots
IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'

impl_raw = w3.eth.get_storage_at(pool, int(IMPL_SLOT, 16))
admin_raw = w3.eth.get_storage_at(pool, int(ADMIN_SLOT, 16))

impl_addr = '0x' + impl_raw.hex()[-40:]
admin_addr = '0x' + admin_raw.hex()[-40:]

print(f'ShieldedPool proxy at: {pool}')
print(f'  Implementation (EIP-1967): {impl_addr}')
print(f'  Admin (EIP-1967):          {admin_addr}')

# Check code at impl address
if impl_addr != '0x' + '0' * 40:
    impl_code = w3.eth.get_code(Web3.to_checksum_address(impl_addr))
    print(f'  Implementation code size:  {len(impl_code)} bytes')
else:
    print('  Implementation: NOT SET (zero address)')

# Check proxy code
proxy_code = w3.eth.get_code(pool)
print(f'  Proxy code size:           {len(proxy_code)} bytes')
print(f'  Proxy code (hex):          {proxy_code.hex()[:200]}...')

# Check ProxyAdmin predeploy
proxy_admin_predeploy = Web3.to_checksum_address('0x4200000000000000000000000000000000000018')
pa_code = w3.eth.get_code(proxy_admin_predeploy)
print(f'\nProxyAdmin predeploy (0x...0018): {len(pa_code)} bytes of code')

# Also check if admin is the ProxyAdmin
print(f'\nAdmin address matches ProxyAdmin predeploy: {admin_addr.lower() == proxy_admin_predeploy.lower()}')

# Read pending shields via raw storage
account = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
import hashlib
# _PENDING_SHIELDS_SLOT = keccak256("shadowbase.shieldedpool.pendingShields")
base_slot = w3.keccak(text='shadowbase.shieldedpool.pendingShields')
print(f'\nPending shields base slot: 0x{base_slot.hex()}')

# Per-address slot = keccak256(abi.encode(address, baseSlot))
addr_padded = bytes.fromhex(account[2:].lower().zfill(64))
slot_data = addr_padded + base_slot
per_addr_slot = w3.keccak(slot_data)
print(f'Per-address slot for {account}: 0x{per_addr_slot.hex()}')

raw_val = w3.eth.get_storage_at(pool, int.from_bytes(per_addr_slot, 'big'))
pending_wei = int.from_bytes(raw_val, 'big')
print(f'Pending shields (raw storage): {pending_wei} wei = {pending_wei / 1e18} ETH')

# Check owner slot (for ProxyAdmin, owner is usually stored at slot 0 via Ownable)
if admin_addr != '0x' + '0' * 40:
    admin_cs = Web3.to_checksum_address(admin_addr)
    admin_code_size = len(w3.eth.get_code(admin_cs))
    print(f'\nAdmin contract code: {admin_code_size} bytes')
    # Try reading owner() on the admin
    owner_sel = w3.keccak(text='owner()')[:4].hex()
    try:
        result = w3.eth.call({'to': admin_cs, 'data': '0x' + owner_sel})
        owner = '0x' + result.hex()[-40:]
        print(f'ProxyAdmin owner: {owner}')
    except Exception as e:
        print(f'ProxyAdmin owner() error: {e}')
