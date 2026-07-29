import { generateProof, installProverRuntime } from "./generate-proof.js";
import {
  generateVerifierPreprocess,
  installPreprocessRuntime,
} from "./run-preprocess.js";
import { installVerifierRuntime, verifyProof } from "./verify-proof.js";

type RuntimeName = "preprocess" | "prover" | "verifier";

const installed: Record<RuntimeName, boolean> = {
  preprocess: false,
  prover: false,
  verifier: false,
};
const generated: {
  proof?: Uint8Array;
  verifierPreprocess?: Uint8Array;
} = {};
let actionRunning = false;

const controls = {
  installPreprocess: button("install-preprocess"),
  runPreprocess: button("run-preprocess"),
  installProver: button("install-prover"),
  runProver: button("run-prover"),
  installVerifier: button("install-verifier"),
  runVerifier: button("run-verifier"),
};

window.__tokamakExampleResult = { status: "pending" };

controls.installPreprocess.addEventListener("click", () => {
  void runAction("Installing preprocess runtime", async () => {
    const info = await installPreprocessRuntime(integerInput("preprocess-exponent"));
    installed.preprocess = true;
    text("preprocess-status", `Ready · ${info.chunkSize.toLocaleString()} points`);
    return "Preprocess runtime installed";
  });
});

controls.runPreprocess.addEventListener("click", () => {
  void runAction("Calculating verifier preprocess", async () => {
    const output = await generateVerifierPreprocess({
      permutation: urlInput("permutation-url"),
      instance: urlInput("instance-url"),
      preprocessCrs: urlInput("preprocess-crs-url"),
    });
    generated.verifierPreprocess = output;
    exposeDownload("download-preprocess", output, "verifier-preprocess.bin");
    text("preprocess-status", `Complete · ${output.byteLength.toLocaleString()} bytes`);
    text("result-source", "Generated verifier preprocess");
    return `Preprocess complete: ${output.byteLength.toLocaleString()} bytes`;
  });
});

controls.installProver.addEventListener("click", () => {
  void runAction("Installing prover runtime", async () => {
    const info = await installProverRuntime(integerInput("prover-exponent"));
    installed.prover = true;
    text("prover-status", `Ready · ${info.chunkSize.toLocaleString()} points`);
    return "Prover runtime installed";
  });
});

controls.runProver.addEventListener("click", () => {
  void runAction("Generating proof", async () => {
    const proof = await generateProof({
      witness: urlInput("witness-url"),
      permutation: urlInput("permutation-url"),
      instance: urlInput("instance-url"),
      proverCrs: urlInput("prover-crs-url"),
    });
    generated.proof = proof;
    exposeDownload("download-proof", proof, "proof.bin");
    text("prover-status", `Complete · ${proof.byteLength.toLocaleString()} bytes`);
    text("result-source", "Generated proof");
    return `Proof generated: ${proof.byteLength.toLocaleString()} bytes`;
  });
});

controls.installVerifier.addEventListener("click", () => {
  void runAction("Installing verifier runtime", async () => {
    await installVerifierRuntime();
    installed.verifier = true;
    text("verifier-status", "Ready");
    return "Verifier runtime installed";
  });
});

controls.runVerifier.addEventListener("click", () => {
  void runAction("Verifying proof", async () => {
    const valid = await verifyProof(
      {
        proof: urlInput("proof-url"),
        instance: urlInput("instance-url"),
        verifierPreprocess: urlInput("verifier-preprocess-url"),
      },
      generated,
    );
    const proofSource = generated.proof === undefined ? "URL proof" : "generated proof";
    const preprocessSource =
      generated.verifierPreprocess === undefined
        ? "URL preprocess"
        : "generated preprocess";
    text("verifier-status", valid ? "Valid proof" : "Invalid proof");
    text("result-source", `${proofSource} · ${preprocessSource}`);
    window.__tokamakExampleResult = { status: "ok", valid };
    return valid ? "Proof is valid" : "Proof is invalid";
  });
});

refreshControls();

async function runAction(label: string, operation: () => Promise<string>): Promise<void> {
  if (actionRunning) {
    return;
  }
  actionRunning = true;
  refreshControls();
  setWorkflowStatus(label, "running");
  window.__tokamakExampleResult = { status: "pending" };

  try {
    const message = await operation();
    text("result", message);
    setWorkflowStatus("Complete", "complete");
    if (window.__tokamakExampleResult.status === "pending") {
      window.__tokamakExampleResult = { status: "ok" };
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    text("result", message);
    setWorkflowStatus("Failed", "error");
    window.__tokamakExampleResult = { status: "error", error: message };
  } finally {
    actionRunning = false;
    refreshControls();
  }
}

function refreshControls(): void {
  controls.installPreprocess.disabled = actionRunning;
  controls.installProver.disabled = actionRunning;
  controls.installVerifier.disabled = actionRunning;
  controls.runPreprocess.disabled = actionRunning || !installed.preprocess;
  controls.runProver.disabled = actionRunning || !installed.prover;
  controls.runVerifier.disabled = actionRunning || !installed.verifier;
}

function setWorkflowStatus(
  value: string,
  state: "idle" | "running" | "complete" | "error",
): void {
  const output = document.querySelector<HTMLOutputElement>("#workflow-status");
  if (output === null) {
    throw new Error("Missing workflow status output.");
  }
  output.value = value;
  output.dataset.state = state;
}

function exposeDownload(id: string, bytes: Uint8Array, filename: string): void {
  const link = document.querySelector<HTMLAnchorElement>(`#${id}`);
  if (link === null) {
    throw new Error(`Missing download link: ${id}.`);
  }
  const previous = link.dataset.objectUrl;
  if (previous !== undefined) {
    URL.revokeObjectURL(previous);
  }
  const downloadBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(downloadBuffer).set(bytes);
  const objectUrl = URL.createObjectURL(new Blob([downloadBuffer], {
    type: "application/octet-stream",
  }));
  link.href = objectUrl;
  link.download = filename;
  link.dataset.objectUrl = objectUrl;
  link.hidden = false;
}

function button(id: string): HTMLButtonElement {
  const value = document.querySelector<HTMLButtonElement>(`#${id}`);
  if (value === null) {
    throw new Error(`Missing button: ${id}.`);
  }
  return value;
}

function urlInput(id: string): string {
  const value = document.querySelector<HTMLInputElement>(`#${id}`)?.value.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`Artifact URL '${id}' is required.`);
  }
  return value;
}

function integerInput(id: string): number {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  if (input === null || !Number.isInteger(input.valueAsNumber)) {
    throw new Error(`Integer input '${id}' is required.`);
  }
  return input.valueAsNumber;
}

function text(id: string, value: string): void {
  const element = document.querySelector<HTMLElement>(`#${id}`);
  if (element === null) {
    throw new Error(`Missing text target: ${id}.`);
  }
  element.textContent = value;
}
