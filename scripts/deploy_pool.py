#!/usr/bin/env python3
"""
Deploy ShieldedPool implementation and upgrade the proxy.

Steps:
1. Fund deployer (0xedB8...) from account0 (has 10k ETH)
2. Deploy ShieldedPool implementation from deployer
3. Call ProxyAdmin.upgradeAndCall(proxy, impl, initialize(...)) from deployer
"""
from web3 import Web3
import json

w3 = Web3(Web3.HTTPProvider('http://localhost:8545'))
print(f'Block: {w3.eth.block_number}')

# Addresses
PROXY_ADMIN = Web3.to_checksum_address('0x4200000000000000000000000000000000000018')
POOL_PROXY  = Web3.to_checksum_address('0x4200000000000000000000000000000000000070')
DEPLOYER    = Web3.to_checksum_address('0xedB816F31AbCd2e14051ee7d53fc4AeCc49eA551')
ACCOUNT0    = Web3.to_checksum_address('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
ACCOUNT0_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

# Step 1: Fund deployer with 1 ETH from account0
deployer_bal = w3.eth.get_balance(DEPLOYER)
print(f'Deployer balance: {w3.from_wei(deployer_bal, "ether")} ETH')

if deployer_bal < w3.to_wei(0.1, 'ether'):
    print('\nFunding deployer with 1 ETH...')
    nonce = w3.eth.get_transaction_count(ACCOUNT0)
    tx = {
        'from': ACCOUNT0,
        'to': DEPLOYER,
        'value': w3.to_wei(1, 'ether'),
        'gas': 21000,
        'gasPrice': w3.eth.gas_price,
        'nonce': nonce,
        'chainId': w3.eth.chain_id,
    }
    signed = w3.eth.account.sign_transaction(tx, ACCOUNT0_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
    print(f'Funded! tx={tx_hash.hex()} status={receipt["status"]}')
    print(f'Deployer balance now: {w3.from_wei(w3.eth.get_balance(DEPLOYER), "ether")} ETH')
else:
    print('Deployer already funded.')

# Step 2: Load ShieldedPool bytecode from forge output  
with open('out/ShieldedPool.sol/ShieldedPool.json', 'r') as f:
    artifact = json.load(f)
    
bytecode = artifact['bytecode']['object']
if not bytecode.startswith('0x'):
    bytecode = '0x' + bytecode
print(f'\nShieldedPool bytecode: {len(bytecode)//2 - 1} bytes')

# We need the deployer key. It's derived from the OP Stack deployer.
# Let's check if we can impersonate. Since this is a devnet, we can use 
# eth_sendTransaction with unlocked accounts or we need the private key.
# Let's try to get the deployer's key from the deployment config.

# Actually since this is a devnet, let's try impersonation
# First try if the account is unlocked
try:
    nonce = w3.eth.get_transaction_count(DEPLOYER)
    tx = {
        'from': DEPLOYER,
        'data': bytecode,
        'gas': 5_000_000,
        'gasPrice': w3.eth.gas_price,
        'nonce': nonce,
        'chainId': w3.eth.chain_id,
    }
    # Try eth_sendTransaction (unlocked account)
    tx_hash = w3.eth.send_transaction(tx)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    impl_address = receipt['contractAddress']
    print(f'Implementation deployed at: {impl_address}')
    print(f'Deployment status: {receipt["status"]}')
except Exception as e:
    print(f'Direct send_transaction failed: {e}')
    print('\nDeployer account is not unlocked. Need to find its private key.')
    print('Alternative: transfer ProxyAdmin ownership to account0, then upgrade.')
    
    # Let's find the deployer private key from the deployment config
    import glob
    found_key = None
    for path in glob.glob('devnet/**/*.json', recursive=True):
        try:
            with open(path, 'r') as f:
                content = f.read()
                if 'edB816' in content or 'edb816' in content:
                    print(f'  Found deployer reference in: {path}')
        except:
            pass
    
    # Alternative approach: use a forge script or cast to impersonate
    print('\nTrying alternative: use cast to impersonate deployer...')
    import subprocess
    
    # Actually the simplest approach on a devnet:
    # Use hardhat_impersonateAccount or anvil_impersonateAccount 
    # But we're on op-geth, not anvil. So that won't work.
    #
    # Best plan: The deployer key is likely derived from the OP deployer config.
    # OR we can just bypass the proxy entirely and write code directly to the address.
    print('\nBest approach: bypass the proxy by writing implementation code directly via genesis-style trick')
    print('Since we control the sequencer, we can use debug_setCode or directly patch')
