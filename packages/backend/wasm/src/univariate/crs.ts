import { admitUnivariateCrsChunks, type UnivariateCrsChunkInput, type UnivariateCrsChunkSection } from "./chunked-crs.js";
export interface UnivariatePreprocessCrsRuntime {
  readonly sc: UnivariateCrsChunkSection;
  readonly selection: UnivariateCrsChunkSection;
  readonly fixedPublic: UnivariateCrsChunkSection;
}
export interface UnivariateProverCrsRuntime {
  readonly s0: UnivariateCrsChunkSection;
  readonly sxi: UnivariateCrsChunkSection;
  readonly spsi: UnivariateCrsChunkSection;
  readonly weighted: UnivariateCrsChunkSection;
  readonly weightedShifted: UnivariateCrsChunkSection;
  readonly freePublic: UnivariateCrsChunkSection;
  readonly nonpublic: UnivariateCrsChunkSection;
  readonly masks: readonly UnivariateCrsChunkSection[];
  readonly maskSelection: Uint8Array;
}
export async function parseUnivariatePreprocessCrs(input: UnivariateCrsChunkInput, checkDigests = false): Promise<UnivariatePreprocessCrsRuntime> {
  const crs = admitUnivariateCrsChunks(input, "preprocess", checkDigests);
  return { sc: crs.requireSection("crs.preprocess-sc"), selection: crs.requireSection("crs.preprocess-selection"), fixedPublic: crs.requireSection("crs.fixed-public-queries") };
}
export async function parseUnivariateProverCrs(input: UnivariateCrsChunkInput, checkDigests = false): Promise<UnivariateProverCrsRuntime> {
  const crs = admitUnivariateCrsChunks(input, "prover", checkDigests);
  return {
    s0: crs.requireSection("crs.s0"), sxi: crs.requireSection("crs.sxi"), spsi: crs.requireSection("crs.spsi"),
    weighted: crs.requireSection("crs.weighted"), weightedShifted: crs.requireSection("crs.weighted-shifted"),
    freePublic: crs.requireSection("crs.free-public-queries"), nonpublic: crs.requireSection("crs.nonpublic-queries"),
    masks: ["u", "v", "w", "b"].map(name => crs.requireSection(`crs.mask-${name}`)),
    maskSelection: await crs.requireSection("crs.mask-selection").readElement(0),
  };
}

export type { UnivariateCrsChunkInput } from "./chunked-crs.js";
