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
- a 21,072,880-byte `witness.bin`.

The selection benchmark ran each case in a fresh Node process, and the runner
sampled the RSS sum of that process and all ffjavascript descendants.

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
| Convert | Retained per-field arrays plus concatenation | 1007.05 ms | 669.61 MiB |
| Convert | Direct final-buffer writes | 932.46 ms | 544.08 MiB |
| Load | 658,454 retained field views | 44.24 ms | 521.42 MiB |
| Load | Flat field buffer plus offsets | 0.10 ms | 423.12 MiB |

Direct conversion was 7.4% faster and reduced peak RSS by about 126 MiB. Flat
loading removed 658,453 retained variable views, removed 234 retained
per-placement variable arrays, and reduced peak RSS by about 98 MiB.

## Parity

The direct converter output matched the complete existing `witness.bin`
byte-for-byte. Baseline and flat loaders reported the same placement and
variable counts. A complete ordered traversal over all placement IDs and the
first and last byte of every field element produced the same checksum
(`69,544,477`).

## Production Promotion

Both candidates were promoted together. The converter now validates source
records without retaining converted field-element arrays and writes directly
into the final field section. The prover retains one field buffer, one
subcircuit-ID table, and one placement-offset table. Protocol and commitment
consumers create only short-lived element views at access sites.

The binary input name, three-section layout, section encodings, field
representation, and public converter input are unchanged. Candidate-only
implementations and benchmark commands were removed after promotion.

The post-promotion fixed-taxonomy run completed with `119.40 s` total wall,
`114.92 s` prover-stage total, `2.70 s` init, and `1.59 s` binding encode. The
immediately preceding accepted run was `119.41 s` total wall, `114.92 s`
prover-stage total, `2.73 s` init, and `1.59 s` binding encode, so no material
prover-time regression was observed.

Production and development type checks, binary format checks, witness
polynomial checks, native testing-mode invariants, Node proof generation and
verifier acceptance, and Chromium proof generation (`120.57 s`) and
verification (`20 ms`) passed.
