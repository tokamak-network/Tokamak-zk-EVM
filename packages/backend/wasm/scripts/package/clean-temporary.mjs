import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const temporaryRoot = path.join(packageRoot, "tmp");
const retainedEntries = new Set(["planning.md"]);

let entries;
try {
  entries = await readdir(temporaryRoot);
} catch (error) {
  if (error?.code === "ENOENT") {
    console.log("No package-local temporary outputs to remove.");
    process.exit(0);
  }
  throw error;
}

const removableEntries = entries.filter((entry) => !retainedEntries.has(entry));
await Promise.all(
  removableEntries.map((entry) =>
    rm(path.join(temporaryRoot, entry), { recursive: true, force: true }),
  ),
);

console.log(
  `Removed ${removableEntries.length} package-local temporary output entr${removableEntries.length === 1 ? "y" : "ies"}.`,
);
