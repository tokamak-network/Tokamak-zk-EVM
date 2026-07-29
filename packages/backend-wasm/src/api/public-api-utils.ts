import { BackendWasmError } from "../backend-wasm-error.js";
import { createCurveRuntime, type CurveRuntime } from "../runtime/curve/curve.js";

const MIN_CHUNK_SIZE_EXPONENT = 10;
const MAX_CHUNK_SIZE_EXPONENT = 19;

export function assertNamedBinaryInput(
  input: unknown,
  owner: string,
  names: readonly string[],
): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BackendWasmError("INVALID_INPUT", `${owner} input must be an object.`);
  }

  const entries = input as Record<string, unknown>;
  for (const name of names) {
    const value = entries[name];
    if (!(value instanceof Uint8Array) || value.byteLength === 0) {
      throw new BackendWasmError(
        "INVALID_INPUT",
        `${owner} input '${name}' must be a non-empty Uint8Array.`,
      );
    }
  }
}

export function parseChunkSizeExponent(
  options: unknown,
  owner: string,
): number | undefined {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new BackendWasmError("INVALID_OPTION", `${owner} install options must be an object.`);
  }

  const entries = options as Record<string, unknown>;
  const unsupported = Object.keys(entries).filter((key) => key !== "chunkSizeExponent");
  if (unsupported.length > 0) {
    throw new BackendWasmError(
      "INVALID_OPTION",
      `Unsupported ${owner.toLowerCase()} install option: ${unsupported.join(", ")}.`,
    );
  }

  const exponent = entries.chunkSizeExponent;
  if (exponent === undefined) {
    return undefined;
  }
  if (
    typeof exponent !== "number"
    || !Number.isInteger(exponent)
    || exponent < MIN_CHUNK_SIZE_EXPONENT
    || exponent > MAX_CHUNK_SIZE_EXPONENT
  ) {
    throw new BackendWasmError(
      "INVALID_OPTION",
      `chunkSizeExponent must be an integer from ${MIN_CHUNK_SIZE_EXPONENT} through ${MAX_CHUNK_SIZE_EXPONENT}.`,
    );
  }
  return exponent;
}

export async function installCurveRuntime(failureMessage: string): Promise<CurveRuntime> {
  try {
    return await createCurveRuntime();
  } catch (cause) {
    throw new BackendWasmError("INSTALL_FAILED", failureMessage, { cause });
  }
}
