interface ProverCrsWorkerSuccess {
  readonly ok: true;
  readonly artifactBuffer: ArrayBuffer;
  readonly byteOffset: number;
  readonly byteLength: number;
}

interface ProverCrsWorkerFailure {
  readonly ok: false;
  readonly error: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
  };
}

type ProverCrsWorkerResponse = ProverCrsWorkerSuccess | ProverCrsWorkerFailure;

export async function convertProverCrs(rkyvBytes: Uint8Array): Promise<Uint8Array> {
  if (!(rkyvBytes instanceof Uint8Array)) {
    throw new TypeError("convertProverCrs requires a Uint8Array.");
  }

  if (!(rkyvBytes.buffer instanceof ArrayBuffer)) {
    throw new TypeError("convertProverCrs requires a transferable ArrayBuffer-backed Uint8Array.");
  }

  const worker = new Worker(new URL("./prover-crs-converter-worker.js", import.meta.url), {
    name: "tokamak-prover-crs-converter",
    type: "module",
  });

  try {
    return await runConversion(worker, rkyvBytes);
  } finally {
    worker.terminate();
  }
}

function runConversion(worker: Worker, rkyvBytes: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ProverCrsWorkerResponse>): void => {
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

      resolve(new Uint8Array(response.artifactBuffer, response.byteOffset, response.byteLength));
    };

    worker.onerror = (event): void => {
      reject(new Error(event.message || "Prover CRS converter Worker failed."));
    };

    worker.onmessageerror = (): void => {
      reject(new Error("Prover CRS converter Worker returned an unreadable response."));
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
