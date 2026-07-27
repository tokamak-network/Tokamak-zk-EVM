# Prover CRS Conversion Benchmark

## Audience

This report is for backend-wasm maintainers and performance engineers reviewing
the production Prover CRS coordinate conversion.

## Scope

The benchmark compared the former production conversion of native
`combined_sigma.rkyv` points with the batch field-conversion implementation
that was subsequently promoted. The real source and expected output are:

- `tmp/fixtures/small/source/setup/combined_sigma.rkyv`: 1,038,543,880 bytes;
- `fixtures/small/runtime/prover-crs.bin`: 1,038,337,912 bytes.

The source is an ignored local copy prepared by the fixture-copy workflow. The
expected binary is the existing baseline converter output.

## Representations

The native backend writes `G1SerdeRkyv` as canonical little-endian `x` and `y`
Fq coordinates, each 48 bytes. It writes `G2SerdeRkyv` as canonical
little-endian Fq2 `x` and `y` coordinates, each 96 bytes. An Fq2 coordinate is
laid out as its two 48-byte Fq components.

ffjavascript stores affine G1 and G2 coordinates at the same widths and in the
same component order, but each Fq value is in Montgomery form. Therefore:

- copying native coordinate bytes directly is incorrect;
- point-by-point `BigInt`, hexadecimal text, and `fromObject()` conversion is
  correct but unnecessary;
- applying ffjavascript `F1.batchToMontgomery()` to the flat coordinate buffer
  performs the required representation change without changing point or Fq2
  component order;
- a separate batch curve conversion is not needed because the input is already
  affine and only its constituent field representation changes.

The candidate was checked on zero points, G1/G2 generators, negated generators,
repeated points, and G2 component ordering before the real-CRS runs.

## Method

The Node benchmark runs each case in a fresh child process and samples the RSS
sum of that process and all ffjavascript worker descendants. Both cases:

1. read and decode the same real RKYV source;
2. build the complete self-digest-only Prover CRS binary through the artifact
   builder;
3. compare the complete output byte-for-byte with the expected artifact;
4. compare all nine section labels, types, encodings, counts, widths, and bytes.

The Chromium benchmark runs each case in a fresh browser. Both use a dedicated
module Worker, transfer and detach the source buffer, and transfer the completed
artifact back. The runner samples the RSS sum of its Node process, Playwright
driver, Chromium browser, renderer, and Worker descendants. Chromium exposed
only `performance.memory.usedJSHeapSize` inside the page, which does not cover
Worker WASM and ArrayBuffer memory; that page metric is retained only as
diagnostic context and is not used for the memory conclusion.

## Results

| Runtime | Technique | Elapsed | Relative speed | Peak process-tree RSS |
| --- | --- | ---: | ---: | ---: |
| Node | Per-point BigInt/hex/parseAffine baseline | 60.496 s | 1.00x | 10.890 GiB |
| Node | F1 batch Montgomery candidate | 2.367 s | 25.56x | 13.275 GiB |
| Chromium | Per-point BigInt/hex/parseAffine baseline | 57.517 s | 1.00x | 11.333 GiB |
| Chromium | F1 batch Montgomery candidate | 2.081 s | 27.64x | 12.824 GiB |

The candidate increased peak process-tree RSS by about 2.385 GiB in Node and
1.491 GiB in Chromium. Both browser cases detached the 1,038,543,880-byte input
buffer and returned a 1,038,337,912-byte artifact.

After promotion, an independent production run completed in 1.838 seconds in
Node and 2.086 seconds in Chromium. The complete production artifact still
matched the expected file byte-for-byte.

## Parity

Both Node cases matched the existing artifact byte-for-byte. This comparison
also covers the final self digest because it is part of the compared file.
Every generated section matched independently:

| Section | Points | Bytes |
| --- | ---: | ---: |
| `sigma.g1` | 6 | 576 |
| `sigma1.xy-powers` | 4,194,304 | 402,653,184 |
| `sigma1.gamma-inv-o-inst` | 728 | 69,888 |
| `sigma1.eta-inv-li-o-inter-alpha4-kj` | 1,048,576 | 100,663,296 |
| `sigma1.delta-inv-li-o-prv` | 5,572,352 | 534,945,792 |
| `sigma1.delta-inv-alphak-xh-tx` | 9 | 864 |
| `sigma1.delta-inv-alpha4-xj-tx` | 2 | 192 |
| `sigma1.delta-inv-alphak-yi-ty` | 12 | 1,152 |
| `sigma.g2` | 10 | 1,920 |

## Conclusion

The project owner accepted the peak-memory increase in exchange for the
decisive conversion-time reduction. `F1.batchToMontgomery()` is now the
production conversion path. Temporary candidate and benchmark programs were
removed after preserving these results; the permanent binary check retains
zero, generator, negated-generator, repeated-point, and G2 ordering coverage.

## Unified CRS Output Follow-Up

The converter was later changed from the single `proverCrs` output to the named
`{ proverCrs, preprocessCrs, verifierCrs }` result. This follow-up used the same
1,038,543,880-byte owner `combined_sigma.rkyv` on an Apple M4 Pro with Node.js
26.0.0. Each case ran in a fresh process. Peak RSS is the maximum resident set
reported by `/usr/bin/time -l`.

| Converter | Function wall time | Peak RSS | Output bytes |
| --- | ---: | ---: | ---: |
| Former single-output converter | 2.118 s | 13.74 GiB | 1,038,337,912 |
| Unified three-output converter | 3.324 s | 12.14 GiB | 1,139,061,864 |

The unified converter adds approximately 1.206 seconds because it builds and
digests two additional standalone binary files. Bounded Montgomery conversion
batches reduce peak RSS by approximately 1.61 GiB despite retaining the
additional 100,721,272-byte preprocess CRS and 2,680-byte verifier CRS outputs.

The prover output remained byte-for-byte identical to the former converter:

```text
bytes:  1038337912
sha256: b0ba69e86c385ad2b8e04602780f97ee3010996f643459e930e18c6e88f8eb90
```

The additional output identities were:

```text
preprocessCrs bytes:  100721272
preprocessCrs sha256: 7d2c2aa777ada9ca44a6bc1b747bbdaadfee23f38f29b7794ea8ea757510b3af
verifierCrs bytes:    2680
verifierCrs sha256:   eebad343a54d44897feefa0abf0b5075d3edfeaf3cb6922f22acf41ee96db5b5
```

The accepted tradeoff is a one-time conversion-time increase for independently
cacheable runtime artifacts, unchanged prover CRS bytes, and lower measured
peak memory.
