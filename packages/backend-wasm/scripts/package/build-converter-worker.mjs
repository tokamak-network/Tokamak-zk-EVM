import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";

const packageRoot = process.cwd();
const decoderPackageRoot = path.join(packageRoot, "tools", "rkyv-decoder-wasm", "pkg");
const decoderGluePath = path.join(decoderPackageRoot, "backend_wasm_rkyv_decoder.js");
const decoderWasmPath = path.join(decoderPackageRoot, "backend_wasm_rkyv_decoder_bg.wasm");
const outputDirectory = path.join(packageRoot, "dist", "converter", "worker");

await mkdir(outputDirectory, { recursive: true });
const buildResult = await build({
  entryPoints: [
    path.join(
      packageRoot,
      "src",
      "converter",
      "worker",
      "prover-crs-converter-worker.ts",
    ),
  ],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: path.join(outputDirectory, "prover-crs-converter-worker.js"),
  sourcemap: true,
  external: ["ffjavascript"],
  metafile: true,
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

const forbiddenBundledPackages = ["ffjavascript", "wasmbuilder", "wasmcurves"];
for (const inputPath of Object.keys(buildResult.metafile.inputs)) {
  const normalizedPath = inputPath.replaceAll("\\", "/");
  for (const packageName of forbiddenBundledPackages) {
    if (normalizedPath.includes(`/node_modules/${packageName}/`)) {
      throw new Error(`Converter Worker must not bundle ${packageName}: ${inputPath}`);
    }
  }
}

await copyFile(
  decoderWasmPath,
  path.join(outputDirectory, "backend_wasm_rkyv_decoder_bg.wasm"),
);
