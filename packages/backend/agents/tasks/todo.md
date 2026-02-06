# Plan
- [x] Make `read_R1CS_gen_uvwXY` adaptive: GPU path uses subcircuit-batched matmul; CPU path restores placement-parallel matmul.
- [x] Keep timing logs for both paths (CPU uses per-thread summed prep/matmul; GPU uses wall-clock prep/matmul).
- [x] Verify: build/test `libs` and note runtime behavior.

# Review
- [x] Summarize changes and verification results.
Adaptive path: GPU uses batched matmul per subcircuit; CPU uses placement-parallel matmul with per-thread device init. Timing logs preserved for both paths.
Verification: `cargo test -p libs --lib` still aborts at runtime with SIGABRT after device registration (environment issue persists in tests).
