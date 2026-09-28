import type { SetupParams } from "../artifacts/setup/setup-params.js";
import type { CurveRuntime } from "../runtime/curve/curve.js";
import type { FieldElement } from "../runtime/field/field-types.js";
import type { G1Point } from "../runtime/group/group.js";
import { coalesceAffineMsmChunks, msmAffineMontgomeryChunks, type AffineMontgomeryMsmChunk } from "../runtime/group/affine-msm.js";
import { PublicWireLayout } from "../prover/protocol/public-wire-layout.js";
import {
  retainedNonpublicWires,
  retainedWeightedWires,
} from "../prover/protocol/subcircuit-library-validation.js";
import type { ProverPlacementVariables, ProverSubcircuitInfo } from "../prover/protocol/witness.js";
import { placementCount, placementSubcircuitId, placementVariableAt, placementVariableCount } from "../prover/protocol/witness.js";
import { commitDenseUnivariatePolynomial, commitSharedCoefficients } from "./commitments.js";
import type { UnivariateProverCrsRuntime } from "./crs.js";
import { deriveUnivariateDomainShape } from "./domain.js";
import { DenseUnivariatePolynomial } from "./polynomial.js";
import { arithmeticQuotient, copyProductQuotient } from "./quotients.js";
import { type UnivariateProof } from "./proof.js";
import {
  buildConnectionPermutationPolynomial,
  buildWitnessMaps,
  type DenseDomainPolynomial,
  type UnivariateSlotWitness,
  type UnivariateSubcircuit,
} from "./relation.js";
import { SelectedRoots } from "./selected-roots.js";
import { encodeEvaluationMessageBlock, encodeG1MessageBlock, UnivariateTranscript } from "./transcript.js";
import type { UnivariateCrsChunkSection } from "./chunked-crs.js";

export interface UnivariateReferenceProverInput {
  readonly setup: SetupParams;
  readonly selector: readonly (number | null)[];
  readonly permutation: readonly { readonly row: number; readonly col: number; readonly X: number; readonly Y: number }[];
  readonly placements: ProverPlacementVariables;
  readonly subcircuitInfos: readonly ProverSubcircuitInfo[];
  readonly subcircuits: readonly UnivariateSubcircuit[];
  readonly publicInputs: readonly FieldElement[];
  readonly crs: UnivariateProverCrsRuntime;
  readonly chunkPoints: number;
}
/** Correctness-first F1--F5 prover over the current univariate artifacts. */
export async function proveUnivariateReference(runtime: CurveRuntime, input: UnivariateReferenceProverInput): Promise<UnivariateProof> {
  const { setup, crs } = input;
  const field = runtime.Fr;
  const combine = (terms: readonly (readonly [DenseUnivariatePolynomial, FieldElement])[]) => DenseUnivariatePolynomial.linearCombination(field, terms);
  const opening = async (poly: DenseUnivariatePolynomial, point: FieldElement) => DenseUnivariatePolynomial.fromCoefficients(field, (await field.ruffiniYBuffer(poly.coefficients, poly.degree + 1, point)).quotient);
  const domain = deriveUnivariateDomainShape(field, setup);
  const layout = PublicWireLayout.derive(setup, input.subcircuitInfos);
  const freePublicLength = layout.freePublicLen();
  const d = Math.max(domain.arithmeticSize, domain.connectionSize) + 1;
  const p = Math.max(2 * d + 1, setup.s * setup.t + 1, d + 1 + setup.s * (setup.t - 1), freePublicLength - 1);
  const k = p - d;
  if(crs.s0.elementCount !== 2 * p + 1 || crs.sxi.elementCount !== p + 1 || crs.spsi.elementCount !== p + 1)
    throw new Error("CRS sequence capacity does not match the library.");
  const sC = await buildConnectionPermutationPolynomial(field, domain, setup, input.selector, input.permutation, input.subcircuitInfos);
  const slots = selectWitnessSlots(field, input.selector, input.placements, input.subcircuits, setup);
  const maps = await buildWitnessMaps(field, domain, setup, input.selector, slots, input.subcircuits);
  validatePublicStatement(runtime, input, slots, layout);
  const masks = await Promise.all(Array.from({ length: 4 }, () => randomPolynomial(runtime, 2)));
  const maskR = await randomPolynomial(runtime, 4);
  const selectionMask = await runtime.randomScalar();
  const uHat = blind(field, DenseUnivariatePolynomial.fromCoefficients(field, maps.uA.coefficients), masks[0]!, domain.arithmeticSize);
  const vHat = blind(field, DenseUnivariatePolynomial.fromCoefficients(field, maps.vA.coefficients), masks[1]!, domain.arithmeticSize);
  const wHat = blind(field, DenseUnivariatePolynomial.fromCoefficients(field, maps.wA.coefficients), masks[2]!, domain.arithmeticSize);
  const bHat = blind(field, DenseUnivariatePolynomial.fromCoefficients(field, maps.bC.coefficients), masks[3]!, domain.connectionSize);
  const qA = await arithmeticQuotient(field, domain.arithmeticSize,
    maps.uA, maps.vA, maps.wA, masks[0]!, masks[1]!, masks[2]!);
  const a = DenseUnivariatePolynomial.fromCoefficients(
    field,
    await field.ifftBuffer(field.concat(input.publicInputs.slice(0, freePublicLength))),
  );
  const c = (section: UnivariateCrsChunkSection, poly: DenseUnivariatePolynomial, offset = 0) => commit(runtime, section, offset, poly, input.chunkPoints);
  const add = (...points: G1Point[]) => points.reduce((a, b) => runtime.G1.add(a, b), runtime.G1.zero);
  const cL = add(await c(crs.s0, a), await c(crs.sxi, uHat), await c(crs.spsi, wHat));
  const cH = add(await c(crs.sxi, vHat), await c(crs.spsi, bHat));
  const cO = await buildBinding(runtime, input, slots, layout, masks, selectionMask);
  const roots = await SelectedRoots.create(field, setup, input.selector);
  const weightedWires = retainedWeightedWires(setup, input.subcircuitInfos);
  const witness = field.createZeroBuffer(weightedWires.length * setup.s);
  for(const [row, j] of weightedWires.entries())
    for(let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if(slot && j < field.bufferElementCount(slot.values))
        field.writeBufferElement(witness, row * setup.s + i, field.readBufferElement(slot.values, j));
    }
  const qSelection = await roots.quotients(witness);
  if(crs.weighted.elementCount !== field.bufferElementCount(witness) || crs.weightedShifted.elementCount !== field.bufferElementCount(witness))
    throw new Error("Weighted query cardinality mismatch.");
  const [weightedQ, shiftedQ] = await commitSharedCoefficients(runtime, crs.weighted, crs.weightedShifted, qSelection, input.chunkPoints);
  const dQ = add(weightedQ, runtime.G1.mulScalar(await c(crs.s0, roots.polynomial), selectionMask));
  const dQK = add(shiftedQ, runtime.G1.mulScalar(await c(crs.s0, roots.polynomial, k), selectionMask));
  const transcript = new UnivariateTranscript(field, input.publicInputs.slice(0, freePublicLength));
  transcript.setMessage(encodeG1MessageBlock("F2.a1", runtime.G1, [cL, cH, cO, dQ, dQK]));
  const upsilon = transcript.challenge(1, 0);
  const cD = add(await c(crs.s0, a, k), await c(crs.sxi, await combine([[uHat, field.one], [vHat, upsilon]]), k), await c(crs.spsi, await combine([[wHat, field.one], [bHat, upsilon]]), k));
  transcript.setMessage(encodeG1MessageBlock("F2.a2", runtime.G1, [cD]));
  const [beta, gammaC] = transcript.challengePair(2);
  const copy = await buildCopyRelation(runtime, domain.connectionRoot, domain.connectionSize, maps.bC, sC, beta, gammaC, maskR, masks[3]!);
  const cR = await c(crs.s0, copy.rHat);
  transcript.setMessage(encodeG1MessageBlock("F2.a3", runtime.G1, [cR]));
  const theta = transcript.challenge(3, 0);
  const qHat = await combine([[qA, field.one], [copy.qC0, theta], [copy.qC1, field.mul(theta, theta)]]);
  const cQ = await c(crs.s0, qHat);
  transcript.setMessage(encodeG1MessageBlock("F2.a4", runtime.G1, [cQ]));
  const chi = transcript.zeta(domain.arithmeticSize, domain.connectionSize);
  const scPoly = DenseUnivariatePolynomial.fromCoefficients(field, sC.coefficients);
  const evaluate = (poly: DenseUnivariatePolynomial, point: FieldElement) => field.evaluatePolynomialBuffer(poly.coefficients, 1, poly.degree + 1, field.one, point);
  const evaluations = await Promise.all([evaluate(scPoly, chi), evaluate(uHat, chi), evaluate(vHat, chi), evaluate(wHat, chi), evaluate(bHat, chi),
    evaluate(copy.rHat, chi), evaluate(copy.rHat, field.mul(domain.connectionRoot, chi))] as const);
  transcript.setMessage(encodeEvaluationMessageBlock(field, evaluations));
  const varpi = transcript.challenge(5, 0);
  const ordinary = await combine([[a, field.one], [copy.rHat, field.pow(varpi, 2)], [qHat, field.pow(varpi, 3)], [scPoly, field.pow(varpi, 4)]]);
  const piChi = add(await c(crs.s0, await opening(ordinary, chi)), await c(crs.sxi, await opening(await combine([[uHat, field.one], [vHat, varpi]]), chi)), await c(crs.spsi, await opening(await combine([[wHat, field.one], [bHat, varpi]]), chi)));
  const piPlus = await c(crs.s0, await opening(copy.rHat, field.mul(domain.connectionRoot, chi)));
  transcript.setMessage(encodeG1MessageBlock("F2.a6", runtime.G1, [piChi, piPlus]));
  transcript.nonzeroChallenge(6, 0);
  return { g1: [cL, cH, cO, dQ, dQK, cD, cR, cQ, piChi, piPlus], evaluations };
}

function selectWitnessSlots(
  field: CurveRuntime["Fr"],
  selector: readonly (number | null)[],
  placements: ProverPlacementVariables,
  subcircuits: readonly UnivariateSubcircuit[],
  setup: SetupParams,
): readonly (UnivariateSlotWitness | null)[] {
  if (selector.length !== setup.s) throw new Error("Selector length does not match setup capacity.");
  const slots: (UnivariateSlotWitness | null)[] = [];
  let cursor = 0;
  for (const selected of selector) {
    if (selected === null) {
      slots.push(null);
      continue;
    }
    if (cursor >= placementCount(placements) || placementSubcircuitId(placements, cursor) !== selected) {
      throw new Error("Selector and compact placement list do not describe the same active slots.");
    }
    const subcircuit = subcircuits[selected];
    const count = placementVariableCount(placements, cursor);
    if (subcircuit === undefined || count !== setup.m) {
      throw new Error("Placement witness width does not match the selected subcircuit.");
    }
    const values = field.createZeroBuffer(count);
    for (let index = 0; index < count; index += 1) {
      field.writeBufferElement(values, index, placementVariableAt(placements, cursor, index));
    }
    slots.push({ subcircuitId: selected, values });
    cursor += 1;
  }
  if (cursor !== placementCount(placements)) throw new Error("Placement list has entries without selector slots.");
  return slots;
}

function blind(
  field: CurveRuntime["Fr"],
  base: DenseUnivariatePolynomial,
  randomizer: DenseUnivariatePolynomial,
  domainSize: number,
): DenseUnivariatePolynomial {
  const coefficients = field.createZeroBuffer(Math.max(base.degree, domainSize + randomizer.degree) + 1);
  coefficients.set(base.coefficients);
  for (let i = 0; i <= randomizer.degree; i++) {
    const mask = field.readBufferElement(randomizer.coefficients, i);
    field.writeBufferElement(coefficients, i, field.sub(field.readBufferElement(coefficients, i), mask));
    field.writeBufferElement(coefficients, domainSize + i, field.add(field.readBufferElement(coefficients, domainSize + i), mask));
  }
  return DenseUnivariatePolynomial.fromCoefficients(field, coefficients);
}

async function randomPolynomial(runtime: CurveRuntime, length: number): Promise<DenseUnivariatePolynomial> {
  return DenseUnivariatePolynomial.fromCoefficients(
    runtime.Fr,
    runtime.Fr.concat(await Promise.all(Array.from({ length }, () => runtime.randomScalar()))),
  );
}
async function buildCopyRelation(runtime: CurveRuntime, root: FieldElement, domainSize: number, b: DenseDomainPolynomial, sC: DenseDomainPolynomial, beta: FieldElement, gammaC: FieldElement, maskR: DenseUnivariatePolynomial, maskB: DenseUnivariatePolynomial): Promise<{
  readonly rHat: DenseUnivariatePolynomial;
  readonly qC0: DenseUnivariatePolynomial;
  readonly qC1: DenseUnivariatePolynomial;
}> {
  const field = runtime.Fr;
  const { evaluations: rEvals, numerators, denominators } = await buildCopyRecurrence(field, root, domainSize, b.evaluations, sC.evaluations, beta, gammaC);
  const rBase = DenseUnivariatePolynomial.fromCoefficients(field, await field.ifftBuffer(rEvals));
  const rHat = blind(field, rBase, maskR, domainSize);
  const sCPoly = DenseUnivariatePolynomial.fromCoefficients(field, sC.coefficients);
  const bBase = DenseUnivariatePolynomial.fromCoefficients(field, b.coefficients);
  const fBase = await DenseUnivariatePolynomial.linearCombination(field, [[bBase, field.one], [sCPoly, beta], [constant(field, gammaC), field.one]]);
  const gBase = await DenseUnivariatePolynomial.linearCombination(field, [[bBase, field.one], [linear(field, gammaC, beta), field.one]]);
  const qC0 = await copyBoundaryQuotient(field, rHat, domainSize);
  const qC1 = await copyProductQuotient(field, domainSize, root,
    { coefficients: rBase.coefficients, evaluations: rEvals },
    { coefficients: fBase.coefficients, evaluations: numerators },
    { coefficients: gBase.coefficients, evaluations: denominators }, maskR, maskB);
  return { rHat, qC0, qC1 };
}

export async function buildCopyRecurrence(field: CurveRuntime["Fr"], root: FieldElement, domainSize: number, b: Uint8Array, sC: Uint8Array, beta: FieldElement, gammaC: FieldElement): Promise<{ readonly evaluations: Uint8Array; readonly numerators: Uint8Array; readonly denominators: Uint8Array }> {
  if (field.bufferElementCount(b) !== domainSize || field.bufferElementCount(sC) !== domainSize)
    throw new Error("Copy operand length does not match the connection domain.");
  const { numerators, denominators } = await field.copyOperandsBuffer(b, sC, root, beta, gammaC);
  for(let index = 0; index < domainSize; index += 1) {
    if(field.isZero(field.readBufferElement(denominators, index)))
      throw new Error(`Copy recursion denominator vanishes at index ${index}.`);
  }
  const evaluations = await field.orderedRecurrenceBuffer(numerators, await field.batchInverseBuffer(denominators));
  const last = domainSize - 1;
  if (!field.eq(field.mul(field.readBufferElement(evaluations, last), field.readBufferElement(numerators, last)), field.readBufferElement(denominators, last)))
    throw new Error("Copy recursion does not close around the connection domain.");
  return { evaluations, numerators, denominators };
}

/** L_0=(X^N-1)/(N*(X-1)); cancel only after checking R_hat(1)=1. */
export async function copyBoundaryQuotient(field: CurveRuntime["Fr"], rHat: DenseUnivariatePolynomial, domainSize: number): Promise<DenseUnivariatePolynomial> {
  const boundary = await field.ruffiniYBuffer(rHat.coefficients, rHat.degree + 1, field.one);
  if (!field.eq(boundary.remainder, field.one)) throw new Error("Copy boundary R_hat(1) must equal one.");
  return DenseUnivariatePolynomial.fromCoefficients(field,
    await field.batchScaleBuffer(boundary.quotient, field.inv(field.fromBigInt(BigInt(domainSize)))));
}

async function buildBinding(runtime: CurveRuntime, input: UnivariateReferenceProverInput, slots: readonly (UnivariateSlotWitness | null)[], layout: PublicWireLayout, masks: readonly DenseUnivariatePolynomial[], selectionMask: FieldElement): Promise<G1Point> {
  const f = runtime.Fr, { setup, crs } = input;
  const free = input.publicInputs.slice(0, layout.freePublicLen()).filter((_, g) => layout.sourceForPublicWire(g) !== undefined);
  if(crs.freePublic.elementCount !== free.length)
    throw new Error("Free-public query cardinality mismatch.");
  const wireLists = input.subcircuitInfos.map(retainedNonpublicWires);
  const perPlacement = wireLists.reduce((n, list) => n + list.length, 0);
  if(crs.nonpublic.elementCount !== perPlacement * setup.s)
    throw new Error("Nonpublic query cardinality mismatch.");
  async function* sources(): AsyncIterable<AffineMontgomeryMsmChunk> {
    if (free.length) yield { bases: await crs.freePublic.readElements(0, free.length), montgomeryScalars: f.concat(free) };
    for(let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if(!slot) continue;
      const prefix = wireLists.slice(0, slot.subcircuitId).reduce((n, list) => n + list.length, 0);
      const wires = wireLists[slot.subcircuitId]!;
      for (let first = 0; first < wires.length; first += input.chunkPoints) {
        const count = Math.min(input.chunkPoints, wires.length - first);
        yield { bases: await crs.nonpublic.readElements(i * perPlacement + prefix + first, count), montgomeryScalars: f.concat(wires.slice(first, first + count).map(j => f.readBufferElement(slot.values, j))) };
      }
    }
    for(let i = 0; i < 4; i++)
      yield { bases: await crs.masks[i]!.readElements(0, f.bufferElementCount(masks[i]!.coefficients)), montgomeryScalars: masks[i]!.coefficients };
    yield { bases: crs.maskSelection, montgomeryScalars: selectionMask };
  }
  return msmAffineMontgomeryChunks(runtime, coalesceAffineMsmChunks(sources(), input.chunkPoints));
}
function validatePublicStatement(runtime: CurveRuntime, input: UnivariateReferenceProverInput, slots: readonly (UnivariateSlotWitness | null)[], layout: PublicWireLayout): void {
  if(input.publicInputs.length !== layout.length())
    throw new Error("Public statement length mismatch.");
  const publicIds = new Set(layout.segments().map(s => s.subcircuitId));
  for(const [i, slot] of slots.entries())
    if(slot && publicIds.has(slot.subcircuitId) && i !== slot.subcircuitId)
      throw new Error("Public buffer appears outside its fixed placement.");
  for(let g = 0; g < layout.length(); g++) {
    const source = layout.sourceForPublicWire(g);
    let expected = runtime.Fr.zero;
    if(source) {
      // Public wires alone specialize placement index == subcircuit ID.
      const slot = slots[source.subcircuitId];
      if(!slot || slot.subcircuitId !== source.subcircuitId)
        throw new Error("Missing fixed public-buffer placement.");
      expected = runtime.Fr.readBufferElement(slot.values, source.localWireIndex);
    }
    if(!runtime.Fr.eq(expected, input.publicInputs[g]!))
      throw new Error("Public input differs from witness or structural zero padding.");
  }
}

async function commit(
  runtime: CurveRuntime,
  powers: UnivariateCrsChunkSection,
  offset: number,
  polynomial: DenseUnivariatePolynomial,
  chunkPoints: number,
): Promise<G1Point> {
  if (offset < 0 || offset + polynomial.degree + 1 > powers.elementCount) throw new Error("CRS sequence is too short for a commitment.");
  return commitDenseUnivariatePolynomial(runtime, powers, polynomial.coefficients, chunkPoints, offset);
}

function constant(field: CurveRuntime["Fr"], value: FieldElement): DenseUnivariatePolynomial {
  return DenseUnivariatePolynomial.fromCoefficients(field, field.concat([value]));
}

function linear(field: CurveRuntime["Fr"], constantTerm: FieldElement, linearTerm: FieldElement): DenseUnivariatePolynomial {
  return DenseUnivariatePolynomial.fromCoefficients(field, field.concat([constantTerm, linearTerm]));
}
