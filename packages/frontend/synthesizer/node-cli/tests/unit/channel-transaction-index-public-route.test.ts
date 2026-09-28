import { describe, expect, it } from 'vitest'

import { installedSubcircuitLibrary } from '../../src/subcircuit/installedLibrary.ts'
import { extractPublicProjection } from '../../../core/src/circuitGenerator/circuitGenerator.ts'
import { BUFFER_LIST } from '../../../core/src/subcircuit/configuredTypes.ts'
import { createTransactionSignatureVerifyCompositionMapping } from '../../../core/src/subcircuit/special-builders/txSignVerifyComposition.ts'
import {
  BLS12_381_FR_DATA_PT_TYPE,
} from '../../../core/src/synthesizer/types/dataStructure.ts'
import { VARIABLE_DESCRIPTION } from '../../../core/src/synthesizer/types/buffers.ts'

describe('channel transaction index public route', () => {
  it('uses the TX_IN public wire that feeds the TSV challenge', () => {
    const channelTransactionIndex = VARIABLE_DESCRIPTION.CHANNEL_TX_INDEX
    const txIn = installedSubcircuitLibrary.subcircuitBufferMapping.TX_IN

    expect(channelTransactionIndex.source).toBe(BUFFER_LIST.indexOf('TX_IN'))
    expect(channelTransactionIndex.wireIndex).toBe(3)
    expect(channelTransactionIndex.dataPtType).toBe(BLS12_381_FR_DATA_PT_TYPE)
    expect(txIn).toBeDefined()

    expect(txIn!.publicPhase).toBe('user-input')
    expect(txIn!.publicRange).toEqual([
      txIn!.inWireIndex,
      txIn!.NInWires,
    ])
    expect(txIn!.inWireIndex + channelTransactionIndex.wireIndex).toBeLessThan(
      txIn!.publicRange[0] + txIn!.publicRange[1],
    )

    const { composition } = createTransactionSignatureVerifyCompositionMapping(
      installedSubcircuitLibrary.data.frontendCfg.nPrivateMessageInputs,
    )
    expect(composition.steps[0]!.inputs.at(-1)).toEqual({ kind: 'operand', index: 4 })
  })

  it('emits the index once at its canonical user-public metadata offset', () => {
    const channelTransactionIndex = VARIABLE_DESCRIPTION.CHANNEL_TX_INDEX
    const txIn = installedSubcircuitLibrary.subcircuitBufferMapping.TX_IN!
    const libraryData = installedSubcircuitLibrary.data
    const entries = libraryData.subcircuitInfo
      .filter(entry => entry.publicPhase !== undefined)
      .map(entry => ({
        subcircuitId: entry.id,
        variables: Array<string>(entry.Nwires).fill('00'),
        instanceList: Array<string>(entry.Nwires).fill(''),
      }))
    const txInEntry = entries.find(entry => entry.subcircuitId === txIn.id)!
    const indexWire = txIn.inWireIndex + channelTransactionIndex.wireIndex
    txInEntry.variables[indexWire] = '2a'
    txInEntry.instanceList[indexWire] = channelTransactionIndex.extSource!

    const projection = extractPublicProjection(
      entries as never,
      { subcircuitLibrary: installedSubcircuitLibrary } as never,
    )
    const userOutputWireCount = libraryData.setupParams.publicWirePhases
      .find(phase => phase.name === 'user-output')!
      .subcircuitIds
      .reduce(
        (count, subcircuitId) => count + libraryData.subcircuitInfo[subcircuitId]!.Public_idx[1],
        0,
      )
    const indexOffset = userOutputWireCount + indexWire - txIn.publicRange[0]

    expect(projection.publicInstance.a_pub_user[indexOffset]).toBe('0x2a')
    expect(projection.publicInstanceDescription.a_pub_user_description[indexOffset])
      .toBe('Signed channel transaction index')
    expect(
      projection.publicInstanceDescription.a_pub_user_description
        .filter(description => description === 'Signed channel transaction index'),
    ).toHaveLength(1)
  })
})
