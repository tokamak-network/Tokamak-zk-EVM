# Native circuit preprocessing

This reference is for backend developers preparing circuit-specific inputs for
the current univariate verifier. Preprocessing admits the circuit; it does not
verify an individual proof. The online verifier is implemented separately under
`../verify`.

## Inputs and output

The command reads the selected library's setup and public-wire metadata,
`selector.json`, `permutation.json`, `instance.json`, and a CRS directory
containing `preprocess_keys.rkyv` and `crs_provenance.json`. It does not load
`tau_sequence.rkyv`, `prover_keys.rkyv` or `verifier_keys.rkyv`, internal R1CS
matrices, or placement witnesses.

The output is `univariate_verifier_preprocess.bin`, defined by the
[common artifact contract](../../common/contracts/univariate-artifact-contract.json):

| Element | Calculation | Bytes |
| --- | --- | ---: |
| `S_C` | Commitment to the admitted interface-permutation polynomial | 96 |
| `C_fix` | Fixed-public values times their unscaled public queries | 96 |
| `E_kappa` | Commitment to `tau^h Z_u(tau)` in G2 | 192 |

Coordinates use canonical little-endian affine bytes, not Montgomery limbs.
The payload totals 384 bytes. There is no JSON output or old-format reader.
The CRS role file and this three-element output are different artifacts.

The selector's inactive slots select the library's reserved empty ID `t-1`
when constructing `Z_v`. The implementation computes `Z_u=(X^(s*t)-1)/Z_v`
and checks the division remainder. The G2 bases already include `tau^h`.
Omitted permutation entries remain identity. Public-buffer public wires use
the fixed `placement index == subcircuit ID` specialization; this assumption
does not apply to intermediate or private wires. Fixed-public query order is
the mapped global public-wire order after `l_free`; padding contributes zero.

## Hardware and library selection

Run from `packages/backend`. With a prepared local library, synthesizer output
and current CRS, the native CPU path is:

```sh
cargo build --locked --release -p preprocess
target/release/preprocess \
  --subcircuit-library ../frontend/qap-compiler/subcircuits/library \
  --keys /path/to/crs \
  --synthesizer-stat /path/to/synthesizer-output \
  --output /path/to/preprocess-output
```

CPU is the default and uses arkworks field, polynomial, G1 and G2 operations.
It does not initialize ICICLE. The executable still needs its linked ICICLE
shared libraries on the loader path. Host parallelism uses Rayon's normal
host-adaptive worker pool. Add `--device cuda` to request ICICLE CUDA arithmetic;
an unavailable CUDA backend is an error, not a CPU retry. ICICLE operations
own their parallelism and are not wrapped in outer Rayon work.

Input origin is independent of hardware and release optimization. The default
build uses local QAP output. Production builds select the existing
`--no-default-features --features production-npm-subcircuit-library` configuration
and use the embedded npm snapshot without a local library argument.

Normal execution validates the common provenance format, protocol identifier,
backend compatibility class, and selected library package name and origin.
Production builds also compare the recorded source digest with their embedded
digest, allowing CRS reuse across patch versions when the source is unchanged.
Local-QAP development builds require an exact library package version instead.
Normal execution does not impose `releaseEligible` or hash all CRS/library payloads.
It checks the consumed key shapes and canonical coordinate bytes, selector,
permutation and public layout. These checks are not a cryptographic ceremony
verification or proof that two local directories have identical contents.
The development-only `development-crs-bypass` feature enables the explicit
`--allow-unverified-crs` option; structural admission remains active.

## Validation status

Release tests compare all three output elements with independent scalar/group
equations and compare exact arkworks/ICICLE bytes. Selection tests include
full, partial and empty placements. ICICLE arithmetic parity was exercised on
its local CPU backend, not on CUDA hardware. The local CUDA-unavailable error
path was exercised separately. Actual CUDA execution and current-protocol
verifier E2E have not been verified here.

The [current-protocol report](../../docs/optimization/current-univariate-crs.md#native-preprocess-initial-release-baseline)
records the real local-QAP execution and timing evidence.
