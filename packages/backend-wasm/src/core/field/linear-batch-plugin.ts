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

interface WasmCodeBuilder {
  i32_const(value: number): unknown;
  getLocal(name: string): unknown;
  setLocal(name: string, value: unknown): unknown;
  i32_add(left: unknown, right: unknown): unknown;
  i32_sub(left: unknown, right: unknown): unknown;
  i32_mul(left: unknown, right: unknown): unknown;
  i32_rem_u(left: unknown, right: unknown): unknown;
  i32_eq(left: unknown, right: unknown): unknown;
  call(name: string, ...params: unknown[]): unknown;
  br(depth: number): unknown;
  br_if(depth: number, condition: unknown): unknown;
  block(code: unknown): unknown;
  loop(...code: unknown[]): unknown;
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
