import type { CurveRuntime } from '../../runtime/curve/curve.js';
import type { PreprocessComputation, PreprocessRuntimeInput } from './runtime-input.js';
import { commitDenseUnivariatePolynomial } from '../../univariate/commitments.js';
import { deriveUnivariateDomainShape } from '../../univariate/domain.js';
import { buildConnectionPermutationPolynomial } from '../../univariate/relation.js';
import { SelectedRoots } from '../../univariate/selected-roots.js';
import { PublicWireLayout } from '../../prover/protocol/public-wire-layout.js';

export interface PreprocessSnarkOptions {
  readonly denseMsmChunkPoints?: number;
}
export async function preprocessSnark(runtime: CurveRuntime, input: PreprocessRuntimeInput, options: PreprocessSnarkOptions = {}): Promise<PreprocessComputation> {
  const chunkPoints = options.denseMsmChunkPoints ?? 1 << 18;
  const f = runtime.Fr, { setup, crs } = input;
  const domain = deriveUnivariateDomainShape(f, setup);
  const roots = await SelectedRoots.create(f, setup, input.selector);
  const permutation = await buildConnectionPermutationPolynomial(
    f, domain, setup, input.selector, input.permutation, input.subcircuitInfos,
  );
  if(crs.sc.elementCount !== domain.connectionSize || crs.selection.elementCount !== setup.s * (setup.t - 1) + 1)
    throw new Error("Preprocess key cardinality mismatch.");
  const layout = PublicWireLayout.derive(setup, input.subcircuitInfos);
  if(input.publicInputs.length !== layout.length())
    throw new Error("Public instance length mismatch.");
  const fixed: Uint8Array[] = [];
  for(let g = layout.freePublicLen(); g < layout.length(); g++) {
    const source = layout.sourceForPublicWire(g);
    if(source) {
      if(input.selector[source.subcircuitId] !== source.subcircuitId)
        throw new Error("Fixed public buffer must occupy its matching placement.");
      fixed.push(input.publicInputs[g]!);
    }
    else if(!f.isZero(input.publicInputs[g]!))
      throw new Error("Public structural padding must be zero.");
  }
  if(crs.fixedPublic.elementCount !== fixed.length)
    throw new Error("Fixed-public query cardinality mismatch.");
  const sC = await commitDenseUnivariatePolynomial(runtime, crs.sc, permutation.coefficients, chunkPoints);
  const cFix = fixed.length === 0 ? runtime.G1.zero : await commitDenseUnivariatePolynomial(runtime, crs.fixedPublic, f.concat(fixed), chunkPoints);
  const zu = roots.unselected();
  let eKappa = runtime.G2.zero;
  const count = f.bufferElementCount(zu.coefficients);
  for(let first = 0; first < count; first += chunkPoints) {
    const n = Math.min(chunkPoints, count - first);
    const bases = await crs.selection.readElements(first, n);
    const scalars = await f.batchFromMontgomeryBuffer(zu.coefficients.subarray(first * f.byteLength, (first + n) * f.byteLength));
    eKappa = runtime.G2.add(eKappa, await runtime.G2.msmAffineRaw(bases, scalars));
  }
  return { sC, cFix, eKappa };
}
