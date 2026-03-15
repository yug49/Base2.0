#!/usr/bin/env python3
"""Deploy ShieldedPool implementation - test transaction first, then full deploy."""
import urllib.request, json, time, sys

RPC = 'http://localhost:8545'
ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
PRIVKEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

def rpc(method, params=[]):
    data = json.dumps({'jsonrpc':'2.0','method':method,'params':params,'id':1}).encode()
    req = urllib.request.Request(RPC, data, {'Content-Type':'application/json'})
    resp = json.loads(urllib.request.urlopen(req, timeout=5).read())
    if 'error' in resp:
        raise Exception(f"RPC error: {resp['error']}")
    return resp['result']

# Check nonce
nonce = int(rpc('eth_getTransactionCount', [ACCOUNT, 'latest']), 16)
print(f"Current nonce: {nonce}")

# Check balance
balance = int(rpc('eth_getBalance', [ACCOUNT, 'latest']), 16)
print(f"Balance: {balance / 1e18:.4f} ETH")

# Get latest block
block = rpc('eth_getBlockByNumber', ['latest', False])
block_num = int(block['number'], 16)
print(f"Latest block: {block_num}")

# Check txpool
pool = rpc('txpool_status')
print(f"Txpool: pending={int(pool['pending'],16)}, queued={int(pool['queued'],16)}")

# Send a simple test transaction via eth_sendRawTransaction
# Build a simple self-transfer
from hashlib import sha256
import struct

chain_id = 845311

# Build a legacy transaction
gas_price = int(rpc('eth_gasPrice'), 16) * 2  # double for safety
print(f"Gas price: {gas_price}")

# Use cast to send
import subprocess
result = subprocess.run([
    'cast', 'send', '--json',
    '--private-key', PRIVKEY,
    '--rpc-url', RPC,
    '--nonce', str(nonce),
    '--gas-price', str(gas_price),
    '--gas-limit', '21000',
    ACCOUNT,  # send to self
    '--value', '0',
], capture_output=True, text=True, timeout=15)

if result.returncode == 0:
    try:
        tx_result = json.loads(result.stdout)
        print(f"TX mined! Hash: {tx_result.get('transactionHash')}")
        print(f"Block: {tx_result.get('blockNumber')}")
        print(f"Status: {tx_result.get('status')}")
    except json.JSONDecodeError:
        print(f"TX stdout: {result.stdout}")
else:
    print(f"TX stderr: {result.stderr[:500]}")
    print(f"TX stdout: {result.stdout[:500]}")
