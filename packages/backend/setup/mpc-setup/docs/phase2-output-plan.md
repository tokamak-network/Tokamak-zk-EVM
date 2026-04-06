# MPC Phase 2 Output Plan

## Objective

This document fixes the mathematical target of the final MPC phase-2 outputs.
It intentionally describes the outputs as formulas, not as code paths.
The purpose is to provide a stable reference before changing the phase-1 / phase-2 split.

## Notation

Let:

- $l$ be the number of public wires.
- $m_i$ be the number of intermediate wires.
- $m_{\mathrm{prv}} = m_D - (l + m_i)$ be the number of private wires.
- $s = s_{\max}$ be the maximum placement count.
- $n$ be the number of constraints per subcircuit.

Trapdoor symbols:

- $\alpha$
- $x$
- $y$
- $\gamma$
- $\delta$
- $\eta$

Polynomial symbols:

- $o_j(X)$ for the wire polynomial indexed by $j$
- $K_j(X)$ for the intermediate-wire helper polynomial
- $M_j(X)$ for the free-wire helper polynomial
- $L_i(Y)$ for the $i$-th Lagrange basis polynomial on the $Y$ domain
- $t_n(X) = X^n - 1$
- $t_{m_i}(X) = X^{m_i} - 1$
- $t_s(Y) = Y^s - 1$

Commitment notation:

- $[P(X, Y)]_1$ means the G1 commitment of polynomial $P(X, Y)$
- $[Q]_2$ means the G2 encoding of scalar $Q$

Public-wire segment selector:

- $t(j)$ selects the public segment used by public wire $j$

## Final Output Structure

The final output is a CRS object of the form:

- $\Sigma^{(2)} = (\gamma, \Sigma)$
- $\Sigma = (G, H, \Sigma_1, \Sigma_2, \mathrm{lagrange\_KL})$

The formulas below define the mathematical target of each final output field.

## Final G1 Outputs

### Base points

- $\gamma = [\gamma]_1$
- $G = [1]_1$
- $\Sigma_1.x = [x]_1$
- $\Sigma_1.y = [y]_1$
- $\Sigma_1.\delta = [\delta]_1$
- $\Sigma_1.\eta = [\eta]_1$

### Monomial basis table

`Sigma1.xy_powers` stores:

$$
\left\{ [x^a y^b]_1 \right\}_{0 \le a \le h_{\max},\ 0 \le b \le 2s-2}
$$

where:

$$
h_{\max} = \max(2n-2,\ 2m_i-2)
$$

### Public-wire block

For each public wire $j$:

$$
\mathrm{gamma\_inv\_o\_inst}[j]
=

\left[
\gamma^{-1}
\left(
L_{t(j)}(Y)\,o_j(X) + M_j(X)
\right)
\right]_1
$$

### Intermediate-wire block

For each intermediate wire $j = 0, \dots, m_i - 1$ and each placement $i = 0, \dots, s - 1$:

$$
\mathrm{eta\_inv\_li\_o\_inter\_alpha4\_kj}[j][i]
=
\left[
\eta^{-1}
L_i(Y)
\left(
o_{j+l}(X) + \alpha^4 K_j(X)
\right)
\right]_1
$$

### Private-wire block

For each private wire and each placement $i = 0, \dots, s - 1$:

$$
\mathrm{delta\_inv\_li\_o\_prv}[j][i]
=
\left[
\delta^{-1}
L_i(Y)\,o_j(X)
\right]_1
$$

### Vanishing-Polynomial Correction Terms in $X$

For $k = 1, 2, 3$ and $h = 0, 1, 2$:

$$
\mathrm{delta\_inv\_alphak\_xh\_tx}[k][h]
=
\left[
\delta^{-1}\alpha^k x^h t_n(X)
\right]_1
$$

For $j = 0, 1$:

$$
\mathrm{delta\_inv\_alpha4\_xj\_tx}[j]
=
\left[
\delta^{-1}\alpha^4 x^j t_{m_i}(X)
\right]_1
$$

### Vanishing-Polynomial Correction Terms in $Y$

For the required $(k, i)$ index pairs:

$$
\mathrm{delta\_inv\_alphak\_yi\_ty}[k][i]
=
\left[
\delta^{-1}\alpha^k y^i t_s(Y)
\right]_1
$$

### Lagrange boundary term

$$
\mathrm{lagrange\_KL}
=
\left[
K_{m_i-1}(X)\,L_{s-1}(Y)
\right]_1
$$

## Final G2 Outputs

`Sigma2` stores:

- $\Sigma_2.\alpha  = [\alpha]_2$
- $\Sigma_2.\alpha^2 = [\alpha^2]_2$
- $\Sigma_2.\alpha^3 = [\alpha^3]_2$
- $\Sigma_2.\alpha^4 = [\alpha^4]_2$
- $\Sigma_2.\gamma  = [\gamma]_2$
- $\Sigma_2.\delta  = [\delta]_2$
- $\Sigma_2.\eta    = [\eta]_2$
- $\Sigma_2.x       = [x]_2$
- $\Sigma_2.y       = [y]_2$

## Dependency View

This section groups the outputs by which trapdoor symbols they depend on.

### Outputs That Depend Only on $x$

- $\Sigma_1.x$
- parts of $\mathrm{delta\_inv\_alphak\_xh\_tx}$
- parts of $\mathrm{delta\_inv\_alpha4\_xj\_tx}$

### Outputs That Depend Only on $y$

- $\Sigma_1.y$
- parts of $\mathrm{delta\_inv\_alphak\_yi\_ty}$
- the $Y$-side of $\mathrm{lagrange\_KL}$

### Outputs That Depend on Both $x$ and $y$

- $\Sigma_1.\mathrm{xy\_powers}$
- $\mathrm{gamma\_inv\_o\_inst}$
- $\mathrm{eta\_inv\_li\_o\_inter\_alpha4\_kj}$
- $\mathrm{delta\_inv\_li\_o\_prv}$
- $\mathrm{lagrange\_KL}$

### Outputs That Depend on $\gamma$, $\delta$, or $\eta$

- $\gamma$
- $\Sigma_1.\delta$
- $\Sigma_1.\eta$
- $\Sigma_2.\gamma$
- $\Sigma_2.\delta$
- $\Sigma_2.\eta$
- $\mathrm{gamma\_inv\_o\_inst}$
- $\mathrm{eta\_inv\_li\_o\_inter\_alpha4\_kj}$
- $\mathrm{delta\_inv\_li\_o\_prv}$
- $\mathrm{delta\_inv\_alphak\_xh\_tx}$
- $\mathrm{delta\_inv\_alpha4\_xj\_tx}$
- $\mathrm{delta\_inv\_alphak\_yi\_ty}$

## Planning Implication For A Refactor

If $y$ is removed from phase 1 and moved into phase 2, then every output listed under "Outputs That Depend on Both $x$ and $y$" must still be expressible from the new phase-1 artifact contract.

That means a refactor must preserve the ability to construct:

$$
[x^a y^b]_1,\quad
[\alpha^k x^a y^b]_1,\quad
[y]_2
$$

or another mathematically equivalent representation.

The refactor is therefore feasible only if phase 2 gains enough structure to reconstruct all $Y$-dependent and $XY$-dependent commitments in the formulas above.

## Proposed Split

The target refactor keeps the final `SigmaV2` formulas unchanged, but changes where the trapdoor material is introduced.

### Current split

- Phase 1 contributors update $\alpha$, $x$, and $y$, and phase 1 emits:
  - $[\alpha^k]_1$, $[\alpha^k]_2$
  - $[x^a]_1$, $[x^a]_2$
  - $[y^b]_1$, $[y]_2$
  - $[\alpha^k x^a]_1$
  - $[\alpha^k y^b]_1$
  - $[x^a y^b]_1$
  - $[\alpha^k x^a y^b]_1$
- `phase2_prepare` consumes the full $XY$-expanded phase-1 artifact and directly materializes the final $Y$-expanded CRS blocks.
- `phase2_next_contributor` only updates $\gamma$, $\delta$, and $\eta$.

### Proposed split

- Phase 1 contributors update only $\alpha$ and $x$, and phase 1 emits:
  - $[\alpha^k]_1$, $[\alpha^k]_2$
  - $[x^a]_1$, $[x^a]_2$
  - $[\alpha^k x^a]_1$
- The first phase-2 step samples a single $y$ and constructs:
  - $[y]_1$, $[y]_2$
  - $[x^a y^b]_1 = y^b [x^a]_1$
  - $[\alpha^k y^b]_1 = y^b [\alpha^k]_1$
  - $[\alpha^k x^a y^b]_1 = y^b [\alpha^k x^a]_1$
- `phase2_prepare` computes $x$-only commitments first and expands them with the sampled $y$ only after the $x$-side MSM is complete.
- Later phase-2 contributors still update only $\gamma$, $\delta$, and $\eta$.

Under this split, the final CRS still targets the same formulas written above. The difference is only the ceremony state that is passed between phase 1 and phase 2.

## Algebraic Decomposition Used By The Refactor

The refactor relies on the fact that, once a concrete field element $y$ is chosen, every $L_i(Y)$ becomes the scalar $L_i(y)$.

For any wire polynomial

$$
o_j(X) = \sum_a c_{j,a} X^a,
$$

the $x$-only commitment is

$$
[o_j(X)]_1 = \sum_a c_{j,a} [X^a]_1.
$$

After the first phase-2 step chooses $y$, the private-wire block becomes

$$
\mathrm{delta\_inv\_li\_o\_prv}[j][i]
=
\left[
\delta^{-1} L_i(y) o_j(X)
\right]_1
=
\delta^{-1} L_i(y)\,[o_j(X)]_1.
$$

Likewise,

$$
\mathrm{eta\_inv\_li\_o\_inter\_alpha4\_kj}[j][i]
=
\eta^{-1} L_i(y)\,
\left(
[o_{j+l}(X)]_1 + [\alpha^4 K_j(X)]_1
\right),
$$

and

$$
\mathrm{gamma\_inv\_o\_inst}[j]
=
\gamma^{-1}
\left(
L_{t(j)}(y)\,[o_j(X)]_1 + [M_j(X)]_1
\right).
$$

The refactor therefore replaces a large number of $XY$-basis MSMs with:

1. a smaller set of $x$-only MSMs over $[\alpha^k x^a]_1$ and $[x^a]_1$, followed by
2. scalar multiplication by $L_i(y)$, $L_{t(j)}(y)$, $y^b$, or $y^i t_s(y)$.

## Expected Performance Benefit

The main expected benefit is that phase 2 no longer needs to perform MSM against a basis of size $n \cdot s$ for every $(j, i)$ target.

### Current hot path

The current phase-2 prepare path forms commitments of the shape

$$
\sum_{a,b} c_{j,a}\lambda_{i,b} [\alpha^k x^a y^b]_1,
$$

which requires an $XY$-basis family of size

$$
n \cdot s = 4096 \cdot 256 = 1{,}048{,}576
$$

per output row.

### Refactored hot path

The refactored phase-2 prepare path first computes

$$
[o_j(X)]_1,\quad [\alpha^4 K_j(X)]_1,\quad [M_j(X)]_1,
$$

using only $x$-basis families of size

$$
n = 4096,\quad m_i = 4096,\quad l_{\mathrm{free}} = 128.
$$

The $Y$-dependence is then introduced only as scalar multiplication.

The performance consequence is:

- The dominant MSM dimension drops from $n \cdot s$ to $n$ or $m_i$.
- The number of scalar multiplications in the final $Y$-expansion remains proportional to the output size, but those are field or curve-scalar multiplications, not million-point MSMs.
- The refactor removes the need for phase 1 to materialize and store `y`, `alpha_y`, `xy`, and `alpha_xy`.

## Security Degradation Surface

Moving $y$ out of phase 1 weakens the ceremony unless the design explicitly treats $y$ as non-updatable.

### What becomes weaker

- In the current ceremony, $y$ is contributed inside phase 1, so the standard "at least one honest participant" assumption applies to $y$ as well.
- In the refactored ceremony, only the first phase-2 step determines $y$.
- If that first phase-2 actor can choose $y$ adversarially, then the setup is no longer an MPC for $y$.

### Concrete bad choices for $y$

If $y$ is chosen on the $Y$-evaluation domain, then for some index $r$:

$$
L_r(y) = 1,\qquad L_i(y) = 0 \text{ for } i \neq r,
$$

which collapses the intended placement structure.

If

$$
y^s = 1,
$$

then

$$
t_s(y) = y^s - 1 = 0,
$$

which collapses every term of the form

$$
\left[\delta^{-1}\alpha^k y^i t_s(y)\right]_1.
$$

The refactor must therefore reject every sampled $y$ such that

$$
y^s = 1.
$$

### What does not automatically break

Knowing $y$ alone does not obviously reveal $x$, $\alpha$, $\gamma$, $\delta$, or $\eta$.

However, that is not sufficient to preserve the original ceremony guarantee, because the first phase-2 actor still controls the distribution of $y$ unless the protocol constrains how $y$ is generated.

## Security Assumptions Of The Refactored Ceremony

If the first phase-2 step chooses $y$ directly, the refactored ceremony relies on the following assumptions:

1. The first phase-2 actor samples $y$ honestly.
2. The first phase-2 actor does not choose a degenerate value such that $y^s = 1$.
3. At least one later phase-2 contributor is honest for $\gamma$, $\delta$, and $\eta$.
4. The first phase-2 actor cannot recover $x$ or $\alpha$ from the phase-1 artifact.

This is strictly weaker than the current "one honest contributor anywhere in phase 1" assumption for $y$.

### Safer variant

The safer variant is to derive $y$ from a public beacon or transcript challenge instead of a secret contributor choice. In that variant:

- $y$ is public, not secret.
- The ceremony no longer depends on trusting the first phase-2 actor for $y$.
- The refactor still keeps the same performance benefit, because phase 2 still expands the $Y$-dependent terms only once.

This document uses the first-phase-2-contributor model as the implementation target because it matches the requested direction, but the public-beacon variant should remain the preferred hardening path.

## Implementation Plan

The refactor can preserve the final `SigmaV2` format while changing only the internal phase split.

### Step 1: Make phase 1 x-only

- Remove active use of `y`, `alpha_y`, `xy`, and `alpha_xy` from the phase-1 accumulator.
- Keep the accumulator serialization compatible enough for the local codebase, but make the effective phase-1 contribution update only:
  - `alpha`
  - `x`
  - `alpha_x`
- Replace the current phase-1 proof check with an x-only consistency proof that verifies:
  - `alpha`
  - `x`
  - `alpha_x`

### Step 2: Move $y$ generation into `phase2_prepare`

- Add a phase-2 sampling path for $y`.
- Reject any sampled $y$ such that $y^s = 1`.
- Build:
  - $\Sigma_1.y = [y]_1$
  - $\Sigma_2.y = [y]_2$
  - `xy_powers`
  - all $Y$-vanishing correction terms

from x-only phase-1 data and the sampled scalar $y$.

### Step 3: Replace $XY$-basis MSM with x-only MSM

- For each wire polynomial, compute:

$$
[o_j(X)]_1,\quad [\alpha^4 K_j(X)]_1,\quad [M_j(X)]_1
$$

using only the x-only basis families.

- Expand to the final arrays by multiplying with:

$$
L_i(y),\quad L_{t(j)}(y),\quad y^b,\quad y^i t_s(y).
$$

### Step 4: Keep later phase-2 contributors unchanged

- `phase2_next_contributor` continues to update only:
  - $\gamma$
  - $\delta$
  - $\eta$
- The final `SigmaV2` layout remains unchanged, so downstream `phase2_gen_files`, `preprocess`, `prove`, and `verify` can keep the same artifact format.

## Review Criterion

The refactor is correct only if all of the following remain true:

1. The final `SigmaV2` formulas in this document are unchanged.
2. Phase 1 no longer needs to carry a live $y$ contribution.
3. `phase2_prepare` is the first point where a concrete $y$ enters the ceremony state.
4. The implementation rejects degenerate $y$ values with $y^s = 1$.
5. Downstream preprocess, prove, and verify code can consume the resulting `SigmaV2` without a format change.

## Future Work: Replace First-Contributor $y$ With A Public Beacon

### Current implementation status

The current implementation follows the first-phase-2-contributor model described above.
In concrete terms:

- Phase 1 emits an x-only artifact.
- `phase2_prepare` is the first step that chooses a concrete $y$.
- When `phase2_prepare` is run without an explicit `--y-hex`, the first phase-2 operator effectively determines the final $y$ value used to expand:

$$
[x^a y^b]_1,\quad
[\alpha^k x^a y^b]_1,\quad
L_i(y),\quad
y^i t_s(y).
$$

This achieves the intended performance improvement, but it also means that the implemented protocol is not an MPC for $y$.

### Security limitation of the current implementation

Under the current implementation, the first phase-2 operator can bias the distribution of $y$.
Even if later contributors honestly update $\gamma$, $\delta$, and $\eta$, they do not repair a bad $y$ choice because the final $Y$-expanded structure has already been fixed.

The concrete limitations are:

1. The setup now relies on the first phase-2 operator to choose $y$ honestly.
2. The setup must trust that the first phase-2 operator does not choose $y$ from the $Y$-evaluation domain.
3. The setup must trust that the first phase-2 operator does not choose any value such that

$$
y^s = 1.
$$

4. The security guarantee for $y$ is therefore weaker than the standard "at least one honest contributor" property that still applies to $\gamma$, $\delta$, and $\eta$.

This does not automatically imply that knowledge of $y$ alone reveals $x$, $\alpha$, $\gamma$, $\delta$, or $\eta$, but it does mean that the protocol currently gives one party unilateral control over the $Y$-side structure of the CRS.

### Target hardening model

The preferred hardening path is to make $y$ a public, deterministic transcript value instead of a secret contributor-selected value.

The target property is:

$$
y = \mathrm{HashToField}(\mathrm{domain\_separator} \parallel \mathrm{transcript\_commitment} \parallel \mathrm{beacon\_value} \parallel \mathrm{counter})
$$

with rejection and counter increment until:

$$
y^s \neq 1.
$$

Under this model:

- no contributor privately chooses $y$;
- every verifier can recompute the same $y$ from public inputs;
- multipart `phase2_prepare` runs derive the same $y$ without manual coordination;
- the performance benefit of the x-only phase-1 split is preserved.

### Concrete random-beacon migration plan

#### Step 1: Fix the public inputs that define the transcript

Define a canonical transcript preimage that includes at least:

- a domain separator dedicated to phase-2 $y$ derivation;
- the final phase-1 accumulator hash;
- the setup-parameter hash;
- the subcircuit-library hash;
- the selected public beacon identifier and value.

All fields must use a canonical byte encoding and a fixed order.

#### Step 2: Fix the beacon source contract

Choose and document one beacon source.
Acceptable examples are:

- a finalized Ethereum block hash at a precommitted height;
- a drand round output at a precommitted round;
- another public randomness source with stable archival access.

The protocol must specify:

- which network or service is used;
- how the beacon value is represented as bytes;
- when the beacon becomes fixed;
- how implementations behave if the beacon is unavailable.

#### Step 3: Define a deterministic `HashToField` rule

Specify the exact derivation algorithm, including:

- the hash function;
- the byte order;
- the reduction into the scalar field;
- the rejection rule for invalid values;
- the counter-based retry rule.

For example, the protocol can define:

$$
seed_0 = H(\mathrm{transcript} \parallel \mathrm{beacon}),
$$

$$
y_c = \mathrm{FieldReduce}(H(seed_0 \parallel c)),
$$

and choose the first $y_c$ such that

$$
y_c^s \neq 1.
$$

#### Step 4: Make multipart phase-2 derivation automatic

Remove the requirement that multipart runs share `--y-hex` manually.
Instead, every part must derive the same $y$ locally from the public transcript and beacon.

Each partial phase-2 artifact should still record a compact commitment to the derived $y$ so that merge code can assert equality across all parts.

#### Step 5: Bind the derived $y$ into the phase-2 artifact

Store enough metadata in the phase-2 accumulator or contributor record to make the derivation auditable.
At minimum, record:

- the beacon source identifier;
- the beacon value or its hash;
- the transcript hash used for derivation;
- the final derived $y$ encoding.

This lets downstream tooling and external auditors reproduce the exact value of $y$ used in the ceremony.

#### Step 6: Reject non-canonical or adversarial inputs

`phase2_prepare` should fail if:

- the beacon input is missing when beacon mode is selected;
- the beacon metadata does not match the documented source contract;
- the recomputed $y$ disagrees with the recorded value;
- the derived value satisfies

$$
y^s = 1.
$$

### Migration completion criterion

This future work is complete only when all of the following are true:

1. No contributor privately chooses $y$.
2. Every implementation derives the same $y$ from the same public inputs.
3. Multipart runs no longer require manual `--y-hex` coordination.
4. The resulting `SigmaV2` remains byte-compatible with downstream preprocess, prove, and verify stages.
5. The ceremony regains a public, bias-resistant rule for the $Y$-side structure of the CRS.
