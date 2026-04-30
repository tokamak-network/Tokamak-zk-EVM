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

This section specifies the current **optimized** method. It uses the special binomial form of the vanishing polynomials directly in coefficient space. The algebraic identity is identical to the baseline, but the optimized method no longer evaluates on cosets or interpolates quotient evaluations for this division.

### B.1 X-block accumulation

Decompose $P$ into $m$ X-blocks as in Section A.1 and accumulate:

$$A'(X,Y) = \sum_{b=0}^{m-1} P^{(b)}(X,Y) \in \mathbb{F}_{c,y}[X,Y].$$

The $Q_X(X,Y)(X^c - 1)$ part cancels under this accumulation, so:

$$A'(X,Y) = Q_Y(X,Y)(Y^d - 1).$$

### B.2 Coefficient recurrence for $Q_Y$

For each fixed X coefficient row, write

$$A'(Y) = \sum_{j=0}^{y-1} a_j Y^j, \quad Q_Y(Y) = \sum_{j=0}^{y-d-1} q_j Y^j.$$

From $A'(Y)=Q_Y(Y)(Y^d-1)$, the coefficients satisfy:

$$a_j = q_{j-d} - q_j,$$

where $q_{j-d}=0$ for $j<d$. Therefore:

$$q_j = q_{j-d} - a_j, \quad 0 \le j < y-d.$$

The final $d$ coefficients of $A'$ are consistency terms and equal $q_{j-d}$ when the input is divisible as expected.

### B.3 Build $B$ and compute $Q_X$

After computing $Q_Y$, form:

$$B(X,Y) = P(X,Y) - Q_Y(X,Y)(Y^d - 1).$$

Then:

$$B(X,Y) = Q_X(X,Y)(X^c - 1).$$

For each fixed Y coefficient column, write

$$B(X) = \sum_{i=0}^{x-1} b_i X^i, \quad Q_X(X) = \sum_{i=0}^{x-c-1} r_i X^i.$$

From $B(X)=Q_X(X)(X^c-1)$:

$$b_i = r_{i-c} - r_i,$$

where $r_{i-c}=0$ for $i<c$. Therefore:

$$r_i = r_{i-c} - b_i, \quad 0 \le i < x-c.$$

The final $c$ coefficients of $B$ are consistency terms and equal $r_{i-c}$ when the input is divisible as expected.

---

## C. Summary of Differences

- **Mathematical identity:** identical for both methods; they compute the same $Q_X,Q_Y$ satisfying
  $$P = Q_X (X^c-1) + Q_Y (Y^d-1).$$
- **NTT domains:**
  - Baseline evaluates on $H_c \times (\xi H_y)$ for Y-division and $(\zeta H_x) \times H_y$ for X-division.
  - Optimized division does not use NTTs; it uses coefficient recurrences induced by $X^c - 1$ and $Y^d - 1$.
- **Denominator handling:**
  - Baseline builds denominator evaluations and performs pointwise division.
  - Optimized never materializes denominator evaluations or inverses.
- **Computational implication:**
  - Baseline: several 2D NTTs plus pointwise denominator multiplication.
  - Optimized: $\Theta(xy)$ coefficient additions/subtractions and copies.
- **Correctness:** unchanged for inputs satisfying the target identity.

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
