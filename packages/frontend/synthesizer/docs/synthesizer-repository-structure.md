# Synthesizer Repository Structure

Current layout of `packages/frontend/synthesizer/src`:

```
src/
├── cli/                         # Minimal CLI (run/info) for L2 state-channel simulation
├── interface/
│   ├── adapters/                # SynthesizerAdapter and utilities
│   ├── cli/                     # Interactive CLI (parse/synthesize/demo)
│   ├── debugging/               # Helper utilities
│   ├── qapCompiler/             # Subcircuit metadata and constants from qap-compiler
│   └── rpc/                     # RPC helpers to build SynthesizerOpts from L1 state
├── synthesizer/
│   ├── handlers/                # Buffer/Arithmetic/Memory/State/Instruction managers
│   ├── dataStructure/           # StackPt, MemoryPt, DataPt factory
│   ├── params/                  # Synthesizer constants (placements, defaults)
│   ├── types/                   # Shared types (buffers, placements, opcodes)
│   ├── constructors.ts          # createSynthesizer factory
│   ├── index.ts                 # Public exports
│   └── synthesizer.ts           # Core Synthesizer class and VM wiring
├── circuitGenerator/
│   ├── handlers/                # VariableGenerator, PermutationGenerator
│   ├── utils/                   # Witness calculator loader
│   └── circuitGenerator.ts      # Output writer facade
├── TokamakL2JS/                 # L2 crypto/state/tx helpers and state manager
└── unused/                      # Legacy/experimental code (not part of current pipeline)
```

Top-level supporting files:
- `package.json`, `tsconfig*.json`: build/test configuration.
- `examples/`: sample scripts and default output location used by CLI.
- `outputs/`: default output directory if no path is provided to `writeOutputs`.
- `doc/`: this documentation set.
