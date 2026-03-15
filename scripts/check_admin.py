#!/usr/bin/env python3
"""
Deploy ShieldedPool implementation and set it via ProxyAdmin.

The ShieldedPool at 0x4200...0070 is an EIP-1967 proxy with zero implementation.
ProxyAdmin at 0x4200...0018 is owned by 0xedB816f31AbCd2e14051ee7d53fc4AeCc49eA551.
We need to:
  1. Deploy ShieldedPool implementation contract
  2. Call ProxyAdmin.upgradeAndCall(proxy, newImpl, initData)
"""
from web3 import Web3
import json, subprocess, os

w3 = Web3(Web3.HTTPProvider('http://localhost:8545'))
print('Block:', w3.eth.block_number)

PROXY_ADMIN = Web3.to_checksum_address('0x4200000000000000000000000000000000000018')
POOL_PROXY  = Web3.to_checksum_address('0x4200000000000000000000000000000000000070')
DEPLOYER    = Web3.to_checksum_address('0xedB816f31AbCd2e14051ee7d53fc4AeCc49eA551')
ACCOUNT0    = Web3.to_checksum_address('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')

# Check: is deployer funded?
deployer_bal = w3.eth.get_balance(DEPLOYER)
print(f'Deployer balance: {w3.from_wei(deployer_bal, "ether")} ETH')

# Check ProxyAdmin owner
owner_sel = w3.keccak(text='owner()')[:4].hex()
result = w3.eth.call({'to': PROXY_ADMIN, 'data': '0x' + owner_sel})
owner = Web3.to_checksum_address('0x' + result.hex()[-40:])
print(f'ProxyAdmin owner: {owner}')
print(f'Owner == Deployer: {owner == DEPLOYER}')

# Check if ProxyAdmin supports upgrade()
# ProxyAdmin.upgrade(address proxy, address implementation)
# ProxyAdmin.upgradeAndCall(address proxy, address implementation, bytes data)
upgrade_sel = w3.keccak(text='upgrade(address,address)')[:4].hex()
upgradeAndCall_sel = w3.keccak(text='upgradeAndCall(address,address,bytes)')[:4].hex()
print(f'\nupgrade selector: 0x{upgrade_sel}')
print(f'upgradeAndCall selector: 0x{upgradeAndCall_sel}')

# Check what functions ProxyAdmin has by looking at its code signature
pa_code = w3.eth.get_code(PROXY_ADMIN).hex()
print(f'\nProxyAdmin has upgrade selector in code: {"99a88ec4" in pa_code}')
print(f'ProxyAdmin has upgradeAndCall selector in code: {"9623609d" in pa_code}')
