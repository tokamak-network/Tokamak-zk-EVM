import fs from 'fs';
import { loadTokamakL2JsConstants } from './source.mjs';

const constantsPath = process.argv[2];
if (typeof constantsPath !== 'string' || constantsPath.length === 0) {
  throw new Error('Expected constants.circom path as the first argument.');
}

const { POSEIDON_INPUTS, MT_DEPTH } = loadTokamakL2JsConstants();
if (!Number.isInteger(POSEIDON_INPUTS) || !Number.isInteger(MT_DEPTH)) {
  throw new Error(`Invalid TokamakL2JS constants: POSEIDON_INPUTS=${POSEIDON_INPUTS}, MT_DEPTH=${MT_DEPTH}`);
}

const src = fs.readFileSync(constantsPath, 'utf8');

const readCurrentConstant = (source, name) => {
  const match = source.match(new RegExp(`function\\s+${name}\\s*\\(\\s*\\)\\s*\\{\\s*return\\s+(\\d+)\\s*;\\s*\\}`));
  if (match === null) {
    throw new Error(`Failed to read current ${name} from constants.circom.`);
  }

  return Number(match[1]);
};

const previousPoseidonInputs = readCurrentConstant(src, 'nPoseidonInputs');
const previousMtDepth = readCurrentConstant(src, 'nMtDepth');

let next = src;
let updatedPoseidonInputs = false;
let updatedMtDepth = false;
next = next.replace(
  /(function\s+nPoseidonInputs\s*\(\s*\)\s*\{\s*return\s+)\d+(\s*;\s*\})/,
  (_, prefix, suffix) => {
    updatedPoseidonInputs = true;
    return `${prefix}${POSEIDON_INPUTS}${suffix}`;
  }
);
next = next.replace(
  /(function\s+nMtDepth\s*\(\s*\)\s*\{\s*return\s+)\d+(\s*;\s*\})/,
  (_, prefix, suffix) => {
    updatedMtDepth = true;
    return `${prefix}${MT_DEPTH}${suffix}`;
  }
);

if (!updatedPoseidonInputs || !updatedMtDepth) {
  throw new Error('Failed to update constants.circom (pattern not found).');
}

fs.writeFileSync(constantsPath, next);

const poseidonStatus = previousPoseidonInputs === POSEIDON_INPUTS ? 'unchanged' : 'updated';
const mtDepthStatus = previousMtDepth === MT_DEPTH ? 'unchanged' : 'updated';

console.log(`[qap-compiler] Reloaded constants in ${constantsPath}`);
console.log(`[qap-compiler] nPoseidonInputs: ${previousPoseidonInputs} -> ${POSEIDON_INPUTS} (${poseidonStatus})`);
console.log(`[qap-compiler] nMtDepth: ${previousMtDepth} -> ${MT_DEPTH} (${mtDepthStatus})`);
