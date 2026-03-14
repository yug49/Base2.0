#!/usr/bin/env python3
"""Sign and send a raw tx using web3.py - no cast dependency."""
from web3 import Web3
import time

w3 = Web3(Web3.HTTPProvider("http://localhost:8545", request_kwargs={"timeout": 5}))
print(f"Connected: {w3.is_connected()}, Chain: {w3.eth.chain_id}, Block: {w3.eth.block_number}")

pk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
acct = w3.eth.account.from_key(pk)
print(f"Account: {acct.address}")
print(f"Balance: {w3.eth.get_balance(acct.address) / 1e18} ETH")
print(f"Nonce: {w3.eth.get_transaction_count(acct.address)}")

# setMode(uint8) = 0x21175b4a + uint8(1)
calldata = bytes.fromhex("21175b4a0000000000000000000000000000000000000000000000000000000000000001")
to = "0x4200000000000000000000000000000000000069"

# Build tx
tx = {
    "to": Web3.to_checksum_address(to),
    "data": calldata,
    "gas": 100000,
    "gasPrice": w3.eth.gas_price,
    "nonce": w3.eth.get_transaction_count(acct.address),
    "chainId": w3.eth.chain_id,
}
print(f"\nTx: nonce={tx['nonce']}, gas={tx['gas']}, gasPrice={tx['gasPrice']}")

# Sign
signed = acct.sign_transaction(tx)
print(f"Signed tx hash: {signed.hash.hex()}")
print(f"Raw tx: {signed.raw_transaction.hex()[:80]}...")

# Send
print("\nSending eth_sendRawTransaction...")
try:
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"TX SENT! Hash: {tx_hash.hex()}")
except Exception as e:
    print(f"SEND ERROR: {e}")
    import sys; sys.exit(1)

# Check txpool immediately
tp = w3.provider.make_request("txpool_status", [])
print(f"Txpool after send: {tp['result']}")

# Wait for receipt
print("\nWaiting for receipt (max 15s)...")
for i in range(15):
    try:
        receipt = w3.eth.get_transaction_receipt(tx_hash)
    except Exception:
        receipt = None
    if receipt:
        print(f"\nRECEIPT FOUND!")
        print(f"  Block: {receipt['blockNumber']}")
        print(f"  Status: {'SUCCESS' if receipt['status'] == 1 else 'FAILED'}")
        print(f"  Gas used: {receipt['gasUsed']}")
        break
    time.sleep(1)
    tp2 = w3.provider.make_request("txpool_status", [])
    print(f"  ...waiting ({i+1}s), block={w3.eth.block_number}, txpool={tp2['result']}")
else:
    print("\nTIMEOUT - tx not included in 15 seconds")
    try:
        tx_data = w3.eth.get_transaction(tx_hash)
        print(f"Tx exists in node: blockNumber={tx_data.get('blockNumber')}")
    except:
        print("Tx not found in node!")
