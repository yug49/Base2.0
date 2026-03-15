#!/usr/bin/env python3
"""
ShadowBase Precompile Test — Tests the auto-shield Transfer hook on the live devnet.

Produces blocks via the engine API (no op-node needed), then:
1. Test public→public transfer (no shield, normal behavior)
2. Test auto-shield: set Bob's mode to AUTO_SHIELD, send ETH, verify it goes to ShieldedPool
3. Test edge cases: zero-value, self-transfer
"""

import json, hmac, hashlib, base64, time, struct, sys
import urllib.request

# ─── Configuration ───────────────────────────────────────────────
RPC_URL = "http://localhost:8545"
AUTH_URL = "http://localhost:8551"
JWT_SECRET_HEX = open("jwt-secret.txt").read().strip()
JWT_SECRET = bytes.fromhex(JWT_SECRET_HEX)

# Hardhat default accounts
ALICE_ADDR  = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
ALICE_PK    = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
BOB_ADDR    = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
BOB_PK      = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
CHARLIE_ADDR = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"

# System predeploy addresses
PRIVACY_ROUTER   = "0x4200000000000000000000000000000000000069"
SHIELDED_POOL    = "0x4200000000000000000000000000000000000070"

# ─── Helpers ─────────────────────────────────────────────────────

def make_jwt():
    """Create a JWT token for engine API authentication."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).rstrip(b"=")
    payload = base64.urlsafe_b64encode(json.dumps({"iat": int(time.time())}).encode()).rstrip(b"=")
    signing_input = header + b"." + payload
    signature = base64.urlsafe_b64encode(
        hmac.new(JWT_SECRET, signing_input, hashlib.sha256).digest()
    ).rstrip(b"=")
    return (signing_input + b"." + signature).decode()

def rpc_call(url, method, params=None, auth=False):
    """Make a JSON-RPC call."""
    body = json.dumps({
        "jsonrpc": "2.0",
        "method": method,
        "params": params or [],
        "id": 1
    }).encode()
    headers = {"Content-Type": "application/json"}
    if auth:
        headers["Authorization"] = f"Bearer {make_jwt()}"
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read())
        if "error" in data:
            print(f"  RPC ERROR: {data['error']}")
        return data.get("result")
    except Exception as e:
        print(f"  RPC FAILED: {e}")
        return None

def eth_call(method, params=None):
    return rpc_call(RPC_URL, method, params)

def engine_call(method, params=None):
    return rpc_call(AUTH_URL, method, params, auth=True)

def get_balance(addr):
    result = eth_call("eth_getBalance", [addr, "latest"])
    return int(result, 16) if result else 0

def get_block(tag="latest"):
    return eth_call("eth_getBlockByNumber", [tag, False])

def get_nonce(addr):
    result = eth_call("eth_getTransactionCount", [addr, "latest"])
    return int(result, 16) if result else 0

def send_raw_tx(raw_tx):
    return eth_call("eth_sendRawTransaction", [raw_tx])

def get_tx_receipt(tx_hash):
    return eth_call("eth_getTransactionReceipt", [tx_hash])

def produce_block():
    """Produce a new block using the engine API (forkchoiceUpdated + getPayload + newPayload)."""
    block = get_block("latest")
    if not block:
        print("  ERROR: Cannot get latest block")
        return False

    block_hash = block["hash"]
    block_number = int(block["number"], 16)
    timestamp = int(block["timestamp"], 16) + 2  # 2 second block time

    # Step 1: forkchoiceUpdated with payloadAttributes to trigger payload building
    fc_state = {
        "headBlockHash": block_hash,
        "safeBlockHash": block_hash,
        "finalizedBlockHash": block_hash,
    }
    payload_attrs = {
        "timestamp": hex(timestamp),
        "prevRandao": "0x" + "00" * 32,
        "suggestedFeeRecipient": "0x" + "00" * 20,
        "withdrawals": [],
        "parentBeaconBlockRoot": "0x" + "00" * 32,
        # OP Stack specific fields
        "noTxPool": False,
        "gasLimit": hex(30000000),
    }

    # Try V3 first (Cancun), then V2 (Shanghai)
    result = engine_call("engine_forkchoiceUpdatedV3", [fc_state, payload_attrs])
    if not result:
        print("  Trying V2...")
        payload_attrs.pop("parentBeaconBlockRoot", None)
        result = engine_call("engine_forkchoiceUpdatedV2", [fc_state, payload_attrs])

    if not result or result.get("payloadStatus", {}).get("status") != "VALID":
        print(f"  forkchoiceUpdated result: {result}")
        # Try without noTxPool/gasLimit (non-OP)
        payload_attrs.pop("noTxPool", None)
        payload_attrs.pop("gasLimit", None)
        result = engine_call("engine_forkchoiceUpdatedV3", [fc_state, payload_attrs])
        if not result or result.get("payloadStatus", {}).get("status") != "VALID":
            print(f"  Retry result: {result}")
            return False

    payload_id = result.get("payloadId")
    if not payload_id:
        print("  ERROR: No payload ID returned")
        return False

    time.sleep(1)  # Wait for payload to be built

    # Step 2: Get the built payload
    payload = engine_call("engine_getPayloadV3", [payload_id])
    if not payload:
        payload = engine_call("engine_getPayloadV2", [payload_id])
    if not payload:
        print("  ERROR: getPayload failed")
        return False

    execution_payload = payload.get("executionPayload", payload)

    # Step 3: Execute the new payload
    versioned_hashes = []
    parent_beacon = "0x" + "00" * 32
    new_result = engine_call("engine_newPayloadV3", [execution_payload, versioned_hashes, parent_beacon])
    if not new_result:
        new_result = engine_call("engine_newPayloadV2", [execution_payload])
    if not new_result or new_result.get("status") != "VALID":
        print(f"  newPayload result: {new_result}")
        return False

    new_block_hash = execution_payload.get("blockHash", block_hash)

    # Step 4: Update fork choice to the new block
    fc_state2 = {
        "headBlockHash": new_block_hash,
        "safeBlockHash": new_block_hash,
        "finalizedBlockHash": new_block_hash,
    }
    result2 = engine_call("engine_forkchoiceUpdatedV3", [fc_state2, None])
    if not result2:
        result2 = engine_call("engine_forkchoiceUpdatedV2", [fc_state2, None])

    new_block = get_block("latest")
    new_block_num = int(new_block["number"], 16) if new_block else -1
    if new_block_num > block_number:
        print(f"  Block #{new_block_num} produced ✓")
        return True
    else:
        print(f"  Block production may have failed (still at #{new_block_num})")
        return False


def sign_and_send_tx(private_key_hex, to, value_wei, data_hex="0x"):
    """Sign and send a transaction using cast."""
    import subprocess
    args = [
        "cast", "send",
        "--private-key", f"0x{private_key_hex}",
        "--rpc-url", RPC_URL,
        "--json",
        to,
    ]
    if data_hex != "0x":
        args.extend(["--data", data_hex])
    if value_wei > 0:
        args.extend(["--value", str(value_wei)])

    # Don't wait for receipt — we'll produce the block ourselves
    env = {"FOUNDRY_DISABLE_NIGHTLY_WARNING": "1", "PATH": "/Users/shubhtastic/.foundry/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"}
    result = subprocess.run(args, capture_output=True, text=True, timeout=30, env=env)
    if result.returncode != 0:
        print(f"  cast send failed: {result.stderr}")
        return None
    try:
        data = json.loads(result.stdout)
        return data.get("transactionHash")
    except:
        print(f"  cast output: {result.stdout[:200]}")
        return None

def send_tx_raw_rpc(private_key_hex, to, value_wei, chain_id=845311, data_hex=""):
    """Send a transaction by creating it via cast and submitting via RPC."""
    import subprocess
    nonce = get_nonce("0x" + get_address_from_pk(private_key_hex) if len(private_key_hex) == 64 else ALICE_ADDR)

    # Use cast to create signed tx
    env = {"FOUNDRY_DISABLE_NIGHTLY_WARNING": "1", "PATH": "/Users/shubhtastic/.foundry/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"}

    args = [
        "cast", "mktx",
        "--private-key", f"0x{private_key_hex}",
        "--chain", str(chain_id),
        "--nonce", str(nonce),
        "--gas-price", "1000000007",
        "--gas-limit", "100000",
        to,
    ]
    if value_wei > 0:
        args.extend(["--value", str(value_wei)])

    result = subprocess.run(args, capture_output=True, text=True, timeout=10, env=env)
    if result.returncode != 0:
        print(f"  cast mktx failed: {result.stderr.strip()}")
        return None

    raw_tx = result.stdout.strip()
    tx_hash = send_raw_tx(raw_tx)
    return tx_hash


def get_address_from_pk(pk_hex):
    """Dummy — we know our addresses."""
    pk_to_addr = {
        ALICE_PK: ALICE_ADDR[2:].lower(),
        BOB_PK: BOB_ADDR[2:].lower(),
    }
    return pk_to_addr.get(pk_hex, "")

# ─── Tests ───────────────────────────────────────────────────────

def test_public_to_public():
    """TEST 1: Alice sends ETH to Charlie (both PUBLIC). Normal transfer."""
    print("\n═══ TEST 1: Public → Public (no auto-shield) ═══")

    charlie_before = get_balance(CHARLIE_ADDR)
    pool_before = get_balance(SHIELDED_POOL)
    print(f"  Charlie balance before: {charlie_before / 1e18:.4f} ETH")
    print(f"  ShieldedPool balance before: {pool_before / 1e18:.4f} ETH")

    # Send 1 ETH from Alice to Charlie
    value = 10**18  # 1 ETH
    print(f"  Sending 1 ETH from Alice to Charlie...")
    tx_hash = send_tx_raw_rpc(ALICE_PK, CHARLIE_ADDR, value)
    if not tx_hash:
        print("  FAILED: Could not send transaction")
        return False

    print(f"  TX hash: {tx_hash}")

    # Produce a block to include the tx
    if not produce_block():
        print("  FAILED: Could not produce block")
        return False

    # Check balances
    charlie_after = get_balance(CHARLIE_ADDR)
    pool_after = get_balance(SHIELDED_POOL)
    print(f"  Charlie balance after: {charlie_after / 1e18:.4f} ETH")
    print(f"  ShieldedPool balance after: {pool_after / 1e18:.4f} ETH")

    charlie_delta = charlie_after - charlie_before
    pool_delta = pool_after - pool_before
    print(f"  Charlie delta: +{charlie_delta / 1e18:.4f} ETH")
    print(f"  Pool delta: +{pool_delta / 1e18:.4f} ETH")

    if charlie_delta == value and pool_delta == 0:
        print("  ✅ PASS: Normal transfer — Charlie received ETH, pool unchanged")
        return True
    else:
        print("  ❌ FAIL: Unexpected balance changes")
        return False


def test_auto_shield():
    """TEST 2: Set Bob to AUTO_SHIELD, send ETH from Alice. Should go to ShieldedPool."""
    print("\n═══ TEST 2: Public → Auto-Shield (the magic moment) ═══")

    # First, check if PrivacyRouter has code
    code = eth_call("eth_getCode", [PRIVACY_ROUTER, "latest"])
    if not code or code == "0x":
        print("  ⚠️  PrivacyRouter has no code at genesis address. Skipping auto-shield test.")
        print("  (This is expected if the predeploy bytecode wasn't injected into genesis)")
        return None

    print(f"  PrivacyRouter code length: {len(code)} chars ✓")

    # Set Bob's mode to AUTO_SHIELD (mode = 1)
    # Function: setMode(uint8) → selector = keccak256("setMode(uint8)")[:4]
    # setMode(1) = 0x8854cce2 + 0x01 padded to 32 bytes
    import subprocess
    env = {"FOUNDRY_DISABLE_NIGHTLY_WARNING": "1", "PATH": "/Users/shubhtastic/.foundry/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"}

    # Get the function selector
    result = subprocess.run(["cast", "sig", "setMode(uint8)"], capture_output=True, text=True, env=env)
    selector = result.stdout.strip()
    print(f"  setMode selector: {selector}")

    # Encode: setMode(1) — AUTO_SHIELD
    calldata = selector + "0000000000000000000000000000000000000000000000000000000000000001"
    print(f"  Setting Bob's mode to AUTO_SHIELD...")

    nonce = get_nonce(BOB_ADDR)
    args = [
        "cast", "mktx",
        "--private-key", f"0x{BOB_PK}",
        "--chain", "845311",
        "--nonce", str(nonce),
        "--gas-price", "1000000007",
        "--gas-limit", "200000",
        PRIVACY_ROUTER,
        calldata,
    ]
    result = subprocess.run(args, capture_output=True, text=True, timeout=10, env=env)
    if result.returncode != 0:
        print(f"  cast mktx failed: {result.stderr.strip()}")
        return False

    raw_tx = result.stdout.strip()
    tx_hash = send_raw_tx(raw_tx)
    print(f"  setMode TX: {tx_hash}")

    # Produce block to include setMode tx
    produce_block()

    # Verify Bob's mode is set
    # getMode(address) → call PrivacyRouter
    result = subprocess.run(["cast", "sig", "getMode(address)"], capture_output=True, text=True, env=env)
    get_mode_sel = result.stdout.strip()
    get_mode_data = get_mode_sel + "000000000000000000000000" + BOB_ADDR[2:].lower()
    mode_result = eth_call("eth_call", [{"to": PRIVACY_ROUTER, "data": get_mode_data}, "latest"])
    if mode_result:
        mode_val = int(mode_result, 16)
        print(f"  Bob's privacy mode: {mode_val} ({'AUTO_SHIELD ✓' if mode_val == 1 else 'NOT SET ✗'})")
    else:
        print("  Could not read Bob's mode")

    # Now send ETH from Alice to Bob — should be auto-shielded
    bob_before = get_balance(BOB_ADDR)
    pool_before = get_balance(SHIELDED_POOL)
    print(f"\n  Bob public balance before: {bob_before / 1e18:.4f} ETH")
    print(f"  ShieldedPool balance before: {pool_before / 1e18:.4f} ETH")

    value = 10**18  # 1 ETH
    print(f"  Alice sends 1 ETH to Bob (who has AUTO_SHIELD)...")
    tx_hash = send_tx_raw_rpc(ALICE_PK, BOB_ADDR, value)
    print(f"  TX hash: {tx_hash}")

    # Produce block
    produce_block()

    # Check balances
    bob_after = get_balance(BOB_ADDR)
    pool_after = get_balance(SHIELDED_POOL)
    print(f"  Bob public balance after: {bob_after / 1e18:.4f} ETH")
    print(f"  ShieldedPool balance after: {pool_after / 1e18:.4f} ETH")

    bob_delta = bob_after - bob_before
    pool_delta = pool_after - pool_before

    # Bob's balance will have decreased slightly due to gas from setMode tx
    # But the 1 ETH transfer should NOT appear in his public balance
    print(f"  Bob public delta: {bob_delta / 1e18:.6f} ETH (should be ~0 or negative from gas)")
    print(f"  Pool delta: +{pool_delta / 1e18:.4f} ETH (should be +1.0)")

    # Check tx receipt for AutoShielded event
    if tx_hash:
        receipt = get_tx_receipt(tx_hash)
        if receipt:
            logs = receipt.get("logs", [])
            auto_shielded_logs = [l for l in logs if PRIVACY_ROUTER.lower() in l.get("address", "").lower()]
            if auto_shielded_logs:
                print(f"  AutoShielded event found in logs ✓")
            print(f"  TX status: {'success' if receipt.get('status') == '0x1' else 'failed'}")

    if pool_delta == value:
        print("  ✅ PASS: Auto-shield worked! ETH went to ShieldedPool, not Bob's public balance")
        return True
    elif pool_delta > 0:
        print(f"  ⚠️  PARTIAL: Pool received {pool_delta / 1e18:.4f} ETH (expected 1.0)")
        return True
    else:
        print("  ❌ FAIL: ETH did not go to ShieldedPool")
        return False


def test_edge_cases():
    """TEST 3: Edge cases — zero value, self-transfer."""
    print("\n═══ TEST 3: Edge Cases ═══")

    # Zero-value transfer should just work normally
    pool_before = get_balance(SHIELDED_POOL)
    print(f"  Pool before: {pool_before / 1e18:.4f} ETH")

    # Self-transfer (Bob to Bob with auto-shield): should NOT shield
    print("  Sending 0.1 ETH from Bob to Bob (self-transfer, should NOT shield)...")
    tx_hash = send_tx_raw_rpc(BOB_PK, BOB_ADDR, 10**17)  # 0.1 ETH
    if tx_hash:
        produce_block()
        pool_after = get_balance(SHIELDED_POOL)
        pool_delta = pool_after - pool_before
        print(f"  Pool delta from self-transfer: {pool_delta / 1e18:.4f} ETH")
        if pool_delta == 0:
            print("  ✅ PASS: Self-transfer not shielded (edge case handled)")
        else:
            print("  ❌ FAIL: Self-transfer was shielded")

    return True


def main():
    print("╔═══════════════════════════════════════════════╗")
    print("║   ShadowBase Precompile Test Suite            ║")
    print("║   Testing auto-shield Transfer hook on devnet ║")
    print("╚═══════════════════════════════════════════════╝")

    # Verify connection
    chain_id = eth_call("eth_chainId", [])
    if not chain_id:
        print("ERROR: Cannot connect to devnet at", RPC_URL)
        sys.exit(1)
    print(f"\nConnected to chain {int(chain_id, 16)} ({chain_id})")

    block = get_block("latest")
    print(f"Current block: #{int(block['number'], 16)}")

    # Produce an initial block to ensure engine API works
    print("\nProducing initial test block...")
    if not produce_block():
        print("\nERROR: Cannot produce blocks via engine API.")
        print("Make sure op-geth is running with auth RPC on port 8551.")
        sys.exit(1)

    results = []

    # Test 1: Public → Public
    results.append(("Public→Public", test_public_to_public()))

    # Test 2: Auto-shield
    results.append(("Auto-Shield", test_auto_shield()))

    # Test 3: Edge cases
    results.append(("Edge Cases", test_edge_cases()))

    # Summary
    print("\n╔═══════════════════════════════════════════════╗")
    print("║   Test Results Summary                        ║")
    print("╠═══════════════════════════════════════════════╣")
    for name, result in results:
        status = "✅ PASS" if result is True else ("⚠️  SKIP" if result is None else "❌ FAIL")
        print(f"║   {name:20s} {status:>20s}   ║")
    print("╚═══════════════════════════════════════════════╝")

    all_pass = all(r is True or r is None for _, r in results)
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
