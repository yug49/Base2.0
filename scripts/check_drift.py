#!/usr/bin/env python3
import urllib.request, json, time

def rpc(url, method, params=[]):
    data = json.dumps({'jsonrpc':'2.0','method':method,'params':params,'id':1}).encode()
    req = urllib.request.Request(url, data, {'Content-Type':'application/json'})
    return json.loads(urllib.request.urlopen(req).read())['result']

# Get latest L2 block
block = rpc('http://localhost:8545', 'eth_getBlockByNumber', ['latest', False])
l2_time = int(block['timestamp'], 16)
l2_num = int(block['number'], 16)
print(f"L2 latest block: {l2_num}, timestamp: {l2_time}")

current_time = int(time.time())
print(f"Current wall time: {current_time}")
print(f"L2 time vs wall: L2 is {current_time - l2_time}s behind wall clock")

# Check op-node sync status
resp = rpc('http://localhost:9545', 'optimism_syncStatus')
l1_origin_time = resp['unsafe_l2']['l1origin']['timestamp']
l2_timestamp = resp['unsafe_l2']['timestamp']
drift = l2_timestamp - l1_origin_time
print(f"\nL1 origin time: {l1_origin_time}")
print(f"L2 unsafe timestamp: {l2_timestamp}")
print(f"Drift (L2 - L1 origin): {drift}s")
print(f"Max sequencer drift: 600s")
print(f"NoTxPool condition (drift > 600): {drift > 600}")

current_l1 = resp.get('current_l1', {})
head_l1 = resp.get('head_l1', {})
print(f"\nCurrent L1: number={current_l1.get('number')}, time={current_l1.get('timestamp')}")
print(f"Head L1: number={head_l1.get('number')}, time={head_l1.get('timestamp')}")
print(f"L1 origin of unsafe L2: number={resp['unsafe_l2']['l1origin']['number']}")

# How far behind is L1 sync?
if head_l1.get('timestamp') and current_l1.get('timestamp'):
    print(f"\nL1 sync lag: head is {head_l1['timestamp'] - current_l1['timestamp']}s ahead of current")
    print(f"L1 blocks behind: {head_l1['number'] - current_l1['number']}")
