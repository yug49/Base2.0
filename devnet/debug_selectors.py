#!/usr/bin/env python3
import json, urllib.request
from web3 import Web3

RPC = "http://localhost:8545"
PRIVACY_ROUTER = "0x4200000000000000000000000000000000000069"
BOB = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

def rpc(method, params=None):
    if params is None:
        params = []
    data = json.dumps({"jsonrpc":"2.0","method":method,"params":params,"id":1}).encode()
    req = urllib.request.Request(RPC, data=data, headers={"Content-Type":"application/json"})
    resp = json.loads(urllib.request.urlopen(req, timeout=10).read())
    return resp

# 1. Check selectors
print("=== Function Selectors ===")
for sig in ["setMode(uint8)", "getMode(address)", "routeShield(address)", 
            "privacyMode(address)", "userMode(address)", "modes(address)"]:
    sel = Web3.keccak(text=sig)[:4].hex()
    print(f"  {sig} -> 0x{sel}")

# 2. Check code at PrivacyRouter
code_resp = rpc("eth_getCode", [PRIVACY_ROUTER, "latest"])
code = code_resp.get("result", "")
print(f"\nPrivacyRouter code length: {len(code)} chars")

# 3. Try getMode(Bob)
sel_getMode = Web3.keccak(text="getMode(address)")[:4].hex()
data_getMode = "0x" + sel_getMode + "000000000000000000000000" + BOB[2:].lower()
resp = rpc("eth_call", [{"to": PRIVACY_ROUTER, "data": data_getMode}, "latest"])
print(f"\ngetMode(Bob): {resp}")

# 4. Try privacyMode(Bob) — maybe the getter is named differently
sel_pm = Web3.keccak(text="privacyMode(address)")[:4].hex()
data_pm = "0x" + sel_pm + "000000000000000000000000" + BOB[2:].lower()
resp2 = rpc("eth_call", [{"to": PRIVACY_ROUTER, "data": data_pm}, "latest"])
print(f"privacyMode(Bob): {resp2}")

# 5. Try modes(address)
sel_m = Web3.keccak(text="modes(address)")[:4].hex()
data_m = "0x" + sel_m + "000000000000000000000000" + BOB[2:].lower()
resp3 = rpc("eth_call", [{"to": PRIVACY_ROUTER, "data": data_m}, "latest"])
print(f"modes(Bob): {resp3}")

# 6. Try to send setMode(1) as Bob and see the error
sel_set = Web3.keccak(text="setMode(uint8)")[:4].hex()
data_set = "0x" + sel_set + "0000000000000000000000000000000000000000000000000000000000000001"

# First estimate gas
est = rpc("eth_estimateGas", [{"from": BOB, "to": PRIVACY_ROUTER, "data": data_set}])
print(f"\nestimateGas setMode(1): {est}")

# If estimate fails, try with eth_call to see the revert reason
call_resp = rpc("eth_call", [{"from": BOB, "to": PRIVACY_ROUTER, "data": data_set}, "latest"])
print(f"eth_call setMode(1): {call_resp}")

# 7. Check if setMode uses plain web3.py approach
print("\n=== Trying web3.py contract call ===")
BOB_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
w3 = Web3(Web3.HTTPProvider(RPC))

# Simple signed tx test
acct = w3.eth.account.from_key(BOB_PK)
nonce = w3.eth.get_transaction_count(acct.address)
chain_id = w3.eth.chain_id
print(f"Bob address: {acct.address}")
print(f"Bob nonce: {nonce}")
print(f"Chain ID: {chain_id}")
gas_price = w3.eth.gas_price
print(f"Gas price: {gas_price}")

tx = {
    'to': Web3.to_checksum_address(PRIVACY_ROUTER),
    'data': bytes.fromhex(data_set[2:]),
    'gas': 100000,
    'gasPrice': gas_price,
    'nonce': nonce,
    'chainId': chain_id,
}
signed = acct.sign_transaction(tx)
raw_hex = "0x" + signed.raw_transaction.hex()
print(f"Signed tx raw hex (first 40 chars): {raw_hex[:40]}...")
result = rpc("eth_sendRawTransaction", [raw_hex])
print(f"sendRawTransaction result: {result}")

if result.get("result"):
    tx_hash = result["result"]
    import time
    for _ in range(20):
        receipt = rpc("eth_getTransactionReceipt", [tx_hash])
        if receipt.get("result"):
            print(f"Receipt status: {receipt['result']['status']}")
            print(f"Gas used: {receipt['result']['gasUsed']}")
            print(f"Logs: {receipt['result'].get('logs', [])}")
            break
        time.sleep(0.5)
