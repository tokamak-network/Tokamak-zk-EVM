// import { ArithmeticOperator } from "./arithmetic.ts";




// /**
//  * @property {number} subcircuitId - Identifier of the subcircuit.
//  * @property {number} nWire - Number of wires in the subcircuit.
//  * @property {number} outIdx - Output index.
//  * @property {number} nOut - Number of outputs.
//  * @property {number} inIdx - Input index.
//  * @property {number} nIn - Number of inputs.
//  */
// export type SubcircuitCode = {
//   subcircuitId: number;
//   nWire: number;
//   outIdx: number;
//   nOut: number;
//   inIdx: number;
//   nIn: number;
// };

// /**
//  * @property {number} code - Subcircuit code.
//  * @property {string} name - Subcircuit name.
//  * @property {number} nWire - Number of wires in the subcircuit.
//  * @property {number} outIdx - Output index.
//  * @property {number} nOut - Number of outputs.
//  * @property {number} inIdx - Input index.
//  * @property {number} nIn - Number of inputs.
//  */
// export type SubcircuitId = {
//   code: number;
//   name: string;
//   nWire: number;
//   outIdx: number;
//   nOut: number;
//   inIdx: number;
//   nIn: number;
// };



// // Wire mapping types for better type safety

// // Extended version with required flattenMap for runtime use
// export type SubcircuitInfoWithFlattenMap = Omit<
//   SubcircuitInfoByNameEntry,
//   'flattenMap'
// > & {
//   flattenMap: number[];
// };

// // Type guard to check if subcircuit has flattenMap
// export function hasValidFlattenMap(
//   subcircuit: SubcircuitInfoByNameEntry,
// ): subcircuit is SubcircuitInfoWithFlattenMap {
//   return (
//     Array.isArray(subcircuit.flattenMap) && subcircuit.flattenMap.length > 0
//   );
// }


// // Type guard to check if a string is a valid SubcircuitNames
// // export function isValidSubcircuitName(name: string): name is SubcircuitNames {
// //   const validNames: SubcircuitNames[] = [
// //     'bufferPubOut',
// //     'bufferPubIn',
// //     'bufferPrvOut',
// //     'bufferPrvIn',
// //     'ALU1',
// //     'ALU2',
// //     'ALU3',
// //     'ALU4',
// //     'ALU5',
// //     'AND',
// //     'OR',
// //     'XOR',
// //     'DecToBit',
// //     'Accumulator',
// //   ];
// //   return validNames.includes(name as SubcircuitNames);
// // }
