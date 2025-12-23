
// Required Circom constants (qap-compiler/scripts/constants.circom)
export const REQUIRED_CIRCOM_KEYS = [
  'nPubIn',
  'nPubOut',
  'nPrvIn',
  'nEVMIn',
  'nPoseidonInputs',
  'nMtDepth',
  'nAccumulation',
  'nPrevBlockHashes',
  'nJubjubExpBatch',
  'nSubExpBatch',
] as const;
export type CircomKey = typeof REQUIRED_CIRCOM_KEYS[number];

export type CircomConstMap = Record<CircomKey, number>;