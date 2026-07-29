import path from "node:path";

export function resolveFixtureWorkDirectory(
  repositoryRoot: string,
  backendWasmRoot: string,
  workDirectory: string,
): string {
  const workDirectoryPath = path.resolve(repositoryRoot, workDirectory);
  const allowedRoot = path.resolve(backendWasmRoot, "tmp", "fixtures");
  if (!isPathInside(workDirectoryPath, allowedRoot)) {
    throw new Error(
      `Copy manifest workDirectory must stay under packages/backend-wasm/tmp/fixtures: ${workDirectory}`,
    );
  }
  return workDirectoryPath;
}

export function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
