import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { convertUnivariateCrsDirectory } from "../../../scripts/converter/convert-univariate-crs.js";
import { prepareFixedVerifier } from "../../../scripts/generate/verifier-fixed.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { parseUnivariatePreprocessCrs, parseUnivariateProverCrs } from "../../../src/univariate/crs.js";
import { preprocessSnark } from "../../../src/preprocess/protocol/preprocess-snark.js";
import { proveUnivariateReference } from "../../../src/univariate/reference-prover.js";
import { verifyUnivariateReference } from "../../../src/univariate/reference-verifier.js";
import { encodeUnivariateProof, decodeUnivariateProof } from "../../../src/univariate/proof.js";
import type { SetupParams } from "../../../src/artifacts/setup/setup-params.js";
import type { ProverSubcircuitInfo } from "../../../src/prover/protocol/witness.js";
import { PublicWireLayout } from "../../../src/prover/protocol/public-wire-layout.js";
// This oracle uses test-only masks exported by the native scalar-oracle test.
// It does not add deterministic randomness to a production entry point.
const root = path.resolve(process.argv[2]!);
for(const name of ["n2", "n8", "singleton"]) {
  const directory = path.join(root, name);
  const output = path.join(await mkdtemp(path.join(directory, "conversion-")), "chunks");
  await convertUnivariateCrsDirectory({ tauSequence: path.join(directory, "tau_sequence.rkyv"), keys: directory, output, chunkBytes: 4096 });
  const fixture: {
    setup: SetupParams;
    infos: ProverSubcircuitInfo[];
    selector: (number | null)[];
    witness: (string[] | null)[];
    publicInputs: string[];
    masks: string[];
  } = JSON.parse(await readFile(path.join(directory, "fixture.json"), "utf8"));
  const runtime = await createCurveRuntime();
  try {
    const f = runtime.Fr;
    const canonical = execFileSync(path.resolve("../target/release/export-verifier"), [path.join(directory, "verifier_keys.rkyv")]);
    const publicLayout = PublicWireLayout.derive(fixture.setup, fixture.infos);
    const fixed = prepareFixedVerifier(runtime, canonical, fixture.setup, publicLayout.freePublicLen());
    const crs = {
      manifest: JSON.parse(await readFile(path.join(output, "univariate-crs-manifest.json"), "utf8")),
      loadChunk: async (name: string) => new Uint8Array(await readFile(path.join(output, name))),
    };
    const words = (values: number[]) => {
      const bytes = new Uint8Array(4 * values.length), view = new DataView(bytes.buffer);
      values.forEach((value, i) => view.setUint32(i * 4, value, true));
      return bytes;
    };
    const matrix = (wire: number) => ({
      activeWires: [0, 1, 2], rowCount: 1, rowOffsets: words([0, 1]),
      columns: words([wire]), coefficients: f.concat([f.one]),
    });
    const subcircuits = fixture.infos.map(info => ({ id: info.id, info, A: matrix(1), B: matrix(0), C: matrix(2) }));
    const active = fixture.witness.flatMap((values, i) => values ? [{ id: fixture.selector[i]!, values }] : []);
    const offsets = [0];
    active.forEach(slot => offsets.push(offsets.at(-1)! + slot.values.length));
    const placements = {
      subcircuitIds: Uint32Array.from(active.map(slot => slot.id)), variableOffsets: Uint32Array.from(offsets),
      variables: f.concat(active.flatMap(slot => slot.values.map(value => f.fromHex(value)))), fieldByteLength: f.byteLength,
    };
    const publicInputs = fixture.publicInputs.map(value => f.fromHex(value));
    const preprocess = await preprocessSnark(runtime, {
      setup: fixture.setup, selector: fixture.selector, permutation: [], publicInputs,
      subcircuitInfos: fixture.infos, crs: await parseUnivariatePreprocessCrs(crs),
    });
    let cursor = 0;
    const maskedRuntime = {
      ...runtime, randomScalar: () => {
        assert.ok(cursor < fixture.masks.length, "Unexpected extra proof mask.");
        return f.fromHex(fixture.masks[cursor++]!);
      }
    };
    const proof = await proveUnivariateReference(maskedRuntime, {
      setup: fixture.setup, selector: fixture.selector, permutation: [], placements,
      subcircuitInfos: fixture.infos, subcircuits, publicInputs,
      crs: await parseUnivariateProverCrs(crs), chunkPoints: 64,
    });
    assert.equal(cursor, 13);
    const bytes = await encodeUnivariateProof(runtime, proof);
    const native = await readFile(path.join(directory, "univariate_proof.bin"));
    assert.deepEqual(bytes, new Uint8Array(native), "Fixed-mask native/WASM proof bytes differ.");
    assert.equal(await verifyUnivariateReference(runtime, {
      fixed, publicInputs: publicInputs.slice(0, publicLayout.freePublicLen()), preprocess, proof: decodeUnivariateProof(runtime, native),
    }), true);
    await writeFile(path.join(directory, "wasm-proof.bin"), bytes);
    console.log("Exact native/WASM proof bytes and verification pass for " + name);
  }
  finally {
    await runtime.terminate();
  }
}
