import axios from 'axios';

const ETHERSCAN_API_URL = 'https://api.etherscan.io/api';
const API_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY;

/**
 * Fetches the bytecode of a transaction by its hash using the Etherscan API.
 *
 * @param transactionId - The hash of the transaction to fetch the bytecode for.
 * @returns The transaction bytecode as a hexadecimal string.
 * @throws Error if the bytecode cannot be retrieved or the transaction is invalid.
 */
export const fetchTransactionBytecode = async (transactionId: string): Promise<{bytecode: string, from: string, to: string}> => {
  try {
    const response = await axios.get(ETHERSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_getTransactionByHash',
        txhash: transactionId,
        apikey: API_KEY,
      },
    });

    console.log("response", response);


    // Validate the response
    if (
      !response.data ||
      response.data.status === '0' ||
      !response.data.result ||
      !response.data.result.input
    ) {
      throw new Error('Transaction bytecode not found or invalid response from Etherscan.');
    }

    return {
      bytecode: response.data.result.input,
      from: response.data.result.from,
      to: response.data.result.to
    }; // The bytecode is in the 'input' field.
  } catch (error) {
    console.error('Error fetching transaction bytecode:', error);
    throw new Error('Failed to fetch transaction bytecode. Please check the transaction ID and try again.');
  }
};

export const fetchContractCode = async (address: string): Promise<string> => {
  try {
    const response = await axios.get(ETHERSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_getCode',
        address: address,
        tag: 'latest',
        apikey: API_KEY,
      },
    });

    if (
      !response.data ||
      response.data.status === '0' ||
      !response.data.result
    ) {
      throw new Error('Contract code not found or invalid response from Etherscan.');
    }

    return response.data.result;
  } catch (error) {
    console.error('Error fetching contract code:', error);
    throw new Error('Failed to fetch contract code from Etherscan.');
  }
};

export const getBalanceSlot = async (address: string): Promise<string> => {
  try {
    const response = await axios.get(ETHERSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_getStorageAt',
        address: address,
        position: '0',  // Start with slot 0
        tag: 'latest',
        apikey: API_KEY,
      },
    });

    if (!response.data || response.data.status === '0' || !response.data.result) {
      throw new Error('Storage data not found or invalid response from Etherscan.');
    }

    // For ERC20 tokens, balance mapping is typically at slot 0
    // For more complex contracts, we'd need to analyze the contract's storage layout
    return '0';

  } catch (error) {
    console.error('Error fetching storage slot:', error);
    throw new Error('Failed to fetch storage data from Etherscan.');
  }
};