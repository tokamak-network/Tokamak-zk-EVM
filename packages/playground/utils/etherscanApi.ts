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
export const fetchTransactionBytecode = async (transactionId: string): Promise<string> => {
  try {
    const response = await axios.get(ETHERSCAN_API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_getTransactionByHash',
        txhash: transactionId,
        apikey: API_KEY,
      },
    });

    // Validate the response
    if (
      !response.data ||
      response.data.status === '0' ||
      !response.data.result ||
      !response.data.result.input
    ) {
      throw new Error('Transaction bytecode not found or invalid response from Etherscan.');
    }

    return response.data.result.input; // The bytecode is in the 'input' field.
  } catch (error) {
    console.error('Error fetching transaction bytecode:', error);
    throw new Error('Failed to fetch transaction bytecode. Please check the transaction ID and try again.');
  }
};
