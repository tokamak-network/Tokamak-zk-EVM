import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadVerifiedFinalCrsInput } from "../../../scripts/generate/final-crs-input.js";
import {
  SUBCIRCUIT_LIBRARY_ORIGIN,
  SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
} from "../../../src/generated/active/setup.generated.js";

const SUBCIRCUIT_LIBRARY_PACKAGE_NAME = "@tokamak-zk-evm/subcircuit-library";

async function main(): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), "backend-wasm-final-crs-input-"));
  try {
    const files = {
      tauSequence: Uint8Array.from([10, 11, 12]),
      proverKeys: Uint8Array.from([1, 2, 3]),
      preprocessKeys: Uint8Array.from([4, 5, 6]),
      verifierKeys: Uint8Array.from([7, 8, 9]),
    };
    await writeFinalCrsDirectory(directory, files);

    const accepted = await loadVerifiedFinalCrsInput(directory);
    if (accepted.provenance.releaseEligible !== false) {
      throw new Error("The final CRS ingress must not require releaseEligible.");
    }

    await expectFailure(
      async () => {
        await writeFile(path.join(directory, "verifier_keys.rkyv"), Uint8Array.from([9, 8, 7]));
        await loadVerifiedFinalCrsInput(directory);
      },
      "Final CRS ingress must reject a verifier-keys digest mismatch.",
    );

    await writeFinalCrsDirectory(directory, files);
    await expectFailure(
      async () => {
        await writeFile(path.join(directory, "prover_keys.rkyv"), Uint8Array.from([3, 2, 1]));
        await loadVerifiedFinalCrsInput(directory);
      },
      "Final CRS ingress must reject a prover keys digest mismatch.",
    );

    await writeFinalCrsDirectory(directory, files);
    await expectFailure(
      async () => {
        await writeFile(path.join(directory, "preprocess_keys.rkyv"), Uint8Array.from([6, 5, 4]));
        await loadVerifiedFinalCrsInput(directory);
      },
      "Final CRS ingress must reject a preprocess keys digest mismatch.",
    );

    await writeFinalCrsDirectory(directory, files, {
      compatibleBackendVersion: "9.9",
      subcircuitLibraryVersion: "9.9.0",
    });
    await expectFailure(
      () => loadVerifiedFinalCrsInput(directory),
      "Final CRS ingress must reject an incompatible provenance class.",
    );

    await writeFile(path.join(directory, "crs_provenance.json"), "{\n");
    await expectFailure(
      () => loadVerifiedFinalCrsInput(directory),
      "Final CRS ingress must reject malformed provenance JSON.",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  console.log("Checked final CRS generator input provenance and digest binding");
}

async function writeFinalCrsDirectory(
  directory: string,
  files: {
    readonly tauSequence: Uint8Array;
    readonly proverKeys: Uint8Array;
    readonly preprocessKeys: Uint8Array;
    readonly verifierKeys: Uint8Array;
  },
  overrides: {
    readonly compatibleBackendVersion?: string;
    readonly subcircuitLibraryVersion?: string;
  } = {},
): Promise<void> {
  await Promise.all([
    writeFile(path.join(directory, "tau_sequence.rkyv"), files.tauSequence),
    writeFile(path.join(directory, "prover_keys.rkyv"), files.proverKeys),
    writeFile(path.join(directory, "preprocess_keys.rkyv"), files.preprocessKeys),
    writeFile(path.join(directory, "verifier_keys.rkyv"), files.verifierKeys),
  ]);
  const version = overrides.subcircuitLibraryVersion ?? SUBCIRCUIT_LIBRARY_PACKAGE_VERSION;
  const provenance = {
    documentKind: "crs",
    protocolSchemaId: "tokamak-zk-evm-univariate",
    generationMethod: "trustedSetup",
    releaseEligible: false,
    generatedAtUtc: "2026-08-26T00:00:00Z",
    compatibleBackendVersion: overrides.compatibleBackendVersion ?? compatibleVersion(version),
    subcircuitLibrary: {
      packageName: SUBCIRCUIT_LIBRARY_PACKAGE_NAME,
      packageVersion: version,
      origin: SUBCIRCUIT_LIBRARY_ORIGIN,
      sourceDigest: `sha256:${"2".repeat(64)}`,
    },
    phase1SourceProvenance: null,
    ceremonyProtocolVersion: null,
    ceremonyTranscriptSha256: null,
    phase2ContributionCount: null,
    artifacts: {
      "tau_sequence.rkyv": sha256(files.tauSequence),
      "prover_keys.rkyv": sha256(files.proverKeys),
      "preprocess_keys.rkyv": sha256(files.preprocessKeys),
      "verifier_keys.rkyv": sha256(files.verifierKeys),
    },
  };
  await writeFile(
    path.join(directory, "crs_provenance.json"),
    `${JSON.stringify(provenance, null, 2)}\n`,
  );
}

function compatibleVersion(packageVersion: string): string {
  return packageVersion.split(".").slice(0, 2).join(".");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function expectFailure(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(message);
}

await main();
