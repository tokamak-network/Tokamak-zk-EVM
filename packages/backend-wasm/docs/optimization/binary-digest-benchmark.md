# Binary Digest Memory Benchmark

## Audience

This report is for backend-wasm maintainers deciding whether to replace the
current WebCrypto binary-artifact digest path.

## Question

The production self-digest path first copies the complete artifact while
zeroing self-digest payloads, then `sha256()` copies that result again before
passing it to WebCrypto. Section digests make one section-sized copy.

The candidate uses the existing `@noble/hashes` incremental SHA-256
implementation. It hashes views before and after each self-digest payload and a
shared 32-byte zero segment, so it does not allocate artifact-sized digest
inputs.

## Method

Temporary benchmark implementations live under
`test/benchmarks/binary-digest`. The benchmark:

- checks exact digest parity for subarray-backed input, multiple self-digest
  entries, truncated digest payloads, and malformed digest-table boundaries;
- checks exact self-digest and largest-section digest parity on the real
  `fixtures/small/runtime/prover-crs.bin`;
- measures one production baseline and one incremental candidate run after
  warm-up;
- excludes the retained artifact input from reported memory deltas;
- records Node `process.memoryUsage()` peaks and Chromium
  `performance.memory.usedJSHeapSize` peaks.

Chromium exposed `measureUserAgentSpecificMemory()` but rejected its use in the
headless benchmark context, so the run used
`performance.memory.usedJSHeapSize` with precise memory information enabled.

Commands:

```sh
npm run benchmark:binary-digest:node
npm run benchmark:binary-digest:browser
```

Artifact and section:

| Input | Bytes |
| --- | ---: |
| Prover CRS artifact | 1,038,338,352 |
| `sigma1.delta-inv-li-o-prv` | 534,945,792 |

## Results

### Self Digest

| Runtime | Technique | Wall time | Additional peak memory |
| --- | --- | ---: | ---: |
| Node | Production WebCrypto | 373.95 ms | 1.934 GiB ArrayBuffer |
| Node | Incremental candidate | 3,496.21 ms | 64 B ArrayBuffer |
| Chromium | Production WebCrypto | 528.75 ms | 1.934 GiB JS heap |
| Chromium | Incremental candidate | 4,366.60 ms | 43.34 KiB JS heap |

The candidate was 9.35 times slower in Node and 8.26 times slower in Chromium.

### Largest Section Digest

| Runtime | Technique | Wall time | Additional peak memory |
| --- | --- | ---: | ---: |
| Node | Production WebCrypto | 198.65 ms | 510.16 MiB ArrayBuffer |
| Node | Incremental candidate | 1,803.81 ms | 64 B ArrayBuffer |
| Chromium | Production WebCrypto | 222.59 ms | 510.17 MiB JS heap |
| Chromium | Incremental candidate | 2,256.89 ms | 0 B observed JS heap |

The candidate was 9.08 times slower in Node and 10.14 times slower in Chromium.

## Conclusion

The incremental candidate preserves exact SHA-256 output and removes the
artifact-sized transient copies. It also imposes an 8.26-10.14 times hashing
time penalty because the SHA-256 compression work moves from native WebCrypto
to JavaScript.

This is a measured time-versus-memory tradeoff, not an unconditional production
winner. Keep the production WebCrypto path unchanged until the Priority 4
promotion decision explicitly chooses whether eliminating up to approximately
1.93 GiB of self-digest transient memory justifies the additional browser
conversion time.
