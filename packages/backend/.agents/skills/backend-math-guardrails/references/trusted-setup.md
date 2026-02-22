# Trusted Setup Guardrails

Applies to `setup/trusted-setup` and CRS generation logic in `libs`.

## TS-1: Setup shape constraints
- Definition:
  - `m_i = l_D - l`
  - `n`, `s_max`, `m_i` are powers of two.
- Code anchors:
  - `libs/src/utils/mod.rs` (`setup_shape`, `validate_setup_shape`)
- Guardrail:
  - Any change must preserve the same validity checks and domain assumptions.
- LaTeX slot:
```tex
% TS-1
% Fill equations here.
% \[
% \]
```

## TS-2: CRS basis definitions
- Definition:
  - `Sigma2 = ([alpha]_2, [alpha^2]_2, [alpha^3]_2, [alpha^4]_2, [gamma]_2, [delta]_2, [eta]_2, [x]_2, [y]_2)`
  - `G = [1]_1`, `H = [1]_2` on selected generators.
- Code anchors:
  - `libs/src/group_structures/mod.rs` (`Sigma2::gen`, `Sigma::gen`)
- Guardrail:
  - No permutation, omission, or semantic reassignment of `sigma_2` slots.
- LaTeX slot:
```tex
% TS-2
% Fill equations here.
% \[
% \]
```

## TS-3: Sigma1 element equations
- Definition (must stay algebraically identical):
  - `xy_powers = {[x^h y^i]_1}` over configured range.
  - `gamma_inv_o_inst[j] = [gamma^{-1} * (L_t(y)*o_j(x) + m_j(x))]_1` for fixed/public-free segment.
  - `eta_inv_li_o_inter_alpha4_kj = [eta^{-1} * L_i(y) * (o_{j+l}(x) + alpha^4 * K_j(x))]_1`.
  - `delta_inv_li_o_prv = [delta^{-1} * L_i(y) * o_j(x)]_1`.
  - Vanishing helpers:
    - `[delta^{-1} * alpha^k * x^h * (x^n - 1)]_1`
    - `[delta^{-1} * alpha^4 * x^j * (x^{m_i} - 1)]_1`
    - `[delta^{-1} * alpha^k * y^i * (y^{s_max} - 1)]_1`
- Code anchors:
  - `libs/src/group_structures/mod.rs` (`Sigma1::gen`)
- Guardrail:
  - Refactors are allowed, formula changes are blocked unless protocol change is approved.
- LaTeX slot:
```tex
% TS-3
% Fill equations here.
% \[
% \]
```

## TS-4: Encode-path consistency
- Definition:
  - `encode_poly` is MSM over polynomial coefficients and `xy_powers` in identical index order.
  - `encode_O_pub_fix`, `encode_O_pub_free`, `encode_O_mid_no_zk`, `encode_O_prv_no_zk` keep wire selection and indexing semantics.
- Code anchors:
  - `libs/src/group_structures/mod.rs`
  - `libs/src/iotools/mod.rs` (archived/rkyv mirrors)
- Guardrail:
  - Live and archived encoders must remain algebraically equivalent.
- LaTeX slot:
```tex
% TS-4
% Fill equations here.
% \[
% \]
```

## TS-5: Output split equivalence
- Definition:
  - `combined_sigma.rkyv`, `sigma_verify.rkyv`, `sigma_preprocess.rkyv` are consistent projections of the same CRS.
- Code anchors:
  - `setup/trusted-setup/src/main.rs`
  - `libs/src/iotools/mod.rs` (`SigmaRkyv`, `SigmaVerifyRkyv`, `SigmaPreprocessRkyv`)
- Guardrail:
  - Any format change must preserve exact group-element values and ordering.
- LaTeX slot:
```tex
% TS-5
% Fill equations here.
% \[
% \]
```
