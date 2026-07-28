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

The benchmark programs and fixture identities remain available for a future
rerun. No preprocess performance baseline is currently accepted.
This invalidation applies to the preprocess measurements only; it does not
alter separately recorded converter benchmarks.

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
