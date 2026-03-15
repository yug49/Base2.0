#!/usr/bin/env python3
"""Diagnose why the OP Stack sequencer isn't including user transactions."""
from web3 import Web3

w3 = Web3(Web3.HTTPProvider('http://localhost:8545'))

# Check recent blocks for transaction content
latest = w3.eth.block_number
print(f"Latest block: {latest}")
print()

for i in range(min(5, latest)):
    bn = latest - i
    block = w3.eth.get_block(bn, True)
    print(f"Block {bn}: txs={len(block['transactions'])} gasUsed={block['gasUsed']} baseFee={block.get('baseFeePerGas','?')}")
    for tx in block['transactions']:
        from_addr = tx['from'] if isinstance(tx, dict) else 'unknown'
        to_addr = tx.get('to', 'contract') if isinstance(tx, dict) else 'unknown'
        tx_type = tx.get('type', '?') if isinstance(tx, dict) else '?'
        print(f"  tx: from={from_addr[:10]}... to={str(to_addr)[:10]}... type={tx_type}")

# Check txpool
print()
pool = w3.provider.make_request('txpool_status', [])
print(f"TxPool status: {pool.get('result', {})}")

# Check if the noTxPool attribute is being set
# Try engine API (usually on port 8551 with JWT auth)
print()
print("Checking engine API availability...")
import requests
try:
    # JWT for auth
    with open('/Users/shubhtastic/Documents/ETHMumbai/ShadowBase/devnet/jwt-secret.txt') as f:
        jwt_secret = f.read().strip()
    print(f"JWT secret: {jwt_secret[:10]}...")
except:
    print("Cannot read JWT secret")

# Check if forkchoice payloads have noTxPool
# We can check this by looking at the getPayload call logs
# Actually, let's just try to use engine API to build a block manually
