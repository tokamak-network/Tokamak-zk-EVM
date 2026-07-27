# Tokamak zk-EVM Backend WASM

`@tokamak-zk-evm/backend-wasm` provides the browser-compatible prover,
verifier, and artifact converters for the Tokamak zk-EVM backend protocol.
The native backend under `packages/backend` remains the protocol reference and
the accelerated ICICLE/arkworks implementation.

The package uses `ffjavascript` for BLS12-381 field, group, MSM, FFT, and pairing
operations. Prover and verifier hot paths consume binary artifacts only. JSON
and rkyv conversion, optional inspection, and optional validation remain outside
those runtime algorithms.

## Public Entry Points

The package exposes exactly three subpaths:

```ts
import("@tokamak-zk-evm/backend-wasm/prover");
import("@tokamak-zk-evm/backend-wasm/verifier");
import("@tokamak-zk-evm/backend-wasm/converter");
```

The package root and internal compiled paths are not public APIs.

### Prover

The prover must be installed explicitly. Installation creates one multithreaded
curve runtime that is reused for the lifetime of the page or host process.

```ts
const prover = await import("@tokamak-zk-evm/backend-wasm/prover");

const installation = await prover.install({
  chunkSizeExponent: 18,
});

const proof = await prover.prove({
  witness,
  permutation,
  instance,
  proverCrs,
});
```

Applications that need explicit protocol boundaries may run the same prover
through one opaque session:

```ts
const session = await prover.begin({
  witness,
  permutation,
  instance,
  proverCrs,
});

try {
  await session.proveArithmetic();
  await session.proveCopy();
  await session.proveBinding();
  const proof = await session.finalize();
} finally {
  session.dispose();
}
```

The four ordered operations advance construction through the arithmetic
constraints, copy constraints, binding, and integrated-opening phases,
respectively. Transcript dependencies mean that some final proof elements are
materialized in a later phase. The session retains decoded inputs, transcript
state, randomizers, polynomial buffers, and commitments in memory. It does not
expose or serialize intermediate protocol objects. `finalize()` returns the
same proof binary format as `prove()` and releases the session. `dispose()`
releases an unfinished session and is idempotent. If an operation is already
running, resource and busy-lock release is deferred until that operation
settles.

Applications can expose coarse progress by updating their own state immediately
before each staged call:

```ts
type ProverPhase =
  | "preparing"
  | "arithmetic"
  | "copy"
  | "binding"
  | "finalizing"
  | "completed";

async function proveWithProgress(
  input: Parameters<typeof prover.begin>[0],
  setPhase: (phase: ProverPhase) => void,
): Promise<Uint8Array> {
  setPhase("preparing");
  const session = await prover.begin(input);

  try {
    setPhase("arithmetic");
    await session.proveArithmetic();

    setPhase("copy");
    await session.proveCopy();

    setPhase("binding");
    await session.proveBinding();

    setPhase("finalizing");
    const proof = await session.finalize();

    setPhase("completed");
    return proof;
  } finally {
    session.dispose();
  }
}
```

The application knows that a phase started when it sets the state and that it
completed when the corresponding Promise resolves. A rejected Promise identifies
the active failing phase; the application decides how to represent that error.
The package does not estimate percentages or remaining time and does not add
callbacks inside protocol operations.

`chunkSizeExponent` controls the dense Sigma1 MSM chunk size as
`2 ** chunkSizeExponent`. It accepts integers from `10` through `19`. Omitting
the option uses `18`, or preserves the current value after installation.

Each input property is a non-empty `Uint8Array` containing one independently
prepared binary artifact:

- `witness`: placement-variable and witness material.
- `permutation`: permutation entries.
- `instance`: public instance values.
- `proverCrs`: prover CRS and prepared commitment data.

`prove()` returns one verifier proof artifact as `Uint8Array`.

### Verifier

The verifier has a separate installation and runtime:

```ts
const verifier = await import("@tokamak-zk-evm/backend-wasm/verifier");

const installation = await verifier.install();
const valid = await verifier.verify({
  proof,
  instance,
  verifierPreprocess,
});
```

The verifier input contains:

- `proof`: the verifier proof artifact.
- `instance`: the same public instance material used by the prover.
- `verifierPreprocess`: verifier preprocessing points.

Verifier CRS data is regenerated from the native owner artifact during every
package build and compiled into the verifier. It is not a runtime input.
`verify()` returns `boolean`; a cryptographically invalid proof returns `false`.

### Installation And Concurrency

Prover and verifier installation are independent. Concurrent first installation
calls for one family share that family's installation attempt. A failed attempt
is not retried automatically, but a later explicit `install()` may retry.

Only one operation may run in each family. The prover busy interval starts when
`begin()` or `prove()` accepts an input and ends when the proof is finalized,
the session fails, or the application calls `dispose()`. A second prover
operation or a second verifier operation is rejected with `BUSY`; operations
are not queued. Prover and verifier may run concurrently because they own
separate runtimes. The application is responsible for the resulting CPU and
memory contention.

A prover chunk-size change is rejected while `prove()` or a staged session is
active. Repeating `install()` without an option, or with the currently active
value, is allowed and does not recreate the runtime.

There is no public terminate or uninstall API. Runtime resources remain until
the page or host process ends.

### Errors

All three subpaths export the same `BackendWasmError` class. Applications should
branch on its stable `code`, not its message:

- `INSTALL_REQUIRED`: prove or verify was called before successful installation.
- `INSTALL_FAILED`: explicit runtime installation failed.
- `BUSY`: the same runtime family is already active.
- `INVALID_OPTION`: an option is unknown, malformed, or outside its range.
- `INVALID_INPUT`: a required binary or converter source is unusable.
- `RUNTIME_FAILED`: an installed prover or verifier runtime operation failed.

`message` and optional `cause` provide diagnostic context.

## Converter API

Converter functions require no installation and handle one source material per
call:

```ts
import {
  convertInstance,
  convertPermutation,
  convertProof,
  convertProverCrs,
  convertVerifierPreprocess,
  convertWitness,
  inspectBinary,
  validateBinary,
} from "@tokamak-zk-evm/backend-wasm/converter";
```

- `convertWitness(value)`: parsed placement-variable JSON value to witness binary.
- `convertPermutation(value)`: parsed permutation JSON value to permutation binary.
- `convertInstance(value)`: parsed instance JSON value to shared instance binary.
- `convertVerifierPreprocess(value)`: parsed preprocess JSON value to binary.
- `convertProof({ sourceFormat: "json", proof })`: parsed native proof JSON value
  to proof binary.
- `convertProof({ sourceFormat: "binary", proof })`: proof binary to native proof
  JSON value.
- `convertProverCrs(rkyvBytes)`: native `combined_sigma.rkyv` to prover CRS binary.
- `inspectBinary(bytes, options?)`: decode header and table information without
  claiming validity.
- `validateBinary(bytes)`: perform format, digest, layout, and artifact-spec
  validation.

The application parses JSON before calling a converter. Converter calls are not
serialized by the package.

`convertProverCrs` transfers the supplied `ArrayBuffer` to a temporary module
Worker, so the caller's input buffer is detached. Pass an explicit copy when the
source must remain available:

```ts
const proverCrs = await convertProverCrs(combinedSigmaRkyv.slice());
```

Avoid concurrent large conversions unless the application has budgeted for
duplicate WASM memories, CPU contention, and peak-memory growth.

## Binary Artifact Policy

Runtime algorithms decode their named binary inputs but deliberately do not run
the optional validator. Applications may call `validateBinary` before prove or
verify when their trust boundary requires it.

Each artifact contains its file kind, `formatVersion`,
`sourcePackageVersion`, section table, and exactly one whole-file SHA-256 self
digest. Section and source digests are not stored. `inspectBinary()` reports the
self digest as `selfDigestHex`; `validateBinary()` recomputes only that digest.
Every artifact kind has a versioned JSON layout specification under
`src/artifacts/specs/`. There is no external runtime manifest or bundle file.

Setup parameters and packed subcircuit data are generated from the pinned
`@tokamak-zk-evm/subcircuit-library` dependency. The package never fetches CRS
or other runtime artifacts from Google Drive.

## Repository Structure

```text
packages/backend-wasm/
  docs/
    architecture/
    optimization/
  fixtures/
  scripts/
    fixtures/
    generate/
    package/
  src/
    artifacts/
    converter/
    prover/
    runtime/
    verifier/
  test/
  tools/
    rkyv-decoder-wasm/
  tmp/
```

- `src/artifacts`: binary containers, decoded views, and versioned specs.
- `src/converter`: public converter API, material conversions, optional
  validation, and the Prover CRS Worker.
- `src/runtime`: shared ffjavascript-backed field, curve, group, pairing,
  transcript, random, and polynomial infrastructure.
- `src/prover`: public prover lifecycle plus integrated protocol operations.
- `src/verifier`: public verifier lifecycle plus verification protocol math.
- `scripts`: generated-source maintenance and local fixture I/O wrappers.
- `fixtures`: ignored prepared parity artifacts and their tracked copy manifest.
- `test`: checks, diagnostics, browser entry points, and test-only references.
- `tools/rkyv-decoder-wasm`: separately built Rust/WASM rkyv decoder source.
- `tmp`: ignored package-local work and report output.

Maintainer dependency and publication rules are documented in
`docs/architecture/package-boundaries.md`. Optimization history and retained
performance decisions are under `docs/optimization/`.

## Development

Prepare existing owner-package fixture outputs before copying them. The fixture
commands never run native setup, preprocess, prove, or verifier programs:

```sh
npm run fixtures:copy
npm run fixtures:prepare
```

The source copies are written to the ignored `tmp/fixtures/` tree. Converted
runtime fixtures are written to ignored `fixtures/small/runtime/`.

Common checks are:

```sh
npm run typecheck
npm run typecheck:scripts
npm run binary:check
npm run prover:ops:check
npm run prover:witness:check
npm run verifier:check
npm run prover:check
npm run verifier:browser:check
npm run prover:browser:check
npm run converter:browser:check
npm run build
```

`npm run prover:stage-timing:check` is the retained development-only prover
timing-table generator. Tests, diagnostics, fixtures, scripts, tools, and
`tmp` outputs are excluded from the npm package.

Use `npm run clean:temp` to remove package-local temporary outputs while
preserving `tmp/planning.md`.

## License

This package is licensed as `GPL-3.0-or-later`.

This is a package-local license decision. Other Tokamak zk-EVM packages may
remain licensed under `MIT OR Apache-2.0` unless they explicitly state
otherwise. Permissively licensed packages should not import, bundle, or
redistribute this package without reviewing the resulting GPL obligations.
