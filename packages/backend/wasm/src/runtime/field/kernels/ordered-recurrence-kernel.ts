import type { WasmModuleBuilder } from "../kernel-builder-types.js";
import { FIELD_COPY_OPERANDS, FIELD_ORDERED_RECURRENCE } from "../kernel-names.js";

/** Independent ranges start with beta*omega^start; preserve the domain order. */
export function buildCopyOperandsKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_COPY_OPERANDS);
  for (const name of ["b", "sc", "beta", "gamma", "initial", "root", "count", "f", "g"]) fn.addParam(name, "i32");
  fn.addLocal("i", "i32");
  const c = fn.getCodeBuilder(), point = c.i32_const(module.alloc(32)), term = c.i32_const(module.alloc(32));
  const at = (base: string) => c.i32_add(c.getLocal(base), c.i32_mul(c.getLocal("i"), c.i32_const(32)));
  fn.addCode(
    c.call("frm_copy", c.getLocal("initial"), point),
    c.setLocal("i", c.i32_const(0)),
    c.block(c.loop(
      c.br_if(1, c.i32_eq(c.getLocal("i"), c.getLocal("count"))),
      c.call("frm_mul", at("sc"), c.getLocal("beta"), term),
      c.call("frm_add", at("b"), term, at("f")),
      c.call("frm_add", at("f"), c.getLocal("gamma"), at("f")),
      c.call("frm_add", at("b"), point, at("g")),
      c.call("frm_add", at("g"), c.getLocal("gamma"), at("g")),
      c.call("frm_mul", point, c.getLocal("root"), point),
      c.setLocal("i", c.i32_add(c.getLocal("i"), c.i32_const(1))),
      c.br(0),
    )),
  );
  module.exportFunction(FIELD_COPY_OPERANDS);
}

/** R[0]=1; R[i+1]=R[i]*F[i]/G[i], in univariate domain order. */
export function buildOrderedRecurrenceKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_ORDERED_RECURRENCE);
  for (const name of ["f", "inverseG", "count", "one", "out"]) fn.addParam(name, "i32");
  fn.addLocal("i", "i32");
  const c = fn.getCodeBuilder(), term = c.i32_const(module.alloc(32));
  const at = (base: string) => c.i32_add(c.getLocal(base), c.i32_mul(c.getLocal("i"), c.i32_const(32)));
  fn.addCode(
    c.call("frm_copy", c.getLocal("one"), c.getLocal("out")),
    c.setLocal("i", c.i32_const(0)),
    c.block(c.loop(
      c.br_if(1, c.i32_eq(c.i32_add(c.getLocal("i"), c.i32_const(1)), c.getLocal("count"))),
      c.call("frm_mul", at("f"), at("inverseG"), term),
      c.call("frm_mul", at("out"), term, c.i32_add(at("out"), c.i32_const(32))),
      c.setLocal("i", c.i32_add(c.getLocal("i"), c.i32_const(1))),
      c.br(0),
    )),
  );
  module.exportFunction(FIELD_ORDERED_RECURRENCE);
}
