#!/usr/bin/env python3
from web3 import Web3
import time

w3 = Web3(Web3.HTTPProvider('http://localhost:8545', request_kwargs={'timeout': 5}))
print('block before:', w3.eth.block_number)

pk = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
acct = w3.eth.account.from_key(pk)
nonce = w3.eth.get_transaction_count(acct.address)
print('nonce:', nonce)

tx = {
    'to': '0x4200000000000000000000000000000000000069',
    'data': '0x21175b4a0000000000000000000000000000000000000000000000000000000000000001',
    'gas': 100000,
    'gasPrice': w3.eth.gas_price,
    'nonce': nonce,
    'chainId': w3.eth.chain_id,
}
signed = acct.sign_transaction(tx)

try:
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print('TX HASH:', tx_hash.hex())
except Exception as e:
    print('send error (may still be queued):', e)

# Wait and check if tx was included despite EOF error
time.sleep(6)
block_after = w3.eth.block_number
print('block after:', block_after)

new_nonce = w3.eth.get_transaction_count(acct.address)
print('nonce before:', nonce, 'nonce after:', new_nonce)
if new_nonce > nonce:
    print('TX WAS INCLUDED!')
else:
    print('tx NOT included yet')

# Check getMode for this account
mode_data = w3.eth.call({
    'to': '0x4200000000000000000000000000000000000069',
    'data': '0x46a2679a000000000000000000000000' + acct.address[2:].lower()
})
mode_val = int.from_bytes(mode_data, 'big')
print('getMode result:', mode_val, '(1=AUTO_SHIELD)' if mode_val == 1 else '')
