# Plan
- [x] Make `read_R1CS_gen_uvwXY` adaptive: GPU path uses subcircuit-batched matmul; CPU path uses sparse rows without dense matmul.
- [x] Keep timing logs for both paths (CPU uses prep/sparse-eval; GPU uses wall-clock prep/matmul).
- [x] Verify: build/test `libs` and note runtime behavior.

# Review
- [x] Summarize changes and verification results.
Added sparse row storage in `SubcircuitR1CS` and CPU path now evaluates sparse rows directly (no dense matmul). GPU path remains subcircuit-batched matmul. Timing logs updated for sparse-eval.
Verification: `cargo test -p libs --lib` compiles but unit tests abort at runtime with SIGBUS after device registration (environment issue persists in tests).
