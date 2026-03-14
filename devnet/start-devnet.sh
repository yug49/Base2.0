#!/usr/bin/env bash
# ================================================================
# ShadowBase Devnet — Local Startup Script (without Docker)
# ================================================================
# Runs op-geth + op-node locally for development.
# Use this if you prefer running binaries directly instead of Docker.
#
# Prerequisites:
#   1. op-geth binary built from ../op-geth (cd ../op-geth && make geth)
#   2. op-node binary built from ../optimism/op-node (cd ../optimism/op-node && make op-node)
#   3. L1 contracts deployed to Sepolia (addresses filled in deploy-config)
#   4. genesis.json and rollup.json generated (see README.md)
#   5. JWT secret generated: openssl rand -hex 32 > jwt-secret.txt
#   6. Sepolia RPC URL set below
# ================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---- CONFIGURATION — EDIT THESE ----
SEPOLIA_RPC_URL="${SEPOLIA_RPC_URL:-<YOUR_SEPOLIA_RPC_URL>}"
L2_CHAIN_ID=845311
OP_GETH_BIN="${OP_GETH_BIN:-../op-geth/build/bin/geth}"
OP_NODE_BIN="${OP_NODE_BIN:-../optimism/op-node/bin/op-node}"
DATA_DIR="./data"
JWT_SECRET="./jwt-secret.txt"
GENESIS_FILE="./genesis.json"
ROLLUP_CONFIG="./rollup.json"
# -------------------------------------

# Validate prerequisites
for f in "$JWT_SECRET" "$GENESIS_FILE" "$ROLLUP_CONFIG"; do
    if [ ! -f "$f" ]; then
        echo "ERROR: Required file not found: $f"
        echo "See README.md for setup instructions."
        exit 1
    fi
done

for bin in "$OP_GETH_BIN" "$OP_NODE_BIN"; do
    if [ ! -x "$bin" ]; then
        echo "ERROR: Binary not found or not executable: $bin"
        echo "Build it first. See README.md."
        exit 1
    fi
done

if [ "$SEPOLIA_RPC_URL" = "<YOUR_SEPOLIA_RPC_URL>" ]; then
    echo "ERROR: Set SEPOLIA_RPC_URL environment variable to your Sepolia RPC endpoint."
    echo "  export SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
    exit 1
fi

# Initialize op-geth if needed
GETH_DATA="$DATA_DIR/geth"
if [ ! -d "$GETH_DATA/geth/chaindata" ]; then
    echo "Initializing op-geth with genesis..."
    mkdir -p "$GETH_DATA"
    "$OP_GETH_BIN" init --datadir "$GETH_DATA" "$GENESIS_FILE"
fi

echo "Starting op-geth..."
"$OP_GETH_BIN" \
    --datadir "$GETH_DATA" \
    --networkid "$L2_CHAIN_ID" \
    --http \
    --http.addr 0.0.0.0 \
    --http.port 8545 \
    --http.api web3,debug,eth,txpool,net,engine \
    --http.corsdomain "*" \
    --http.vhosts "*" \
    --ws \
    --ws.addr 0.0.0.0 \
    --ws.port 8546 \
    --ws.api debug,eth,txpool,net,engine \
    --ws.origins "*" \
    --authrpc.addr 0.0.0.0 \
    --authrpc.port 8551 \
    --authrpc.jwtsecret "$JWT_SECRET" \
    --authrpc.vhosts "*" \
    --nodiscover \
    --maxpeers 0 \
    --syncmode full \
    --gcmode archive \
    --cache 512 \
    --verbosity 3 \
    &
GETH_PID=$!

# Wait for op-geth to start
echo "Waiting for op-geth Engine API..."
for i in $(seq 1 30); do
    if curl -s -o /dev/null http://localhost:8545; then
        echo "op-geth is ready."
        break
    fi
    sleep 1
done

echo "Starting op-node..."
"$OP_NODE_BIN" \
    --l1="$SEPOLIA_RPC_URL" \
    --l2=ws://localhost:8551 \
    --l2.jwt-secret="$JWT_SECRET" \
    --rollup.config="$ROLLUP_CONFIG" \
    --sequencer.enabled \
    --sequencer.l1-confs=0 \
    --verifier.l1-confs=0 \
    --p2p.disable \
    --rpc.addr=0.0.0.0 \
    --rpc.port=9545 \
    --log.level=info \
    &
NODE_PID=$!

echo ""
echo "========================================"
echo " ShadowBase Devnet Running"
echo "========================================"
echo " L2 RPC (MetaMask):  http://localhost:8545"
echo " L2 WS:              ws://localhost:8546"
echo " op-node RPC:        http://localhost:9545"
echo " L1 (Sepolia):       $SEPOLIA_RPC_URL"
echo " L2 Chain ID:        $L2_CHAIN_ID"
echo "========================================"
echo " Press Ctrl+C to stop"
echo "========================================"

# Trap cleanup
cleanup() {
    echo "Shutting down..."
    kill $NODE_PID 2>/dev/null || true
    kill $GETH_PID 2>/dev/null || true
    wait
    echo "Done."
}
trap cleanup INT TERM

wait
