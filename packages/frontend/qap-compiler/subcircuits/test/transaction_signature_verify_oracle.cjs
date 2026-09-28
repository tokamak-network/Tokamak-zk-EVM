const { jubjub } = require("@noble/curves/misc.js");
const { poseidon2 } = require("poseidon-bls12381");
const { eddsaSign, FUNCTION_INPUT_LENGTH } = require("tokamak-l2js");

const FIELD_PRIME = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;
const SCALAR_ORDER = jubjub.Point.Fn.ORDER;
const CIRCUIT_SCALAR_LIMIT = 1n << 252n;
const PRIVATE_KEY = 7n;
const RANDOMIZER_SCALAR = 11n;
const MESSAGE_WORD_COUNT = FUNCTION_INPUT_LENGTH + 3;
const CHALLENGE_INPUT_COUNT = FUNCTION_INPUT_LENGTH + 7;
const ORIGIN_MASK = (1n << 160n) - 1n;
const CONTRACT_ADDRESS_LIMIT = 1n << 160n;
const FUNCTION_SELECTOR_LIMIT = 1n << 32n;

const DISPOSITIONS = Object.freeze({
  VALID_COMPLETE_STATEMENT: "valid-complete-statement",
  CIRCUIT_LOCAL_REJECTION: "circuit-local-rejection",
  DELEGATED_PUBLIC_REJECTION: "delegated-public-rejection",
});

const POLICY = Object.freeze({
  equation: "[8S]G = [8]R + [8h]A",
  mixedOrderPublicKey: "accept-when-[8]A-is-not-identity",
  nonIdentitySmallOrderRandomizer: "accept",
  identityRandomizer: "reject",
  responseScalarRange: "delegated-public-0<=S<n",
  contractAddressRange: "circuit-local-0<=contract<2^160",
  functionSelectorRange: "delegated-public-0<=selector<2^32",
  identityEncoding: "delegated-public-O=[[0,0],[1,0]]",
});

const freezePublicBoundary = (publicBoundary) => Object.freeze({
  contractAddress: publicBoundary.contractAddress,
  functionSelector: publicBoundary.functionSelector,
  S: publicBoundary.S,
  O: Object.freeze([...publicBoundary.O]),
});

const createPublicBoundary = ({ messageWords, signature }) => (
  freezePublicBoundary({
    contractAddress: messageWords[1],
    functionSelector: messageWords[2],
    S: signature,
    O: [0n, 1n],
  })
);

const getPublicWords = ({ contractAddress, functionSelector, S, O }) => [
  contractAddress,
  functionSelector,
  S,
  O[0],
  O[1],
];

const normalizeField = (value) => {
  const normalized = value % FIELD_PRIME;
  return normalized < 0n ? normalized + FIELD_PRIME : normalized;
};

const poseidonChainCompress = (values) => {
  if (values.length < 2) {
    throw new Error("Transaction-signature challenge requires at least two inputs");
  }

  let accumulator = poseidon2([values[0], values[1]]);
  for (let index = 2; index < values.length; index++) {
    accumulator = poseidon2([accumulator, values[index]]);
  }
  return accumulator;
};

const toWordBytes = (value) => {
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

const makeMessageWords = () => {
  const words = Array.from(
    { length: MESSAGE_WORD_COUNT },
    (_, index) => BigInt(index + 1) * 0x10000000000000001n,
  );
  words[1] = 0x111122223333444455556666777788889999aaaAn;
  words[2] = 0xa9059cbbn;
  return words;
};

const getChallengeInputs = ({ publicKey, randomizer, messageWords }) => {
  if (messageWords.length !== MESSAGE_WORD_COUNT) {
    throw new Error(
      `Expected ${MESSAGE_WORD_COUNT} signed message words, received ${messageWords.length}`,
    );
  }

  const publicKeyAffine = publicKey.toAffine();
  const randomizerAffine = randomizer.toAffine();
  return [
    randomizerAffine.x,
    randomizerAffine.y,
    publicKeyAffine.x,
    publicKeyAffine.y,
    ...messageWords,
  ];
};

const getChallenge = (statement) => poseidonChainCompress(
  getChallengeInputs(statement),
);

const calculateOrigin = (publicKey) => {
  const affine = publicKey.toAffine();
  return poseidon2([affine.x, affine.y]) & ORIGIN_MASK;
};

const validatePoint = (point) => {
  try {
    point.assertValidity();
    return true;
  } catch {
    return false;
  }
};

const hasExpectedMessageLength = (messageWords) => {
  return messageWords.length === MESSAGE_WORD_COUNT;
};

const evaluateCircuitStatement = (statement) => {
  const {
    publicBoundary,
    publicKey,
    randomizer,
    messageWords,
    signature,
  } = statement;

  if (
    normalizeField(publicBoundary.contractAddress) !== normalizeField(messageWords[1])
    || normalizeField(publicBoundary.functionSelector) !== normalizeField(messageWords[2])
    || normalizeField(publicBoundary.S) !== normalizeField(signature)
    || normalizeField(publicBoundary.O[0]) !== 0n
    || normalizeField(publicBoundary.O[1]) !== 1n
  ) {
    return Object.freeze({ accepted: false, reason: "public-boundary-field-binding" });
  }

  if (!hasExpectedMessageLength(messageWords)) {
    return Object.freeze({ accepted: false, reason: "private-message-length" });
  }
  if (normalizeField(messageWords[1]) >= CONTRACT_ADDRESS_LIMIT) {
    return Object.freeze({ accepted: false, reason: "contract-address-range" });
  }
  if (signature < 0n || signature >= CIRCUIT_SCALAR_LIMIT) {
    return Object.freeze({ accepted: false, reason: "response-scalar-bit-width" });
  }
  if (!validatePoint(publicKey)) {
    return Object.freeze({ accepted: false, reason: "public-key-curve" });
  }
  if (!validatePoint(randomizer)) {
    return Object.freeze({ accepted: false, reason: "randomizer-curve" });
  }
  if (publicKey.isSmallOrder()) {
    return Object.freeze({ accepted: false, reason: "public-key-small-order" });
  }
  if (randomizer.equals(jubjub.Point.ZERO)) {
    return Object.freeze({ accepted: false, reason: "randomizer-identity" });
  }

  const challenge = getChallenge(statement);
  const residual = randomizer
    .add(publicKey.multiplyUnsafe(challenge % SCALAR_ORDER))
    .subtract(jubjub.Point.BASE.multiplyUnsafe(signature % SCALAR_ORDER));
  if (!residual.clearCofactor().equals(jubjub.Point.ZERO)) {
    return Object.freeze({ accepted: false, reason: "cofactored-equation" });
  }

  return Object.freeze({
    accepted: true,
    reason: "accepted",
    challenge,
    origin: calculateOrigin(publicKey),
  });
};

const evaluateDelegatedPublicBoundary = ({
  messageWords,
  publicBoundary,
  signature,
}) => {
  if (getPublicWords(publicBoundary).some(
    (value) => value < 0n || value >= FIELD_PRIME,
  )) {
    return Object.freeze({ accepted: false, reason: "public-field-range" });
  }
  if (publicBoundary.S !== signature) {
    return Object.freeze({ accepted: false, reason: "response-scalar-binding" });
  }
  if (publicBoundary.contractAddress !== messageWords[1]) {
    return Object.freeze({ accepted: false, reason: "contract-address-binding" });
  }
  if (publicBoundary.functionSelector !== messageWords[2]) {
    return Object.freeze({ accepted: false, reason: "function-selector-binding" });
  }
  if (
    publicBoundary.O[0] !== 0n
    || publicBoundary.O[1] !== 1n
  ) {
    return Object.freeze({ accepted: false, reason: "identity-binding" });
  }
  if (signature < 0n || signature >= SCALAR_ORDER) {
    return Object.freeze({ accepted: false, reason: "response-scalar-range" });
  }
  if (messageWords[2] < 0n || messageWords[2] >= FUNCTION_SELECTOR_LIMIT) {
    return Object.freeze({ accepted: false, reason: "function-selector-range" });
  }
  return Object.freeze({ accepted: true, reason: "accepted" });
};

const evaluateCompleteStatement = (statement) => {
  const circuit = evaluateCircuitStatement(statement);
  const delegatedPublic = evaluateDelegatedPublicBoundary(statement);
  return Object.freeze({
    accepted: circuit.accepted && delegatedPublic.accepted,
    circuit,
    delegatedPublic,
  });
};

const signatureFor = ({
  publicKey,
  randomizer,
  messageWords,
  privateKey = PRIVATE_KEY,
  randomizerScalar = RANDOMIZER_SCALAR,
}) => (
  randomizerScalar + getChallenge({ publicKey, randomizer, messageWords }) * privateKey
) % SCALAR_ORDER;

const expectedFor = (disposition) => {
  switch (disposition) {
    case DISPOSITIONS.VALID_COMPLETE_STATEMENT:
      return Object.freeze({ circuit: true, delegatedPublic: true, complete: true });
    case DISPOSITIONS.CIRCUIT_LOCAL_REJECTION:
      return Object.freeze({ circuit: false, delegatedPublic: true, complete: false });
    case DISPOSITIONS.DELEGATED_PUBLIC_REJECTION:
      return Object.freeze({ circuit: true, delegatedPublic: false, complete: false });
    default:
      throw new Error(`Unknown transaction-signature disposition: ${disposition}`);
  }
};

const makeVector = ({
  id,
  disposition,
  publicKey,
  randomizer,
  messageWords,
  publicBoundary,
  signature,
  source,
}) => {
  const frozenMessageWords = Object.freeze([...messageWords]);
  return Object.freeze({
    id,
    disposition,
    expected: expectedFor(disposition),
    publicKey,
    randomizer,
    messageWords: frozenMessageWords,
    publicBoundary: publicBoundary === undefined
      ? createPublicBoundary({ messageWords: frozenMessageWords, signature })
      : freezePublicBoundary(publicBoundary),
    signature,
    source,
  });
};

const createTransactionSignatureCorpus = () => {
  const publicKey = jubjub.Point.BASE.multiply(PRIVATE_KEY);
  const messageWords = makeMessageWords();
  const randomizer = jubjub.Point.BASE.multiply(RANDOMIZER_SCALAR);
  const signature = signatureFor({ publicKey, randomizer, messageWords });
  const base = { publicKey, randomizer, messageWords, signature };
  const vector = (
    id,
    disposition,
    overrides = {},
    source = "deterministic-policy-vector",
  ) => makeVector({ id, disposition, source, ...base, ...overrides });

  const supportedSignature = eddsaSign(
    PRIVATE_KEY,
    messageWords.map(toWordBytes),
  );
  const orderTwo = jubjub.Point.fromAffine({ x: 0n, y: FIELD_PRIME - 1n });
  orderTwo.assertValidity();
  const mixedOrderPublicKey = publicKey.add(orderTwo);
  const mixedOrderSignature = signatureFor({
    publicKey: mixedOrderPublicKey,
    randomizer,
    messageWords,
  });
  const smallOrderRandomizerSignature = signatureFor({
    publicKey,
    randomizer: orderTwo,
    messageWords,
    randomizerScalar: 0n,
  });

  let delegatedMessageWords;
  let delegatedRandomizer;
  let delegatedSignature;
  for (let candidate = 0n; candidate < 256n; candidate++) {
    const candidateWords = makeMessageWords();
    candidateWords[3] += candidate;
    const signed = eddsaSign(PRIVATE_KEY, candidateWords.map(toWordBytes));
    if (signed.S + SCALAR_ORDER < CIRCUIT_SCALAR_LIMIT) {
      delegatedMessageWords = candidateWords;
      delegatedRandomizer = signed.R;
      delegatedSignature = signed.S + SCALAR_ORDER;
      break;
    }
  }
  if (delegatedSignature === undefined) {
    throw new Error("Unable to construct deterministic S + n corpus vector");
  }

  const changedMessageWords = [...messageWords];
  changedMessageWords[3] += 1n;
  const changedChannelTransactionIndex = [...messageWords];
  changedChannelTransactionIndex[0] += 1n;
  const aliasedChannelTransactionIndex = [...messageWords];
  aliasedChannelTransactionIndex[0] += FIELD_PRIME;
  const oversizedContractWords = [...messageWords];
  oversizedContractWords[1] = CONTRACT_ADDRESS_LIMIT;
  const oversizedSelectorWords = [...messageWords];
  oversizedSelectorWords[2] = FUNCTION_SELECTOR_LIMIT;
  const canonicalPublicBoundary = createPublicBoundary(base);
  const nonCanonicalSignatureBoundary = {
    ...canonicalPublicBoundary,
    S: canonicalPublicBoundary.S + FIELD_PRIME,
  };
  const aliasedIdentityBoundary = {
    ...canonicalPublicBoundary,
    O: [FIELD_PRIME, canonicalPublicBoundary.O[1]],
  };

  return Object.freeze([
    vector(
      "valid-supported-signer",
      DISPOSITIONS.VALID_COMPLETE_STATEMENT,
      { randomizer: supportedSignature.R, signature: supportedSignature.S },
      "tokamak-l2js-eddsaSign",
    ),
    vector(
      "valid-deterministic-subgroup",
      DISPOSITIONS.VALID_COMPLETE_STATEMENT,
      {},
      "independent-scalar-construction",
    ),
    vector(
      "valid-mixed-order-public-key",
      DISPOSITIONS.VALID_COMPLETE_STATEMENT,
      { publicKey: mixedOrderPublicKey, signature: mixedOrderSignature },
      "independent-mixed-order-construction",
    ),
    vector(
      "valid-nonidentity-small-order-randomizer",
      DISPOSITIONS.VALID_COMPLETE_STATEMENT,
      { randomizer: orderTwo, signature: smallOrderRandomizerSignature },
      "independent-small-order-randomizer-construction",
    ),
    vector("reject-invalid-public-key-point", DISPOSITIONS.CIRCUIT_LOCAL_REJECTION, {
      publicKey: jubjub.Point.fromAffine({ x: 1n, y: 1n }),
    }),
    vector("reject-invalid-randomizer-point", DISPOSITIONS.CIRCUIT_LOCAL_REJECTION, {
      randomizer: jubjub.Point.fromAffine({ x: 1n, y: 1n }),
    }),
    vector("reject-identity-public-key", DISPOSITIONS.CIRCUIT_LOCAL_REJECTION, {
      publicKey: jubjub.Point.ZERO,
    }),
    vector("reject-pure-torsion-public-key", DISPOSITIONS.CIRCUIT_LOCAL_REJECTION, {
      publicKey: orderTwo,
    }),
    vector("reject-identity-randomizer", DISPOSITIONS.CIRCUIT_LOCAL_REJECTION, {
      randomizer: jubjub.Point.ZERO,
    }),
    vector("reject-mutated-message", DISPOSITIONS.CIRCUIT_LOCAL_REJECTION, {
      messageWords: changedMessageWords,
    }),
    vector(
      "reject-mutated-channel-transaction-index",
      DISPOSITIONS.CIRCUIT_LOCAL_REJECTION,
      { messageWords: changedChannelTransactionIndex },
    ),
    vector("reject-mutated-public-key", DISPOSITIONS.CIRCUIT_LOCAL_REJECTION, {
      publicKey: jubjub.Point.BASE.multiply(PRIVATE_KEY + 1n),
    }),
    vector("reject-mutated-randomizer", DISPOSITIONS.CIRCUIT_LOCAL_REJECTION, {
      randomizer: jubjub.Point.BASE.multiply(RANDOMIZER_SCALAR + 1n),
    }),
    vector("reject-mutated-signature", DISPOSITIONS.CIRCUIT_LOCAL_REJECTION, {
      signature: (signature + 1n) % SCALAR_ORDER,
    }),
    vector("reject-zero-signature", DISPOSITIONS.CIRCUIT_LOCAL_REJECTION, {
      signature: 0n,
    }),
    vector("reject-n-minus-one-signature", DISPOSITIONS.CIRCUIT_LOCAL_REJECTION, {
      signature: SCALAR_ORDER - 1n,
    }),
    vector(
      "valid-native-private-channel-transaction-index-alias",
      DISPOSITIONS.VALID_COMPLETE_STATEMENT,
      { messageWords: aliasedChannelTransactionIndex },
    ),
    vector("delegate-s-plus-n-rejection", DISPOSITIONS.DELEGATED_PUBLIC_REJECTION, {
      randomizer: delegatedRandomizer,
      messageWords: delegatedMessageWords,
      signature: delegatedSignature,
    }),
    vector(
      "reject-oversized-contract-address",
      DISPOSITIONS.CIRCUIT_LOCAL_REJECTION,
      {
        messageWords: oversizedContractWords,
        signature: signatureFor({
          publicKey,
          randomizer,
          messageWords: oversizedContractWords,
        }),
      },
    ),
    vector(
      "delegate-oversized-function-selector-rejection",
      DISPOSITIONS.DELEGATED_PUBLIC_REJECTION,
      {
        messageWords: oversizedSelectorWords,
        signature: signatureFor({
          publicKey,
          randomizer,
          messageWords: oversizedSelectorWords,
        }),
      },
    ),
    vector(
      "delegate-noncanonical-signature-field-rejection",
      DISPOSITIONS.DELEGATED_PUBLIC_REJECTION,
      { publicBoundary: nonCanonicalSignatureBoundary },
    ),
    vector(
      "delegate-aliased-identity-encoding-rejection",
      DISPOSITIONS.DELEGATED_PUBLIC_REJECTION,
      { publicBoundary: aliasedIdentityBoundary },
    ),
  ]);
};

module.exports = Object.freeze({
  CHALLENGE_INPUT_COUNT,
  DISPOSITIONS,
  MESSAGE_WORD_COUNT,
  POLICY,
  SCALAR_ORDER,
  createTransactionSignatureCorpus,
  evaluateCompleteStatement,
  getChallengeInputs,
});
