export interface WasmCodeBuilder {
  i32_const(value: number): unknown;
  getLocal(name: string): unknown;
  setLocal(name: string, value: unknown): unknown;
  i32_add(left: unknown, right: unknown): unknown;
  i32_sub(left: unknown, right: unknown): unknown;
  i32_mul(left: unknown, right: unknown): unknown;
  i32_rem_u(left: unknown, right: unknown): unknown;
  i32_eq(left: unknown, right: unknown): unknown;
  i32_ge_u(left: unknown, right: unknown): unknown;
  i32_gt_u(left: unknown, right: unknown): unknown;
  i32_lt_u(left: unknown, right: unknown): unknown;
  i32_load(pointer: unknown): unknown;
  call(name: string, ...params: unknown[]): unknown;
  br(depth: number): unknown;
  br_if(depth: number, condition: unknown): unknown;
  block(code: unknown): unknown;
  loop(...code: unknown[]): unknown;
  if(condition: unknown, thenCode: unknown): unknown;
}

export interface ModuleFunctionBuilder {
  addParam(name: string, type: "i32"): void;
  addLocal(name: string, type: "i32"): void;
  getCodeBuilder(): WasmCodeBuilder;
  addCode(...code: unknown[]): void;
}

export interface WasmModuleBuilder {
  alloc(size: number): number;
  addFunction(name: string): ModuleFunctionBuilder;
  exportFunction(name: string): void;
}
