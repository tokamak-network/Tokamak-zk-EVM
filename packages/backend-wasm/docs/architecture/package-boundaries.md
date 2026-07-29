# Backend WASM Package Boundaries

## Audience

This document is for backend-wasm maintainers reviewing architecture,
dependencies, generated assets, and publication contents.

## Public Boundary

The npm package exposes only:

- `@tokamak-zk-evm/snark-browser-compat/prover`
- `@tokamak-zk-evm/snark-browser-compat/preprocess`
- `@tokamak-zk-evm/snark-browser-compat/verifier`
- `@tokamak-zk-evm/snark-browser-compat/converter`

The root aggregate, runtime primitives, protocol modules, validators, generated
constants, and polynomial implementations are internal. Internal compiled files
may exist in the tarball as transitive dependencies, but the package `exports`
map prevents direct consumer imports.

Preprocess, prover, and verifier each own an explicit installation lifecycle
and one page-lifetime or process-lifetime curve runtime. They do not install
implicitly, accept a public `CurveRuntime`, or expose runtime termination.
Converter operations have no persistent installation.

The prover exposes both `prove(input)` and `begin(input)`. `prove()` is the
complete-proof convenience wrapper. `begin()` returns one opaque session whose
ordered `proveArithmetic()`, `proveCopy()`, `proveBinding()`, and `finalize()`
operations execute the same implementation. The session is an API boundary
over one in-memory protocol flow, not four independent provers.

Coarse progress is application-owned. The caller updates its state before each
ordered session operation and uses Promise resolution as the completion signal.
The prover protocol does not own UI phase state, percentages, timers, or
progress callbacks.

## Dependency Direction

Production dependencies flow in this direction:

```text
preprocess API ─┐
prover API ─────┼─> protocol operations ─> runtime primitives
verifier API ───┘                         └> artifact binary/spec views

converter API ─> converter implementations ─> artifact binary creation
                                      └──────> temporary conversion runtimes

validator implementation ─> artifact binary/spec modules
```

Preprocess, prover, and verifier must not import converter or validator entry
points. Converters and validators must not be called implicitly by runtime
preprocess, prove, or verify operations.

## Directory Ownership

### `src/artifacts`

- `binary`: binary header, table, digest, encoding, and decoding primitives.
- `setup`: shared setup parameter types.
- `specs`: one versioned JSON format specification per binary artifact kind and
  generated TypeScript spec constants.

### `src/generated`

- shared setup parameters and native/backend dependency versions generated from
  the pinned subcircuit-library package and native backend manifest.

### `src/runtime`

Shared execution infrastructure used by preprocess, prover, and verifier:

- curve construction and ffjavascript worker ownership;
- field encoding, task construction, and custom WASM kernels;
- group, pairing, transcript, random scalar, and polynomial operations.

This layer must not know about public installation state or artifact source
formats.

### `src/prover`

- `api`: public lifecycle, binary input decoding, proof output, and internal
  decoded-input entry points.
- `protocol`: one stateful prover flow and protocol-specific state/formulas.
- `commitments`: Sigma1 encoding and statement/binding commitments.
- `polynomial`: prover-owned polynomial formulas built on runtime buffers.
- `generated`: prover-only packed R1CS data and subcircuit metadata.

File boundaries must not recreate numbered `prove0` through `prove4` modules or
independent scheduling barriers. The four public session operations preserve
one transcript and retain all decoded input and intermediate state in memory;
they do not serialize, validate, or recompute intermediates.

### `src/verifier`

- `api`: public lifecycle and named binary input decoding.
- `protocol`: challenges, domains, equations, public-instance polynomial work,
  and verification orchestration.
- `generated`: build-generated verifier CRS constants.

The verifier returns boolean validity and does not produce an output artifact.

### `src/preprocess`

- `api`: independent public lifecycle, named binary input decoding, and binary
  output creation.
- `protocol`: permutation-polynomial construction and preprocess orchestration.
- `commitments`: dense Sigma1 and function-instance commitments.

Preprocess produces one verifier-preprocess binary containing `s0`, `s1`, and
`O_pub_fix`. It does not call the prover, share prover installation state, or
consume prover CRS. Its multithreaded dense-MSM outer chunk default is
`2 ** 17` points; applications may select a supported exponent during
preprocess installation without changing the prover's independent default.

### `src/converter`

- `index.ts`: the only public converter entry point.
- `conversion`: browser-compatible, material-specific converters plus binary
  inspection.
- `validation`: optional binary layout, digest, and spec validation.
- `worker`: temporary unified CRS conversion Worker and its RKYV decoder
  integration.

Each converter handles one source material per call. `convertCrs` is the sole
multi-output converter because one `combined_sigma.rkyv` decode produces the
standalone prover, preprocess, and verifier CRS artifacts. No converter builds
a bundle or manifest.

## Artifact Ownership

Runtime inputs are independent binary files supplied as named object
properties. Prover receives witness, permutation, instance, and prover CRS.
Verifier receives proof, instance, and verifier preprocess.
Preprocess receives permutation, instance, and preprocess CRS.

The application completes transport and storage I/O before invoking the runtime
API. Runtime code performs no network or filesystem I/O and does not fetch
Google Drive assets.

Shared setup parameters and dependency versions are generated under
`src/generated` at build time from the pinned
`@tokamak-zk-evm/subcircuit-library` package and native backend manifest.
Prover-only packed R1CS data and subcircuit metadata are generated separately
under `src/prover/generated`. Verifier CRS is regenerated during every build
from the explicit native owner artifact path. Verifier does not consume the
standalone verifier CRS emitted by `convertCrs`. Prover and preprocess CRS
remain runtime binary inputs prepared through `convertCrs`.

## Generated And Development Assets

Generated production source is updated only through scripts under
`scripts/generate` or `scripts/package`. Do not edit generated files manually.

Fixture preparation follows:

1. copy existing owner-package outputs into `tmp/fixtures`;
2. convert those copied sources;
3. write ignored binary fixtures under `fixtures/<suite>/runtime`.

Fixture scripts must fail when owner artifacts are absent. They must not invoke
native setup, preprocess, prove, verifier, or fixture-export programs.

Tests and diagnostics live under `test`. The only retained optimization
instrumentation is the prover timing-table generator. Test-only dense
polynomial code remains under `test/support` as an independent parity oracle.

## Publication Boundary

The npm tarball may contain only required compiled runtime/converter files,
converter Worker/WASM assets, README, license, and package metadata. It must not
contain:

- `test`, `scripts`, `fixtures`, `tools`, or `tmp`;
- diagnostics or timing output;
- copied fixture payloads;
- Rust `target` or generated decoder package directories;
- rejected optimization implementations;
- the development-only root aggregate.

Every publication candidate must run a dry-run packlist inspection and verify
the four public subpath imports.
