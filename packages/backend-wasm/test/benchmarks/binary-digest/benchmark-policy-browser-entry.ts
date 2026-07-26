import {
  parseDigestPolicy,
  runDigestPolicy,
  type DigestPolicy,
} from "./digest-policy-candidates.js";

interface BrowserPolicyResult {
  readonly status: "pending" | "ok" | "error";
  readonly policy?: DigestPolicy;
  readonly elapsedMs?: number;
  readonly sourceBytes?: number;
  readonly artifactBytes?: number;
  readonly parity?: true;
  readonly error?: string;
}

declare global {
  interface Window {
    __digestPolicyBenchmark?: BrowserPolicyResult;
  }
}

window.__digestPolicyBenchmark = { status: "pending" };

run().then(
  (result) => {
    window.__digestPolicyBenchmark = { status: "ok", ...result };
  },
  (error: unknown) => {
    window.__digestPolicyBenchmark = {
      status: "error",
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
  },
);

async function run(): Promise<Omit<BrowserPolicyResult, "status">> {
  const policy = parseDigestPolicy(
    new URL(window.location.href).searchParams.get("policy") ?? undefined,
  );
  const [source, artifact] = await Promise.all([
    fetch("/source.rkyv").then((response) => response.arrayBuffer())
      .then((buffer) => new Uint8Array(buffer)),
    fetch("/artifact.bin").then((response) => response.arrayBuffer())
      .then((buffer) => new Uint8Array(buffer)),
  ]);
  const startedAt = performance.now();
  const result = await runDigestPolicy(policy, source, artifact);
  return {
    policy,
    elapsedMs: performance.now() - startedAt,
    sourceBytes: source.byteLength,
    artifactBytes: artifact.byteLength,
    parity: result.parity,
  };
}
