import type { WasmModuleBuilder } from "../kernel-builder-types.js";
import { FIELD_BATCH_ADD_SCALED, FIELD_SELECTION_ACCUMULATE } from "../kernel-names.js";

/** Accumulate independent wire rows without dispatching each nonzero term. */
export function buildSelectionAccumulateKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(FIELD_SELECTION_ACCUMULATE);
  for (const name of ["values", "cofactors", "rows", "width", "output"]) fn.addParam(name, "i32");
  for (const name of ["row", "term", "out", "value"]) fn.addLocal(name, "i32");
  const c = fn.getCodeBuilder();
  const rowOffset = (index: unknown) => c.i32_mul(c.i32_mul(index, c.getLocal("width")), c.i32_const(32));
  fn.addCode(
    c.setLocal("row", c.i32_const(0)),
    c.block(c.loop(
      c.br_if(1, c.i32_eq(c.getLocal("row"), c.getLocal("rows"))),
      c.setLocal("out", c.i32_add(c.getLocal("output"), rowOffset(c.getLocal("row")))),
      c.setLocal("term", c.i32_const(0)),
      c.block(c.loop(
        c.br_if(1, c.i32_eq(c.getLocal("term"), c.getLocal("width"))),
        c.setLocal("value", c.i32_add(c.getLocal("values"), c.i32_add(rowOffset(c.getLocal("row")), c.i32_mul(c.getLocal("term"), c.i32_const(32))))),
        c.if(c.i32_eq(c.call("frm_isZero", c.getLocal("value")), c.i32_const(0)),
          c.call(FIELD_BATCH_ADD_SCALED, c.getLocal("out"), c.i32_add(c.getLocal("cofactors"), rowOffset(c.getLocal("term"))), c.getLocal("value"), c.getLocal("width"), c.getLocal("out"))),
        c.setLocal("term", c.i32_add(c.getLocal("term"), c.i32_const(1))),
        c.br(0),
      )),
      c.setLocal("row", c.i32_add(c.getLocal("row"), c.i32_const(1))),
      c.br(0),
    )),
  );
  module.exportFunction(FIELD_SELECTION_ACCUMULATE);
}
