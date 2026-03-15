#!/usr/bin/env python3
import json, urllib.request

def rpc(method, params=[]):
    data = json.dumps({"jsonrpc":"2.0","method":method,"params":params,"id":1}).encode()
    req = urllib.request.Request("http://localhost:8545", data=data, headers={"Content-Type":"application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=5).read())

calldata = "0x21175b4a0000000000000000000000000000000000000000000000000000000000000001"
to = "0x4200000000000000000000000000000000000069"
frm = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

print("Nonce:", rpc("eth_getTransactionCount", [frm, "latest"])["result"])
print("Gas price:", rpc("eth_gasPrice")["result"])
print("Gas estimate:", rpc("eth_estimateGas", [{"from": frm, "to": to, "data": calldata}]))
print("eth_call:", rpc("eth_call", [{"from": frm, "to": to, "data": calldata}, "latest"]))
print("Block:", int(rpc("eth_blockNumber")["result"], 16))
print("Txpool:", rpc("txpool_status")["result"])
