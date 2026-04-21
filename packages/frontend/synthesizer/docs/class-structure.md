> Internal reference note: This document is maintained as a secondary repository reference. Start with `docs/README.md`, `docs/architecture.md`, or `docs/maintainer-guide.md` for the canonical maintainer entrypoints.

# Synthesizer Class Structure

This document summarizes the main classes and modules in the current split workspace.

## Shared runtime classes

- **Synthesizer** (`core/src/synthesizer/synthesizer.ts`)
  - orchestrates opcode tracing
  - subscribes to EVM lifecycle events
  - exposes `synthesizeTX()`
- **StateManager** (`core/src/synthesizer/handlers/stateManager.ts`)
  - owns placements, buffer placements, and subcircuit metadata
  - caches storage reads and writes
  - tracks symbolic stack and memory state
- **InstructionHandler** (`core/src/synthesizer/handlers/instructionHandler.ts`)
  - dispatches opcode handling
  - coordinates arithmetic, memory, and storage flows
- **BufferManager** (`core/src/synthesizer/handlers/bufferManager.ts`)
  - initializes reserved buffer placements
  - injects block, transaction, and Merkle-root inputs
- **ArithmeticManager** (`core/src/synthesizer/handlers/arithmeticManager.ts`)
  - maps arithmetic operations to subcircuits
- **MemoryManager** (`core/src/synthesizer/handlers/memoryManager.ts`)
  - resolves memory aliasing and copy semantics

## Shared circuit generation

- **CircuitGenerator** (`core/src/circuitGenerator/circuitGenerator.ts`)
  - wraps circuit artifact generation
- **VariableGenerator** (`core/src/circuitGenerator/handlers/variableGenerator.ts`)
  - produces placement variables and public instances
- **PermutationGenerator** (`core/src/circuitGenerator/handlers/permutationGenerator.ts`)
  - produces wire-equality permutations

## Adapter modules

- **Node CLI adapter** (`node-cli/src/cli/index.ts`)
  - reads JSON files
  - loads installed subcircuit WASM
  - calls shared synthesis flow
  - writes output files
- **Debug config adapter** (`node-cli/examples/config-runner.ts`)
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
