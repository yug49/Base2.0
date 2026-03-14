#!/usr/bin/env python3
"""Smoke test: verify the privacy rewrite is active in the new geth binary."""
from web3 import Web3
import sys

w3 = Web3(Web3.HTTPProvider('http://localhost:8545'))
print(f"Connected: {w3.is_connected()}, Block: {w3.eth.block_number}")

BOB = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
ALICE = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
BOB_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
ROUTER = '0x4200000000000000000000000000000000000069'

# Check Bob's current mode
sel = w3.keccak(text='getMode(address)')[:4].hex()
data = '0x' + sel + '000000000000000000000000' + BOB[2:].lower()
mode = w3.eth.call({'to': ROUTER, 'data': data})
print(f"Bob mode before setMode: {int.from_bytes(mode, 'big')}")

# setMode(1)
sel_set = w3.keccak(text='setMode(uint8)')[:4].hex()
data_set = '0x' + sel_set + '0000000000000000000000000000000000000000000000000000000000000001'
acct = w3.eth.account.from_key(BOB_PK)
nonce = w3.eth.get_transaction_count(acct.address)
tx = {
    'to': w3.to_checksum_address(ROUTER),
    'data': bytes.fromhex(data_set[2:]),
    'gas': 100000,
    'gasPrice': w3.eth.gas_price,
    'nonce': nonce,
    'chainId': w3.eth.chain_id,
}
signed = acct.sign_transaction(tx)
tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
print(f"setMode tx status: {receipt.status}")

# Verify
mode2 = w3.eth.call({'to': ROUTER, 'data': data})
print(f"Bob mode after setMode: {int.from_bytes(mode2, 'big')}")

# Gas estimate
est = w3.eth.estimate_gas({'from': ALICE, 'to': BOB, 'value': w3.to_wei(1, 'ether')})
print(f"\nGas estimate Alice->Bob (1 ETH): {est}")
if est > 21000:
    print("REWRITE IS ACTIVE - gas > 21000")
else:
    print("REWRITE NOT ACTIVE - gas is still 21000")
    print("The Transfer hook fallback will handle shielding instead")
