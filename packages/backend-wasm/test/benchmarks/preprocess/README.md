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

## Recorded Baseline

Measured on:

- Apple M4 Pro, 14 cores (10 performance and 4 efficiency);
- 48 GB unified memory;
- macOS 26.5.2 (`25F84`);
- Node.js 26.0.0, arm64;
- chunk size `2^18 = 262,144` points.

Each run used a new Node.js process. All three runs passed native-output
parity.

| Run | Preprocess | Process wall | Peak RSS |
| ---: | ---: | ---: | ---: |
| 1 | 10,866.626 ms | 11,117.008 ms | 3.149 GiB |
| 2 | 10,886.429 ms | 11,141.061 ms | 3.128 GiB |
| 3 | 11,101.066 ms | 11,359.171 ms | 3.140 GiB |
| Median | 10,886.429 ms | 11,141.061 ms | 3.140 GiB |

Median exclusive stage timing:

| Stage | Time |
| --- | ---: |
| Fixture read | 20.981 ms |
| Runtime install | 233.425 ms |
| Input decode | 0.659 ms |
| Permutation polynomials | 768.299 ms |
| `s0` commitment | 5,034.884 ms |
| `s1` commitment | 5,119.190 ms |
| `O_pub_fix` | 1.318 ms |
| Output | 1.461 ms |
| Parity check | 0.152 ms |

The two dense polynomial commitments account for approximately 93.3% of
preprocess time. This measurement is the comparison baseline only; it does not
authorize production promotion of any optimization candidate.

## Chromium Baseline

The test-only browser harness loads the three binary preprocess inputs, runs
the same preprocess protocol in Chromium, compares the output byte-for-byte
with the copied native output, and verifies the refreshed native proof using
the browser-generated preprocess.

```sh
npm run preprocess:browser:check
```

On the recorded Apple M4 Pro environment, the browser preprocess call took
11,060.105 ms. Native parity and verifier acceptance both passed.

## Candidate: Permutation Grid Construction

Run each mode in an isolated process:

```sh
npm run preprocess:bench:permutation-grid -- --mode baseline
npm run preprocess:bench:permutation-grid -- --mode row-template
npm run preprocess:bench:permutation-grid -- --mode wasm-kernel
```

Each mode performs one parity warm-up followed by five measured evaluation-grid
constructions. Inverse NTT is intentionally excluded.

| Mode | Median | Change | Peak RSS |
| --- | ---: | ---: | ---: |
| Current element copy | 16.817 ms | baseline | 559.03 MiB |
| Row-template doubling copy | 6.790 ms | -59.6% | 574.52 MiB |
| Test-only WASM kernel | 7.925 ms | -52.9% | 744.22 MiB |

All outputs matched the current implementation. Row-template construction is
the fastest candidate, but it saves only about 10 ms against a 10.886-second
preprocess baseline. The WASM kernel adds Worker transfer and allocation cost
and has the highest observed peak RSS. Neither candidate is promoted by this
benchmark.
