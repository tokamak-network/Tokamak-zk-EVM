# Custom CUDA Kernel Plan for `div_by_vanishing_opt`

## Goal

Evaluate whether a custom CUDA kernel can further reduce the remaining cost of `div_by_vanishing_opt` after the coefficient-domain recurrence optimization.

This is a higher-risk optimization than the previous Rust/ICICLE API changes. The work should stay small, measurable, and easy to roll back.

## Scope

- First target only `DensePolynomialExt::div_by_vanishing_opt`.
- Keep the current coefficient-domain recurrence as the CPU path and fallback path.
- Use the custom CUDA path only when CUDA is available and the input shape is explicitly supported.
- Do not rewrite `poly_comb`, `div_by_ruffini`, or encode paths in this experiment.

## Plan

1. Add temporary internal timing around the current recurrence implementation:
   - `copy_coeffs`
   - `acc_block`
   - `q_y`
   - `b`
   - `q_x`
   - `from_coeffs`

   This verifies how much time remains inside the division implementation itself, as opposed to caller-side construction of `p0XY` or `p_comb`.

2. Validate CUDA-side field arithmetic before touching the prover path.
   - Implement a tiny vector add/sub kernel for BLS12-381 scalar field elements.
   - Compare its output against the existing Rust/ICICLE field operations byte-for-byte on small and medium vectors.
   - Stop immediately if limb layout, modular reduction, or serialization assumptions are not fully verified.

3. Implement the smallest useful fast path first.
   - Target the common shape used by the current benchmark, where `m` and `n` are small.
   - Start with the most independent part: `q_y` recurrence plus `B` construction.
   - Keep the generic recurrence implementation as fallback for all unsupported shapes.

4. Integrate through a narrow Rust wrapper.
   - Add a minimal FFI boundary for the kernel.
   - Gate use on CUDA availability and supported shape checks.
   - If kernel launch or validation fails, fall back to the current Rust recurrence.

5. Measure on the remote CUDA host.
   - Compare against `timing.remote.div-by-vanishing-recurrence.cuda.json`.
   - Accept only if total wall time improves clearly, preferably by at least `0.5 s`, or if the internal `div_by_vanishing_opt` breakdown shows a large targeted reduction.
   - Treat smaller changes as noise and roll back.

## Main Risks

- CUDA-side scalar field add/sub must exactly match ICICLE/Rust field semantics.
- The remaining measured `div_by_vanishing_opt` event includes caller-side polynomial construction, so kernelizing the recurrence may have limited impact on total prove time.
- Kernel build and FFI integration add maintenance cost. If the improvement is small, the change should not be kept.

## Expected Outcome

The most likely result is either:

- a clear targeted win if the current recurrence loops dominate the remaining division time, or
- a rollback if the remaining cost is mostly caller-side polynomial construction and materialization.

The experiment should not proceed to broader custom kernels unless this first narrow path produces a clean timing improvement.
