# Witness Conversion And Placement Loading Benchmark

## Audience

This report is for backend-wasm maintainers and performance engineers deciding
whether to use direct witness output buffers and a flat placement-variable
runtime representation.

## Scope

The benchmark uses the real copied placement source and current binary fixture:

- 234 placements;
- 658,454 field variables;
- a 27 MiB parsed JSON source file;
- a 21,073,000-byte `witness.bin`.

Production code is unchanged. Each case runs in a fresh Node process, and the
runner samples the RSS sum of that process and all ffjavascript descendants.

## Candidates

### Direct Conversion

The baseline validates and maps every source variable to a retained 32-byte
`Uint8Array`, then concatenates the 658,454 arrays into the section buffer.

The candidate:

1. validates placement records without copying their source variable arrays;
2. counts variables and writes IDs and offsets;
3. allocates the final field section once;
4. converts each field value directly into its final offset.

The binary format and public converter input remain unchanged.

### Flat Loading

The baseline creates and retains one `Uint8Array.subarray()` object per field
element and one variable array per placement.

The candidate retains:

- one contiguous field buffer view;
- one `Uint32Array` of subcircuit IDs;
- one `Uint32Array` of placement offsets.

A field value is exposed as a short-lived subarray only when a consumer accesses
it. The named `witness.bin` input and its section layout remain unchanged.

## Results

| Operation | Technique | Elapsed | Peak process-tree RSS |
| --- | --- | ---: | ---: |
| Convert | Retained per-field arrays plus concatenation | 991.50 ms | 706.92 MiB |
| Convert | Direct final-buffer writes | 914.74 ms | 563.58 MiB |
| Load | 658,454 retained field views | 38.89 ms | 521.05 MiB |
| Load | Flat field buffer plus offsets | 0.10 ms | 410.00 MiB |

Direct conversion was 7.7% faster and reduced peak RSS by about 143 MiB. Flat
loading removed 658,453 retained variable views, removed 234 retained
per-placement variable arrays, and reduced peak RSS by about 111 MiB.

## Parity

The direct converter output matched the complete existing `witness.bin`
byte-for-byte. Baseline and flat loaders reported the same placement and
variable counts. A complete ordered traversal over all placement IDs and the
first and last byte of every field element produced the same checksum
(`69,544,477`).

## Conclusion

Both candidates improve time and memory without changing the binary input
contract. The flat representation requires production consumer changes because
current prover loops index retained per-placement variable arrays. Promotion
must update those consumers together and run witness, commitment, testing-mode,
proof-parity, browser, and full timing checks.
