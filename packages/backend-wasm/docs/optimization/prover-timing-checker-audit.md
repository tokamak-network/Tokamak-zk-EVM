# Prover Timing Checker Ownership Audit

## Audience

This report is for backend-wasm maintainers changing prover protocol logic or
the retained timing-table checker.

## Purpose

`test/checks/prover/check-prover-stage-timing.ts` intentionally mirrors
protocol orchestration so it can place mutually exclusive timing spans around
the same production primitives. Production must not contain timing hooks or
diagnostic branches, so this mirror cannot call the integrated orchestration
entry and still retain the required lowest-operation taxonomy.

## Ownership Map

| Timing checker boundary | Production owner |
| --- | --- |
| `provePreparedInputWithStrictTimings` | `prover/protocol/integrated-prover.ts` |
| `prove0Timed` | `prover/protocol/initial-relation.ts` plus production commitment encoder |
| `prove1Timed` | `prover/protocol/recursion-commitment.ts` |
| `prove2Timed` | `prover/protocol/copy-quotient.ts` |
| `evaluateChallengePointsTimed` | `prover/protocol/challenge-evaluations.ts` |
| `prove4Timed` and `buildCopyOpeningNumeratorTimed` | `prover/protocol/opening-commitments.ts` |
| Transcript challenge collection helpers | private helpers in `prover/protocol/integrated-prover.ts` |
| Polynomial wrappers | the named modules under `prover/polynomial` and `runtime/polynomial` |
| Sigma1 encoding wrapper | `prover/commitments/sigma1-encoder.ts` |
| Fixture loading | shared `test/support/runtime-inputs.ts` |
| Final verification | shared `test/support/verifier/verify-binary.ts` |

## Extraction Decision

No extraction was made during this audit:

- fixture loading and verification already use shared test support;
- timing collection, taxonomy aggregation, invariant construction, console
  output, and Markdown rendering have one consumer and no duplicate
  implementation elsewhere;
- moving those single-use functions to another file would reduce one file's
  line count without reducing total code or responsibility;
- sharing protocol formulas with production would require diagnostic callbacks,
  wrappers, or hooks in published code and would violate the strict
  diagnostics-exclusion policy;
- exporting private transcript helpers only for the checker would expand
  production surface for a test-only reason.

The large checker is therefore accepted as an explicit test-only protocol
mirror. This is narrower and safer than introducing production diagnostics
abstractions.

## Drift Rules

Any production change to one of the mapped protocol owners must update the
corresponding timed boundary in the same change. The retained checker must then:

1. generate a proof accepted by the verifier;
2. preserve the fixed lowest, middle, top, and execution-boundary taxonomies
   unless the project owner explicitly changes that taxonomy;
3. pass every parent/child and exclusivity invariant;
4. remain outside `dist` and the npm tarball.

## Verification

The audit reran the complete checker on the real fixture. The operation counts
before and after the audit were identical:

- lowest: `49, 18, 1, 7, 2, 2, 14, 1`;
- middle: `67, 1, 7, 4, 15`;
- top: `79, 15`;
- execution boundary: `2, 79, 15, 1, 2, 1, 1, 1`.

All 18 timing invariants passed, the generated proof was accepted, total wall
time was 119.33 seconds, and no production or publication file changed.
