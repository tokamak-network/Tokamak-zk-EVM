import type { WasmModuleBuilder } from "../kernel-builder-types.js";
import {
  FIELD_BATCH_ADD,
  FIELD_BATCH_ADD_SCALED,
  FIELD_BATCH_MUL,
  FIELD_BATCH_SCALE_X,
  FIELD_BATCH_SUB,
  FIELD_PRODUCT_DIFFERENCE,
} from "../kernel-names.js";

export function installBasicLinearKernels(module: WasmModuleBuilder): void {
  module.exportFunction(FIELD_BATCH_ADD);
  module.exportFunction(FIELD_BATCH_SUB);
  module.exportFunction(FIELD_BATCH_MUL);
  buildAddScaledKernel(module);
  buildScaleXKernel(module);
  buildProductDifferenceKernel(module);
}

function buildProductDifferenceKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_PRODUCT_DIFFERENCE);
  for (const name of ["a", "b", "c", "d", "count", "out"]) fn.addParam(name, "i32");
  fn.addLocal("i", "i32");
  const code = fn.getCodeBuilder(), term = code.i32_const(module.alloc(32));
  const at = (base: string) => code.i32_add(code.getLocal(base), code.i32_mul(code.getLocal("i"), code.i32_const(32)));
  fn.addCode(
    code.setLocal("i", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("i"), code.getLocal("count"))),
      code.call("frm_mul", at("a"), at("b"), at("out")),
      code.call("frm_mul", at("c"), at("d"), term),
      code.call("frm_sub", at("out"), term, at("out")),
      code.setLocal("i", code.i32_add(code.getLocal("i"), code.i32_const(1))), code.br(0),
    )),
  );
  module.exportFunction(FIELD_PRODUCT_DIFFERENCE);
}

function buildAddScaledKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_BATCH_ADD_SCALED);
  for (const name of ["pTarget", "pSource", "pFactor", "n", "pOut"]) fn.addParam(name, "i32");
  for (const name of ["i", "target", "source", "out"]) fn.addLocal(name, "i32");
  const code = fn.getCodeBuilder();
  const auxiliary = code.i32_const(module.alloc(32));
  fn.addCode(
    code.setLocal("i", code.i32_const(0)),
    code.setLocal("target", code.getLocal("pTarget")),
    code.setLocal("source", code.getLocal("pSource")),
    code.setLocal("out", code.getLocal("pOut")),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("i"), code.getLocal("n"))),
      code.call("frm_mul", code.getLocal("source"), code.getLocal("pFactor"), auxiliary),
      code.call("frm_add", code.getLocal("target"), auxiliary, code.getLocal("out")),
      code.setLocal("target", code.i32_add(code.getLocal("target"), code.i32_const(32))),
      code.setLocal("source", code.i32_add(code.getLocal("source"), code.i32_const(32))),
      code.setLocal("out", code.i32_add(code.getLocal("out"), code.i32_const(32))),
      code.setLocal("i", code.i32_add(code.getLocal("i"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(FIELD_BATCH_ADD_SCALED);
}

function buildScaleXKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_BATCH_SCALE_X);
  for (const name of ["pInput", "pFactor", "pPower", "xRows", "ySize", "pOut"]) fn.addParam(name, "i32");
  for (const name of ["x", "y", "input", "out"]) fn.addLocal(name, "i32");
  const code = fn.getCodeBuilder();
  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.setLocal("input", code.getLocal("pInput")),
    code.setLocal("out", code.getLocal("pOut")),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xRows"))),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("ySize"))),
        code.call("frm_mul", code.getLocal("input"), code.getLocal("pPower"), code.getLocal("out")),
        code.setLocal("input", code.i32_add(code.getLocal("input"), code.i32_const(32))),
        code.setLocal("out", code.i32_add(code.getLocal("out"), code.i32_const(32))),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.call("frm_mul", code.getLocal("pPower"), code.getLocal("pFactor"), code.getLocal("pPower")),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(FIELD_BATCH_SCALE_X);
}
