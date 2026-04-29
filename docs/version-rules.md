# Tokamak zk-EVM Version Rules

Tokamak zk-EVM has multiple versioned surfaces. They intentionally do not all use the same precision.

The consumer-facing entry point is the npm package `@tokamak-zk-evm/cli`. Its `packages/cli/package.json` manifest is
the source of truth for the backend compatibility version used by CLI installs, backend release metadata, and public CRS
selection.

## Versioned Elements

### Repository Packages

The repository packages use the full release version:

```text
MAJOR.MINOR.PATCH
```

The synchronized package version applies to:

- The root `package.json`.
- `packages/cli/package.json`.
- `packages/frontend/qap-compiler/package.json`.
- `packages/frontend/qap-compiler/dist/package.json`.
- `packages/frontend/synthesizer/node-cli/package.json`.
- `packages/frontend/synthesizer/web-app/package.json`.
- `packages/backend/Cargo.toml` workspace package version.
- Backend workspace packages such as `libs`, `mpc-setup`, `preprocess`, `prove`, `trusted-setup`, and `verify`.

This version changes for every published release, including patch-only changes that do not change the circuit or CRS.

### CLI Compatibility Version

`packages/cli/package.json` stores the canonical compatibility version:

```json
{
  "tokamakZkEvm": {
    "compatibleBackendVersion": "MAJOR.MINOR"
  }
}
```

This value must be strict canonical `MAJOR.MINOR`. It must equal the `MAJOR.MINOR` prefix of the CLI package version and
the backend workspace package version.

For example, package version `2.0.14` must declare:

```json
{
  "tokamakZkEvm": {
    "compatibleBackendVersion": "2.0"
  }
}
```

The compatibility version must not include a patch component. A package patch release must continue to use the same
compatibility version when the circuit, proving setup, and CRS remain valid.

### Backend CRS

The public backend CRS uses only the compatibility version:

```text
MAJOR.MINOR
```

The CRS version identifies the proving setup compatibility class. It must not include a patch component in newly
published CRS provenance or archive names.

New CRS archives must be named:

```text
tokamak-backend-crs-vMAJOR.MINOR-YYYYMMDDTHHMMSSZ.zip
```

New `crs_provenance.json` files must store:

```json
{
  "backend_version": "MAJOR.MINOR"
}
```

CRS archives whose names or provenance use `MAJOR.MINOR.PATCH` are invalid under this version model. Legacy CRS archive
compatibility and migration are intentionally not supported by this rule set.

## Compatibility Rule

Compatibility between CLI, backend binaries, and CRS is checked by canonical `MAJOR.MINOR`.

Examples:

- CLI package `2.0.14`, backend package `2.0.14`, and CRS `2.0` are compatible.
- CLI package `2.0.15`, backend package `2.0.15`, and CRS `2.0` are compatible when the subcircuit source digest also
  matches.
- CLI package `2.1.0`, backend package `2.1.0`, and CRS `2.0` are incompatible.
- CLI package `2.0.14` and CRS `2.0.14` are invalid because CRS versions must not include a patch component.

Package versions are strict `MAJOR.MINOR.PATCH`. Tooling derives their `MAJOR.MINOR` compatibility prefix. CRS archive
names, CRS provenance, and `compatibleBackendVersion` fields must already be canonical `MAJOR.MINOR`.

## Subcircuit Compatibility

Subcircuit package versions are not sufficient to prove CRS compatibility.

Backend build metadata records the subcircuit library `sourceDigest`. This digest identifies the actual compiled
subcircuit-library contents embedded into or used by the backend binary. A patch release may reuse the same CRS only when
the backend binaries and the CRS metadata report the same subcircuit `sourceDigest`.

The required rule is:

```text
CRS build-metadata-mpc-setup.json dependencies.subcircuitLibrary.sourceDigest
  ==
backend build-metadata-{preprocess,prove,verify}.json dependencies.subcircuitLibrary.sourceDigest
```

The subcircuit package version may be useful diagnostic metadata, but CRS compatibility is decided by the digest and the
backend compatibility version.

## Increment Rules

### Patch Version

Increment `PATCH` when the package release changes but the circuit, CRS, and verification semantics remain valid.

Patch-only changes include:

- CLI bug fixes.
- Download, cache, Google Drive selection, or install orchestration fixes.
- Documentation changes.
- Error message changes.
- Packaging or release tooling changes.
- Backend runtime fixes that do not change proof inputs, constraints, subcircuit output, metadata semantics required by
  verification, the proving key, or the verification key.

Patch-only changes must not require a new MPC setup or a new CRS upload. The release keeps the same
`tokamakZkEvm.compatibleBackendVersion`.

### Minor Version

Increment `MINOR` when the backend proving setup compatibility class changes.

Minor changes include:

- Any change to Circom templates or rendered subcircuit contents.
- Any change to public signals, public input ordering, private input interpretation, witness generation semantics, or
  proof verification semantics.
- Any change that modifies the R1CS, proving key, verification key, or trusted setup output.
- Any change in setup tooling, compiler behavior, or dependency behavior that can produce different CRS artifacts for
  the same logical package.
- Any change to CRS provenance or build metadata semantics required by proof generation or verification.

A minor change requires:

- A package version bump to the new `MAJOR.MINOR.0` line.
- An update to `packages/cli/package.json tokamakZkEvm.compatibleBackendVersion`.
- A new dusk-backed MPC setup.
- A new public CRS archive named with the new `MAJOR.MINOR`.

### Major Version

Increment `MAJOR` when the proof system, backend package interface, security model, or operational compatibility changes
in a way that cannot be represented as a minor proving setup update.

Major changes include:

- Incompatible proof protocol changes.
- Incompatible CLI or backend runtime contract changes.
- Protocol migrations that require coordinated application or infrastructure handling.
- Security model changes that invalidate existing operational assumptions.

A major release requires an explicit migration plan before publishing artifacts.

## Build Metadata

Every release backend binary that embeds or consumes the subcircuit library must emit build metadata next to the built
binary. The metadata must include:

```json
{
  "packageName": "prove",
  "packageVersion": "MAJOR.MINOR.PATCH",
  "compatibleBackendVersion": "MAJOR.MINOR",
  "dependencies": {
    "subcircuitLibrary": {
      "packageName": "@tokamak-zk-evm/subcircuit-library",
      "buildVersion": "MAJOR.MINOR.PATCH",
      "declaredRange": "latest",
      "runtimeMode": "bundled",
      "sourceDigest": "..."
    }
  }
}
```

For `mpc-setup`, local setup builds use the local qap-compiler output and record the local subcircuit package version and
source digest. Non-`mpc-setup` backend packages continue to resolve the published npm `@tokamak-zk-evm/subcircuit-library`
package for release builds.

Metadata validation must fail when:

- `compatibleBackendVersion` is missing.
- `compatibleBackendVersion` is not strict `MAJOR.MINOR`.
- `compatibleBackendVersion` does not equal the CLI manifest compatibility version.
- `packageVersion` is not strict `MAJOR.MINOR.PATCH`.
- `packageVersion` does not normalize to the same `MAJOR.MINOR`.
- `dependencies.subcircuitLibrary.sourceDigest` is missing.

## CLI Install Compatibility Checks

`tokamak-cli --install` uses the installed CLI package's `tokamakZkEvm.compatibleBackendVersion` to select the public CRS.

The install flow must:

1. Read `packages/cli/package.json` from the installed package.
2. Validate that `tokamakZkEvm.compatibleBackendVersion` is canonical `MAJOR.MINOR`.
3. Validate that the CLI package version normalizes to the same `MAJOR.MINOR`.
4. Select only Google Drive CRS archive names matching `tokamak-backend-crs-vMAJOR.MINOR-YYYYMMDDTHHMMSSZ.zip`.
5. Download the latest matching archive by timestamp.
6. Validate `crs_provenance.json backend_version`.
7. Validate CRS artifact hashes from `crs_provenance.json`.
8. Validate `build-metadata-mpc-setup.json compatibleBackendVersion`.
9. Validate `build-metadata-mpc-setup.json packageVersion` after normalizing to `MAJOR.MINOR`.
10. Validate that each built backend binary metadata file reports the same compatible backend version.
11. Validate that each built backend binary metadata file reports a package version whose `MAJOR.MINOR` matches the CRS.
12. Validate that each built backend binary metadata file has the same subcircuit source digest as the CRS metadata.

The Google Drive file name and file ID are not trusted by themselves. Selection is complete only after the downloaded
archive's embedded provenance, metadata, and hashes pass validation.

## Publish CI Checks

The publish workflow must check the latest public CRS archive for the current CLI compatibility version before publishing
the CLI package.

The CRS check must:

- Read `packages/cli/package.json tokamakZkEvm.compatibleBackendVersion`.
- Ensure the value is canonical `MAJOR.MINOR`.
- Ensure the value equals the CLI package `MAJOR.MINOR`.
- Ensure the value equals the backend workspace package `MAJOR.MINOR`.
- Search Google Drive only for `tokamak-backend-crs-vMAJOR.MINOR-YYYYMMDDTHHMMSSZ.zip`.
- Select the latest matching archive by timestamp.
- Download that single selected archive.
- Validate `crs_provenance.json backend_version`.
- Validate `build-metadata-mpc-setup.json compatibleBackendVersion`.
- Validate `build-metadata-mpc-setup.json packageVersion` after normalizing to `MAJOR.MINOR`.
- Validate `build-metadata-mpc-setup.json dependencies.subcircuitLibrary.sourceDigest`.
- Validate CRS artifact hashes against provenance.

The check must not download every candidate archive in the Drive folder. It must first narrow candidates by strict file
name and then download only the latest matching archive.

## Operational Playbooks

### Patch-Only Release

Use this flow when the subcircuit source digest and CRS remain valid:

1. Bump all synchronized package versions by `PATCH`.
2. Keep `packages/cli/package.json tokamakZkEvm.compatibleBackendVersion` unchanged.
3. Do not run a new dusk-backed MPC setup.
4. Do not upload a new CRS archive.
5. Publish npm packages.
6. Confirm install CI validates the existing CRS `MAJOR.MINOR` against the new package `MAJOR.MINOR.PATCH`.

### Minor Release

Use this flow when CRS compatibility changes:

1. Bump all synchronized package versions to the new `MAJOR.MINOR.0` line.
2. Update `packages/cli/package.json tokamakZkEvm.compatibleBackendVersion` to the new `MAJOR.MINOR`.
3. Run dusk-backed MPC setup.
4. Confirm `crs_provenance.json backend_version` is the new `MAJOR.MINOR`.
5. Confirm `build-metadata-mpc-setup.json compatibleBackendVersion` is the new `MAJOR.MINOR`.
6. Upload a CRS archive named `tokamak-backend-crs-vMAJOR.MINOR-YYYYMMDDTHHMMSSZ.zip`.
7. Publish npm packages only after the public CRS is available and CI can validate it.

### Major Release

Use this flow when compatibility changes are larger than a minor setup update:

1. Write a migration plan before publishing artifacts.
2. Bump all synchronized package versions to the new `MAJOR.0.0` line.
3. Update `packages/cli/package.json tokamakZkEvm.compatibleBackendVersion` to the new `MAJOR.0`.
4. Generate and upload new CRS artifacts.
5. Publish packages only after install and post-publish compatibility checks pass.

## Invalid States

The following states are invalid:

- `packages/cli/package.json tokamakZkEvm.compatibleBackendVersion` is missing.
- The CLI compatibility version includes a patch component.
- The CLI compatibility version differs from the CLI package `MAJOR.MINOR`.
- The backend workspace package `MAJOR.MINOR` differs from the CLI compatibility version.
- A new CRS archive name includes a patch component.
- `crs_provenance.json backend_version` includes a patch component.
- CLI install accepts or silently falls back to a CRS archive whose compatibility version does not match the installed
  CLI package compatibility version.
- Backend build metadata lacks `compatibleBackendVersion`.
- Backend and CRS metadata report different subcircuit source digests.
