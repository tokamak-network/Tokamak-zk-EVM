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
points. Each runtime binary loader performs the shared, producer-contract
structural admission before setup-dependent parsing. It does not call the
converter's optional self-digest validator or provenance policy.

## Directory Ownership

### `src/artifacts`

- `binary`: binary header, table, encoding, decoding, and mandatory runtime
  structural-admission primitives.
- `setup`: shared setup parameter types.
- `specs`: one versioned JSON format specification per binary artifact kind and
  generated TypeScript spec constants.

### `src/generated`

- ignored contract projections generated from backend-owned contract sources;
  `npm run contracts:prepare` refreshes these files;
- shared setup parameters and native/backend dependency versions. The ignored
  `active` child is generated from the explicitly selected input origin.

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
- `generated`: prover-only packed R1CS data and subcircuit metadata.

The current prover's protocol formulas and commitments are implemented in the
shared `src/univariate` layer and are called by the public prover API. They are
not duplicated under `src/prover`.

File boundaries must not recreate numbered `prove0` through `prove4` modules or
independent scheduling barriers. The four public session operations preserve
one transcript and retain all decoded input and intermediate state in memory;
they do not serialize, validate, or recompute intermediates.

### `src/verifier`

- `api`: public lifecycle and named binary input decoding.
- `generated`: build-generated verifier CRS constants.

The current verification equations and transcript orchestration are implemented
by `src/univariate/reference-verifier.ts` and called by the verifier API. There
is no separate `src/verifier/protocol` directory.

The verifier returns boolean validity and does not produce an output artifact.

### `src/preprocess`

- `api`: independent public lifecycle, named binary input decoding, and binary
  output creation.
- `protocol`: permutation-polynomial construction and preprocess orchestration.

Preprocess commitment and polynomial helpers are shared through `src/univariate`;
there is no separate `src/preprocess/commitments` directory.

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
- `worker`: temporary worker support used by offline CRS conversion.

Each converter handles one producer material per call. The offline native
`univariate-crs:convert` command reads the four role-separated RKYV files and
writes the browser manifest and chunks. Browser runtime code only consumes
that manifest/chunk interface; it does not decode a legacy combined Sigma
archive or build a bundle.

## Artifact Ownership

Runtime inputs are independent binary files supplied as named object
properties. Prover receives witness, permutation, instance, and prover CRS.
Verifier receives proof, instance, and verifier preprocess.
Preprocess receives permutation, instance, and preprocess CRS.

The application completes transport and storage I/O before invoking the runtime
API. Runtime code performs no network or filesystem I/O and does not fetch
Google Drive assets.

Contract projections under `src/generated` are generated from the backend-owned
contract sources. Selected build inputs are generated under
`src/generated/active`; prover-only packed R1CS data and subcircuit metadata
are generated under `src/prover/generated/active`; and verifier Sigma is
generated under `src/verifier/generated/active`. All of these outputs are
ignored. Compilation imports both the contract projections and the selected
active outputs.

Development generation selects local qap-compiler data and an explicit local
`verifier_keys.rkyv`. Production generation selects the pinned npm
`@tokamak-zk-evm/subcircuit-library` snapshot and the matching downloaded
`verifier_keys.rkyv`. The selection changes input provenance, not compiler
optimization. `prepack` always selects production inputs, preventing local
generated inputs from entering a publishable tarball. The verifier binds only
its build-time key; prover and preprocess receive browser CRS chunks at
runtime.

## Generated And Development Assets

Generated inputs are updated only through scripts under `scripts/generate` or
`scripts/package`. Do not edit generated files manually.

Fixture preparation follows:

1. copy existing owner-package outputs into `tmp/fixtures`;
2. convert those copied sources;
3. write ignored binary fixtures under `fixtures/<suite>/runtime`.

Fixture scripts must fail when owner artifacts are absent. They must not invoke
native setup, preprocess, prove, verifier, or fixture-export programs.

Tests and diagnostics live under `test`. The only retained optimization
instrumentation is the prover timing-table generator. Current univariate
polynomial and relation checks provide the retained arithmetic coverage; no
retired dense or bivariate test oracle is shipped.

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
