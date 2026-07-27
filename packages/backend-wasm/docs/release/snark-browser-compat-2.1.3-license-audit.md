# Snark-browser-compat 2.1.3 License Audit

Audience: maintainers preparing the `@tokamak-zk-evm/snark-browser-compat` npm release.

Audit date: 2026-07-27

## Publication candidate

| Property | Value |
| --- | --- |
| Package | `@tokamak-zk-evm/snark-browser-compat@2.1.3` |
| Package license | `MIT OR Apache-2.0` |
| Tarball | `tokamak-zk-evm-snark-browser-compat-2.1.3.tgz` |
| Compressed size | 860,993 bytes |
| Unpacked size | 10,345,290 bytes |
| Entry count | 396 |
| SHA-1 reported by npm | `61ca3625004dc28ff6cd37d3102e8691728fe659` |
| SHA-256 | `8e500360bd67b12040b7498b7b0652d96391b04d366f257e55b3620224743ec4` |
| npm integrity | `sha512-vH7YyocvUpLazFXRUE0vS8R9i8V82hRikrVCnu2+30sSfRgsoAG7ucUpRP26D6Sw4I49gj4UuHmc7WGxYdpvsA==` |

The candidate was built and packed on Apple Silicon with Rust 1.95.0,
`wasm-bindgen-cli` 0.2.126, Node.js 26.0.0, npm 11.12.1, Vite 8.1.5,
Playwright 1.61.1, and the package lockfile in this repository.

## Package boundary

The tarball contains package-authored JavaScript, declarations, source maps,
binary format specifications, generated Tokamak setup data, the generated
verifier CRS, the converter Worker, the RKYV decoder WASM, application-facing
documentation, and source-only browser examples. It excludes tests, fixtures,
benchmarks, diagnostics, scripts, tools, `docs`, `tmp`, and `node_modules`.

The converter Worker retains a bare `ffjavascript` import. Its build metadata
and packed output contain no bundled `ffjavascript`, `wasmbuilder`, or
`wasmcurves` source. A packed-package Vite production build and Chromium
execution passed with those packages resolved as consumer dependencies.

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

- `npm run typecheck`
- `npm run typecheck:scripts`
- `npm run converter:browser:check`
- `npm run docs:publication:check`
- exact tarball metadata inspection
- packed-file exclusion check
- packed package-license and dependency metadata check
- converter Worker external-import inspection

No unresolved missing-license or redistribution-notice issue was identified in
the audited package boundary. This is an engineering release audit, not legal
advice; distributors remain responsible for the obligations of their complete
application distribution.

## Primary references

- [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html.en)
- [Apache License 2.0 and GPL compatibility](https://www.apache.org/licenses/GPL-compatibility)
- [npm package license metadata](https://docs.npmjs.com/files/package.json/#license)
