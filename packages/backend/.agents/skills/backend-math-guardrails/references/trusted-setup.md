# Trusted Setup Guardrails

Applies to `setup/trusted-setup` and CRS generation logic in `libs`.

## TS-1: Setup shape constraints
- Definition:
  - $m_I = l_D - l$
  - $n$, $s_{max}$, $m_I$ are powers of two.
- Code anchors:
  - `libs/src/utils/mod.rs` (`setup_shape`, `validate_setup_shape`)
- Guardrail:
  - Mathematical constraints below must be followed strictly with zero deviation.
  - Any change must preserve the same validity checks and domain assumptions.
- Mathematical constraints:
$$
m_I = l_D - l,\qquad
n=2^{\nu_n},\quad s_{\max}=2^{\nu_s},\quad m_I=2^{\nu_m}
$$
$$
l_{\mathrm{free}}=0\ \ \text{or}\ \ l_{\mathrm{free}}=2^{\nu_f}
$$

## TS-2: CRS basis definitions
- Definition:
  - `Sigma2 = ([alpha]_2, [alpha^2]_2, [alpha^3]_2, [alpha^4]_2, [gamma]_2, [delta]_2, [eta]_2, [x]_2, [y]_2)`
  - `G = [1]_1`, `H = [1]_2` on selected generators.
- Code anchors:
  - `libs/src/group_structures/mod.rs` (`Sigma2::gen`, `Sigma::gen`)
- Guardrail:
  - Mathematical constraints below must be followed strictly with zero deviation.
  - No permutation, omission, or semantic reassignment of `sigma_2` slots.
- Mathematical constraints:
$$
\tau=(\alpha,\gamma,\delta,\eta,x,y)\in(\mathbb{F}^{\times})^6
$$
$$
\sigma_2=
\big([\alpha]_2,[\alpha^2]_2,[\alpha^3]_2,[\alpha^4]_2,[\gamma]_2,[\delta]_2,[\eta]_2,[x]_2,[y]_2\big)
$$
$$
G=[1]_1,\qquad H=[1]_2,\qquad [\beta]_d:=g_d^{\beta}
$$

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
  - Mathematical constraints below must be followed strictly with zero deviation.
  - Refactors are allowed, formula changes are blocked unless protocol change is approved.
- Mathematical constraints:
$$
o_j(X):=\alpha u_j(X)+\alpha^2 v_j(X)+\alpha^3 w_j(X)
$$
$$
\{[x^h y^i]_1\}_{h=0,i=0}^{h_{\max}-1,\,2s_{\max}-1},
\qquad h_{\max}:=\max(2n,2m_i)\ \ \text{(code)}
$$
TODO(review): manuscript in `temp/setup.md` uses an upper bound like $\max(2n-2,3m_I-3)$, while current code uses $\max(2n,2m_i)$. intended canonical bound 확인 부탁.
$$
\left\{
\left[\gamma^{-1}\!\left(L_{t(j)}(y)\,o_j(x)+\mathbf 1_{j<l_{\mathrm{free}}}\,M_j(x)\right)\right]_1
\right\}_{j=0}^{l-1}
$$
$$
t(j)\in\{0,1,2,3\}\ \text{is selected by public-wire partition in setup params}
$$
TODO(review): paper notation은 일부 구간에서 $L_0/L_{-1}$를 쓰고, code는 4-way partition(`user_out`, `user_in`, `block_in`, `function`)을 사용합니다. 대응 정의 검토 부탁.
$$
\left\{
\left[\eta^{-1}L_i(y)\left(o_{j+l}(x)+\alpha^4K_j(x)\right)\right]_1
\right\}_{i=0,j=0}^{s_{\max}-1,\,m_i-1}
$$
$$
\left\{
\left[\delta^{-1}L_i(y)o_j(x)\right]_1
\right\}_{i=0,j=l+m_i}^{s_{\max}-1,\,m_D-1}
$$
$$
\left\{
\left[\delta^{-1}\alpha^k x^h(x^n-1)\right]_1
\right\}_{k=1,h=0}^{3,2}
$$
$$
\left\{
\left[\delta^{-1}\alpha^4 x^j(x^{m_i}-1)\right]_1
\right\}_{j=0}^{1}
$$
TODO(review): `temp/setup.md`에는 $j=0\ldots l-1$로 읽히는 구간이 있는데, code는 $j\in\{0,1\}$만 사용합니다. intended range 확인 부탁.
$$
\left\{
\left[\delta^{-1}\alpha^k y^i(y^{s_{\max}}-1)\right]_1
\right\}_{k=1,i=0}^{4,2}
$$

## TS-4: Encode-path consistency
- Definition:
  - `encode_poly` is MSM over polynomial coefficients and `xy_powers` in identical index order.
  - `encode_O_pub_fix`, `encode_O_pub_free`, `encode_O_mid_no_zk`, `encode_O_prv_no_zk` keep wire selection and indexing semantics.
- Code anchors:
  - `libs/src/group_structures/mod.rs`
  - `libs/src/iotools/mod.rs` (archived/rkyv mirrors)
- Guardrail:
  - Mathematical constraints below must be followed strictly with zero deviation.
  - Live and archived encoders must remain algebraically equivalent.
- Mathematical constraints:
$$
F(X,Y)=\sum_{a=0}^{d_x}\sum_{b=0}^{d_y} f_{a,b}X^aY^b
$$
$$
\mathrm{Enc}(F):=\sum_{a=0}^{d_x}\sum_{b=0}^{d_y} f_{a,b}[x^a y^b]_1
$$
$$
\mathrm{Enc}_{\text{live}}(F)=\mathrm{Enc}_{\text{archived}}(F)
$$
$$
\mathrm{EncO}_{\mathrm{pub\_fix}}(\mathbf a)=
\sum_{r=0}^{m_{\mathrm{function}}-1}
a_r\cdot
\big[\gamma^{-1}o_{\mathrm{inst},\,(\ell_\gamma-m_{\mathrm{function}}+r)}\big]_1
$$
$$
\mathrm{EncO}_{\mathrm{pub\_free}}
=
\sum_{(p,j)\in\mathcal I_{\mathrm{pub\_free}}}
w_{p,j}\cdot
\big[\gamma^{-1}o_{\mathrm{inst},\,\mathrm{flat}(p,j)}\big]_1
$$
$$
\mathrm{EncO}_{\mathrm{mid}}
=
\sum_{(p,j)\in\mathcal I_{\mathrm{mid}}}
w_{p,j}\cdot
\big[\eta^{-1}L_p(y)\,(o_{j+l}(x)+\alpha^4K_j(x))\big]_1
$$
$$
\mathrm{EncO}_{\mathrm{prv}}
=
\sum_{(p,j)\in\mathcal I_{\mathrm{prv}}}
w_{p,j}\cdot
\big[\delta^{-1}L_p(y)\,o_j(x)\big]_1
$$
TODO(review): $\mathcal I_{\mathrm{pub\_free}}, \mathcal I_{\mathrm{mid}}, \mathcal I_{\mathrm{prv}}$는 buffer filtering/flatten-map 구현 세부에 의존합니다. 이 추상화가 문서 목적에 충분한지 검토 부탁.

## TS-5: Output split equivalence
- Definition:
  - `combined_sigma.rkyv`, `sigma_verify.rkyv`, `sigma_preprocess.rkyv` are consistent projections of the same CRS.
- Code anchors:
  - `setup/trusted-setup/src/main.rs`
  - `libs/src/iotools/mod.rs` (`SigmaRkyv`, `SigmaVerifyRkyv`, `SigmaPreprocessRkyv`)
- Guardrail:
  - Mathematical constraints below must be followed strictly with zero deviation.
  - Any format change must preserve exact group-element values and ordering.
- Mathematical constraints:
$$
\Sigma_{\mathrm{combined}}
:=
(G,H,\sigma_1,\sigma_2,\mathrm{Lagrange}_{KL})
$$
$$
\Sigma_{\mathrm{verify}}
:=
\pi_{\mathrm{verify}}(\Sigma_{\mathrm{combined}})
=
\big(G,H,\sigma_1^{\mathrm{verify}},\sigma_2,\mathrm{Lagrange}_{KL}\big),
\quad
\sigma_1^{\mathrm{verify}}=(x,y)
$$
$$
\Sigma_{\mathrm{preprocess}}
:=
\pi_{\mathrm{preprocess}}(\Sigma_{\mathrm{combined}})
=
\big(\sigma_1^{\mathrm{preprocess}}\big),
\quad
\sigma_1^{\mathrm{preprocess}}=(xy\_powers,\gamma^{-1}o_{\mathrm{inst}})
$$
$$
\forall v\in\{\mathrm{verify},\mathrm{preprocess}\},\quad
\Sigma_v=\pi_v(\Sigma_{\mathrm{combined}})
\ \text{(field-wise equality, order preserved)}
$$
