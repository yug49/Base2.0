#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEVNET_DIR="$SCRIPT_DIR/../devnet"

exec "$SCRIPT_DIR/../optimism/op-node/bin/op-node" \
  --l1=https://ethereum-sepolia-rpc.publicnode.com \
  --l1.beacon=https://ethereum-sepolia-beacon-api.publicnode.com \
  --l2=ws://localhost:8551 \
  --l2.jwt-secret="$DEVNET_DIR/jwt-secret.txt" \
  --rollup.config="$DEVNET_DIR/rollup.json" \
  --sequencer.enabled \
  --sequencer.l1-confs=0 \
  --verifier.l1-confs=0 \
  --p2p.disable \
  --rpc.addr=0.0.0.0 \
  --rpc.port=9545 \
  --log.level=info
