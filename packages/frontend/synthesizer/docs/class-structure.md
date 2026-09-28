> Internal reference note: This document is maintained as a secondary repository reference. Start with `docs/README.md`, `docs/architecture.md`, or `docs/maintainer-guide.md` for the canonical maintainer entrypoints.

# Synthesizer Class Structure

This document summarizes the main classes and modules in the current split workspace.

## Shared runtime classes

- **Synthesizer** (`core/src/synthesizer/synthesizer.ts`)
  - orchestrates opcode tracing
  - subscribes to EVM lifecycle events
  - exposes `synthesizeTX()`
- **ContextManager** (`core/src/synthesizer/runtime/contextManager.ts`)
  - owns storage and log caches, initial storage reads, call frames, and memory context
  - restores frame-scoped state after reverted calls
- **PlacementManager** (`core/src/synthesizer/runtime/placementManager.ts`)
  - owns circuit placements and reserved buffer placements
  - appends symbolic buffer wires and validates placement connections
- **InstructionHandler** (`core/src/synthesizer/runtime/instructionHandler.ts`)
  - dispatches opcode handling
  - coordinates arithmetic, memory, and storage flows
- **Subcircuit output operations** (`core/src/subcircuit/subcircuitOutputOperations.ts`)
  - provides the library-owned host output calculation function for composition subcircuits

## Shared circuit generation

- **`createCircuitGenerator`** (`core/src/circuitGenerator/circuitGenerator.ts`)
  - builds the circuit-generation result from placement variables and the shared library
- **VariableGenerator** (`core/src/circuitGenerator/generators/variableGenerator.ts`)
  - produces placement variables and public instances
- **PermutationGenerator** (`core/src/circuitGenerator/generators/permutationGenerator.ts`)
  - produces wire-equality permutations

## Adapter modules

- **Node CLI adapter** (`node-cli/src/cli/index.ts`)
  - reads JSON files
  - loads installed subcircuit WASM
  - calls shared synthesis flow
  - writes output files
- **Debug config adapter** (`examples/config-runner.ts`)
  - builds execution inputs from config files and RPC state
- **Node subcircuit adapter** (`node-cli/src/subcircuit/*`)
  - resolves installed subcircuit metadata
  - loads WASM from the installed package
- **Web input adapter** (`web-app/src/input/index.ts`)
  - loads inputs from `Blob` or URL
- **Web subcircuit adapter** (`web-app/src/subcircuit/index.ts`)
  - prepares synthesis input with the bundled subcircuit library
- **Web output adapter** (`web-app/src/output/index.ts`)
  - creates downloads or JSON POST payloads

## Intentional rule

Adapters may prepare inputs and outputs, but only `core/` owns synthesis flow and circuit generation.
