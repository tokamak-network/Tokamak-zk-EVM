import initRkyvDecoder, {
  decodeCombinedSigma,
} from "../../../tools/rkyv-decoder-wasm/pkg/backend_wasm_rkyv_decoder.js";

import {
  createCombinedSigmaRkyvPayloadDecoder,
} from "../../../src/converter/conversion/rkyv-to-binary.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../../src/version.js";
import { convertDecodedCombinedSigmaWithBatchMontgomery } from "./conversion-candidate.js";

interface WorkerRequest {
  readonly inputBuffer: ArrayBuffer;
  readonly byteOffset: number;
  readonly byteLength: number;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>): Promise<void> => {
  try {
    await initRkyvDecoder();
    const source = new Uint8Array(
      event.data.inputBuffer,
      event.data.byteOffset,
      event.data.byteLength,
    );
    const decoder = createCombinedSigmaRkyvPayloadDecoder(decodeCombinedSigma);
    const decoded = await decoder.decodeCombinedSigma(source);
    const artifact = await convertDecodedCombinedSigmaWithBatchMontgomery(
      source,
      decoded,
      BACKEND_WASM_PACKAGE_VERSION,
    );
    if (!(artifact.buffer instanceof ArrayBuffer)) {
      throw new Error("Candidate Prover CRS artifact is not transferable.");
    }
    self.postMessage(
      {
        ok: true,
        artifactBuffer: artifact.buffer,
        byteOffset: artifact.byteOffset,
        byteLength: artifact.byteLength,
      },
      { transfer: [artifact.buffer] },
    );
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
  } finally {
    self.close();
  }
};
