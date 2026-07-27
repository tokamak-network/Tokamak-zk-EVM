import type { WasmCodeBuilder, WasmModuleBuilder } from "../kernel-builder-types.js";
import {
  FIELD_EVAL_REDUCE,
  FIELD_EVAL_REDUCE_FUSED,
  FIELD_EVAL_ROWS,
  FIELD_EVAL_ROWS_FUSED,
} from "../kernel-names.js";

export function installEvaluationKernels(module: WasmModuleBuilder): void {
  buildEvalRowsKernel(module);
  buildEvalRowsFusedKernel(module);
  buildEvalReduceKernel(module);
  buildEvalReduceFusedKernel(module);
}

function buildEvalRowsKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_EVAL_ROWS);
  fn.addParam("pInput", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("pY", "i32");
  fn.addParam("pRows", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xSize"))),
        code.call("frm_zero", evalRowPointer(code, "pRows")),
        code.setLocal("y", code.getLocal("ySize")),
        code.block(
          code.loop(
            code.br_if(1, code.i32_eq(code.getLocal("y"), code.i32_const(0))),
            code.setLocal("y", code.i32_sub(code.getLocal("y"), code.i32_const(1))),
            code.call("frm_mul", evalRowPointer(code, "pRows"), code.getLocal("pY"), temporary),
            code.call(
              "frm_add",
              evalCoefficientPointer(code, "pInput"),
              temporary,
              evalRowPointer(code, "pRows"),
            ),
            code.br(0),
          ),
        ),
        code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
        code.br(0),
      ),
    ),
  );
  module.exportFunction(FIELD_EVAL_ROWS);
}

function buildEvalRowsFusedKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_EVAL_ROWS_FUSED);
  fn.addParam("pInput", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("pY", "i32");
  fn.addParam("pScaledY", "i32");
  fn.addParam("pBaseRows", "i32");
  fn.addParam("pScaledRows", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xSize"))),
        code.call("frm_zero", evalRowPointer(code, "pBaseRows")),
        code.call("frm_zero", evalRowPointer(code, "pScaledRows")),
        code.setLocal("y", code.getLocal("ySize")),
        code.block(
          code.loop(
            code.br_if(1, code.i32_eq(code.getLocal("y"), code.i32_const(0))),
            code.setLocal("y", code.i32_sub(code.getLocal("y"), code.i32_const(1))),
            code.call("frm_mul", evalRowPointer(code, "pBaseRows"), code.getLocal("pY"), temporary),
            code.call(
              "frm_add",
              evalCoefficientPointer(code, "pInput"),
              temporary,
              evalRowPointer(code, "pBaseRows"),
            ),
            code.call(
              "frm_mul",
              evalRowPointer(code, "pScaledRows"),
              code.getLocal("pScaledY"),
              temporary,
            ),
            code.call(
              "frm_add",
              evalCoefficientPointer(code, "pInput"),
              temporary,
              evalRowPointer(code, "pScaledRows"),
            ),
            code.br(0),
          ),
        ),
        code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
        code.br(0),
      ),
    ),
  );
  module.exportFunction(FIELD_EVAL_ROWS_FUSED);
}

function buildEvalReduceKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_EVAL_REDUCE);
  fn.addParam("pRows", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("pX", "i32");
  fn.addParam("pOut", "i32");
  fn.addLocal("x", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  fn.addCode(...evalReduceLoop(code, temporary, "pRows", "pX", "pOut"));
  module.exportFunction(FIELD_EVAL_REDUCE);
}

function buildEvalReduceFusedKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_EVAL_REDUCE_FUSED);
  fn.addParam("pBaseRows", "i32");
  fn.addParam("pScaledRows", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("pX", "i32");
  fn.addParam("pScaledX", "i32");
  fn.addParam("pBaseOut", "i32");
  fn.addParam("pScaledXOut", "i32");
  fn.addParam("pScaledXYOut", "i32");
  fn.addLocal("x", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  fn.addCode(
    ...evalReduceLoop(code, temporary, "pBaseRows", "pX", "pBaseOut"),
    ...evalReduceLoop(code, temporary, "pBaseRows", "pScaledX", "pScaledXOut"),
    ...evalReduceLoop(code, temporary, "pScaledRows", "pScaledX", "pScaledXYOut"),
  );
  module.exportFunction(FIELD_EVAL_REDUCE_FUSED);
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
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("x"), code.i32_const(0))),
        code.setLocal("x", code.i32_sub(code.getLocal("x"), code.i32_const(1))),
        code.call("frm_mul", code.getLocal(output), code.getLocal(point), temporary),
        code.call("frm_add", evalRowPointer(code, rows), temporary, code.getLocal(output)),
        code.br(0),
      ),
    ),
  ];
}

function evalCoefficientPointer(code: WasmCodeBuilder, base: string): unknown {
  return code.i32_add(
    code.getLocal(base),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(code.getLocal("x"), code.getLocal("ySize")),
        code.getLocal("y"),
      ),
      code.i32_const(32),
    ),
  );
}

function evalRowPointer(code: WasmCodeBuilder, base: string): unknown {
  return code.i32_add(
    code.getLocal(base),
    code.i32_mul(code.getLocal("x"), code.i32_const(32)),
  );
}
