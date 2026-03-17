// Keep the TokamakL2JS source binding isolated here.
// The package-local vendor symlink points to the repository-root submodule.
// When Synthesizer switches to the published `tokamak-l2js` package,
// update this file instead of touching call sites across the package.
export * from '../../../vendor/TokamakL2JS/src/index.ts'
import {
  poseidonN2xCompress,
  poseidon_raw,
} from '../../../vendor/TokamakL2JS/src/crypto/index.ts'
import { POSEIDON_INPUTS } from '../../../vendor/TokamakL2JS/src/interface/params/index.ts'

// TokamakL2JS currently signs and exposes 9 fixed-width calldata words after the
// selector. Keep the adapter-level compatibility shim here because the submodule no
// longer exports this constant directly.
export const FUNCTION_INPUT_LENGTH = 9

export const poseidonChainCompress = (inVals: bigint[]): bigint => {
  if (inVals.length < POSEIDON_INPUTS) {
    throw new Error(`Expected at least ${POSEIDON_INPUTS} inputs, but got ${inVals.length}`)
  }

  const fold = (arr: bigint[]): bigint[] => {
    const n1xChunks = Math.ceil(arr.length / POSEIDON_INPUTS)
    const nPaddedChildren = n1xChunks * POSEIDON_INPUTS
    const use2xCompression = nPaddedChildren % (POSEIDON_INPUTS ** 2) === 0
    const placeFunction = use2xCompression ? poseidonN2xCompress : poseidon_raw
    const nChildren = use2xCompression ? (POSEIDON_INPUTS ** 2) : POSEIDON_INPUTS

    const out: bigint[] = []
    for (let childId = 0; childId < nPaddedChildren; childId += nChildren) {
      const chunk = Array.from(
        { length: nChildren },
        (_, localChildId) => arr[childId + localChildId] ?? 0n,
      )
      out.push(placeFunction(chunk))
    }
    return out
  }

  let acc = fold(inVals)
  while (acc.length > 1) {
    acc = fold(acc)
  }
  return acc[0]!
}
