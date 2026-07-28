# Preprocess Benchmarks

## Audience

This document is for backend-wasm maintainers evaluating preprocess
implementations. It is not part of the public application API documentation.

## Baseline Method

Run:

```sh
npm run preprocess:baseline
```

The benchmark uses the prepared `small` fixture and production preprocess
primitives without modifying production behavior. Timing stages are exclusive:

- `fixtureRead`: read the four prepared binary fixture files;
- `runtimeInstall`: create the ffjavascript curve runtime;
- `inputDecode`: decode the three preprocess binary inputs;
- `permutationPolynomials`: build `s0(X,Y)` and `s1(X,Y)`;
- `s0Commitment`: commit `s0`;
- `s1Commitment`: commit `s1`;
- `oPubFix`: commit the function-instance values;
- `output`: encode `verifier-preprocess.v1`;
- `parityCheck`: compare the result with the copied native output.

`preprocess` is the sum of `inputDecode` through `output`. `processWall`
includes fixture reading, runtime installation, preprocess, parity checking,
and benchmark overhead. Peak RSS is read from the operating system through
Node.js `process.resourceUsage()`.

## Fixture Identity

Source artifacts were copied from the local `main` worktree after native
preprocess, prove, and verify completed successfully.

| Source artifact | SHA-256 |
| --- | --- |
| `instance.json` | `afe0a8aff5619a6bc8387c4a9fbd3d238700c44e109e7449a4f72ea5ff801782` |
| `permutation.json` | `2f02bcf0ee105e0811174d74669a867a625b45472e60b206a8b200e8ddcc65b3` |
| `placementVariables.json` | `50a4a464d2243160d9eb2743a1d03748e33d65214501e30dc36f0a6d517c3a35` |
| `sigma_verify.json` | `74d588ee3a870092d31597d0b9b3e59eb6210bff3e3162c03ae742464187fc16` |
| `combined_sigma.rkyv` | `750c26922a39568a68101501668b496b32938349afc3faa221f6dc929fc6d9a9` |
| `preprocess.json` | `a4df816aeab613b4ccd97902bf5a58dff06c8d1c9be58614172348d4887c786d` |
| `proof.json` | `7680f55edeb6fecc4314f4e8358daae6baa846acade0556c628cad33cfeb6b74` |
| `proof4_test.json` | `10fd29784c57374128a5e964d09b31543112080f933f8b7c9a857efc08547a84` |

## Measurement Status

All previously recorded preprocess timing and memory measurements are invalid.
The benchmark environment contained substantial uncontrolled noise. Do not use
the removed values to compare implementations or select production behavior.

The benchmark programs and fixture identities were retained and rerun under
the three-measurement policy below. This invalidation applies only to the
removed measurements; it does not invalidate the current results or alter
separately recorded converter benchmarks.

Every new benchmark mode must run exactly three times. Reports use the
arithmetic mean and population standard deviation of those observations. No
noise threshold, outlier rejection, or additional measurement is applied.

## Current Baseline

Measured with chunk size `2^18 = 262,144` on Apple M4 Pro, macOS 26.5.2,
Node.js 26.0.0 arm64. Each run used an independent process and passed native
output parity.

| Run | Preprocess | Process wall | Peak RSS |
| ---: | ---: | ---: | ---: |
| 1 | 10,696.768 ms | 10,957.388 ms | 3.094 GiB |
| 2 | 10,795.257 ms | 11,039.767 ms | 3.104 GiB |
| 3 | 10,748.076 ms | 10,987.703 ms | 3.093 GiB |
| Mean | 10,746.700 ms | 10,994.952 ms | 3.0968 GiB |
| Population standard deviation | 40.220 ms | 34.019 ms | 0.0053 GiB |

Exclusive stage results:

| Stage | Mean | Population standard deviation |
| --- | ---: | ---: |
| Fixture read | 23.980 ms | 9.240 ms |
| Runtime install | 224.089 ms | 1.967 ms |
| Input decode | 0.636 ms | 0.018 ms |
| Permutation polynomials | 747.959 ms | 6.999 ms |
| `s0` commitment | 4,992.454 ms | 21.073 ms |
| `s1` commitment | 5,002.982 ms | 13.505 ms |
| `O_pub_fix` | 1.241 ms | 0.013 ms |
| Output | 1.427 ms | 0.065 ms |
| Parity check | 0.151 ms | 0.012 ms |

## Chromium Baseline

The test-only browser harness loads the three binary preprocess inputs, runs
the same preprocess protocol in Chromium, compares the output byte-for-byte
with the copied native output, and verifies the refreshed native proof using
the browser-generated preprocess.

```sh
npm run preprocess:browser:check
```

Native parity and verifier acceptance passed. The former browser timing is
invalid and has been removed.

## Candidate: Permutation Grid Construction

Run each mode in an isolated process:

```sh
npm run preprocess:bench:permutation-grid -- --mode baseline
npm run preprocess:bench:permutation-grid -- --mode row-template
npm run preprocess:bench:permutation-grid -- --mode wasm-kernel
```

Each mode checks parity and measures evaluation-grid construction without
inverse NTT.

| Mode | Samples | Mean | Population standard deviation | Peak RSS |
| --- | --- | ---: | ---: | ---: |
| Current element copy | 13.014, 13.594, 10.894 ms | 12.501 ms | 1.161 ms | 569.95 MiB |
| Row-template doubling copy | 5.957, 6.562, 4.729 ms | 5.749 ms | 0.763 ms | 550.92 MiB |
| Test-only WASM kernel | 9.238, 7.988, 5.683 ms | 7.636 ms | 1.473 ms | 752.39 MiB |

All modes matched byte-for-byte. Row-template reduced mean grid-construction
time by 54.0% and the WASM kernel reduced it by 38.9% relative to the current
implementation. No candidate is promoted by this report.

## Candidate: Combined Inverse NTT

Run each mode in an isolated process:

```sh
npm run preprocess:bench:inverse-ntt -- --mode sequential
npm run preprocess:bench:inverse-ntt -- --mode combined
```

The combined mode concatenates the two 4096-by-256 evaluation buffers and
submits one batched transform for each dimension. Both modes passed byte
parity.

| Mode | Samples | Mean | Population standard deviation | Peak RSS |
| --- | --- | ---: | ---: | ---: |
| Sequential | 694.584, 690.825, 697.761 ms | 694.390 ms | 2.835 ms | 1.628 GiB |
| Combined | 675.362, 710.348, 706.598 ms | 697.436 ms | 15.683 ms | 2.075 GiB |

Combined scheduling was 0.44% slower by mean and had higher peak RSS in these
three measurements. No candidate is promoted or rejected by this report.

## Candidate: Sigma1 Encoding Dispatch

The adaptive and known-dense paths passed commitment parity. All prior
performance measurements were replaced by the following independent-process
measurements:

```sh
npm run preprocess:bench:sigma1-encoding -- --mode known-dense
npm run preprocess:bench:sigma1-encoding -- --mode adaptive
```

| Mode | Samples | Mean | Population standard deviation | Mean peak RSS |
| --- | --- | ---: | ---: | ---: |
| Known dense | 5,010.365, 5,005.995, 5,003.554 ms | 5,006.638 ms | 2.817 ms | 2.978 GiB |
| Adaptive | 5,027.766, 4,986.509, 5,008.183 ms | 5,007.486 ms | 16.850 ms | 2.943 GiB |

The measured mean-time difference is 0.017%. No candidate is promoted or
rejected by this report.

## Candidate: MSM Scheduling

Run each mode in an independent process:

```sh
npm run preprocess:bench:msm-scheduling -- --mode sequential
npm run preprocess:bench:msm-scheduling -- --mode concurrent
```

Each measurement commits both actual permutation polynomials and checks both
points against the native preprocess output.

| Mode | Samples | Mean | Population standard deviation | Mean peak RSS |
| --- | --- | ---: | ---: | ---: |
| Sequential | 10,004.830, 9,979.773, 10,038.567 ms | 10,007.723 ms | 24.090 ms | 3.107 GiB |
| Concurrent | 7,780.866, 7,777.495, 7,770.412 ms | 7,776.258 ms | 4.357 ms | 3.111 GiB |

Concurrent scheduling reduced mean time by 22.30%. Mean peak RSS differed by
0.004 GiB. No candidate is promoted or rejected by this report.

## Candidate: Dense MSM Chunk Size

Run each exponent in an independent process:

```sh
npm run preprocess:bench:chunk-size -- --chunk-size-exponent <10..19>
```

Each measurement sequentially commits both actual permutation polynomials,
matching current production scheduling, and checks both points against the
native preprocess output. `Temporary` is the largest raw-scalar conversion
buffer directly controlled by the chunk loop; it excludes allocations internal
to ffjavascript.

| Exponent | Points | Operation mean | Population standard deviation | Process-wall mean | Population standard deviation | Temporary | Mean peak RSS | Population standard deviation |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 1,024 | 19,423.611 ms | 74.437 ms | 20,426.799 ms | 76.541 ms | 0.031 MiB | 1.729 GiB | 0.046 GiB |
| 11 | 2,048 | 16,056.511 ms | 33.339 ms | 17,061.812 ms | 24.150 ms | 0.063 MiB | 1.715 GiB | 0.038 GiB |
| 12 | 4,096 | 14,623.046 ms | 58.824 ms | 15,635.364 ms | 70.087 ms | 0.125 MiB | 1.657 GiB | 0.095 GiB |
| 13 | 8,192 | 13,017.604 ms | 37.498 ms | 14,024.786 ms | 33.194 ms | 0.250 MiB | 1.820 GiB | 0.017 GiB |
| 14 | 16,384 | 11,624.481 ms | 9.512 ms | 12,627.164 ms | 13.284 ms | 0.500 MiB | 1.860 GiB | 0.035 GiB |
| 15 | 32,768 | 11,092.939 ms | 31.153 ms | 12,104.170 ms | 25.349 ms | 1.000 MiB | 1.890 GiB | 0.086 GiB |
| 16 | 65,536 | 10,823.879 ms | 22.226 ms | 11,832.770 ms | 5.585 ms | 2.000 MiB | 1.978 GiB | 0.033 GiB |
| 17 | 131,072 | 10,100.591 ms | 43.636 ms | 11,113.605 ms | 29.999 ms | 4.000 MiB | 2.269 GiB | 0.052 GiB |
| 18 | 262,144 | 10,117.265 ms | 19.183 ms | 11,121.117 ms | 19.036 ms | 8.000 MiB | 3.077 GiB | 0.040 GiB |
| 19 | 524,288 | 10,152.030 ms | 43.690 ms | 11,168.164 ms | 45.439 ms | 16.000 MiB | 4.678 GiB | 0.053 GiB |

All 30 measurements passed commitment parity. Exponent 17 had the lowest
operation mean. It was 16.674 ms faster than the current exponent-18 default
and used 0.808 GiB less mean peak RSS. No chunk size is promoted by this
report.

## Candidate: `O_pub_fix` Input Preparation

Run each mode in an independent process:

```sh
npm run preprocess:bench:o-pub-fix -- --mode copied-elementwise
npm run preprocess:bench:o-pub-fix -- --mode zero-copy-batch
```

Both modes use the same 600 points, scalars, and `msmAffineRaw` operation. The
copied-elementwise mode copies each base into a new contiguous buffer and
converts each scalar separately. The zero-copy-batch mode passes the compact
CRS base section directly and converts the complete Montgomery scalar buffer
once.

| Mode | Samples | Operation mean | Population standard deviation | Process-wall mean | Population standard deviation | Controlled temporary | Mean peak RSS |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Copied, elementwise conversion | 3.037, 3.138, 3.301 ms | 3.159 ms | 0.109 ms | 252.180 ms | 1.788 ms | 75.00 KiB | 571.93 MiB |
| Zero-copy, batch conversion | 3.490, 3.388, 3.518 ms | 3.465 ms | 0.056 ms | 253.730 ms | 3.420 ms | 18.75 KiB | 577.37 MiB |

Zero-copy batch preparation was 0.306 ms slower by operation mean for this
600-point input and reduced directly controlled temporary storage by
56.25 KiB. Process peak RSS is dominated by runtime installation and does not
resolve that small allocation difference. No candidate is promoted or rejected
by this report.

## Complete Pipeline Comparison

Run each Node.js mode in an independent process:

```sh
npm run preprocess:bench:pipeline -- --mode current
npm run preprocess:bench:pipeline -- --mode speed-candidate
```

The test-only speed candidate combines the independently measured
lowest-operation-mean choices:

- row-template permutation-grid initialization;
- the current sequential inverse NTT;
- known-dense Sigma1 dispatch;
- concurrent `s0` and `s1` commitments;
- chunk exponent 17;
- copied bases with elementwise scalar conversion for `O_pub_fix`.

| Mode | Preprocess samples | Preprocess mean | Population standard deviation | Process-wall mean | Population standard deviation | Mean peak RSS | Population standard deviation |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Current | 10,783.064, 10,792.863, 10,888.042 ms | 10,821.323 ms | 47.347 ms | 11,066.985 ms | 48.947 ms | 3.022 GiB | 0.029 GiB |
| Test-only speed candidate | 8,893.106, 9,253.949, 9,955.402 ms | 9,367.485 ms | 441.049 ms | 9,682.638 ms | 535.095 ms | 2.356 GiB | 0.042 GiB |

The candidate reduced Node.js preprocess mean by 1,453.837 ms (13.43%),
process-wall mean by 1,384.348 ms (12.51%), and mean peak RSS by 0.665 GiB
(22.01%). Every run matched the native preprocess output.

Run the Chromium comparison with:

```sh
npm run preprocess:bench:pipeline:browser -- --mode current
npm run preprocess:bench:pipeline:browser -- --mode speed-candidate
```

| Mode | Samples | Mean | Population standard deviation | Native parity | Verifier accepted | OOM |
| --- | --- | ---: | ---: | --- | --- | --- |
| Current | 11,085.620, 10,935.520, 11,083.170 ms | 11,034.770 ms | 70.187 ms | 3/3 | 3/3 | 0/3 |
| Test-only speed candidate | 8,874.800, 9,010.200, 9,032.500 ms | 8,972.500 ms | 69.682 ms | 3/3 | 3/3 | 0/3 |

The candidate reduced Chromium preprocess mean by 2,062.270 ms (18.69%).
This report does not authorize production promotion.
