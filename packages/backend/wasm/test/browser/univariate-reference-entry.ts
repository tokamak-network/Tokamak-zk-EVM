import * as prover from "../../src/prover/index.js";
import * as preprocess from "../../src/preprocess/index.js";
import * as verifier from "../../src/verifier/index.js";
declare global {
  interface Window {
    __tokamakUnivariateReferenceResult?: Result;
  }
}
interface Result {
  readonly status: "pending" | "ok" | "error";
  readonly stage?: string;
  readonly valid?: boolean;
  readonly proof?: readonly number[];
  readonly preprocess?: readonly number[];
  readonly timings?: readonly {
    label: string;
    ms: number;
  }[];
  readonly error?: string;
}
window.__tokamakUnivariateReferenceResult = { status: "pending", stage: "loading" };
const binary = async (name: string) => {
  const response = await fetch("/p8/" + name);
  if(!response.ok)
    throw new Error("Cannot load " + name);
  return new Uint8Array(await response.arrayBuffer());
};
function format(error: unknown): string {
  if(!(error instanceof Error))
    return String(error);
  const cause = (error as Error & {
    cause?: unknown;
  }).cause;
  return (error.stack ?? error.message) + (cause ? "\nCaused by: " + format(cause) : "");
}
async function main() {
  const timings: {
    label: string;
    ms: number;
  }[] = [];
  const timed = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    window.__tokamakUnivariateReferenceResult = { status: "pending", stage: label, timings };
    document.getElementById("status")!.textContent = label;
    const start = performance.now();
    const value = await fn();
    timings.push({ label, ms: performance.now() - start });
    return value;
  };
  const [instance, witness, selector, permutation, nativeProof, nativePreprocess] = await Promise.all(["instance.bin", "witness.bin", "selector.bin", "permutation.bin", "native-proof.bin", "native-preprocess.bin"].map(binary));
  const manifest = await (await fetch("/p8/crs/univariate-crs-manifest.json")).json();
  const crs = { manifest, loadChunk: (path: string) => binary("crs/" + path) };
  await timed("install", async () => { await preprocess.install(); await prover.install(); await verifier.install(); });
  if(!await timed("native proof -> browser verify", () => verifier.verify({ proof: nativeProof!, instance: instance!, verifierPreprocess: nativePreprocess! })))
    throw new Error("Native proof rejected.");
  const pre = await timed("browser preprocess", () => preprocess.preprocess({ instance: instance!, selector: selector!, permutation: permutation!, preprocessCrs: crs }));
  if(pre.length !== nativePreprocess!.length || pre.some((b, i) => b !== nativePreprocess![i]))
    throw new Error("Native/browser preprocess bytes differ.");
  const proof = await timed("browser prove", () => prover.prove({ instance: instance!, witness: witness!, selector: selector!, permutation: permutation!, proverCrs: crs }));
  const valid = await timed("browser proof -> browser verify", () => verifier.verify({ proof, instance: instance!, verifierPreprocess: pre }));
  if(!valid)
    throw new Error("Browser proof rejected.");
  window.__tokamakUnivariateReferenceResult = { status: "ok", valid, timings, proof: Array.from(proof), preprocess: Array.from(pre) };
  document.getElementById("status")!.textContent = "All native/browser cross-checks passed.";
}
main().catch(error => {
  window.__tokamakUnivariateReferenceResult = { status: "error", error: format(error) };
  document.getElementById("status")!.textContent = format(error);
});
