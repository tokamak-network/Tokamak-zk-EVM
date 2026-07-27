import type { ConvertedCrs } from "./types.js";

interface CrsWorkerArtifact {
  readonly buffer: ArrayBuffer;
  readonly byteOffset: number;
  readonly byteLength: number;
}

interface CrsWorkerSuccess {
  readonly ok: true;
  readonly proverCrs: CrsWorkerArtifact;
  readonly preprocessCrs: CrsWorkerArtifact;
  readonly verifierCrs: CrsWorkerArtifact;
}

interface CrsWorkerFailure {
  readonly ok: false;
  readonly error: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
  };
}

type CrsWorkerResponse = CrsWorkerSuccess | CrsWorkerFailure;

export async function convertCrs(rkyvBytes: Uint8Array): Promise<ConvertedCrs> {
  if (!(rkyvBytes instanceof Uint8Array)) {
    throw new TypeError("convertCrs requires a Uint8Array.");
  }

  if (!(rkyvBytes.buffer instanceof ArrayBuffer)) {
    throw new TypeError("convertCrs requires a transferable ArrayBuffer-backed Uint8Array.");
  }

  const worker = new Worker(new URL("../worker/crs-converter-worker.js", import.meta.url), {
    name: "tokamak-crs-converter",
    type: "module",
  });

  try {
    return await runConversion(worker, rkyvBytes);
  } finally {
    worker.terminate();
  }
}

function runConversion(worker: Worker, rkyvBytes: Uint8Array): Promise<ConvertedCrs> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<CrsWorkerResponse>): void => {
      const response = event.data;
      if (!response.ok) {
        const error = new Error(response.error.message);
        error.name = response.error.name;
        if (response.error.stack !== undefined) {
          error.stack = response.error.stack;
        }
        reject(error);
        return;
      }

      resolve({
        proverCrs: artifactBytes(response.proverCrs),
        preprocessCrs: artifactBytes(response.preprocessCrs),
        verifierCrs: artifactBytes(response.verifierCrs),
      });
    };

    worker.onerror = (event): void => {
      reject(new Error(event.message || "CRS converter Worker failed."));
    };

    worker.onmessageerror = (): void => {
      reject(new Error("CRS converter Worker returned an unreadable response."));
    };

    worker.postMessage(
      {
        inputBuffer: rkyvBytes.buffer,
        byteOffset: rkyvBytes.byteOffset,
        byteLength: rkyvBytes.byteLength,
      },
      [rkyvBytes.buffer],
    );
  });
}

function artifactBytes(artifact: CrsWorkerArtifact): Uint8Array {
  return new Uint8Array(artifact.buffer, artifact.byteOffset, artifact.byteLength);
}
