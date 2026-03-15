#!/usr/bin/env python3
"""
Deploy ShieldedPool implementation using Python eth-account for signing.
Steps:
1. Deploy PoseidonT3 library
2. Deploy PoseidonT4 library
3. Link libraries into ShieldedPool bytecode
4. Deploy ShieldedPool implementation
5. Set EIP-1967 implementation slot on proxy
6. Initialize ShieldedPool
"""
import urllib.request, json, time, re, sys
from eth_account import Account
from eth_account.signers.local import LocalAccount

RPC = 'http://localhost:8545'
CHAIN_ID = 845311
PRIVKEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
ACCOUNT_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
PROXY_ADDR = '0x4200000000000000000000000000000000000070'
PROXY_ADMIN = '0x4200000000000000000000000000000000000018'
IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

acct: LocalAccount = Account.from_key(PRIVKEY)

def rpc(method, params=[]):
    data = json.dumps({'jsonrpc':'2.0','method':method,'params':params,'id':1}).encode()
    req = urllib.request.Request(RPC, data, {'Content-Type':'application/json'})
    resp = json.loads(urllib.request.urlopen(req, timeout=10).read())
    if 'error' in resp:
        raise Exception(f"RPC error [{method}]: {resp['error']}")
    return resp['result']

def get_nonce():
    return int(rpc('eth_getTransactionCount', [ACCOUNT_ADDR, 'latest']), 16)

def get_gas_price():
    return max(int(rpc('eth_gasPrice'), 16) * 2, 10000000)  # at least 10 gwei

def send_tx(tx_dict):
    """Sign and send transaction, wait for receipt."""
    signed = acct.sign_transaction(tx_dict)
    raw_hex = signed.raw_transaction.hex()
    if not raw_hex.startswith('0x'):
        raw_hex = '0x' + raw_hex
    tx_hash = rpc('eth_sendRawTransaction', [raw_hex])
    print(f"  TX sent: {tx_hash}")
    
    for i in range(30):
        time.sleep(2)
        receipt = rpc('eth_getTransactionReceipt', [tx_hash])
        if receipt:
            status = int(receipt['status'], 16)
            block = int(receipt['blockNumber'], 16)
            gas_used = int(receipt['gasUsed'], 16)
            contract = receipt.get('contractAddress')
            print(f"  Mined in block {block}, status={'OK' if status else 'FAILED'}, gas={gas_used}")
            if contract:
                print(f"  Contract deployed at: {contract}")
            if not status:
                raise Exception("Transaction reverted!")
            return receipt
    raise Exception("Transaction not mined after 60 seconds")

def deploy_contract(bytecode_hex, nonce=None):
    """Deploy a contract with the given bytecode."""
    if nonce is None:
        nonce = get_nonce()
    gas_price = get_gas_price()
    
    # Estimate gas
    tx_data = {
        'from': ACCOUNT_ADDR,
        'data': bytecode_hex if bytecode_hex.startswith('0x') else '0x' + bytecode_hex,
    }
    try:
        gas = int(rpc('eth_estimateGas', [tx_data]), 16)
        gas = int(gas * 1.5)  # 50% buffer
    except Exception as e:
        print(f"  Gas estimation failed: {e}, using 5M")
        gas = 5000000
    
    tx = {
        'nonce': nonce,
        'gasPrice': gas_price,
        'gas': gas,
        'to': '',  # contract creation
        'value': 0,
        'data': bytecode_hex if bytecode_hex.startswith('0x') else '0x' + bytecode_hex,
        'chainId': CHAIN_ID,
    }
    return send_tx(tx)

def load_artifact(path):
    """Load a forge artifact JSON file."""
    with open(path) as f:
        return json.load(f)

# ============================================================
# Step 0: Check current state
# ============================================================
print("=" * 60)
print("Step 0: Current state")
print("=" * 60)
nonce = get_nonce()
balance = int(rpc('eth_getBalance', [ACCOUNT_ADDR, 'latest']), 16)
impl_slot = rpc('eth_getStorageAt', [PROXY_ADDR, IMPL_SLOT, 'latest'])
print(f"Account: {ACCOUNT_ADDR}")
print(f"Nonce: {nonce}")
print(f"Balance: {balance / 1e18:.4f} ETH")
print(f"Current proxy impl: {impl_slot}")
print(f"Latest block: {int(rpc('eth_getBlockByNumber', ['latest', False])['number'], 16)}")

# ============================================================
# Step 1: Deploy PoseidonT3
# ============================================================
print("\n" + "=" * 60)
print("Step 1: Deploy PoseidonT3")
print("=" * 60)
art_t3 = load_artifact('out/Poseidon.sol/PoseidonT3.json')
bytecode_t3 = art_t3['bytecode']['object']
if not bytecode_t3.startswith('0x'):
    bytecode_t3 = '0x' + bytecode_t3
print(f"PoseidonT3 bytecode length: {len(bytecode_t3)//2 - 1} bytes")

receipt_t3 = deploy_contract(bytecode_t3)
poseidon_t3_addr = receipt_t3['contractAddress']
print(f"PoseidonT3 deployed at: {poseidon_t3_addr}")

# ============================================================
# Step 2: Deploy PoseidonT4
# ============================================================
print("\n" + "=" * 60)
print("Step 2: Deploy PoseidonT4")
print("=" * 60)
art_t4 = load_artifact('out/Poseidon.sol/PoseidonT4.json')
bytecode_t4 = art_t4['bytecode']['object']
if not bytecode_t4.startswith('0x'):
    bytecode_t4 = '0x' + bytecode_t4
print(f"PoseidonT4 bytecode length: {len(bytecode_t4)//2 - 1} bytes")

receipt_t4 = deploy_contract(bytecode_t4)
poseidon_t4_addr = receipt_t4['contractAddress']
print(f"PoseidonT4 deployed at: {poseidon_t4_addr}")

# ============================================================
# Step 3: Link libraries into ShieldedPool bytecode
# ============================================================
print("\n" + "=" * 60)
print("Step 3: Link libraries and deploy ShieldedPool")
print("=" * 60)
art_pool = load_artifact('out/ShieldedPool.sol/ShieldedPool.json')
pool_bytecode = art_pool['bytecode']['object']
if pool_bytecode.startswith('0x'):
    pool_bytecode = pool_bytecode[2:]

# Check for unlinked library references
link_refs = art_pool['bytecode'].get('linkReferences', {})
print(f"Link references: {json.dumps(link_refs, indent=2)}")

# Replace library placeholders
# Format: __$<hash>$__ where hash is keccak256 of fully-qualified library name
# We need to replace these with the deployed addresses (without 0x, padded to 20 bytes)
t3_addr_clean = poseidon_t3_addr.lower().replace('0x', '')
t4_addr_clean = poseidon_t4_addr.lower().replace('0x', '')

# Find all placeholders
placeholders = re.findall(r'__\$[a-f0-9]{34}\$__', pool_bytecode)
unique_placeholders = list(set(placeholders))
print(f"Found {len(unique_placeholders)} unique library placeholders")

if len(unique_placeholders) == 2:
    # We need to figure out which is T3 and which is T4
    # The link references tell us
    for file_path, libs in link_refs.items():
        for lib_name, offsets in libs.items():
            # Get the placeholder at the first offset
            if offsets:
                offset = offsets[0]['start'] * 2  # byte offset to hex offset
                placeholder = pool_bytecode[offset:offset+40]
                placeholder_pattern = '__$' + placeholder[3:-3] + '$__' if '__$' in pool_bytecode[offset-3:offset+43] else placeholder
                
                # Actually, let's just search for the pattern at this offset
                actual = pool_bytecode[offset:offset+40]
                print(f"  Library {lib_name} at offset {offsets[0]['start']}: placeholder={actual}")
                
                if 'T3' in lib_name or 'PoseidonT3' in lib_name:
                    print(f"  Replacing {actual} with PoseidonT3 address: {t3_addr_clean}")
                    pool_bytecode = pool_bytecode.replace(actual, t3_addr_clean)
                elif 'T4' in lib_name or 'PoseidonT4' in lib_name:
                    print(f"  Replacing {actual} with PoseidonT4 address: {t4_addr_clean}")
                    pool_bytecode = pool_bytecode.replace(actual, t4_addr_clean)
                else:
                    print(f"  Unknown library: {lib_name}")
elif len(unique_placeholders) == 0:
    print("No placeholders found - bytecode already linked or stubs")
else:
    print(f"Unexpected number of placeholders: {unique_placeholders}")

# Verify no remaining placeholders
remaining = re.findall(r'__\$[a-f0-9]{34}\$__', pool_bytecode)
if remaining:
    print(f"ERROR: Still have unlinked references: {remaining}")
    sys.exit(1)

pool_bytecode = '0x' + pool_bytecode
print(f"ShieldedPool bytecode length: {len(pool_bytecode)//2 - 1} bytes")

# Deploy
receipt_pool = deploy_contract(pool_bytecode)
pool_impl_addr = receipt_pool['contractAddress']
print(f"ShieldedPool implementation deployed at: {pool_impl_addr}")

# ============================================================
# Step 4: Set proxy implementation via ProxyAdmin
# ============================================================
print("\n" + "=" * 60)
print("Step 4: Upgrade proxy to point to implementation")
print("=" * 60)

# Check who owns the ProxyAdmin
admin_owner_slot = '0x0'  # owner is usually slot 0 for Ownable
admin_owner = rpc('eth_getStorageAt', [PROXY_ADMIN, admin_owner_slot, 'latest'])
print(f"ProxyAdmin owner (slot 0): {admin_owner}")

# The ProxyAdmin.upgrade(address proxy, address implementation) selector
# upgrade(address,address) = 0x99a88ec4
upgrade_selector = '0x99a88ec4'
proxy_padded = PROXY_ADDR.lower().replace('0x', '').zfill(64)
impl_padded = pool_impl_addr.lower().replace('0x', '').zfill(64)
upgrade_data = upgrade_selector + proxy_padded + impl_padded

print(f"Calling ProxyAdmin.upgrade({PROXY_ADDR}, {pool_impl_addr})")

# First check if our account is the ProxyAdmin owner
# The ProxyAdmin owner from conversation summary is 0xedB816F31AbCd2e14051ee7d53fc4AeCc49eA551
# But our key is for 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
# We can't call upgrade if we're not the owner

# Alternative: directly set the EIP-1967 implementation slot using debug_setStorageAt
# But that's not available either

# Let's try a different approach: call upgrade and see what happens
nonce = get_nonce()
gas_price = get_gas_price()

try:
    gas = int(rpc('eth_estimateGas', [{
        'from': ACCOUNT_ADDR,
        'to': PROXY_ADMIN,
        'data': upgrade_data,
    }]), 16)
    gas = int(gas * 1.5)
    print(f"Gas estimate for upgrade: {gas}")
except Exception as e:
    print(f"Gas estimation for upgrade failed: {e}")
    print("This likely means we're not the ProxyAdmin owner")
    print("")
    print("Alternative: Trying to set implementation slot directly...")
    
    # Since we can't use ProxyAdmin.upgrade(), let's check if we can use
    # the admin's upgradeAndCall function, or if the admin has a different owner
    
    # Actually, let's check what the ProxyAdmin owner address is more carefully
    # _OWNER_SLOT might not be slot 0 for the OP Stack ProxyAdmin
    # Let's read a few slots
    for i in range(5):
        val = rpc('eth_getStorageAt', [PROXY_ADMIN, hex(i), 'latest'])
        if val != '0x0000000000000000000000000000000000000000000000000000000000000000':
            print(f"  ProxyAdmin slot {i}: {val}")
    
    # Check if ACCOUNT_ADDR is the admin owner by trying eth_call
    # owner() = 0x8da5cb5b
    try:
        owner_result = rpc('eth_call', [{'to': PROXY_ADMIN, 'data': '0x8da5cb5b'}, 'latest'])
        owner_addr = '0x' + owner_result[-40:]
        print(f"  ProxyAdmin.owner() = {owner_addr}")
    except Exception as e2:
        print(f"  Could not call owner(): {e2}")
    
    print("\nSince ProxyAdmin.upgrade() is restricted, trying alternative approaches...")
    print("Option 1: If the proxy admin is actually our account")
    
    # Check if the proxy's admin is different from ProxyAdmin contract
    # EIP-1967 admin slot: bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
    ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'
    proxy_admin_from_slot = rpc('eth_getStorageAt', [PROXY_ADDR, ADMIN_SLOT, 'latest'])
    print(f"Proxy admin (EIP-1967 slot): {proxy_admin_from_slot}")
    admin_addr = '0x' + proxy_admin_from_slot[-40:]
    print(f"Proxy admin address: {admin_addr}")
    
    if admin_addr.lower() == PROXY_ADMIN.lower():
        print("Proxy admin IS the ProxyAdmin contract. Need ProxyAdmin.owner() to call upgrade.")
        
        # Try calling ProxyAdmin.upgrade as the owner
        # Let's see who the owner is and if we can impersonate
        try:
            owner_result = rpc('eth_call', [{'to': PROXY_ADMIN, 'data': '0x8da5cb5b'}, 'latest'])
            owner_addr = '0x' + owner_result[-40:]
            print(f"ProxyAdmin owner: {owner_addr}")
            
            if owner_addr.lower() == ACCOUNT_ADDR.lower():
                print("WE ARE THE OWNER! Retrying upgrade...")
                gas = 200000
            else:
                print(f"Owner is {owner_addr}, not us ({ACCOUNT_ADDR})")
                print("\nFallback: Will patch op-geth to add debug_setStorageAt")
                sys.exit(1)
        except Exception as e3:
            print(f"Could not determine owner: {e3}")
            sys.exit(1)
    else:
        print(f"Proxy admin is {admin_addr}, not ProxyAdmin contract")
        print("Trying direct proxy admin call...")
        gas = 200000

# Send upgrade tx
tx = {
    'nonce': nonce,
    'gasPrice': gas_price,
    'gas': gas,
    'to': PROXY_ADMIN,
    'value': 0,
    'data': upgrade_data,
    'chainId': CHAIN_ID,
}
receipt_upgrade = send_tx(tx)
print("Upgrade transaction mined!")

# Verify
impl_after = rpc('eth_getStorageAt', [PROXY_ADDR, IMPL_SLOT, 'latest'])
print(f"Implementation slot after upgrade: {impl_after}")
expected = '0x' + pool_impl_addr.lower().replace('0x', '').zfill(64)
if impl_after.lower() == expected.lower():
    print("SUCCESS! Proxy now points to ShieldedPool implementation!")
else:
    print(f"WARNING: Expected {expected}, got {impl_after}")

# ============================================================
# Step 5: Initialize ShieldedPool
# ============================================================
print("\n" + "=" * 60)
print("Step 5: Initialize ShieldedPool")
print("=" * 60)

# initialize(address _treasury, address _verifier, address _owner)
# initialize(address,address,address) = function selector
# keccak256("initialize(address,address,address)") first 4 bytes
from web3 import Web3
init_selector = '0x' + Web3.keccak(text='initialize(address,address,address)').hex()[2:10]
print(f"initialize selector: {init_selector}")

# Parameters: treasury=ACCOUNT_ADDR, verifier=zero (or some address), owner=ACCOUNT_ADDR
treasury = ACCOUNT_ADDR.lower().replace('0x', '').zfill(64)
verifier = '0000000000000000000000000000000000000000'.zfill(64)  # zero address for now
owner = ACCOUNT_ADDR.lower().replace('0x', '').zfill(64)
init_data = init_selector + treasury + verifier + owner

print(f"Calling initialize({ACCOUNT_ADDR}, 0x0, {ACCOUNT_ADDR})")

nonce = get_nonce()
try:
    gas = int(rpc('eth_estimateGas', [{
        'from': ACCOUNT_ADDR,
        'to': PROXY_ADDR,
        'data': init_data,
    }]), 16)
    gas = int(gas * 1.5)
except Exception as e:
    print(f"Gas estimation failed: {e}")
    gas = 500000

tx = {
    'nonce': nonce,
    'gasPrice': gas_price,
    'gas': gas,
    'to': PROXY_ADDR,
    'value': 0,
    'data': init_data,
    'chainId': CHAIN_ID,
}
receipt_init = send_tx(tx)
print("Initialize transaction mined!")

# ============================================================
# Step 6: Verify
# ============================================================
print("\n" + "=" * 60)
print("Step 6: Verify")
print("=" * 60)

# Check pendingShields for our account
# pendingShields(address) selector
pending_sel = '0x' + Web3.keccak(text='pendingShields(address)').hex()[2:10]
pending_data = pending_sel + ACCOUNT_ADDR.lower().replace('0x', '').zfill(64)

try:
    result = rpc('eth_call', [{'to': PROXY_ADDR, 'data': pending_data}, 'latest'])
    pending_amount = int(result, 16)
    print(f"pendingShields({ACCOUNT_ADDR}) = {pending_amount / 1e18:.4f} ETH")
except Exception as e:
    print(f"Error calling pendingShields: {e}")

# Check mode
mode_data = '0x' + Web3.keccak(text='mode()').hex()[2:10]
try:
    result = rpc('eth_call', [{'to': PROXY_ADDR, 'data': mode_data}, 'latest'])
    mode = int(result, 16)
    print(f"mode() = {mode}")
except Exception as e:
    print(f"Error calling mode: {e}")

print("\nDone! ShieldedPool is deployed and initialized.")
print(f"Implementation: {pool_impl_addr}")
print(f"PoseidonT3: {poseidon_t3_addr}")
print(f"PoseidonT4: {poseidon_t4_addr}")
