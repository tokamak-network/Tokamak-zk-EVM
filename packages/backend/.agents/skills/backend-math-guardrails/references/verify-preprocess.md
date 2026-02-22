# Verify Preprocess Guardrails

Applies to `verify/preprocess`.

## PP-1: Deterministic preprocess commitments
- Definition:
  - `s0 = Enc(s0(X,Y))` where `(s0,s1) = Permutation::to_poly(...)`
  - `s1 = Enc(s1(X,Y))`
  - `O_pub_fix = Enc_O_pub_fix(a_pub_function)`
- Code anchors:
  - `verify/preprocess/src/lib.rs` (`Preprocess::gen`)
- Guardrail:
  - Mathematical constraints below must be followed strictly with zero deviation.
  - Output must remain deterministic for same `(sigma_preprocess, permutation, instance, setupParams)`.
- Mathematical constraints:
```tex
% PP-1
% Fill equations here.
% \[
% \]
```

## PP-2: Shared setup-shape/domain assumptions
- Definition:
  - Same `setup_shape` and NTT-domain assumptions as prover/verifier.
- Code anchors:
  - `verify/preprocess/src/lib.rs`
  - `libs/src/utils/mod.rs`
- Guardrail:
  - Mathematical constraints below must be followed strictly with zero deviation.
  - Do not bypass shape validation or domain initialization semantics.
- Mathematical constraints:
```tex
% PP-2
% Fill equations here.
% \[
% \]
```

## PP-3: Output format bijection
- Definition:
  - `Preprocess <-> FormattedPreprocess` round-trip is bijective with fixed ordering:
    - `(s0, s1, O_pub_fix)`
  - `G1_CNT = 3`.
- Code anchors:
  - `verify/preprocess/src/lib.rs` (`convert_format_for_solidity_verifier`, `recover_proof_from_format`)
- Guardrail:
  - Mathematical constraints below must be followed strictly with zero deviation.
  - Do not reorder fields without synchronized verifier/prover format migration.
- Mathematical constraints:
```tex
% PP-3
% Fill equations here.
% \[
% \]
```
