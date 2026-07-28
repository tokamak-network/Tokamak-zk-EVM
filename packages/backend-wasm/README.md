# @tokamak-zk-evm/snark-browser-compat

`@tokamak-zk-evm/snark-browser-compat` provides browser-compatible preprocessing,
proof generation, proof verification, and artifact conversion for the Tokamak
zk-EVM protocol.
It is intended for application developers integrating Tokamak-specific proving
workflows, not as a generic Groth16 or PLONK backend.

Browser proving is a long-running, memory-intensive operation. Applications
must prepare and retain the required binary artifacts, install the prover or
verifier runtime explicitly, and use a bundler that supports ESM, Web Workers,
WebAssembly, and bare npm imports inside Worker graphs.

## When to use this package

Use this package when a bundler-based browser application must generate or
verify Tokamak zk-SNARK proofs, or convert application artifacts into the
binary formats consumed by those operations. Use `@tokamak-zk-evm/cli` instead
for the complete local Node.js and native-backend workflow. This package is not
a generic proving-system API and does not synthesize Tokamak L2 transactions.

## Contents

- [When to use this package](#when-to-use-this-package)
- [Install](#install)
- [Package facts](#package-facts)
- [Choose an API](#choose-an-api)
- [Public API reference](#public-api-reference)
- [Load binary artifacts](#load-binary-artifacts)
- [Run preprocess](#run-preprocess)
- [Verify a proof](#verify-a-proof)
- [Generate a proof](#generate-a-proof)
- [Track proving progress](#track-proving-progress)
- [Prepare application artifacts](#prepare-application-artifacts)
- [Convert, inspect, and validate binaries](#convert-inspect-and-validate-binaries)
- [Browser deployment and lifecycle](#browser-deployment-and-lifecycle)
- [Compatibility and versioning](#compatibility-and-versioning)
- [How this package relates to Tokamak zk-EVM](#how-this-package-relates-to-tokamak-zk-evm)
- [Measured browser performance](#measured-browser-performance)
- [Errors and troubleshooting](#errors-and-troubleshooting)
- [Project and license](#project-and-license)

## Package facts

| Fact | Value |
| --- | --- |
| Scope | Tokamak zk-EVM browser preprocessing, proof generation, verification, and artifact conversion |
| Public entry points | `./preprocess`, `./prover`, `./verifier`, and `./converter` |
| Protocol | Tokamak zk-SNARK protocol, not a generic proving-system API |
| Curve and runtime | BLS12-381 through ffjavascript |
| Module format | ESM |
| Runtime inputs | Independent named binary artifacts supplied by the application |
| Network behavior | No package-owned artifact download or filesystem I/O |
| Package license | `MIT OR Apache-2.0`; dependency licenses remain applicable |

## Install

Install the package and its runtime dependencies from npm:

```sh
npm install @tokamak-zk-evm/snark-browser-compat
```

The package is ESM-only and exposes exactly four public subpaths:

```ts
import("@tokamak-zk-evm/snark-browser-compat/preprocess");
import("@tokamak-zk-evm/snark-browser-compat/prover");
import("@tokamak-zk-evm/snark-browser-compat/verifier");
import("@tokamak-zk-evm/snark-browser-compat/converter");
```

Do not import the package root, `dist/` files, runtime primitives, generated
constants, or protocol internals. A Vite production consumer is verified.
Bundler-free direct serving of the package's compiled files is unsupported.
Complete verifier, prover, staged-progress, converter, inspection, and
validation source is available in
[`examples/browser`](./examples/browser).

## Choose an API

Use `./preprocess` to produce verifier preprocessing commitments, `./prover`
to create proofs, `./verifier` to check proofs, and `./converter` to prepare or
examine binary artifacts.

| Task | Import | Installation required | Result |
| --- | --- | --- | --- |
| Calculate verifier preprocessing | `./preprocess` `preprocess()` | Preprocess `install()` | Verifier-preprocess binary |
| Generate one complete proof | `./prover` `prove()` | Prover `install()` | Proof binary |
| Generate with phase boundaries | `./prover` `begin()` | Prover `install()` | Proof binary |
| Verify a proof | `./verifier` `verify()` | Verifier `install()` | `boolean` |
| Convert one source material | `./converter` material converter | No | Binary or proof JSON |
| Read binary tables | `./converter` `inspectBinary()` | No | Inspection object |
| Validate a binary | `./converter` `validateBinary()` | No | Validated artifact view |

`inspectBinary()`, `validateBinary()`, and `verify()` answer different
questions. Inspection decodes metadata, validation checks the binary's
structure and self-digest, and verification checks the cryptographic proof.

## Public API reference

### Prover API

| Export | Purpose |
| --- | --- |
| `prover.install(options?)` | Create or reuse the prover runtime and return version and chunk-size information |
| `prover.prove(input)` | Generate one complete verifier-proof binary |
| `prover.begin(input)` | Start one staged, stateful proving session |
| `ProverSession.proveArithmetic()` | Execute the arithmetic-constraints phase |
| `ProverSession.proveCopy()` | Execute the copy-constraints phase |
| `ProverSession.proveBinding()` | Execute the binding phase |
| `ProverSession.finalize()` | Execute integrated finalization, return the proof binary, and release the session |
| `ProverSession.dispose()` | Release an unfinished session; repeated calls are harmless |

Public prover types are `ProverInput`, `ProverInstallOptions`,
`ProverInstallationInfo`, and `ProverSession`.

### Verifier API

| Export | Purpose |
| --- | --- |
| `verifier.install()` | Create or reuse the verifier runtime and return version information |
| `verifier.verify(input)` | Return the cryptographic validity of one proof |

Public verifier types are `VerifierInput` and `VerifierInstallationInfo`.

### Preprocess API

| Export | Purpose |
| --- | --- |
| `preprocess.install(options?)` | Create or reuse the preprocess runtime and return version and chunk-size information |
| `preprocess.preprocess(input)` | Calculate `s0`, `s1`, and `O_pub_fix` and return one verifier-preprocess binary |

Public preprocess types are `PreprocessInput`, `PreprocessInstallOptions`, and
`PreprocessInstallationInfo`.

### Converter API

| Export | Input and result |
| --- | --- |
| `convertWitness(value)` | Parsed placement-variable JSON to witness binary |
| `convertPermutation(value)` | Parsed permutation JSON to permutation binary |
| `convertInstance(value)` | Parsed instance JSON to public and function instance sections |
| `convertVerifierPreprocess(value)` | Parsed preprocess JSON to verifier-preprocess binary |
| `convertProof(input)` | Convert native proof JSON to binary, or proof binary to a native proof JSON object, according to `sourceFormat` |
| `convertCrs(bytes)` | `combined_sigma.rkyv` bytes to named prover, preprocess, and verifier CRS binaries |
| `inspectBinary(bytes, options?)` | Binary header and section information without a validity claim |
| `validateBinary(bytes)` | Validated decoded artifact after layout, digest, and spec checks |

Public converter types are `BinaryArtifactInspection`,
`BinaryInspectionOptions`, `BinarySectionInspection`, `ConvertedCrs`,
`ConverterArtifactJson`, `ConvertProofBinaryInput`, `ConvertProofInput`,
`ConvertProofJsonInput`, and `RuntimeArtifactFileValidationResult`.

Every subpath exports `BackendWasmError` and `BackendWasmErrorCode`.

## Load binary artifacts

All runtime inputs are non-empty `Uint8Array` values. Complete network or
storage I/O before calling preprocess, the prover, or the verifier:

```ts
export async function loadBinary(url: string | URL): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
```

The package does not fetch, cache, refresh, or authenticate application
artifacts.

## Run preprocess

Install the independent preprocess runtime once and pass its three named binary
inputs:

```ts
import {
  install as installPreprocess,
  preprocess,
} from "@tokamak-zk-evm/snark-browser-compat/preprocess";

import { loadBinary } from "./load-binary.js";

const installation = await installPreprocess();

const [permutation, instance, preprocessCrs] = await Promise.all([
  loadBinary("/artifacts/permutation.bin"),
  loadBinary("/artifacts/instance.bin"),
  loadBinary("/artifacts/preprocess-crs.bin"),
]);

const verifierPreprocess = await preprocess({
  permutation,
  instance,
  preprocessCrs,
});

console.log(installation.chunkSize, verifierPreprocess.byteLength);
```

The current default chunk exponent is `18`. An application may explicitly select an
integer from `10` through `19`. A later explicit option takes precedence while
preprocess is idle; omitting the option preserves the installed value.

Preprocess and prover are independent. Preprocess consumes
`instance.function`, produces the `s0`, `s1`, and `O_pub_fix` commitments, and
does not call or prepare the prover.

## Verify a proof

Install the verifier once, retain it for the page lifetime, and pass the three
named binaries:

```ts
import {
  install as installVerifier,
  verify,
} from "@tokamak-zk-evm/snark-browser-compat/verifier";

import { loadBinary } from "./load-binary.js";

await installVerifier();

const [proof, instance, verifierPreprocess] = await Promise.all([
  loadBinary("/artifacts/proof.bin"),
  loadBinary("/artifacts/instance.bin"),
  loadBinary("/artifacts/verifier-preprocess.bin"),
]);

const valid = await verify({
  proof,
  instance,
  verifierPreprocess,
});
```

`verify()` returns `false` when a well-formed proof fails the cryptographic
verification equations. Installation, concurrency, binary decoding, and
runtime failures reject the Promise with `BackendWasmError`.

The verifier CRS is regenerated from the native owner artifact during every
package build and compiled into the verifier. Applications do not provide a
verifier CRS at runtime.

## Generate a proof

Install the prover once. Multithreaded ffjavascript primitives are always
enabled; the optional exponent controls only the outer dense Sigma1 MSM chunk
size:

```ts
import {
  install as installProver,
  prove,
} from "@tokamak-zk-evm/snark-browser-compat/prover";

import { loadBinary } from "./load-binary.js";

const installation = await installProver({
  chunkSizeExponent: 18,
});

const [witness, permutation, instance, proverCrs] = await Promise.all([
  loadBinary("/artifacts/witness.bin"),
  loadBinary("/artifacts/permutation.bin"),
  loadBinary("/artifacts/instance.bin"),
  loadBinary("/artifacts/prover-crs.bin"),
]);

const proof = await prove({
  witness,
  permutation,
  instance,
  proverCrs,
});

console.log(installation.chunkSize, proof.byteLength);
```

The exponent must be an integer from `10` through `19`. Omitting it uses `18`
on the first installation. A later `install()` call may change it while the
prover is idle; a later explicit option takes precedence. The chunk size is
`2 ** chunkSizeExponent`.

The input artifacts are independent files:

| Property | Content |
| --- | --- |
| `witness` | Placement subcircuit IDs, placement offsets, and field-valued placement variables |
| `permutation` | Row, column, X, and Y permutation entries |
| `instance` | Public instance field values shared with the verifier |
| `proverCrs` | Prover CRS points and prepared Sigma1/Sigma2 commitment data |

`prove()` returns one verifier-proof binary. It is a convenience wrapper over
the same stateful implementation exposed by `begin()`.

## Track proving progress

Use a staged prover session when the application needs coarse phase updates.
The calls are ordered and share one in-memory transcript:

```ts
import {
  begin,
  install as installProver,
  type ProverInput,
} from "@tokamak-zk-evm/snark-browser-compat/prover";

type ProverPhase =
  | "preparing"
  | "arithmetic"
  | "copy"
  | "binding"
  | "finalizing"
  | "completed";

export async function proveWithProgress(
  input: ProverInput,
  setPhase: (phase: ProverPhase) => void,
): Promise<Uint8Array> {
  await installProver();
  setPhase("preparing");
  const session = await begin(input);

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

These boundaries expose the arithmetic constraints, copy constraints, binding,
and integrated-finalization work. They do not serialize or validate
intermediate protocol state. The package does not estimate percentages or
remaining time. Finalize or dispose every session; an unfinished session
retains large prover state.

## Prepare application artifacts

The application owns artifact acquisition, provenance verification, conversion,
storage, caching, and invalidation.

| Runtime artifact | Source material | Preparation |
| --- | --- | --- |
| `witness` | Tokamak synthesizer placement-variable JSON | Parse JSON, then call `convertWitness()` |
| `permutation` | Tokamak synthesizer permutation JSON | Parse JSON, then call `convertPermutation()` |
| `instance` | Tokamak synthesizer instance JSON | Parse JSON, then call `convertInstance()`; the result contains distinct public and function sections |
| `proverCrs` | Release `combined_sigma.rkyv` | Load bytes, then use `convertCrs().proverCrs` |
| `preprocessCrs` | Release `combined_sigma.rkyv` | Load bytes, then use `convertCrs().preprocessCrs` |
| `verifierPreprocess` | Native verifier preprocess JSON | Parse JSON, then call `convertVerifierPreprocess()` |
| `proof` | `prove()` output or native proof JSON | Use directly or call `convertProof()` |

The package pins `@tokamak-zk-evm/subcircuit-library` and generates setup
parameters, packed R1CS data, and subcircuit metadata into the build. These are
not runtime inputs.

Obtain the large combined CRS source from the immutable
[Tokamak zk-EVM CRS release folder](https://drive.google.com/drive/folders/14xqCbLoyoVmUVTTlopiXtKnoHPBGL-Sv).
The package never downloads Google Drive artifacts. Keep provenance information
from the release source and invalidate cached converted binaries when the
application changes its compatible Tokamak release.

## Convert, inspect, and validate binaries

Converters handle one material per call and require no installation:

```ts
import {
  convertInstance,
  convertPermutation,
  convertProof,
  convertCrs,
  convertVerifierPreprocess,
  convertWitness,
  inspectBinary,
  validateBinary,
} from "@tokamak-zk-evm/snark-browser-compat/converter";

const witnessSource = await fetch("/sources/placementVariables.json").then(
  (response) => response.json(),
);
const witness = await convertWitness(witnessSource);

const rkyvResponse = await fetch("/sources/combined_sigma.rkyv");
const rkyvBytes = new Uint8Array(await rkyvResponse.arrayBuffer());
const { proverCrs, preprocessCrs, verifierCrs } = await convertCrs(rkyvBytes);

const inspection = await inspectBinary(proverCrs);
const validated = await validateBinary(proverCrs);
```

The application parses JSON before calling a converter. `convertCrs()`
transfers its input `ArrayBuffer` to a temporary module Worker, detaching the
caller's buffer. Pass `rkyvBytes.slice()` when the original bytes must remain
available.

`proverCrs` and `preprocessCrs` are application-owned runtime inputs for their
respective APIs. `verifierCrs` is an independently inspectable and validatable
converter output, but the current verifier continues using its build-generated
hardcoded CRS and does not accept it as an input.

`inspectBinary()` reads the file kind, versions, self-digest, and section table.
It does not establish validity. `validateBinary()` checks the fixed layout,
whole-file SHA-256 self-digest, and the versioned artifact specification. The
self-digest detects accidental or malicious byte changes; it does not
authenticate the producer or replace trusted provenance.

Preprocess, the prover, and the verifier deliberately do not call
`validateBinary()`. They decode and process their named binary inputs directly
to keep the runtime algorithms focused. Call validation separately when the
application's trust boundary requires it.

## Browser deployment and lifecycle

A Vite production build running in Chromium is the currently verified
browser-and-bundler combination.

| Capability | Status |
| --- | --- |
| Chromium with a Vite production build | Verified |
| Firefox or Safari | Not yet verified |
| Webpack consumer build | Requires compatible ESM/Worker asset handling; not yet verified |
| Bundler-free static ESM | Unsupported |
| Cross-origin isolation and `SharedArrayBuffer` | Not required by the verified path |

Deployment requirements:

- serve emitted JavaScript and Worker assets with JavaScript-compatible MIME
  types;
- serve the decoder with `Content-Type: application/wasm`;
- allow WebAssembly evaluation, including `script-src 'wasm-unsafe-eval'` under
  a restrictive Chromium CSP;
- allow same-origin and Blob workers, including `worker-src 'self' blob:`;
- let the bundler resolve the converter Worker's bare `ffjavascript` import.

Preprocess, prover, and verifier installations are independent and each creates
one reusable curve runtime. Concurrent first installs for one runtime family
share the same attempt. A failed install is not retried automatically, but a
later explicit `install()` may retry.

Only one operation may use each runtime family at a time. A second operation
rejects with `BUSY`; requests are not queued. Preprocess, prover, and verifier
may run concurrently, but the application owns the resulting CPU and memory
contention. There is no public terminate API. Keep each installed runtime until
the page or host process ends.

Avoid concurrent large converter calls unless the application has budgeted for
duplicate WASM memories and temporary buffers.

## Compatibility and versioning

Snark-browser-compat 2.1.3 is aligned with the Tokamak zk-EVM native backend and
subcircuit-library 2.1.3 release line.

| Boundary | Current value |
| --- | --- |
| Snark-browser-compat package | 2.1.3 |
| Native backend release line | 2.1.3 |
| `@tokamak-zk-evm/subcircuit-library` | 2.1.3 |
| Binary `formatVersion` | 1 |
| Package module format | ESM |
| Curve runtime | ffjavascript BLS12-381 |

`install()` reports the package, native backend, and subcircuit-library
versions. Every binary carries its independent `formatVersion` and
`sourcePackageVersion`. The format version identifies the binary layout; the
source package version identifies the producer release.

The runtime does not perform a separate compatibility handshake or optional
whole-file validation. Incompatible binary structure normally rejects with
`INVALID_INPUT`; a structurally decodable but cryptographically incompatible
proof may return `false`. Applications that manage multiple release lines
should inspect or validate artifacts before selecting a runtime.

## How this package relates to Tokamak zk-EVM

| Entity | Relationship |
| --- | --- |
| [Tokamak zk-EVM](https://github.com/tokamak-network/Tokamak-zk-EVM) | The owner repository and shared release line for this package |
| [Tokamak zk-SNARK protocol paper](https://eprint.iacr.org/2024/507) | The protocol definition implemented by preprocess, the prover, and the verifier |
| [Native backend](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/backend) | The protocol reference and accelerated ICICLE/arkworks implementation; it owns setup, preprocess, native proof, and verifier artifacts |
| [ffjavascript](https://github.com/iden3/ffjavascript) | The BLS12-381 field, group, MSM, FFT, pairing, WASM, and worker runtime used by browser execution |
| [`@tokamak-zk-evm/subcircuit-library`](https://www.npmjs.com/package/@tokamak-zk-evm/subcircuit-library) | The pinned source of build-generated setup parameters, packed R1CS data, and subcircuit metadata |
| [Immutable CRS release folder](https://drive.google.com/drive/folders/14xqCbLoyoVmUVTTlopiXtKnoHPBGL-Sv) | The application-acquired source of release CRS material, including `combined_sigma.rkyv` |

This package does not compile circuits, synthesize application inputs, run a
trusted setup, download release artifacts, authenticate artifact provenance, or
provide a generic proving-system abstraction.

The repository root separately deprecates historical WASM verifier packages.
That notice concerns the older verifier package surfaces. This README describes
the supported `@tokamak-zk-evm/snark-browser-compat` package with the explicit
`./preprocess`, `./prover`, `./verifier`, and `./converter` entry points; it
does not revive or provide compatibility with those historical packages.

## Measured browser performance

Accepted reference measurements generated preprocess and a 2,328-byte proof
and verified the proof in Chromium 149.0.7827.55:

| Measurement | Observed value |
| --- | ---: |
| Preprocess, three-run mean | 8.973 s |
| Preprocess population standard deviation | 70 ms |
| Proof generation | 118.82 s |
| Proof verification | 19 ms |
| Peak total Chromium-process RSS | 10.03 GiB |
| Peak largest-process RSS | 9.83 GiB |

Environment: MacBook Pro with Apple M4 Pro, 14 CPU cores, 48 GB memory, macOS
26.5.2, multithreaded ffjavascript, preprocess chunk exponent `17`, prover
chunk exponent `18`, and the 4,096 by 256 domain with 234 placements and
658,454 placement variables. Proof measurements were recorded on 2026-07-27
by package commit `4cb2ad9b`; preprocess measurements were recorded on
2026-07-28 before promoting the byte-identical measured candidate.

These are observations from one machine and fixture, not minimum requirements,
portable guarantees, or predictions for another browser, input, thermal state,
or system load.

## Errors and troubleshooting

All public subpaths export `BackendWasmError`. Branch on `error.code`, not the
message:

| Code | Meaning | Application action |
| --- | --- | --- |
| `INSTALL_REQUIRED` | Preprocess, prove, or verify was called before installation | Complete the matching `install()` call |
| `INSTALL_FAILED` | Runtime construction failed | Report the cause and retry only through a later explicit install |
| `BUSY` | The same runtime family is active | Disable duplicate actions and wait for the active operation |
| `INVALID_OPTION` | An install option is unknown or out of range | Correct the option before retrying |
| `INVALID_INPUT` | A binary or converter source could not be decoded | Check artifact kind, source, version, and conversion |
| `RUNTIME_FAILED` | Installed runtime work failed | Report the cause and treat the operation as failed |

Additional troubleshooting:

- `verify()` returning `false` is a cryptographic invalid-proof result, not an
  exception or installation failure.
- A validation self-digest mismatch means the binary bytes changed. Replace the
  complete artifact from its trusted source.
- Worker-load failures usually indicate an unsupported bundler output, CSP
  restriction, incorrect asset URL, or MIME type.
- A version mismatch requires selecting and converting artifacts from the
  compatible release line; the package does not silently fall back.
- Browser memory exhaustion may terminate the operation or renderer before an
  error can be delivered. Avoid concurrent proving and large conversions.
  A lower chunk exponent reduces the maximum outer dense-MSM submission but is
  not a universal memory guarantee.

## Project and license

- [Tokamak zk-EVM repository](https://github.com/tokamak-network/Tokamak-zk-EVM)
- [Snark-browser-compat package source](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/backend-wasm)
- [Issue tracker](https://github.com/tokamak-network/Tokamak-zk-EVM/issues)
- [Repository changelog](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/CHANGELOG.md)
- [Tokamak zk-SNARK protocol paper](https://eprint.iacr.org/2024/507)
- [`@tokamak-zk-evm/subcircuit-library` on npm](https://www.npmjs.com/package/@tokamak-zk-evm/subcircuit-library)
- [`@tokamak-zk-evm/snark-browser-compat` on npm](https://www.npmjs.com/package/@tokamak-zk-evm/snark-browser-compat)

This package's own code follows the repository's `MIT OR Apache-2.0` policy.
See [LICENSE-MIT](./LICENSE-MIT), [LICENSE-APACHE](./LICENSE-APACHE), and
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

This package license does not override dependency licenses. `ffjavascript` is
GPL-licensed. An application distribution that imports, links, or bundles
backend-wasm with `ffjavascript` must comply with the applicable GPL obligations
for the resulting combination. Externalizing dependencies from the converter
Worker changes where code is bundled; it does not remove those obligations.
This information is not legal advice.

Repository development and publication instructions are in
[CONTRIBUTING.md](./CONTRIBUTING.md).
