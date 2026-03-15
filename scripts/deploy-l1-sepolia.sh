#!/usr/bin/env bash
# ============================================================================
# ShadowBase — Phase 2: Sepolia L1 Deployment Script
#
# Deploys ShadowBase L1 contracts to Ethereum Sepolia testnet:
#   1. Verifier (with proxy for upgradeability)
#   2. L1Companion (connects to RAILGUN Sepolia + CrossDomainMessenger)
#   3. PingPong test contract (for L1↔L2 message passing validation)
#
# Prerequisites:
#   - Sepolia ETH in deployer account
#   - SEPOLIA_RPC_URL env var set (or uses default public RPC)
#   - DEPLOYER_PRIVATE_KEY env var set
#   - Yug has deployed OP Stack L1 contracts (for CrossDomainMessenger address)
#
# Usage:
#   export DEPLOYER_PRIVATE_KEY="0x..."
#   export SEPOLIA_RPC_URL="https://..."
#   ./scripts/deploy-l1-sepolia.sh [--ping-pong-only]
# ============================================================================

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Sepolia RPC (default to public node)
SEPOLIA_RPC_URL="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"

# RAILGUN Sepolia contract (already deployed, we interact with it)
RAILGUN_SEPOLIA="0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea"

# L1 CrossDomainMessenger — deployed by Yug on Sepolia
L1_CROSS_DOMAIN_MESSENGER="${L1_CROSS_DOMAIN_MESSENGER:-0x579aaf4e08b072b3b53148a260913837518a0ab8}"

# WETH on Sepolia
WETH_SEPOLIA="${WETH_SEPOLIA:-0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9}"

# Deployer key
DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:-}"

# ─── Validation ───────────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ShadowBase — Sepolia L1 Deployment                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo "❌ DEPLOYER_PRIVATE_KEY not set"
    echo "   export DEPLOYER_PRIVATE_KEY=\"0x...\""
    exit 1
fi

# Get deployer address from private key
DEPLOYER_ADDRESS=$(cast wallet address "$DEPLOYER_PRIVATE_KEY" 2>/dev/null)
echo "  Deployer:    $DEPLOYER_ADDRESS"
echo "  Sepolia RPC: $SEPOLIA_RPC_URL"
echo "  RAILGUN:     $RAILGUN_SEPOLIA"
echo ""

# Check balance
BALANCE=$(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$SEPOLIA_RPC_URL" 2>/dev/null)
BALANCE_ETH=$(cast from-wei "$BALANCE" 2>/dev/null || echo "0")
echo "  Balance:     $BALANCE_ETH ETH"

if [ "$BALANCE" = "0" ]; then
    echo ""
    echo "❌ Deployer account has 0 ETH on Sepolia"
    echo "   Get Sepolia ETH from:"
    echo "   - https://sepoliafaucet.com"
    echo "   - https://www.alchemy.com/faucets/ethereum-sepolia"
    echo "   - https://faucet.quicknode.com/ethereum/sepolia"
    echo ""
    exit 1
fi
echo ""

# ─── Deploy PingPong (Test Contract) ─────────────────────────────────────────

if [ "${1:-}" = "--ping-pong-only" ] || [ -z "$L1_CROSS_DOMAIN_MESSENGER" ]; then
    if [ -z "$L1_CROSS_DOMAIN_MESSENGER" ]; then
        echo "⚠️  L1_CROSS_DOMAIN_MESSENGER not set (waiting for Yug)"
        echo "   Deploying PingPong with a placeholder messenger..."
        echo "   You'll need to redeploy once Yug provides the address."
        echo ""
        # Use a dead address as placeholder
        L1_CROSS_DOMAIN_MESSENGER="0x000000000000000000000000000000000000dEaD"
    fi
fi

echo "─── Deploying PingPongL1 ─────────────────────────────────────────"
echo "  Messenger: $L1_CROSS_DOMAIN_MESSENGER"
echo ""

cd "$PROJECT_ROOT"

# Build first
echo "  Building contracts..."
forge build --silent

# Deploy PingPongL1
echo "  Deploying PingPongL1..."
PING_PONG_DEPLOY=$(forge create \
    contracts/test/PingPong.sol:PingPongL1 \
    --constructor-args "$L1_CROSS_DOMAIN_MESSENGER" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --rpc-url "$SEPOLIA_RPC_URL" \
    --json 2>/dev/null)

PING_PONG_L1_ADDR=$(echo "$PING_PONG_DEPLOY" | jq -r '.deployedTo')
PING_PONG_TX=$(echo "$PING_PONG_DEPLOY" | jq -r '.transactionHash')

echo "  ✅ PingPongL1 deployed!"
echo "     Address: $PING_PONG_L1_ADDR"
echo "     Tx:      $PING_PONG_TX"
echo "     Etherscan: https://sepolia.etherscan.io/address/$PING_PONG_L1_ADDR"
echo ""

# ─── Save Deployment Addresses ────────────────────────────────────────────────

DEPLOY_FILE="$PROJECT_ROOT/deployments/sepolia.json"
mkdir -p "$(dirname "$DEPLOY_FILE")"

cat > "$DEPLOY_FILE" << EOF
{
  "network": "sepolia",
  "chainId": 11155111,
  "deployer": "$DEPLOYER_ADDRESS",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "contracts": {
    "PingPongL1": {
      "address": "$PING_PONG_L1_ADDR",
      "txHash": "$PING_PONG_TX",
      "constructorArgs": {
        "messenger": "$L1_CROSS_DOMAIN_MESSENGER"
      }
    }
  },
  "external": {
    "RAILGUN": "$RAILGUN_SEPOLIA",
    "L1CrossDomainMessenger": "$L1_CROSS_DOMAIN_MESSENGER"
  },
  "notes": {
    "L1CrossDomainMessenger": "Placeholder until Yug deploys OP Stack L1 contracts",
    "L1Companion": "Phase 4 — deploy after bridge contract is ready",
    "Verifier": "Phase 4 — deploy alongside L1Companion"
  }
}
EOF

echo "  📁 Deployment addresses saved to: deployments/sepolia.json"
echo ""

# ─── Verify on Etherscan (optional) ──────────────────────────────────────────

if [ -n "${ETHERSCAN_API_KEY:-}" ]; then
    echo "─── Verifying on Etherscan ──────────────────────────────────────"
    forge verify-contract \
        "$PING_PONG_L1_ADDR" \
        contracts/test/PingPong.sol:PingPongL1 \
        --constructor-args "$(cast abi-encode 'constructor(address)' "$L1_CROSS_DOMAIN_MESSENGER")" \
        --etherscan-api-key "$ETHERSCAN_API_KEY" \
        --chain sepolia \
        --watch 2>/dev/null || echo "  ⚠️  Verification failed (non-critical)"
    echo ""
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

if [ "${1:-}" = "--ping-pong-only" ]; then
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "  ✅ PingPong deployment complete!"
    echo ""
    echo "  Next steps:"
    echo "  1. Deploy PingPongL2 on ShadowBase devnet"
    echo "  2. Set counterparts on both contracts"
    echo "  3. Test ping-pong message passing"
    echo "  4. Deploy L1Companion: ./scripts/deploy-l1-sepolia.sh --l1-companion"
    echo ""
    exit 0
fi

# ─── Deploy L1Companion ──────────────────────────────────────────────────────

if [ "${1:-}" = "--l1-companion" ] || [ "${1:-}" = "--all" ] || [ -z "${1:-}" ]; then
    echo "─── Deploying L1Companion ────────────────────────────────────────"
    echo "  RAILGUN:     $RAILGUN_SEPOLIA"
    echo "  Messenger:   $L1_CROSS_DOMAIN_MESSENGER"
    echo "  WETH:        $WETH_SEPOLIA"
    echo ""

    L1_COMPANION_DEPLOY=$(forge create \
        contracts/l1/L1Companion.sol:L1Companion \
        --constructor-args "$RAILGUN_SEPOLIA" "$L1_CROSS_DOMAIN_MESSENGER" "$WETH_SEPOLIA" \
        --private-key "$DEPLOYER_PRIVATE_KEY" \
        --rpc-url "$SEPOLIA_RPC_URL" \
        --json 2>/dev/null)

    L1_COMPANION_ADDR=$(echo "$L1_COMPANION_DEPLOY" | jq -r '.deployedTo')
    L1_COMPANION_TX=$(echo "$L1_COMPANION_DEPLOY" | jq -r '.transactionHash')

    echo "  ✅ L1Companion deployed!"
    echo "     Address: $L1_COMPANION_ADDR"
    echo "     Tx:      $L1_COMPANION_TX"
    echo "     Etherscan: https://sepolia.etherscan.io/address/$L1_COMPANION_ADDR"
    echo ""

    # Update deployment file with L1Companion
    DEPLOY_FILE="$PROJECT_ROOT/deployments/sepolia.json"
    if [ -f "$DEPLOY_FILE" ]; then
        # Add L1Companion to existing deployment file
        TMP_FILE=$(mktemp)
        jq --arg addr "$L1_COMPANION_ADDR" \
           --arg tx "$L1_COMPANION_TX" \
           --arg railgun "$RAILGUN_SEPOLIA" \
           --arg messenger "$L1_CROSS_DOMAIN_MESSENGER" \
           --arg weth "$WETH_SEPOLIA" \
           '.contracts.L1Companion = {
              "address": $addr,
              "txHash": $tx,
              "constructorArgs": {
                "railgun": $railgun,
                "messenger": $messenger,
                "weth": $weth
              }
            }' "$DEPLOY_FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$DEPLOY_FILE"
    fi

    echo "  📁 Deployment addresses updated in: deployments/sepolia.json"
    echo ""

    # ─── Verify on Etherscan ──────────────────────────────────────────────

    if [ -n "${ETHERSCAN_API_KEY:-}" ]; then
        echo "─── Verifying L1Companion on Etherscan ──────────────────────────"
        forge verify-contract \
            "$L1_COMPANION_ADDR" \
            contracts/l1/L1Companion.sol:L1Companion \
            --constructor-args "$(cast abi-encode 'constructor(address,address,address)' "$RAILGUN_SEPOLIA" "$L1_CROSS_DOMAIN_MESSENGER" "$WETH_SEPOLIA")" \
            --etherscan-api-key "$ETHERSCAN_API_KEY" \
            --chain sepolia \
            --watch 2>/dev/null || echo "  ⚠️  Verification failed (non-critical)"
        echo ""
    fi

    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "  ✅ L1Companion deployment complete!"
    echo ""
    echo "  IMPORTANT: Set L1Companion address on PrivacyBridge (L2):"
    echo "    cast send 0x4200000000000000000000000000000000000071 \\"
    echo "      'setL1Companion(address)' $L1_COMPANION_ADDR \\"
    echo "      --rpc-url http://localhost:8545 \\"
    echo "      --private-key \$DEPLOYER_PRIVATE_KEY"
    echo ""
    echo "  Then fund L1Companion with ETH for bridge operations:"
    echo "    cast send $L1_COMPANION_ADDR --value 0.1ether \\"
    echo "      --rpc-url $SEPOLIA_RPC_URL \\"
    echo "      --private-key \$DEPLOYER_PRIVATE_KEY"
    echo ""
fi
