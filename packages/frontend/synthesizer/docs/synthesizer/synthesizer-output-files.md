# Synthesizer Output Files

The shared synthesis result is serialized by `core/src/app/output.ts`. The Node package writes those JSON files through `node-cli/src/io/jsonWriter.ts`, while the web package turns them into download `Blob`s or JSON payloads.

## placementVariables.json
- Full witness for every placement.
- Built by `VariableGenerator._generatePlacementVariables` after:
  - Removing unused EVM_IN wires.
  - Splitting 256-bit words into two 128-bit limbs for Circom compatibility.
  - Running WASM subcircuit witnesses (from the qap-compiler outputs) to validate outputs.
- Contains `subcircuitId`, `variables` array, and `instanceList` descriptions for each placement.

## instance.json
- Public/private instance split derived from `placementVariables`.
- `a_pub_user`, `a_pub_block`, and `a_pub_function` segments follow the resolved setup parameters from the shared subcircuit library context.
- Values are hex strings aligned with the global wire list.

## instance_description.json
- Mirrors `instance.json` but contains human-readable descriptions for each public wire, pulled from `instanceList` data.

## permutation.json
- Equality constraints between wires across placements.
- `PermutationGenerator` groups wires that share the same value and emits N-entry cycles: `{ row, col, X, Y }` mapping `(wireIndex, placementId)` pairs.
- Validated against placement variables to ensure every equality holds; the run fails if mismatches are found.
