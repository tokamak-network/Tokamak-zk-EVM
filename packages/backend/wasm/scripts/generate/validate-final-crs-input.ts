import { loadVerifiedFinalCrsInput } from "./final-crs-input.js";

await loadVerifiedFinalCrsInput(process.env.BACKEND_WASM_VERIFIER_CRS_DIR ?? "");
console.log("Validated canonical final CRS provenance and artifact digests");
