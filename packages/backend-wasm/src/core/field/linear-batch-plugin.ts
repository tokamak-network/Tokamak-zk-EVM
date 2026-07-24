export const FIELD_BATCH_ADD = "frm_batchAdd";
export const FIELD_BATCH_SUB = "frm_batchSub";
export const FIELD_BATCH_ADD_SCALED = "tokamak_frm_batchAddScaled";
export const FIELD_BATCH_ADD_SCALED_PREFIX = "tokamak_frm_batchAddScaledPrefix";
export const FIELD_BATCH_SCALE_X = "tokamak_frm_batchScaleX";
export const FIELD_BATCH_SCALE_Y = "tokamak_frm_batchScaleY";

interface WasmCodeBuilder {
  i32_const(value: number): unknown;
  getLocal(name: string): unknown;
  setLocal(name: string, value: unknown): unknown;
  i32_add(left: unknown, right: unknown): unknown;
  i32_sub(left: unknown, right: unknown): unknown;
  i32_mul(left: unknown, right: unknown): unknown;
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
  buildAddScaledKernel(module);
  buildAddScaledPrefixKernel(module);
  buildScaleXKernel(module);
  buildScaleYKernel(module);
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
