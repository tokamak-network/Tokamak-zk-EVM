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

## Pre-Reboot Final Chunk-Size Benchmark

This historical series was run only after preprocess had been restored to the
settled prover polynomial and MSM methods. It changes only
`preprocess.install({ chunkSizeExponent })`; it does not compare alternate
algorithms or scheduling. The post-reboot investigation below proved that the
system was in a degraded execution state. These observations are retained for
audit history but are invalid for selecting the default exponent.

Run the complete resumable suite with:

```sh
npm run preprocess:bench:chunk-size:final
```

Environment: Apple M4 Pro, 14 logical CPUs, 48 GiB RAM, Darwin 25.5.0 arm64,
Node.js 26.0.0, and Chrome for Testing 149.0.7827.55. Source identity:
`45470f343328acfdaa13484cefb06291378d264f789b284d052099775ead8603`.

Each exponent was measured exactly three times in independent Node.js
processes. `Preprocess` covers the complete public `preprocess()` call,
including binary input decoding, polynomial construction, all three
commitments, and output serialization.

| Exponent | Points | Preprocess samples | Mean | Population SD | Mean peak RSS | Population SD |
| ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 10 | 1,024 | 27,391.873, 28,116.450, 28,100.275 ms | 27,869.533 ms | 337.821 ms | 1.775 GiB | 0.028 GiB |
| 11 | 2,048 | 24,856.100, 25,246.301, 25,998.962 ms | 25,367.121 ms | 474.329 ms | 1.753 GiB | 0.066 GiB |
| 12 | 4,096 | 22,466.334, 24,339.167, 22,306.676 ms | 23,037.392 ms | 922.799 ms | 1.725 GiB | 0.062 GiB |
| 13 | 8,192 | 21,580.321, 21,359.054, 20,837.049 ms | 21,258.808 ms | 311.609 ms | 1.848 GiB | 0.057 GiB |
| 14 | 16,384 | 18,623.985, 18,338.495, 20,039.194 ms | 19,000.558 ms | 743.617 ms | 1.790 GiB | 0.033 GiB |
| 15 | 32,768 | 19,025.738, 17,751.212, 18,609.639 ms | 18,462.196 ms | 530.666 ms | 1.850 GiB | 0.061 GiB |
| 16 | 65,536 | 17,154.245, 17,001.957, 18,650.380 ms | 17,602.194 ms | 743.782 ms | 1.943 GiB | 0.009 GiB |
| 17 | 131,072 | 16,714.012, 15,735.778, 15,841.214 ms | 16,097.001 ms | 438.411 ms | 2.228 GiB | 0.044 GiB |
| 18 | 262,144 | 15,677.826, 14,874.739, 15,026.278 ms | 15,192.948 ms | 348.398 ms | 3.079 GiB | 0.052 GiB |
| 19 | 524,288 | 15,011.461, 14,926.623, 14,596.172 ms | 14,844.752 ms | 179.153 ms | 4.523 GiB | 0.110 GiB |

Each exponent was also measured exactly three times in a fresh Chromium
process. Every observation matched native preprocess output, made the verifier
accept the native proof, and completed without OOM.

| Exponent | Preprocess samples | Mean | Population SD | Native parity | Verifier accepted | OOM |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 10 | 27,938.000, 27,138.290, 27,646.740 ms | 27,574.343 ms | 330.469 ms | 3/3 | 3/3 | 0/3 |
| 11 | 23,457.185, 23,774.685, 23,465.080 ms | 23,565.650 ms | 147.845 ms | 3/3 | 3/3 | 0/3 |
| 12 | 21,250.290, 21,193.855, 21,182.295 ms | 21,208.813 ms | 29.706 ms | 3/3 | 3/3 | 0/3 |
| 13 | 18,653.830, 18,750.455, 18,594.200 ms | 18,666.162 ms | 64.384 ms | 3/3 | 3/3 | 0/3 |
| 14 | 17,404.900, 17,652.705, 17,599.225 ms | 17,552.277 ms | 106.474 ms | 3/3 | 3/3 | 0/3 |
| 15 | 16,593.840, 16,713.160, 16,576.270 ms | 16,627.757 ms | 60.814 ms | 3/3 | 3/3 | 0/3 |
| 16 | 15,809.485, 15,827.335, 15,812.810 ms | 15,816.543 ms | 7.751 ms | 3/3 | 3/3 | 0/3 |
| 17 | 14,772.440, 14,813.375, 14,835.625 ms | 14,807.147 ms | 26.168 ms | 3/3 | 3/3 | 0/3 |
| 18 | 14,412.570, 14,392.345, 14,427.720 ms | 14,410.878 ms | 14.491 ms | 3/3 | 3/3 | 0/3 |
| 19 | 14,613.800, 15,264.110, 14,815.490 ms | 14,897.800 ms | 271.793 ms | 3/3 | 3/3 | 0/3 |

Within this invalid series, exponent 19 had the lowest Node.js mean and
exponent 18 had the lowest Chromium mean. Neither result is selection evidence.

## Post-Reboot Baseline Regression Investigation

The final chunk-size run above reported `15,192.948 ms` for the current
exponent-18 Node.js path, while the earlier exclusive baseline reported
`10,746.700 ms`. The historical baseline commit and the current implementation
were therefore compared again after a system reboot.

The comparison fixed the following variables:

- historical implementation: commit `1a4817a87`;
- current implementation: commit `e50356505`;
- the same current runtime fixture files and dependency installation;
- Apple M4 Pro, 14 logical CPUs, 48 GiB RAM, Darwin 25.5.0 arm64, and
  Node.js 26.0.0;
- chunk exponent 18; and
- exactly three independent processes per implementation, interleaved in the
  order historical, current, current, historical, historical, current.

The source comparison found no changes to the curve runtime, field runtime,
two-dimensional inverse NTT, or ffjavascript primitive configuration. The
current commitment helper extracts the former loop without changing its
`batchFromMontgomeryBuffer`, `msmAffineRaw`, and partial-point-add sequence.
The other relevant changes are input index validation and the public API
lifecycle wrapper.

Exclusive Node.js results:

| Stage | Historical mean | Population SD | Current mean | Population SD | Current - historical |
| --- | ---: | ---: | ---: | ---: | ---: |
| Input decode | 0.694 ms | 0.037 ms | 0.792 ms | 0.011 ms | +0.097 ms |
| Permutation polynomials | 760.180 ms | 16.881 ms | 769.072 ms | 8.164 ms | +8.892 ms |
| `s0` commitment | 5,286.584 ms | 43.339 ms | 5,284.667 ms | 52.762 ms | -1.918 ms |
| `s1` commitment | 5,241.251 ms | 17.023 ms | 5,281.925 ms | 66.932 ms | +40.675 ms |
| `O_pub_fix` | 1.619 ms | 0.541 ms | 1.414 ms | 0.111 ms | -0.206 ms |
| Output | 1.493 ms | 0.086 ms | 1.647 ms | 0.116 ms | +0.154 ms |
| Preprocess | 11,291.821 ms | 56.820 ms | 11,339.517 ms | 92.484 ms | +47.695 ms |
| Process wall | 11,543.917 ms | 57.103 ms | 11,603.018 ms | 88.152 ms | +59.101 ms |
| Peak RSS | 3.143 GiB | 0.078 GiB | 3.223 GiB | 0.089 GiB | +0.080 GiB |

The current implementation was 0.42% slower at the preprocess boundary. That
difference is smaller than the observed current-run standard deviation and
does not reproduce the earlier multi-second gap. Commitment means remained
equivalent across the implementations.

Fresh Chromium processes produced the same result:

| Implementation | Samples | Mean | Population SD | Native parity | Verifier accepted |
| --- | --- | ---: | ---: | ---: | ---: |
| Historical `1a4817a87` | 10,799.370, 10,749.930, 10,756.235 ms | 10,768.512 ms | 21.971 ms | 3/3 | 3/3 |
| Current `e50356505` | 10,795.505, 10,786.040, 10,798.065 ms | 10,793.203 ms | 5.172 ms | 3/3 | 3/3 |

The current browser path differed by 24.692 ms, or 0.23%.

Finally, the exact current Node.js public-API chunk-size path that had produced
the `15,192.948 ms` result was repeated three times after reboot:

| Samples | Mean | Population SD | Process-wall mean | Population SD | Mean peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10,768.517, 10,803.796, 10,795.299 ms | 10,789.204 ms | 15.034 ms | 11,036.553 ms | 17.396 ms | 3.160 GiB |

No source, fixture, dependency, or hardware change separates the pre-reboot
and post-reboot current-path measurements. The post-reboot mean is
`4,403.744 ms` (28.99%) lower. The earlier 15-second Node.js and 14.4-second
Chromium observations therefore reflect degraded system execution state, not
a reproducible preprocess implementation regression. The exact external
system condition was not identified and must not be attributed to a specific
cause without separate evidence.

## Post-Reboot Final Chunk-Size Benchmark

The complete supported range was measured again after reboot on source identity
`802c5ef0e35b1d6226392179c8d97176deb06e5ca943b13840225ca32dd22ea8`.
The environment was Apple M4 Pro, 14 logical CPUs, 48 GiB RAM, Darwin 25.5.0
arm64, Node.js 26.0.0, and Chrome for Testing 149.0.7827.55. Every
environment/exponent pair used exactly three fresh processes.

Node.js results:

| Exponent | Points | Preprocess samples | Mean | Population SD | Mean peak RSS | Population SD |
| ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 10 | 1,024 | 19,915.078, 20,414.537, 20,321.005 ms | 20,216.873 ms | 216.791 ms | 1.687 GiB | 0.022 GiB |
| 11 | 2,048 | 16,972.291, 17,452.252, 16,952.061 ms | 17,125.534 ms | 231.172 ms | 1.680 GiB | 0.051 GiB |
| 12 | 4,096 | 15,724.405, 15,549.530, 15,543.113 ms | 15,605.683 ms | 83.990 ms | 1.725 GiB | 0.068 GiB |
| 13 | 8,192 | 13,881.641, 13,757.420, 13,786.071 ms | 13,808.378 ms | 53.109 ms | 1.787 GiB | 0.071 GiB |
| 14 | 16,384 | 12,474.747, 12,377.736, 12,369.387 ms | 12,407.290 ms | 47.821 ms | 1.756 GiB | 0.084 GiB |
| 15 | 32,768 | 11,879.061, 11,943.908, 11,930.815 ms | 11,917.928 ms | 27.998 ms | 1.884 GiB | 0.020 GiB |
| 16 | 65,536 | 11,648.883, 11,676.822, 11,638.647 ms | 11,654.784 ms | 16.134 ms | 1.961 GiB | 0.025 GiB |
| 17 | 131,072 | 10,803.429, 10,869.349, 10,901.471 ms | 10,858.083 ms | 40.811 ms | 2.270 GiB | 0.071 GiB |
| 18 | 262,144 | 10,926.777, 10,951.599, 10,907.475 ms | 10,928.617 ms | 18.061 ms | 3.129 GiB | 0.049 GiB |
| 19 | 524,288 | 10,929.729, 10,851.030, 10,988.074 ms | 10,922.944 ms | 56.153 ms | 4.813 GiB | 0.107 GiB |

Chromium results:

| Exponent | Preprocess samples | Mean | Population SD | Native parity | Verifier accepted | OOM |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 10 | 20,381.605, 20,293.650, 20,308.110 ms | 20,327.788 ms | 38.509 ms | 3/3 | 3/3 | 0/3 |
| 11 | 17,136.875, 17,133.050, 17,275.525 ms | 17,181.817 ms | 66.280 ms | 3/3 | 3/3 | 0/3 |
| 12 | 15,512.380, 15,561.665, 15,578.690 ms | 15,550.912 ms | 28.119 ms | 3/3 | 3/3 | 0/3 |
| 13 | 13,774.115, 13,917.765, 13,810.690 ms | 13,834.190 ms | 60.954 ms | 3/3 | 3/3 | 0/3 |
| 14 | 12,574.725, 12,575.430, 12,551.620 ms | 12,567.258 ms | 11.062 ms | 3/3 | 3/3 | 0/3 |
| 15 | 11,940.375, 11,954.330, 12,004.775 ms | 11,966.493 ms | 27.662 ms | 3/3 | 3/3 | 0/3 |
| 16 | 11,720.440, 11,742.895, 11,692.710 ms | 11,718.682 ms | 20.526 ms | 3/3 | 3/3 | 0/3 |
| 17 | 10,940.095, 10,933.850, 10,953.025 ms | 10,942.323 ms | 7.985 ms | 3/3 | 3/3 | 0/3 |
| 18 | 11,068.150, 11,003.740, 10,977.945 ms | 11,016.612 ms | 37.934 ms | 3/3 | 3/3 | 0/3 |
| 19 | 11,034.160, 11,029.655, 10,991.915 ms | 11,018.577 ms | 18.942 ms | 3/3 | 3/3 | 0/3 |

All 60 observations passed native parity. All 30 Chromium observations passed
verifier acceptance and none produced an OOM.

Exponent 17 had the lowest mean in both environments. Relative to exponent 18,
it was 70.534 ms faster in Node.js and 74.288 ms faster in Chromium, while
using 0.859 GiB less mean Node peak RSS. Relative to exponent 19, it was
64.861 ms faster in Node.js and 76.253 ms faster in Chromium, while using
2.543 GiB less mean Node peak RSS. The benchmark therefore presents no measured
speed-versus-memory tradeoff among exponents 17, 18, and 19: exponent 17 has
both the lowest mean time and the lowest peak RSS of those candidates.

The owner must select the final default. This report records evidence and does
not promote an exponent automatically.

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
npm run preprocess:bench:pipeline -- --mode legacy-baseline
npm run preprocess:bench:pipeline -- --mode selected-candidate
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
npm run preprocess:bench:pipeline:browser -- --mode legacy-baseline
npm run preprocess:bench:pipeline:browser -- --mode selected-candidate
```

| Mode | Samples | Mean | Population standard deviation | Native parity | Verifier accepted | OOM |
| --- | --- | ---: | ---: | --- | --- | --- |
| Current | 11,085.620, 10,935.520, 11,083.170 ms | 11,034.770 ms | 70.187 ms | 3/3 | 3/3 | 0/3 |
| Test-only speed candidate | 8,874.800, 9,010.200, 9,032.500 ms | 8,972.500 ms | 69.682 ms | 3/3 | 3/3 | 0/3 |

The candidate reduced Chromium preprocess mean by 2,062.270 ms (18.69%).
This report does not authorize production promotion.

## Superseded Production Selection

The former complete speed-candidate selection was revoked. It independently
changed settled prover behavior and is not the current production policy.
Production preprocess now uses the shared prover permutation-polynomial,
batched two-dimensional inverse-NTT, batch Montgomery conversion, affine MSM,
and sequential commitment-call paths. Exponent 18 is provisional until the
owner selects the final default from the benchmark above.

The superseded evaluation recorded the following decisions. They are retained
only as historical context and do not govern current production behavior:

| Superseded decision | Historical rationale |
| --- | --- |
| Element-copy permutation grid | Row-template reduced the independent operation mean by 54.0%. |
| Test-only permutation WASM kernel | It was slower and used more peak memory than row-template. |
| Combined inverse NTT | It was 0.44% slower by mean and had higher peak RSS. |
| Adaptive Sigma1 dispatch | The dense input is known by protocol construction and adaptive dispatch was 0.017% slower by mean. |
| Sequential `s0`/`s1` commitments | Retained because preprocess must follow the settled prover call path. |
| Default chunk exponent 18 | Provisional pending the final production benchmark decision. |
| Zero-copy batch `O_pub_fix` preparation | Retained because preprocess must follow the settled prover batch-conversion path. |

The retained comparison modes are named `legacy-baseline` and
`selected-candidate`:

```sh
npm run preprocess:bench:pipeline -- --mode legacy-baseline
npm run preprocess:bench:pipeline -- --mode selected-candidate
npm run preprocess:bench:pipeline:browser -- --mode legacy-baseline
npm run preprocess:bench:pipeline:browser -- --mode selected-candidate
```

The normal Chromium correctness check uses the production public API:

```sh
npm run preprocess:browser:check
```
