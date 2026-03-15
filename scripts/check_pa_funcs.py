#!/usr/bin/env python3
"""
Try to call ProxyAdmin functions to verify it works.
The OP Stack ProxyAdmin at 0x0018 has impl 0xc0d3c0d3...0018.
"""
from web3 import Web3

w3 = Web3(Web3.HTTPProvider('http://localhost:8545'))
PA = Web3.to_checksum_address('0x4200000000000000000000000000000000000018')
POOL = Web3.to_checksum_address('0x4200000000000000000000000000000000000070')
DEPLOYER = Web3.to_checksum_address('0xedB816F31AbCd2e14051ee7d53fc4AeCc49eA551')

# Try getProxyImplementation(address)
sel = w3.keccak(text='getProxyImplementation(address)')[:4].hex()
data = '0x' + sel + POOL[2:].lower().zfill(64)
try:
    result = w3.eth.call({'to': PA, 'data': data, 'from': DEPLOYER})
    print(f'getProxyImplementation: 0x{result.hex()[-40:]}')
except Exception as e:
    print(f'getProxyImplementation error: {e}')

# Try getProxyAdmin(address)
sel2 = w3.keccak(text='getProxyAdmin(address)')[:4].hex()
data2 = '0x' + sel2 + POOL[2:].lower().zfill(64)
try:
    result = w3.eth.call({'to': PA, 'data': data2, 'from': DEPLOYER})
    print(f'getProxyAdmin: 0x{result.hex()[-40:]}')
except Exception as e:
    print(f'getProxyAdmin error: {e}')

# Try owner()
sel3 = w3.keccak(text='owner()')[:4].hex()
try:
    result = w3.eth.call({'to': PA, 'data': '0x' + sel3})
    print(f'owner: 0x{result.hex()[-40:]}')
except Exception as e:
    print(f'owner error: {e}')

# Check what functions the ProxyAdmin proxy code supports
pa_code = w3.eth.get_code(PA).hex()
print(f'\nProxyAdmin code length: {len(pa_code)//2} bytes')
# Standard ProxyAdmin selectors
selectors = {
    'owner()': '8da5cb5b',
    'upgrade(address,address)': '99a88ec4',
    'upgradeAndCall(address,address,bytes)': '9623609d',
    'getProxyImplementation(address)': '204e1c7a',
    'getProxyAdmin(address)': 'f3b7dead',
    'changeProxyAdmin(address,address)': '7eff275e',
}
for name, sel in selectors.items():
    found = sel in pa_code
    print(f'  {name}: {"FOUND" if found else "NOT FOUND"} (0x{sel})')

# The OP Stack uses a different pattern - the proxy resolves its own address
# as suffix of 0xc0d3c0d3... Let's check what that impl contract looks like
impl_addr = Web3.to_checksum_address('0xc0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d30018')
impl_code = w3.eth.get_code(impl_addr)
print(f'\nOP Stack impl (0xc0d3...0018) code size: {len(impl_code)} bytes')
if len(impl_code) > 0:
    print(f'  First 100 bytes: {impl_code.hex()[:200]}')
