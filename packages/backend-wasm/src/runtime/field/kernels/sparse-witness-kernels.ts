import type { WasmModuleBuilder } from "../kernel-builder-types.js";
import { FIELD_SPARSE_ROW_DOT } from "../kernel-names.js";

export function buildSparseRowDotKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_SPARSE_ROW_DOT);
  fn.addParam("pRowOffsets", "i32");
  fn.addParam("pColumns", "i32");
  fn.addParam("pCoefficients", "i32");
  fn.addParam("pVariables", "i32");
  fn.addParam("rowCount", "i32");
  fn.addParam("pOutput", "i32");
  fn.addLocal("row", "i32");
  fn.addLocal("entry", "i32");
  fn.addLocal("end", "i32");
  fn.addLocal("column", "i32");
  const code = fn.getCodeBuilder();
  const accumulator = code.i32_const(module.alloc(32));
  const term = code.i32_const(module.alloc(32));

  fn.addCode(
    code.setLocal("row", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("row"), code.getLocal("rowCount"))),
      code.setLocal(
        "entry",
        code.i32_load(
          code.i32_add(
            code.getLocal("pRowOffsets"),
            code.i32_mul(code.getLocal("row"), code.i32_const(4)),
          ),
        ),
      ),
      code.setLocal(
        "end",
        code.i32_load(
          code.i32_add(
            code.getLocal("pRowOffsets"),
            code.i32_mul(
              code.i32_add(code.getLocal("row"), code.i32_const(1)),
              code.i32_const(4),
            ),
          ),
        ),
      ),
      code.call("frm_zero", accumulator),
      code.block(code.loop(
        code.br_if(1, code.i32_ge_u(code.getLocal("entry"), code.getLocal("end"))),
        code.setLocal(
          "column",
          code.i32_load(
            code.i32_add(
              code.getLocal("pColumns"),
              code.i32_mul(code.getLocal("entry"), code.i32_const(4)),
            ),
          ),
        ),
        code.call(
          "frm_mul",
          code.i32_add(
            code.getLocal("pCoefficients"),
            code.i32_mul(code.getLocal("entry"), code.i32_const(32)),
          ),
          code.i32_add(
            code.getLocal("pVariables"),
            code.i32_mul(code.getLocal("column"), code.i32_const(32)),
          ),
          term,
        ),
        code.call("frm_add", accumulator, term, accumulator),
        code.setLocal("entry", code.i32_add(code.getLocal("entry"), code.i32_const(1))),
        code.br(0),
      )),
      code.call(
        "frm_copy",
        accumulator,
        code.i32_add(
          code.getLocal("pOutput"),
          code.i32_mul(code.getLocal("row"), code.i32_const(32)),
        ),
      ),
      code.setLocal("row", code.i32_add(code.getLocal("row"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(FIELD_SPARSE_ROW_DOT);
}
