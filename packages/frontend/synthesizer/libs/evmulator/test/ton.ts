const storageLayout = {
  slots: [
    {
      name: '_balances',
      type: 'mapping(address => uint256)',
      slot: 0,
      offset: 0
    },
    {
      name: '_allowances',
      type: 'mapping(address => mapping(address => uint256))',
      slot: 1,
      offset: 0
    },
    {
      name: '_totalSupply',
      type: 'uint256',
      slot: 2,
      offset: 0
    },
    {
      name: 'seigManager',
      type: 'address',
      slot: 3,
      offset: 0
    },
    {
      name: 'callbackEnabled',
      type: 'bool',
      slot: 4,
      offset: 0
    },
    {
      name: '_name',
      type: 'string',
      slot: 5,
      offset: 0
    },
    {
      name: '_symbol',
      type: 'string',
      slot: 6,
      offset: 0
    },
    {
      name: '_decimals',
      type: 'uint8',
      slot: 7,
      offset: 0
    },
    {
      name: '_owner',
      type: 'address',
      slot: 8,
      offset: 0
    }
  ],
  types: {
    'mapping(address => uint256)': {
      encoding: 'inplace',
      label: 'mapping(address => uint256)',
      numberOfBytes: '32'
    },
    'mapping(address => mapping(address => uint256))': {
      encoding: 'inplace',
      label: 'mapping(address => mapping(address => uint256))',
      numberOfBytes: '32'
    },
    'uint256': {
      encoding: 'inplace',
      label: 'uint256',
      numberOfBytes: '32'
    },
    'uint8': {
      encoding: 'inplace',
      label: 'uint8',
      numberOfBytes: '1'
    },
    'bool': {
      encoding: 'inplace',
      label: 'bool',
      numberOfBytes: '1'
    },
    'string': {
      encoding: 'bytes',
      label: 'string',
      numberOfBytes: '32'
    },
    'address': {
      encoding: 'inplace',
      label: 'address',
      numberOfBytes: '20'
    }
  }
};