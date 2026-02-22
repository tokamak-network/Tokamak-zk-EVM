# Prove Guardrails

Applies to `prove` crate and shared polynomial utilities it depends on.

## PV-1: Fiat-Shamir challenge flow is immutable
- Definition:
  - `thetas <- H(proof0 commitments)`
  - `kappa0 <- H(proof1 commitment | transcript_state)`
  - `(chi, zeta) <- H(proof2 commitments | transcript_state)`
  - `kappa1 <- H(proof3 evaluations | transcript_state)`
- Code anchors:
  - `prove/src/main.rs`
  - `prove/src/lib.rs` (`TranscriptManager`, `Proof{0,1,2,3}::verify*_with_manager`)
- Guardrail:
  - Commitment order and field-coordinate order must not change.
- LaTeX slot:
```tex
% PV-1
% Fill equations here.
% \[
% \]
```

## PV-2: Arithmetic quotient relation (prove0)
- Definition:
  - `p0(X,Y) = u(X,Y)*v(X,Y) - w(X,Y)`
  - `p0 = q0*t_n + q1*t_smax`
  - `t_n(X)=X^n-1`, `t_smax(Y)=Y^{s_max}-1`
- Code anchors:
  - `prove/src/lib.rs` (`prove0`)
- Guardrail:
  - Division strategy may change; relation must remain identical.
- LaTeX slot:
```tex
% PV-2
% Fill equations here.
% \[
% \]
```

## PV-3: Copy recursion polynomial relation (prove1)
- Definition:
  - `f = b + theta0*s0 + theta1*s1 + theta2`
  - `g = b + theta0*X + theta1*Y + theta2`
  - `r` is built so copy-product consistency relation is preserved over domain ordering.
- Code anchors:
  - `prove/src/lib.rs` (`prove1`)
- Guardrail:
  - Matrix traversal/transposition optimizations must keep the same recurrence semantics.
- LaTeX slot:
```tex
% PV-3
% Fill equations here.
% \[
% \]
```

## PV-4: Combined copy quotient relation (prove2)
- Definition:
  - `p1 = (r-1)*L_KL`
  - `p2 = (X-1)*(r*g - r_omegaX*f)`
  - `p3 = L_K0*(r*g - r_omegaX_omegaY*f)`
  - `p_comb = p1 + kappa0*p2 + kappa0^2*p3`
  - `p_comb = qCX*t_mi + qCY*t_smax`
  - `t_mi(X)=X^{m_i}-1`
- Code anchors:
  - `prove/src/lib.rs` (`prove2`)
- Guardrail:
  - Split/combined implementations are acceptable only if algebra remains equivalent.
- LaTeX slot:
```tex
% PV-4
% Fill equations here.
% \[
% \]
```

## PV-5: Evaluation consistency (prove3)
- Definition:
  - `V_eval = V(chi,zeta)`
  - `R_eval = R(chi,zeta)`
  - `R_omegaX_eval = R(omega_m_i^{-1}*chi, zeta)`
  - `R_omegaX_omegaY_eval = R(omega_m_i^{-1}*chi, omega_s_max^{-1}*zeta)`
- Code anchors:
  - `prove/src/lib.rs` (`prove3`)
- Guardrail:
  - Any optimization must preserve exact evaluation points.
- LaTeX slot:
```tex
% PV-5
% Fill equations here.
% \[
% \]
```

## PV-6: Linearization witness relations (prove4)
- Definition:
  - `Pi_A`, `Pi_C`, `Pi_B` are quotient witnesses from Ruffini division around `(chi,zeta)`.
  - Final aggregation:
    - `Pi_X = Pi_AX + Pi_CX + Pi_B`
    - `Pi_Y = Pi_AY + Pi_CY`
- Code anchors:
  - `prove/src/lib.rs` (`prove4`)
- Guardrail:
  - Terms may be reorganized computationally, not algebraically.
- LaTeX slot:
```tex
% PV-6
% Fill equations here.
% \[
% \]
```

## PV-7: Binding commitments keep sigma-dependent structure
- Definition:
  - `O_mid = O_mid_core + [delta]_1 * rO_mid`
  - `O_prv = O_prv_core - [eta]_1 * rO_mid + zk terms from sigma helper strings`
- Code anchors:
  - `prove/src/lib.rs` (`Prover::init`)
- Guardrail:
  - Do not remove or alter cancellation structure between `O_mid` and `O_prv`.
- LaTeX slot:
```tex
% PV-7
% Fill equations here.
% \[
% \]
```
