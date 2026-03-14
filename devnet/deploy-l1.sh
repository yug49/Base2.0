#!/usr/bin/env bash
# ================================================================
# ShadowBase — Deploy OP Stack L1 Contracts to Sepolia
# ================================================================
# This script deploys the standard OP Stack L1 contracts to Ethereum
# Sepolia using op-deployer from the optimism monorepo.
#
# Contracts deployed:
#   - OptimismPortal
#   - L1CrossDomainMessenger
#   - L1StandardBridge
#   - L1ERC721Bridge
#   - SystemConfig
#   - SuperchainConfig + OPCM (if not reusing existing)
#   - DisputeGame contracts
#   - ProxyAdmin + AddressManager
#
# Prerequisites:
#   1. Go 1.21+ installed
#   2. Foundry installed (forge)
#   3. Deployer account funded with Sepolia ETH (~0.5 ETH recommended)
#   4. Sepolia RPC URL (Alchemy, Infura, or public)
# ================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPTIMISM_DIR="$SCRIPT_DIR/../optimism"
DEPLOY_DIR="$SCRIPT_DIR/deployment"

# ---- CONFIGURATION — EDIT THESE ----
SEPOLIA_RPC_URL="${SEPOLIA_RPC_URL:-}"
DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:-}"
L2_CHAIN_ID="845311"
# -------------------------------------

echo "========================================"
echo " ShadowBase — L1 Contract Deployment"
echo "========================================"

# Validate inputs
if [ -z "$SEPOLIA_RPC_URL" ]; then
    echo "ERROR: Set SEPOLIA_RPC_URL environment variable."
    echo "  export SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
    exit 1
fi

if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo "ERROR: Set DEPLOYER_PRIVATE_KEY environment variable."
    echo "  export DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY"
    exit 1
fi

# Step 1: Build op-deployer
echo ""
echo "[1/5] Building op-deployer..."
cd "$OPTIMISM_DIR"

# Build contracts first (needed for artifacts)
echo "  Building contracts-bedrock (this may take a few minutes)..."
cd packages/contracts-bedrock
forge build 2>&1 | tail -5
cd "$OPTIMISM_DIR"

# Build op-deployer
echo "  Building op-deployer binary..."
cd op-deployer
just build 2>&1 | tail -5
OP_DEPLOYER_BIN="$OPTIMISM_DIR/op-deployer/bin/op-deployer"

if [ ! -x "$OP_DEPLOYER_BIN" ]; then
    echo "ERROR: op-deployer binary not found at $OP_DEPLOYER_BIN"
    echo "  Try building manually: cd $OPTIMISM_DIR/op-deployer && just build"
    exit 1
fi
echo "  op-deployer built: $OP_DEPLOYER_BIN"
cd "$SCRIPT_DIR"

# Step 2: Initialize deployment workspace
echo ""
echo "[2/5] Initializing deployment workspace..."
mkdir -p "$DEPLOY_DIR"

"$OP_DEPLOYER_BIN" init \
    --l1-chain-id 11155111 \
    --l2-chain-ids "0x$(printf '%x' $L2_CHAIN_ID)" \
    --workdir "$DEPLOY_DIR" \
    --intent-type custom

echo "  Created intent.toml and state.json in $DEPLOY_DIR"

# Step 3: Configure intent.toml with ShadowBase parameters
echo ""
echo "[3/5] Configuring intent.toml..."

# The deployer address (derived from the private key)
DEPLOYER_ADDRESS=$(cast wallet address "$DEPLOYER_PRIVATE_KEY" 2>/dev/null || echo "")
if [ -z "$DEPLOYER_ADDRESS" ]; then
    echo "WARNING: Could not derive address from private key. Using default foundry account #0."
    DEPLOYER_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
fi
echo "  Deployer address: $DEPLOYER_ADDRESS"

# L2 chain ID as 32-byte hex hash
L2_CHAIN_ID_HEX=$(printf '0x%064x' $L2_CHAIN_ID)

cat > "$DEPLOY_DIR/intent.toml" << EOF
configType = "custom"
l1ChainID = 11155111
fundDevAccounts = true

[superchainRoles]
  proxyAdminOwner = "$DEPLOYER_ADDRESS"
  protocolVersionsOwner = "$DEPLOYER_ADDRESS"
  guardian = "$DEPLOYER_ADDRESS"

[l1ContractsLocator]
  tag = "op-contracts/v1.8.0-rc.4"

[l2ContractsLocator]
  tag = "op-contracts/v1.8.0-rc.4"

[[chains]]
  id = "$L2_CHAIN_ID_HEX"
  baseFeeVaultRecipient = "$DEPLOYER_ADDRESS"
  l1FeeVaultRecipient = "$DEPLOYER_ADDRESS"
  sequencerFeeVaultRecipient = "$DEPLOYER_ADDRESS"
  operatorFeeVaultRecipient = "$DEPLOYER_ADDRESS"
  eip1559DenominatorCanyon = 250
  eip1559Denominator = 50
  eip1559Elasticity = 6
  gasLimit = 30000000

  [chains.roles]
    l1ProxyAdminOwner = "$DEPLOYER_ADDRESS"
    l2ProxyAdminOwner = "$DEPLOYER_ADDRESS"
    systemConfigOwner = "$DEPLOYER_ADDRESS"
    unsafeBlockSigner = "$DEPLOYER_ADDRESS"
    batcher = "$DEPLOYER_ADDRESS"
    proposer = "$DEPLOYER_ADDRESS"
    challenger = "$DEPLOYER_ADDRESS"
EOF

echo "  intent.toml configured for ShadowBase (L2 chain ID: $L2_CHAIN_ID)"

# Step 4: Deploy L1 contracts to Sepolia
echo ""
echo "[4/5] Deploying L1 contracts to Sepolia..."
echo "  This will broadcast transactions to Sepolia. Ensure your account has sufficient ETH."
echo "  L1 RPC: $SEPOLIA_RPC_URL"
echo ""

"$OP_DEPLOYER_BIN" apply \
    --l1-rpc-url "$SEPOLIA_RPC_URL" \
    --workdir "$DEPLOY_DIR" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --deployment-target live

echo "  L1 contracts deployed!"

# Step 5: Extract addresses and generate outputs
echo ""
echo "[5/5] Extracting deployment outputs..."

# Extract L1 contract addresses
echo "  Extracting L1 contract addresses..."
"$OP_DEPLOYER_BIN" inspect l1 \
    --workdir "$DEPLOY_DIR" \
    --outfile "$DEPLOY_DIR/l1-addresses.json" \
    "0x$(printf '%x' $L2_CHAIN_ID)"

# Generate L2 genesis
echo "  Generating L2 genesis.json..."
"$OP_DEPLOYER_BIN" inspect genesis \
    --workdir "$DEPLOY_DIR" \
    --outfile "$SCRIPT_DIR/genesis.json" \
    "0x$(printf '%x' $L2_CHAIN_ID)"

# Generate rollup config
echo "  Generating rollup.json..."
"$OP_DEPLOYER_BIN" inspect rollup \
    --workdir "$DEPLOY_DIR" \
    --outfile "$SCRIPT_DIR/rollup.json" \
    "0x$(printf '%x' $L2_CHAIN_ID)"

echo ""
echo "========================================"
echo " Deployment Complete!"
echo "========================================"
echo ""
echo " L1 Contract Addresses: $DEPLOY_DIR/l1-addresses.json"
echo " L2 Genesis:            $SCRIPT_DIR/genesis.json"
echo " Rollup Config:         $SCRIPT_DIR/rollup.json"
echo " State File:            $DEPLOY_DIR/state.json"
echo ""
echo " Next steps:"
echo "   1. Generate JWT secret:  openssl rand -hex 32 > $SCRIPT_DIR/jwt-secret.txt"
echo "   2. Start the devnet:     ./start-devnet.sh"
echo "========================================"
