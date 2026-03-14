// ============================================================
// Contract ABIs — extracted from ShadowBase Solidity contracts
// ============================================================

export const PRIVACY_ROUTER_ABI = [
  // Events
  {
    type: 'event',
    name: 'ModeChanged',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'mode',    type: 'uint8',   indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RulesChanged',
    inputs: [
      { name: 'account',         type: 'address',   indexed: true  },
      { name: 'minAmount',       type: 'uint256',   indexed: false },
      { name: 'tokenWhitelist',  type: 'address[]', indexed: false },
      { name: 'senderWhitelist', type: 'address[]', indexed: false },
    ],
  },
  // setMode(uint8 _mode)
  {
    type: 'function',
    name: 'setMode',
    stateMutability: 'nonpayable',
    inputs:  [{ name: '_mode', type: 'uint8' }],
    outputs: [],
  },
  // setRules(uint256,address[],address[])
  {
    type: 'function',
    name: 'setRules',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_minAmount',       type: 'uint256'   },
      { name: '_tokenWhitelist',  type: 'address[]' },
      { name: '_senderWhitelist', type: 'address[]' },
    ],
    outputs: [],
  },
  // getMode(address) → uint8
  {
    type: 'function',
    name: 'getMode',
    stateMutability: 'view',
    inputs:  [{ name: '_account', type: 'address' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
  // getRules(address) → (uint8 mode, uint256 minAmount, address[] tokenWhitelist, address[] senderWhitelist)
  {
    type: 'function',
    name: 'getRules',
    stateMutability: 'view',
    inputs: [{ name: '_account', type: 'address' }],
    outputs: [
      { name: 'mode',             type: 'uint8'     },
      { name: 'minAmount',        type: 'uint256'   },
      { name: 'tokenWhitelist',   type: 'address[]' },
      { name: 'senderWhitelist',  type: 'address[]' },
    ],
  },
  // shouldShield(address,address,uint256,address) → bool
  {
    type: 'function',
    name: 'shouldShield',
    stateMutability: 'view',
    inputs: [
      { name: '_recipient', type: 'address' },
      { name: '_sender',    type: 'address' },
      { name: '_amount',    type: 'uint256' },
      { name: '_token',     type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const SHIELDED_POOL_ABI = [
  // Events
  {
    type: 'event',
    name: 'Shield',
    inputs: [
      { name: 'treeNumber',       type: 'uint256', indexed: false },
      { name: 'startPosition',    type: 'uint256', indexed: false },
      { name: 'commitments',      type: 'tuple[]', indexed: false,
        components: [
          { name: 'npk',       type: 'bytes32'  },
          { name: 'token',     type: 'tuple',
            components: [
              { name: 'tokenType',    type: 'uint8'   },
              { name: 'tokenAddress', type: 'address' },
              { name: 'tokenSubID',   type: 'uint256' },
            ]
          },
          { name: 'value',     type: 'uint120'  },
        ]
      },
    ],
  },
  // merkleRoot() → bytes32
  {
    type: 'function',
    name: 'merkleRoot',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  // treeNumber() → uint256
  {
    type: 'function',
    name: 'treeNumber',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // nextLeafIndex() → uint256
  {
    type: 'function',
    name: 'nextLeafIndex',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // pendingShields(address) → uint256
  {
    type: 'function',
    name: 'pendingShields',
    stateMutability: 'view',
    inputs:  [{ name: '_recipient', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // claimAutoShield(bytes32 npk, ShieldCiphertext ciphertext)
  // ShieldCiphertext = (bytes32[3] encryptedBundle, bytes32 shieldKey)
  {
    type: 'function',
    name: 'claimAutoShield',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_npk', type: 'bytes32' },
      { name: '_ciphertext', type: 'tuple',
        components: [
          { name: 'encryptedBundle', type: 'bytes32[3]' },
          { name: 'shieldKey',       type: 'bytes32'    },
        ]
      },
    ],
    outputs: [],
  },
  // transact(Transaction[] _transactions) — Rajat Phase 5
  // Processes shielded transactions with ZK proofs (transact / unshield / bridge)
  {
    type: 'function',
    name: 'transact',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: '_transactions',
        type: 'tuple[]',
        components: [
          // SnarkProof proof
          {
            name: 'proof',
            type: 'tuple',
            components: [
              { name: 'a', type: 'tuple', components: [
                { name: 'x', type: 'uint256' },
                { name: 'y', type: 'uint256' },
              ]},
              { name: 'b', type: 'tuple', components: [
                { name: 'x', type: 'uint256[2]' },
                { name: 'y', type: 'uint256[2]' },
              ]},
              { name: 'c', type: 'tuple', components: [
                { name: 'x', type: 'uint256' },
                { name: 'y', type: 'uint256' },
              ]},
            ],
          },
          // bytes32 merkleRoot
          { name: 'merkleRoot', type: 'bytes32' },
          // bytes32[] nullifiers
          { name: 'nullifiers', type: 'bytes32[]' },
          // bytes32[] commitments
          { name: 'commitments', type: 'bytes32[]' },
          // BoundParams boundParams
          {
            name: 'boundParams',
            type: 'tuple',
            components: [
              { name: 'treeNumber',    type: 'uint16'  },
              { name: 'minGasPrice',   type: 'uint72'  },
              { name: 'unshield',      type: 'uint8'   },
              { name: 'chainID',       type: 'uint64'  },
              { name: 'adaptContract', type: 'address' },
              { name: 'adaptParams',   type: 'bytes32' },
              {
                name: 'commitmentCiphertext',
                type: 'tuple[]',
                components: [
                  { name: 'ciphertext',                type: 'bytes32[4]' },
                  { name: 'blindedSenderViewingKey',   type: 'bytes32'    },
                  { name: 'blindedReceiverViewingKey',  type: 'bytes32'    },
                  { name: 'annotationData',            type: 'bytes'      },
                  { name: 'memo',                      type: 'bytes'      },
                ],
              },
            ],
          },
          // CommitmentPreimage unshieldPreimage
          {
            name: 'unshieldPreimage',
            type: 'tuple',
            components: [
              { name: 'npk', type: 'bytes32' },
              {
                name: 'token',
                type: 'tuple',
                components: [
                  { name: 'tokenType',    type: 'uint8'   },
                  { name: 'tokenAddress', type: 'address' },
                  { name: 'tokenSubID',   type: 'uint256' },
                ],
              },
              { name: 'value', type: 'uint120' },
            ],
          },
        ],
      },
    ],
    outputs: [],
  },
  // Nullified event — emitted when nullifiers are consumed
  {
    type: 'event',
    name: 'Nullified',
    inputs: [
      { name: 'treeNumber', type: 'uint256', indexed: false },
      { name: 'nullifiers', type: 'bytes32[]', indexed: false },
    ],
  },
  // AutoShieldClaimed event — emitted when a user claims their pending auto-shield
  {
    type: 'event',
    name: 'AutoShieldClaimed',
    inputs: [
      { name: 'recipient',      type: 'address', indexed: true  },
      { name: 'amount',          type: 'uint256', indexed: false },
      { name: 'commitmentHash',  type: 'bytes32', indexed: false },
    ],
  },
  // Transact event — emitted when new commitments are added via transact()
  {
    type: 'event',
    name: 'Transact',
    inputs: [
      { name: 'treeNumber',    type: 'uint256',   indexed: false },
      { name: 'startPosition', type: 'uint256',   indexed: false },
      { name: 'hash',          type: 'bytes32[]',  indexed: false },
      { name: 'ciphertext',    type: 'tuple[]',    indexed: false,
        components: [
          { name: 'ciphertext',                type: 'bytes32[4]' },
          { name: 'blindedSenderViewingKey',   type: 'bytes32'    },
          { name: 'blindedReceiverViewingKey',  type: 'bytes32'    },
          { name: 'annotationData',            type: 'bytes'      },
          { name: 'memo',                      type: 'bytes'      },
        ],
      },
    ],
  },
] as const;
