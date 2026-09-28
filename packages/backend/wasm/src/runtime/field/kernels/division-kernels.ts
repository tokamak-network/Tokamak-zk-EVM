import type { WasmModuleBuilder } from "../kernel-builder-types.js";
import { FIELD_RUFFINI_Y, FIELD_UNIVARIATE_VANISHING } from "../kernel-names.js";

export function installRuffiniKernels(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_RUFFINI_Y);
  for (const name of ["pInput", "ySize", "pPoint", "pQuotient", "pRemainder"]) fn.addParam(name, "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  const pointer = (base: string, index: unknown) =>
    code.i32_add(code.getLocal(base), code.i32_mul(index, code.i32_const(32)));
  fn.addCode(
    code.call("frm_copy", pointer("pInput", code.i32_sub(code.getLocal("ySize"), code.i32_const(1))), pointer("pQuotient", code.i32_sub(code.getLocal("ySize"), code.i32_const(2)))),
    code.setLocal("y", code.i32_sub(code.getLocal("ySize"), code.i32_const(2))),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("y"), code.i32_const(0))),
      code.setLocal("y", code.i32_sub(code.getLocal("y"), code.i32_const(1))),
      code.call("frm_mul", code.getLocal("pPoint"), pointer("pQuotient", code.i32_add(code.getLocal("y"), code.i32_const(1))), temporary),
      code.call("frm_add", pointer("pInput", code.i32_add(code.getLocal("y"), code.i32_const(1))), temporary, pointer("pQuotient", code.getLocal("y"))),
      code.br(0),
    )),
    code.call("frm_mul", code.getLocal("pPoint"), code.getLocal("pQuotient"), temporary),
    code.call("frm_add", code.getLocal("pInput"), temporary, code.getLocal("pRemainder")),
  );
  module.exportFunction(FIELD_RUFFINI_Y);
}

export function installVanishingKernels(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_UNIVARIATE_VANISHING);
  for (const name of ["remainder", "count", "domain", "quotient"]) fn.addParam(name, "i32");
  fn.addLocal("i", "i32");
  const code = fn.getCodeBuilder();
  const high = code.i32_add(code.getLocal("remainder"), code.i32_mul(code.getLocal("i"), code.i32_const(32)));
  const offset = code.i32_mul(code.i32_sub(code.getLocal("i"), code.getLocal("domain")), code.i32_const(32));
  const low = code.i32_add(code.getLocal("remainder"), offset);
  fn.addCode(
    code.setLocal("i", code.getLocal("count")),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("i"), code.getLocal("domain"))),
      code.setLocal("i", code.i32_sub(code.getLocal("i"), code.i32_const(1))),
      code.call("frm_copy", high, code.i32_add(code.getLocal("quotient"), offset)),
      code.call("frm_add", low, high, low),
      code.call("frm_zero", high),
      code.br(0),
    )),
  );
  module.exportFunction(FIELD_UNIVARIATE_VANISHING);
}
