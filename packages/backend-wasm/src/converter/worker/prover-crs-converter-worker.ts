import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";
import initRkyvDecoder, {
  decodeCombinedSigma,
} from "./rkyv-decoder/backend_wasm_rkyv_decoder.js";
import {
  convertCombinedSigmaRkyvToProverCrsBinary,
  createCombinedSigmaRkyvPayloadDecoder,
} from "../conversion/rkyv-to-binary.js";

interface ProverCrsWorkerRequest {
  readonly inputBuffer: ArrayBuffer;
  readonly byteOffset: number;
  readonly byteLength: number;
}

interface ProverCrsWorkerScope {
  onmessage: ((event: MessageEvent<ProverCrsWorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  close(): void;
}

const worker = self as unknown as ProverCrsWorkerScope;

worker.onmessage = async (event: MessageEvent<ProverCrsWorkerRequest>): Promise<void> => {
  try {
    await initRkyvDecoder();
    const input = new Uint8Array(
      event.data.inputBuffer,
      event.data.byteOffset,
      event.data.byteLength,
    );
    const artifact = await convertCombinedSigmaRkyvToProverCrsBinary(input, {
      sourcePackageVersion: BACKEND_WASM_PACKAGE_VERSION,
      decoder: createCombinedSigmaRkyvPayloadDecoder(decodeCombinedSigma),
    });
    const artifactBuffer = transferableBuffer(artifact);

    worker.postMessage(
      {
        ok: true,
        artifactBuffer,
        byteOffset: artifact.byteOffset,
        byteLength: artifact.byteLength,
      },
      [artifactBuffer],
    );
  } catch (error) {
    worker.postMessage({
      ok: false,
      error: serializeError(error),
    });
  } finally {
    worker.close();
  }
};

function transferableBuffer(bytes: Uint8Array): ArrayBuffer {
  if (!(bytes.buffer instanceof ArrayBuffer)) {
    throw new TypeError("Prover CRS artifact must use a transferable ArrayBuffer.");
  }

  return bytes.buffer;
}

function serializeError(error: unknown): {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "Error",
    message: String(error),
  };
}
