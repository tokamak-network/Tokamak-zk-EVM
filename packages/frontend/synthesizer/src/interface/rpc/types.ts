export type SynthesizerBlockInfo = {
  coinBase: `0x${string}`,
  timeStamp: `0x${string}`,
  blockNumber: `0x${string}`,
  prevRanDao: `0x${string}`,
  gasLimit: `0x${string}`,
  chainId: `0x${string}`,
  selfBalance: `0x${string}`,
  baseFee: `0x${string}`,
  prevBlockHashes: `0x${string}`[],
}

export const ALCHEMY_API_KEY_ENV_KEY = 'ALCHEMY_API_KEY';
export const NETWORK_ENV_KEY = 'NETWORK';

export const ALCHEMY_RPC_URLS = {
  mainnet: 'https://eth-mainnet.g.alchemy.com/v2/',
  sepolia: 'https://eth-sepolia.g.alchemy.com/v2/',
} as const;

export type AlchemyNetwork = keyof typeof ALCHEMY_RPC_URLS;
