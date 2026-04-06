# MPC Phase 2 Output Plan

## Objective

This document fixes the mathematical target of the final MPC phase-2 outputs.
It intentionally describes the outputs as formulas, not as code paths.
The purpose is to provide a stable reference before changing the phase-1 / phase-2 split.

## Notation

Let:

- \(l\) be the number of public wires.
- \(m_i\) be the number of intermediate wires.
- \(m_{\mathrm{prv}} = m_D - (l + m_i)\) be the number of private wires.
- \(s = s_{\max}\) be the maximum placement count.
- \(n\) be the number of constraints per subcircuit.

Trapdoor symbols:

- \(\alpha\)
- \(x\)
- \(y\)
- \(\gamma\)
- \(\delta\)
- \(\eta\)

Polynomial symbols:

- \(o_j(X)\) for the wire polynomial indexed by \(j\)
- \(K_j(X)\) for the intermediate-wire helper polynomial
- \(M_j(X)\) for the free-wire helper polynomial
- \(L_i(Y)\) for the \(i\)-th Lagrange basis polynomial on the \(Y\) domain
- \(t_n(X) = X^n - 1\)
- \(t_{m_i}(X) = X^{m_i} - 1\)
- \(t_s(Y) = Y^s - 1\)

Commitment notation:

- \([P(X, Y)]_1\) means the G1 commitment of polynomial \(P(X, Y)\)
- \([Q]_2\) means the G2 encoding of scalar \(Q\)

Public-wire segment selector:

- \(t(j)\) selects the public segment used by public wire \(j\)

## Final Output Structure

The final output is a CRS object of the form:

- \(\Sigma^{(2)} = (\gamma, \Sigma)\)
- \(\Sigma = (G, H, \Sigma_1, \Sigma_2, \mathrm{lagrange\_KL})\)

The formulas below define the mathematical target of each final output field.

## Final G1 Outputs

### Base points

- \(\gamma = [\gamma]_1\)
- \(G = [1]_1\)
- \(\Sigma_1.x = [x]_1\)
- \(\Sigma_1.y = [y]_1\)
- \(\Sigma_1.\delta = [\delta]_1\)
- \(\Sigma_1.\eta = [\eta]_1\)

### Monomial basis table

\(\Sigma_1.\mathrm{xy\_powers}\) stores:

\[
\left\{ [x^a y^b]_1 \right\}_{0 \le a \le h_{\max},\ 0 \le b \le 2s-2}
\]

where:

\[
h_{\max} = \max(2n-2,\ 2m_i-2)
\]

### Public-wire block

For each public wire \(j\):

\[
\mathrm{gamma\_inv\_o\_inst}[j]
=

\left[
\gamma^{-1}
\left(
L_{t(j)}(Y)\,o_j(X) + M_j(X)
\right)
\right]_1
\]

### Intermediate-wire block

For each intermediate wire \(j = 0, \dots, m_i - 1\) and each placement \(i = 0, \dots, s - 1\):

\[
\mathrm{eta\_inv\_li\_o\_inter\_alpha4\_kj}[j][i]
=
\left[
\eta^{-1}
L_i(Y)
\left(
o_{j+l}(X) + \alpha^4 K_j(X)
\right)
\right]_1
\]

### Private-wire block

For each private wire and each placement \(i = 0, \dots, s - 1\):

\[
\mathrm{delta\_inv\_li\_o\_prv}[j][i]
=
\left[
\delta^{-1}
L_i(Y)\,o_j(X)
\right]_1
\]

### Vanishing-Polynomial Correction Terms in \(X\)

For \(k = 1, 2, 3\) and \(h = 0, 1, 2\):

\[
\mathrm{delta\_inv\_alphak\_xh\_tx}[k][h]
=
\left[
\delta^{-1}\alpha^k x^h t_n(X)
\right]_1
\]

For \(j = 0, 1\):

\[
\mathrm{delta\_inv\_alpha4\_xj\_tx}[j]
=
\left[
\delta^{-1}\alpha^4 x^j t_{m_i}(X)
\right]_1
\]

### Vanishing-Polynomial Correction Terms in \(Y\)

For the required \((k, i)\) index pairs:

\[
\mathrm{delta\_inv\_alphak\_yi\_ty}[k][i]
=
\left[
\delta^{-1}\alpha^k y^i t_s(Y)
\right]_1
\]

### Lagrange boundary term

\[
\mathrm{lagrange\_KL}
=
\left[
K_{m_i-1}(X)\,L_{s-1}(Y)
\right]_1
\]

## Final G2 Outputs

\(\Sigma_2\) stores:

- \(\Sigma_2.\alpha  = [\alpha]_2\)
- \(\Sigma_2.\alpha^2 = [\alpha^2]_2\)
- \(\Sigma_2.\alpha^3 = [\alpha^3]_2\)
- \(\Sigma_2.\alpha^4 = [\alpha^4]_2\)
- \(\Sigma_2.\gamma  = [\gamma]_2\)
- \(\Sigma_2.\delta  = [\delta]_2\)
- \(\Sigma_2.\eta    = [\eta]_2\)
- \(\Sigma_2.x       = [x]_2\)
- \(\Sigma_2.y       = [y]_2\)

## Dependency View

This section groups the outputs by which trapdoor symbols they depend on.

### Outputs That Depend Only on \(x\)

- \(\Sigma_1.x\)
- parts of \(\mathrm{delta\_inv\_alphak\_xh\_tx}\)
- parts of \(\mathrm{delta\_inv\_alpha4\_xj\_tx}\)

### Outputs That Depend Only on \(y\)

- \(\Sigma_1.y\)
- parts of \(\mathrm{delta\_inv\_alphak\_yi\_ty}\)
- the \(Y\)-side of \(\mathrm{lagrange\_KL}\)

### Outputs That Depend on Both \(x\) and \(y\)

- \(\Sigma_1.\mathrm{xy\_powers}\)
- \(\mathrm{gamma\_inv\_o\_inst}\)
- \(\mathrm{eta\_inv\_li\_o\_inter\_alpha4\_kj}\)
- \(\mathrm{delta\_inv\_li\_o\_prv}\)
- \(\mathrm{lagrange\_KL}\)

### Outputs That Depend on \(\gamma\), \(\delta\), or \(\eta\)

- \(\gamma\)
- \(\Sigma_1.\delta\)
- \(\Sigma_1.\eta\)
- \(\Sigma_2.\gamma\)
- \(\Sigma_2.\delta\)
- \(\Sigma_2.\eta\)
- \(\mathrm{gamma\_inv\_o\_inst}\)
- \(\mathrm{eta\_inv\_li\_o\_inter\_alpha4\_kj}\)
- \(\mathrm{delta\_inv\_li\_o\_prv}\)
- \(\mathrm{delta\_inv\_alphak\_xh\_tx}\)
- \(\mathrm{delta\_inv\_alpha4\_xj\_tx}\)
- \(\mathrm{delta\_inv\_alphak\_yi\_ty}\)

## Planning Implication For A Refactor

If \(y\) is removed from phase 1 and moved into phase 2, then every output listed under "Outputs That Depend on Both \(x\) and \(y\)" must still be expressible from the new phase-1 artifact contract.

That means a refactor must preserve the ability to construct:

\[
[x^a y^b]_1,\quad
[\alpha^k x^a y^b]_1,\quad
[y]_2
\]

or another mathematically equivalent representation.

The refactor is therefore feasible only if phase 2 gains enough structure to reconstruct all \(Y\)-dependent and \(XY\)-dependent commitments in the formulas above.
