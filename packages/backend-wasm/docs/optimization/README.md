# Optimization Reports

Audience: backend-wasm maintainers reviewing accepted and rejected prover
performance work before changing production algorithms or benchmark coverage.

This directory contains durable optimization evidence that must remain available
even when the benchmark implementation that produced it is removed.

- [Prover optimization history](./prover-optimization-history.md): chronological
  production changes, related commits, and full-prover timing results.
- [Prover chunk-size benchmark](./prover-chunk-size-benchmark.md): the evidence
  supporting the fixed dense MSM chunk size.
- [Priority 32 promotion review](./priority-32-promotion-review.md): independent
  and combined candidate promotion decisions.
- [Worker parallelization report](./worker-parallelization-report.md): the
  rejected outer-worker MSM design, measurements, and rejection rationale.

Executable benchmarks and suite-specific usage documentation remain under
`test/benchmarks`. Production optimization changes must update the chronological
history after correctness and end-to-end timing checks pass.
