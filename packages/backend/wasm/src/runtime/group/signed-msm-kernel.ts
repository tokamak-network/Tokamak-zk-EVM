import type { WasmModuleBuilder } from "../field/kernel-builder-types.js";

export const G1_SIGNED_WINDOW = "g1m_multiexpSigned_window";

/** Signed digits use half-range buckets; the last window retains its carry. */
export function buildSignedMsmKernel(module: WasmModuleBuilder): void {
  const fn = module.addFunction(G1_SIGNED_WINDOW);
  for (const name of ["bases", "digits", "count", "bucketCount", "buckets", "out"]) fn.addParam(name, "i32");
  for (const name of ["i", "digit", "bucket", "base"]) fn.addLocal(name, "i32");
  const c = fn.getCodeBuilder(), running = c.i32_const(module.alloc(144));
  const bucketAt = (index: unknown) => c.i32_add(c.getLocal("buckets"), c.i32_mul(index, c.i32_const(144)));
  fn.addCode(
    c.setLocal("i", c.i32_const(0)),
    c.block(c.loop(
      c.br_if(1, c.i32_eq(c.getLocal("i"), c.getLocal("bucketCount"))),
      c.call("g1m_zero", bucketAt(c.getLocal("i"))),
      c.setLocal("i", c.i32_add(c.getLocal("i"), c.i32_const(1))), c.br(0),
    )),
    c.setLocal("i", c.i32_const(0)),
    c.block(c.loop(
      c.br_if(1, c.i32_eq(c.getLocal("i"), c.getLocal("count"))),
      c.setLocal("digit", c.i32_load(c.i32_add(c.getLocal("digits"), c.i32_mul(c.getLocal("i"), c.i32_const(4))))),
      c.setLocal("base", c.i32_add(c.getLocal("bases"), c.i32_mul(c.getLocal("i"), c.i32_const(96)))),
      c.if(c.i32_gt_s(c.getLocal("digit"), c.i32_const(0)), [
        c.setLocal("bucket", bucketAt(c.i32_sub(c.getLocal("digit"), c.i32_const(1)))),
        c.call("g1m_addMixed", c.getLocal("bucket"), c.getLocal("base"), c.getLocal("bucket")),
      ].flat()),
      c.if(c.i32_lt_s(c.getLocal("digit"), c.i32_const(0)), [
        c.setLocal("bucket", bucketAt(c.i32_sub(c.i32_sub(c.i32_const(0), c.getLocal("digit")), c.i32_const(1)))),
        c.call("g1m_subMixed", c.getLocal("bucket"), c.getLocal("base"), c.getLocal("bucket")),
      ].flat()),
      c.setLocal("i", c.i32_add(c.getLocal("i"), c.i32_const(1))), c.br(0),
    )),
    c.call("g1m_zero", running), c.call("g1m_zero", c.getLocal("out")),
    c.setLocal("i", c.getLocal("bucketCount")),
    c.block(c.loop(
      c.br_if(1, c.i32_eq(c.getLocal("i"), c.i32_const(0))),
      c.setLocal("i", c.i32_sub(c.getLocal("i"), c.i32_const(1))),
      c.call("g1m_add", running, bucketAt(c.getLocal("i")), running),
      c.call("g1m_add", c.getLocal("out"), running, c.getLocal("out")), c.br(0),
    )),
  );
  module.exportFunction(G1_SIGNED_WINDOW);
}
