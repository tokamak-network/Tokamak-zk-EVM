export type BackendWasmErrorCode =
  | "INSTALL_REQUIRED"
  | "INSTALL_FAILED"
  | "BUSY"
  | "INVALID_OPTION"
  | "INVALID_INPUT"
  | "RUNTIME_FAILED";

export class BackendWasmError extends Error {
  readonly code: BackendWasmErrorCode;
  readonly cause?: unknown;

  constructor(
    code: BackendWasmErrorCode,
    message: string,
    options: { readonly cause?: unknown } = {},
  ) {
    super(message);
    this.name = "BackendWasmError";
    this.code = code;
    this.cause = options.cause;
  }
}
