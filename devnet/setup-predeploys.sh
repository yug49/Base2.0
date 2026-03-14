#!/usr/bin/env bash
# ================================================================
# ShadowBase — Create Genesis Config with Custom Predeploy Addresses
# ================================================================
# This script patches the L2 genesis.json produced by op-deployer
# to include reserved predeploy addresses for ShadowBase's
# privacy contracts:
#
#   0x4200000000000000000000000000000000000069 — PrivacyRouter
#   0x4200000000000000000000000000000000000070 — ShieldedPool
#   0x4200000000000000000000000000000000000071 — PrivacyBridge
#
# The OP Stack genesis includes 2048 predeploy slots (0x4200...0000
# to 0x4200...07FF). Unused slots get a minimal proxy placeholder.
# This script reserves our addresses so they're ready for the actual
# contract bytecode once it's written and compiled.
#
# For now, we place a simple placeholder bytecode at these addresses
# that will be replaced with real contract bytecode in later phases.
# ================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENESIS_FILE="$SCRIPT_DIR/genesis.json"

# Predeploy addresses
PRIVACY_ROUTER="4200000000000000000000000000000000000069"
SHIELDED_POOL="4200000000000000000000000000000000000070"
PRIVACY_BRIDGE="4200000000000000000000000000000000000071"

# Simple placeholder bytecode — returns 0 on any call
# This is a minimal contract: PUSH1 0x00 PUSH1 0x00 RETURN
# (will be replaced with actual compiled bytecode later)
PLACEHOLDER_CODE="0x600080fd"

echo "========================================"
echo " ShadowBase — Genesis Predeploy Setup"
echo "========================================"

if [ ! -f "$GENESIS_FILE" ]; then
    echo "ERROR: genesis.json not found at $GENESIS_FILE"
    echo "  Run deploy-l1.sh first to generate the genesis."
    exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo "ERROR: jq is required. Install it with: brew install jq"
    exit 1
fi

echo ""
echo "Patching genesis.json with ShadowBase predeploy addresses..."
echo ""

# Create a backup
cp "$GENESIS_FILE" "$GENESIS_FILE.bak"

# Check if addresses already exist in alloc
for addr in "$PRIVACY_ROUTER" "$SHIELDED_POOL" "$PRIVACY_BRIDGE"; do
    addr_with_prefix="0x$addr"
    existing=$(jq -r ".alloc[\"$addr_with_prefix\"] // empty" "$GENESIS_FILE")
    if [ -n "$existing" ]; then
        echo "  Address $addr_with_prefix already exists in genesis alloc (will update code)"
    fi
done

# Patch the genesis alloc to include/update our predeploy addresses
# Each predeploy gets:
#   - placeholder bytecode (to pass the 2048-slot validation)
#   - balance of 0
#   - nonce of 1 (standard for predeploys)
TEMP_FILE=$(mktemp)

jq --arg pr_addr "0x$PRIVACY_ROUTER" \
   --arg sp_addr "0x$SHIELDED_POOL" \
   --arg pb_addr "0x$PRIVACY_BRIDGE" \
   --arg code "$PLACEHOLDER_CODE" \
   '
   .alloc[$pr_addr] = {
     "code": $code,
     "balance": "0x0",
     "nonce": "0x1",
     "storage": {}
   } |
   .alloc[$sp_addr] = {
     "code": $code,
     "balance": "0x0",
     "nonce": "0x1",
     "storage": {}
   } |
   .alloc[$pb_addr] = {
     "code": $code,
     "balance": "0x0",
     "nonce": "0x1",
     "storage": {}
   }
   ' "$GENESIS_FILE" > "$TEMP_FILE"

mv "$TEMP_FILE" "$GENESIS_FILE"

echo "  ✅ 0x$PRIVACY_ROUTER — PrivacyRouter (placeholder)"
echo "  ✅ 0x$SHIELDED_POOL — ShieldedPool (placeholder)"
echo "  ✅ 0x$PRIVACY_BRIDGE — PrivacyBridge (placeholder)"
echo ""
echo "Genesis patched successfully."
echo "Backup saved to: $GENESIS_FILE.bak"
echo ""
echo "Next steps:"
echo "  - Phase 2: Write PrivacyRouter.sol, compile, and replace placeholder bytecode"
echo "  - Phase 3: Write precompile in op-geth"
echo "  - Phase 4: Fork RAILGUN contracts for ShieldedPool, compile, replace bytecode"
