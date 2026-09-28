import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import {
  buildArithmeticWireLift,
  buildConnectionCopyFactors,
  buildConnectionPermutationPolynomial,
  buildConnectionWireLift,
  buildWitnessMaps,
  type UnivariateSparseMatrix,
  type UnivariateSubcircuit,
} from "../../../src/univariate/relation.js";
import { arithmeticIndex, connectionIndex, deriveUnivariateDomainShape } from "../../../src/univariate/domain.js";
import type { SetupParams } from "../../../src/artifacts/setup/setup-params.js";
import type { ProverSubcircuitInfo } from "../../../src/prover/protocol/witness.js";
import { retainedWeightedWires } from "../../../src/prover/protocol/subcircuit-library-validation.js";

const runtime = await createCurveRuntime();
try {
  const field = runtime.Fr;
  const setup: SetupParams = {
    n: 2, m: 4, m_b: 2, t: 4, s: 2,
    publicWirePhases: [{ name: "output", region: "free", subcircuitIds: [0] }],
  };
  const infos: readonly ProverSubcircuitInfo[] = [
    info(0, "public", [1, 1], [2, 0], [1, 1], "out", "output"),
    info(1, "ordinary", [1, 0], [1, 1], [0, 0]),
  ];
  const subcircuits: readonly UnivariateSubcircuit[] = [
    { id: 0, info: infos[0]!, A: matrix([0, 1], [[[0, 1]], [[1, 1]]]), B: matrix([0, 1], [[[1, 1]], [[0, 1]]]), C: matrix([0, 1], [[[0, 1]], [[1, 1]]]) },
    { id: 1, info: infos[1]!, A: matrix([], []), B: matrix([], []), C: matrix([], []) },
  ];
  const selector = [0, 1] as const;
  const witness = (subcircuitId: number, values: readonly number[]) => ({
    subcircuitId,
    values: field.concat(values.map(value => field.fromBigInt(BigInt(value)))),
  });
  const witnesses = [witness(0, [1, 5, 0, 0]), witness(1, [1, 7, 0, 0])];
  const domain = deriveUnivariateDomainShape(field, setup);
  assert.deepEqual(
    retainedWeightedWires(
      { ...setup, m: 8, m_b: 4 },
      [
        { ...infos[0]!, Nwires: 8, Wiring_idx: [0, 2], Internal_idx: [4, 3] },
        { ...infos[1]!, Nwires: 8, Wiring_idx: [0, 3], Internal_idx: [4, 1] },
      ],
    ),
    [0, 1, 2, 4, 5, 6],
    "weighted CRS rows retain real ranges and omit only declared padding",
  );
  const maps = await buildWitnessMaps(field, domain, setup, selector, witnesses, subcircuits);
  assert(field.eq(field.readBufferElement(maps.uA.evaluations, arithmeticIndex(domain, setup, 0, 0, 0)), field.one));
  assert(field.eq(field.readBufferElement(maps.uA.evaluations, arithmeticIndex(domain, setup, 0, 0, 1)), field.fromBigInt(5n)));
  assert(field.eq(field.readBufferElement(maps.bC.evaluations, connectionIndex(setup, 0, 1)), field.fromBigInt(5n)));

  const arithmeticLift = await buildArithmeticWireLift(field, domain, setup, 0, subcircuits[0]!, 1, "A");
  assert(field.eq(field.readBufferElement(arithmeticLift.evaluations, arithmeticIndex(domain, setup, 0, 0, 1)), field.one));
  const connectionLift = await buildConnectionWireLift(field, domain, setup, 0, subcircuits[0]!, 1);
  assert(field.eq(field.readBufferElement(connectionLift.evaluations, connectionIndex(setup, 0, 1)), field.one));

  const permutation = [
    { row: 1, col: 0, X: 0, Y: 0 },
    { row: 0, col: 0, X: 0, Y: 1 },
    { row: 0, col: 1, X: 1, Y: 0 },
  ];
  const sC = await buildConnectionPermutationPolynomial(field, domain, setup, selector, permutation, infos);
  assert(field.eq(
    field.readBufferElement(sC.evaluations, connectionIndex(setup, 0, 1)),
    field.pow(domain.connectionRoot, connectionIndex(setup, 0, 0)),
  ));
  const [fC, gC] = await buildConnectionCopyFactors(field, maps.bC, sC, field.fromBigInt(7n), field.fromBigInt(11n));
  assert.equal(field.bufferElementCount(fC), domain.connectionSize);
  assert.equal(field.bufferElementCount(gC), domain.connectionSize);

  await assert.rejects(
    buildWitnessMaps(field, domain, setup, selector, [witness(0, [2, 5, 0, 0]), witnesses[1]!], subcircuits),
    /wire zero/,
  );
  await assert.rejects(
    buildConnectionPermutationPolynomial(field, domain, setup, selector, permutation.slice(1), infos),
    /Exactly one public coordinate/,
  );
} finally {
  await runtime.terminate();
}
console.log("Checked normalized witness maps, public-and-bus permutation topology, and copy factors");

function info(
  id: number,
  name: string,
  Out_idx: readonly [number, number],
  In_idx: readonly [number, number],
  Public_idx: readonly [number, number],
  bufferDirection?: "in" | "out",
  publicPhase?: string,
): ProverSubcircuitInfo {
  return {
    id, name, Nwires: 4, NrealWires: 2, Nconsts: id === 0 ? 2 : 0,
    Out_idx, In_idx, Wiring_idx: [0, 2], Public_idx, Internal_idx: [2, 0],
    ...(bufferDirection === undefined ? {} : { bufferDirection }),
    ...(publicPhase === undefined ? {} : { publicPhase }),
  };
}

function matrix(activeWires: readonly number[], rows: readonly (readonly (readonly [number, number])[])[]): UnivariateSparseMatrix {
  const rowOffsets = [0];
  const columns: number[] = [];
  const coefficients: Uint8Array[] = [];
  for (const row of rows) {
    for (const [column, coefficient] of row) {
      columns.push(column);
      coefficients.push(runtime.Fr.fromBigInt(BigInt(coefficient)));
    }
    rowOffsets.push(columns.length);
  }
  return {
    activeWires,
    rowOffsets: u32(rowOffsets),
    columns: u32(columns),
    coefficients: runtime.Fr.concat(coefficients),
    rowCount: rows.length,
  };
}

function u32(values: readonly number[]): Uint8Array {
  const output = new Uint8Array(values.length * 4);
  const view = new DataView(output.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return output;
}
