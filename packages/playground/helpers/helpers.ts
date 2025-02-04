// src/helpers/helpers.ts

// Convert a hex string to a decimal string.
export const getValueDecimal = (hexValue: string): string => {
    if (!hexValue) return "";
    try {
      // Ensure the hex string starts with '0x'
      const cleanHex = hexValue.startsWith("0x") ? hexValue : "0x" + hexValue;
      return BigInt(cleanHex).toString(10);
    } catch (error) {
      return "";
    }
  };
  
  // Return the full hexadecimal string (without truncation).
  export const summarizeHex = (value: any): string => {
    let hex = value;
    if (typeof hex !== 'string') {
      if (hex instanceof Buffer) {
        hex = hex.toString('hex');
      } else if (typeof hex === 'number' || typeof hex === 'bigint') {
        hex = hex.toString(16);
      } else {
        hex = String(hex);
      }
    }
    return hex;
  };
  
  // Serialize the placements object into JSON.
  export const serializePlacements = (placements: any): string => {
    const convertValue = (val: any): any => {
      if (typeof val === 'bigint') {
        return val.toString();
      }
      if (Array.isArray(val)) {
        return val.map(convertValue);
      }
      if (typeof val === 'object' && val !== null) {
        return Object.fromEntries(
          Object.entries(val).map(([k, v]) => [k, convertValue(v)])
        );
      }
      return val;
    };
    return JSON.stringify({ placements: convertValue(placements) });
  };
  