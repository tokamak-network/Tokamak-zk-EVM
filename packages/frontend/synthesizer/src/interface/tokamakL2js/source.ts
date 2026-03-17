// Keep the TokamakL2JS source binding isolated here.
// The package-local vendor symlink points to the repository-root submodule.
// When Synthesizer switches to the published `tokamak-l2js` package,
// update this file instead of touching call sites across the package.
export * from '../../../vendor/TokamakL2JS/src/index.ts'
