import fs from 'fs';
import { FUNCTION_INPUT_LENGTH, POSEIDON_INPUTS } from 'tokamak-l2js';

const constantsPath = process.argv[2];
if (typeof constantsPath !== 'string' || constantsPath.length === 0) {
  throw new Error('Expected constants.circom path as the first argument.');
}

if (!Number.isInteger(FUNCTION_INPUT_LENGTH) || FUNCTION_INPUT_LENGTH < 0) {
  throw new Error(
    `Invalid TokamakL2JS constant: FUNCTION_INPUT_LENGTH=${FUNCTION_INPUT_LENGTH}`,
  );
}
if (!Number.isInteger(POSEIDON_INPUTS)) {
  throw new Error(`Invalid TokamakL2JS constant: POSEIDON_INPUTS=${POSEIDON_INPUTS}`);
}

const src = fs.readFileSync(constantsPath, 'utf8');

const readCurrentConstant = (source, name) => {
  const match = source.match(new RegExp(`function\\s+${name}\\s*\\(\\s*\\)\\s*\\{\\s*return\\s+(\\d+)\\s*;\\s*\\}`));
  if (match === null) {
    throw new Error(`Failed to read current ${name} from constants.circom.`);
  }

  return Number(match[1]);
};

const previousPrivateMessageInputs = readCurrentConstant(src, 'nPrivateMessageInputs');
const previousPoseidonInputs = readCurrentConstant(src, 'nPoseidonInputs');

let next = src;
let updatedPrivateMessageInputs = false;
next = next.replace(
  /(function\s+nPrivateMessageInputs\s*\(\s*\)\s*\{\s*return\s+)\d+(\s*;\s*\})/,
  (_, prefix, suffix) => {
    updatedPrivateMessageInputs = true;
    return `${prefix}${FUNCTION_INPUT_LENGTH}${suffix}`;
  }
);

let updatedPoseidonInputs = false;
next = next.replace(
  /(function\s+nPoseidonInputs\s*\(\s*\)\s*\{\s*return\s+)\d+(\s*;\s*\})/,
  (_, prefix, suffix) => {
    updatedPoseidonInputs = true;
    return `${prefix}${POSEIDON_INPUTS}${suffix}`;
  }
);

if (!updatedPrivateMessageInputs || !updatedPoseidonInputs) {
  throw new Error('Failed to update constants.circom (pattern not found).');
}

fs.writeFileSync(constantsPath, next);

const privateMessageStatus = previousPrivateMessageInputs === FUNCTION_INPUT_LENGTH
  ? 'unchanged'
  : 'updated';
const poseidonStatus = previousPoseidonInputs === POSEIDON_INPUTS ? 'unchanged' : 'updated';

console.log(`[qap-compiler] Reloaded constants in ${constantsPath}`);
console.log(
  `[qap-compiler] nPrivateMessageInputs: ${previousPrivateMessageInputs} -> ${FUNCTION_INPUT_LENGTH} (${privateMessageStatus})`,
);
console.log(`[qap-compiler] nPoseidonInputs: ${previousPoseidonInputs} -> ${POSEIDON_INPUTS} (${poseidonStatus})`);
