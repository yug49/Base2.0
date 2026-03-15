#!/usr/bin/env python3
"""Search for address 0xedB816F31AbCd2e14051ee7d53fc4AeCc49eA551 and related keys."""
import os, json, re

BASE = "/Users/shubhtastic/Documents/ETHMumbai/ShadowBase"
TARGET = "edb816"

# 1. Search devnet/, scripts/, deployments/ for the address
print("=" * 60)
print("PART 1: Search for address edB816 in key directories")
print("=" * 60)
search_dirs = ["devnet", "scripts", "deployments"]
for d in search_dirs:
    dpath = os.path.join(BASE, d)
    if not os.path.exists(dpath):
        print(f"  [{d}] directory not found")
        continue
    for root, dirs, files in os.walk(dpath):
        for f in files:
            fp = os.path.join(root, f)
            try:
                with open(fp, 'r', errors='ignore') as fh:
                    for i, line in enumerate(fh, 1):
                        if TARGET in line.lower():
                            rel = os.path.relpath(fp, BASE)
                            print(f"  {rel}:{i}: {line.rstrip()[:200]}")
            except:
                pass

# 2. Search for .env files
print("\n" + "=" * 60)
print("PART 2: Search .env files")
print("=" * 60)
for root, dirs, files in os.walk(BASE):
    # Skip heavy dirs
    skip = {'node_modules', '.git', 'lib', 'op-geth', 'optimism', 'railgun-circuits', 'railgun-contract'}
    dirs[:] = [d for d in dirs if d not in skip]
    for f in files:
        if f.startswith('.env') or f == '.env':
            fp = os.path.join(root, f)
            rel = os.path.relpath(fp, BASE)
            print(f"\n  Found: {rel}")
            try:
                with open(fp, 'r') as fh:
                    content = fh.read()
                    if TARGET in content.lower():
                        print(f"    ** Contains target address! **")
                    # Show private key lines
                    for line in content.splitlines():
                        if any(k in line.upper() for k in ['PRIVATE_KEY', 'MNEMONIC', 'SECRET', 'DEPLOYER']):
                            print(f"    {line[:200]}")
            except:
                pass

# 3. Search for private keys in devnet and scripts
print("\n" + "=" * 60)
print("PART 3: Search for private keys / mnemonics in devnet/ and scripts/")
print("=" * 60)
for d in ["devnet", "scripts"]:
    dpath = os.path.join(BASE, d)
    if not os.path.exists(dpath):
        continue
    for root, dirs, files in os.walk(dpath):
        for f in files:
            fp = os.path.join(root, f)
            try:
                with open(fp, 'r', errors='ignore') as fh:
                    for i, line in enumerate(fh, 1):
                        ll = line.upper()
                        if any(k in ll for k in ['PRIVATE_KEY', 'MNEMONIC', '0XAC0974', 'DEPLOYER_KEY', 'SECRET_KEY']):
                            rel = os.path.relpath(fp, BASE)
                            print(f"  {rel}:{i}: {line.rstrip()[:200]}")
            except:
                pass

# 4. Genesis ProxyAdmin analysis
print("\n" + "=" * 60)
print("PART 4: Genesis ProxyAdmin (0x...0018) storage analysis")
print("=" * 60)
for gfile in ["devnet/genesis.json", "devnet/genesis-old.json"]:
    fp = os.path.join(BASE, gfile)
    if not os.path.exists(fp):
        print(f"  {gfile}: not found")
        continue
    with open(fp) as fh:
        g = json.load(fh)
    print(f"\n  {gfile}:")
    pa = "4200000000000000000000000000000000000018"
    for k in g.get("alloc", {}):
        if pa in k.lower():
            acct = g["alloc"][k]
            storage = acct.get("storage", {})
            print(f"    Address: 0x{pa}")
            print(f"    Storage slots: {len(storage)}")
            for sk, sv in storage.items():
                # Decode known slots
                label = ""
                if sk == "0x0000000000000000000000000000000000000000000000000000000000000000":
                    label = " (slot 0 = _owner / Ownable)"
                elif sk == "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc":
                    label = " (EIP-1967 implementation slot)"
                elif sk == "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103":
                    label = " (EIP-1967 admin slot)"
                addr_in_val = "0x" + sv[-40:]
                print(f"      {sk}{label}")
                print(f"        => {sv}")
                print(f"        => address: {addr_in_val}")

# 5. Check if 0xedB816 maps to a well-known mnemonic
print("\n" + "=" * 60)
print("PART 5: Well-known test mnemonic check")
print("=" * 60)
# Well-known Hardhat/Foundry default mnemonic
mnemonic = "test test test test test test test test test test test junk"
print(f"  Default test mnemonic: '{mnemonic}'")
# Hardhat default accounts (first 20):
hardhat_accounts = [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",  # Account #0 - key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",  # Account #1
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",  # Account #2
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906",  # Account #3
    "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",  # Account #4
    "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",  # Account #5
    "0x976EA74026E726554dB657fA54763abd0C3a0aa9",  # Account #6
    "0x14dC79964da2C08daCda098b954e7680B3A02694",  # Account #7
    "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",  # Account #8
    "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",  # Account #9
    "0xBcd4042DE499D14e55001CcbB24a551F3b954096",  # Account #10
    "0x71bE63f3384f5fb98995898A86B02Fb2426c5788",  # Account #11
    "0xFABB0ac9d68B0B445fB7357272Ff202C5651694a",  # Account #12
    "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec",  # Account #13
    "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097",  # Account #14
    "0xcd3B766CCDd6AE721141F452C550Ca635964ce71",  # Account #15
    "0x2546BcD3c84621e976D8185a91A922aE77ECEc30",  # Account #16
    "0xbDA5747bFD65F08deb54cb465eB87D40e51B197E",  # Account #17
    "0xdD2FD4581271e230360230F9337D5c0430Bf44C0",  # Account #18
    "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",  # Account #19
]
target_check = "edb816f31abcd2e14051ee7d53fc4aecc49ea551"
found = False
for i, a in enumerate(hardhat_accounts):
    if target_check in a.lower():
        print(f"  MATCH! Account #{i}: {a}")
        found = True
if not found:
    print(f"  0xedB816... is NOT one of the standard 20 Hardhat/Foundry test accounts")
    print(f"  It may be derived from a different index or a different mnemonic")

# 6. Search patch scripts that may have set this address
print("\n" + "=" * 60)
print("PART 6: Check patch scripts for address origin")
print("=" * 60)
for f in os.listdir(os.path.join(BASE, "devnet")):
    if "patch" in f.lower() or "genesis" in f.lower():
        if f.endswith(('.py', '.sh')):
            fp = os.path.join(BASE, "devnet", f)
            with open(fp, 'r') as fh:
                content = fh.read()
            if TARGET in content.lower():
                print(f"  {f}: Contains target address!")
                for i, line in enumerate(content.splitlines(), 1):
                    if TARGET in line.lower():
                        print(f"    Line {i}: {line[:200]}")
            elif "proxyadmin" in content.lower() or "0018" in content:
                print(f"  {f}: References ProxyAdmin/0018")
                for i, line in enumerate(content.splitlines(), 1):
                    if "proxyadmin" in line.lower() or ("owner" in line.lower() and "0x" in line):
                        print(f"    Line {i}: {line[:200]}")

print("\n" + "=" * 60)
print("SEARCH COMPLETE")
print("=" * 60)
