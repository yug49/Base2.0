#!/usr/bin/env python3
"""Get L1 origin block timestamp from Sepolia to compute exact drift."""
import urllib.request, json

def rpc(url, method, params=[]):
    data = json.dumps({'jsonrpc':'2.0','method':method,'params':params,'id':1}).encode()
    req = urllib.request.Request(url, data, {'Content-Type':'application/json'})
    return json.loads(urllib.request.urlopen(req).read())['result']

L1_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
L1_ORIGIN_BLOCK = 10424753

# Get L1 origin block timestamp
l1_block = rpc(L1_RPC, 'eth_getBlockByNumber', [hex(L1_ORIGIN_BLOCK), False])
l1_origin_time = int(l1_block['timestamp'], 16)
print(f"L1 origin block {L1_ORIGIN_BLOCK} timestamp: {l1_origin_time}")

# L2 timestamp from earlier
l2_timestamp = 1773203250
drift = l2_timestamp - l1_origin_time
print(f"L2 timestamp: {l2_timestamp}")
print(f"Drift: {drift}s ({drift/3600:.1f} hours)")
print(f"Max drift: 600s")
print(f"NoTxPool: {drift > 600}")

# Get current L1 head
l1_head = rpc(L1_RPC, 'eth_getBlockByNumber', ['latest', False])
l1_head_num = int(l1_head['number'], 16)
l1_head_time = int(l1_head['timestamp'], 16)
print(f"\nCurrent L1 head: {l1_head_num}, time: {l1_head_time}")
print(f"L1 blocks behind: {l1_head_num - L1_ORIGIN_BLOCK}")
print(f"L1 time behind: {l1_head_time - l1_origin_time}s ({(l1_head_time - l1_origin_time)/3600:.1f} hours)")
