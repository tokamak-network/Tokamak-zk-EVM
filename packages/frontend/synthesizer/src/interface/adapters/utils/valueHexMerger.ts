/**
 * Utility function to merge upper and lower bits of properties with the same extSource and type
 * @param jsonData - Data from privateExternalInterface.json file
 * @returns A new array containing data with merged valueHex
 */
export function mergeValueHexPairs(jsonData: any): any[] {
  // Get the inPts array from privateInputBuffer
  const inPts = jsonData.privateInputBuffer.inPts;

  // Create an array to store the results
  const mergedData: any[] = [];

  // Set to track processed indices
  const processedIndices = new Set<number>();

  // Iterate through each item to find pairs to merge
  for (let i = 0; i < inPts.length; i++) {
    // Skip already processed indices
    if (processedIndices.has(i)) continue;

    const current = inPts[i];

    // Add items without extSource or type as is
    if (!current.extSource && !current.type && !current.extDest) {
      mergedData.push(current);
      processedIndices.add(i);
      continue;
    }

    // Check if the next item has the same extSource/extDest and type
    let found = false;
    for (let j = i + 1; j < inPts.length; j++) {
      const next = inPts[j];

      // Next item must also have extSource/extDest and type
      if (
        (!current.extSource && !current.extDest) ||
        (!next.extSource && !next.extDest) ||
        !current.type ||
        !next.type
      )
        continue;

      // Check if extSource/extDest and type are the same
      const sameSource =
        (current.extSource &&
          next.extSource &&
          current.extSource === next.extSource) ||
        (current.extDest && next.extDest && current.extDest === next.extDest);
      const sameType = current.type === next.type;
      const sameKey =
        (!current.key && !next.key) ||
        (current.key && next.key && current.key === next.key);

      if (sameSource && sameType && sameKey) {
        // Merge upper bits (next) and lower bits (current)
        const lowerBits = current.valueHex.substring(2); // Remove '0x'
        const upperBits = next.valueHex.substring(2); // Remove '0x'
        const mergedValueHex = `0x${upperBits}${lowerBits}`;

        // Create merged data
        const mergedItem = {
          ...current,
          valueHex: mergedValueHex,
          merged: true, // Mark as merged
          originalLower: current.valueHex,
          originalUpper: next.valueHex,
        };

        mergedData.push(mergedItem);
        processedIndices.add(i);
        processedIndices.add(j);
        found = true;
        break;
      }
    }

    // Add the item as is if no pair is found
    if (!found) {
      mergedData.push(current);
      processedIndices.add(i);
    }
  }

  return mergedData;
}

/**
 * Function to process all inPts and outPts in the entire JSON data
 * @param {Object} jsonData - Data from privateExternalInterface.json file
 * @returns {Object} New JSON data with merged valueHex
 */
export function processJsonData(jsonData: any) {
  const result = JSON.parse(JSON.stringify(jsonData)); // Deep copy

  // Process privateInputBuffer's inPts
  if (result.privateInputBuffer && result.privateInputBuffer.inPts) {
    result.privateInputBuffer.inPts = mergeValueHexPairs(jsonData);
  }

  // Process privateOutputBuffer's inPts
  if (result.privateOutputBuffer && result.privateOutputBuffer.inPts) {
    const outputData = {
      privateInputBuffer: { inPts: result.privateOutputBuffer.inPts },
    };
    result.privateOutputBuffer.inPts = mergeValueHexPairs(outputData);
  }

  // Process privateOutputBuffer's outPts
  if (result.privateOutputBuffer && result.privateOutputBuffer.outPts) {
    const outputData = {
      privateInputBuffer: { inPts: result.privateOutputBuffer.outPts },
    };
    result.privateOutputBuffer.outPts = mergeValueHexPairs(outputData);
  }

  return result;
}
