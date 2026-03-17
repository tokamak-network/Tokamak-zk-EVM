// Keep the TokamakL2JS source binding isolated here.
// The package-local vendor symlink points to the repository-root submodule.
// When Synthesizer switches to the published `tokamak-l2js` package,
// update this file instead of touching call sites across the package.
export * from '../../../vendor/TokamakL2JS/src/index.ts'

// TokamakL2JS v0.0.25-compatible source does not export this constant yet.
// Keep the compatibility shim here so call sites stay package-local.
export const FUNCTION_INPUT_LENGTH = 29
