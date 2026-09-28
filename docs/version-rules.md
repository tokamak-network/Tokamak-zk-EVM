# Tokamak zk-EVM Version and Release Rules

This document is for repository maintainers and the GitHub, npm, and Google
Drive release authorities. It defines the release boundary; it is not a user
installation guide.

## Versioned elements

The public npm packages use one synchronized `MAJOR.MINOR.PATCH` version:

- `@tokamak-zk-evm/subcircuit-library`;
- `@tokamak-zk-evm/synthesizer-node`;
- `@tokamak-zk-evm/synthesizer-web`;
- `@tokamak-zk-evm/cli`; and
- `@tokamak-zk-evm/snark-browser-compat`.

The root `package.json` is authoritative for that version and the backend Rust
workspace inherits it. The Rust backend is installed or built by the CLI; it
is not a standalone npm or crates.io release.

`packages/backend/wasm` intentionally resolves the exact published
`@tokamak-zk-evm/subcircuit-library` version from npm. It is outside the root
workspace so that its tracked lock records the registry tarball and SHA-512
integrity that a published consumer will receive.

The CLI manifest also declares a canonical `compatibleBackendVersion` of
`MAJOR.MINOR`. Package versions, backend metadata, and CRS provenance must
normalize to that same compatibility class. A patch release can reuse a CRS
only when this class and the source digest are unchanged.

## CRS identity and layout

The source digest is a SHA-256 framed digest of the CRS-relevant subcircuit
files, encoded as `sha256:<64 lowercase hexadecimal characters>`. The inputs
are the sorted package-relative paths and contents of the rendered constants,
R1CS, WASM, JSON, frontend configuration, setup parameters, and subcircuit
information. Package metadata, changelogs, witness helpers, and diagnostic
output are excluded. No FNV digest or legacy fallback is a compatibility
identity.

The public Filecoin-backed CRS is identified by `MAJOR.MINOR` and is stored in
Google Drive as:

```text
<root>/tau_sequence/<sha256 of tau_sequence.rkyv>.rkyv
<root>/MAJOR.MINOR/prover_keys.rkyv
<root>/MAJOR.MINOR/preprocess_keys.rkyv
<root>/MAJOR.MINOR/verifier_keys.rkyv
<root>/MAJOR.MINOR/crs_provenance.json
```

The compatibility directory contains the three role-key files and provenance.
Provenance names the digest-addressed shared tau and records the SHA-256 of the
tau and role-key payloads. Readers resolve exactly one compatibility directory,
reject duplicate required objects, download provenance first, then fetch only
the named tau and role-key files. Additional directory objects are ignored.
ZIP archives, timestamp selection, combined sigma files, and legacy archive
names are not release authorities.

CRS reuse requires both the compatibility class and equality of the source
digest in CRS provenance and all backend build metadata. A changed circuit,
public input contract, proving or verification semantics, setup output, or
CRS-required metadata needs a new compatibility class and CRS. A package-only
change can use a patch version only when those identities remain unchanged.

## Candidate and merge rule

One `dev` to `main` pull request carries all release source changes. Its
Changelog date is the local calendar date on which the release PR is drafted
offline. That record may differ from both the npm publication date and the
GitHub merge date.

When a new version needs a subcircuit library, the npm owner builds and
publishes it locally before the release PR is merged. The Google Drive folder
owner then uploads a compatible CRS locally. The browser production lock must
record the exact npm tarball and integrity. The PR `Source build` check builds
the candidate and confirms that the published library and public CRS are
available and compatible. A later Circom rebuild is not used as a byte-for-byte
identity test for the immutable npm tarball.

## Publication from main

Each push to `main`, whether from a PR merge or a direct push, runs
`.github/workflows/publish-tokamak-zk-evm.yml` from that commit. The workflow
builds the four dependent packages from merged source, checks the published
subcircuit library and compatible CRS, and tests the candidate Node/CLI and
Web/browser-backend package pairs through complete proof workflows. Publication
starts only after both tests pass, then publishes missing exact versions in
dependency order. The CRS is downloaded and hash-checked through read-only
Drive access; Actions never uploads it or publishes the foundation package.

The publishing job uses npm Trusted Publishing. For each dependent package,
an absent exact version is published, an identical version is skipped, and a
different or indeterminate registry result stops the run. It also stops before
publishing if `main` has moved beyond the run's commit. Rerun a failed workflow
only when previously published versions still match the package tarballs built
from the current `main` source. There is no separate release dispatch, frozen
PR identity, or mutable release-state file.

`main` can temporarily lead npm publication while this workflow runs. A release
is complete only when the main-push workflow succeeds and the expected npm
versions are public. A failed run requires correction or a safe retry; it never
authorizes republishing an immutable version with changed contents.

## Operational constraints

- `tokamak-l2js` remains exactly `0.2.0` in manifests and tracked locks.
- The CLI must fail before runtime work when synchronized `3.x.y` packages are
  mixed with `2.x.y` packages.
- Release checks use Node.js `24.20.0`, npm `11.19.0`, Rust `1.95.0`, Circom
  `2.2.3`, and committed locks.
- Only a verified npm `E404` establishes that an exact version is absent.
  Authentication, authorization, malformed metadata, network errors, or an
  existing non-identical tarball stop admission.
- Tokens, OAuth material, private keys, service-account files, and npm
  authentication material remain untracked. GitHub authority is
  `JehyukJang`, npm authority is `jehyuk`, and Drive mutation authority belongs
  to the folder owner.
- The Filecoin-backed phase-2 operational limitation may be described only as
  an implementation fact until the deferred security-boundary research
  supports a security claim.
