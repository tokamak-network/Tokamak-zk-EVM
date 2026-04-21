import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

import builderModule from "./wasm/witness_calculator.js";
import { split256BitInteger } from "./helper_functions.js";
import { ArithmeticOperations } from "../../../synthesizer/src/synthesizer/dataStructure/arithmeticOperations.ts";

type WitnessCalculator = {
  calculateWitness: (input: Record<string, bigint[]>, sanityCheck?: boolean) => Promise<unknown[]>;
};

const builder = builderModule as (code: Uint8Array, options?: unknown) => Promise<WitnessCalculator>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SELECTOR_BY_DEPTH: Record<number, bigint> = {
  1: 1n,
  2: 2n,
  3: 4n,
  4: 8n,
  5: 16n,
  6: 32n,
};

const VERIFY_BY_DEPTH: Record<number, (inVals: bigint[]) => bigint[]> = {
  1: ArithmeticOperations.verifyMerkleProof,
  2: ArithmeticOperations.verifyMerkleProof2x,
  3: ArithmeticOperations.verifyMerkleProof3x,
  4: ArithmeticOperations.verifyMerkleProof4x,
  5: ArithmeticOperations.verifyMerkleProof5x,
  6: ArithmeticOperations.verifyMerkleProof6x,
};

type ParentNode = {
  parent: bigint;
  parentIndex: bigint;
};

const loadWitnessCalculator = async (): Promise<WitnessCalculator> => {
  const subcircuitInfoPath = path.join(__dirname, "../library/subcircuitInfo.json");
  const subcircuitInfo = JSON.parse(readFileSync(subcircuitInfoPath, "utf8")) as Array<{ id: number; name: string }>;
  const merkleProofInfo = subcircuitInfo.find((entry) => entry.name === "VerifyMerkleProof");
  if (merkleProofInfo === undefined) {
    throw new Error("VerifyMerkleProof subcircuit was not found in subcircuitInfo.json");
  }

  const wasmPath = path.join(__dirname, `../library/wasm/subcircuit${merkleProofInfo.id}.wasm`);
  return builder(readFileSync(wasmPath));
};

const computeParentNode = (childIndex: bigint, child: bigint, sibling: bigint): ParentNode => {
  const children = childIndex % 2n === 0n ? [child, sibling] : [sibling, child];
  return {
    parent: ArithmeticOperations.poseidonN(children),
    parentIndex: childIndex / 2n,
  };
};

const buildProof = (childIndex: bigint, leaf: bigint, siblings: bigint[]): ParentNode[] => {
  const proof: ParentNode[] = [];
  let currentIndex = childIndex;
  let currentNode = leaf;

  for (const sibling of siblings) {
    const nextNode = computeParentNode(currentIndex, currentNode, sibling);
    proof.push(nextNode);
    currentIndex = nextNode.parentIndex;
    currentNode = nextNode.parent;
  }

  return proof;
};

const encodeCircuitInput = (
  selector: bigint,
  childIndex: bigint,
  child: bigint,
  siblings: bigint[],
  parentIndex: bigint,
  parent: bigint,
): bigint[] => {
  const paddedSiblings = siblings.concat(Array.from({ length: 6 - siblings.length }, () => 0n));

  return [
    selector,
    ...split256BitInteger(childIndex),
    ...split256BitInteger(child),
    ...paddedSiblings.flatMap((sibling) => split256BitInteger(sibling)),
    ...split256BitInteger(parentIndex),
    ...split256BitInteger(parent),
  ];
};

const expectWitnessFailure = async (
  witnessCalculator: WitnessCalculator,
  encodedInput: bigint[],
): Promise<void> => {
  let failed = false;
  try {
    await witnessCalculator.calculateWitness({ in: encodedInput }, true);
  } catch {
    failed = true;
  }
  assert.equal(failed, true, "witness generation was expected to fail");
};

const main = async (): Promise<void> => {
  const witnessCalculator = await loadWitnessCalculator();

  const childIndex = 45n;
  const leaf = 12345678901234567890n;
  const siblings = [
    11n,
    22n,
    33n,
    44n,
    55n,
    66n,
  ];

  const proof = buildProof(childIndex, leaf, siblings);

  for (let depth = 1; depth <= 6; depth++) {
    const compactInput = [
      childIndex,
      leaf,
      ...siblings.slice(0, depth),
      proof[depth - 1].parentIndex,
      proof[depth - 1].parent,
    ];

    VERIFY_BY_DEPTH[depth](compactInput);

    const encodedInput = encodeCircuitInput(
      SELECTOR_BY_DEPTH[depth],
      childIndex,
      leaf,
      siblings.slice(0, depth),
      proof[depth - 1].parentIndex,
      proof[depth - 1].parent,
    );
    const witness = await witnessCalculator.calculateWitness({ in: encodedInput }, true);
    assert.ok(witness.length > 0, `selector depth ${depth} did not produce a witness`);
    console.log(`VerifyMerkleProof selector ${depth}x passed`);
  }

  const invalidCompactInput = [
    childIndex,
    leaf,
    ...siblings.slice(0, 6),
    proof[5].parentIndex,
    proof[5].parent + 1n,
  ];

  let offCircuitFailed = false;
  try {
    ArithmeticOperations.verifyMerkleProof6x(invalidCompactInput);
  } catch {
    offCircuitFailed = true;
  }
  assert.equal(offCircuitFailed, true, "off-circuit verification was expected to fail");

  const invalidEncodedInput = encodeCircuitInput(
    SELECTOR_BY_DEPTH[6],
    childIndex,
    leaf,
    siblings,
    proof[5].parentIndex,
    proof[5].parent + 1n,
  );
  await expectWitnessFailure(witnessCalculator, invalidEncodedInput);
  console.log("VerifyMerkleProof invalid parent test passed");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
