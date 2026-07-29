# Optimization Reports

Audience: backend-wasm maintainers reviewing accepted and rejected prover
performance work before changing production algorithms or benchmark coverage.

This directory contains durable optimization evidence that must remain available
even when the benchmark implementation that produced it is removed.

- [Prover optimization history](./prover-optimization-history.md): chronological
  production changes, related commits, and full-prover timing results.
- [Prover chunk-size decision](./chunk-size-decision.md): the evidence
  supporting the fixed dense MSM chunk size.
- [Priority 32 promotion review](./priority-32-promotion-review.md): independent
  and combined candidate promotion decisions.
- [Prover initialization buffer benchmark](./prover-initialization-buffer-benchmark.md):
  accepted initialization-buffer changes and rejected low-impact candidates.
- [Prover timing checker audit](./prover-timing-checker-audit.md): ownership,
  drift rules, and distribution boundaries for the retained timing checker.
- [Staged prover API benchmark](./staged-prover-api-benchmark.md): execution-time
  and memory evidence for the one-call and explicit staged APIs.
- [Worker parallelization report](./rejected/outer-worker-msm.md): the
  rejected outer-worker MSM design, measurements, and rejection rationale.
- [Rejected candidate summary](./rejected/rejected-candidate-summary.md):
  representative commands, timing, memory evidence, and rejection reasons for
  removed candidate implementations.

Executable optimization benchmarks have been removed. The prover timing-table
generator remains available as `npm run prover:stage-timing:check`. Production
optimization changes must update the chronological history after correctness and
end-to-end timing checks pass.
