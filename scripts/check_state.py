#!/usr/bin/env python3
"""Check devnet state for debugging auto-shield / claim issues."""
from web3 import Web3

w3 = Web3(Web3.HTTPProvider('http://localhost:8545'))
print('Connected:', w3.is_connected())
print('Block:', w3.eth.block_number)

account = Web3.to_checksum_address('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
router = Web3.to_checksum_address('0x4200000000000000000000000000000000000069')
pool = Web3.to_checksum_address('0x4200000000000000000000000000000000000070')

# Check contract code
router_code = w3.eth.get_code(router)
pool_code = w3.eth.get_code(pool)
print(f'\nPrivacyRouter code: {len(router_code)} bytes')
print(f'ShieldedPool code: {len(pool_code)} bytes')

# Check mode
getMode_sel = w3.keccak(text='getMode(address)')[:4].hex()
print(f'\ngetMode selector: 0x{getMode_sel}')
try:
    data = '0x' + getMode_sel + account[2:].lower().zfill(64)
    result = w3.eth.call({'to': router, 'data': data})
    print(f'Mode for {account}: {int.from_bytes(result, "big")}')
except Exception as e:
    print(f'getMode error: {e}')

# Check pending shields
ps_sel = w3.keccak(text='pendingShields(address)')[:4].hex()
print(f'\npendingShields selector: 0x{ps_sel}')
try:
    data = '0x' + ps_sel + account[2:].lower().zfill(64)
    result = w3.eth.call({'to': pool, 'data': data})
    val = int.from_bytes(result, 'big')
    print(f'Pending shields: {val} wei = {val/1e18} ETH')
except Exception as e:
    print(f'pendingShields error: {e}')

# Check balance
balance = w3.eth.get_balance(account)
print(f'\nPublic balance: {balance} wei = {w3.from_wei(balance, "ether")} ETH')

# Check ShieldedPool balance
pool_balance = w3.eth.get_balance(pool)
print(f'ShieldedPool balance: {pool_balance} wei = {w3.from_wei(pool_balance, "ether")} ETH')

# Check nextLeafIndex
nli_sel = w3.keccak(text='nextLeafIndex()')[:4].hex()
try:
    result = w3.eth.call({'to': pool, 'data': '0x' + nli_sel})
    print(f'nextLeafIndex: {int.from_bytes(result, "big")}')
except Exception as e:
    print(f'nextLeafIndex error: {e}')

# Scan AutoShielded events from PrivacyRouter
topic = w3.keccak(text='AutoShielded(address,address,uint256)').hex()
print(f'\nScanning AutoShielded events (topic: 0x{topic[:16]}...)')
try:
    logs = w3.eth.get_logs({
        'fromBlock': 0,
        'toBlock': 'latest',
        'address': router,
        'topics': ['0x' + topic],
    })
    print(f'Found {len(logs)} AutoShielded events')
    for i, log in enumerate(logs):
        sender = '0x' + log['topics'][1].hex()[-40:]
        recipient = '0x' + log['topics'][2].hex()[-40:]
        amount = int.from_bytes(log['data'], 'big')
        print(f'  [{i}] block={log["blockNumber"]} sender={sender} recipient={recipient} amount={amount/1e18} ETH')
except Exception as e:
    print(f'Event scan error: {e}')

# Scan AutoShieldClaimed events
topic2 = w3.keccak(text='AutoShieldClaimed(address,uint256,bytes32)').hex()
print(f'\nScanning AutoShieldClaimed events...')
try:
    logs = w3.eth.get_logs({
        'fromBlock': 0,
        'toBlock': 'latest',
        'address': pool,
        'topics': ['0x' + topic2],
    })
    print(f'Found {len(logs)} AutoShieldClaimed events')
    for i, log in enumerate(logs):
        recipient = '0x' + log['topics'][1].hex()[-40:]
        amount = int.from_bytes(log['data'][:32], 'big')
        print(f'  [{i}] block={log["blockNumber"]} recipient={recipient} amount={amount/1e18} ETH')
except Exception as e:
    print(f'Event scan error: {e}')
