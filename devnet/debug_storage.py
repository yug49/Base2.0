#!/usr/bin/env python3
"""Debug: verify ShouldAutoShield storage reads match Solidity writes."""
import json, urllib.request
from web3 import Web3

RPC = "http://localhost:8545"
BOB = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
PRIVACY_ROUTER = "0x4200000000000000000000000000000000000069"

def rpc(method, params=None):
    data = json.dumps({"jsonrpc":"2.0","method":method,"params":params or [],"id":1}).encode()
    req = urllib.request.Request(RPC, data=data, headers={"Content-Type":"application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=10).read())

# 1. Compute _rules[Bob] storage slot — the same way Go code does it
# Go: computeMappingSlot(Bob, rulesSlot) where rulesSlot = slot 0
# = keccak256(abi.encode(Bob, 0))
bob_padded = bytes.fromhex(BOB[2:].lower().rjust(64, '0'))
slot0_padded = (0).to_bytes(32, byteorder='big')
mode_slot = Web3.keccak(bob_padded + slot0_padded).hex()
print(f"Computed mode slot = {mode_slot}")

# 2. Read that storage slot from PrivacyRouter
resp = rpc("eth_getStorageAt", [PRIVACY_ROUTER, mode_slot, "latest"])
print(f"Storage at mode_slot = {resp.get('result')}")

# 3. Also try slot index hex (sometimes off-by-one style)
# In Solidity: _rules mapping is at slot 0
# But wait - is PrivacyRouter upgradeable? Check if there are inherited slots
# Let's also check plain slot 0 and a few others
for slot_idx in range(5):
    slot_hex = hex(slot_idx)
    resp = rpc("eth_getStorageAt", [PRIVACY_ROUTER, slot_hex, "latest"])
    val = resp.get('result', '0x0')
    if val != '0x0000000000000000000000000000000000000000000000000000000000000000':
        print(f"  Slot {slot_idx}: {val}")

# 4. Verify getMode returns 1 via Solidity call
sel = Web3.keccak(text="getMode(address)")[:4].hex()
calldata = "0x" + sel + "000000000000000000000000" + BOB[2:].lower()
resp = rpc("eth_call", [{"to": PRIVACY_ROUTER, "data": calldata}, "latest"])
print(f"\ngetMode(Bob) via eth_call = {resp.get('result')}")

# 5. Let's also check if PrivacyRouter inherits from Initializable or has
# other slots before _rules. Check ABI/inherited state.
# Let's try to find if there are EIP-1967 storage slots or other inherited state.
# Check EIP-1967 implementation slot
eip1967 = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
resp = rpc("eth_getStorageAt", [PRIVACY_ROUTER, eip1967, "latest"])
print(f"EIP-1967 impl slot = {resp.get('result')}")

# 6. If it's a proxy, the storage layout might be different
# Check slot 0 directly
resp = rpc("eth_getStorageAt", [PRIVACY_ROUTER, "0x0", "latest"])
print(f"Slot 0 = {resp.get('result')}")

# 7. Let's try brute-force: scan all storage at PrivacyRouter looking for Bob's address
# Or check if the contract uses ERC-7201 namespaced storage
# keccak256(abi.encode(uint256(keccak256("shadowbase.privacyrouter.storage")) - 1)) & ~bytes32(uint256(0xff))
ns = Web3.keccak(text="shadowbase.privacyrouter.storage")
print(f"\nNamespaced storage check: keccak256('shadowbase.privacyrouter.storage') = {ns.hex()}")

# 8. Check if it's an upgradeable contract (OpenZeppelin Initializable)
# Initializable uses slot keccak256("eip1967.proxy.initialized") or just a low slot
# Let's see what the contract's bytecode does when setMode is called

# The simplest debugging: set gas to max on eth_estimateGas and trace
# Let's use debug_traceCall if available
print("\n=== estimateGas for Alice→Bob (100 ETH) ===")
ALICE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
est = rpc("eth_estimateGas", [{"from": ALICE, "to": BOB, "value": hex(10**20)}])
print(f"Gas estimate: {est}")

# Try with high gas to rule out the gas check
est2 = rpc("eth_estimateGas", [{"from": ALICE, "to": BOB, "value": hex(10**20), "gas": hex(1000000)}])
print(f"Gas estimate (explicit 1M gas): {est2}")

# Also try debug_traceCall
print("\n=== debug_traceCall ===")
trace = rpc("debug_traceCall", [
    {"from": ALICE, "to": BOB, "value": hex(10**20)},
    "latest",
    {"tracer": "callTracer"}
])
print(f"Trace result: {json.dumps(trace, indent=2)[:2000]}")
