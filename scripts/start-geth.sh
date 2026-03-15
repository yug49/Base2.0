#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEVNET_DIR="$SCRIPT_DIR/../devnet"

exec "$SCRIPT_DIR/../op-geth/build/bin/geth" \
  --datadir "$DEVNET_DIR/data/geth" \
  --networkid 845311 \
  --http --http.addr 0.0.0.0 --http.port 8545 \
  --http.api web3,debug,eth,txpool,net,engine \
  --http.corsdomain "*" --http.vhosts "*" \
  --ws --ws.addr 0.0.0.0 --ws.port 8546 \
  --ws.api debug,eth,txpool,net,engine --ws.origins "*" \
  --authrpc.addr 0.0.0.0 --authrpc.port 8551 \
  --authrpc.jwtsecret "$DEVNET_DIR/jwt-secret.txt" --authrpc.vhosts "*" \
  --nodiscover --maxpeers 0 --syncmode full --gcmode archive --cache 512 --verbosity 3
