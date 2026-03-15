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
print(f"L2 time vs wall: L2 is {current_time - l2_time}s behind wall clock ({(current_time - l2_time)/3600:.1f} hours)")

# Check op-node sync status
resp = rpc('http://localhost:9545', 'optimism_syncStatus')
print(f"\nFull unsafe_l2: {json.dumps(resp.get('unsafe_l2', {}), indent=2)}")

unsafe = resp.get('unsafe_l2', {})
l1origin = unsafe.get('l1origin', {})
print(f"\nL1 origin: {json.dumps(l1origin, indent=2)}")
print(f"L2 unsafe time: {unsafe.get('time', unsafe.get('timestamp'))}")

# Try different key names
l1_time = l1origin.get('timestamp', l1origin.get('time', 0))
l2_ts = unsafe.get('time', unsafe.get('timestamp', 0))
if l1_time and l2_ts:
    drift = l2_ts - l1_time
    print(f"\nDrift: {drift}s")
    print(f"Max drift: 600s")
    print(f"NoTxPool: {drift > 600}")
