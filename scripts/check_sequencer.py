#!/usr/bin/env python3
"""Check op-node sequencer status and diagnose tx mining."""
import requests
import json

# Check op-node sequencer status
r = requests.post('http://localhost:9545', json={'jsonrpc':'2.0','id':1,'method':'optimism_syncStatus','params':[]})
data = r.json()
result = data.get('result', {})
print('Sync Status:')
for k in ['head_l1', 'current_l1', 'current_l1_finalized', 'unsafe_l2', 'safe_l2', 'finalized_l2']:
    v = result.get(k, {})
    if isinstance(v, dict):
        print(f'  {k}: block={v.get("number","?")}')
    else:
        print(f'  {k}: {v}')

print()

# Check sequencer active
r2 = requests.post('http://localhost:9545', json={'jsonrpc':'2.0','id':2,'method':'admin_sequencerActive','params':[]})
print(f'Sequencer active: {r2.json()}')

r3 = requests.post('http://localhost:9545', json={'jsonrpc':'2.0','id':3,'method':'optimism_rollupConfig','params':[]})
config = r3.json().get('result', {})
print(f'Seq window: {config.get("seq_window_size")}')
print(f'Block time: {config.get("block_time")}')
