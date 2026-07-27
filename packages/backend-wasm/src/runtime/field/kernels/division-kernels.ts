import type { WasmCodeBuilder, WasmModuleBuilder } from "../kernel-builder-types.js";
import {
  FIELD_RUFFINI_X,
  FIELD_RUFFINI_Y,
  FIELD_VANISHING_X,
  FIELD_VANISHING_Y,
} from "../kernel-names.js";

export function installRuffiniKernels(module: WasmModuleBuilder): void {
  buildRuffiniXKernel(module);
  buildRuffiniYKernel(module);
}

export function installVanishingKernels(module: WasmModuleBuilder): void {
  buildVanishingYKernel(module);
  buildVanishingXKernel(module);
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
