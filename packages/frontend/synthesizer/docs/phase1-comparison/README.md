**Phase 1 Comparison**
This directory prepares a single comparison range for the Phase 1 implementation.

Comparison baseline:
- `before`: `22ef8aa9` (`Document dual-target packaging plan`)
- `after`: `b52b1239` (`Remove phase 1 assertion leftovers`)

Prepared artifacts:
- [generated/phase1.diff](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM/packages/frontend/synthesizer/docs/phase1-comparison/generated/phase1.diff)
- [generated/phase1.stat](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM/packages/frontend/synthesizer/docs/phase1-comparison/generated/phase1.stat)
- [generated/phase1.files](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM/packages/frontend/synthesizer/docs/phase1-comparison/generated/phase1.files)
- [generated/phase1.range](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM/packages/frontend/synthesizer/docs/phase1-comparison/generated/phase1.range)

How to regenerate:
```bash
./scripts/export-phase1-comparison.sh
```

How to compare in one pass:
```bash
git diff 22ef8aa9..b52b1239 -- packages/frontend/synthesizer
```

How to review only the touched files:
```bash
cat docs/phase1-comparison/generated/phase1.files
```

How to review the summary first:
```bash
cat docs/phase1-comparison/generated/phase1.stat
```
