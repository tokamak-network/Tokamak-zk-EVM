import { ALCHEMY_API_KEY_ENV_KEY, ALCHEMY_RPC_URLS } from '../rpc/types.ts';

type GetRpcUrlFromEnvOptions = {
  envPath?: string;
};

const isAlchemyNetwork = (
  network: string,
): network is keyof typeof ALCHEMY_RPC_URLS => network in ALCHEMY_RPC_URLS;

export const getRpcUrlFromEnv = (
  network: string,
  env: NodeJS.ProcessEnv = process.env,
  options: GetRpcUrlFromEnvOptions = {},
): string => {
  const apiKey = env[ALCHEMY_API_KEY_ENV_KEY];
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    const message = `Environment variable ${ALCHEMY_API_KEY_ENV_KEY} must be set`;
    if (options.envPath) {
      throw new Error(`${message} in ${options.envPath}`);
    }
    throw new Error(message);
  }

  const normalizedNetwork = network.trim().toLowerCase();
  if (!isAlchemyNetwork(normalizedNetwork)) {
    throw new Error('network must be "mainnet" or "sepolia"');
  }
  const baseUrl = ALCHEMY_RPC_URLS[normalizedNetwork];
  if (!baseUrl) {
    throw new Error('network must be "mainnet" or "sepolia"');
  }
  return `${baseUrl}${apiKey}`;
};
