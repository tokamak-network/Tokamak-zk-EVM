/**
 * Calldata Helper Functions
 * Utilities for encoding ERC20 function calls
 */

import { concatBytes, hexToBytes, setLengthLeft } from '@ethereumjs/util';

/**
 * Encode ERC20 transfer function call
 * @param recipient - Recipient address (hex string with or without 0x)
 * @param amount - Amount to transfer (bigint or hex string)
 * @returns Calldata bytes
 */
export function encodeTransfer(recipient: string, amount: bigint | string): Uint8Array {
  const functionSelector = '0xa9059cbb'; // transfer(address,uint256)

  // Normalize recipient (remove 0x if present, pad to 32 bytes)
  const recipientHex = recipient.replace('0x', '');
  const recipientBytes = setLengthLeft(hexToBytes(`0x${recipientHex}`), 32);

  // Normalize amount
  const amountValue = typeof amount === 'string' ? BigInt(amount) : amount;
  const amountHex = amountValue.toString(16).padStart(64, '0');
  const amountBytes = hexToBytes(`0x${amountHex}`);

  return concatBytes(
    setLengthLeft(hexToBytes(functionSelector), 4),
    recipientBytes,
    amountBytes,
  );
}

/**
 * Encode ERC20 approve function call
 * @param spender - Spender address (hex string with or without 0x)
 * @param amount - Amount to approve (bigint or hex string)
 * @returns Calldata bytes
 */
export function encodeApprove(spender: string, amount: bigint | string): Uint8Array {
  const functionSelector = '0x095ea7b3'; // approve(address,uint256)

  // Normalize spender
  const spenderHex = spender.replace('0x', '');
  const spenderBytes = setLengthLeft(hexToBytes(`0x${spenderHex}`), 32);

  // Normalize amount
  const amountValue = typeof amount === 'string' ? BigInt(amount) : amount;
  const amountHex = amountValue.toString(16).padStart(64, '0');
  const amountBytes = hexToBytes(`0x${amountHex}`);

  return concatBytes(
    setLengthLeft(hexToBytes(functionSelector), 4),
    spenderBytes,
    amountBytes,
  );
}

/**
 * Encode ERC20 transferFrom function call
 * @param from - From address (hex string with or without 0x)
 * @param to - To address (hex string with or without 0x)
 * @param amount - Amount to transfer (bigint or hex string)
 * @returns Calldata bytes
 */
export function encodeTransferFrom(from: string, to: string, amount: bigint | string): Uint8Array {
  const functionSelector = '0x23b872dd'; // transferFrom(address,address,uint256)

  // Normalize addresses
  const fromHex = from.replace('0x', '');
  const fromBytes = setLengthLeft(hexToBytes(`0x${fromHex}`), 32);

  const toHex = to.replace('0x', '');
  const toBytes = setLengthLeft(hexToBytes(`0x${toHex}`), 32);

  // Normalize amount
  const amountValue = typeof amount === 'string' ? BigInt(amount) : amount;
  const amountHex = amountValue.toString(16).padStart(64, '0');
  const amountBytes = hexToBytes(`0x${amountHex}`);

  return concatBytes(
    setLengthLeft(hexToBytes(functionSelector), 4),
    fromBytes,
    toBytes,
    amountBytes,
  );
}

/**
 * Helper to convert amount with decimals to wei/smallest unit
 * @param amount - Amount in human-readable form (e.g., "100")
 * @param decimals - Token decimals (e.g., 18 for ETH/TON)
 * @returns Amount in wei (bigint)
 */
export function toWei(amount: string | number, decimals: number = 18): bigint {
  const amountStr = typeof amount === 'number' ? amount.toString() : amount;
  const [whole, fraction = ''] = amountStr.split('.');

  const wholeBigInt = BigInt(whole);
  const fractionPadded = fraction.padEnd(decimals, '0').slice(0, decimals);
  const fractionBigInt = BigInt(fractionPadded);

  return wholeBigInt * (10n ** BigInt(decimals)) + fractionBigInt;
}

/**
 * Helper to convert wei/smallest unit to human-readable amount
 * @param amount - Amount in wei (bigint)
 * @param decimals - Token decimals (e.g., 18 for ETH/TON)
 * @returns Amount in human-readable form (string)
 */
export function fromWei(amount: bigint, decimals: number = 18): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fractionStr}`;
}

