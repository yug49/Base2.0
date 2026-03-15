#!/usr/bin/env python3
"""Fix genesis.json and rollup.json to remove unsupported forks."""
import json

# Fix genesis.json - remove unsupported forks
with open('/Users/shubhtastic/Documents/ETHMumbai/ShadowBase/devnet/genesis.json') as f:
    g = json.load(f)

# Our op-geth supports up to Ecotone (V3 engine).
# Remove: fjord, granite, holocene, isthmus, jovian, prague
unsupported = ['fjordTime', 'graniteTime', 'holoceneTime', 'isthmusTime', 'jovianTime', 'pragueTime']
for fork in unsupported:
    if fork in g['config']:
        del g['config'][fork]
        print(f'Removed {fork} from genesis.json')

with open('/Users/shubhtastic/Documents/ETHMumbai/ShadowBase/devnet/genesis.json', 'w') as f:
    json.dump(g, f)
print('genesis.json updated')

# Fix rollup.json - remove unsupported forks
with open('/Users/shubhtastic/Documents/ETHMumbai/ShadowBase/devnet/rollup.json') as f:
    r = json.load(f)

unsupported_rollup = ['fjord_time', 'granite_time', 'holocene_time', 'isthmus_time', 'jovian_time']
for fork in unsupported_rollup:
    if fork in r:
        del r[fork]
        print(f'Removed {fork} from rollup.json')

with open('/Users/shubhtastic/Documents/ETHMumbai/ShadowBase/devnet/rollup.json', 'w') as f:
    json.dump(r, f, indent=2)
    f.write('\n')
print('rollup.json updated')
