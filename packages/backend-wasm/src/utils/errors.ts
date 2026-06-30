export class BackendWasmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendWasmError";
  }
}
