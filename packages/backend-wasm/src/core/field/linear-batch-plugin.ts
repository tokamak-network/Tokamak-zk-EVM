export const FIELD_BATCH_ADD = "frm_batchAdd";
export const FIELD_BATCH_SUB = "frm_batchSub";
export const FIELD_BATCH_MUL = "frm_batchMul";
export const FIELD_BATCH_ADD_SCALED = "tokamak_frm_batchAddScaled";
export const FIELD_BATCH_ADD_SCALED_PREFIX = "tokamak_frm_batchAddScaledPrefix";
export const FIELD_BATCH_SCALE_X = "tokamak_frm_batchScaleX";
export const FIELD_BATCH_SCALE_Y = "tokamak_frm_batchScaleY";
export const FIELD_BATCH_MUL_SHIFTED = "tokamak_frm_batchMulShifted";
export const FIELD_RUFFINI_X = "tokamak_frm_ruffiniX";
export const FIELD_RUFFINI_Y = "tokamak_frm_ruffiniY";
export const FIELD_EVAL_ROWS = "tokamak_frm_evalRows";
export const FIELD_EVAL_ROWS_FUSED = "tokamak_frm_evalRowsFused";
export const FIELD_EVAL_REDUCE = "tokamak_frm_evalReduce";
export const FIELD_EVAL_REDUCE_FUSED = "tokamak_frm_evalReduceFused";
export const FIELD_VANISHING_Y = "tokamak_frm_vanishingY";
export const FIELD_VANISHING_X = "tokamak_frm_vanishingX";
export const FIELD_RECURSION_RECURRENCE = "tokamak_frm_recursionRecurrence";
export const FIELD_K0_RECURRENCE = "tokamak_frm_k0Recurrence";
export const FIELD_KL_RECURRENCE_X = "tokamak_frm_klRecurrenceX";
export const FIELD_KL_RECURRENCE_Y = "tokamak_frm_klRecurrenceY";
export const FIELD_SPECIAL_X_MINUS_ONE = "tokamak_frm_xMinusOne";
export const FIELD_SPECIAL_ONE_MINUS_X = "tokamak_frm_oneMinusX";
export const FIELD_SPECIAL_LINEAR_X = "tokamak_frm_linearX";
export const FIELD_SPECIAL_LINEAR_Y = "tokamak_frm_linearY";
export const FIELD_SPECIAL_TERM9 = "tokamak_frm_term9";
export const FIELD_FUSED_LINEAR_X = "tokamak_frm_fusedLinearX";
export const FIELD_FUSED_LINEAR_Y = "tokamak_frm_fusedLinearY";

type SpecialPolynomialOperation =
  | "x-minus-one"
  | "one-minus-x"
  | "linear-x"
  | "linear-y"
  | "term9";

interface WasmCodeBuilder {
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
  call(name: string, ...params: unknown[]): unknown;
  br(depth: number): unknown;
  br_if(depth: number, condition: unknown): unknown;
  block(code: unknown): unknown;
  loop(...code: unknown[]): unknown;
  if(condition: unknown, thenCode: unknown): unknown;
}

interface ModuleFunctionBuilder {
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

export function installLinearBatchPlugin(module: WasmModuleBuilder): void {
  module.exportFunction(FIELD_BATCH_ADD);
  module.exportFunction(FIELD_BATCH_SUB);
  module.exportFunction(FIELD_BATCH_MUL);
  buildAddScaledKernel(module);
  buildAddScaledPrefixKernel(module);
  buildScaleXKernel(module);
  buildScaleYKernel(module);
  buildShiftedMultiplyKernel(module);
  buildRuffiniXKernel(module);
  buildRuffiniYKernel(module);
  buildEvalRowsKernel(module);
  buildEvalRowsFusedKernel(module);
  buildEvalReduceKernel(module);
  buildEvalReduceFusedKernel(module);
  buildVanishingYKernel(module);
  buildVanishingXKernel(module);
  buildRecursionRecurrenceKernel(module);
  buildK0RecurrenceKernel(module);
  buildKlXRecurrenceKernel(module);
  buildKlYRecurrenceKernel(module);
  buildSpecialPolynomialKernel(module, FIELD_SPECIAL_X_MINUS_ONE, "x-minus-one");
  buildSpecialPolynomialKernel(module, FIELD_SPECIAL_ONE_MINUS_X, "one-minus-x");
  buildSpecialPolynomialKernel(module, FIELD_SPECIAL_LINEAR_X, "linear-x");
  buildSpecialPolynomialKernel(module, FIELD_SPECIAL_LINEAR_Y, "linear-y");
  buildSpecialPolynomialKernel(module, FIELD_SPECIAL_TERM9, "term9");
  buildFusedLinearKernel(module, FIELD_FUSED_LINEAR_X, "x");
  buildFusedLinearKernel(module, FIELD_FUSED_LINEAR_Y, "y");
}

function buildAddScaledKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_BATCH_ADD_SCALED);
  fn.addParam("pTarget", "i32");
  fn.addParam("pSource", "i32");
  fn.addParam("pFactor", "i32");
  fn.addParam("n", "i32");
  fn.addParam("pOut", "i32");
  fn.addLocal("i", "i32");
  fn.addLocal("target", "i32");
  fn.addLocal("source", "i32");
  fn.addLocal("out", "i32");
  const code = fn.getCodeBuilder();
  const auxiliary = code.i32_const(module.alloc(32));
  fn.addCode(
    code.setLocal("i", code.i32_const(0)),
    code.setLocal("target", code.getLocal("pTarget")),
    code.setLocal("source", code.getLocal("pSource")),
    code.setLocal("out", code.getLocal("pOut")),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("i"), code.getLocal("n"))),
        code.call("frm_mul", code.getLocal("source"), code.getLocal("pFactor"), auxiliary),
        code.call("frm_add", code.getLocal("target"), auxiliary, code.getLocal("out")),
        code.setLocal("target", code.i32_add(code.getLocal("target"), code.i32_const(32))),
        code.setLocal("source", code.i32_add(code.getLocal("source"), code.i32_const(32))),
        code.setLocal("out", code.i32_add(code.getLocal("out"), code.i32_const(32))),
        code.setLocal("i", code.i32_add(code.getLocal("i"), code.i32_const(1))),
        code.br(0),
      ),
    ),
  );
  module.exportFunction(FIELD_BATCH_ADD_SCALED);
}

function buildAddScaledPrefixKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_BATCH_ADD_SCALED_PREFIX);
  fn.addParam("pTarget", "i32");
  fn.addParam("pSource", "i32");
  fn.addParam("pFactor", "i32");
  fn.addParam("xRows", "i32");
  fn.addParam("targetY", "i32");
  fn.addParam("sourceY", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  fn.addLocal("target", "i32");
  fn.addLocal("source", "i32");
  const code = fn.getCodeBuilder();
  const auxiliary = code.i32_const(module.alloc(32));
  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.setLocal("target", code.getLocal("pTarget")),
    code.setLocal("source", code.getLocal("pSource")),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xRows"))),
        code.setLocal("y", code.i32_const(0)),
        code.block(
          code.loop(
            code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("sourceY"))),
            code.call("frm_mul", code.getLocal("source"), code.getLocal("pFactor"), auxiliary),
            code.call("frm_add", code.getLocal("target"), auxiliary, code.getLocal("target")),
            code.setLocal("target", code.i32_add(code.getLocal("target"), code.i32_const(32))),
            code.setLocal("source", code.i32_add(code.getLocal("source"), code.i32_const(32))),
            code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
            code.br(0),
          ),
        ),
        code.setLocal(
          "target",
          code.i32_add(
            code.getLocal("target"),
            code.i32_mul(
              code.i32_sub(code.getLocal("targetY"), code.getLocal("sourceY")),
              code.i32_const(32),
            ),
          ),
        ),
        code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
        code.br(0),
      ),
    ),
  );
  module.exportFunction(FIELD_BATCH_ADD_SCALED_PREFIX);
}

function buildScaleXKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_BATCH_SCALE_X);
  fn.addParam("pInput", "i32");
  fn.addParam("pFactor", "i32");
  fn.addParam("pPower", "i32");
  fn.addParam("xRows", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("pOut", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  fn.addLocal("input", "i32");
  fn.addLocal("out", "i32");
  const code = fn.getCodeBuilder();
  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.setLocal("input", code.getLocal("pInput")),
    code.setLocal("out", code.getLocal("pOut")),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xRows"))),
        code.setLocal("y", code.i32_const(0)),
        code.block(
          code.loop(
            code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("ySize"))),
            code.call("frm_mul", code.getLocal("input"), code.getLocal("pPower"), code.getLocal("out")),
            code.setLocal("input", code.i32_add(code.getLocal("input"), code.i32_const(32))),
            code.setLocal("out", code.i32_add(code.getLocal("out"), code.i32_const(32))),
            code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
            code.br(0),
          ),
        ),
        code.call("frm_mul", code.getLocal("pPower"), code.getLocal("pFactor"), code.getLocal("pPower")),
        code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
        code.br(0),
      ),
    ),
  );
  module.exportFunction(FIELD_BATCH_SCALE_X);
}

function buildScaleYKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_BATCH_SCALE_Y);
  fn.addParam("pInput", "i32");
  fn.addParam("pFactor", "i32");
  fn.addParam("pOne", "i32");
  fn.addParam("pPower", "i32");
  fn.addParam("xRows", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("pOut", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  fn.addLocal("input", "i32");
  fn.addLocal("out", "i32");
  const code = fn.getCodeBuilder();
  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.setLocal("input", code.getLocal("pInput")),
    code.setLocal("out", code.getLocal("pOut")),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xRows"))),
        code.call("frm_copy", code.getLocal("pOne"), code.getLocal("pPower")),
        code.setLocal("y", code.i32_const(0)),
        code.block(
          code.loop(
            code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("ySize"))),
            code.call("frm_mul", code.getLocal("input"), code.getLocal("pPower"), code.getLocal("out")),
            code.call("frm_mul", code.getLocal("pPower"), code.getLocal("pFactor"), code.getLocal("pPower")),
            code.setLocal("input", code.i32_add(code.getLocal("input"), code.i32_const(32))),
            code.setLocal("out", code.i32_add(code.getLocal("out"), code.i32_const(32))),
            code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
            code.br(0),
          ),
        ),
        code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
        code.br(0),
      ),
    ),
  );
  module.exportFunction(FIELD_BATCH_SCALE_Y);
}

function buildShiftedMultiplyKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_BATCH_MUL_SHIFTED);
  fn.addParam("pLeft", "i32");
  fn.addParam("pRight", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("xShift", "i32");
  fn.addParam("yShift", "i32");
  fn.addParam("pOut", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  fn.addLocal("sourceX", "i32");
  fn.addLocal("sourceY", "i32");
  fn.addLocal("source", "i32");
  fn.addLocal("right", "i32");
  fn.addLocal("out", "i32");
  const code = fn.getCodeBuilder();
  const elementBytes = code.i32_const(32);
  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.setLocal("sourceX", code.getLocal("xShift")),
    code.setLocal("right", code.getLocal("pRight")),
    code.setLocal("out", code.getLocal("pOut")),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xSize"))),
        code.setLocal("y", code.i32_const(0)),
        code.setLocal("sourceY", code.getLocal("yShift")),
        code.block(
          code.loop(
            code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("ySize"))),
            code.setLocal(
              "source",
              code.i32_add(
                code.getLocal("pLeft"),
                code.i32_mul(
                  code.i32_add(
                    code.i32_mul(code.getLocal("sourceX"), code.getLocal("ySize")),
                    code.getLocal("sourceY"),
                  ),
                  elementBytes,
                ),
              ),
            ),
            code.call("frm_mul", code.getLocal("source"), code.getLocal("right"), code.getLocal("out")),
            code.setLocal(
              "sourceY",
              code.i32_rem_u(
                code.i32_add(code.getLocal("sourceY"), code.i32_const(1)),
                code.getLocal("ySize"),
              ),
            ),
            code.setLocal("right", code.i32_add(code.getLocal("right"), elementBytes)),
            code.setLocal("out", code.i32_add(code.getLocal("out"), elementBytes)),
            code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
            code.br(0),
          ),
        ),
        code.setLocal(
          "sourceX",
          code.i32_rem_u(
            code.i32_add(code.getLocal("sourceX"), code.i32_const(1)),
            code.getLocal("xSize"),
          ),
        ),
        code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
        code.br(0),
      ),
    ),
  );
  module.exportFunction(FIELD_BATCH_MUL_SHIFTED);
}

function buildRuffiniXKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_RUFFINI_X);
  fn.addParam("pInput", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("pPoint", "i32");
  fn.addParam("pQuotient", "i32");
  fn.addParam("pRemainder", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  const elementPointer = (base: string, index: unknown) =>
    code.i32_add(code.getLocal(base), code.i32_mul(index, code.i32_const(32)));
  const index = (x: unknown, y: unknown) =>
    code.i32_add(code.i32_mul(x, code.getLocal("ySize")), y);

  fn.addCode(
    code.setLocal("y", code.i32_const(0)),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("ySize"))),
        code.call(
          "frm_copy",
          elementPointer(
            "pInput",
            index(code.i32_sub(code.getLocal("xSize"), code.i32_const(1)), code.getLocal("y")),
          ),
          elementPointer(
            "pQuotient",
            index(code.i32_sub(code.getLocal("xSize"), code.i32_const(2)), code.getLocal("y")),
          ),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      ),
    ),
    code.setLocal("x", code.i32_sub(code.getLocal("xSize"), code.i32_const(2))),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("x"), code.i32_const(0))),
        code.setLocal("x", code.i32_sub(code.getLocal("x"), code.i32_const(1))),
        code.setLocal("y", code.i32_const(0)),
        code.block(
          code.loop(
            code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("ySize"))),
            code.call(
              "frm_mul",
              code.getLocal("pPoint"),
              elementPointer(
                "pQuotient",
                index(code.i32_add(code.getLocal("x"), code.i32_const(1)), code.getLocal("y")),
              ),
              temporary,
            ),
            code.call(
              "frm_add",
              elementPointer(
                "pInput",
                index(code.i32_add(code.getLocal("x"), code.i32_const(1)), code.getLocal("y")),
              ),
              temporary,
              elementPointer("pQuotient", index(code.getLocal("x"), code.getLocal("y"))),
            ),
            code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
            code.br(0),
          ),
        ),
        code.br(0),
      ),
    ),
    code.setLocal("y", code.i32_const(0)),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("ySize"))),
        code.call(
          "frm_mul",
          code.getLocal("pPoint"),
          elementPointer("pQuotient", code.getLocal("y")),
          temporary,
        ),
        code.call(
          "frm_add",
          elementPointer("pInput", code.getLocal("y")),
          temporary,
          elementPointer("pRemainder", code.getLocal("y")),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      ),
    ),
  );
  module.exportFunction(FIELD_RUFFINI_X);
}

function buildRuffiniYKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_RUFFINI_Y);
  fn.addParam("pInput", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("pPoint", "i32");
  fn.addParam("pQuotient", "i32");
  fn.addParam("pRemainder", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  const elementPointer = (base: string, index: unknown) =>
    code.i32_add(code.getLocal(base), code.i32_mul(index, code.i32_const(32)));

  fn.addCode(
    code.call(
      "frm_copy",
      elementPointer("pInput", code.i32_sub(code.getLocal("ySize"), code.i32_const(1))),
      elementPointer("pQuotient", code.i32_sub(code.getLocal("ySize"), code.i32_const(2))),
    ),
    code.setLocal("y", code.i32_sub(code.getLocal("ySize"), code.i32_const(2))),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.i32_const(0))),
        code.setLocal("y", code.i32_sub(code.getLocal("y"), code.i32_const(1))),
        code.call(
          "frm_mul",
          code.getLocal("pPoint"),
          elementPointer("pQuotient", code.i32_add(code.getLocal("y"), code.i32_const(1))),
          temporary,
        ),
        code.call(
          "frm_add",
          elementPointer("pInput", code.i32_add(code.getLocal("y"), code.i32_const(1))),
          temporary,
          elementPointer("pQuotient", code.getLocal("y")),
        ),
        code.br(0),
      ),
    ),
    code.call("frm_mul", code.getLocal("pPoint"), code.getLocal("pQuotient"), temporary),
    code.call("frm_add", code.getLocal("pInput"), temporary, code.getLocal("pRemainder")),
  );
  module.exportFunction(FIELD_RUFFINI_Y);
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

function buildVanishingYKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_VANISHING_Y);
  fn.addParam("pInput", "i32");
  fn.addParam("xBlockCount", "i32");
  fn.addParam("xRows", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("yDegree", "i32");
  fn.addParam("pAccumulated", "i32");
  fn.addParam("pQuotient", "i32");
  fn.addParam("pCorrected", "i32");
  fn.addLocal("block", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const zero = code.i32_const(module.alloc(32));
  fn.addCode(
    code.call("frm_zero", zero),
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xRows"))),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("ySize"))),
        code.call("frm_zero", vanishingYPointer(code, "pAccumulated")),
        code.setLocal("block", code.i32_const(0)),
        code.block(code.loop(
          code.br_if(1, code.i32_eq(code.getLocal("block"), code.getLocal("xBlockCount"))),
          code.call(
            "frm_add",
            vanishingYPointer(code, "pAccumulated"),
            vanishingBlockPointer(code, "pInput"),
            vanishingYPointer(code, "pAccumulated"),
          ),
          code.setLocal("block", code.i32_add(code.getLocal("block"), code.i32_const(1))),
          code.br(0),
        )),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("block", code.i32_const(0)),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("yDegree"))),
        code.call(
          "frm_sub",
          zero,
          vanishingYPointer(code, "pAccumulated"),
          vanishingYPointer(code, "pQuotient"),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("y", code.getLocal("yDegree")),
      code.block(code.loop(
        code.br_if(
          1,
          code.i32_eq(
            code.getLocal("y"),
            code.i32_sub(code.getLocal("ySize"), code.getLocal("yDegree")),
          ),
        ),
        code.call(
          "frm_sub",
          vanishingPreviousYPointer(code),
          vanishingYPointer(code, "pAccumulated"),
          vanishingYPointer(code, "pQuotient"),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("ySize"))),
        code.call(
          "frm_copy",
          vanishingBlockPointer(code, "pInput"),
          vanishingYPointer(code, "pCorrected"),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(
          1,
          code.i32_eq(
            code.getLocal("y"),
            code.i32_sub(code.getLocal("ySize"), code.getLocal("yDegree")),
          ),
        ),
        code.call(
          "frm_add",
          vanishingYPointer(code, "pCorrected"),
          vanishingYPointer(code, "pQuotient"),
          vanishingYPointer(code, "pCorrected"),
        ),
        code.call(
          "frm_sub",
          vanishingShiftedYPointer(code),
          vanishingYPointer(code, "pQuotient"),
          vanishingShiftedYPointer(code),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(FIELD_VANISHING_Y);
}

function buildVanishingXKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_VANISHING_X);
  fn.addParam("pInput", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("yCols", "i32");
  fn.addParam("xDegree", "i32");
  fn.addParam("pQuotient", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const zero = code.i32_const(module.alloc(32));
  fn.addCode(
    code.call("frm_zero", zero),
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xDegree"))),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("yCols"))),
        code.call(
          "frm_sub",
          zero,
          vanishingXPointer(code, "pInput"),
          vanishingXPointer(code, "pQuotient"),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
    code.setLocal("x", code.getLocal("xDegree")),
    code.block(code.loop(
      code.br_if(
        1,
        code.i32_eq(
          code.getLocal("x"),
          code.i32_sub(code.getLocal("xSize"), code.getLocal("xDegree")),
        ),
      ),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("yCols"))),
        code.call(
          "frm_sub",
          vanishingPreviousXPointer(code),
          vanishingXPointer(code, "pInput"),
          vanishingXPointer(code, "pQuotient"),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(FIELD_VANISHING_X);
}

function vanishingYPointer(code: WasmCodeBuilder, base: string): unknown {
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

function vanishingBlockPointer(code: WasmCodeBuilder, base: string): unknown {
  return code.i32_add(
    code.getLocal(base),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(
          code.i32_add(
            code.i32_mul(code.getLocal("block"), code.getLocal("xRows")),
            code.getLocal("x"),
          ),
          code.getLocal("ySize"),
        ),
        code.getLocal("y"),
      ),
      code.i32_const(32),
    ),
  );
}

function vanishingPreviousYPointer(code: WasmCodeBuilder): unknown {
  return code.i32_add(
    code.getLocal("pQuotient"),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(code.getLocal("x"), code.getLocal("ySize")),
        code.i32_sub(code.getLocal("y"), code.getLocal("yDegree")),
      ),
      code.i32_const(32),
    ),
  );
}

function vanishingShiftedYPointer(code: WasmCodeBuilder): unknown {
  return code.i32_add(
    code.getLocal("pCorrected"),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(code.getLocal("x"), code.getLocal("ySize")),
        code.i32_add(code.getLocal("y"), code.getLocal("yDegree")),
      ),
      code.i32_const(32),
    ),
  );
}

function vanishingXPointer(code: WasmCodeBuilder, base: string): unknown {
  return code.i32_add(
    code.getLocal(base),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(code.getLocal("x"), code.getLocal("yCols")),
        code.getLocal("y"),
      ),
      code.i32_const(32),
    ),
  );
}

function vanishingPreviousXPointer(code: WasmCodeBuilder): unknown {
  return code.i32_add(
    code.getLocal("pQuotient"),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(
          code.i32_sub(code.getLocal("x"), code.getLocal("xDegree")),
          code.getLocal("yCols"),
        ),
        code.getLocal("y"),
      ),
      code.i32_const(32),
    ),
  );
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

function buildSpecialPolynomialKernel(
  module: WasmModuleBuilder,
  functionName: string,
  operation: SpecialPolynomialOperation,
): void {
  const fn = module.addFunction(functionName);
  fn.addParam("pInput", "i32");
  fn.addParam("sourceStart", "i32");
  fn.addParam("inputY", "i32");
  fn.addParam("outputStart", "i32");
  fn.addParam("xRows", "i32");
  fn.addParam("activeX", "i32");
  fn.addParam("activeY", "i32");
  fn.addParam("activeOutputY", "i32");
  fn.addParam("pConstant", "i32");
  fn.addParam("pX", "i32");
  fn.addParam("pY", "i32");
  fn.addParam("pOutput", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  fn.addLocal("globalX", "i32");
  const code = fn.getCodeBuilder();
  const value = code.i32_const(module.alloc(32));
  const current = code.i32_const(module.alloc(32));
  const shifted = code.i32_const(module.alloc(32));
  const term = code.i32_const(module.alloc(32));
  const sequence = (...parts: unknown[]): unknown =>
    (parts as readonly (readonly unknown[])[]).flat();
  const currentPointer = () =>
    specialInputPointer(code, code.getLocal("globalX"), code.getLocal("y"));
  const previousXPointer = () =>
    specialInputPointer(
      code,
      code.i32_sub(code.getLocal("globalX"), code.i32_const(1)),
      code.getLocal("y"),
    );
  const previousYPointer = () =>
    specialInputPointer(
      code,
      code.getLocal("globalX"),
      code.i32_sub(code.getLocal("y"), code.i32_const(1)),
    );
  const ifCurrent = (body: unknown) =>
    code.if(
      code.i32_lt_u(code.getLocal("globalX"), code.getLocal("activeX")),
      code.if(code.i32_lt_u(code.getLocal("y"), code.getLocal("activeY")), body),
    );
  const ifPreviousX = (body: unknown) =>
    code.if(
      code.i32_gt_u(code.getLocal("globalX"), code.i32_const(0)),
      code.if(
        code.i32_lt_u(
          code.i32_sub(code.getLocal("globalX"), code.i32_const(1)),
          code.getLocal("activeX"),
        ),
        code.if(code.i32_lt_u(code.getLocal("y"), code.getLocal("activeY")), body),
      ),
    );
  const ifPreviousY = (body: unknown) =>
    code.if(
      code.i32_lt_u(code.getLocal("globalX"), code.getLocal("activeX")),
      code.if(
        code.i32_gt_u(code.getLocal("y"), code.i32_const(0)),
        code.if(
          code.i32_lt_u(
            code.i32_sub(code.getLocal("y"), code.i32_const(1)),
            code.getLocal("activeY"),
          ),
          body,
        ),
      ),
    );
  const addScaled = (pointer: unknown, factor: string): unknown =>
    sequence(
      code.call("frm_mul", pointer, code.getLocal(factor), term),
      code.call("frm_add", value, term, value),
    );
  const coefficientCode = operation === "x-minus-one" || operation === "one-minus-x"
    ? sequence(
        code.call("frm_zero", current),
        code.call("frm_zero", shifted),
        ifCurrent(code.call("frm_copy", currentPointer(), current)),
        ifPreviousX(code.call("frm_copy", previousXPointer(), shifted)),
        operation === "x-minus-one"
          ? code.call("frm_sub", shifted, current, value)
          : code.call("frm_sub", current, shifted, value),
      )
    : sequence(
        code.call("frm_zero", value),
        ifCurrent(addScaled(currentPointer(), "pConstant")),
        operation === "linear-x" || operation === "term9"
          ? ifPreviousX(addScaled(previousXPointer(), "pX"))
          : [],
        operation === "linear-y" || operation === "term9"
          ? ifPreviousY(addScaled(previousYPointer(), "pY"))
          : [],
      );

  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xRows"))),
      code.setLocal(
        "globalX",
        code.i32_add(code.getLocal("outputStart"), code.getLocal("x")),
      ),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("activeOutputY"))),
        coefficientCode,
        code.call("frm_copy", value, specialOutputPointer(code)),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(functionName);
}

function buildFusedLinearKernel(
  module: WasmModuleBuilder,
  functionName: string,
  axis: "x" | "y",
): void {
  const fn = module.addFunction(functionName);
  fn.addParam("pInput", "i32");
  fn.addParam("sourceStart", "i32");
  fn.addParam("inputY", "i32");
  fn.addParam("pAddend", "i32");
  fn.addParam("addendStart", "i32");
  fn.addParam("addendRows", "i32");
  fn.addParam("addendY", "i32");
  fn.addParam("outputStart", "i32");
  fn.addParam("xRows", "i32");
  fn.addParam("activeX", "i32");
  fn.addParam("activeY", "i32");
  fn.addParam("activeOutputY", "i32");
  fn.addParam("pConstant", "i32");
  fn.addParam("pShift", "i32");
  fn.addParam("pAddendScale", "i32");
  fn.addParam("pOutput", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  fn.addLocal("globalX", "i32");
  const code = fn.getCodeBuilder();
  const value = code.i32_const(module.alloc(32));
  const term = code.i32_const(module.alloc(32));
  const sequence = (...parts: unknown[]): unknown =>
    (parts as readonly (readonly unknown[])[]).flat();
  const addScaled = (pointer: unknown, factor: string): unknown =>
    sequence(
      code.call("frm_mul", pointer, code.getLocal(factor), term),
      code.call("frm_add", value, term, value),
    );
  const current = specialInputPointer(code, code.getLocal("globalX"), code.getLocal("y"));
  const shifted = axis === "x"
    ? specialInputPointer(
        code,
        code.i32_sub(code.getLocal("globalX"), code.i32_const(1)),
        code.getLocal("y"),
      )
    : specialInputPointer(
        code,
        code.getLocal("globalX"),
        code.i32_sub(code.getLocal("y"), code.i32_const(1)),
      );

  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xRows"))),
      code.setLocal(
        "globalX",
        code.i32_add(code.getLocal("outputStart"), code.getLocal("x")),
      ),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("activeOutputY"))),
        code.call("frm_zero", value),
        code.if(
          code.i32_lt_u(code.getLocal("globalX"), code.getLocal("activeX")),
          code.if(
            code.i32_lt_u(code.getLocal("y"), code.getLocal("activeY")),
            addScaled(current, "pConstant"),
          ),
        ),
        axis === "x"
          ? code.if(
              code.i32_gt_u(code.getLocal("globalX"), code.i32_const(0)),
              code.if(
                code.i32_lt_u(
                  code.i32_sub(code.getLocal("globalX"), code.i32_const(1)),
                  code.getLocal("activeX"),
                ),
                code.if(
                  code.i32_lt_u(code.getLocal("y"), code.getLocal("activeY")),
                  addScaled(shifted, "pShift"),
                ),
              ),
            )
          : code.if(
              code.i32_lt_u(code.getLocal("globalX"), code.getLocal("activeX")),
              code.if(
                code.i32_gt_u(code.getLocal("y"), code.i32_const(0)),
                code.if(
                  code.i32_lt_u(
                    code.i32_sub(code.getLocal("y"), code.i32_const(1)),
                    code.getLocal("activeY"),
                  ),
                  addScaled(shifted, "pShift"),
                ),
              ),
            ),
        code.if(
          code.i32_ge_u(code.getLocal("globalX"), code.getLocal("addendStart")),
          code.if(
            code.i32_lt_u(
              code.getLocal("globalX"),
              code.i32_add(code.getLocal("addendStart"), code.getLocal("addendRows")),
            ),
            code.if(
              code.i32_lt_u(code.getLocal("y"), code.getLocal("addendY")),
              addScaled(fusedAddendPointer(code), "pAddendScale"),
            ),
          ),
        ),
        code.call("frm_copy", value, specialOutputPointer(code)),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(functionName);
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

function specialInputPointer(
  code: WasmCodeBuilder,
  globalX: unknown,
  y: unknown,
): unknown {
  return code.i32_add(
    code.getLocal("pInput"),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(
          code.i32_sub(globalX, code.getLocal("sourceStart")),
          code.getLocal("inputY"),
        ),
        y,
      ),
      code.i32_const(32),
    ),
  );
}

function specialOutputPointer(code: WasmCodeBuilder): unknown {
  return code.i32_add(
    code.getLocal("pOutput"),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(code.getLocal("x"), code.getLocal("activeOutputY")),
        code.getLocal("y"),
      ),
      code.i32_const(32),
    ),
  );
}

function fusedAddendPointer(code: WasmCodeBuilder): unknown {
  return code.i32_add(
    code.getLocal("pAddend"),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(
          code.i32_sub(code.getLocal("globalX"), code.getLocal("addendStart")),
          code.getLocal("addendY"),
        ),
        code.getLocal("y"),
      ),
      code.i32_const(32),
    ),
  );
}
