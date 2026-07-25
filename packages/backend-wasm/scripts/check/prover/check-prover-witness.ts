import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
  createBinaryArtifactFile,
  createCurveRuntime,
  BivariatePolynomialBuffer,
  loadVerifierProofArtifact,
  loadRuntimeArtifactFile,
  RuntimeArtifactBundleKind,
  RuntimeArtifactFileRole,
  type BinarySectionInput,
  type FieldElement,
} from "../../../src/index.js";
import {
  buildProverWitnessInputFromRuntimeArtifacts,
  loadProverInputFromRuntimeBundles,
  loadProverRuntimeWitnessInputParts,
  proverCrsG1PointAt,
  proverCrsG1PointRange,
} from "../../../src/prover/api/binary-input.js";
import {
  buildProverBinding,
  computeInitialRelationCommitments,
  encodePolynomialBufferWithSigma1,
} from "../../../src/prover/internal/initial-relation.js";
import { computeRecursionCommitment } from "../../../src/prover/internal/recursion-commitment.js";
import { computeCopyQuotientCommitments } from "../../../src/prover/internal/copy-quotient.js";
import { evaluateChallengePoints } from "../../../src/prover/internal/challenge-evaluations.js";
import { computeOpeningCommitments } from "../../../src/prover/internal/opening-commitments.js";
import { proveSnark } from "../../../src/prover/api/prove-snark.js";
import { createVerifierProofArtifactFromProverOutput } from "../../../src/prover/api/proof-output.js";
import { buildProverInstancePolynomials, createProverMixer, createProverState } from "../../../src/prover/internal/state.js";
import { GENERATED_PROVER_SETUP_PARAMS } from "../../../src/prover/generated/subcircuit-library.generated.js";
import {
  buildWitnessPolynomials,
  type ProverPlacementVariables,
  type ProverPermutationEntry,
  type ProverSetupParams,
  type ProverSparseSubcircuitR1cs,
  type ProverSubcircuitInfo,
} from "../../../src/prover/internal/witness.js";

async function main(): Promise<void> {
  const runtime = await createCurveRuntime();

  try {
    const setup: ProverSetupParams = {
      l_free: 2,
      l: 2,
      l_user_out: 0,
      l_user: 1,
      l_D: 4,
      m_D: 4,
      n: 2,
      s_D: 2,
      s_max: 2,
    };
    const subcircuitInfos: ProverSubcircuitInfo[] = [
      {
        id: 0,
        name: "synthetic-0",
        Nwires: 3,
        Nconsts: 0,
        Out_idx: [],
        In_idx: [],
        flattenMap: [0, 2, 3],
      },
      {
        id: 1,
        name: "synthetic-1",
        Nwires: 3,
        Nconsts: 0,
        Out_idx: [],
        In_idx: [],
        flattenMap: [1, 2, 3],
      },
    ];
    const placementVariables: ProverPlacementVariables[] = [
      {
        subcircuitId: 0,
        variables: [fr(2n), fr(5n), fr(0n)],
      },
      {
        subcircuitId: 1,
        variables: [fr(3n), fr(7n), fr(11n)],
      },
    ];
    const permutation: ProverPermutationEntry[] = [
      { row: 0, col: 0, X: 1, Y: 1 },
      { row: 1, col: 1, X: 0, Y: 0 },
    ];
    const r1csBySubcircuit: ProverSparseSubcircuitR1cs[] = [
      {
        subcircuitId: 0,
        A: {
          activeWires: [0, 1],
          sparseRows: [
            [
              { column: 0, coefficient: fr(2n) },
              { column: 1, coefficient: fr(3n) },
            ],
            [{ column: 1, coefficient: fr(1n) }],
          ],
        },
        B: {
          activeWires: [1],
          sparseRows: [[{ column: 0, coefficient: fr(4n) }], []],
        },
        C: {
          activeWires: [2],
          sparseRows: [[], [{ column: 0, coefficient: fr(5n) }]],
        },
      },
      {
        subcircuitId: 1,
        A: {
          activeWires: [0, 2],
          sparseRows: [
            [
              { column: 0, coefficient: fr(1n) },
              { column: 1, coefficient: fr(2n) },
            ],
            [{ column: 1, coefficient: fr(3n) }],
          ],
        },
        B: {
          activeWires: [1],
          sparseRows: [[{ column: 0, coefficient: fr(6n) }], []],
        },
        C: {
          activeWires: [0, 2],
          sparseRows: [[], [{ column: 1, coefficient: fr(7n) }]],
        },
      },
    ];

    const witness = await buildWitnessPolynomials(runtime.Fr, {
      setup,
      subcircuitInfos,
      placementVariables,
      r1csBySubcircuit,
    });

    await assertRouEvals(witness.bXY, [5n, 7n, 0n, 11n], "bXY");
    await assertRouEvals(witness.uXY, [19n, 25n, 5n, 33n], "uXY");
    await assertRouEvals(witness.vXY, [20n, 42n, 0n, 0n], "vXY");
    await assertRouEvals(witness.wXY, [0n, 0n, 0n, 77n], "wXY");
    assertEqual(witness.rXY.xSize, 1, "rXY xSize");
    assertEqual(witness.rXY.ySize, 1, "rXY ySize");
    assertFieldEqual(witness.rXY.getCoeff(0, 0), runtime.Fr.zero, "rXY zero");

    const instancePolynomials = await buildProverInstancePolynomials(runtime.Fr, setup, [fr(13n), fr(17n)], permutation);
    await assertRouEvals(instancePolynomials.aFreeX, [13n, 17n], "aFreeX");
    const negOne = runtime.Fr.toBigInt(runtime.Fr.neg(runtime.Fr.one));
    await assertRouEvals(instancePolynomials.s0XY, [negOne, 1n, negOne, 1n], "s0XY");
    await assertRouEvals(instancePolynomials.s1XY, [negOne, negOne, 1n, 1n], "s1XY");
    assertFieldEqual(instancePolynomials.tN.getCoeff(0, 0), runtime.Fr.neg(runtime.Fr.one), "tN constant");
    assertFieldEqual(instancePolynomials.tN.getCoeff(setup.n, 0), runtime.Fr.one, "tN lead");
    assertFieldEqual(instancePolynomials.tSMax.getCoeff(0, setup.s_max), runtime.Fr.one, "tSMax lead");
    const mixer = await createProverMixer(runtime);
    assertEqual(mixer.rW_X.length, 4, "mixer rW_X length");
    assertEqual(mixer.rW_Y.length, 4, "mixer rW_Y length");
    assertEqual(mixer.rB_X.length, 2, "mixer rB_X length");
    assertEqual(mixer.rB_Y.length, 2, "mixer rB_Y length");
    const prove0Setup: ProverSetupParams = {
      l_free: 2,
      l: 2,
      l_user_out: 0,
      l_user: 1,
      l_D: 6,
      m_D: 10,
      n: 4,
      s_D: 2,
      s_max: 4,
    };
    const prove0Witness = {
      bXY: BivariatePolynomialBuffer.zero(runtime.Fr),
      uXY: monomialPolynomial(4, 4, fr(1n), 8, 8),
      vXY: BivariatePolynomialBuffer.fromCoeffs(runtime.Fr, [fr(1n)], 1, 1),
      wXY: BivariatePolynomialBuffer.zero(runtime.Fr),
      rXY: BivariatePolynomialBuffer.zero(runtime.Fr),
    };
    const smallProverState = await createProverState({
      runtime,
      setup: prove0Setup,
      publicInstance: [fr(13n), fr(17n)],
      permutation: [],
      witness: prove0Witness,
    });
    const smallCrs = createSyntheticProverCrs(prove0Setup, 64);
    const smallProve0 = await computeInitialRelationCommitments(runtime, smallCrs, smallProverState);
    assertEqual(smallProve0.commitments.U.byteLength, 144, "prove0 U byte length");
    assertEqual(smallProve0.commitments.B.byteLength, 144, "prove0 B byte length");
    const smallProve1 = await computeRecursionCommitment(
      runtime,
      smallCrs,
      smallProverState,
      [runtime.Fr.zero, runtime.Fr.zero, runtime.Fr.one],
    );
    assertEqual(smallProve1.commitment.R.byteLength, 144, "prove1 R byte length");
    await assertRouEvals(
      smallProve1.rXY,
      Array.from({ length: (prove0Setup.l_D - prove0Setup.l) * prove0Setup.s_max }, () => 1n),
      "prove1 rXY",
    );
    const smallProve2 = await computeCopyQuotientCommitments({
      runtime,
      crs: smallCrs,
      state: smallProverState,
      rXY: smallProve1.rXY,
      thetas: [runtime.Fr.zero, runtime.Fr.zero, runtime.Fr.one],
      kappa0: fr(9n),
    });
    assertEqual(smallProve2.commitments.Q_CX.byteLength, 144, "prove2 Q_CX byte length");
    assertEqual(smallProve2.commitments.Q_CY.byteLength, 144, "prove2 Q_CY byte length");
    const smallProve3 = await evaluateChallengePoints({
      runtime,
      state: smallProverState,
      rXY: smallProve1.rXY,
      chi: fr(11n),
      zeta: fr(13n),
    });
    assertEqual(smallProve3.V_eval.byteLength, runtime.Fr.byteLength, "prove3 V_eval byte length");
    assertEqual(smallProve3.R_eval.byteLength, runtime.Fr.byteLength, "prove3 R_eval byte length");
    assertEqual(smallProve3.R_omegaX_eval.byteLength, runtime.Fr.byteLength, "prove3 R_omegaX_eval byte length");
    assertEqual(
      smallProve3.R_omegaX_omegaY_eval.byteLength,
      runtime.Fr.byteLength,
      "prove3 R_omegaX_omegaY_eval byte length",
    );
    const smallProve4 = await computeOpeningCommitments({
      runtime,
      crs: smallCrs,
      state: smallProverState,
      rXY: smallProve1.rXY,
      initialRelation: smallProve0,
      copyQuotient: smallProve2,
      evaluations: smallProve3,
      thetas: [runtime.Fr.zero, runtime.Fr.zero, runtime.Fr.one],
      kappa0: fr(9n),
      chi: fr(11n),
      zeta: fr(13n),
      kappa1: fr(15n),
    });
    assertEqual(smallProve4.commitments.Pi_X.byteLength, 144, "prove4 Pi_X byte length");
    assertEqual(smallProve4.commitments.Pi_Y.byteLength, 144, "prove4 Pi_Y byte length");
    assertEqual(smallProve4.commitments.M_X.byteLength, 144, "prove4 M_X byte length");
    assertEqual(smallProve4.commitments.M_Y.byteLength, 144, "prove4 M_Y byte length");
    assertEqual(smallProve4.commitments.N_X.byteLength, 144, "prove4 N_X byte length");
    assertEqual(smallProve4.commitments.N_Y.byteLength, 144, "prove4 N_Y byte length");
    const smallBinding = await buildProverBinding(
      runtime,
      smallCrs,
      prove0Setup,
      [],
      [],
      smallProverState.instanceBuffers.aFreeX,
      smallProverState.mixer,
    );
    const verifierProofArtifact = await loadRuntimeArtifactFile(
      await createVerifierProofArtifactFromProverOutput({
        runtime,
        binding: smallBinding,
        initialRelation: smallProve0,
        recursion: smallProve1,
        copyQuotient: smallProve2,
        evaluations: smallProve3,
        openings: smallProve4,
      }),
    );
    assertEqual(verifierProofArtifact.kind, BinaryArtifactFileKind.VerifierProof, "prover output artifact kind");
    assertEqual(verifierProofArtifact.sourcePackageVersion, "2.1.1", "prover output source package version");
    const verifierProof = loadVerifierProofArtifact(verifierProofArtifact);
    assertEqual(verifierProof.sections[0]?.section.data.byteLength, 19 * 96, "prover output proof.g1 byte length");
    assertEqual(verifierProof.sections[1]?.section.data.byteLength, 4 * 32, "prover output proof.evals byte length");
    assertBytesEqual(verifierProof.pointsByName["proof0.U"], runtime.G1.toAffine(smallProve0.commitments.U), "proof0.U affine output");
    assertBytesEqual(verifierProof.pointsByName["proof1.R"], runtime.G1.toAffine(smallProve1.commitment.R), "proof1.R affine output");
    assertBytesEqual(verifierProof.pointsByName["proof4.N_X"], runtime.G1.toAffine(smallProve4.commitments.N_X), "proof4.N_X affine output");
    assertBytesEqual(verifierProof.pointsByName["proof3.V_eval"], smallProve3.V_eval, "proof3.V_eval output");
    const snarkResult = await proveSnark(runtime, {
      witness: {
        setup: prove0Setup,
        subcircuitInfos: [],
        placementVariables: [],
        r1csBySubcircuit: [],
      },
      permutation: [],
      publicInstance: [fr(13n), fr(17n)],
      crs: smallCrs,
    });
    const snarkProofArtifact = await loadRuntimeArtifactFile(snarkResult.proof);
    assertEqual(snarkProofArtifact.kind, BinaryArtifactFileKind.VerifierProof, "proveSnark artifact kind");
    const snarkProof = loadVerifierProofArtifact(snarkProofArtifact);
    assertEqual(snarkProof.sections[0]?.section.data.byteLength, 19 * 96, "proveSnark proof.g1 byte length");
    assertEqual(snarkProof.sections[1]?.section.data.byteLength, 4 * 32, "proveSnark proof.evals byte length");

    const binaryArtifacts = {
      placementVariables: await loadRuntimeArtifactFile(
        await createBinaryArtifactFile({
          kind: BinaryArtifactFileKind.ProverPlacementVariables,
          sourcePackageVersion: "0.0.0",
          sections: [
            {
              type: BinarySectionType.Placement,
              encoding: BinarySectionEncoding.Bytes,
              label: "placement.subcircuit_ids",
              elementCount: placementVariables.length,
              elementByteLength: 4,
              data: encodeU32List(placementVariables.map((placement) => placement.subcircuitId)),
            },
            {
              type: BinarySectionType.Placement,
              encoding: BinarySectionEncoding.Bytes,
              label: "placement.variable_offsets",
              elementCount: placementVariables.length + 1,
              elementByteLength: 4,
              data: encodeU32List(placementVariableOffsets(placementVariables)),
            },
            {
              type: BinarySectionType.Placement,
              encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
              label: "placement.variables",
              elementCount: placementVariables.reduce((sum, placement) => sum + placement.variables.length, 0),
              elementByteLength: runtime.Fr.byteLength,
              data: concatBytes(placementVariables.flatMap((placement) => [...placement.variables])),
            },
          ],
        }),
      ),
      permutation: await loadRuntimeArtifactFile(
        await createBinaryArtifactFile({
          kind: BinaryArtifactFileKind.ProverPermutation,
          sourcePackageVersion: "0.0.0",
          sections: [
            {
              type: BinarySectionType.Permutation,
              encoding: BinarySectionEncoding.Bytes,
              label: "permutation.entries",
              elementCount: permutation.length,
              elementByteLength: 16,
              data: encodePermutationEntries(permutation),
            },
          ],
        }),
      ),
      instance: await loadRuntimeArtifactFile(
        await createBinaryArtifactFile({
          kind: BinaryArtifactFileKind.ProverInstance,
          sourcePackageVersion: "0.0.0",
          sections: [
            {
              type: BinarySectionType.Instance,
              encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
              label: "instance.public",
              elementCount: 2,
              elementByteLength: runtime.Fr.byteLength,
              data: concatBytes([fr(13n), fr(17n)]),
            },
          ],
        }),
      ),
    };
    const binaryParts = loadProverRuntimeWitnessInputParts(runtime, binaryArtifacts);
    assertEqual(binaryParts.setup.l_free, GENERATED_PROVER_SETUP_PARAMS.l_free, "binary setup l_free");
    assertEqual(binaryParts.placementVariables.length, placementVariables.length, "binary placement count");
    assertEqual(binaryParts.permutation.length, permutation.length, "binary permutation count");
    assertEqual(binaryParts.permutation[0].X, permutation[0].X, "binary permutation X");
    assertFieldEqual(binaryParts.placementVariables[1].variables[2], fr(11n), "binary placement variable");
    assertEqual(binaryParts.publicInstance.length, 2, "binary public instance length");
    assertFieldEqual(binaryParts.publicInstance[1], fr(17n), "binary public instance value");

    const bakedInput = buildProverWitnessInputFromRuntimeArtifacts(runtime, {
      placementVariables: await loadRuntimeArtifactFile(
        await createBinaryArtifactFile({
          kind: BinaryArtifactFileKind.ProverPlacementVariables,
          sourcePackageVersion: "0.0.0",
          sections: [
            {
              type: BinarySectionType.Placement,
              encoding: BinarySectionEncoding.Bytes,
              label: "placement.subcircuit_ids",
              elementCount: 0,
              elementByteLength: 4,
              data: new Uint8Array(),
            },
            {
              type: BinarySectionType.Placement,
              encoding: BinarySectionEncoding.Bytes,
              label: "placement.variable_offsets",
              elementCount: 1,
              elementByteLength: 4,
              data: encodeU32List([0]),
            },
            {
              type: BinarySectionType.Placement,
              encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
              label: "placement.variables",
              elementCount: 0,
              elementByteLength: runtime.Fr.byteLength,
              data: new Uint8Array(),
            },
          ],
        }),
      ),
      permutation: await loadRuntimeArtifactFile(
        await createBinaryArtifactFile({
          kind: BinaryArtifactFileKind.ProverPermutation,
          sourcePackageVersion: "0.0.0",
          sections: [
            {
              type: BinarySectionType.Permutation,
              encoding: BinarySectionEncoding.Bytes,
              label: "permutation.entries",
              elementCount: 0,
              elementByteLength: 16,
              data: new Uint8Array(),
            },
          ],
        }),
      ),
      instance: await loadRuntimeArtifactFile(
        await createBinaryArtifactFile({
          kind: BinaryArtifactFileKind.ProverInstance,
          sourcePackageVersion: "0.0.0",
          sections: [
            {
              type: BinarySectionType.Instance,
              encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
              label: "instance.public",
              elementCount: 0,
              elementByteLength: runtime.Fr.byteLength,
              data: new Uint8Array(),
            },
          ],
        }),
      ),
    });
    assertEqual(bakedInput.subcircuitInfos.length, 14, "baked subcircuit info count");
    assertEqual(bakedInput.r1csBySubcircuit.length, 14, "baked sparse R1CS count");

    const placementVariablesBytes = await createBinaryArtifactFile({
      kind: BinaryArtifactFileKind.ProverPlacementVariables,
      sourcePackageVersion: "0.0.0",
      sections: [
        {
          type: BinarySectionType.Placement,
          encoding: BinarySectionEncoding.Bytes,
          label: "placement.subcircuit_ids",
          elementCount: 0,
          elementByteLength: 4,
          data: new Uint8Array(),
        },
        {
          type: BinarySectionType.Placement,
          encoding: BinarySectionEncoding.Bytes,
          label: "placement.variable_offsets",
          elementCount: 1,
          elementByteLength: 4,
          data: encodeU32List([0]),
        },
        {
          type: BinarySectionType.Placement,
          encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
          label: "placement.variables",
          elementCount: 0,
          elementByteLength: runtime.Fr.byteLength,
          data: new Uint8Array(),
        },
      ],
    });
    const permutationBytes = await createBinaryArtifactFile({
      kind: BinaryArtifactFileKind.ProverPermutation,
      sourcePackageVersion: "0.0.0",
      sections: [
        {
          type: BinarySectionType.Permutation,
          encoding: BinarySectionEncoding.Bytes,
          label: "permutation.entries",
          elementCount: 0,
          elementByteLength: 16,
          data: new Uint8Array(),
        },
      ],
    });
    const instanceBytes = await createBinaryArtifactFile({
      kind: BinaryArtifactFileKind.ProverInstance,
      sourcePackageVersion: "0.0.0",
      sections: [
        {
          type: BinarySectionType.Instance,
          encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
          label: "instance.public",
          elementCount: 0,
          elementByteLength: runtime.Fr.byteLength,
          data: new Uint8Array(),
        },
      ],
    });
    const crsBytes = await createBinaryArtifactFile({
      kind: BinaryArtifactFileKind.ProverCrs,
      sourcePackageVersion: "0.0.0",
      sections: [
        createRepeatedG1Section("sigma.g1", 6),
        createRepeatedG1Section("sigma1.xy-powers", 2),
        createRepeatedG1Section("sigma1.gamma-inv-o-inst", 1),
        createRepeatedG1Section("sigma1.eta-inv-li-o-inter-alpha4-kj", 1),
        createRepeatedG1Section("sigma1.delta-inv-li-o-prv", 1),
        createRepeatedG1Section("sigma1.delta-inv-alphak-xh-tx", 9),
        createRepeatedG1Section("sigma1.delta-inv-alpha4-xj-tx", 2),
        createRepeatedG1Section("sigma1.delta-inv-alphak-yi-ty", 12),
        {
          type: BinarySectionType.CrsG2,
          encoding: BinarySectionEncoding.FfjsG2Affine192,
          label: "sigma.g2",
          elementCount: 10,
          elementByteLength: 192,
          data: concatBytes(Array.from({ length: 10 }, () => runtime.G2.generator)),
        },
      ],
    });
    const files = new Map([
      ["placement.bin", placementVariablesBytes],
      ["permutation.bin", permutationBytes],
      ["instance.bin", instanceBytes],
      ["crs.bin", crsBytes],
    ]);
    const proverInput = await loadProverInputFromRuntimeBundles(
      runtime,
      {
        schemaVersion: 1,
        kind: RuntimeArtifactBundleKind.ProverProofWitnessInput,
        files: [
          { role: RuntimeArtifactFileRole.PlacementVariables, path: "placement.bin" },
          { role: RuntimeArtifactFileRole.Permutation, path: "permutation.bin" },
          { role: RuntimeArtifactFileRole.Instance, path: "instance.bin" },
        ],
      },
      {
        schemaVersion: 1,
        kind: RuntimeArtifactBundleKind.ProverCrsPreparedData,
        files: [
          { role: RuntimeArtifactFileRole.Crs, path: "crs.bin" },
        ],
      },
      (filePath) => {
        const file = files.get(filePath);
        if (file === undefined) {
          throw new Error(`Missing test runtime artifact file ${filePath}.`);
        }
        return file;
      },
    );
    assertEqual(proverInput.witness.subcircuitInfos.length, 14, "bundle prover subcircuit info count");
    assertEqual(proverInput.crs.sigma1.xyPowers.count, 2, "bundle prover CRS xy powers length");
    assertEqual(
      proverCrsG1PointAt(proverInput.crs.sigma1.xyPowers, 1).byteLength,
      96,
      "bundle prover CRS xy powers point width",
    );
    assertEqual(
      proverCrsG1PointRange(proverInput.crs.sigma1.xyPowers, 0, 2).byteLength,
      192,
      "bundle prover CRS xy powers range width",
    );
    assertEqual(
      proverCrsG1PointAt(proverInput.crs.sigma1.xyPowers, 0).buffer,
      proverInput.crs.sigma1.xyPowers.data.buffer,
      "bundle prover CRS point access backing buffer",
    );
    assertEqual(proverInput.crs.sigma2.y.byteLength, 192, "bundle prover CRS sigma2.y byte length");

    const encodedPolynomial = await encodePolynomialBufferWithSigma1(
      runtime,
      proverInput.crs,
      GENERATED_PROVER_SETUP_PARAMS,
      BivariatePolynomialBuffer.fromCoeffs(runtime.Fr, [fr(3n), fr(5n)], 1, 2),
    );
    const expectedEncoding = runtime.G1.mulAffineScalar(runtime.G1.generator, fr(8n));
    if (!runtime.G1.eq(encodedPolynomial, expectedEncoding)) {
      throw new Error("prove0 sigma1 polynomial encoding mismatch.");
    }
    const generatedInstancePolynomials = await buildProverInstancePolynomials(
      runtime.Fr,
      GENERATED_PROVER_SETUP_PARAMS,
      Array.from({ length: GENERATED_PROVER_SETUP_PARAMS.l_free }, () => runtime.Fr.zero),
      [],
    );
    const generatedMixer = await createProverMixer(runtime);
    const binding = await buildProverBinding(
      runtime,
      proverInput.crs,
      GENERATED_PROVER_SETUP_PARAMS,
      [],
      proverInput.witness.subcircuitInfos,
      generatedInstancePolynomials.aFreeX,
      generatedMixer,
    );
    assertEqual(binding.A_free.byteLength, 96, "binding A_free byte length");
    assertEqual(binding.O_pub_free.byteLength, 96, "binding O_pub_free byte length");
    assertEqual(binding.O_mid.byteLength, 144, "binding O_mid projective byte length");
    assertEqual(binding.O_prv.byteLength, 144, "binding O_prv projective byte length");
  } finally {
    await runtime.terminate();
  }

  console.log("Checked prover witness polynomial generation");

  function fr(value: bigint): FieldElement {
    return runtime.Fr.fromBigInt(value);
  }

  async function assertRouEvals(
    polynomial: { toRouEvals(): Promise<FieldElement[] | Uint8Array> },
    expected: readonly bigint[],
    label: string,
  ): Promise<void> {
    const actual = await polynomial.toRouEvals();
    const actualLength = actual instanceof Uint8Array ? runtime.Fr.bufferElementCount(actual) : actual.length;
    assertEqual(actualLength, expected.length, `${label} eval count`);
    for (let index = 0; index < expected.length; index += 1) {
      const actualValue = actual instanceof Uint8Array ? runtime.Fr.readBufferElement(actual, index) : actual[index];
      assertFieldEqual(actualValue, fr(expected[index]), `${label}[${index}]`);
    }
  }

  function assertFieldEqual(actual: FieldElement, expected: FieldElement, label: string): void {
    if (!runtime.Fr.eq(actual, expected)) {
      throw new Error(`${label} mismatch: expected ${runtime.Fr.toHex(expected)}, got ${runtime.Fr.toHex(actual)}`);
    }
  }

  function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
    if (Buffer.compare(Buffer.from(actual), Buffer.from(expected)) !== 0) {
      throw new Error(`${label} byte mismatch`);
    }
  }

  function createRepeatedG1Section(label: string, elementCount: number): BinarySectionInput {
    return {
      type: BinarySectionType.CrsG1,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      label,
      elementCount,
      elementByteLength: 96,
      data: concatBytes(Array.from({ length: elementCount }, () => runtime.G1.generator)),
    };
  }

  function createSyntheticProverCrs(setup: ProverSetupParams, xyPowersLength: number) {
    const xyPowers = Array.from({ length: xyPowersLength }, () => runtime.G1.generator);
    return {
      G: runtime.G1.generator,
      H: runtime.G2.generator,
      lagrangeKL: runtime.G1.generator,
      sigma1: {
        x: runtime.G1.generator,
        y: runtime.G1.generator,
        delta: runtime.G1.generator,
        eta: runtime.G1.generator,
        xyPowers: g1Section(xyPowers),
        gammaInvOInst: g1Section(Array.from({ length: setup.l }, () => runtime.G1.generator)),
        etaInvLiOInterAlpha4Kj: g1Section(
          Array.from({ length: (setup.l_D - setup.l) * setup.s_max }, () => runtime.G1.generator),
        ),
        deltaInvLiOPrv: g1Section(
          Array.from({ length: (setup.m_D - setup.l_D) * setup.s_max }, () => runtime.G1.generator),
        ),
        deltaInvAlphakXhTx: g1Section(Array.from({ length: 9 }, () => runtime.G1.generator)),
        deltaInvAlpha4XjTx: g1Section(Array.from({ length: 2 }, () => runtime.G1.generator)),
        deltaInvAlphakYiTy: g1Section(Array.from({ length: 12 }, () => runtime.G1.generator)),
      },
      sigma2: {
        alpha: runtime.G2.generator,
        alpha2: runtime.G2.generator,
        alpha3: runtime.G2.generator,
        alpha4: runtime.G2.generator,
        gamma: runtime.G2.generator,
        delta: runtime.G2.generator,
        eta: runtime.G2.generator,
        x: runtime.G2.generator,
        y: runtime.G2.generator,
      },
    };
  }

  function monomialPolynomial(
    xIndex: number,
    yIndex: number,
    coefficient: FieldElement,
    xSize: number,
    ySize: number,
  ): BivariatePolynomialBuffer {
    const coefficients = Array.from({ length: xSize * ySize }, () => runtime.Fr.zero);
    coefficients[xIndex * ySize + yIndex] = coefficient;
    return BivariatePolynomialBuffer.fromCoeffs(runtime.Fr, coefficients, xSize, ySize);
  }

  function g1Section(points: readonly Uint8Array[]) {
    return {
      data: concatBytes(points),
      count: points.length,
      elementByteLength: 96,
    };
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function placementVariableOffsets(placements: readonly ProverPlacementVariables[]): number[] {
  const offsets = [0];
  for (const placement of placements) {
    offsets.push(offsets[offsets.length - 1] + placement.variables.length);
  }

  return offsets;
}

function encodeU32List(values: readonly number[]): Uint8Array {
  const output = new Uint8Array(values.length * 4);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  for (let index = 0; index < values.length; index += 1) {
    view.setUint32(index * 4, values[index], true);
  }

  return output;
}

function encodePermutationEntries(entries: readonly ProverPermutationEntry[]): Uint8Array {
  const output = new Uint8Array(entries.length * 16);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

  for (let index = 0; index < entries.length; index += 1) {
    const offset = index * 16;
    const entry = entries[index];
    view.setUint32(offset, entry.row, true);
    view.setUint32(offset + 4, entry.col, true);
    view.setUint32(offset + 8, entry.X, true);
    view.setUint32(offset + 12, entry.Y, true);
  }

  return output;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
