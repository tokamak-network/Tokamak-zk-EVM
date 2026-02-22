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
  - Output must remain deterministic for same `(sigma_preprocess, permutation, instance, setupParams)`.
- LaTeX slot:
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
  - Do not bypass shape validation or domain initialization semantics.
- LaTeX slot:
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
  - Do not reorder fields without synchronized verifier/prover format migration.
- LaTeX slot:
```tex
% PP-3
% Fill equations here.
% \[
% \]
```
