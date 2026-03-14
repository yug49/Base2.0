# ShadowBase Devnet — Deployed Addresses

## L2 (ShadowBase Devnet)
- **RPC:** `http://localhost:8545`
- **Chain ID:** `845311` (`0xce5ff`)
- **Block Time:** 2 seconds
- **op-node RPC:** `http://localhost:9545`

### L2 Predeploys
| Contract | Address |
|---|---|
| PrivacyRouter | `0x4200000000000000000000000000000000000069` |
| ShieldedPool | `0x4200000000000000000000000000000000000070` |
| PrivacyBridge | `0x4200000000000000000000000000000000000071` |

### L2 Funded Test Accounts (10,000 ETH each)
| # | Address |
|---|---|
| 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| 3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |
| 4 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |
| 5 | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` |
| 6 | `0x976EA74026E726554dB657fA54763abd0C3a0aa9` |
| 7 | `0x14dC79964da2C08dA15Fd353d30580B6d3468dDB` |
| 8 | `0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f` |
| 9 | `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720` |

---

## L1 (Ethereum Sepolia)
- **Chain ID:** `11155111`
- **RPC:** `https://eth-sepolia.g.alchemy.com/v2/BESEnKtiyMGwMXfAjbNj2`
- **Beacon:** `https://eth-sepoliabeacon.g.alchemy.com/v2/BESEnKtiyMGwMXfAjbNj2`
- **Deployer:** `0xedB816F31AbCd2e14051ee7d53fc4AeCc49eA551`
- **Deployment blocks:** 10423930–10423938

### L1 OP Stack Proxy Contracts (Sepolia)
| Contract | Address |
|---|---|
| OptimismPortalProxy | `0x616e29f64cadd5da342aed7a0ee73e2afb703941` |
| L1CrossDomainMessengerProxy | `0x579aaf4e08b072b3b53148a260913837518a0ab8` |
| L1StandardBridgeProxy | `0x8ca729aa55033424619187f1231f2e9be4c50f62` |
| SystemConfigProxy | `0xda24880f952e68e32ed1efdd13831d86313af906` |
| DisputeGameFactoryProxy | `0x36b9a2d477707ad4cacfa64ec74db3fe30425e90` |
| L1ERC721BridgeProxy | `0xe3a1f68e2de91f4a9bc9031b02a92739d98befa1` |
| AnchorStateRegistryProxy | `0xf0601ab153fdc1e389449b23fd3d52647e3a0829` |
| EthLockboxProxy | `0xf8e78c7dea155c2996719ea0e956bda9edf6135a` |
| OptimismMintableERC20FactoryProxy | `0x37e74250329240f1cb783776476f89d3f2ad5682` |
| DelayedWethPermissionedGameProxy | `0x4525f01f591e0ad9ece63f0ae6e68c6ed3421ee3` |

### L1 Superchain Contracts (Sepolia)
| Contract | Address |
|---|---|
| SuperchainConfigProxy | `0x52a14d4d1d8fdd569c5f4eae7ab445a5a812cc62` |
| ProtocolVersionsProxy | `0xbe63055d461d3a2e99dc3295758528b385bb8474` |

### L1 Implementation Contracts (Sepolia)
| Contract | Address |
|---|---|
| AddressManagerImpl | `0xc429e7e57233eaa668285e5db533002dc7370e8c` |
| OpChainProxyAdminImpl | `0xd0e39a5757ad9ee553a8d617f7b808bc8ed32d24` |
| SuperchainProxyAdminImpl | `0xd605848aa20b16210344972e89c65ca2e09ca3b7` |

---

## External References
- **RAILGUN on Sepolia:** `0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea`
- **Full deployment state:** `devnet/deployment-live/state.json`
