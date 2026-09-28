# Browser backend contributor guide

This guide is for repository contributors validating a local browser backend
build. Application developers should use the package README or the runnable
[`examples/browser`](../examples/browser) project.

From `packages/backend/wasm`, build and check a development package with:

```sh
BACKEND_WASM_VERIFIER_CRS_DIR=../rust/setup/output/crs npm run build:development
npm run typecheck:development
npm run typecheck:scripts
npm run binary:check
npm run univariate:domain:check
npm run univariate:relation:check
npm run univariate:polynomial:check
npm run univariate:transcript:check
```

To prepare local browser E2E inputs, first generate `selector.json` with the
Synthesizer and the four role-separated RKYV files with native trusted setup.
Then run:

```sh
npm run fixtures:copy
npm run fixtures:prepare
npm run prover:browser:check
```

Fixture preparation invokes only the native memory-mapped CRS converter. It
does not invoke setup, preprocessing, proving, or verification on behalf of
the contributor.
