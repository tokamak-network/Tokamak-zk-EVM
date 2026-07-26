import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";

const packageRoot = process.cwd();
const decoderPackageRoot = path.join(packageRoot, "tools", "rkyv-decoder-wasm", "pkg");
const decoderGluePath = path.join(decoderPackageRoot, "backend_wasm_rkyv_decoder.js");
const decoderWasmPath = path.join(decoderPackageRoot, "backend_wasm_rkyv_decoder_bg.wasm");
const outputDirectory = path.join(packageRoot, "dist", "tooling", "converters");

await mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: [
    path.join(
      packageRoot,
      "src",
      "tooling",
      "converters",
      "prover-crs-converter-worker.ts",
    ),
  ],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: path.join(outputDirectory, "prover-crs-converter-worker.js"),
  sourcemap: true,
  plugins: [
    {
      name: "rkyv-decoder",
      setup(context) {
        context.onResolve(
          { filter: /rkyv-decoder\/backend_wasm_rkyv_decoder\.js$/ },
          () => ({ path: decoderGluePath }),
        );
      },
    },
  ],
});
await copyFile(
  decoderWasmPath,
  path.join(outputDirectory, "backend_wasm_rkyv_decoder_bg.wasm"),
);
