#!/usr/bin/env python3
"""Deploy ShieldedPool implementation and upgrade proxy via ProxyAdmin."""
import json, time, sys, re
from web3 import Web3
from eth_account import Account

RPC = 'http://localhost:8545'
w3 = Web3(Web3.HTTPProvider(RPC, request_kwargs={'timeout': 10}))

# Accounts
ACCOUNT0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
ACCOUNT0_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
DEPLOYER_KEY = '0xb09ca610c1b6987901955b954c83a33b3086fbadf39a8bf09899832074b57979'
deployer_acct = Account.from_key(DEPLOYER_KEY)
DEPLOYER = deployer_acct.address
print(f"Deployer address: {DEPLOYER}")

# Addresses
PROXY_ADMIN = '0x4200000000000000000000000000000000000018'
SHIELDED_POOL_PROXY = '0x4200000000000000000000000000000000000070'
CHAIN_ID = 845311

def wait_connected():
    for i in range(30):
        try:
            bn = w3.eth.block_number
            print(f"Connected! Block: {bn}")
            return bn
        except:
            time.sleep(2)
    print("ERROR: Cannot connect to geth")
    sys.exit(1)

def send_tx(key, tx):
    """Sign and send transaction, wait for receipt."""
    acct = Account.from_key(key)
    tx['from'] = acct.address
    tx['nonce'] = w3.eth.get_transaction_count(acct.address)
    tx['chainId'] = CHAIN_ID
    if 'gas' not in tx:
        tx['gas'] = w3.eth.estimate_gas(tx)
    if 'gasPrice' not in tx:
        tx['gasPrice'] = w3.eth.gas_price * 2
    
    signed = acct.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"  TX sent: {tx_hash.hex()[:20]}... waiting...")
    
    for i in range(60):
        time.sleep(2)
        try:
            receipt = w3.eth.get_transaction_receipt(tx_hash)
            if receipt:
                status = receipt['status']
                block = receipt['blockNumber']
                gas_used = receipt['gasUsed']
                print(f"  Mined block {block}, status={'OK' if status==1 else 'REVERTED'}, gas={gas_used}")
                return receipt
        except:
            pass
    print("  ERROR: TX not mined after 120s")
    sys.exit(1)

# ============================================================
# Step 0: Verify connectivity and balances
# ============================================================
print("\n=== Step 0: Verify connectivity ===")
wait_connected()

deployer_bal = w3.eth.get_balance(DEPLOYER)
account0_bal = w3.eth.get_balance(ACCOUNT0)
print(f"Deployer ({DEPLOYER}) balance: {deployer_bal / 1e18:.4f} ETH")
print(f"Account0 ({ACCOUNT0}) balance: {account0_bal / 1e18:.4f} ETH")

# Verify ProxyAdmin owner
pa_owner_slot = '0x' + '0' * 64
pa_owner_raw = w3.eth.get_storage_at(PROXY_ADMIN, pa_owner_slot)
pa_owner = Web3.to_checksum_address('0x' + pa_owner_raw[-20:].hex())
print(f"ProxyAdmin owner: {pa_owner}")
assert pa_owner.lower() == DEPLOYER.lower(), f"ProxyAdmin owner {pa_owner} != deployer {DEPLOYER}"
print("  OK: Deployer is ProxyAdmin owner")

# Fund deployer if needed
if deployer_bal < Web3.to_wei(0.1, 'ether'):
    print(f"\nFunding deployer with 10 ETH from account0...")
    send_tx(ACCOUNT0_KEY, {
        'to': DEPLOYER,
        'value': Web3.to_wei(10, 'ether'),
    })
    deployer_bal = w3.eth.get_balance(DEPLOYER)
    print(f"Deployer balance now: {deployer_bal / 1e18:.4f} ETH")

# ============================================================
# Step 1: Deploy PoseidonT3
# ============================================================
print("\n=== Step 1: Deploy PoseidonT3 ===")
with open('out/Poseidon.sol/PoseidonT3.json') as f:
    posT3_artifact = json.load(f)
posT3_bytecode = posT3_artifact['bytecode']['object']
if not posT3_bytecode.startswith('0x'):
    posT3_bytecode = '0x' + posT3_bytecode

receipt = send_tx(DEPLOYER_KEY, {
    'data': posT3_bytecode,
    'value': 0,
})
POSEIDON_T3_ADDR = receipt['contractAddress']
print(f"PoseidonT3 deployed at: {POSEIDON_T3_ADDR}")

# ============================================================
# Step 2: Deploy PoseidonT4
# ============================================================
print("\n=== Step 2: Deploy PoseidonT4 ===")
with open('out/Poseidon.sol/PoseidonT4.json') as f:
    posT4_artifact = json.load(f)
posT4_bytecode = posT4_artifact['bytecode']['object']
if not posT4_bytecode.startswith('0x'):
    posT4_bytecode = '0x' + posT4_bytecode

receipt = send_tx(DEPLOYER_KEY, {
    'data': posT4_bytecode,
    'value': 0,
})
POSEIDON_T4_ADDR = receipt['contractAddress']
print(f"PoseidonT4 deployed at: {POSEIDON_T4_ADDR}")

# ============================================================
# Step 3: Deploy ShieldedPool implementation
# ============================================================
print("\n=== Step 3: Deploy ShieldedPool implementation ===")
with open('out/ShieldedPool.sol/ShieldedPool.json') as f:
    sp_artifact = json.load(f)

sp_bytecode = sp_artifact['bytecode']['object']
if not sp_bytecode.startswith('0x'):
    sp_bytecode = '0x' + sp_bytecode

# Link libraries
link_refs = sp_artifact['bytecode'].get('linkReferences', {})
print(f"Link references: {json.dumps(link_refs, indent=2)}")

for source_file, libs in link_refs.items():
    for lib_name, offsets in libs.items():
        if 'PoseidonT3' in lib_name:
            addr = POSEIDON_T3_ADDR
        elif 'PoseidonT4' in lib_name:
            addr = POSEIDON_T4_ADDR
        else:
            print(f"  WARNING: Unknown library {lib_name}")
            continue
        
        addr_hex = addr.lower().replace('0x', '')
        print(f"  Linking {lib_name} -> {addr}")
        
        for offset_info in offsets:
            start = offset_info['start'] * 2 + 2  # *2 hex, +2 for '0x'
            length = offset_info['length'] * 2
            sp_bytecode = sp_bytecode[:start] + addr_hex + sp_bytecode[start+length:]

remaining = re.findall(r'__\$[a-f0-9]{34}\$__', sp_bytecode)
assert len(remaining) == 0, f"Still have {len(remaining)} unlinked placeholders!"
print("  All libraries linked")

receipt = send_tx(DEPLOYER_KEY, {
    'data': sp_bytecode,
    'value': 0,
    'gas': 6000000,
})
SHIELDED_POOL_IMPL = receipt['contractAddress']
print(f"ShieldedPool impl deployed at: {SHIELDED_POOL_IMPL}")

# ============================================================
# Step 4: Upgrade proxy via ProxyAdmin
# ============================================================
print("\n=== Step 4: Upgrade proxy via ProxyAdmin ===")
upgrade_sel = Web3.keccak(text='upgrade(address,address)')[:4]
proxy_padded = SHIELDED_POOL_PROXY.lower().replace('0x', '').zfill(64)
impl_padded = SHIELDED_POOL_IMPL.lower().replace('0x', '').zfill(64)
upgrade_data = '0x' + upgrade_sel.hex() + proxy_padded + impl_padded

receipt = send_tx(DEPLOYER_KEY, {
    'to': PROXY_ADMIN,
    'data': upgrade_data,
    'value': 0,
})
assert receipt['status'] == 1, "ProxyAdmin.upgrade() REVERTED!"
print("  Proxy upgraded!")

# Verify
IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
impl_raw = w3.eth.get_storage_at(SHIELDED_POOL_PROXY, IMPL_SLOT)
impl_addr = Web3.to_checksum_address('0x' + impl_raw[-20:].hex())
print(f"  Proxy implementation: {impl_addr}")
assert impl_addr.lower() == SHIELDED_POOL_IMPL.lower()

# ============================================================
# Step 5: Initialize ShieldedPool
# ============================================================
print("\n=== Step 5: Initialize ShieldedPool ===")
init_sel = Web3.keccak(text='initialize(address,address,address)')[:4]
treasury = ACCOUNT0.lower().replace('0x', '').zfill(64)
verifier = '0' * 64
owner = ACCOUNT0.lower().replace('0x', '').zfill(64)
init_data = '0x' + init_sel.hex() + treasury + verifier + owner

receipt = send_tx(ACCOUNT0_KEY, {
    'to': SHIELDED_POOL_PROXY,
    'data': init_data,
    'value': 0,
})
if receipt['status'] == 1:
    print("  ShieldedPool initialized!")
else:
    print("  Initialize REVERTED (may already be initialized)")

# ============================================================
# Step 6: Verify state
# ============================================================
print("\n=== Step 6: Verify state ===")
ps_sel = Web3.keccak(text='pendingShields(address)')[:4]
ps_data = '0x' + ps_sel.hex() + ACCOUNT0.lower().replace('0x', '').zfill(64)
result = w3.eth.call({'to': SHIELDED_POOL_PROXY, 'data': ps_data})
pending = int.from_bytes(result, 'big')
print(f"pendingShields(account0): {pending / 1e18:.4f} ETH")

mode_sel = Web3.keccak(text='mode()')[:4]
result = w3.eth.call({'to': SHIELDED_POOL_PROXY, 'data': '0x' + mode_sel.hex()})
mode_val = int.from_bytes(result, 'big')
print(f"mode: {mode_val}")

print("\n=== DONE ===")
print(f"PoseidonT3:      {POSEIDON_T3_ADDR}")
print(f"PoseidonT4:      {POSEIDON_T4_ADDR}")
print(f"ShieldedPool:    {SHIELDED_POOL_IMPL}")
print(f"Proxy:           {SHIELDED_POOL_PROXY}")
print(f"Pending shields: {pending / 1e18:.4f} ETH")
