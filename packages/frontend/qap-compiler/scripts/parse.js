//const {opcodeDictionary} = require('./opcode.js')
const {S_MAX} = require('./configure.js')
const {LIST_PUBLIC} = require('./configure.js')
const listPublic = LIST_PUBLIC

const fs = require('fs')
const path = require('path')

const outputDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../subcircuits/library')
const compilerOutputPath = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(__dirname, 'temp.txt')
const ansiEscapePattern = /\u001b\[[0-9;]*m/g

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

function parseWireList(subcircuitInfos) {
  let numTotalWires = 0
  let numPubUserOutWires = 0
  let numPubUserInWires = 0
  let numPubBlockWires = 0
  let numPubFunctinoWires = 0
  let numInterfaceWires = 0
  const subcircuitInfoByName = new Map()
  for (const subcircuit of subcircuitInfos) {
    numTotalWires += subcircuit.Nwires

    if ( listPublic.has(subcircuit.name)) {
      switch(listPublic.get(subcircuit.name)) {
        case 'outUser': {
          numPubUserOutWires += subcircuit.Out_idx[1]
          numInterfaceWires += subcircuit.In_idx[1] + 1 // + 1 is for the constance wire
          break;
        }
        case 'inUser': {
          numPubUserInWires += subcircuit.In_idx[1]
          numInterfaceWires += subcircuit.Out_idx[1] + 1 // + 1 is for the constance wire
          break;
        }
        case 'inBlock': {
          numPubBlockWires += subcircuit.In_idx[1]
          numInterfaceWires += subcircuit.Out_idx[1] + 1 // + 1 is for the constance wire
          break;
        }
        case 'inFunction': {
          numPubFunctinoWires += subcircuit.In_idx[1]
          numInterfaceWires += subcircuit.Out_idx[1] + 1 // + 1 is for the constance wire
          break;
        }
        default: {
          throw new Error("listPublic items must have either 'inUser', 'outUser', 'inBlock', 'inFunction'")
        }
      }
    } else {
      numInterfaceWires += subcircuit.Out_idx[1]
      numInterfaceWires += subcircuit.In_idx[1]
      numInterfaceWires += 1 // + 1 is for the constance wire
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

  const l_user_out = numPubUserOutWires
  const l_user = l_user_out + numPubUserInWires
  const l_free_actual = l_user + numPubBlockWires


  console.log(`l_user actual: ${l_user}`)
  console.log(`m block actual: ${l_free_actual - l_user}`)
  console.log(`l_free actual: ${l_free_actual}`)

  let twosPower = 1
   while (twosPower < l_free_actual) {
    twosPower <<= 1
  }
  const numDiff_l_free = twosPower - l_free_actual
  const l_free = l_free_actual + numDiff_l_free
   console.log(`l_free: ${l_free}`)

  const l = l_free + numPubFunctinoWires
  console.log(`m function actual: ${numPubFunctinoWires}`)
  console.log(`l: ${l}`)

  twosPower = 1
  while (twosPower < numInterfaceWires) {
    twosPower <<= 1
  }

  // twosPower >= numInterfaceWires
  const numDiff_m_I = twosPower - numInterfaceWires
  const l_D = l + numInterfaceWires + numDiff_m_I
  const m_D = numTotalWires + numDiff_l_free + numDiff_m_I
  // numDiff_m_I makes the parameter m_I = l_D - l_free to be power of two.

  console.log(`m_I actual: ${numInterfaceWires}`)
  console.log(`m_I: ${l_D - l}`)

  const globalWireList = []

  // Processing free public wires
  let ind = 0  
  for ( const subcircuitName of subcircuitInfoByName.keys() ){
    const targetSubcircuit = subcircuitInfoByName.get(subcircuitName)
    if (listPublic.has(subcircuitName)) {
      if (listPublic.get(subcircuitName) === 'outUser') {
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
      } else if (listPublic.get(subcircuitName) === 'inUser' || listPublic.get(subcircuitName) === 'inBlock') {
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
  }

  if (ind !== l_free_actual) {
    throw new Error(`parseWireList: Error during flattening public wires: ind = ${ind}, l_free_actual = ${l_free_actual}`)
  }

  for (let i = 0; i < numDiff_l_free; i++) {
    _buildWireFlattenMap(
      globalWireList,
      subcircuitInfos,
      ind++,
      -1,
      -1,
    )
  }

  if (ind !== l_free) {
    throw new Error(`parseWireList: Error during flattening public wires: ind = ${ind}, l_free = ${l_free}`)
  }

  // Processing fixed public wires
  for ( const subcircuitName of subcircuitInfoByName.keys() ){
    const targetSubcircuit = subcircuitInfoByName.get(subcircuitName)
    if (listPublic.has(subcircuitName)) {
      if (listPublic.get(subcircuitName) === 'inFunction' ) {
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
  }

  if (ind !== l) {
    throw new Error(`parseWireList: Error during flattening public wires: ind = ${ind}, l_free = ${l_free}`)
  }

  // Processing internal interface wires
  for ( const subcircuitName of subcircuitInfoByName.keys() ){
    const targetSubcircuit = subcircuitInfoByName.get(subcircuitName)
    // Include the constance wire in the interface wire list
    _buildWireFlattenMap(
      globalWireList,
      subcircuitInfos,
      ind++,
      targetSubcircuit.id,
      0,
    )
    if (listPublic.has(subcircuitName)) {
      if (listPublic.get(subcircuitName) === 'outUser') {
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
      } else if (listPublic.get(subcircuitName) === 'inUser' || listPublic.get(subcircuitName) === 'inBlock' || listPublic.get(subcircuitName) === 'inFunction') {
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
    } else {
      let _numInterestWires
      _numInterestWires = targetSubcircuit.NOutWires
      for (let i = 0; i < _numInterestWires; i++) {
        _buildWireFlattenMap(
          globalWireList,
          subcircuitInfos,
          ind++,
          targetSubcircuit.id,
          targetSubcircuit.outWireIndex + i,
        )
      }
      _numInterestWires = targetSubcircuit.NInWires
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
  // Processing internal private wires
  for (const targetSubcircuit of subcircuitInfos) {
    // // The first wire is always for constant by Circom
    // _buildWireFlattenMap(
    //   globalWireList,
    //   subcircuitInfos,
    //   ind++,
    //   targetSubcircuit.id,
    //   0,
    // )
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
    l_user_out,
    l_user,
    l_free,
    l,
    l_D,
    m_D,
    wireList: globalWireList,
  }
}

// Main script

const numConstsVec= [];

function getLineValue(lines, prefix) {
  const targetLine = lines.find((line) => line.startsWith(prefix))
  if (targetLine === undefined) {
    throw new Error(`parse.js: Missing '${prefix}' in compiler output.`)
  }

  const matches = targetLine.match(/\d+/g)
  if (matches === null || matches.length === 0) {
    throw new Error(`parse.js: Missing numeric value for '${prefix}'.`)
  }

  return Number(matches[matches.length - 1])
}

function parseSubcircuitBlock(lines) {
  const id = Number(lines[0].match(/\d+/)[0])

  let name
  const parts = lines[0].split(' = ')
  if (parts.length > 1) {
    const tempName = parts[1]
    if (tempName.includes('_')) {
      const index = tempName.indexOf('_')
      name = tempName.substring(0, index) + '-' + tempName.substring(index + 1)
    } else {
      name = tempName
    }
  } else {
    throw new Error(`parse.js: Failed to parse subcircuit name from '${lines[0]}'.`)
  }

  const numWires = getLineValue(lines, 'wires:')
  const numOutput = getLineValue(lines, 'public outputs:')
  const numInput = getLineValue(lines, 'public inputs:') + getLineValue(lines, 'private inputs:')
  const numConsts = getLineValue(lines, 'non-linear constraints:') + getLineValue(lines, 'linear constraints:')
  numConstsVec.push(numConsts)

  return {
    id,
    name,
    Nwires: numWires,
    Nconsts: numConsts,
    Out_idx: [1, numOutput],
    In_idx: [numOutput + 1, numInput],
  }
}

fs.readFile(compilerOutputPath, 'utf8', function(err, data) {
  if (err) throw err;
  
  const subcircuits = []

  const output = data
    .replace(ansiEscapePattern, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  let currentBlock = []
  for (const line of output) {
    if (line.startsWith('id[')) {
      if (currentBlock.length > 0) {
        subcircuits.push(parseSubcircuitBlock(currentBlock))
      }
      currentBlock = [line]
      continue
    }

    if (currentBlock.length > 0) {
      currentBlock.push(line)
    }
  }

  if (currentBlock.length > 0) {
    subcircuits.push(parseSubcircuitBlock(currentBlock))
  }

  const globalWireInfo = parseWireList(subcircuits)
  const _n = Math.max(...numConstsVec)
  let n = 1;
  while (n < _n) {
      n <<= 1
  }

  const setupParams = {
    l_free: globalWireInfo.l_free,
    l_user_out: globalWireInfo.l_user_out,
    l_user: globalWireInfo.l_user,
    l: globalWireInfo.l,
    l_D: globalWireInfo.l_D,
    m_D: globalWireInfo.m_D,
    n,
    s_D: subcircuits.length,
    s_max: S_MAX,
  }
  const globalWireList = globalWireInfo.wireList

  // const tsSubcircuitInfo = `// Out_idx[0] denotes the index of the first output wire.
  // // Out_idx[1] denotes the number of output wires.
  // // In_idx[0] denotes the index of the first input wire.
  // // In_idx[1] denotes the number of input wires.
  // // flattenMap[localWireIndex] is a map that describes how each subcitcuit wire (local wire) is related to the library wires (global wires), i.e., 'flattenMap' is the inverse of 'globalWireList'.
  // export const subcircuits =\n ${JSON.stringify(subcircuits, null)}`
  // fs.writeFile('../subcircuits/library/subcircuitInfo.ts', tsSubcircuitInfo, (err) => {
  //   if (err) {
  //     console.log('Error writing the TypeScript file', err);
  //   } else {
  //     console.log('Successfully wrote the TypeScript file');
  //   }
  // })
  fs.writeFile(path.join(outputDir, 'subcircuitInfo.json'), JSON.stringify(subcircuits, null), (err) => {
    if (err) {
      console.log('Error writing the JSON file', err);
    } else {
      console.log('Successfully wrote the JSON file');
    }
  })

  // const tsGlobalWireList = `// This is a map that describes how each library wire (global wire) is related to the subcircuit wires (local wires), i.e., 'globalWireList' is the inverse of 'flattenMap' in the subcircuitInfo file.
  // // globalWireList[index][0] indicates subcircuitId to which this wire belongs.
  // // globalWireList[index][1] indicates the corresponding localWireIndex in the subcircuitId.
  // export const globalWireList =\n ${JSON.stringify(globalWireList, null)}`
  // fs.writeFile('../subcircuits/library/globalWireList.ts', tsGlobalWireList, (err) => {
  //   if (err) {
  //     console.log('Error writing the TypeScript file', err);
  //   } else {
  //     console.log('Successfully wrote the TypeScript file');
  //   }
  // })
  fs.writeFile(path.join(outputDir, 'globalWireList.json'), JSON.stringify(globalWireList, null), (err) => {
    if (err) {
      console.log('Error writing the JSON file', err);
    } else {
      console.log('Successfully wrote the JSON file');
    }
  })

  // const tsSetupParams = `// Parameters for the subcircuit library
  // // l_free: The number of public wires
  // // l_D: The number of interface wires (private)
  // // m: The total number of wires
  // // n: The maximum number of constraints
  // // s_D: The number of subcircuits in the library
  // export const setupParams = \n ${JSON.stringify(setupParams, null, 2)}`
  // fs.writeFile('../subcircuits/library/setupParams.ts', tsSetupParams, (err) => {
  //   if (err) {
  //     console.log('Error writing the TypeScript file', err);
  //   } else {
  //     console.log('Successfully wrote the TypeScript file');
  //   }
  // })
  fs.writeFile(path.join(outputDir, 'setupParams.json'), JSON.stringify(setupParams, null, 2), (err) => {
    if (err) {
      console.log('Error writing the JSON file', err);
    } else {
      console.log('Successfully wrote the JSON file');
    }
  })
})
