export type { SynthesizerInputBlockInfo } from '../../../core/src/synthesizer.ts';

export const ALCHEMY_API_KEY_ENV_KEY = 'ALCHEMY_API_KEY';
export const NETWORK_ENV_KEY = 'NETWORK';

export const ALCHEMY_RPC_URLS = {
  mainnet: 'https://eth-mainnet.g.alchemy.com/v2/',
  sepolia: 'https://eth-sepolia.g.alchemy.com/v2/',
} as const;

export type AlchemyNetwork = keyof typeof ALCHEMY_RPC_URLS;
