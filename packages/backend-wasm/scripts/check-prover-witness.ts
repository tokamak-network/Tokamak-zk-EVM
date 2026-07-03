import { createCurveRuntime, type FieldElement } from "../src/index.js";
import {
  buildWitnessPolynomials,
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
    const placementVariables = [
      {
        subcircuitId: 0,
        variables: [fr(2n), fr(5n), fr(0n)],
      },
      {
        subcircuitId: 1,
        variables: [fr(3n), fr(7n), fr(11n)],
      },
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
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${String(expected)}, got ${String(actual)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
