import type { WasmModuleBuilder } from "../kernel-builder-types.js";
import { FIELD_SHORT_CONVOLUTION } from "../kernel-names.js";

/** Each output range receives its left halo, including zero boundary values. */
export function buildShortConvolutionKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_SHORT_CONVOLUTION);
  for (const name of ["long", "short", "width", "count", "out"]) fn.addParam(name, "i32");
  for (const name of ["i", "j"]) fn.addLocal(name, "i32");
  const c = fn.getCodeBuilder(), term = c.i32_const(module.alloc(32));
  const at = (base: string, index: unknown) => c.i32_add(c.getLocal(base), c.i32_mul(index, c.i32_const(32)));
  const out = at("out", c.getLocal("i"));
  fn.addCode(
    c.setLocal("i", c.i32_const(0)),
    c.block(c.loop(
      c.br_if(1, c.i32_eq(c.getLocal("i"), c.getLocal("count"))),
      c.call("frm_zero", out),
      c.setLocal("j", c.i32_const(0)),
      c.block(c.loop(
        c.br_if(1, c.i32_eq(c.getLocal("j"), c.getLocal("width"))),
        c.call("frm_mul", at("long", c.i32_sub(c.i32_add(c.getLocal("i"), c.getLocal("width")), c.i32_add(c.getLocal("j"), c.i32_const(1)))), at("short", c.getLocal("j")), term),
        c.call("frm_add", out, term, out),
        c.setLocal("j", c.i32_add(c.getLocal("j"), c.i32_const(1))), c.br(0),
      )),
      c.setLocal("i", c.i32_add(c.getLocal("i"), c.i32_const(1))), c.br(0),
    )),
  );
  module.exportFunction(FIELD_SHORT_CONVOLUTION);
}
