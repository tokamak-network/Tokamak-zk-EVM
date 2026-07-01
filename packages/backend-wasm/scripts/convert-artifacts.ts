import { fileURLToPath } from "node:url";

const COMMANDS = [
  "json-to-verifier-binary",
  "json-rkyv-to-prover-binary",
  "proof-binary-to-json",
  "binary-to-debug-json",
] as const;

function printUsage(): void {
  console.log(`Usage: convert-artifacts <command> [options]

Commands:
  json-to-verifier-binary    Convert native verifier JSON artifacts into a runtime-ready verifier bundle.
  json-rkyv-to-prover-binary Convert native JSON plus rkyv artifacts into a runtime-ready prover bundle.
  proof-binary-to-json       Convert a backend-wasm proof binary bundle into native-compatible proof JSON.
  binary-to-debug-json       Convert a backend-wasm binary bundle into debug JSON.

The converter is intentionally separate from src/prover and src/verifier. Runtime prove and verify APIs must only consume and emit binary bundles.`);
}

function main(argv: readonly string[]): void {
  const [command] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (!COMMANDS.includes(command as (typeof COMMANDS)[number])) {
    throw new Error(`Unknown converter command: ${command}.`);
  }

  throw new Error(`Converter command '${command}' is defined but not implemented in this milestone.`);
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  try {
    main(process.argv.slice(2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Artifact conversion failed: ${message}`);
    process.exitCode = 1;
  }
}
