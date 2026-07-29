import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";
import initRkyvDecoder, {
  decodeCombinedSigma,
} from "./rkyv-decoder/backend_wasm_rkyv_decoder.js";
import {
  convertCombinedSigmaRkyvToCrsBinaries,
  createCombinedSigmaRkyvPayloadDecoder,
} from "../conversion/rkyv-to-binary.js";
import { GENERATED_SETUP_PARAMS } from "../../generated/setup.generated.js";

interface CrsWorkerRequest {
  readonly inputBuffer: ArrayBuffer;
  readonly byteOffset: number;
  readonly byteLength: number;
}

interface CrsWorkerScope {
  onmessage: ((event: MessageEvent<CrsWorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  close(): void;
}

const worker = self as unknown as CrsWorkerScope;

worker.onmessage = async (event: MessageEvent<CrsWorkerRequest>): Promise<void> => {
  try {
    await initRkyvDecoder();
    const input = new Uint8Array(
      event.data.inputBuffer,
      event.data.byteOffset,
      event.data.byteLength,
    );
    const artifacts = await convertCombinedSigmaRkyvToCrsBinaries(input, {
      sourcePackageVersion: BACKEND_WASM_PACKAGE_VERSION,
      decoder: createCombinedSigmaRkyvPayloadDecoder(decodeCombinedSigma),
      setup: GENERATED_SETUP_PARAMS,
    });
    const proverCrs = transferableArtifact(artifacts.proverCrs);
    const preprocessCrs = transferableArtifact(artifacts.preprocessCrs);
    const verifierCrs = transferableArtifact(artifacts.verifierCrs);

    worker.postMessage(
      {
        ok: true,
        proverCrs,
        preprocessCrs,
        verifierCrs,
      },
      [proverCrs.buffer, preprocessCrs.buffer, verifierCrs.buffer],
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

function transferableArtifact(bytes: Uint8Array): {
  readonly buffer: ArrayBuffer;
  readonly byteOffset: number;
  readonly byteLength: number;
} {
  if (!(bytes.buffer instanceof ArrayBuffer)) {
    throw new TypeError("CRS artifacts must use transferable ArrayBuffers.");
  }

  return {
    buffer: bytes.buffer,
    byteOffset: bytes.byteOffset,
    byteLength: bytes.byteLength,
  };
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
