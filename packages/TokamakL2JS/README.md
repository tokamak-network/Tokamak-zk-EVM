## TokamakL2JS

TypeScript libraries for Tokamak zk-EVM channels: Poseidon hashing, EDDSA utilities, Tokamak L2 transactions, and a Poseidon-backed state manager.

### Packages it relies on
- `@tokamak-zk-evm/utilsjs` for qap-compiler helpers
- `@tokamak-zk-evm/qap-compiler` via utils
- `@ethereumjs/*` (tx, util, common, statemanager)
- `@noble/curves` for Jubjub EDDSA
- `@tokamak-zk-evm/synthesizer` (typed constants and params)

### Develop
Install from repo root to link workspaces, then build utils and this package:
```sh
npm install
cd packages/utils && npm run build
cd ../TokamakL2JS && npm run build
```

### Usage (from another workspace package)
```ts
import { poseidon, TokamakL2Tx, createTokamakL2Tx, TokamakL2StateManager } from '@tokamak-zk-evm/tokamak-l2js'
```

### Notes
- Sources are exported directly (`src/index.ts`) for local workspace consumption. If you need published artifacts, run `npm run build` and point consumers at `dist/*` as needed.
- Builds emit declarations only; runtime code is authored in TypeScript.
