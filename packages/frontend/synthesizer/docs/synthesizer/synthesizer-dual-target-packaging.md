# Dual-Target Packaging Plan

This document defines the current packaging model for the Synthesizer when it is shipped in two forms:

- a built CLI for Node.js users
- a browser-compatible app package with callable synthesis functions

Backward compatibility is not required. The goal is to keep one shared synthesis core and expose target-specific adapters without duplicating synthesis flow logic.

## Target outcome

Use two published packages with explicit responsibilities and keep one internal module:

1. `@tokamak-zk-evm/subcircuit-library`
2. `@tokamak-zk-evm/synthesizer-node`
3. `@tokamak-zk-evm/synthesizer-web`
4. `packages/frontend/synthesizer/core`

### Package responsibilities

- `@tokamak-zk-evm/subcircuit-library`
  - Owns the generated JSON metadata and WASM files.
  - Exposes a stable manifest API.
  - Does not contain CLI logic or synthesis logic.

- `@tokamak-zk-evm/synthesizer-node`
  - Owns the published CLI.
  - Owns Node-specific asset loading, RPC helpers, and file output helpers.
  - Depends on the internal `core` module and `@tokamak-zk-evm/subcircuit-library`.

- `@tokamak-zk-evm/synthesizer-web`
  - Owns the browser app surface.
  - Exposes `synthesize(input)` plus browser-specific input loading, asset loading, and output adapters.
  - Depends on the internal `core` module.

- `packages/frontend/synthesizer/core`
  - Owns all environment-neutral synthesis logic.
  - Contains the `Synthesizer`, circuit generation, shared types, and subcircuit metadata derivation logic.
  - Is not published as a standalone npm package.
  - Does not import `node:*`, `commander`, `fs`, `path`, `process`, or browser globals.

## Why this structure

The current package mixes three different concerns:

- synthesis logic
- Node runtime integration
- subcircuit asset resolution

That coupling is the reason one package has to solve incompatible concerns at once:

- `src/interface/cli/index.ts` is a Node CLI entrypoint.
- `src/interface/node/jsonWriter.ts` and `src/interface/node/wasmLoader.ts` require filesystem access.
- `src/interface/qapCompiler/importedConstants.ts` imports installed package assets directly instead of receiving them through an abstraction.

This works for a Node package, but it is the wrong boundary for a browser app package. The browser target needs the same synthesis logic with different asset loading and no filesystem or CLI dependencies.

The current structure therefore uses:

- `core/` for shared synthesis flow and shared metadata parsing
- `node-cli/` for CLI parsing, Node RPC helpers, installed asset loading, and filesystem output
- `web-app/` for browser input loading, fetch-based asset loading, download helpers, and JSON POST output

## Required architectural rule

`core` must not read subcircuit assets directly from the installed package or the filesystem.

Instead, `core` must accept a provider interface.

```ts
export interface SubcircuitLibraryData {
  setupParams: SetupParams;
  globalWireList: GlobalWireList;
  frontendCfg: FrontendConfig;
  subcircuitInfo: SubcircuitInfo;
}

export interface SubcircuitLibraryProvider {
  getData(): Promise<SubcircuitLibraryData>;
  loadWasm(subcircuitId: number): Promise<ArrayBuffer>;
}
```

`core` should then derive all computed constants from `SubcircuitLibraryData` through a pure function.

```ts
export interface ResolvedSubcircuitLibrary {
  data: SubcircuitLibraryData;
  subcircuitInfoByName: SubcircuitInfoByName;
  subcircuitBufferMapping: Record<ReservedBuffer, SubcircuitInfoByNameEntry | undefined>;
  accumulatorInputLimit: number;
  numberOfPrevBlockHashes: number;
  jubjubExpBatchSize: number;
  arithExpBatchSize: number;
  firstArithmeticPlacementIndex: number;
}

export function resolveSubcircuitLibrary(data: SubcircuitLibraryData): ResolvedSubcircuitLibrary
```

This one change removes the current hard dependency on:

- `src/interface/qapCompiler/importedConstants.ts`
- `src/interface/node/wasmLoader.ts`

as core runtime assumptions.

## Current code to target package mapping

### Move to the internal `core` module

These modules are already close to environment-neutral logic:

- `src/synthesizer/**`
- `src/circuitGenerator/**`
- `src/interface/qapCompiler/configuredTypes.ts`
- `src/interface/qapCompiler/types.ts`
- `src/interface/qapCompiler/utils.ts`
- `src/interface/debugging/utils.ts`

Required change before moving:

- remove direct imports of `importedConstants.ts`
- replace them with either:
  - constructor injection, or
  - a runtime context object created from `ResolvedSubcircuitLibrary`

Current location structure:

```text
packages/frontend/synthesizer/core/src/
  app.ts
  circuit.ts
  qapCompiler.ts
  synthesizer.ts
  app/
  circuitGenerator/
  interface/qapCompiler/
  synthesizer/
```

### Move to `@tokamak-zk-evm/synthesizer-node`

These modules are Node-specific:

- `src/interface/cli/**`
- `src/interface/node/**`
- `src/interface/rpc/**`

Current location structure:

```text
packages/frontend/synthesizer/node-cli/src/
  interface/cli/
  interface/node/
  interface/qapCompiler/
  interface/rpc/
  synthesizer/
  index.ts
```

### Create in `@tokamak-zk-evm/synthesizer-web`

Current browser-specific adapters:

```text
packages/frontend/synthesizer/web-app/src/
  index.ts
  input.ts
  output.ts
  subcircuitLibrary.ts
  synthesize.ts
  types.ts
```

The browser package returns synthesis results as in-memory objects. It can additionally expose download and JSON POST adapters, but it must never depend on Node filesystem APIs.

## Node CLI package design

The Node target is a built CLI package.

### Published surface

- package name: `@tokamak-zk-evm/synthesizer-node`
- executable name: `synthesizer`
- entrypoint: `dist/cli/index.js`

### Responsibilities

- parse CLI arguments
- build `SynthesizerOpts`
- load installed subcircuit assets from `@tokamak-zk-evm/subcircuit-library`
- run synthesis
- write JSON outputs to disk

### What stays out of this package

- shared synthesis logic
- browser asset loading
- browser worker orchestration

## Web app package design

The browser target is a callable package, not a CLI.

### Published surface

- package name: `@tokamak-zk-evm/synthesizer-web`
- output format: ESM
- no CLI
- no filesystem APIs

### Export shape

```ts
export async function synthesize(input: SynthesisInput): Promise<SynthesisOutput>;
export async function prepareSynthesisInput(
  payload: SynthesisPayloadInput,
  provider: SubcircuitLibraryProvider,
): Promise<SynthesisInput>;
export function createFetchSubcircuitLibraryProvider(source: FetchSubcircuitLibrarySource): SubcircuitLibraryProvider;
export function createFileSubcircuitLibraryProvider(files: SubcircuitLibraryFiles): SubcircuitLibraryProvider;
export function saveSynthesisOutputToFiles(output: SynthesisOutput): void;
export async function postSynthesisOutput(url: string, output: SynthesisOutput): Promise<Response>;
```

### Runtime behavior

- fetch JSON metadata from URLs or load them from uploaded files
- fetch WASM files by subcircuit id
- return synthesis outputs in memory

### What the browser package should not do

- own application state or UI
- assume React, Vue, or any specific framework
- depend on Node filesystem APIs

## Core runtime API design

The internal `core` module should expose shared APIs that both targets can share without importing target-specific adapters.

### Recommended runtime shape

```ts
export interface SynthesizerArtifacts {
  placementVariables: PlacementVariables;
  publicInstance: PublicInstance;
  publicInstanceDescription: PublicInstanceDescription;
  permutation: Permutation;
}

export interface SynthesizerRuntime {
  synthesizer: SynthesizerInterface;
  generateArtifacts(): Promise<SynthesizerArtifacts>;
}

export async function createSynthesizerRuntime(opts: {
  synthesizerOpts: SynthesizerOpts;
  library: ResolvedSubcircuitLibrary;
  wasmLoader: (subcircuitId: number) => Promise<ArrayBuffer>;
}): Promise<SynthesizerRuntime>;
```

This is a better boundary than the current package because:

- Node and browser can share the same synthesis and circuit generation path.
- Asset access becomes injectable.
- File output becomes optional and target-specific.

## Build recommendation

Use bundlers for runtime outputs and TypeScript only for type checking and declarations.

### Recommended build rules

- package format: ESM-first for all libraries
- Node support floor: `>=20`
- `tsconfig` strategy: `moduleResolution: "NodeNext"`
- source imports should be consistent with the chosen output strategy
- runtime bundles should be produced by `tsup`, `esbuild`, or `vite`
- declaration files should be produced with `tsc --emitDeclarationOnly`

### Suggested build tool split

- `synthesizer-node`
  - `esbuild` or `tsup` for the CLI bundle
  - platform target: `node`
  - keep the shebang in the CLI entry

- `synthesizer-web`
  - `vite` library mode or `tsup`
  - optional worker bundle handled in the same package

### Why not use the existing `tsc` runtime chain as the main build

The current runtime packaging already shows that a bundler is the stable path for executable output. The future dual-target structure should make that explicit instead of treating bundling as an exception.

## Subcircuit library packaging rules

`@tokamak-zk-evm/subcircuit-library` should publish:

- JSON metadata
- WASM files
- a manifest that maps subcircuit ids to URLs or relative asset paths

Recommended package exports:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./manifest": "./dist/manifest.json",
    "./metadata": "./dist/metadata/index.js"
  }
}
```

Recommended runtime helpers:

- `createNodeSubcircuitLibraryProvider()`
- `createFetchSubcircuitLibraryProvider(baseUrl)`

If these helpers live in the subcircuit library package itself, the Synthesizer packages become even thinner. If not, keep them in `synthesizer-node` and `synthesizer-web`.

## Migration sequence

The safest migration is incremental and package-first.

### Phase 1: isolate core boundaries inside the current package

1. Introduce `SubcircuitLibraryData`, `SubcircuitLibraryProvider`, and `resolveSubcircuitLibrary`.
2. Replace `src/interface/qapCompiler/importedConstants.ts` reads with a resolved runtime context.
3. Change circuit generation so it returns `SynthesizerArtifacts` without writing files.
4. Keep existing CLI behavior by moving file output into Node-only helpers.

Exit criteria:

- the current package can run end-to-end without core code importing Node APIs

### Phase 2: move environment-neutral code into `core`

1. Move environment-neutral source files into `packages/frontend/synthesizer/core`.
2. Keep a narrow public API only for runtime creation, synthesis, and artifact generation.
3. Keep the module private to the repository.

Exit criteria:

- `core` builds with no Node-only imports

### Phase 3: split `synthesizer-node`

1. Move CLI, RPC, filesystem output, and node asset loading into `synthesizer/node-cli`.
2. Keep the published `bin` here.
3. Make `synthesizer-node` depend on `core` and `subcircuit-library`.

Exit criteria:

- a clean `npx @tokamak-zk-evm/synthesizer-node ...` flow exists

### Phase 4: create `synthesizer-web`

1. Add fetch-based asset loading.
2. Add a browser-facing runtime factory.
3. Add a worker path if witness calculation blocks the UI thread too heavily.

Exit criteria:

- a bundler can import `@tokamak-zk-evm/synthesizer-web` into a web application without Node polyfills

## File-by-file refactor priorities

These files are the first pressure points to change:

1. `src/interface/qapCompiler/importedConstants.ts`
   - Replace with a pure resolver that consumes injected metadata.

2. `src/interface/node/wasmLoader.ts`
   - Replace with a Node provider implementation, not a core dependency.

3. `src/interface/node/jsonWriter.ts`
   - Keep in Node only. Core should return data structures, not write files.

4. `src/interface/cli/index.ts`
   - Keep in Node only. It should become a thin adapter over `core`.

5. any module that imports `importedConstants.ts`
   - Change to receive a resolved subcircuit runtime object through dependency injection.

## Validation criteria

The migration is complete only if all of the following are true:

- the Node CLI package runs without sibling-repository path assumptions
- the browser package can be bundled without `node:*` polyfills
- the core package does not import filesystem, path, process, or CLI dependencies
- subcircuit metadata and WASM access happen only through provider interfaces
- synthesis outputs can be consumed in memory without mandatory file output

## Recommendation summary

The recommended long-term shape is:

- `subcircuit-library` publishes assets and manifest
- `packages/frontend/synthesizer/core` owns all pure synthesis logic
- `synthesizer-node` owns the CLI and Node integrations
- `synthesizer-web` owns the browser app adapters

Do not try to keep one package that directly mixes CLI, filesystem, installed assets, and reusable browser logic. That boundary is the current source of friction and will keep breaking both targets in different ways.
