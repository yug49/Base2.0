# 🛡️ Privacy-Native Base — ETHMumbai 2026 Roadmap

> **One-liner:** A forked Base (OP Stack) chain where every wallet natively has a private sub-account — powered by RAILGUN's ZK cryptography, a custom EVM precompile for auto-shielding, and a cross-chain privacy bridge to RAILGUN on Ethereum Sepolia.

---

## Table of Contents

- [🛡️ Privacy-Native Base — ETHMumbai 2026 Roadmap](#️-privacy-native-base--ethmumbai-2026-roadmap)
  - [Table of Contents](#table-of-contents)
  - [Project Vision](#project-vision)
  - [Architecture Overview](#architecture-overview)
  - [Repositories \& Fork Strategy](#repositories--fork-strategy)
    - [Repos to Fork](#repos-to-fork)
    - [New Repo](#new-repo)
    - [Reference Only (Don't Fork)](#reference-only-dont-fork)
    - [Fork Chain Visualization](#fork-chain-visualization)
  - [Technical Clarity: What Is Node-Level vs Smart Contract](#technical-clarity-what-is-node-level-vs-smart-contract)
    - [RAILGUN is 100% smart contracts](#railgun-is-100-smart-contracts)
    - [Our project has ONE node-level change + smart contracts](#our-project-has-one-node-level-change--smart-contracts)
  - [Core Components](#core-components)
    - [1. Forked Base Chain (Base Devnet)](#1-forked-base-chain-base-devnet)
    - [2. Custom EVM Precompile — Auto-Shield Interceptor](#2-custom-evm-precompile--auto-shield-interceptor)
    - [3. PrivacyRouter — System Predeploy Contract](#3-privacyrouter--system-predeploy-contract)
    - [4. Shielded Pool — Forked RAILGUN Predeploy](#4-shielded-pool--forked-railgun-predeploy)
    - [5. Privacy Bridge — Cross-Chain L1 Connection](#5-privacy-bridge--cross-chain-l1-connection)
    - [6. Wallet Frontend](#6-wallet-frontend)
    - [7. Mini Block Explorer](#7-mini-block-explorer)
  - [User Flows](#user-flows)
    - [Flow A: Public → Public (Old Users, Unaffected)](#flow-a-public--public-old-users-unaffected)
    - [Flow B: Public → Private (The Magic Moment)](#flow-b-public--private-the-magic-moment)
    - [Flow C: Private → Private (Full Anonymity)](#flow-c-private--private-full-anonymity)
    - [Flow D: Private → Public (Unshield)](#flow-d-private--public-unshield)
    - [Flow E: Cross-Chain — Base Private → Ethereum Sepolia via RAILGUN](#flow-e-cross-chain--base-private--ethereum-sepolia-via-railgun)
  - [Privacy Analysis — What Is Private From Whom](#privacy-analysis--what-is-private-from-whom)
    - [What Is Fully Private](#what-is-fully-private)
    - [What Has Partial Privacy (Auto-Shield Entry Point)](#what-has-partial-privacy-auto-shield-entry-point)
    - [Why This Is Acceptable](#why-this-is-acceptable)
    - [Privacy Spectrum](#privacy-spectrum)
  - [Privacy Rules Engine](#privacy-rules-engine)
    - [Rule Configuration](#rule-configuration)
    - [Available Rules](#available-rules)
    - [How Rules Are Evaluated](#how-rules-are-evaluated)
    - [Future Extensibility (Mention in Presentation)](#future-extensibility-mention-in-presentation)
  - [How This Is Different From RAILGUN](#how-this-is-different-from-railgun)
    - [RAILGUN Today (on Arbitrum, Polygon, Ethereum, Sepolia)](#railgun-today-on-arbitrum-polygon-ethereum-sepolia)
    - [This Project (Privacy-Native Base)](#this-project-privacy-native-base)
    - [What We Built vs. What We Used](#what-we-built-vs-what-we-used)
  - [Hackathon Tracks Targeted](#hackathon-tracks-targeted)
  - [3-Day Execution Plan](#3-day-execution-plan)
    - [Day 1: Chain Infrastructure + Core Contracts](#day-1-chain-infrastructure--core-contracts)
    - [Day 2: Integration, Bridge, and Frontend](#day-2-integration-bridge-and-frontend)
    - [Day 3: Demo, Polish, and Presentation](#day-3-demo-polish-and-presentation)
  - [Demo Script](#demo-script)
  - [Future Work](#future-work)

---

## Project Vision

In today's Ethereum ecosystem, privacy is an afterthought. Users must discover privacy tools, manually deposit into shielded pools, and navigate complex UX. 99.9% of users never bother.

**We flip this.** We forked Base and made privacy a native, chain-level feature. Every wallet on our chain has a built-in private sub-account. Users opt-in with a single toggle. Once enabled, incoming funds are automatically shielded — no extra steps, no special wallets, no learning curve.

The sender doesn't even need to know privacy exists. Alice sends ETH to Bob's address like a normal transaction. The chain itself handles the rest.

**The analogy:** RAILGUN is like Signal — a great privacy app, but you have to convince everyone to install it. We made end-to-end encryption the default in every phone's messaging system. Same cryptography, fundamentally different impact.

---

## Architecture Overview

```
┌──────────────────── PRIVACY-NATIVE BASE (Your Forked Chain) ────────────────────┐
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐          │
│  │ CUSTOM PRECOMPILE (Go, in op-geth) ← ONLY node-level change        │          │
│  │ • Intercepts ALL value transfers at the EVM execution level         │          │
│  │ • Checks recipient's privacy rules via PrivacyRouter               │          │
│  │ • If AUTO_SHIELD → routes funds to Shielded Pool instead           │          │
│  │ • If PUBLIC (default) → normal transfer, zero change               │          │
│  └──────────────┬──────────────────────────────────────────────────────┘          │
│                 │                                                                  │
│                 ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐          │
│  │ PRIVACY ROUTER — System Predeploy (0x4200...0069)                   │          │
│  │ • Stores per-address privacy rules (Solidity contract)             │          │
│  │ • Configurable: AUTO_SHIELD / PUBLIC / CUSTOM rules                │          │
│  │ • Entry point for the precompile                                    │          │
│  │ • Manages rule parameters (minAmount, tokenWhitelist, etc.)        │          │
│  └──────────────┬──────────────────────────────────────────────────────┘          │
│                 │                                                                  │
│                 ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐          │
│  │ SHIELDED POOL — Forked RAILGUN Predeploy (0x4200...0070)            │          │
│  │ • Forked RAILGUN Solidity smart contracts                           │          │
│  │ • Merkle tree of encrypted UTXO commitments                        │          │
│  │ • ZK proof verification (Groth16)                                   │          │
│  │ • Shield / Private Transfer / Unshield operations                  │          │
│  │ • Nullifier tracking to prevent double-spend                       │          │
│  │ • THIS IS the "private sub-account" backend                        │          │
│  └──────────────┬──────────────────────────────────────────────────────┘          │
│                 │                                                                  │
│                 ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐          │
│  │ PRIVACY BRIDGE (0x4200...0071)                                      │          │
│  │ • Connects Base shielded pool to RAILGUN on Ethereum Sepolia       │          │
│  │ • Uses OP Stack's native CrossDomainMessenger                      │          │
│  │ • Burns commitment on Base → recreates on Sepolia RAILGUN          │          │
│  │ • Same commitment scheme = full compatibility                      │          │
│  └─────────────────────────────────────────────────────────────────────┘          │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
                          │
                          │ (OP Stack native L1↔L2 messaging)
                          ▼
┌──────────────────── ETHEREUM SEPOLIA (Real Public Testnet) ─────────────────┐
│                                                                              │
│  RAILGUN — Already deployed and live on Sepolia                             │
│  Contract: 0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea                      │
│  • Same commitment scheme as your Base fork                                 │
│  • Same Merkle tree structure                                                │
│  • Same ZK circuits                                                          │
│  • NO deployment needed — just interact with existing contracts             │
│                                                                              │
│  L1Companion.sol — Deployed by you on Sepolia                               │
│  • Receives bridge messages from your Base fork                             │
│  • Deposits into RAILGUN's existing Sepolia contract                        │
│  • Verifiable on Sepolia Etherscan by judges                                │
│                                                                              │
│  OP Stack L1 Contracts — Deployed by you on Sepolia                         │
│  • Standard OP Stack L1 settlement contracts                                │
│  • CrossDomainMessenger endpoint                                            │
│  • Your Base devnet settles to real Sepolia                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Repositories & Fork Strategy

We fork directly from **Base's own GitHub organization** so that our repos display "forked from base/..." — giving judges an immediate visible connection to Base.

### Repos to Fork

| What | Fork From | Your Repo | Purpose |
|---|---|---|---|
| **op-geth** | [base/op-geth](https://github.com/base/op-geth) | `yug49/op-geth` | Add custom Auto-Shield precompile in Go. GitHub shows "forked from base/op-geth" ✅ |
| **optimism monorepo** | [base/optimism](https://github.com/base/optimism) | `yug49/optimism` | op-node (rollup consensus), contracts-bedrock (L1 contracts + predeploy registration), op-chain-ops (genesis generation with predeploys), devnet tooling. GitHub shows "forked from base/optimism" ✅ |

### New Repo

| What | Link | Purpose |
|---|---|---|
| **ShadowBase** | `yug49/shadowbase` (create fresh) | Frontend, explorer, docs, scripts, RAILGUN contract forks, L1 companion contract |

### Reference Only (Don't Fork)

| What | Link | Purpose |
|---|---|---|
| **Base node config** | [base/node](https://github.com/base/node) | Read `.env.sepolia` for Sepolia L1 config patterns, chain ID, gas params |
| **RAILGUN contracts** | [Railgun-Community/contract](https://github.com/Railgun-Community/contract) | Copy Solidity contracts into shadowbase repo for adaptation |

### Fork Chain Visualization

```
ethereum-optimism/op-geth       (original OP Stack)
    └── base/op-geth            (Base's fork — actively maintained)
            └── yug49/op-geth   (YOUR fork — "forked from base/op-geth" ✅)

ethereum-optimism/optimism      (original OP Stack)
    └── base/optimism           (Base's fork — last pushed March 4, 2026)
            └── yug49/optimism  (YOUR fork — "forked from base/optimism" ✅)
```

**Why fork from Base and not from OP Stack directly?** Same underlying code — Base keeps their fork in sync with upstream. But forking from `base/*` gives you the "forked from base/..." badge on GitHub. Your pitch: *"We literally forked Base's own repositories and added native privacy at the chain level."*

---

## Technical Clarity: What Is Node-Level vs Smart Contract

This section exists so we can clearly articulate what we built and why.

### RAILGUN is 100% smart contracts

RAILGUN is NOT a node modification. It is a set of Solidity smart contracts + client-side ZK proof generation + an off-chain relayer network. It runs on standard, unmodified EVM chains. This is true on Ethereum, Arbitrum, Polygon, and now Sepolia.

### Our project has ONE node-level change + smart contracts

| Component | Level | Language | What It Does |
|---|---|---|---|
| **Auto-Shield Precompile** | Node-level (in `yug49/op-geth`) | Go | Intercepts value transfers, checks rules, routes to shielded pool |
| **PrivacyRouter** | Smart contract (predeploy) | Solidity | Stores and evaluates per-address privacy rules |
| **Shielded Pool** | Smart contract (predeploy) | Solidity | Forked RAILGUN contracts — the ZK privacy engine |
| **Privacy Bridge** | Smart contract (predeploy) | Solidity | Cross-chain bridge to RAILGUN on Sepolia |
| **L1 Companion** | Smart contract (on Sepolia) | Solidity | Receives bridge messages, deposits into RAILGUN Sepolia |
| **ZK Proof Generation** | Client-side | JavaScript/WASM | RAILGUN's existing SDK, runs in user's browser |
| **Relayer** | Off-chain | JavaScript | Submits private transactions on behalf of users |

The precompile is what makes this "native" rather than "just another RAILGUN deployment." The chain's EVM itself is privacy-aware.

---

## Core Components

### 1. Forked Base Chain (Base Devnet)

**What:** Fork Base's own OP Stack repositories and configure them to run your own Base-like L2 devnet that settles to Ethereum Sepolia.

**Repos:**
- **op-geth** — fork from [base/op-geth](https://github.com/base/op-geth) — the execution client where you add the custom precompile (Go)
- **optimism monorepo** — fork from [base/optimism](https://github.com/base/optimism) — contains op-node, contracts-bedrock (L1 contracts + predeploy system), op-chain-ops (genesis generation), devnet tooling
- **base/node** — [base/node](https://github.com/base/node) — reference only for Sepolia configuration patterns

**Details:**
- Fork both repos from Base's GitHub org to your account
- Configure the devnet to use **Ethereum Sepolia as L1** — reference `base/node`'s `.env.sepolia` for configuration patterns
- Deploy the standard OP Stack L1 contracts on Sepolia using the scripts in `optimism/packages/contracts-bedrock/` (OptimismPortal, CrossDomainMessenger, L1StandardBridge, etc.)
- Use `optimism/op-chain-ops` to generate a custom genesis that includes your three predeploy contracts (PrivacyRouter, Shielded Pool, Privacy Bridge) at reserved system addresses in the `0x4200...` range
- Register predeploys following existing patterns in `optimism/packages/contracts-bedrock/` — this is the standard way OP Stack chains add native features
- The devnet should produce blocks, accept transactions, and behave exactly like Base — except with your privacy additions
- Configure the chain ID, block time, and gas parameters for local development
- Ensure MetaMask and other wallets can connect to your devnet via custom RPC
- Fund test accounts on your L2 devnet for demo purposes

**What makes it "native":** The privacy contracts are deployed at genesis — they are part of the chain's DNA, not user-deployed contracts. The custom precompile modifies the EVM itself. This is how OP Stack chains are designed to be extended.

**Why Sepolia as L1:** Using a real public testnet means judges can verify your L1 contracts on Sepolia Etherscan, the cross-chain bridge uses real L1↔L2 messaging, and the RAILGUN integration connects to RAILGUN's actual Sepolia deployment — not a simulation.

**Why fork from Base:** Your GitHub repos will display "forked from base/op-geth" and "forked from base/optimism", making the connection to Base immediately visible to judges. Same code as forking from OP Stack upstream (Base stays in sync), but much stronger narrative for the Base track.

---

### 2. Custom EVM Precompile — Auto-Shield Interceptor

**What:** A modification to op-geth (written in Go) that intercepts every ETH value transfer at the EVM execution level and checks whether the recipient has auto-shield enabled.

**Where:** In your forked `yug49/op-geth` repository, primarily in the `core/vm/` directory.

**Details:**
- Register a new precompiled contract at a reserved address in op-geth's precompile registry
- The precompile is triggered during the EVM's value transfer step — specifically when the EVM processes a `CALL` opcode that includes a value transfer
- When triggered, the precompile reads the recipient's privacy rules from the PrivacyRouter contract's storage
- If the recipient's rules say `AUTO_SHIELD`:
  - Instead of crediting the recipient's public balance, the precompile redirects the value to the Shielded Pool contract
  - The Shielded Pool creates a shielded commitment for the recipient
  - The recipient's public balance remains unchanged
  - The commitment is added to the Merkle tree
- If the recipient's rules say `PUBLIC` (the default for all addresses):
  - The transfer proceeds normally — zero overhead, zero change in behavior
  - Old users are completely unaffected
- The precompile should add minimal gas overhead for the rule-check (one storage read)
- Edge cases to handle: contract-to-contract transfers, self-transfers, zero-value transfers

**Why a precompile and not just a smart contract:** Regular ETH transfers (sending ETH directly to an address) do NOT trigger any contract code on the recipient's side. The only way to intercept a plain ETH transfer is at the EVM level. This is what makes the privacy truly "native" — the chain itself is privacy-aware.

---

### 3. PrivacyRouter — System Predeploy Contract

**What:** A Solidity smart contract deployed at genesis at a reserved system address. It stores and manages per-address privacy rules.

**Where:** Written in `shadowbase/contracts/l2/PrivacyRouter.sol`, registered as predeploy in `optimism/packages/contracts-bedrock/`.

**Details:**
- Deployed at address `0x4200000000000000000000000000000000000069` in the genesis config
- Stores a mapping from address → privacy rules struct
- The privacy rules struct contains:
  - `mode`: enum — `PUBLIC` (default), `AUTO_SHIELD`, `CUSTOM`
  - `minAmount`: uint256 — only shield transfers above this amount (0 = shield everything)
  - `tokenWhitelist`: address[] — only shield these specific ERC-20 tokens (empty = shield all)
  - `senderWhitelist`: address[] — keep transfers from these addresses public (don't shield)
- Public functions:
  - `setMode(mode)` — toggle between PUBLIC and AUTO_SHIELD
  - `setRules(rules)` — set granular rules (minAmount, whitelist, etc.)
  - `getRules(address)` — read rules for any address (called by the precompile)
  - `shouldShield(recipient, sender, amount, token)` — the main function the precompile calls to determine whether to auto-shield a specific transfer
- Default state: every address starts as `PUBLIC` with no rules configured
- Events: emit events when rules are changed (for frontend to track)
- Access control: only the address owner can set their own rules

---

### 4. Shielded Pool — Forked RAILGUN Predeploy

**What:** A fork of RAILGUN's Solidity smart contracts, adapted to work as a system predeploy on your Base chain. This is the actual privacy engine — the "private sub-account" for every user.

**Where:** Forked from [Railgun-Community/contract](https://github.com/Railgun-Community/contract) into `shadowbase/contracts/l2/`, registered as predeploy in `optimism/packages/contracts-bedrock/`.

**Details:**
- Fork RAILGUN's core Solidity contracts from their open-source repository
- The key contracts to fork and adapt:
  - **RailgunSmartWallet** — the main contract that handles shield, transfer, and unshield operations
  - **Verifier** — the Groth16 ZK proof verifier contract
  - **PoseidonT3/T4** — the Poseidon hash function used in the Merkle tree (RAILGUN uses Poseidon, not Keccak, for ZK-friendliness)
  - **TokenAllowlist** — manages which tokens can be shielded
- Deploy all of these as predeploy contracts at genesis (addresses in the `0x4200...` range)
- Adapt the contracts to:
  - Accept calls from the PrivacyRouter/Precompile for auto-shielding (the precompile needs to be able to shield on behalf of a recipient)
  - Work with your chain's native ETH (RAILGUN typically works with wrapped tokens — you may need to handle native ETH shielding via internal WETH wrapping)
  - Use the **exact same** commitment scheme, Merkle tree depth, and circuit parameters as RAILGUN on Ethereum Sepolia (`0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea`) — this is critical for bridge compatibility
- The ZK circuits (Groth16 proving/verification keys) must match RAILGUN's existing circuits — do NOT generate new trusted setup parameters, use RAILGUN's existing ones
- Client-side ZK proof generation will use RAILGUN's existing SDK/libraries

**How the shielded pool works (conceptual):**
- **Shield (deposit):** ETH/tokens go into the pool → a commitment `hash(token, amount, ownerPublicKey, randomness)` is added to the Merkle tree → only the owner knows which commitment is theirs
- **Private Transfer:** Owner generates a ZK proof proving "I own commitment X, I want to create new commitment Y for a different recipient" → old commitment is nullified, new one is created → nobody can link them
- **Unshield (withdraw):** Owner generates a ZK proof proving "I own commitment X, send the underlying tokens to address Z" → tokens leave the pool to address Z → the link between the original shield and this unshield is hidden by the pool's anonymity set

---

### 5. Privacy Bridge — Cross-Chain L1 Connection

**What:** A smart contract on your Base fork + a companion contract on Ethereum Sepolia that together enable cross-chain private transfers between your Base shielded pool and RAILGUN's existing deployment on Sepolia.

**Where:** Bridge contract in `shadowbase/contracts/bridge/PrivacyBridge.sol` (predeploy on Base), L1 companion in `shadowbase/contracts/l1/L1Companion.sol` (deployed on Sepolia).

**Details:**

**On Base (predeploy):**
- Deploy `PrivacyBridge.sol` as a predeploy on your Base fork at `0x4200000000000000000000000000000000000071`
- The bridge uses OP Stack's built-in `CrossDomainMessenger` for L1↔L2 message passing — you do NOT build your own bridge infrastructure
- **Base → Sepolia flow:**
  1. User calls `PrivacyBridge.bridgeToL1(commitment, proof)` on Base
  2. The bridge verifies the ZK proof and burns/locks the commitment in the Base shielded pool
  3. The bridge sends a message to L1 via `CrossDomainMessenger.sendMessage()`
  4. On Sepolia, the L1Companion contract receives the message and deposits into RAILGUN's existing Sepolia contract with the same commitment parameters
  5. The user can now interact with their funds via RAILGUN on Ethereum Sepolia
- **Sepolia → Base flow (reverse):**
  1. User calls L1Companion on Sepolia to initiate a bridge to Base
  2. L1Companion sends a message to Base via `CrossDomainMessenger`
  3. Base `PrivacyBridge` receives the message and creates a new commitment in the Base shielded pool

**On Ethereum Sepolia (deployed by you):**
- Deploy `L1Companion.sol` on Sepolia — a small contract that:
  - Receives cross-chain messages from your Base fork's PrivacyBridge
  - Deposits into RAILGUN's existing Sepolia contract (`0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea`) with the same commitment parameters
  - Can also initiate Sepolia → Base transfers
- This contract is verifiable on Sepolia Etherscan — judges can see it

**Critical requirement:** The commitment scheme (hash function, field elements, Merkle tree structure) must be IDENTICAL between your Base shielded pool and RAILGUN on Sepolia. Since you're forking RAILGUN's contracts for your Base predeploys, this should be the case by default — but verify this explicitly by comparing parameters.

**Why this works:** RAILGUN is already deployed on Sepolia. Your Base devnet settles to Sepolia. OP Stack's CrossDomainMessenger already handles L1↔L2 messaging. You're just connecting the pieces — the only new code is the PrivacyBridge predeploy and the small L1Companion contract.

---

### 6. Wallet Frontend

**What:** A simple web-based wallet UI that connects to your Base devnet, shows both public and private balances, allows sending transactions, and lets users configure their privacy rules.

**Where:** `shadowbase/frontend/wallet/`

**Details:**
- Wallet connection: standard Web3 wallet connection (MetaMask, etc.) pointing to your Base devnet's RPC endpoint
- **Main wallet view:**
  - Display the connected address
  - Show **public balance** (standard `eth_getBalance` call)
  - Show **private balance** (query the shielded pool — this requires client-side scanning of the Merkle tree commitments using the user's private viewing key, which RAILGUN's SDK handles)
  - Visual separation: clearly show "Public Account" and "Private Account" as two sections under one address
- **Send functionality:**
  - Public send: standard transaction (for users who haven't enabled privacy or want to send publicly)
  - Private send: generates a ZK proof client-side, submits via relayer — the RAILGUN SDK/libraries handle the proof generation
  - Unshield: withdraw from private balance to a public address (self or other)
- **Privacy rules configuration panel:**
  - Toggle: ON/OFF for auto-shield
  - Basic rule inputs: minimum amount, token selection
  - This panel calls the PrivacyRouter contract's `setMode()` and `setRules()` functions
- **Cross-chain bridge UI (if time permits):**
  - Button to bridge private funds from Base to Ethereum Sepolia via RAILGUN
  - Show the bridge transaction status
- The frontend should be designed for the demo — two browser tabs open (Alice and Bob), with the flow clearly visible

---

### 7. Mini Block Explorer

**What:** A minimal block explorer page for your Base devnet that displays transactions and highlights the privacy features — specifically showing that shielded recipients are hidden.

**Where:** `shadowbase/frontend/explorer/`

**Details:**
- Can be a separate page in the same frontend app, or a standalone simple app
- Reads blocks and transactions from your Base devnet via RPC (`eth_getBlock`, `eth_getTransactionReceipt`, etc.)
- For each transaction, display:
  - Sender address
  - Recipient address (or "PrivacyRouter [SHIELDED]" if the transfer was auto-shielded)
  - Amount (or "SHIELDED" if it went to the pool)
  - Transaction hash
  - Block number
- The key visual: when Alice sends to Bob (who has auto-shield), the explorer should show the transaction going to the PrivacyRouter system contract, NOT to Bob's address. Bob is nowhere visible.
- Optional: show pool statistics (total shielded value, number of commitments, etc.)
- Keep it minimal — this is a demo tool, not Etherscan

---

## User Flows

### Flow A: Public → Public (Old Users, Unaffected)

```
Alice (public) sends 1 ETH to Charlie (public, default settings)

1. Alice submits a normal transaction: send 1 ETH to 0xcharlie
2. EVM processes the transfer
3. Precompile fires → reads Charlie's rules from PrivacyRouter → PUBLIC (default)
4. Normal transfer executes — Charlie's public balance increases by 1 ETH
5. Block explorer shows: Alice → Charlie, 1 ETH
6. Nothing is different. Alice and Charlie don't even know privacy features exist.
```

### Flow B: Public → Private (The Magic Moment)

```
Alice (public) sends 1 ETH to Bob (auto-shield enabled)

1. Alice submits a normal transaction: send 1 ETH to 0xbob
   (Alice does nothing special — she doesn't know about privacy features)
2. EVM processes the transfer
3. Precompile fires → reads Bob's rules from PrivacyRouter → AUTO_SHIELD
4. Instead of crediting 0xbob's public balance:
   → Precompile calls PrivacyRouter
   → PrivacyRouter calls Shielded Pool
   → 1 ETH is deposited into the shielded pool
   → A commitment hash(ETH, 1 ether, Bob's public key, randomness) is created
   → Commitment is added to the Merkle tree
5. Result:
   → Bob's public balance: unchanged (0 ETH)
   → Bob's private balance: +1 ETH (as a shielded UTXO commitment)
6. Block explorer shows: Alice → PrivacyRouter [SHIELDED], 1 ETH
   → Bob's address appears NOWHERE
   → Nobody knows Bob received the money
```

### Flow C: Private → Private (Full Anonymity)

```
Bob (private balance: 1 ETH) sends 0.5 ETH privately to Carol

1. Bob's wallet generates a ZK proof locally:
   → "I own a commitment worth 1 ETH in the shielded pool"
   → "I want to spend 0.5 ETH and create a new commitment for Carol"
   → "I want 0.5 ETH change back as a new commitment for myself"
   → The proof reveals NOTHING about Bob, Carol, or the amounts
2. The proof is submitted to the chain via a relayer (NOT from Bob's address)
3. On-chain:
   → Shielded Pool verifies the ZK proof
   → Bob's old commitment is nullified (spent)
   → Two new commitments are created: 0.5 ETH for Carol, 0.5 ETH for Bob (change)
4. Result:
   → Bob's private balance: 0.5 ETH
   → Carol's private balance: +0.5 ETH
5. Block explorer shows: Relayer → Shielded Pool (internal transaction)
   → Neither Bob nor Carol's addresses appear
   → Amount is not visible
   → Full anonymity for both sender and receiver
```

### Flow D: Private → Public (Unshield)

```
Bob (private balance: 0.5 ETH) wants to move funds to a fresh address

1. Bob's wallet generates a ZK proof:
   → "I own a commitment worth 0.5 ETH"
   → "Send the underlying 0.5 ETH to address 0xbob_fresh"
2. Proof is submitted via relayer
3. On-chain:
   → Shielded Pool verifies the proof
   → Bob's commitment is nullified
   → 0.5 ETH is sent from the pool to 0xbob_fresh
4. Result:
   → Bob's private balance: 0 ETH
   → 0xbob_fresh public balance: 0.5 ETH
5. Block explorer shows: Shielded Pool → 0xbob_fresh, 0.5 ETH
   → Nobody can link 0xbob_fresh to 0xbob
```

### Flow E: Cross-Chain — Base Private → Ethereum Sepolia via RAILGUN

```
Bob (private balance on Base: 1 ETH) bridges to Ethereum Sepolia

1. Bob calls PrivacyBridge.bridgeToL1() with a ZK proof on Base
2. On Base:
   → Bridge verifies the proof
   → Bob's commitment is burned/locked in Base shielded pool
   → Bridge sends a cross-chain message via OP Stack's CrossDomainMessenger to Sepolia
3. On Ethereum Sepolia:
   → L1Companion contract receives the message
   → Deposits into RAILGUN's existing Sepolia contract (0xecfcf3b4...3fea)
   → Bob now has a shielded balance in RAILGUN on Ethereum Sepolia
4. Bob can now use RAILGUN on Sepolia to transfer privately or unshield
5. The entire flow is private — nobody can link Bob's Base activity to his Sepolia activity
6. Judges can verify: L1Companion contract on Sepolia Etherscan, RAILGUN deposit visible
```

---

## Privacy Analysis — What Is Private From Whom

### What Is Fully Private

| Data | From public/explorers | From node operators/sequencer |
|---|---|---|
| **Private→Private transfers** | ✅ Fully private | ✅ Fully private (ZK proof reveals nothing) |
| **Bob's private balance** | ✅ Fully private | ✅ Fully private (encrypted commitments, only viewing key can read) |
| **Unshield destination link to Bob** | ✅ Fully private | ✅ Fully private (no on-chain link) |

### What Has Partial Privacy (Auto-Shield Entry Point)

| Data | From public/explorers | From node operators/sequencer |
|---|---|---|
| **Alice sent something** | ⚠️ Visible (she's a public user) | ⚠️ Visible |
| **Recipient is Bob** | ✅ Hidden (explorer shows PrivacyRouter) | ⚠️ Sequencer executes the precompile and could reconstruct |
| **Amount entering the pool** | ⚠️ Visible at point of entry | ⚠️ Visible |

### Why This Is Acceptable

- This is the **exact same limitation** RAILGUN has today — when you shield (deposit), the deposit itself is visible. Everything after is private.
- Our innovation is the **auto-shield UX** — Bob doesn't manually deposit. The limitation is the same, the experience is dramatically better.
- Base's sequencer is already a trusted entity (Coinbase runs it on real Base) — this is a known L2 trade-off.
- **Future improvement (mention in presentation):** Stealth address scheme (ERC-5564) can make the auto-shield entry point fully private from node operators too.

### Privacy Spectrum

```
LEAST PRIVATE ──────────────────────────────────── MOST PRIVATE

Public → Public     Public → Private      Private → Private
(Alice → Charlie)   (Alice → Bob)         (Bob → Carol)

Everything visible  Sender visible,       Nothing visible.
on explorer.        receiver + amount     ZK proof only.
Normal Base.        hidden in pool.       Full anonymity.
                    Bob is protected.     Both protected.
```

---

## Privacy Rules Engine

### Rule Configuration

Every address on the chain has a privacy rules struct stored in the PrivacyRouter contract. By default, all addresses have `mode: PUBLIC` — meaning the chain behaves exactly like normal Base.

### Available Rules

| Rule | Type | Description | Default |
|---|---|---|---|
| `mode` | enum | `PUBLIC` / `AUTO_SHIELD` / `CUSTOM` | `PUBLIC` |
| `minAmount` | uint256 | Only auto-shield transfers above this amount | `0` (shield all) |
| `tokenWhitelist` | address[] | Only auto-shield these tokens (empty = all) | `[]` (all tokens) |
| `senderWhitelist` | address[] | Never shield transfers from these addresses | `[]` (none) |

### How Rules Are Evaluated

When the precompile intercepts a transfer, it calls `PrivacyRouter.shouldShield(recipient, sender, amount, token)` which evaluates:

```
1. Is recipient's mode PUBLIC? → return false (don't shield)
2. Is recipient's mode AUTO_SHIELD?
   a. Is sender in senderWhitelist? → return false
   b. Is amount < minAmount? → return false
   c. Is token not in tokenWhitelist (if non-empty)? → return false
   d. → return true (shield this transfer)
```

### Future Extensibility (Mention in Presentation)

- AI-assisted rule configuration: users describe rules in natural language
- Time-based rules: shield only during certain hours
- Amount-based splitting: shield a percentage, keep rest public
- Per-dApp rules: different privacy settings for different protocols

---

## How This Is Different From RAILGUN

### RAILGUN Today (on Arbitrum, Polygon, Ethereum, Sepolia)

- It is a **dApp** — a set of Solidity smart contracts deployed by the RAILGUN team
- Users must **discover** RAILGUN, **learn** how it works, and **manually opt-in**
- Every privacy action requires explicit user interaction (manual shield, manual transfer, manual unshield)
- The chain has **zero awareness** of privacy — it just executes contract calls
- It is like having a VPN app that you must manually turn on for every website

### This Project (Privacy-Native Base)

- Privacy is a **chain-level feature** — system predeploys + custom EVM precompile
- We forked **Base's own repositories** ([base/op-geth](https://github.com/base/op-geth), [base/optimism](https://github.com/base/optimism)) and added privacy natively
- Users just **toggle a switch** and privacy works automatically
- The **EVM itself** checks privacy rules on every transfer — this is a protocol-level hook
- Senders don't need to know or do anything differently
- Connects to RAILGUN's existing Sepolia deployment for cross-chain privacy
- It is like having a VPN built into the operating system that is on by default

### What We Built vs. What We Used

| Component | Built by Us (Novel) | Used from RAILGUN (Existing) |
|---|---|---|
| PrivacyRouter system contract | ✅ | |
| Custom EVM precompile (auto-shield) | ✅ | |
| Privacy rules engine | ✅ | |
| Native Base/OP Stack integration | ✅ | |
| Cross-chain Privacy Bridge + L1Companion | ✅ | |
| Wallet frontend + mini explorer | ✅ | |
| ZK circuits & proof generation | | ✅ (used as-is) |
| Shielded pool & Merkle tree | | ✅ (forked & adapted for predeploy) |
| Commitment scheme & nullifiers | | ✅ (forked) |
| RAILGUN on Sepolia | | ✅ (already deployed, we connect to it) |

---

## Hackathon Tracks Targeted

| Track | Prize | Why We Qualify |
|---|---|---|
| **ETHMumbai: Best Overall Project** | $250 | Novel infrastructure-level project with real technical depth — forked Base, modified the EVM, integrated cross-chain ZK privacy |
| **ETHMumbai: Privacy — Best Project** | $250 | Core project is privacy — native shielded accounts on Base |
| **Base: Privacy** | $350 | "Private transaction rails: shielded transfers for token flows" — exactly what we built |

**Total potential prize:** $850

---

## 3-Day Execution Plan

### Day 1: Chain Infrastructure + Core Contracts

**Goal:** Have a running forked Base devnet settling to Sepolia with all predeploy contracts deployed and the precompile intercepting transfers.

**Morning (4-5 hours):**

- [ ] Fork [base/op-geth](https://github.com/base/op-geth) → `yug49/op-geth`
- [ ] Fork [base/optimism](https://github.com/base/optimism) → `yug49/optimism`
- [ ] Create `yug49/shadowbase` repo with directory structure
- [ ] Study [base/node](https://github.com/base/node) `.env.sepolia` for config reference
- [ ] Set up the devnet configuration pointing to **Ethereum Sepolia as L1**
- [ ] Deploy OP Stack L1 contracts on Sepolia using `optimism/packages/contracts-bedrock/` scripts (OptimismPortal, CrossDomainMessenger, etc.)
- [ ] Fund your L1 deployer account with Sepolia ETH (faucets)
- [ ] Define the addresses for the three predeploy contracts:
  - PrivacyRouter: `0x4200000000000000000000000000000000000069`
  - ShieldedPool: `0x4200000000000000000000000000000000000070`
  - PrivacyBridge: `0x4200000000000000000000000000000000000071`
- [ ] Get the vanilla (unmodified) devnet running and producing blocks — confirm it works before making changes
- [ ] Confirm MetaMask can connect to the devnet

**Afternoon (4-5 hours):**

- [ ] Write the PrivacyRouter Solidity contract in `shadowbase/contracts/l2/` — rules storage, setMode(), setRules(), shouldShield()
- [ ] Write the initial custom precompile in Go in `yug49/op-geth` — register in precompile registry, hook into value transfer path, call shouldShield()
- [ ] Register PrivacyRouter as predeploy in `optimism/packages/contracts-bedrock/`
- [ ] Configure genesis via `optimism/op-chain-ops` to include PrivacyRouter
- [ ] Test: deploy modified devnet, send a transaction, verify the precompile fires and checks rules

**Evening (2-3 hours):**

- [ ] Fork RAILGUN's Solidity smart contracts from [Railgun-Community/contract](https://github.com/Railgun-Community/contract) into `shadowbase/contracts/l2/`
- [ ] Study RAILGUN's contract architecture — identify needed contracts, strip unnecessary ones (governance, staking, etc.)
- [ ] Begin adapting RAILGUN contracts for predeploy deployment — remove constructor dependencies, adapt initialization
- [ ] Verify RAILGUN's Sepolia deployment parameters — confirm commitment scheme, Merkle tree depth, circuit params match

---

### Day 2: Integration, Bridge, and Frontend

**Goal:** Complete the shielded pool integration, build the Privacy Bridge with Sepolia L1, and have a working frontend.

**Morning (4-5 hours):**

- [ ] Complete RAILGUN contract adaptation — get the Shielded Pool working as a predeploy
- [ ] Connect the precompile → PrivacyRouter → Shielded Pool flow end-to-end
- [ ] Test the complete auto-shield flow: send ETH to an address with AUTO_SHIELD, verify commitment is created, verify public balance unchanged
- [ ] Handle native ETH shielding (RAILGUN typically uses ERC-20 — adapt for native ETH or use WETH wrapping internally)

**Afternoon (4-5 hours):**

- [ ] Build the Privacy Bridge contract (`shadowbase/contracts/bridge/PrivacyBridge.sol`) for Base side
- [ ] Write `shadowbase/contracts/l1/L1Companion.sol` and deploy on Sepolia
- [ ] Configure bridge to use OP Stack's CrossDomainMessenger (already deployed on Sepolia from Day 1)
- [ ] Connect L1Companion to RAILGUN's existing Sepolia contract (`0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea`)
- [ ] Test bridge: shield on Base → bridge to Sepolia → verify commitment on RAILGUN Sepolia
- [ ] Begin wallet frontend in `shadowbase/frontend/wallet/` — project setup, wallet connection, basic layout

**Evening (2-3 hours):**

- [ ] Complete wallet frontend — privacy rules toggle, send functionality
- [ ] Integrate RAILGUN SDK for client-side operations (viewing private balance)
- [ ] Begin mini block explorer in `shadowbase/frontend/explorer/` — read blocks from devnet, display transactions

---

### Day 3: Demo, Polish, and Presentation

**Goal:** Everything works end-to-end. Demo is smooth. Presentation is compelling.

**Morning (4-5 hours):**

- [ ] Fix integration bugs from Day 2
- [ ] Complete mini block explorer
- [ ] Run through full demo flow multiple times:
  - Alice (public) sends to Bob (auto-shield) → verify on explorer
  - Bob views private balance in wallet UI
  - Bob sends privately or unshields to public
  - Cross-chain bridge to Sepolia RAILGUN demo (if working)
- [ ] Test edge cases: toggle off, zero-value transfers, below-minAmount transfers

**Afternoon (3-4 hours):**

- [ ] Build presentation/pitch deck:
  - The problem: privacy is opt-in and nobody uses it
  - The solution: privacy-native Base with automatic shielding
  - Architecture diagram
  - Live demo
  - How it's different from RAILGUN (use the Signal analogy)
  - What we built vs what we forked (be transparent)
  - Show GitHub: "forked from base/op-geth" — direct Base connection
  - Privacy analysis: what's private from whom (shows maturity)
  - Future work (stealth addresses, AI rules, multi-chain)
  - Track alignment
- [ ] Practice demo 3-4 times — smooth flow between Alice tab, Bob tab, and explorer
- [ ] Prepare for judge questions:
  - "How is this different from RAILGUN?" → Infrastructure upgrade, not a dApp. We forked Base itself.
  - "Is the auto-shield really at the EVM level?" → Yes, show the Go precompile code in our forked base/op-geth
  - "What about compliance/regulation?" → Future ZK compliance proofs
  - "What about gas costs?" → One storage read overhead for public users, shielding has standard RAILGUN gas costs
  - "Can the sequencer see the recipient?" → Yes, same as RAILGUN shielding. Future: stealth addresses (ERC-5564)

**Evening:**

- [ ] Submit project
- [ ] Final demo dry run
- [ ] Ensure Sepolia L1 contracts are verified on Etherscan (for judges to inspect)
- [ ] Verify GitHub repos show "forked from base/op-geth" and "forked from base/optimism"

---

## Demo Script

**Duration: ~5 minutes**

**1. Setup (30 seconds)**
- Show terminal: forked Base devnet running, settling to Sepolia
- Show GitHub: "forked from base/op-geth" visible on repo page
- "This is Base — but with native privacy built into the chain at the protocol level. We forked Base's own repositories. It settles to real Ethereum Sepolia, and connects to RAILGUN's existing deployment."

**2. Alice — Normal User (1 minute)**
- Open Tab 1: Alice's wallet connected to devnet
- Show her public balance (e.g., 10 ETH)
- "Alice is a regular user. She doesn't know about privacy features. Her experience is identical to using Base today."

**3. Bob — Enables Privacy (1 minute)**
- Open Tab 2: Bob's wallet connected to devnet
- Show his balance (0 ETH)
- Navigate to Privacy Settings panel
- Toggle "Auto-Shield" to ON
- Show the transaction confirming his privacy rules on-chain
- "Bob just enabled his private account. One toggle. Any ETH sent to his address is now automatically shielded."

**4. The Magic Moment (1.5 minutes)**
- Switch to Tab 1 (Alice)
- Alice sends 1 ETH to Bob's address — normal transaction
- Transaction confirms
- Switch to Tab 2 (Bob)
- Show: **Public Balance: 0 ETH | Private Balance: 1 ETH**
- Open mini block explorer
- Show: "Alice → PrivacyRouter [SHIELDED], 1 ETH"
- "Bob's address appears nowhere. Nobody can tell who received the money. The chain did this automatically — Alice didn't do anything special."

**5. Bob Uses Private Funds (1 minute)**
- Bob sends privately to Carol or unshields to a fresh address
- Show transaction on explorer: submitted by relayer, no link to Bob
- (If time) Show bridge to Sepolia — "Bob can now move his private funds to Ethereum L1 through RAILGUN"

**6. Closing (30 seconds)**
- Show architecture diagram
- "We forked Base's own repositories, added a custom EVM precompile, deployed RAILGUN's ZK privacy as native system contracts, and built a cross-chain bridge to RAILGUN on Ethereum Sepolia. Privacy is no longer an app you install — it's built into the chain."

---

## Future Work

- **Stealth Address Integration (ERC-5564):** Make auto-shield fully private from node operators — senders use stealth addresses so even the sequencer can't identify the recipient
- **AI-Assisted Rule Configuration:** Natural language interface for setting privacy rules
- **ERC-20 Token Support:** Extend auto-shielding to all ERC-20 tokens (USDC, DAI, etc.)
- **Compliance Layer:** ZK-based compliance proofs — prove "I'm not sanctioned" without revealing identity
- **Multi-Chain Expansion:** Deploy on other OP Stack chains (Optimism, Mode, Zora) as a standard upgrade module
- **Privacy-Preserving AI Agents:** Agents get transaction privacy by default (aligns with Base's AI × Onchain vision)
- **Decentralized Relayer Network:** Incentivized relayers for private transaction submission
- **Mainnet RAILGUN Bridge:** Extend the bridge from Sepolia to Ethereum mainnet RAILGUN deployment
- **ENS Integration:** Privacy-aware ENS resolution with privacy preferences stored in text records