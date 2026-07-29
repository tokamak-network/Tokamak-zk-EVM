# Snark-browser-compat 2.1.3 License Audit

Audience: maintainers preparing the `@tokamak-zk-evm/snark-browser-compat` npm release.

Audit date: 2026-07-29

## Publication candidate

| Property | Value |
| --- | --- |
| Package | `@tokamak-zk-evm/snark-browser-compat@2.1.3` |
| Package license | `MIT OR Apache-2.0` |
| Tarball | `tokamak-zk-evm-snark-browser-compat-2.1.3.tgz` |
| Compressed size | 883,771 bytes |
| Unpacked size | 10,273,491 bytes |
| Entry count | 433 |
| SHA-1 reported by npm | `db84a708cf6f350cf27091fb509e71bc115fd2df` |
| SHA-256 | `3f276ac6b9aaf7f4f5529f8de7581f61ee8152abb12737e6621db99928720c7e` |
| npm integrity | `sha512-ZlVzN77so041XqnPflVc5uAr7UvbGruOvdCrB3GFGbMggTDvAxhSctpCQ5DoY7MH/Hiihfq9TLYAF+vWzLP+rg==` |

The candidate was built and packed on Apple Silicon with Rust 1.95.0,
`wasm-bindgen-cli` 0.2.126, Node.js 26.0.0, npm 11.12.1, Vite 8.1.5,
Webpack 5.109.2, Playwright 1.61.1, and the package lockfile in this
repository.

## Package boundary

The tarball contains package-authored JavaScript, declarations, source maps,
binary format specifications, generated Tokamak setup data, the generated
verifier CRS, the converter Worker, the RKYV decoder WASM, application-facing
documentation, and source-only browser examples. It excludes tests, fixtures,
benchmarks, diagnostics, scripts, tools, `docs`, `tmp`, and `node_modules`.

The converter Worker retains a bare `ffjavascript` import. Its build metadata
and packed output contain no bundled `ffjavascript`, `wasmbuilder`, or
`wasmcurves` source. Packed-package Vite and Webpack production builds and
Chromium execution passed with those packages resolved as consumer
dependencies.

## Production dependency inventory

| Package | Resolved version | Declared license | Distribution boundary |
| --- | --- | --- | --- |
| `@noble/hashes` | 1.8.0 | MIT | External npm import |
| `@tokamak-zk-evm/subcircuit-library` | 2.1.3 | MIT OR Apache-2.0 | External dependency; selected data is generated into package output |
| `ffjavascript` | 0.3.1 | GPL-3.0 | External npm import |
| `wasmbuilder` | 0.0.16 | GPL-3.0 | External transitive dependency |
| `wasmcurves` | 0.2.2 | GPL-3.0 | External transitive dependency |
| `web-worker` | 1.2.0 | Apache-2.0 | External transitive dependency |

The exact Rust dependency inventory for the embedded decoder is recorded in
`THIRD_PARTY_NOTICES.md`. Exact upstream license files are distributed under
`third-party-licenses/rkyv-decoder-wasm`.

## Decisions and obligations

1. The package owner superseded the earlier package-local GPL decision.
   Snark-browser-compat now follows the repository's `MIT OR Apache-2.0` policy.
2. The tarball includes the complete repository `LICENSE-MIT` and
   `LICENSE-APACHE` texts.
3. The package license does not override dependency licenses. The README and
   third-party notice state that an application distribution combining
   backend-wasm with `ffjavascript` must comply with the applicable GPL
   obligations for the resulting combination.
4. Externalizing `ffjavascript` prevents duplicate code in the converter
   Worker but does not change the combined application's GPL obligations.
5. The generated Tokamak setup, R1CS, metadata, and verifier CRS follow the
   repository's `MIT OR Apache-2.0` policy.
6. The embedded Rust/WASM license and attribution material is included in the
   tarball. `seahash@4.1.0` declares MIT in its Cargo metadata but omits a
   standalone license file from its crate archive, so its author attribution
   and the MIT text are supplied explicitly.

## Verification

The following checks passed:

- generated subcircuit-library, verifier-CRS, and binary-format consistency
- `npm run typecheck`
- `npm run typecheck:scripts`
- `npm run binary:check`
- all preprocess Node, public-API, native-proof, and Chromium checks
- all prover primitive, Node proof, timing-table, and Chromium checks
- all verifier Node and Chromium checks
- `npm run rkyv:payload:check`
- `npm run converter:browser:check`
- `npm run converter:crs:browser:check`
- `npm run converter:webpack:check`
- `npm run docs:publication:check`
- exact tarball `npm pack --json` metadata and independent SHA-256 inspection
- all four packed public subpath imports through the Vite browser example
- packed Vite and Webpack production consumer execution
- required-file and prohibited-prefix inspection across all 433 packed entries
- packed package-license, export, dependency, and embedded-license inspection
- converter Worker external-import inspection

No unresolved missing-license or redistribution-notice issue was identified in
the audited package boundary. This is an engineering release audit, not legal
advice; distributors remain responsible for the obligations of their complete
application distribution.

## Primary references

- [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html.en)
- [Apache License 2.0 and GPL compatibility](https://www.apache.org/licenses/GPL-compatibility)
- [npm package license metadata](https://docs.npmjs.com/files/package.json/#license)
