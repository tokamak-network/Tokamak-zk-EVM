# div_by_vanishing Mathematical Specification (Rigorous, TeX)

This document gives a **dimension-explicit** mathematical specification of `DensePolynomialExt::div_by_vanishing`. The implementation source is `libs/src/bivariate_polynomial/mod.rs` (functions `div_by_vanishing`, `to_rou_evals/from_rou_evals`, `_slice_coeffs_into_blocks`, `mul_monomial`, `resize`).

**1. Base Spaces and Dimensions**

- Let $\mathbb{F}$ be a finite field.
- For integers $m,n \ge 1$, define
  $$\mathbb{F}_{m,n}[X,Y] = \left\{\sum_{i=0}^{m-1}\sum_{j=0}^{n-1} a_{i,j} X^i Y^j \;\middle|\; a_{i,j}\in\mathbb{F}\right\}.$$
  This is the bivariate polynomial space with $\deg_X < m$ and $\deg_Y < n$.
- The coefficient matrix space is
  $$\mathbb{F}^{m\times n} = \{A=[a_{i,j}]\mid a_{i,j}\in\mathbb{F}\}.$$
- The canonical identification is
  $$\Phi: \mathbb{F}_{m,n}[X,Y] \longleftrightarrow \mathbb{F}^{m\times n}, \quad P(X,Y)=\sum a_{i,j}X^iY^j \leftrightarrow A=[a_{i,j}].$$

**2. Inputs**

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

**3. Target Identity (Outputs)**

- Vanishing polynomials:
  $$T_X(X) = X^c - 1, \quad T_Y(Y) = Y^d - 1.$$
- The outputs are reconstructed as
  $$Q_X(X,Y) \in \mathbb{F}_{m c,\, n d}[X,Y], \quad Q_Y(X,Y) \in \mathbb{F}_{c,\, n d}[X,Y],$$
  and satisfy
  $$P(X,Y) = Q_X(X,Y)\,T_X(X) + Q_Y(X,Y)\,T_Y(Y).$$

**4. 2D NTT (rou) and Coset Evaluation**

- For size $s$, let $\omega_s$ be a primitive $s$-th root of unity and
  $$H_s = \{\omega_s^0, \omega_s^1, \ldots, \omega_s^{s-1}\}.$$
- For cosets $\alpha,\beta \in \mathbb{F}^*$, the evaluation grid is
  $$\alpha H_x \times \beta H_y.$$
- For $A=[a_{i,j}]\in\mathbb{F}^{x\times y}$, the 2D NTT evaluation is
  $$\widetilde{A}_{u,v} = \sum_{i=0}^{x-1}\sum_{j=0}^{y-1} a_{i,j} (\alpha\omega_x^{u})^i (\beta\omega_y^{v})^j.$$
- `to_rou_evals` computes this evaluation; `from_rou_evals` applies the inverse transform to recover coefficients.

**5. Algorithm Steps with Dimensions**

**5.1 X-block split and accumulation**

- Decompose $P(X,Y) \in \mathbb{F}_{x,y}[X,Y]$ into $m$ X-blocks:
  $$P(X,Y) = \sum_{b=0}^{m-1} X^{b c} P^{(b)}(X,Y)$$
  where
  $$P^{(b)}(X,Y) \in \mathbb{F}_{c,\, y}[X,Y].$$
- Accumulate
  $$A'(X,Y) = \sum_{b=0}^{m-1} P^{(b)}(X,Y) \in \mathbb{F}_{c,\, y}[X,Y].$$

**5.2 Compute $Q_Y$ (divide by Y-vanishing)**

- Fix a Y-coset $\xi$. Evaluate on $H_c \times (\xi H_y)$:
  $$\widetilde{A}_{i,j} = A'(\omega_c^i, \xi\omega_{y}^j), \quad \widetilde{A}\in\mathbb{F}^{c\times y}.$$
- Denominator evaluations:
  $$T_Y(\xi\omega_{y}^j) = (\xi\omega_{y}^j)^d - 1 = \xi^d \omega_{n}^j - 1.$$
- Pointwise division:
  $$\widetilde{Q}_Y(i,j) = \widetilde{A}_{i,j} / (\xi^d \omega_n^j - 1).$$
- Inverse NTT:
  $$Q_Y(X,Y) = \texttt{from\_rou\_evals}(\widetilde{Q}_Y;\; c, y, \text{coset}_y=\xi) \in \mathbb{F}_{c,\, y}[X,Y].$$

**5.3 Compute $Q_X$ (divide by X-vanishing)**

- First
  $$R(X,Y) = Q_Y(X,Y)\,(Y^d - 1) = Q_Y(X,Y)Y^d - Q_Y(X,Y).$$
- Then
  $$B(X,Y) = P(X,Y) - R(X,Y).$$
- The implementation `resize`s $B$ into $\mathbb{F}_{x,y}[X,Y]$, truncating or zero-padding higher terms if needed.
- Fix an X-coset $\zeta$ and evaluate on $(\zeta H_x) \times H_y$:
  $$\widetilde{B}_{i,j} = B(\zeta\omega_{x}^i, \omega_{y}^j), \quad \widetilde{B}\in\mathbb{F}^{x\times y}.$$
- Denominator evaluations:
  $$T_X(\zeta\omega_{x}^i) = (\zeta\omega_{x}^i)^c - 1 = \zeta^c \omega_m^i - 1.$$
- Pointwise division:
  $$\widetilde{Q}_X(i,j) = \widetilde{B}_{i,j} / (\zeta^c \omega_m^i - 1).$$
- Inverse NTT:
  $$Q_X(X,Y) = \texttt{from\_rou\_evals}(\widetilde{Q}_X;\; x, y, \text{coset}_x=\zeta) \in \mathbb{F}_{x,\, y}[X,Y].$$

**6. Denominator Inverse Cache (denom\_eval\_inv)**

Each cache entry stores $(\text{coset}, x_{\text{size}}, y_{\text{size}}, \text{evals})$.

- For the X-denominator $T_X$:
  $$\text{axis\_size}=x, \quad \text{base}=c, \quad \omega_m = \omega_{x/c}.$$
  $$\text{axis\_vals}[i] = \zeta^c \omega_m^i - 1,$$
  and these values are tiled along $y$ and inverted elementwise to form
  $$\text{evals} \in \mathbb{F}^{x\times y}.$$
- For the Y-denominator $T_Y$:
  $$\text{axis\_size}=y, \quad \text{base}=d, \quad \omega_n = \omega_{y/d}.$$
  $$\text{axis\_vals}[j] = \xi^d \omega_n^j - 1,$$
  and these values are tiled along $x$ and inverted elementwise to form
  $$\text{evals} \in \mathbb{F}^{c\times y}.$$

**7. Assumptions and Correctness Scope**

- $c, d$ are powers of two with $c \le x$, $d \le y$.
- $\deg_X P \ge c$, $\deg_Y P \ge d$ (the code panics otherwise).
- For **no truncation** in `resize`, assume
  - $\deg_X Q_X \le (m-1)c - 1$.
  - $\deg_Y Q_Y \le (n-1)d - 1$.
  - Then $\deg_X(Q_X T_X) < x$ and $\deg_Y(Q_Y T_Y) < y$, so no high-degree truncation occurs.
- If these bounds are violated, the implementation may truncate higher terms; the identity is then only guaranteed **in the coefficient space after resizing**.

**8. Validation**

- `libs/src/tests.rs::test_div_by_vanishing_basic` constructs
  $$P = Q_X T_X + Q_Y T_Y$$
  from random $Q_X,Q_Y$ and verifies that `div_by_vanishing` reconstructs polynomials matching evaluations and degrees.
