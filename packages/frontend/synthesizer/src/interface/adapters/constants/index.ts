// Modular Contract addresses - Updated for new architecture
export const ROLLUP_BRIDGE_CORE_ADDRESS = '0x04C0A9366280A4B6bcE0f01d5D18014d1Bd03845';
export const ROLLUP_BRIDGE_DEPOSIT_MANAGER_ADDRESS = '0x1B6073D620b8977D4760F5a36f1Be0ceB3A21fAE';
export const ROLLUP_BRIDGE_PROOF_MANAGER_ADDRESS = '0xCfD17915Fe378f49c4bF574d63F3De5c7AFD78c7';
export const ROLLUP_BRIDGE_WITHDRAW_MANAGER_ADDRESS = '0x0B9bE3471eEB400Dcf0872D7795308a959E3FDa8';
export const ROLLUP_BRIDGE_ADMIN_MANAGER_ADDRESS = '0x845C23BA92cE8994079eAB7E7fD078e5269F647d';

export const ROLLUP_BRIDGE_CORE_ABI = [
  // Channel Management - Core Functions
  {
    inputs: [
      {
        components: [
          { name: 'targetContract', type: 'address' },
          { name: 'participants', type: 'address[]' },
          { name: 'timeout', type: 'uint256' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'openChannel',
    outputs: [{ name: 'channelId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'channelId', type: 'uint256' },
      { name: 'pkx', type: 'uint256' },
      { name: 'pky', type: 'uint256' },
    ],
    name: 'setChannelPublicKey',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // View Functions
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelState',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'channelId', type: 'uint256' },
      { name: 'participant', type: 'address' },
    ],
    name: 'isChannelParticipant',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'targetContract', type: 'address' }],
    name: 'isTargetContractAllowed',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelLeader',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelParticipants',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelTargetContract',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelTreeSize',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'channelId', type: 'uint256' },
      { name: 'participant', type: 'address' },
    ],
    name: 'getParticipantDeposit',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'channelId', type: 'uint256' },
      { name: 'participant', type: 'address' },
    ],
    name: 'getL2MptKey',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelTotalDeposits',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelPublicKey',
    outputs: [
      { name: 'pkx', type: 'uint256' },
      { name: 'pky', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'isChannelPublicKeySet',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelTimeout',
    outputs: [
      { name: 'openTimestamp', type: 'uint256' },
      { name: 'timeout', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getLeaderBond',
    outputs: [
      { name: 'bond', type: 'uint256' },
      { name: 'slashed', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nextChannelId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelInfo',
    outputs: [
      { name: 'targetContract', type: 'address' },
      { name: 'state', type: 'uint8' },
      { name: 'participantCount', type: 'uint256' },
      { name: 'initialRoot', type: 'bytes32' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'channelId', type: 'uint256' },
      { name: 'participant', type: 'address' },
    ],
    name: 'hasUserWithdrawn',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'isSignatureVerified',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'channelId', type: 'uint256' },
      { name: 'participant', type: 'address' },
    ],
    name: 'getWithdrawableAmount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getTreasuryAddress',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getTotalSlashedBonds',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelInitialStateRoot',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelFinalStateRoot',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'targetContract', type: 'address' }],
    name: 'getMaxAllowedParticipants',
    outputs: [{ name: 'maxParticipants', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'targetContract', type: 'address' }],
    name: 'getTargetContractData',
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'contractAddress', type: 'address' },
          { name: 'storageSlot', type: 'bytes1' },
        ],
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'targetContract', type: 'address' }],
    name: 'getPreAllocatedKeys',
    outputs: [{ name: 'keys', type: 'bytes32[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'targetContract', type: 'address' },
      { name: 'mptKey', type: 'bytes32' },
    ],
    name: 'getPreAllocatedLeaf',
    outputs: [
      { name: 'value', type: 'uint256' },
      { name: 'exists', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'targetContract', type: 'address' }],
    name: 'getPreAllocatedLeavesCount',
    outputs: [{ name: 'count', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelPreAllocatedLeavesCount',
    outputs: [{ name: 'count', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'channelId', type: 'uint256' },
      { indexed: false, name: 'targetContract', type: 'address' },
    ],
    name: 'ChannelOpened',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'channelId', type: 'uint256' },
      { indexed: false, name: 'pkx', type: 'uint256' },
      { indexed: false, name: 'pky', type: 'uint256' },
      { indexed: false, name: 'signerAddr', type: 'address' },
    ],
    name: 'ChannelPublicKeySet',
    type: 'event',
  },
];
