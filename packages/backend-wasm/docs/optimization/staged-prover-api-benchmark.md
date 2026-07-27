# Staged Prover API Benchmark

## Audience

This report is for backend-wasm maintainers and application integrators deciding
whether to use the one-call or staged prover API.

## Purpose

The prover exposes its arithmetic constraints, copy constraints, binding, and
integrated-finalization work as four ordered application-callable operations.
This benchmark checks whether those API boundaries add proof time or peak
process memory relative to `prove(input)`.

## Implementation Boundary

`prove(input)` and the explicit staged path execute the same code:

```text
begin(input)
  -> proveArithmetic()
  -> proveCopy()
  -> proveBinding()
  -> finalize()
```

One session owns the decoded inputs, randomizers, transcript, challenges,
polynomial buffers, and commitments. No intermediate value is serialized,
copied into a binary artifact, validated, or recomputed between calls.
`proveSnark()` is also a wrapper over the same protocol session.

The argument phases follow protocol dependency order rather than claiming that
every final proof element for one paper section is available immediately. In
particular, transcript-dependent evaluations and the aggregated `Pi_X` and
`Pi_Y` openings are computed only after their prerequisite commitments and
challenges exist.

## Method

- Date: 2026-07-27.
- Host: Darwin arm64.
- Runtime: Playwright Chromium with production multithreaded ffjavascript.
- Fixture: `fixtures/small/runtime`.
- Dense Sigma1 MSM chunk size: `262144`.
- Commands:
  - `npm run prover:browser:check`
  - `npm run prover:staged:browser:check`
- Correctness gate: each run generated a 2328-byte proof and the browser
  verifier returned `true`.
- Memory sampling: every second, sum the RSS of all
  `chrome-headless-shell` processes and separately retain the largest single
  process RSS.
- Each mode ran in a fresh Chromium process. RSS was retained for one run per
  mode. Two one-call runs and three staged runs characterize elapsed-time
  variation; the third staged run also checked disposal, invalid sequence
  rejection, failure invalidation, and busy-lock release.

## Results

| Mode | Proof-time samples | Mean | Peak total RSS | Peak single RSS |
| --- | --- | ---: | ---: | ---: |
| One-call `prove()` | 123.08 s, 124.51 s | 123.80 s | 9.813 GiB | 9.615 GiB |
| Explicit four calls | 128.73 s, 125.95 s, 123.32 s | 126.00 s | 9.784 GiB | 9.586 GiB |

The paired RSS runs observed a 4.22-second longer staged proof, 0.029 GiB lower
total RSS, and 0.029 GiB lower largest-process RSS. Across all timing samples,
the staged mean was 2.21 seconds (1.8%) higher and the sample ranges overlap.

These differences are observations, not attributable staged-API overhead.
The one-call wrapper invokes the same public session methods and therefore has
the same Promise boundaries, calculations, allocations, and object lifetimes.
The explicit browser path adds only one rejected busy-state assertion, whose
cost is negligible relative to the proof. The measured spread is consistent
with the known system-state variation of full prover runs.

For historical context, the frozen pre-change browser reference was 118.82
seconds, 10.03 GiB total RSS, and 9.83 GiB largest-process RSS. That reference
was recorded in an earlier system state and is not an A/B measurement; it does
not establish a regression caused by the staged API.

## Decision

The staged API is accepted:

- it preserves proof format and browser verifier acceptance;
- it introduces no intermediate serialization, validation, or recomputation;
- it shows no memory amplification;
- the complete wrapper and staged path share one implementation; and
- observed elapsed-time differences cannot be caused by different prover work.

Applications should use `prove()` when they need only a complete proof and use
`begin()` when they need explicit progress boundaries. An unfinished staged
session retains large prover state and must be finalized or disposed.
