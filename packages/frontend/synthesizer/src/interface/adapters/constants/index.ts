// Modular Contract addresses - Updated for new architecture
export const ROLLUP_BRIDGE_CORE_ADDRESS = '0x9439df86d91a7a05d926c15ee8f9790b60410133';
export const ROLLUP_BRIDGE_DEPOSIT_MANAGER_ADDRESS = '0x24d302f09840275371ff1985d0f23df16c69e90b';
export const ROLLUP_BRIDGE_PROOF_MANAGER_ADDRESS = '0x84b0676fdc944187214d774681aa135b481d7c12';
export const ROLLUP_BRIDGE_WITHDRAW_MANAGER_ADDRESS = '0x0048fc775cfd21b24bd53652bd8b3796c5f26a83';
export const ROLLUP_BRIDGE_ADMIN_MANAGER_ADDRESS = '0x374c2a109c59c60e18af161f263689520ebd6932';
export const DEPOSIT_MANAGER_PROXY_ADDRESS = '0x24d302f09840275371ff1985d0f23df16c69e90b';

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
