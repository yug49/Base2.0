// ============================================================================
// ShadowBase Explorer — Contract ABIs (subset for read-only explorer)
// ============================================================================

export const SHIELDED_POOL_ABI = [
  {
    type: 'event', name: 'Shield',
    inputs: [
      { name: 'treeNumber', type: 'uint256', indexed: false },
      { name: 'startPosition', type: 'uint256', indexed: false },
      { name: 'commitments', type: 'tuple[]', indexed: false,
        components: [
          { name: 'npk', type: 'bytes32' },
          { name: 'token', type: 'tuple', components: [
            { name: 'tokenType', type: 'uint8' },
            { name: 'tokenAddress', type: 'address' },
            { name: 'tokenSubID', type: 'uint256' },
          ]},
          { name: 'value', type: 'uint120' },
        ],
      },
    ],
  },
  {
    type: 'event', name: 'Nullified',
    inputs: [
      { name: 'treeNumber', type: 'uint256', indexed: false },
      { name: 'nullifiers', type: 'bytes32[]', indexed: false },
    ],
  },
  {
    type: 'event', name: 'Transact',
    inputs: [
      { name: 'treeNumber', type: 'uint256', indexed: false },
      { name: 'startPosition', type: 'uint256', indexed: false },
      { name: 'hash', type: 'bytes32[]', indexed: false },
      { name: 'ciphertext', type: 'tuple[]', indexed: false,
        components: [
          { name: 'ciphertext', type: 'bytes32[4]' },
          { name: 'blindedSenderViewingKey', type: 'bytes32' },
          { name: 'blindedReceiverViewingKey', type: 'bytes32' },
          { name: 'annotationData', type: 'bytes' },
          { name: 'memo', type: 'bytes' },
        ],
      },
    ],
  },
  { type: 'function', name: 'merkleRoot', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bytes32' }] },
  { type: 'function', name: 'treeNumber', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'nextLeafIndex', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

export const PRIVACY_ROUTER_ABI = [
  { type: 'function', name: 'getMode', stateMutability: 'view',
    inputs: [{ name: '_account', type: 'address' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;
