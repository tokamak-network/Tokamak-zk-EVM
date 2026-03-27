import { ALCHEMY_API_KEY_ENV_KEY, ALCHEMY_RPC_URLS, RPC_URL_ENV_KEY } from '../rpc/types.ts';

type GetRpcUrlFromEnvOptions = {
  envPath?: string;
};

export const getRpcUrlFromEnv = (
  network: string,
  env: NodeJS.ProcessEnv = process.env,
  options: GetRpcUrlFromEnvOptions = {},
): string => {
  const directRpcUrl = env[RPC_URL_ENV_KEY];
  if (typeof directRpcUrl === 'string' && directRpcUrl.trim().length > 0) {
    return directRpcUrl.trim();
  }

  const apiKey = env[ALCHEMY_API_KEY_ENV_KEY];
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    const message = `Environment variable ${RPC_URL_ENV_KEY} or ${ALCHEMY_API_KEY_ENV_KEY} must be set`;
    if (options.envPath) {
      throw new Error(`${message} in ${options.envPath}`);
    }
    throw new Error(message);
  }

  const normalizedNetwork = network.trim().toLowerCase();
  const baseUrl = ALCHEMY_RPC_URLS[normalizedNetwork as keyof typeof ALCHEMY_RPC_URLS];
  if (!baseUrl) {
    throw new Error('network must be "mainnet" or "sepolia"');
  }
  return `${baseUrl}${apiKey}`;
};
