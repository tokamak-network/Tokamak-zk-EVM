import type { SetupParams } from "../artifacts/setup/setup-params.js";
import type { FieldRuntime, FieldElement } from "../runtime/field/field-types.js";
import { DenseUnivariatePolynomial as Polynomial } from "./polynomial.js";
/** The s selected roots, including the virtual empty type for inactive slots. */
export class SelectedRoots {
  private constructor(readonly roots: readonly FieldElement[], readonly polynomial: Polynomial, private readonly field: FieldRuntime, private readonly size: number) { }
  static async create(field: FieldRuntime, setup: SetupParams, selector: readonly (number | null)[]): Promise<SelectedRoots> {
    if(selector.length !== setup.s || selector.some(id => id !== null && (!Number.isInteger(id) || id < 0 || id >= setup.t - 1))) {
      throw new Error("Selector must contain compiled IDs or inactive slots at s positions.");
    }
    const size = setup.s * setup.t;
    const root = field.rootOfUnity(size);
    const roots = selector.map((id, i) => field.pow(root, i + setup.s * (id ?? setup.t - 1)));
    let level = roots.map(z => Polynomial.fromCoefficients(field, field.concat([field.neg(z), field.one])));
    while(level.length > 1) {
      const next: Polynomial[] = [];
      for(let i = 0; i < level.length; i += 2)
        next.push(await level[i]!.multiply(level[i + 1]!));
      level = next;
    }
    return new SelectedRoots(roots, level[0]!, field, size);
  }
  /** Divide the selection vanishing polynomial once, only for preprocess. */
  unselected(): Polynomial {
    const f = this.field;
    const remainder = f.createZeroBuffer(this.size + 1);
    f.writeBufferElement(remainder, 0, f.neg(f.one));
    f.writeBufferElement(remainder, this.size, f.one);
    const s = this.roots.length;
    const quotient = f.createZeroBuffer(this.size - s + 1);
    for(let degree = this.size; degree >= s; degree--) {
      const scale = f.readBufferElement(remainder, degree);
      f.writeBufferElement(quotient, degree - s, scale);
      if(f.isZero(scale))
        continue;
      for(let j = 0; j <= s; j++) {
        const index = degree - s + j;
        f.writeBufferElement(remainder, index, f.sub(f.readBufferElement(remainder, index), f.mul(scale, f.readBufferElement(this.polynomial.coefficients, j))));
      }
    }
    for(let i = 0; i < s; i++)
      if(!f.isZero(f.readBufferElement(remainder, i)))
        throw new Error("Selected polynomial does not divide the selection vanishing polynomial.");
    return Polynomial.fromCoefficients(f, quotient);
  }
  /** Shared cofactors avoid a dense m*s*t assignment and per-wire selection FFT. */
  async quotients(wireMajorValues: Uint8Array): Promise<Uint8Array> {
    const f = this.field, s = this.roots.length;
    const count = f.bufferElementCount(wireMajorValues);
    if(count % s !== 0)
      throw new Error("Incomplete selection witness row.");
    const inverse = f.inv(f.fromBigInt(BigInt(this.size)));
    const packed = await f.selectionCofactorsBuffer(this.polynomial.coefficients, f.concat(this.roots), inverse);
    return f.selectionAccumulateBuffer(wireMajorValues, packed, s);
  }
}
