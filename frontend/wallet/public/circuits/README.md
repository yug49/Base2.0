# Circuit Artifacts

Place Groth16 circuit artifacts here for client-side proof generation.

## Required Files

For each circuit configuration (nullifiers × commitments):

| Config | WASM file | ZKey file |
|--------|-----------|-----------|
| 1×2 | `01x02.wasm` | `01x02.zkey` |
| 2×3 | `02x03.wasm` | `02x03.zkey` |
| 8×4 | `08x04.wasm` | `08x04.zkey` |

## How to generate

```bash
# From the repo root:
cd railgun-circuits
# Compile circuits
circom src/library/joinsplit.circom --r1cs --wasm --sym -o build/
# Run trusted setup (Powers of Tau)
snarkjs groth16 setup build/joinsplit.r1cs pot_final.ptau build/joinsplit.zkey
# Export verification key
snarkjs zkey export verificationkey build/joinsplit.zkey build/vkey.json
```

## Fallback

If artifacts are not present, `zkUtils` falls back to a **dummy proof** (all zeros).
This works on devnet when the transaction sender is `0x...dEaD` (VERIFICATION_BYPASS)
or when the verifier stub is deployed.

## Size Warning

Circuit artifacts can be large (10-100 MB per zkey). They are `.gitignore`d.
For the hackathon demo, serve them from a CDN or generate on first run.
