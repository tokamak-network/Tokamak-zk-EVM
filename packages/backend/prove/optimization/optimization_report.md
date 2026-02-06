# Prove Optimization Report

Generated from commit history on branch `jake-backend-optimization` and `prove/output/timing.release.md` snapshots.

## Summary Timeline (by commit date)

| date | commit | change | total_wall (s) | init (s) | prove0 (s) | prove2 (s) |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-01-29 | d8c1c2b4 | Include timing report md and setup params | 71.049089 | ? | 8.995563 | 33.943829 |
| 2026-01-30 | d1e06002 | docs: update timing report guidance | 78.461586 | ? | 9.514175 | 35.794646 |
| 2026-02-05 | d583440c | feat: cache denom inverses and benchmark div_by_vanishing | 65.550416 | ? | 8.210208 | 27.574265 |
| 2026-02-05 | bf2b6481 | Resolve PR 179 merge conflicts | 78.461586 | ? | 9.514175 | 35.794646 |
| 2026-02-05 | c1487461 | Refresh timing report and task docs | 66.383591 | 14.298070 | 8.541777 | 28.289676 |
| 2026-02-05 | 85d9149c | Make zero-copy the only sigma path | 59.835278 | 7.254481 | 8.587046 | 28.300791 |
| 2026-02-06 | 2675f6f2 | Optimize read_R1CS_gen_uvwXY paths | 59.274345 | 5.497034 | 9.124470 | 29.156904 |
| 2026-02-06 | 127aa57b | Add CPU sparse eval for R1CS | 52.947312 | 1.449287 | 8.502204 | 27.788595 |

## Notes and Interpretation

- Values are taken from `prove/output/timing.release.md` at each commit.
- `total_wall` is the top-level elapsed time reported in the timing report.
- For early commits, module-level `init` time is not available in the report (marked `?`).

## Optimization Attempts (chronological)

### 2026-01-29 — d8c1c2b4
- Change: Included timing report markdown and setup params in the report.
- Result: Baseline `total_wall` 71.049 s.

### 2026-01-30 — d1e06002
- Change: Documentation update for timing guidance.
- Result: `total_wall` 78.462 s (timing report updated but no direct optimization).

### 2026-02-05 — d583440c
- Change: Cached denominator inverses; benchmarked `div_by_vanishing`.
- Result: `total_wall` 65.550 s; `prove2` 27.574 s (improvement vs prior report snapshots).

### 2026-02-05 — bf2b6481
- Change: Resolve PR 179 conflicts.
- Result: `total_wall` 78.462 s (report content regressed to a higher baseline).

### 2026-02-05 — c1487461
- Change: Refreshed timing report and task docs.
- Result: `total_wall` 66.384 s; `init` 14.298 s is recorded in report.

### 2026-02-05 — 85d9149c
- Change: Zero-copy sigma path only.
- Result: `total_wall` 59.835 s; `init` 7.254 s (notable init reduction).

### 2026-02-06 — 2675f6f2
- Change: Optimize `read_R1CS_gen_uvwXY` paths (GPU/CPU branching and timing instrumentation).
- Result: `total_wall` 59.274 s; `init` 5.497 s; `prove2` 29.157 s.

### 2026-02-06 — 127aa57b
- Change: Add CPU sparse evaluation for R1CS.
- Result: `total_wall` 52.947 s; `init` 1.449 s; `prove2` 27.789 s (best observed).

## Current Status

- Best observed total wall time in history: **52.947 s** at commit `127aa57b`.
- Improvements appear correlated with `init` reduction and `prove2` time reduction.