import type { WasmCodeBuilder, WasmModuleBuilder } from "../kernel-builder-types.js";
import { FIELD_EVAL_REDUCE, FIELD_EVAL_ROWS } from "../kernel-names.js";

export function installEvaluationKernels(module: WasmModuleBuilder): void {
  buildEvalRowsKernel(module);
  buildEvalReduceKernel(module);
}

function buildEvalRowsKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_EVAL_ROWS);
  for (const name of ["pInput", "xSize", "ySize", "pY", "pRows"]) fn.addParam(name, "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xSize"))),
      code.call("frm_zero", rowPointer(code, "pRows")),
      code.setLocal("y", code.getLocal("ySize")),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.i32_const(0))),
        code.setLocal("y", code.i32_sub(code.getLocal("y"), code.i32_const(1))),
        code.call("frm_mul", rowPointer(code, "pRows"), code.getLocal("pY"), temporary),
        code.call("frm_add", coefficientPointer(code, "pInput"), temporary, rowPointer(code, "pRows")),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(FIELD_EVAL_ROWS);
}

function buildEvalReduceKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_EVAL_REDUCE);
  for (const name of ["pRows", "xSize", "pX", "pOut"]) fn.addParam(name, "i32");
  fn.addLocal("x", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  fn.addCode(...evalReduceLoop(code, temporary, "pRows", "pX", "pOut"));
  module.exportFunction(FIELD_EVAL_REDUCE);
}

function evalReduceLoop(
  code: WasmCodeBuilder,
  temporary: unknown,
  rows: string,
  point: string,
  output: string,
): unknown[] {
  return [
    code.call("frm_zero", code.getLocal(output)),
    code.setLocal("x", code.getLocal("xSize")),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.i32_const(0))),
      code.setLocal("x", code.i32_sub(code.getLocal("x"), code.i32_const(1))),
      code.call("frm_mul", code.getLocal(output), code.getLocal(point), temporary),
      code.call("frm_add", rowPointer(code, rows), temporary, code.getLocal(output)),
      code.br(0),
    )),
  ];
}

function coefficientPointer(code: WasmCodeBuilder, base: string): unknown {
  return code.i32_add(
    code.getLocal(base),
    code.i32_mul(code.i32_add(code.i32_mul(code.getLocal("x"), code.getLocal("ySize")), code.getLocal("y")), code.i32_const(32)),
  );
}

function rowPointer(code: WasmCodeBuilder, base: string): unknown {
  return code.i32_add(code.getLocal(base), code.i32_mul(code.getLocal("x"), code.i32_const(32)));
}
