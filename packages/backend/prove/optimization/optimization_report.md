# Prove Optimization Report (Total-Wall Reduction Based)

This report is reconstructed around **total_wall reductions** recorded in `prove/output/timing.release.md` snapshots. A new Source Series row is created only when **total_wall decreases by ≥ 3 seconds** relative to the immediately previous snapshot.

## Source Series (total_wall by snapshot commit)

| date | commits | change summary | total_wall (s) | mini-report |
| --- | --- | --- | --- | --- |
| 2026-01-29 | d8c1c2b4 | Added timing report markdown and setup parameter reporting (baseline snapshot). | 71.049089 | [mini-report](mini-reports/2026-01-29_d8c1c2b4.md) |
| 2026-02-05 | 032ef14d, d1e06002, 5c0375b5, eb31bffd, d583440c, 561c4e4f, bf2b6481, be76316d, c1487461 | Removed checkpoint logs; updated timing report guidance; preprocess input uses permutation.json (dropping instance load), div_by_vanishing denom-inverse caching/benchmarks, and backend task/timing doc refresh with merge fixes. | 66.383591 | [mini-report](mini-reports/2026-02-05_c1487461.md) |
| 2026-02-05 | 7bc32e82, 85d9149c | Task checklist update; enforce zero-copy sigma path only. | 59.835278 | [mini-report](mini-reports/2026-02-05_85d9149c.md) |
| 2026-02-06 | a237c3cd, 2675f6f2, 127aa57b | Task checklist update; optimize read_R1CS_gen_uvwXY paths (CPU/GPU branching); add CPU sparse eval for R1CS. | 52.947312 | [mini-report](mini-reports/2026-02-06_127aa57b.md) |
| 2026-02-06 | ccc3d2d8 | Refine prove4 timing instrumentation and tooling. | 49.781555 | [mini-report](mini-reports/2026-02-06_ccc3d2d8.md) |
| 2026-02-07 | 6dcce13a, bcc9eb25, 8839dbc5 | div_by_vanishing_opt improvements (docs + caching) and task log update. | 46.743467 | [mini-report](mini-reports/2026-02-07_8839dbc5.md) |
| 2026-02-08 | 3d6ce1a6, 7964656a | Optimization reporting prompt update; NTT domain init + _biNTT domain checks/coset config; div_by_vanishing_opt axis-inverse caching; timing snapshot refresh. | 27.908515 | [mini-report](mini-reports/2026-02-08_7964656a.md) |

## Notes

- Rows are included **only when total_wall drops by ≥ 3 seconds** vs the immediately previous snapshot.
- Current best observed total_wall in this series: **27.908515 s** at `7964656a` (2026-02-08).
