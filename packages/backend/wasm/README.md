# @tokamak-zk-evm/snark-browser-compat

`@tokamak-zk-evm/snark-browser-compat` provides browser-compatible
preprocessing, proving, verification, and artifact conversion for the current
Tokamak zk-EVM univariate proving protocol. It is not a generic proving-system
API and does not synthesize transactions.

## Audience and scope

This package is for browser application developers who already have the
artifacts produced by the Tokamak synthesizer and backend trusted setup. Use the
Tokamak CLI for the complete local synthesis and native backend workflow.

The package exposes four ESM subpaths:

```ts
import('@tokamak-zk-evm/snark-browser-compat/preprocess');
import('@tokamak-zk-evm/snark-browser-compat/prover');
import('@tokamak-zk-evm/snark-browser-compat/verifier');
import('@tokamak-zk-evm/snark-browser-compat/converter');
```

Do not import the package root, `dist/` files, generated constants, or runtime
internals. The package performs no network or filesystem I/O.

## Install

```sh
npm install @tokamak-zk-evm/snark-browser-compat
```

The browser runtime uses BLS12-381 through ffjavascript. Vite and Webpack ESM
consumers are supported. Applications must serve WebAssembly and emitted worker
assets with appropriate MIME types and content-security policy.

## Runtime artifact guide and acquisition

Applications acquire synthesizer artifacts and browser CRS chunks through their
own authenticated storage path, then pass bytes to this package. The current
runtime does not accept the retired `combined_sigma.rkyv` archive; it consumes
the four-role CRS after offline conversion to a manifest and bounded chunks.

## Artifact model

The current protocol accepts the following independent binary artifacts:

| Artifact | Owner | Consumer |
| --- | --- | --- |
| `selector` | Synthesizer | Preprocess and prover |
| `permutation` | Synthesizer | Preprocess and prover |
| `witness` | Synthesizer | Prover |
| `instance` | Synthesizer | Preprocess, prover and verifier |
| `crs` manifest and chunks | Backend trusted setup plus the offline WASM converter | Preprocess and prover; each loads only its required sections |
| `verifierPreprocess` | `preprocess()` | Verifier |
| `proof` | `prove()` | Verifier |

`proof` contains exactly the current protocol's ten affine G1 values and
seven scalar evaluations. The selector, transcript state, configuration, and
provenance are not duplicated inside the proof.

Frontend input binaries use the producer-defined `TZBWASM1` container. The container records
the artifact kind, producer package version, section table, and self-digest.
Proof and preprocess use the backend common fixed-layout codecs directly: 1,184 and 384 bytes, respectively. Their coordinates are canonical little-endian affine bytes, not Montgomery memory, and carry no browser envelope.

The CRS is different because the production archives can exceed the 4 GiB
address space of one browser `Uint8Array`. Native trusted setup emits
`tau_sequence.rkyv`, `prover_keys.rkyv`, `preprocess_keys.rkyv`, and `verifier_keys.rkyv`. An offline
64-bit converter reads that directory with read-only memory maps and writes a
small manifest plus bounded section chunks.
Browser runtimes load chunks lazily through an application-provided callback.
CRS payload digests are checked only when explicitly requested.

## Public API reference

| Export | Purpose |
| --- | --- |
| `prover.install(options?)` | Install or reconfigure the prover runtime while idle |
| `prover.prove(input, options?)` | Produce one complete proof binary |
| `preprocess.install(options?)` | Install or reconfigure the preprocessing runtime while idle |
| `preprocess.preprocess(input, options?)` | Produce S_C, C_fix and E_kappa |
| `verifier.install()` | Install the verifier runtime |
| `verifier.verify(input)` | Check one current-protocol proof |
| `convertWitness(value)` | Convert synthesizer placement variables |
| `convertSelector(value)` | Convert the synthesizer placement selector |
| `convertPermutation(value)` | Convert the synthesizer permutation |
| `convertInstance(value)` | Convert the synthesizer public instance |
| `inspectBinary(bytes)` | Inspect a binary container without a validity claim |
| `validateBinary(bytes)` | Validate binary layout, shape, and self-digest |

Both `prove(input, { checkDigests: true })` and
`preprocess(input, { checkDigests: true })` check SHA-256 for each loaded CRS
chunk before consuming it. The option defaults to false independently on each
call, matching native prove's opt-in `--check-digests` policy. Manifest format,
version, section bounds, lengths and arithmetic checks remain mandatory in
both modes. Default mode does not guarantee detection of well-shaped payload
corruption. Converter and build-time validation are unchanged. This option
does not authenticate the manifest's publisher.

Each public subpath exports its operation types and the `BackendWasmError`
error taxonomy. The prover and preprocess subpaths also export the CRS chunk
input type. Use the package declarations in an editor for the complete type
surface.

## Convert source artifacts

Converters accept the producer-owned JSON shapes and return browser binary
artifacts. They require no runtime installation.

```ts
import { convertInstance, convertPermutation, convertSelector, convertWitness } from
  '@tokamak-zk-evm/snark-browser-compat/converter';

const [witnessSource, selectorSource, permutationSource, instanceSource] =
  await Promise.all([
    fetch('/sources/placementVariables.json').then(response => response.json()),
    fetch('/sources/selector.json').then(response => response.json()),
    fetch('/sources/permutation.json').then(response => response.json()),
    fetch('/sources/instance.json').then(response => response.json()),
  ]);

const [witness, selector, permutation, instance] = await Promise.all([
  convertWitness(witnessSource),
  convertSelector(selectorSource),
  convertPermutation(permutationSource),
  convertInstance(instanceSource),
]);
```

`inspectBinary()` reports container metadata without making a validity claim.
`validateBinary()` checks the container structure, artifact specification, and
self-digest. Neither function authenticates the producer.

Development builds generate embedded circuit metadata from the local
qap-compiler output. Production builds select the pinned npm
`@tokamak-zk-evm/subcircuit-library` snapshot. Both modes use the same runtime
artifact interfaces. Both builds require `BACKEND_WASM_VERIFIER_CRS_DIR`: trusted-setup output for development, or a supplied matching release key plus `crs_provenance.json` for production. Only `verifier_keys.rkyv` is read to build the fixed verifier; the production build additionally checks provenance compatibility and its key digest. Missing keys fail the build. No key or circuit package is downloaded by the verifier runtime.

Convert the native CRS offline from `packages/backend/wasm`:

```sh
npm run univariate-crs:convert -- \
  --tau-sequence ../rust/setup/output/crs/tau_sequence.rkyv \
  --keys ../rust/setup/output/crs \
  --output ./tmp/browser-crs
```

The command uses a release-built native reader, never materializes the whole
archive in JavaScript, and publishes the output directory only after all
chunks and the manifest are complete. Serve the entire directory without
renaming its relative chunk paths.

Create a reusable runtime CRS loader from the served manifest:

```ts
import type { UnivariateCrsChunkInput } from '@tokamak-zk-evm/snark-browser-compat/prover';

export async function loadCrs(
  manifestPath: string | URL,
): Promise<UnivariateCrsChunkInput> {
  const manifestUrl = new URL(manifestPath, location.href);
  const manifestResponse = await fetch(manifestUrl);
  if (!manifestResponse.ok) {
    throw new Error(`Failed to load CRS manifest: ${manifestResponse.status}`);
  }

  return {
    manifest: await manifestResponse.json(),
    async loadChunk(relativePath: string) {
      const response = await fetch(new URL(relativePath, manifestUrl));
      if (!response.ok) throw new Error(`Failed to load CRS chunk: ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
```

## Preprocess

Install the preprocessing runtime once, then commit the admitted selector and
permutation using the preprocessing CRS.

```ts
import {
  install as installPreprocess,
  preprocess,
} from '@tokamak-zk-evm/snark-browser-compat/preprocess';
import { loadBinary } from './load-binary.js';
import { loadCrs } from './load-crs.js';

await installPreprocess({ chunkSizeExponent: 17 });

const [instance, selector, permutation, crs] = await Promise.all([
  loadBinary('/artifacts/instance.bin'),
  loadBinary('/artifacts/selector.bin'),
  loadBinary('/artifacts/permutation.bin'),
  loadCrs('/artifacts/crs/univariate-crs-manifest.json'),
]);

const verifierPreprocess = await preprocess({
  instance,
  selector,
  permutation,
  preprocessCrs: crs,
});
```

`preprocess()` returns S_C and C_fix in G1 and E_kappa in G2. It uses the fixed-public values in the instance to construct C_fix, but does not consume the witness.

## Prove

Install the prover once and generate a complete proof in one call.

```ts
import {
  install as installProver,
  prove,
} from '@tokamak-zk-evm/snark-browser-compat/prover';
import { loadBinary } from './load-binary.js';
import { loadCrs } from './load-crs.js';

await installProver({ chunkSizeExponent: 18 });

const [witness, selector, permutation, instance, crs] = await Promise.all([
  loadBinary('/artifacts/witness.bin'),
  loadBinary('/artifacts/selector.bin'),
  loadBinary('/artifacts/permutation.bin'),
  loadBinary('/artifacts/instance.bin'),
  loadCrs('/artifacts/crs/univariate-crs-manifest.json'),
]);

const proof = await prove({
  witness,
  selector,
  permutation,
  instance,
  proverCrs: crs,
});
```

Only one proof operation may use the installed runtime at a time. Concurrent
calls reject with `BackendWasmError` code `BUSY`. The chunk exponent must be an
integer from 10 through 19 and may be changed while the runtime is idle.

## Verify

The verifier performs online verification only. Its key, fixed field values, prepared G2 operands and G1 tables are bound when the package is built. Replacing the CRS requires rebuilding the verifier. Runtime inputs are the free-public statement, proof and admitted preprocess output; no selector, permutation or CRS is read at runtime.

```ts
import {
  install as installVerifier,
  verify,
} from '@tokamak-zk-evm/snark-browser-compat/verifier';
import { loadBinary } from './load-binary.js';

await installVerifier();

const [proof, instance, verifierPreprocess] =
  await Promise.all([
    loadBinary('/artifacts/proof.bin'),
    loadBinary('/artifacts/instance.bin'),
    loadBinary('/artifacts/verifier-preprocess.bin'),
  ]);

const valid = await verify({
  proof,
  instance,
  verifierPreprocess,
});
```

`verify()` returns `false` for a well-formed proof that fails the protocol
equations. Installation, concurrency, malformed artifacts, and runtime failures
reject with `BackendWasmError`.

## Loading binaries

Applications own artifact acquisition, authentication, caching, and
invalidation. Complete I/O before calling a runtime operation:

```ts
export async function loadBinary(url: string | URL): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
```

Source provenance remains an application trust-boundary concern. Runtime
admission checks the exact binary kind and required sections but does not use
`releaseEligible` as a preprocess, prove, or verify gate.

## Contributor workflow

The [browser contributor guide](docs/development.md) covers local build,
typecheck, and fixture qualification commands. For an application integration,
use the API examples above or the runnable
[`examples/browser`](./examples/browser) Vite project instead.

## Security and application responsibilities

- Treat witness and proof-generation state as sensitive application data.
- Do not run two operations concurrently through the same installed subpath.
- Retain one mutually compatible selector, permutation, circuit library, CRS,
  preprocess output, instance, and proof set.
- Validate and authenticate source artifacts at the application's trust
  boundary; a binary self-digest is not producer authentication.
- Development trusted-setup output is not release or deployment material.

## npm publication

The supported browser package is
[`@tokamak-zk-evm/snark-browser-compat`](https://www.npmjs.com/package/@tokamak-zk-evm/snark-browser-compat).
Published builds use the production npm subcircuit-library snapshot and a
matching verifier key at build time. They do not package local development
fixtures, trusted-setup output, or CRS chunks.

## Project and license

The package is dual-licensed under `MIT OR Apache-2.0`. Dependencies retain
their own licenses. Repository-level release notes are maintained in
[`CHANGELOG.md`](../../../CHANGELOG.md).
