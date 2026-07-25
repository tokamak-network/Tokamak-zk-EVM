# Priority 32 Promotion Review

Audience: the backend-wasm project owner and developers deciding which
diagnostics-only Priority 32 candidates may proceed to separate production
implementation.

No candidate in this report has been applied to production. Parity establishes
mathematical or representation equivalence only; it does not authorize
promotion.

## Results

| item | baseline | candidate | measured delta | allocation or memory delta | parity | recommendation |
| --- | ---: | ---: | ---: | --- | --- | --- |
| 32A raw CRS descriptors, construction | 635.692 ms | 0.167 ms | -635.525 ms (-100.0%) | heap 1266.288 to 0.138 MiB; retained objects 10,815,983 to 7 | pass | promote |
| 32B combined Pi openings | 30294.432 ms | 20317.743 ms | -9976.689 ms (-32.9%) | polynomial bytes 640.051 to 512.016 MiB | pass | promote with 32C |
| 32C shared M/N X opening | 10546.003 ms | 5290.750 ms | -5255.253 ms (-49.8%) | polynomial bytes 256.031 to 128.031 MiB | pass | promote with 32B |
| 32B+32C direct combination | 40636.122 ms | 25531.853 ms | -15104.269 ms (-37.2%) | polynomial bytes 896.082 to 640.047 MiB | pass | promotion evidence |
| 32D persistent packed CSR | 381.097 ms | 329.357 ms | -51.740 ms (-13.6%) | per-proof packed construction 95.961 to 3.459 MiB retained once | pass | promote with 32F |
| 32F direct flat witness | 4143.801 ms | 2923.687 ms | -1220.114 ms (-29.4%) | 7,340,032 JS entries to zero; explicit copies 224.000 to 87.750 MiB | pass | promote with 32D |
| 32D+32F direct combination | 4143.801 ms | 2781.108 ms | -1362.693 ms (-32.9%) | same flat-output allocation result plus build-time packed CSR | pass | promotion evidence |
| 32E `O_pub_free` zero compaction | 1.282 ms | 1.590 ms | +0.308 ms (+24.0%) | temporary 0.017 to 0.015 MiB | pass | reject |
| 32E `O_mid` zero compaction | 14.051 ms | 13.296 ms | -0.755 ms (-5.4%) | temporary 1.041 to 0.967 MiB | pass | promote with `O_prv` |
| 32E `O_prv` zero compaction | 1686.677 ms | 1597.912 ms | -88.765 ms (-5.3%) | temporary 99.323 to 90.206 MiB | pass | promote with `O_mid` |
| 32H same-shape clone work | 3.371 ms | 0.006 ms | -3.365 ms (-99.8%) | explicit copy 64 to 0 MiB | pass | optional low-impact promotion |
| 32G G2, 4096x256 forward | 354.750 ms | 323.244 ms | -31.506 ms (-8.9%) | segment allocation 128 to 64 MiB | pass | promote |
| 32G G2, 4096x256 inverse | 376.386 ms | 357.644 ms | -18.742 ms (-5.0%) | segment allocation 192 to 128 MiB | pass | promote |
| 32G G2, 8192x512 forward | 1392.968 ms | 1272.758 ms | -120.210 ms (-8.6%) | segment allocation 512 to 256 MiB | pass | promote |
| 32G G2, 8192x512 inverse | 1481.382 ms | 1381.312 ms | -100.070 ms (-6.8%) | segment allocation 768 to 512 MiB | pass | promote |

The 32H complete-boundary median changed from `841.304 ms` to `811.030 ms`,
but its ranges overlap and the two NTT timings exchanged runtime noise. Only
the directly measured clone work and explicit copy removal are used above.

## Rejected Candidates

- 32E zero compaction for `O_pub_free`: fixed scan/allocation cost exceeds the
  saving at 109 inputs.
- 32G G1 cached bit-reversal table: three of four final representative results
  regressed. Index calculation is not dominant over memory copying.
- 32G G3 direct inverse output: inverse assembly improves, but repeated
  complete-boundary runs changed direction. The isolated copy saving is not
  sufficient evidence for production.
- 32G G1+G2: it is faster than current but slower than G2 alone in three of four
  representative cases. G2 alone is the narrower and better-supported change.

## Promotion Set

Recommended set, subject to explicit project-owner approval:

1. 32A raw CRS section descriptors.
2. 32D persistent packed CSR and 32F direct flat witness as one coordinated
   representation change, using the directly measured combined boundary.
3. 32B combined Pi openings and 32C shared M/N X opening as one coordinated
   opening change, using the directly measured combined boundary.
4. 32E preallocated zero-compacted binding buffers for `O_mid` and `O_prv`
   only.
5. 32G G2 direct task shards without G1 or G3.
6. 32H shape assertion/direct recursion NTT input as an optional final
   low-impact cleanup.

Suggested production order is the list order above. It separates persistent
representation changes from proof-equation scheduling and then applies smaller
caller-boundary optimizations. Every item remains a separate attributable
production work item and acceptance commit under Priority 34.

## Decision Required

Priority 34 must not start until the project owner explicitly approves the
exact candidate set and promotion order. Rejected candidates remain
diagnostics history and must not be silently included in an approved item.
