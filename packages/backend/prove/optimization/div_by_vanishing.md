# div_by_vanishing Mathematical Specification (Rigorous, TeX)

This document gives a **dimension-explicit** mathematical specification of `DensePolynomialExt::div_by_vanishing` and the optimized variant `div_by_vanishing_opt`. The implementation sources are `libs/src/bivariate_polynomial/mod.rs` and its helpers (`to_rou_evals/from_rou_evals`, `_slice_coeffs_into_blocks`, `mul_monomial`, `resize`).

**1. Base Spaces and Dimensions**

- Let $\mathbb{F}$ be a finite field.
- For integers $m,n \ge 1$, define
  $$\mathbb{F}_{m,n}[X,Y] = \left\{\sum_{i=0}^{m-1}\sum_{j=0}^{n-1} a_{i,j} X^i Y^j \;\middle|\; a_{i,j}\in\mathbb{F}\right\}.$$
  This is the bivariate polynomial space with $\deg_X < m$ and $\deg_Y < n$.
- The coefficient matrix space is
  $$\mathbb{F}^{m\times n} = \{A=[a_{i,j}]\mid a_{i,j}\in\mathbb{F}\}.$$
- The canonical identification is
  $$\Phi: \mathbb{F}_{m,n}[X,Y] \longleftrightarrow \mathbb{F}^{m\times n}, \quad P(X,Y)=\sum a_{i,j}X^iY^j \leftrightarrow A=[a_{i,j}].$$

**2. Inputs (common to both methods)**

- After `optimize_size()`, define
  $$x = x_{\text{size}} = 2^{k_x}, \quad y = y_{\text{size}} = 2^{k_y}.$$
- The input polynomial is
  $$P(X,Y) \in \mathbb{F}_{x,y}[X,Y].$$
- The denominator degrees are
  $$c = \texttt{denom\_x\_degree}, \quad d = \texttt{denom\_y\_degree},$$
  each a power of two.
- Define
  $$m = x/c, \quad n = y/d$$
  (integer division assumed by the code).

**3. Target Identity (common output definition)**

- Vanishing polynomials:
  $$T_X(X) = X^c - 1, \quad T_Y(Y) = Y^d - 1.$$
- The outputs are reconstructed as
  $$Q_X(X,Y) \in \mathbb{F}_{m c,\, n d}[X,Y], \quad Q_Y(X,Y) \in \mathbb{F}_{c,\, n d}[X,Y],$$
  and satisfy
  $$P(X,Y) = Q_X(X,Y)\,T_X(X) + Q_Y(X,Y)\,T_Y(Y).$$

**4. 2D NTT (rou) and Coset Evaluation (common)**

- For size $s$, let $\omega_s$ be a primitive $s$-th root of unity and
  $$H_s = \{\omega_s^0, \omega_s^1, \ldots, \omega_s^{s-1}\}.$$
- For cosets $\alpha,\beta \in \mathbb{F}^*$, the evaluation grid is
  $$\alpha H_x \times \beta H_y.$$
- For $A=[a_{i,j}]\in\mathbb{F}^{x\times y}$, the 2D NTT evaluation is
  $$\widetilde{A}_{u,v} = \sum_{i=0}^{x-1}\sum_{j=0}^{y-1} a_{i,j} (\alpha\omega_x^{u})^i (\beta\omega_y^{v})^j.$$
- `to_rou_evals` computes this evaluation; `from_rou_evals` applies the inverse transform to recover coefficients.

---

## A. Baseline: `div_by_vanishing`

This section specifies the **existing** method in `div_by_vanishing`.

### A.1 X-block split and accumulation

- Decompose $P(X,Y) \in \mathbb{F}_{x,y}[X,Y]$ into $m$ X-blocks:
  $$P(X,Y) = \sum_{b=0}^{m-1} X^{b c} P^{(b)}(X,Y), \quad P^{(b)}(X,Y) \in \mathbb{F}_{c,\, y}[X,Y].$$
- Accumulate
  $$A'(X,Y) = \sum_{b=0}^{m-1} P^{(b)}(X,Y) \in \mathbb{F}_{c,\, y}[X,Y].$$

### A.2 Compute $Q_Y$ (Y-division)

- Fix a Y-coset $\xi$ and evaluate on $H_c \times (\xi H_y)$:
  $$\widetilde{A}_{i,j} = A'(\omega_c^i, \xi\omega_{y}^j), \quad \widetilde{A}\in\mathbb{F}^{c\times y}.$$
- Denominator evaluations (full 2D array, constant along X):
  $$D_Y(i,j) = T_Y(\xi\omega_{y}^j) = \xi^d \omega_{n}^j - 1.$$
- Pointwise division:
  $$\widetilde{Q}_Y(i,j) = \widetilde{A}_{i,j} / D_Y(i,j).$$
- Inverse NTT:
  $$Q_Y(X,Y) = \texttt{from\_rou\_evals}(\widetilde{Q}_Y;\; c, y, \text{coset}_y=\xi) \in \mathbb{F}_{c,\, y}[X,Y].$$

### A.3 Compute $Q_X$ (X-division)

- First
  $$R(X,Y) = Q_Y(X,Y)\,(Y^d - 1) = Q_Y(X,Y)Y^d - Q_Y(X,Y).$$
- Then
  $$B(X,Y) = P(X,Y) - R(X,Y).$$
- The implementation `resize`s $B$ into $\mathbb{F}_{x,y}[X,Y]$, truncating or zero-padding higher terms if needed.
- Fix an X-coset $\zeta$ and evaluate on $(\zeta H_x) \times H_y$:
  $$\widetilde{B}_{i,j} = B(\zeta\omega_{x}^i, \omega_{y}^j), \quad \widetilde{B}\in\mathbb{F}^{x\times y}.$$
- Denominator evaluations (full 2D array, constant along Y):
  $$D_X(i,j) = T_X(\zeta\omega_{x}^i) = \zeta^c \omega_m^i - 1.$$
- Pointwise division:
  $$\widetilde{Q}_X(i,j) = \widetilde{B}_{i,j} / D_X(i,j).$$
- Inverse NTT:
  $$Q_X(X,Y) = \texttt{from\_rou\_evals}(\widetilde{Q}_X;\; x, y, \text{coset}_x=\zeta) \in \mathbb{F}_{x,\, y}[X,Y].$$

### A.4 Denominator inverse construction (baseline)

- The baseline builds **full 2D arrays** of denominator evaluations and inverts them elementwise:
  - $D_Y \in \mathbb{F}^{c\times y}$ with each row identical.
  - $D_X \in \mathbb{F}^{x\times y}$ with each column identical.
- Complexity/overhead: $\Theta(xy)$ field ops to build the arrays, and $\Theta(xy)$ to invert.

---

## B. Optimized: `div_by_vanishing_opt`

This section specifies the **optimized** method. The algebraic identity and NTT domains are **identical** to the baseline; only **how the denominators are constructed** differs.

### B.1 Same steps as baseline for $A'$, $Q_Y$, $B$, and $Q_X$

All steps in Sections A.1–A.3 apply unchanged. The only difference is how the denominator inverses are computed and materialized for pointwise multiplication.

### B.2 Axis-only denominator inverses + tiling

Define the **axis-only** values:

- Y-division axis values (length $n$):
  $$d_Y[j] = \xi^d \omega_n^j - 1, \quad j=0,\ldots,n-1.$$
- X-division axis values (length $m$):
  $$d_X[i] = \zeta^c \omega_m^i - 1, \quad i=0,\ldots,m-1.$$

Compute their inverses:

- $$d_Y^{-1}[j] = (\xi^d \omega_n^j - 1)^{-1}.$$
- $$d_X^{-1}[i] = (\zeta^c \omega_m^i - 1)^{-1}.$$

Then **tile** these inverses across the 2D evaluation grids:

- For Y-division (size $c\times y$):
  $$D_Y^{-1}(i,j) = d_Y^{-1}[j \bmod n].$$
- For X-division (size $x\times y$):
  $$D_X^{-1}(i,j) = d_X^{-1}[i \bmod m].$$

The pointwise divisions are performed by multiplying $\widetilde{A}$ and $\widetilde{B}$ by these tiled inverse arrays, yielding the same $\widetilde{Q}_Y$ and $\widetilde{Q}_X$ as the baseline.

### B.3 Denominator inverse construction (optimized)

- The optimized variant computes only $n$ or $m$ base values and **broadcasts** them across the 2D grid.
- Construction cost drops to $\Theta(m+n)$ for base inverses plus $\Theta(xy)$ for tiling (memory write only), avoiding the extra $\Theta(xy)$ field multiplications used to form full evaluation arrays in the baseline.

---

## C. Summary of Differences

- **Mathematical identity:** identical for both methods; they compute the same $Q_X,Q_Y$ satisfying
  $$P = Q_X (X^c-1) + Q_Y (Y^d-1).$$
- **NTT domains:** identical; both evaluate on $H_c \times (\xi H_y)$ for Y-division and $(\zeta H_x) \times H_y$ for X-division.
- **Denominator construction:**
  - Baseline builds full 2D denominator evaluations and inverts elementwise.
  - Optimized computes **axis-only** denominators ($m$ or $n$ values), inverts them, and tiles across the grid.
- **Computational implication:**
  - Baseline: $\Theta(xy)$ field ops to build denominator arrays + $\Theta(xy)$ inversions.
  - Optimized: $\Theta(m+n)$ inversions plus $\Theta(xy)$ tiling (memory copy), reducing arithmetic cost and improving speed.
- **Correctness:** unchanged, assuming the same cosets $\xi,\zeta$ and domain sizes.

---

**Assumptions and Correctness Scope**

- $c, d$ are powers of two with $c \le x$, $d \le y$.
- $\deg_X P \ge c$, $\deg_Y P \ge d$ (the code panics otherwise).
- For **no truncation** in `resize`, assume
  - $\deg_X Q_X \le (m-1)c - 1$.
  - $\deg_Y Q_Y \le (n-1)d - 1$.
  - Then $\deg_X(Q_X T_X) < x$ and $\deg_Y(Q_Y T_Y) < y$, so no high-degree truncation occurs.
- If these bounds are violated, the implementation may truncate higher terms; the identity is then only guaranteed **in the coefficient space after resizing**.

**Validation**

- `libs/src/tests.rs::test_div_by_vanishing_basic` checks the baseline.
- `libs/src/tests.rs::test_div_by_vanishing_opt_basic` checks the optimized variant.
