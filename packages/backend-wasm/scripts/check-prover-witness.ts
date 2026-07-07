import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
  createBinaryArtifactFile,
  createCurveRuntime,
  loadRuntimeArtifactFile,
  RuntimeArtifactBundleKind,
  RuntimeArtifactFileRole,
  type BinarySectionInput,
  type FieldElement,
  DensePolynomialExt,
} from "../src/index.js";
import {
  buildProverWitnessInputFromRuntimeArtifacts,
  loadProverInputFromRuntimeBundles,
  loadProverRuntimeWitnessInputParts,
} from "../src/prover/binary-input.js";
import { buildProverBinding, encodePolynomialWithSigma1, prove0 } from "../src/prover/prove0.js";
import { buildProverInstancePolynomials, createProverMixer, createProverState } from "../src/prover/state.js";
import { GENERATED_PROVER_SETUP_PARAMS } from "../src/prover/generated/subcircuit-library.generated.js";
import {
  buildWitnessPolynomials,
  type ProverPlacementVariables,
  type ProverPermutationEntry,
  type ProverSetupParams,
  type ProverSparseSubcircuitR1cs,
  type ProverSubcircuitInfo,
} from "../src/prover/witness.js";

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
      bXY: DensePolynomialExt.zero(runtime.Fr),
      uXY: monomialPolynomial(4, 4, fr(1n), 8, 8),
      vXY: DensePolynomialExt.fromCoeffs(runtime.Fr, [fr(1n)], 1, 1),
      wXY: DensePolynomialExt.zero(runtime.Fr),
      rXY: DensePolynomialExt.zero(runtime.Fr),
    };
    const smallProverState = await createProverState({
      runtime,
      setup: prove0Setup,
      publicInstance: [fr(13n), fr(17n)],
      permutation: [],
      witness: prove0Witness,
    });
    const smallProve0 = await prove0(runtime, createSyntheticProverCrs(prove0Setup, 64), smallProverState);
    assertEqual(smallProve0.proof0.U.byteLength, 144, "prove0 U byte length");
    assertEqual(smallProve0.proof0.B.byteLength, 144, "prove0 B byte length");

    const binaryArtifacts = {
      setupParams: await loadRuntimeArtifactFile(
        await createBinaryArtifactFile({
          kind: BinaryArtifactFileKind.ProverSetupParams,
          sourcePackageVersion: "0.0.0",
          sections: [
            {
              type: BinarySectionType.SetupParams,
              encoding: BinarySectionEncoding.Bytes,
              label: "setup.params",
              elementCount: 1,
              elementByteLength: 36,
              data: encodeSetupParams(setup),
            },
          ],
        }),
      ),
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
    assertEqual(binaryParts.setup.l_free, setup.l_free, "binary setup l_free");
    assertEqual(binaryParts.placementVariables.length, placementVariables.length, "binary placement count");
    assertEqual(binaryParts.permutation.length, permutation.length, "binary permutation count");
    assertEqual(binaryParts.permutation[0].X, permutation[0].X, "binary permutation X");
    assertFieldEqual(binaryParts.placementVariables[1].variables[2], fr(11n), "binary placement variable");
    assertEqual(binaryParts.publicInstance.length, 2, "binary public instance length");
    assertFieldEqual(binaryParts.publicInstance[1], fr(17n), "binary public instance value");

    const bakedInput = buildProverWitnessInputFromRuntimeArtifacts(runtime, {
      setupParams: await loadRuntimeArtifactFile(
        await createBinaryArtifactFile({
          kind: BinaryArtifactFileKind.ProverSetupParams,
          sourcePackageVersion: "0.0.0",
          sections: [
            {
              type: BinarySectionType.SetupParams,
              encoding: BinarySectionEncoding.Bytes,
              label: "setup.params",
              elementCount: 1,
              elementByteLength: 36,
              data: encodeSetupParams(GENERATED_PROVER_SETUP_PARAMS),
            },
          ],
        }),
      ),
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

    const setupParamsBytes = await createBinaryArtifactFile({
      kind: BinaryArtifactFileKind.ProverSetupParams,
      sourcePackageVersion: "0.0.0",
      sections: [
        {
          type: BinarySectionType.SetupParams,
          encoding: BinarySectionEncoding.Bytes,
          label: "setup.params",
          elementCount: 1,
          elementByteLength: 36,
          data: encodeSetupParams(GENERATED_PROVER_SETUP_PARAMS),
        },
      ],
    });
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
      ["setup.bin", setupParamsBytes],
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
          { role: RuntimeArtifactFileRole.SetupParams, path: "setup.bin" },
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
    assertEqual(proverInput.crs.sigma1.xyPowers.length, 2, "bundle prover CRS xy powers length");
    assertEqual(proverInput.crs.sigma2.y.byteLength, 192, "bundle prover CRS sigma2.y byte length");

    const encodedPolynomial = await encodePolynomialWithSigma1(
      runtime,
      proverInput.crs,
      GENERATED_PROVER_SETUP_PARAMS,
      DensePolynomialExt.fromCoeffs(runtime.Fr, [fr(3n), fr(5n)], 1, 2),
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
      generatedInstancePolynomials,
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
    polynomial: { toRouEvals(): Promise<FieldElement[]> },
    expected: readonly bigint[],
    label: string,
  ): Promise<void> {
    const actual = await polynomial.toRouEvals();
    assertEqual(actual.length, expected.length, `${label} eval count`);
    for (let index = 0; index < expected.length; index += 1) {
      assertFieldEqual(actual[index], fr(expected[index]), `${label}[${index}]`);
    }
  }

  function assertFieldEqual(actual: FieldElement, expected: FieldElement, label: string): void {
    if (!runtime.Fr.eq(actual, expected)) {
      throw new Error(`${label} mismatch: expected ${runtime.Fr.toHex(expected)}, got ${runtime.Fr.toHex(actual)}`);
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
    return {
      G: runtime.G1.generator,
      H: runtime.G2.generator,
      lagrangeKL: runtime.G1.generator,
      sigma1: {
        x: runtime.G1.generator,
        y: runtime.G1.generator,
        delta: runtime.G1.generator,
        eta: runtime.G1.generator,
        xyPowers: Array.from({ length: xyPowersLength }, () => runtime.G1.generator),
        gammaInvOInst: Array.from({ length: setup.l }, () => runtime.G1.generator),
        etaInvLiOInterAlpha4Kj: Array.from({ length: (setup.l_D - setup.l) * setup.s_max }, () => runtime.G1.generator),
        deltaInvLiOPrv: Array.from({ length: (setup.m_D - setup.l_D) * setup.s_max }, () => runtime.G1.generator),
        deltaInvAlphakXhTx: Array.from({ length: 9 }, () => runtime.G1.generator),
        deltaInvAlpha4XjTx: Array.from({ length: 2 }, () => runtime.G1.generator),
        deltaInvAlphakYiTy: Array.from({ length: 12 }, () => runtime.G1.generator),
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
  ): DensePolynomialExt {
    const coefficients = Array.from({ length: xSize * ySize }, () => runtime.Fr.zero);
    coefficients[xIndex * ySize + yIndex] = coefficient;
    return DensePolynomialExt.fromCoeffs(runtime.Fr, coefficients, xSize, ySize);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function encodeSetupParams(setup: ProverSetupParams): Uint8Array {
  return encodeU32List([
    setup.l_free,
    setup.l_user_out,
    setup.l_user,
    setup.l,
    setup.l_D,
    setup.m_D,
    setup.n,
    setup.s_D,
    setup.s_max,
  ]);
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
