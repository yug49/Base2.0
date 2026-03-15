#!/usr/bin/env python3
"""Clear stuck transactions and test EIP-1559 tx mining."""
from web3 import Web3

w3 = Web3(Web3.HTTPProvider('http://localhost:8545'))
acc = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
key = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

b = w3.eth.get_block('latest')
base_fee = b['baseFeePerGas']
print(f'Base fee: {base_fee}')
latest_nonce = w3.eth.get_transaction_count(acc, 'latest')
pending_nonce = w3.eth.get_transaction_count(acc, 'pending')
print(f'Latest nonce: {latest_nonce}')
print(f'Pending nonce: {pending_nonce}')

# Replace stuck txns with EIP-1559 self-transfers
for n in range(latest_nonce, pending_nonce):
    tx = {
        'from': acc,
        'to': acc,
        'value': 0,
        'gas': 21_000,
        'maxFeePerGas': base_fee * 10,
        'maxPriorityFeePerGas': base_fee * 2,
        'nonce': n,
        'chainId': w3.eth.chain_id,
        'type': 2,
    }
    signed = w3.eth.account.sign_transaction(tx, key)
    try:
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        print(f'Sent replacement for nonce {n}: {tx_hash.hex()[:16]}...')
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=15)
        print(f'  Mined! status={receipt["status"]} block={receipt["blockNumber"]}')
    except Exception as e:
        print(f'  nonce {n} error: {e}')

print(f'\nNew latest nonce: {w3.eth.get_transaction_count(acc, "latest")}')
print(f'New pending nonce: {w3.eth.get_transaction_count(acc, "pending")}')

# Now try a fresh EIP-1559 transaction
print('\n--- Testing fresh EIP-1559 transaction ---')
b2 = w3.eth.get_block('latest')
new_nonce = w3.eth.get_transaction_count(acc, 'pending')
tx2 = {
    'from': acc,
    'to': acc,
    'value': 1,  # 1 wei
    'gas': 21_000,
    'maxFeePerGas': b2['baseFeePerGas'] * 10,
    'maxPriorityFeePerGas': b2['baseFeePerGas'] * 2,
    'nonce': new_nonce,
    'chainId': w3.eth.chain_id,
    'type': 2,
}
signed2 = w3.eth.account.sign_transaction(tx2, key)
tx_hash2 = w3.eth.send_raw_transaction(signed2.raw_transaction)
print(f'Test tx sent: {tx_hash2.hex()[:16]}...')
try:
    receipt2 = w3.eth.wait_for_transaction_receipt(tx_hash2, timeout=20)
    print(f'Mined! status={receipt2["status"]} block={receipt2["blockNumber"]}')
except Exception as e:
    print(f'Timeout or error: {e}')
    print('Transactions are NOT being mined by the sequencer.')
