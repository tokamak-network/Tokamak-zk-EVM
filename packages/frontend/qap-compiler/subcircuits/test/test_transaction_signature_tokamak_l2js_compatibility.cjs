const assert = require('node:assert/strict');

const { eddsaVerify } = require('tokamak-l2js');

const { createTransactionSignatureCorpus } = require('./transaction_signature_verify_oracle.cjs');

const SIGNATURE_ONLY_ACCEPTANCE_OVERRIDES = new Set([
  'reject-oversized-contract-address',
  'delegate-oversized-function-selector-rejection',
  'delegate-noncanonical-signature-field-rejection',
  'delegate-aliased-identity-encoding-rejection',
]);

const toWordBytes = value => {
  if (value < 0n || value >= 1n << 256n) {
    throw new Error(`Cannot encode ${value} as one unsigned 256-bit word`);
  }

  const bytes = new Uint8Array(32);
  let remaining = value;
  for (let index = bytes.length - 1; index >= 0; index--) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
};

const main = () => {
  const corpus = createTransactionSignatureCorpus();

  for (const vector of corpus) {
    const expected = vector.expected.complete || SIGNATURE_ONLY_ACCEPTANCE_OVERRIDES.has(vector.id);
    const actual = eddsaVerify(
      vector.messageWords.map(toWordBytes),
      vector.publicKey,
      vector.randomizer,
      vector.signature,
    );

    assert.equal(actual, expected, vector.id);
  }

  console.log(`TokamakL2JS verifier matched all ${corpus.length} transaction-signature policy vectors`);
};

main();
