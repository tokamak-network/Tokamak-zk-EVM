# Verify Rust Guardrails

Applies to `verify/verify-rust`.

## VR-1: Challenge derivation compatibility
- Definition:
  - Verifier challenge collection must match prover transcript logic for
    `thetas`, `kappa0`, `chi`, `zeta`, `kappa1`.
  - `kappa2` is verifier-side fresh randomness.
- Code anchors:
  - `verify/verify-rust/src/lib.rs` (`collect_challenges`)
  - `prove/src/lib.rs` (`Proof*::verify*_with_manager`, `TranscriptManager`)
- Guardrail:
  - Never change transcript feed order unless prover side is changed in lockstep.

## VR-2: Domain context equations
- Definition:
  - `m_i = l_D - l`
  - `t_n_eval = chi^n - 1`
  - `t_mi_eval = chi^{m_i} - 1`
  - `t_smax_eval = zeta^{s_max} - 1`
  - Roots of unity `omega_m_i`, `omega_s_max` must match domain sizes.
- Code anchors:
  - `verify/verify-rust/src/lib.rs` (`build_domain_context`)
- Guardrail:
  - Preserve these exact definitions and dimensions.

## VR-3: Arithmetic/copy/binding LHS decomposition
- Definition:
  - `lhs_arith`, `lhs_copy`, `lhs_binding` equations define verifier relation split.
  - Combined SNARK LHS:
    - `lhs = lhs_binding + (lhs_arith + lhs_copy) * kappa2`
- Code anchors:
  - `verify/verify-rust/src/lib.rs` (`lhs_arith`, `lhs_copy`, `lhs_binding`, `verify_snark`)
- Guardrail:
  - Refactoring into helpers is allowed; coefficients and terms are not.

## VR-4: Pairing equation structure
- Definition:
  - `verify_snark` equality is a fixed multi-pairing relation between:
    - Left: `(lhs + aux, B, U, V, W)` vs `(H, alpha4, alpha, alpha2, alpha3)`
    - Right: `(O_pub_fix + O_pub_free, O_mid, O_prv, aux_x, aux_y)` vs `(gamma, eta, delta, x, y)`
- Code anchors:
  - `verify/verify-rust/src/lib.rs` (`verify_snark`)
- Guardrail:
  - Pairing tuple order and term grouping must remain unchanged.

## VR-5: Sub-verifier consistency
- Definition:
  - `verify_arith`, `verify_copy`, `verify_binding` remain consistent with the same helper equations used by `verify_snark`.
- Code anchors:
  - `verify/verify-rust/src/lib.rs`
- Guardrail:
  - Any equation change in shared helpers must be reflected consistently across all verifier entry points.

