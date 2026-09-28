# Native online verifier

This guide is for backend developers building a verifier for a selected circuit
library and trusted-setup output. Circuit admission belongs to `preprocess`.
Online verification takes only the admitted preprocess, proof and free public
inputs. It does not read or validate verifier keys, CRS provenance or circuit
library metadata at runtime.

## Build and run

First build the local QAP library and generate matching trusted-setup output.
From `packages/backend`, with the native dependency loader configured as in
the backend development environment:

```sh
TOKAMAK_VERIFIER_KEYS="$PWD/rust/setup/output/crs/verifier_keys.rkyv" \
  cargo build --locked --release -p verify

./target/release/verify \
  --preprocess rust/preprocess/output/univariate_verifier_preprocess.bin \
  --proof rust/prove/output/univariate_proof.bin \
  --instance ../frontend/synthesizer/outputs/instance.json \
  --timing
```

Set `TOKAMAK_VERIFIER_KEYS` for compilation, not execution. Missing keys, an
unsupported archive schema, noncanonical coordinates, off-curve points,
wrong-subgroup points or zero fixed bases fail the build. Cargo watches the
key path, resolved target, library parameters and domain contract. Changing
the selected library or keys requires rebuilding the executable. There is no
runtime `--verifier-keys` option or alternative key-source fallback.

The default build reads local QAP output. CLI production installation selects
`production-npm-subcircuit-library` and supplies the checked key downloaded
from Google Drive before compilation. See the [CLI installation guide](../../../cli/README.md)
for the version-folder and shared-tau layout and `--no-full-setup`.

## Computation boundary

The build generates typed constants for domain sizes, roots, interpolation
weights and inverses. It computes the four fixed G2 Miller-loop preparations
and three G1 fixed-base tables. Runtime constructors copy these prepared data
into arkworks' owned containers; they do not decode archives or recompute the
tables. Typed field literals are evaluated by the compiler.

`S_C`, `C_fix` and `E_kappa` belong to the dynamic preprocess. Their encoding
checks remain online. `E_kappa` preparation uses the same BLS12-381 formulas as
arkworks, with its fixed inverse of two supplied by the build. The transcript,
proof checks, public interpolation, challenge-dependent arithmetic and
five-term pairing remain online. Fixed-base scalar coefficients are combined
in the field before their G1 multiplications, preserving U35.

See [the fixed-input qualification record](../../docs/optimization/current-univariate-verifier.md)
for tests, measurements and rejected alternatives.

## Qualification

With `TOKAMAK_VERIFIER_KEYS` set to the matching trusted-setup output:

```sh
cargo test --locked --release -p verify
cargo test --locked --release -p verify --test fixed_arithmetic -- --ignored --nocapture
```

For the opt-in proof test, additionally set `VERIFY_TEST_PREPROCESS`,
`VERIFY_TEST_PROOF` and `VERIFY_TEST_INSTANCE` to matching files. The
`instance.json` directory must also contain the synthesizer-generated
`instance_description.json`, which identifies the single signed channel
transaction index in the public statement. Then run:

```sh
cargo test --locked --release -p verify --test local_fixture -- --ignored
```

The fixture test checks a real proof and rejects changes to all proof points,
all claimed evaluations, each preprocess operand and the signature-bound
channel transaction index in the free public inputs.
It does not generate a new ceremony or qualify unpublished production files.
