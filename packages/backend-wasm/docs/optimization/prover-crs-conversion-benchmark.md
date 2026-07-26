# Prover CRS Conversion Benchmark

## Audience

This report is for backend-wasm maintainers and performance engineers deciding
whether to replace the current per-point Prover CRS coordinate conversion.

## Scope

The benchmark compares the production conversion of native
`combined_sigma.rkyv` points with a batch field-conversion candidate. It does
not change production code. The real source and expected output are:

- `tmp/fixtures/small/source/setup/combined_sigma.rkyv`: 1,038,543,880 bytes;
- `fixtures/small/runtime/prover-crs.bin`: 1,038,338,352 bytes.

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
2. calculate the same source digest;
3. build the complete Prover CRS binary through the production artifact
   builder;
4. compare the complete output byte-for-byte with the expected artifact;
5. compare all nine section labels, types, encodings, counts, widths, and bytes.

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
| Node | Per-point BigInt/hex/parseAffine baseline | 61.493 s | 1.00x | 11.323 GiB |
| Node | F1 batch Montgomery candidate | 2.773 s | 22.18x | 12.378 GiB |
| Chromium | Per-point BigInt/hex/parseAffine baseline | 57.174 s | 1.00x | 11.367 GiB |
| Chromium | F1 batch Montgomery candidate | 2.685 s | 21.29x | 12.847 GiB |

The candidate increased peak process-tree RSS by about 1.05 GiB in Node and
1.48 GiB in Chromium. Both browser cases detached the 1,038,543,880-byte input
buffer and returned a 1,038,338,352-byte artifact.

## Parity

Both Node cases matched the existing artifact byte-for-byte. This comparison
also covers the final artifact digest table because it is part of the compared
file. Every generated section matched independently:

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

The batch Montgomery candidate has a decisive conversion-time advantage and
exact output parity, but it raises peak memory materially. Production remains
unchanged during the independent benchmark phase. Promotion must evaluate this
tradeoff together with the digest-memory result and reproduce the measurements
after integration.
