//DEBUG=ethjs,evm:ops:* tsx logicalOperation.ts
import { hexToBytes } from '@ethereumjs/util'

import { createEVM } from '../src/constructors.js'

const main = async () => {
  const evm = await createEVM()

  //   //단순 MUL 연산 테스트
  //   console.log('\nTesting Simple MUL Operations:')
  //   const simpleRes = await evm.runCode({
  //     code: hexToBytes('0x600360040200'), // PUSH1 3, PUSH1 4, MUL
  //   })

  //   const simpleStackValue = simpleRes.runState?.stack.peek(1)[0]
  //   console.log(`Simple MUL result (3 * 4): ${simpleStackValue}`)

  //복합 MUL 연산 테스트
  console.log('\nTesting Complex MUL Operations:')

  /**CODECOPY 실행 시점
{
    pc: 24,             // 프로그램 카운터
    op: "CODECOPY",     // 코드를 메모리로 복사하는 연산
    gas: "0xffffca",    // 남은 가스
    gasCost: "0x105",   // CODECOPY 연산의 가스 비용 (261)
    stack: [            // 현재 스택 상태
        "0x56b",        // destOffset: 메모리 목적지 오프셋
        "0x56b",        // offset: 코드에서의 시작 위치
        "0x1c",         // size: 복사할 크기 (28 바이트)
        "0x0"           // PUSH0로 추가된 값
    ],
    depth: 0
}
    */

  const calldata1 =
    '0x711e3215' + '0000000000000000000000000000000000000000000000000000000000000001' // uint256 1

  // main 함수 호출을 시뮬레이션 (예: n=5)
  // main 함수 호출을 위한 calldata 구성
  const calldata = '0x0x711e32150000000000000000000000000000000000000000000000000000000000000001'

  const runtimeCode =
    '0x608060405234801561001057600080fd5b506004361061002b5760003560e01c80630cea08a614610030575b600080fd5b61004a600480360381019061004591906100a4565b610060565b60405161005791906100e0565b60405180910390f35b600080821161006e57819050610099565b600080600190505b8381101561009757808261008891906100fb565b91508093505060018101905061007a565b505b919050565b60008135905061009e81610103565b92915050565b6000602082840312156100ba576100b96100fe565b5b60006100c88482850161008f565b91505092915050565b6100da81610147565b82525050565b60006020820190506100f560008301846100d1565b92915050565b600080fd5b6000610106826100e6565b9050919050565b61011081610147565b811461011b57600080fd5b50565b600061012a826100e6565b9150610135836100e6565b925082820190508082111561014d5761014c610151565b5b92915050565b6000819050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fdfea2646970667358221220d7a0f8834d7f731da0b6a89c6e9a49f35b05636675b9d6743e9f389c7011c64764736f6c63430008120033'

  const res = await evm.runCode({
    code: hexToBytes(runtimeCode),
    data: hexToBytes('0x0cea08a60000000000000000000000000000000000000000000000000000000000000005'),
  })

  // 결과 출력
  console.log('\nStack-Placement Value Comparison Test')
  console.log('stack : ', res.runState?.stack)
  console.log('stackPt : ', res.runState?.stackPt)

  console.log(res.runState!.synthesizer)

  const placementsArray = Array.from(res.runState!.synthesizer.placements.values())

  console.log('placementsArray : ', placementsArray)

  // const lastPlacement = placementsArray[placementsArray.length - 1]
  // const lastOutPtValue = lastPlacement.outPts[lastPlacement.outPts.length - 1].valuestr

  // console.log(`Last Placement OutPt Value: ${lastOutPtValue}`)

  //생성된 모든 서킷 출력
  console.log('\nGenerated Circuits:')
  let index = 1
  for (const placement of placementsArray) {
    console.log(`\nCircuit ${index}:`)
    console.log(`Operation: ${placement.name}`)
    console.log(`Number of inputs: ${placement.inPts.length}`)
    console.log(`Number of outputs: ${placement.outPts.length}`)
    console.log(
      'Placement details:',
      JSON.stringify(
        placement,
        (key, value) => (typeof value === 'bigint' ? value.toString() : value),
        2,
      ),
    )

    index++
  }
  console.log('last stackPt value : ')
}

void main().catch((error) => {
  console.log('****ERROR*****')
  console.error(error)
  process.exit(1)
})
