//const {opcodeDictionary} = require('./opcode.js')
const {S_MAX} = require('./constant.js')
const fs = require('fs')

const numOfLinesPerCircuit = 13

const listPublicIn = new Map().set('bufferPubIn', true)
const listPublicOut = new Map().set('bufferPubOut', true)

function _buildWireFlattenMap(globalWireList, subcircuitInfos, globalWireIndex, subcircuitId, subcircuitWireId) {
  if (subcircuitId >= 0 ){
    if ( globalWireList[globalWireIndex] !== undefined ) {
      throw new Error(`parseWireList: The same mapping occurs twice.`)
    }
    if ( subcircuitInfos[subcircuitId].flattenMap !== undefined ) {
      if ( subcircuitInfos[subcircuitId].flattenMap[subcircuitWireId] !== undefined ){
        throw new Error(`parseWireList: The same mapping occurs twice.`)
      }
    }

    if ( subcircuitInfos[subcircuitId].flattenMap === undefined ){
      const newSubcircuitInfo = {...subcircuitInfos[subcircuitId], flattenMap: []}
      newSubcircuitInfo.flattenMap[subcircuitWireId] = globalWireIndex
      subcircuitInfos[subcircuitId] = newSubcircuitInfo
    } else {
      subcircuitInfos[subcircuitId].flattenMap[subcircuitWireId] = globalWireIndex
    }
  }

  globalWireList[globalWireIndex] = [
    subcircuitId,
    subcircuitWireId,
  ]
}

function parseWireList(subcircuitInfos, mode = 0) {
  let numTotalWires = 0
  let numPublicWires = 0
  let numInterfaceWires = 0
  const subcircuitInfoByName = new Map()
  for (const subcircuit of subcircuitInfos) {
    numTotalWires += subcircuit.Nwires

    if ( listPublicIn.has(subcircuit.name) ){
      numPublicWires += subcircuit.In_idx[1]
    } else {
      numInterfaceWires += subcircuit.In_idx[1]
    }

    if ( listPublicOut.has(subcircuit.name) ){
      numPublicWires += subcircuit.Out_idx[1]
    } else {
      numInterfaceWires += subcircuit.Out_idx[1]
    }

    const entryObject = {
      id: subcircuit.id,
      NWires: subcircuit.Nwires,
      NInWires: subcircuit.In_idx[1],
      NOutWires: subcircuit.Out_idx[1],
      inWireIndex: subcircuit.In_idx[0],
      outWireIndex: subcircuit.Out_idx[0],
    }
    subcircuitInfoByName.set(subcircuit.name, entryObject)
  }

  let twosPower = 1
  while (twosPower < numPublicWires) {
    twosPower <<= 1
  }
  // twosPower >= numPublicWires
  const numDiff_l = twosPower - numPublicWires
  const l = numPublicWires + numDiff_l
  // numDiff_l makes the parameter l to be power of two.
  
  twosPower = 1
  while (twosPower < numInterfaceWires) {
    twosPower <<= 1
  }
  // twosPower >= numInterfaceWires
  const numDiff_m_I = twosPower - numInterfaceWires
  const l_D = numInterfaceWires + numDiff_m_I + l
  const m_D = numTotalWires + numDiff_l + numDiff_m_I
  // numDiff_m_I makes the parameter m_I = l_D - l to be power of two.

  const globalWireList = []

  let ind = 0  
  for ( const subcircuitName of subcircuitInfoByName.keys() ){
    if (listPublicOut.has(subcircuitName)){
      const targetSubcircuit = subcircuitInfoByName.get(subcircuitName)
      const _numInterestWires = targetSubcircuit.NOutWires
      for (let i = 0; i < _numInterestWires; i++) {
        _buildWireFlattenMap(
          globalWireList,
          subcircuitInfos,
          ind++,
          targetSubcircuit.id,
          targetSubcircuit.outWireIndex + i,
        )
      }
    }

    if (listPublicIn.has(subcircuitName)){
      const targetSubcircuit = subcircuitInfoByName.get(subcircuitName)
      const _numInterestWires = targetSubcircuit.NInWires
      for (let i = 0; i < _numInterestWires; i++) {
        _buildWireFlattenMap(
          globalWireList,
          subcircuitInfos,
          ind++,
          targetSubcircuit.id,
          targetSubcircuit.inWireIndex + i,
        )
      }
    }
  }

  for (let i = 0; i < numDiff_l; i++) {
    _buildWireFlattenMap(
      globalWireList,
      subcircuitInfos,
      ind++,
      -1,
      -1,
    )
  }

  if (ind !== l) {
    throw new Error(`parseWireList: Error during flattening public wires`)
  }

  for ( const subcircuitName of subcircuitInfoByName.keys() ){
    if (!listPublicOut.has(subcircuitName)){
      const targetSubcircuit = subcircuitInfoByName.get(subcircuitName)
      const _numInterestWires = targetSubcircuit.NOutWires
      for (let i = 0; i < _numInterestWires; i++) {
        _buildWireFlattenMap(
          globalWireList,
          subcircuitInfos,
          ind++,
          targetSubcircuit.id,
          targetSubcircuit.outWireIndex + i,
        )
      }
    }

    if (!listPublicIn.has(subcircuitName)){
      const targetSubcircuit = subcircuitInfoByName.get(subcircuitName)
      const _numInterestWires = targetSubcircuit.NInWires
      for (let i = 0; i < _numInterestWires; i++) {
        _buildWireFlattenMap(
          globalWireList,
          subcircuitInfos,
          ind++,
          targetSubcircuit.id,
          targetSubcircuit.inWireIndex + i,
        )
      }
    }
  }

  for (let i = 0; i < numDiff_m_I; i++) {
    _buildWireFlattenMap(
      globalWireList,
      subcircuitInfos,
      ind++,
      -1,
      -1,
    )
  }

  if (ind !== l_D) {
    throw new Error(`parseWireList: Error during flattening interface wires`)
  }
  
  for (const targetSubcircuit of subcircuitInfos) {
    // The first wire is always for constant
    _buildWireFlattenMap(
      globalWireList,
      subcircuitInfos,
      ind++,
      targetSubcircuit.id,
      0,
    )
    const _numInterestWires = targetSubcircuit.Nwires - (targetSubcircuit.Out_idx[1] + targetSubcircuit.In_idx[1]) - 1
    for (let i = 0; i < _numInterestWires; i++) {
      _buildWireFlattenMap(
        globalWireList,
        subcircuitInfos,
        ind++,
        targetSubcircuit.id,
        targetSubcircuit.In_idx[0] + targetSubcircuit.In_idx[1] + i,
      )
    }
  }

  if (ind !== m_D) {
    throw new Error(`parseWireList: Error during flattening internal wires`)
  }

  return {
    l: l,
    l_D: l_D,
    m_D: m_D,
    wireList: globalWireList,
  }
}

// Main script

const numConstsVec= [];

fs.readFile('./temp.txt', 'utf8', function(err, data) {
  if (err) throw err;
  
  const subcircuits = []

  const output = data.split('\n').slice(0, -1)
  for (var i = 0; i < output.length; i += numOfLinesPerCircuit) {
    // circuit id
    const id = Number(output[i].match(/\d+/)[0])

    // circuit name
    let name
    const parts = output[i].split(' = ');
    if (parts.length > 1) {
      //let tempName = parts[1].toUpperCase();
      let tempName = parts[1];
      if (tempName.includes('_')) {
        const index = tempName.indexOf('_');
        name = tempName.substring(0, index) + '-' + tempName.substring(index + 1);
      } else {
        name = tempName;
      }
    } else {
      continue;
    }

    // circuit opcode
    //const opcode = opcodeDictionary[name]

    // num_wires 
    const numWires = output[i + 7].match(/\d+/)[0]

    // public output
    const numOutput = output[i + 6].match(/\d+/)[0]

    // public input
    const numInput = Number(output[i + 4].match(/\d+/)[0]) + Number(output[i + 5].match(/\d+/)[0])

    // num_constraints
    const numConsts = Number(output[i + 2].match(/\d+/)[0]) + Number(output[i + 3].match(/\d+/)[0])
    numConstsVec.push(numConsts)

    const subcircuit = {
      id: id,
      name: name,
      Nwires: Number(numWires),
      Nconsts: Number(numConsts),
      Out_idx: [1, Number(numOutput)],
      In_idx: [Number(numOutput)+1, numInput],
    }
    subcircuits.push(subcircuit)
  }

  const globalWireInfo = parseWireList(subcircuits)
  const _n = Math.max(...numConstsVec)
  let n = 1;
  while (n < _n) {
      n <<= 1
  }

  const setupParams = {
    l: globalWireInfo.l,
    l_D: globalWireInfo.l_D,
    m_D: globalWireInfo.m_D,
    n,
    s_D: subcircuits.length,
    s_max: S_MAX,
  }
  const globalWireList = globalWireInfo.wireList

  const tsSubcircuitInfo = `// Out_idx[0] denotes the index of the first output wire.
  // Out_idx[1] denotes the number of output wires.
  // In_idx[0] denotes the index of the first input wire.
  // In_idx[1] denotes the number of input wires.
  // flattenMap[localWireIndex] is a map that describes how each subcitcuit wire (local wire) is related to the library wires (global wires), i.e., 'flattenMap' is the inverse of 'globalWireList'.
  export const subcircuits =\n ${JSON.stringify(subcircuits, null)}`
  fs.writeFile('../subcircuits/library/subcircuitInfo.ts', tsSubcircuitInfo, (err) => {
    if (err) {
      console.log('Error writing the TypeScript file', err);
    } else {
      console.log('Successfully wrote the TypeScript file');
    }
  })
  fs.writeFile('../subcircuits/library/subcircuitInfo.json', JSON.stringify(subcircuits, null), (err) => {
    if (err) {
      console.log('Error writing the JSON file', err);
    } else {
      console.log('Successfully wrote the JSON file');
    }
  })

  const tsGlobalWireList = `// This is a map that describes how each library wire (global wire) is related to the subcircuit wires (local wires), i.e., 'globalWireList' is the inverse of 'flattenMap' in the subcircuitInfo file.
  // globalWireList[index][0] indicates subcircuitId to which this wire belongs.
  // globalWireList[index][1] indicates the corresponding localWireIndex in the subcircuitId.
  export const globalWireList =\n ${JSON.stringify(globalWireList, null)}`
  fs.writeFile('../subcircuits/library/globalWireList.ts', tsGlobalWireList, (err) => {
    if (err) {
      console.log('Error writing the TypeScript file', err);
    } else {
      console.log('Successfully wrote the TypeScript file');
    }
  })
  fs.writeFile('../subcircuits/library/globalWireList.json', JSON.stringify(globalWireList, null), (err) => {
    if (err) {
      console.log('Error writing the JSON file', err);
    } else {
      console.log('Successfully wrote the JSON file');
    }
  })

  const tsSetupParams = `// Parameters for the subcircuit library
  // l: The number of public wires
  // l_D: The number of interface wires (private)
  // m: The total number of wires
  // n: The maximum number of constraints
  // s_D: The number of subcircuits in the library
  export const setupParams = \n ${JSON.stringify(setupParams, null, 2)}`
  fs.writeFile('../subcircuits/library/setupParams.ts', tsSetupParams, (err) => {
    if (err) {
      console.log('Error writing the TypeScript file', err);
    } else {
      console.log('Successfully wrote the TypeScript file');
    }
  })
  fs.writeFile('../subcircuits/library/setupParams.json', JSON.stringify(setupParams, null, 2), (err) => {
    if (err) {
      console.log('Error writing the JSON file', err);
    } else {
      console.log('Successfully wrote the JSON file');
    }
  })
})