import type { WasmCodeBuilder, WasmModuleBuilder } from "../kernel-builder-types.js";
import {
  FIELD_K0_RECURRENCE,
  FIELD_KL_RECURRENCE_X,
  FIELD_KL_RECURRENCE_Y,
  FIELD_RECURSION_RECURRENCE,
} from "../kernel-names.js";

export function installRecurrenceKernels(module: WasmModuleBuilder): void {
  buildRecursionRecurrenceKernel(module);
  buildK0RecurrenceKernel(module);
  buildKlXRecurrenceKernel(module);
  buildKlYRecurrenceKernel(module);
}

function buildRecursionRecurrenceKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_RECURSION_RECURRENCE);
  fn.addParam("pG", "i32");
  fn.addParam("pInverseF", "i32");
  fn.addParam("mI", "i32");
  fn.addParam("sMax", "i32");
  fn.addParam("total", "i32");
  fn.addParam("pOne", "i32");
  fn.addParam("pOut", "i32");
  fn.addLocal("transposed", "i32");
  fn.addLocal("nextOriginal", "i32");
  fn.addLocal("currentOriginal", "i32");
  const code = fn.getCodeBuilder() as WasmCodeBuilder & {
    i32_div_u(left: unknown, right: unknown): unknown;
  };
  const ratio = code.i32_const(module.alloc(32));
  const temporary = code.i32_const(module.alloc(32));
  const originalIndex = (index: unknown) =>
    code.i32_add(
      code.i32_mul(code.i32_rem_u(index, code.getLocal("mI")), code.getLocal("sMax")),
      code.i32_div_u(index, code.getLocal("mI")),
    );
  const pointer = (base: string, index: unknown) =>
    code.i32_add(code.getLocal(base), code.i32_mul(index, code.i32_const(32)));

  fn.addCode(
    code.call(
      "frm_copy",
      code.getLocal("pOne"),
      pointer("pOut", code.i32_sub(code.getLocal("total"), code.i32_const(1))),
    ),
    code.setLocal("transposed", code.i32_sub(code.getLocal("total"), code.i32_const(1))),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("transposed"), code.i32_const(0))),
      code.setLocal("nextOriginal", originalIndex(code.getLocal("transposed"))),
      code.setLocal("transposed", code.i32_sub(code.getLocal("transposed"), code.i32_const(1))),
      code.setLocal("currentOriginal", originalIndex(code.getLocal("transposed"))),
      code.call(
        "frm_mul",
        pointer("pG", code.getLocal("nextOriginal")),
        pointer("pInverseF", code.getLocal("nextOriginal")),
        ratio,
      ),
      code.call(
        "frm_mul",
        pointer("pOut", code.getLocal("nextOriginal")),
        ratio,
        temporary,
      ),
      code.call("frm_copy", temporary, pointer("pOut", code.getLocal("currentOriginal"))),
      code.br(0),
    )),
  );
  module.exportFunction(FIELD_RECURSION_RECURRENCE);
}

function buildK0RecurrenceKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_K0_RECURRENCE);
  fn.addParam("pInput", "i32");
  fn.addParam("inputX", "i32");
  fn.addParam("localY", "i32");
  fn.addParam("outputX", "i32");
  fn.addParam("mI", "i32");
  fn.addParam("pWindow", "i32");
  fn.addParam("pOutput", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const current = code.i32_const(module.alloc(32));
  fn.addCode(
    code.setLocal("y", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("localY"))),
      code.call("frm_zero", k0Pointer(code, "pWindow", code.i32_const(0))),
      code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
      code.br(0),
    )),
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("outputX"))),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("localY"))),
        code.call("frm_copy", k0Pointer(code, "pWindow", code.i32_const(0)), current),
        code.if(
          code.i32_lt_u(code.getLocal("x"), code.getLocal("inputX")),
          code.call("frm_add", current, k0Pointer(code, "pInput", code.getLocal("x")), current),
        ),
        code.if(
          code.i32_ge_u(code.getLocal("x"), code.getLocal("mI")),
          code.if(
            code.i32_lt_u(
              code.i32_sub(code.getLocal("x"), code.getLocal("mI")),
              code.getLocal("inputX"),
            ),
            code.call(
              "frm_sub",
              current,
              k0Pointer(
                code,
                "pInput",
                code.i32_sub(code.getLocal("x"), code.getLocal("mI")),
              ),
              current,
            ),
          ),
        ),
        code.call("frm_copy", current, k0Pointer(code, "pWindow", code.i32_const(0))),
        code.call("frm_copy", current, k0Pointer(code, "pOutput", code.getLocal("x"))),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(FIELD_K0_RECURRENCE);
}

function buildKlXRecurrenceKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_KL_RECURRENCE_X);
  fn.addParam("pInput", "i32");
  fn.addParam("inputX", "i32");
  fn.addParam("localY", "i32");
  fn.addParam("outputX", "i32");
  fn.addParam("mI", "i32");
  fn.addParam("pRoot", "i32");
  fn.addParam("pOutput", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const value = code.i32_const(module.alloc(32));
  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("outputX"))),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("localY"))),
        code.if(
          code.i32_gt_u(code.getLocal("x"), code.i32_const(0)),
          code.call(
            "frm_mul",
            k0Pointer(
              code,
              "pOutput",
              code.i32_sub(code.getLocal("x"), code.i32_const(1)),
            ),
            code.getLocal("pRoot"),
            value,
          ),
        ),
        code.if(
          code.i32_eq(code.getLocal("x"), code.i32_const(0)),
          code.call("frm_zero", value),
        ),
        code.if(
          code.i32_lt_u(code.getLocal("x"), code.getLocal("inputX")),
          code.call("frm_add", value, k0Pointer(code, "pInput", code.getLocal("x")), value),
        ),
        code.if(
          code.i32_ge_u(code.getLocal("x"), code.getLocal("mI")),
          code.if(
            code.i32_lt_u(
              code.i32_sub(code.getLocal("x"), code.getLocal("mI")),
              code.getLocal("inputX"),
            ),
            code.call(
              "frm_sub",
              value,
              k0Pointer(
                code,
                "pInput",
                code.i32_sub(code.getLocal("x"), code.getLocal("mI")),
              ),
              value,
            ),
          ),
        ),
        code.call("frm_copy", value, k0Pointer(code, "pOutput", code.getLocal("x"))),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(FIELD_KL_RECURRENCE_X);
}

function buildKlYRecurrenceKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_KL_RECURRENCE_Y);
  fn.addParam("pInput", "i32");
  fn.addParam("xRows", "i32");
  fn.addParam("inputY", "i32");
  fn.addParam("outputY", "i32");
  fn.addParam("sMax", "i32");
  fn.addParam("pRoot", "i32");
  fn.addParam("pOutput", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const value = code.i32_const(module.alloc(32));
  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xRows"))),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("outputY"))),
        code.if(
          code.i32_gt_u(code.getLocal("y"), code.i32_const(0)),
          code.call(
            "frm_mul",
            klYPointer(
              code,
              "pOutput",
              "outputY",
              code.i32_sub(code.getLocal("y"), code.i32_const(1)),
            ),
            code.getLocal("pRoot"),
            value,
          ),
        ),
        code.if(
          code.i32_eq(code.getLocal("y"), code.i32_const(0)),
          code.call("frm_zero", value),
        ),
        code.if(
          code.i32_lt_u(code.getLocal("y"), code.getLocal("inputY")),
          code.call(
            "frm_add",
            value,
            klYPointer(code, "pInput", "inputY", code.getLocal("y")),
            value,
          ),
        ),
        code.if(
          code.i32_ge_u(code.getLocal("y"), code.getLocal("sMax")),
          code.if(
            code.i32_lt_u(
              code.i32_sub(code.getLocal("y"), code.getLocal("sMax")),
              code.getLocal("inputY"),
            ),
            code.call(
              "frm_sub",
              value,
              klYPointer(
                code,
                "pInput",
                "inputY",
                code.i32_sub(code.getLocal("y"), code.getLocal("sMax")),
              ),
              value,
            ),
          ),
        ),
        code.call(
          "frm_copy",
          value,
          klYPointer(code, "pOutput", "outputY", code.getLocal("y")),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(FIELD_KL_RECURRENCE_Y);
}

function k0Pointer(code: WasmCodeBuilder, base: string, row: unknown): unknown {
  return code.i32_add(
    code.getLocal(base),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(row, code.getLocal("localY")),
        code.getLocal("y"),
      ),
      code.i32_const(32),
    ),
  );
}

function klYPointer(
  code: WasmCodeBuilder,
  base: string,
  rowSize: string,
  column: unknown,
): unknown {
  return code.i32_add(
    code.getLocal(base),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(code.getLocal("x"), code.getLocal(rowSize)),
        column,
      ),
      code.i32_const(32),
    ),
  );
}

