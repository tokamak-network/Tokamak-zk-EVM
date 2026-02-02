# Synthesizer Documentation

Tokamak zk-EVM Synthesizer interprets an Ethereum transaction with a Tokamak L2 state manager, records opcode-level circuit placements, and produces the inputs required by the zk-SNARK backend. The documents below reflect the current TypeScript sources in `packages/frontend/synthesizer`.

**Document map**

- [Concepts](./synthesizer-concepts.md) – What the synthesizer builds and how it uses the subcircuit library
- [Terminology](./synthesizer-terminology.md) – Quick glossary for placements, buffers, proofs, and outputs
- [Execution Flow](./synthesizer-execution-flow.md) – Step-by-step run from RPC fetch to circuit files
- [Transaction Flow](./synthesizer-transaction-flow.md) – What happens while the VM executes opcodes
- [Architecture](./synthesizer-architecture.md) – Components and how they fit together
- [Class Structure](./synthesizer-class-structure.md) – Key classes and responsibilities
- [Data Structures](./synthesizer-data-structure.md) – DataPt, MemoryPts, StackPt, and caches
- [Output Files](./synthesizer-output-files.md) – placementVariables, instance, and permutation formats
- [Opcodes](./synthesizer-opcodes.md) – Supported opcode set and caveats
- [Code Examples](./synthesizer-code-examples.md) – CLI and programmatic usage
- [Repository Structure](./synthesizer-repository-structure.md) – What lives where in this package
