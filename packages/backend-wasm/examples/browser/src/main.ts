import { verifyProof } from "./verify-proof.js";

window.__tokamakExampleResult = { status: "pending" };

const result = document.querySelector<HTMLOutputElement>("#result");
if (result === null) {
  throw new Error("Missing verifier result output.");
}

try {
  const valid = await verifyProof({
    proof: "/artifacts/proof.bin",
    instance: "/artifacts/instance.bin",
    verifierPreprocess: "/artifacts/verifier-preprocess.bin",
  });
  result.value = valid ? "Proof is valid" : "Proof is invalid";
  window.__tokamakExampleResult = { status: "ok", valid };
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  result.value = message;
  window.__tokamakExampleResult = { status: "error", error: message };
}
