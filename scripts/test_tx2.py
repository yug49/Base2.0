#!/usr/bin/env python3
"""Send raw transaction and check if it mines."""
import urllib.request, json, time

RPC = 'http://localhost:8545'
ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

def rpc(method, params=[]):
    data = json.dumps({'jsonrpc':'2.0','method':method,'params':params,'id':1}).encode()
    req = urllib.request.Request(RPC, data, {'Content-Type':'application/json'})
    resp = json.loads(urllib.request.urlopen(req, timeout=5).read())
    if 'error' in resp:
        raise Exception(f"RPC error: {resp['error']}")
    return resp['result']

# Check txpool 
pool = rpc('txpool_status')
pending = int(pool['pending'], 16)
print(f"Txpool: pending={pending}")

# Check block progress
b1 = rpc('eth_getBlockByNumber', ['latest', False])
n1 = int(b1['number'], 16)
print(f"Block now: {n1}")

time.sleep(5)

b2 = rpc('eth_getBlockByNumber', ['latest', False])
n2 = int(b2['number'], 16)
print(f"Block after 5s: {n2} (delta: {n2-n1})")

# Check if that cast tx from before is in pool now
pool2 = rpc('txpool_status')
pending2 = int(pool2['pending'], 16)
print(f"Txpool after: pending={pending2}")

# Check sending via eth_sendRawTransaction with raw Python
# First, sign a simple tx
import subprocess
result = subprocess.run(
    ['cast', 'mktx', '--private-key', '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
     '--rpc-url', RPC, '--nonce', '5', '--gas-price', '2000504', '--gas-limit', '21000',
     ACCOUNT, '--value', '0'],
    capture_output=True, text=True, timeout=10
)
if result.returncode != 0:
    print(f"mktx error: {result.stderr[:300]}")
else:
    raw_tx = result.stdout.strip().split('\n')[-1]
    print(f"Signed raw tx: {raw_tx[:40]}...")
    
    # Send it
    tx_hash = rpc('eth_sendRawTransaction', [raw_tx])
    print(f"Sent! Hash: {tx_hash}")
    
    # Wait and check
    for i in range(10):
        time.sleep(2)
        receipt = rpc('eth_getTransactionReceipt', [tx_hash])
        if receipt:
            print(f"Mined in block {int(receipt['blockNumber'], 16)}, status: {receipt['status']}")
            break
        block = rpc('eth_getBlockByNumber', ['latest', False])
        bn = int(block['number'], 16)
        pool_s = rpc('txpool_status')
        pp = int(pool_s['pending'], 16)
        print(f"  Waiting... block={bn}, txpool_pending={pp}")
    else:
        print("TX not mined after 20 seconds")
