const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  PREPROCESS_INPUT_RULES,
  PROVE_INPUT_RULES,
  VERIFY_INPUT_RULES,
  PREPROCESS_REQUIRED_FILES,
  PROVE_REQUIRED_FILES,
  VERIFY_REQUIRED_FILES,
  PROOF_BUNDLE_REQUIRED_FILES,
  backendPreprocessArgs,
  backendProveArgs,
  backendVerifyArgs,
} = require('../dist/cli.js');

const paths = {
  setupOutputDir: path.join(path.sep, 'crs'),
  synthOutputDir: path.join(path.sep, 'synth'),
  preprocessOutputDir: path.join(path.sep, 'preprocess'),
  proveOutputDir: path.join(path.sep, 'prove'),
};

function filenames(files) {
  return files.map(({ filename }) => filename);
}

test('CLI stages use the current synthesizer, CRS, and binary artifact contract', () => {
  assert.deepEqual(PREPROCESS_INPUT_RULES[0].requiredFiles, ['selector.json', 'permutation.json', 'instance.json']);
  assert.deepEqual(PROVE_INPUT_RULES[0].requiredFiles, [
    'selector.json',
    'instance.json',
    'permutation.json',
    'placementVariables.json',
  ]);
  assert.deepEqual(VERIFY_INPUT_RULES.map(({ requiredFiles }) => requiredFiles), [
    ['univariate_proof.bin'],
    ['univariate_verifier_preprocess.bin'],
    ['instance.json'],
  ]);

  assert.deepEqual(filenames(PREPROCESS_REQUIRED_FILES), [
    'preprocess_keys.rkyv',
    'crs_provenance.json',
    'selector.json',
    'permutation.json',
    'instance.json',
  ]);
  assert.deepEqual(filenames(PROVE_REQUIRED_FILES), [
    'tau_sequence.rkyv',
    'prover_keys.rkyv',
    'crs_provenance.json',
    'selector.json',
    'instance.json',
    'permutation.json',
    'placementVariables.json',
  ]);
  assert.deepEqual(filenames(VERIFY_REQUIRED_FILES), [
    'univariate_verifier_preprocess.bin',
    'univariate_proof.bin',
    'instance.json',
  ]);
  assert.deepEqual(filenames(PROOF_BUNDLE_REQUIRED_FILES), [
    'instance.json',
    'univariate_verifier_preprocess.bin',
    'univariate_proof.bin',
  ]);
});

test('CLI assembles the current backend command interfaces', () => {
  assert.deepEqual(backendPreprocessArgs(paths, paths.preprocessOutputDir), [
    '--keys',
    paths.setupOutputDir,
    '--synthesizer-stat',
    paths.synthOutputDir,
    '--output',
    paths.preprocessOutputDir,
  ]);
  assert.deepEqual(backendProveArgs(paths, paths.proveOutputDir), [
    '--tau-sequence',
    path.join(paths.setupOutputDir, 'tau_sequence.rkyv'),
    '--keys',
    paths.setupOutputDir,
    '--synthesizer-stat',
    paths.synthOutputDir,
    '--output',
    paths.proveOutputDir,
  ]);
  assert.deepEqual(backendVerifyArgs(paths), [
    '--preprocess',
    path.join(paths.preprocessOutputDir, 'univariate_verifier_preprocess.bin'),
    '--proof',
    path.join(paths.proveOutputDir, 'univariate_proof.bin'),
    '--instance',
    path.join(paths.synthOutputDir, 'instance.json'),
  ]);
});
