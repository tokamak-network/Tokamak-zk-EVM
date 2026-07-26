# Binary Digest Policy Benchmark

> Historical benchmark: after this measurement, the final pre-release format
> removed source and section digests and retained only the whole-file self
> digest using WebCrypto. The temporary benchmark code was deleted.

## Audience

This report is for backend-wasm maintainers selecting the binary-artifact
digest policy before production promotion.

## Question

The primitive benchmark established that incremental SHA-256 avoids
artifact-sized transient copies but is substantially slower than WebCrypto.
This benchmark measures the complete real Prover CRS digest workload instead
of deriving a policy result from isolated digest timings.

The compared policies are:

- **speed-first**: WebCrypto for the source, all sections, and self digest;
- **hybrid**: WebCrypto for the source and all sections, incremental SHA-256
  for the self digest;
- **memory-first**: incremental SHA-256 for the source, all sections, and self
  digest.

## Method

The benchmark uses:

- the 1,038,543,880-byte `combined_sigma.rkyv` source;
- the 1,038,338,352-byte `prover-crs.bin` artifact;
- one source hash checked against both source digest entries;
- all nine section hashes;
- one whole-artifact self hash with the self-digest payload zeroed.

Each policy runs in a fresh Node process and a fresh headless Chromium
instance. Three independent runs were performed per runtime and the median is
reported. Elapsed time starts after both inputs have loaded and covers decoding
the binary tables plus the complete digest workload. An external sampler reads
the complete benchmark process-tree RSS every 20 milliseconds.

Every run required byte-exact agreement with the existing source, section, and
self digests. The benchmark does not modify production code.

Commands:

```sh
npm run benchmark:binary-digest-policy:node
npm run benchmark:binary-digest-policy:browser
```

## Results

### Node

| Policy | Median time | Slowdown | Added time | Median peak RSS | RSS reduction |
| --- | ---: | ---: | ---: | ---: | ---: |
| Speed-first | 1.332 s | 1.00x | - | 6.807 GiB | - |
| Hybrid | 4.463 s | 3.35x | 3.132 s | 5.842 GiB | 0.965 GiB (14.2%) |
| Memory-first | 10.845 s | 8.14x | 9.513 s | 3.935 GiB | 2.872 GiB (42.2%) |

### Chromium

| Policy | Median time | Slowdown | Added time | Median peak RSS | RSS reduction |
| --- | ---: | ---: | ---: | ---: | ---: |
| Speed-first | 1.514 s | 1.00x | - | 9.352 GiB | - |
| Hybrid | 5.186 s | 3.42x | 3.672 s | 6.999 GiB | 2.353 GiB (25.2%) |
| Memory-first | 12.778 s | 8.44x | 11.263 s | 4.580 GiB | 4.772 GiB (51.0%) |

All 18 policy executions passed exact digest parity.

Process-tree RSS includes retained inputs, runtime overhead, Playwright, and
Chromium child processes. It is therefore a policy-comparison metric rather
than memory attributed exclusively to hashing. The Node hybrid RSS had one
high sample; the reported three-run median excludes that sampling outlier.

## Conclusion

The hybrid policy removes the largest self-digest copies while preserving
WebCrypto for the source and sections. In Chromium it costs 3.672 seconds over
speed-first and reduces observed peak RSS by 2.353 GiB.

The memory-first policy also removes source and section digest copies. In
Chromium it costs 11.263 seconds over speed-first and reduces observed peak RSS
by 4.772 GiB.

The project owner subsequently selected a simpler self-digest-only format.
Source, material-specific, and section digests were removed, and the remaining
self digest uses the speed-first WebCrypto implementation. Incremental and
hybrid candidates were not promoted.
