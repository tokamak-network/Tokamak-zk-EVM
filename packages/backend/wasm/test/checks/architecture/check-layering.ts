import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(import.meta.dirname, "../../..");

async function main(): Promise<void> {
  await assertNoReverseApiImports();
  await assertProducerFieldLiteralsStayInAdapters();
  await assertContainerMagicHasOneOwner();
  console.log("Checked WASM protocol, producer-contract, and container ownership boundaries");
}

async function assertNoReverseApiImports(): Promise<void> {
  const roots = [
    "src/preprocess/protocol",
    "src/prover/protocol",
    "src/univariate",
  ];
  for (const root of roots) {
    for (const filePath of await typeScriptFiles(path.join(packageRoot, root))) {
      const source = await readFile(filePath, "utf8");
      if (/from\s+["'][^"']*\/api\//.test(source)) {
        throw new Error(`Protocol module imports an API adapter: ${relative(filePath)}.`);
      }
    }
  }
}

async function assertProducerFieldLiteralsStayInAdapters(): Promise<void> {
  const forbidden = [
    "a_pub_user",
    "a_pub_block",
    "a_pub_function",
    "proof_entries_part1",
    "proof_entries_part2",
    "preprocess_entries_part1",
    "preprocess_entries_part2",
  ];
  const permittedRoots = [
    path.join(packageRoot, "src/converter/conversion"),
    path.join(packageRoot, "src/generated"),
  ];
  for (const filePath of await typeScriptFiles(path.join(packageRoot, "src"))) {
    if (permittedRoots.some(root => filePath.startsWith(`${root}${path.sep}`))) {
      continue;
    }
    const source = await readFile(filePath, "utf8");
    for (const fieldName of forbidden) {
      if (source.includes(fieldName)) {
        throw new Error(`Producer field '${fieldName}' is interpreted outside an adapter: ${relative(filePath)}.`);
      }
    }
  }
}

async function assertContainerMagicHasOneOwner(): Promise<void> {
  for (const filePath of await typeScriptFiles(path.join(packageRoot, "src"))) {
    if (filePath.endsWith(path.join("artifacts", "binary", "binary-format.ts"))) {
      continue;
    }
    const source = await readFile(filePath, "utf8");
    if (source.includes("TZBWASM1")) {
      throw new Error(`Binary container magic is duplicated outside binary-format.ts: ${relative(filePath)}.`);
    }
  }
}

async function typeScriptFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return typeScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  }));
  return files.flat();
}

function relative(filePath: string): string {
  return path.relative(packageRoot, filePath);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
