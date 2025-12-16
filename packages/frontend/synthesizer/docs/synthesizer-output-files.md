# Synthesizer Output Files

`CircuitGenerator.writeOutputs()` produces four JSON artifacts. By default they are written to `outputs/` (or to a custom directory passed to `writeOutputs`, which the CLI sets to `examples/outputs`).

## placementVariables.json
- Full witness for every placement.
- Built by `VariableGenerator._generatePlacementVariables` after:
  - Removing unused EVM_IN wires.
  - Splitting 256-bit words into two 128-bit limbs for Circom compatibility.
  - Running WASM subcircuit witnesses (from the qap-compiler outputs) to validate outputs.
- Contains `subcircuitId`, `variables` array, and `instanceList` descriptions for each placement.

## instance.json
- Public/private instance split derived from `placementVariables`.
- `a_pub_user`, `a_pub_block`, and `a_pub_function` segments follow `setupParams` in `interface/qapCompiler/importedConstants.ts`.
- Values are hex strings aligned with the global wire list.

## instance_description.json
- Mirrors `instance.json` but contains human-readable descriptions for each public wire, pulled from `instanceList` data.

## permutation.json
- Equality constraints between wires across placements.
- `PermutationGenerator` groups wires that share the same value and emits N-entry cycles: `{ row, col, X, Y }` mapping `(wireIndex, placementId)` pairs.
- Validated against placement variables to ensure every equality holds; the run fails if mismatches are found.
