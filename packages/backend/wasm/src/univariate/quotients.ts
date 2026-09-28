import type { FieldElement, FieldRuntime } from "../runtime/field/field-types.js";
import { DenseUnivariatePolynomial as P } from "./polynomial.js";
import type { DenseDomainPolynomial } from "./relation.js";

/** Expand only the short masks; the main arithmetic product stays unmasked. */
export async function arithmeticQuotient(
  field: FieldRuntime, domainSize: number, uInput: DenseDomainPolynomial, vInput: DenseDomainPolynomial, wInput: DenseDomainPolynomial,
  maskU: P, maskV: P, maskW: P,
): Promise<P> {
  // These paired representations come directly from witness-map interpolation.
  // Check divisibility on that original domain before using a disjoint coset.
  const u = P.fromCoefficients(field, uInput.coefficients), v = P.fromCoefficients(field, vInput.coefficients), w = P.fromCoefficients(field, wInput.coefficients);
  for (const [input, polynomial] of [[uInput, u], [vInput, v], [wInput, w]] as const) {
    if (field.bufferElementCount(input.evaluations) !== domainSize || polynomial.degree >= domainSize) throw new Error("Arithmetic polynomial exceeds its interpolation domain.");
  }
  const residue = await field.batchSubBuffer(await field.batchMulBuffer(uInput.evaluations, vInput.evaluations), wInput.evaluations);
  if (residue.some(byte => byte !== 0)) throw new Error("Polynomial is not divisible by the vanishing polynomial.");
  const shift = field.rootOfUnity(2 * domainSize), z = field.sub(field.pow(shift, domainSize), field.one);
  if (field.isZero(z)) throw new Error("Quotient coset intersects the vanishing domain.");
  const evaluate = async (poly: P) => {
    const coefficients = field.createZeroBuffer(domainSize); coefficients.set(poly.coefficients);
    return field.fftBuffer(await field.batchApplyKeyBuffer(coefficients, field.one, shift));
  };
  const uc = await evaluate(u), vc = await evaluate(v), wc = await evaluate(w);
  const numerator = await field.batchSubBuffer(await field.batchMulBuffer(uc, vc), wc);
  // deg(UV-W) <= 2N-2, hence the exact quotient has degree below N.
  const base = P.fromCoefficients(field, await field.batchApplyKeyBuffer(await field.ifftBuffer(numerator), field.inv(z), field.inv(shift)));
  return P.linearCombination(field, [
    [base, field.one], [await u.multiply(maskV), field.one], [await v.multiply(maskU), field.one],
    [(await maskU.multiply(maskV)).multiplyVanishing(domainSize), field.one], [maskW, field.neg(field.one)],
  ]);
}

/** Z(omega*X)=Z(X); preserve every cross term of the masked copy product. */
export async function copyProductQuotient(
  field: FieldRuntime, domainSize: number, root: FieldElement,
  rInput: DenseDomainPolynomial, fInput: DenseDomainPolynomial, gInput: DenseDomainPolynomial, maskR: P, maskB: P,
): Promise<P> {
  if (!field.eq(root, field.rootOfUnity(domainSize))) throw new Error("Copy quotient requires the connection domain's canonical root.");
  const r = P.fromCoefficients(field, rInput.coefficients), f = P.fromCoefficients(field, fInput.coefficients), g = P.fromCoefficients(field, gInput.coefficients);
  if (r.degree >= domainSize || f.degree > domainSize || g.degree > domainSize ||
      [rInput, fInput, gInput].some(p => field.bufferElementCount(p.evaluations) !== domainSize)) throw new Error("Copy product exceeds its interpolation domain.");
  const rotate = (values: Uint8Array) => {
    const out = field.createZeroBuffer(domainSize), offset = (1 % domainSize) * field.byteLength;
    out.set(values.subarray(offset)); out.set(values.subarray(0, offset), values.byteLength - offset);
    return out;
  };
  // The recurrence already supplies these domain values. Keep the exact
  // numerator-zero check: interpolation on a coset alone cannot prove division.
  const residue = await field.batchProductDifferenceBuffer(rotate(rInput.evaluations), gInput.evaluations, rInput.evaluations, fInput.evaluations);
  if (residue.some(byte => byte !== 0)) throw new Error("Polynomial is not divisible by the vanishing polynomial.");
  const shift = field.rootOfUnity(2 * domainSize), shiftN = field.pow(shift, domainSize), z = field.sub(shiftN, field.one);
  if (field.isZero(z) || !field.eq(field.pow(shift, 2), root)) throw new Error("Incompatible quotient coset roots.");
  const evaluate = async (poly: P) => {
    const coefficients = field.createZeroBuffer(domainSize);
    coefficients.set(poly.coefficients.subarray(0, coefficients.byteLength));
    // F/G can have degree N (notably beta*X at N=1). On this coset X^N
    // is constant, so fold that coefficient rather than dropping it.
    if (poly.degree === domainSize) field.writeBufferElement(coefficients, 0, field.add(field.readBufferElement(coefficients, 0), field.mul(field.readBufferElement(poly.coefficients, domainSize), shiftN)));
    return field.fftBuffer(await field.batchApplyKeyBuffer(coefficients, field.one, shift));
  };
  const rc = await evaluate(r), fc = await evaluate(f), gc = await evaluate(g);
  const numerator = await field.batchProductDifferenceBuffer(rotate(rc), gc, rc, fc);
  // deg(R(omega X)G-RF) <= 2N-1, so an exact quotient has degree below N.
  const base = P.fromCoefficients(field, await field.batchApplyKeyBuffer(await field.ifftBuffer(numerator), field.inv(z), field.inv(shift)));
  const shifted = P.fromCoefficients(field, await field.batchApplyKeyBuffer(r.coefficients, field.one, root));
  const shiftedMask = maskR.scaleArgument(root);
  const deltaR = await P.linearCombination(field, [[shifted, field.one], [r, field.neg(field.one)]]);
  return P.linearCombination(field, [
    [base, field.one], [await deltaR.multiply(maskB), field.one],
    [await shiftedMask.multiply(g), field.one], [await maskR.multiply(f), field.neg(field.one)],
    [(await shiftedMask.sub(maskR).multiply(maskB)).multiplyVanishing(domainSize), field.one],
  ]);
}

/** On a 2N-point FFT domain, R(omega_N*X) is R's spectrum rotated by two. */
export async function copyProductDifference(field: FieldRuntime, domainSize: number, r: P, f: P, g: P): Promise<P> {
  const size = 2 * domainSize;
  // These bounds prevent cyclic convolution from aliasing the coefficients.
  if (r.degree >= domainSize || f.degree > domainSize || g.degree > domainSize) throw new Error("Copy product exceeds its interpolation domain.");
  if (!field.eq(field.pow(field.rootOfUnity(size), 2), field.rootOfUnity(domainSize))) throw new Error("Incompatible FFT roots for copy spectrum rotation.");
  const transform = async (p: P) => {
    const padded = field.createZeroBuffer(size);
    padded.set(p.coefficients);
    return field.fftBuffer(padded);
  };
  // Each FFT already uses the runtime's workers; do not launch competing FFT pools.
  const spectrumR = await transform(r), spectrumF = await transform(f), spectrumG = await transform(g);
  const rotated = field.createZeroBuffer(size), offset = (2 % size) * field.byteLength;
  rotated.set(spectrumR.subarray(offset));
  rotated.set(spectrumR.subarray(0, offset), spectrumR.byteLength - offset);
  const difference = await field.batchSubBuffer(await field.batchMulBuffer(rotated, spectrumG), await field.batchMulBuffer(spectrumR, spectrumF));
  return P.fromCoefficients(field, await field.ifftBuffer(difference));
}
