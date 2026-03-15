#!/usr/bin/env python3
"""Check all OP Stack predeploys around 0x0018 and find the real admin pattern."""
from web3 import Web3

w3 = Web3(Web3.HTTPProvider('http://localhost:8545'))

# EIP-1967 slots
IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103

# Check the ProxyAdmin at 0x0018 - is IT also a proxy?
pa = Web3.to_checksum_address('0x4200000000000000000000000000000000000018')
pa_impl = w3.eth.get_storage_at(pa, IMPL_SLOT)
pa_admin = w3.eth.get_storage_at(pa, ADMIN_SLOT)
print(f'ProxyAdmin (0x...0018):')
print(f'  Implementation: 0x{pa_impl.hex()[-40:]}')
print(f'  Admin:          0x{pa_admin.hex()[-40:]}')
print()

# Check PrivacyRouter at 0x0069 for comparison
router = Web3.to_checksum_address('0x4200000000000000000000000000000000000069')
r_impl = w3.eth.get_storage_at(router, IMPL_SLOT)
r_admin = w3.eth.get_storage_at(router, ADMIN_SLOT)
r_code = w3.eth.get_code(router)
print(f'PrivacyRouter (0x...0069):')
print(f'  Implementation: 0x{r_impl.hex()[-40:]}')
print(f'  Admin:          0x{r_admin.hex()[-40:]}')
print(f'  Code size:      {len(r_code)} bytes')
print()

# Check PrivacyBridge at 0x0071
bridge = Web3.to_checksum_address('0x4200000000000000000000000000000000000071')
b_impl = w3.eth.get_storage_at(bridge, IMPL_SLOT)
b_admin = w3.eth.get_storage_at(bridge, ADMIN_SLOT)
b_code = w3.eth.get_code(bridge)
print(f'PrivacyBridge (0x...0071):')
print(f'  Implementation: 0x{b_impl.hex()[-40:]}')
print(f'  Admin:          0x{b_admin.hex()[-40:]}')
print(f'  Code size:      {len(b_code)} bytes')
print()

# Check a standard OP stack predeploy (L2StandardBridge at 0x...0010)
l2bridge = Web3.to_checksum_address('0x4200000000000000000000000000000000000010')
lb_impl = w3.eth.get_storage_at(l2bridge, IMPL_SLOT)
lb_admin = w3.eth.get_storage_at(l2bridge, ADMIN_SLOT)
lb_code = w3.eth.get_code(l2bridge)
print(f'L2StandardBridge (0x...0010):')
print(f'  Implementation: 0x{lb_impl.hex()[-40:]}')
print(f'  Admin:          0x{lb_admin.hex()[-40:]}')
print(f'  Code size:      {len(lb_code)} bytes')
print()

# Check if PrivacyRouter is a proxy or direct deploy
# If it has ZERO in impl slot but works, it was deployed directly (not a proxy)
print('--- Function call tests ---')
# PrivacyRouter.getMode(address): 0x9fc86239
account = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
try:
    data = '0x9fc86239' + account[2:].lower().zfill(64)
    result = w3.eth.call({'to': router, 'data': data})
    print(f'PrivacyRouter.getMode(): {int.from_bytes(result, "big")} (works!)')
except Exception as e:
    print(f'PrivacyRouter.getMode(): FAILED - {e}')

# ShieldedPool (proxy) test
try:
    nli_sel = w3.keccak(text='nextLeafIndex()')[:4].hex()
    result = w3.eth.call({'to': Web3.to_checksum_address('0x4200000000000000000000000000000000000070'), 'data': '0x' + nli_sel})
    print(f'ShieldedPool.nextLeafIndex(): {int.from_bytes(result, "big")} (works!)')
except Exception as e:
    print(f'ShieldedPool.nextLeafIndex(): FAILED - {str(e)[:100]}')
