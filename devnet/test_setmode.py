from web3 import Web3

w3 = Web3(Web3.HTTPProvider('http://localhost:8545'))
print('Connected:', w3.is_connected())
print('Block:', w3.eth.block_number)

account = w3.eth.account.from_key('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
print('Address:', account.address)
print('Nonce:', w3.eth.get_transaction_count(account.address))
print('Balance:', w3.from_wei(w3.eth.get_balance(account.address), 'ether'), 'ETH')

# Send setMode(1) to PrivacyRouter
tx = {
    'to': '0x4200000000000000000000000000000000000069',
    'data': '0x21175b4a0000000000000000000000000000000000000000000000000000000000000001',
    'gas': 100000,
    'gasPrice': w3.eth.gas_price,
    'nonce': w3.eth.get_transaction_count(account.address),
    'chainId': 845311,
}
signed = account.sign_transaction(tx)
print('Sending tx...')
try:
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print('TX HASH:', tx_hash.hex())
    
    # Check txpool immediately
    import time
    time.sleep(0.5)
    pool = w3.provider.make_request('txpool_status', [])
    print('TXPOOL after send:', pool)
    
    content = w3.provider.make_request('txpool_content', [])
    print('TXPOOL content pending keys:', list(content.get('result', {}).get('pending', {}).keys()))
    print('TXPOOL content queued keys:', list(content.get('result', {}).get('queued', {}).keys()))
    
    print('Waiting for receipt (60s)...')
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    print('STATUS:', receipt['status'])
    print('BLOCK:', receipt['blockNumber'])
    print('GAS USED:', receipt['gasUsed'])
except Exception as e:
    print('ERROR:', type(e).__name__, e)
