/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx erc20-approve.ts
 */
import { Account, Address, hexToBytes } from "@ethereumjs/util/index.js"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import ERC20_CONTRACTS from "../../constants/bytecodes/ERC20_CONTRACTS.json" assert { type: "json" };

// ERC20 contract bytecode
const contractCode = hexToBytes(
  ERC20_CONTRACTS.TON
)

const main = async () => {
  const evm = await createEVM()

  // 계정 설정
  const contractAddr = new Address(hexToBytes('0x1000000000000000000000000000000000000000'))
  const owner = new Address(hexToBytes('0x2000000000000000000000000000000000000000'))
  const spender = new Address(hexToBytes('0x3000000000000000000000000000000000000000'))

  // 컨트랙트 계정 생성
  await evm.stateManager.putAccount(contractAddr, new Account())

  // 컨트랙트 코드 배포
  await evm.stateManager.putCode(contractAddr, contractCode)

  // owner의 잔액 설정 (approve와는 직접적인 관련은 없지만, 테스트를 위해 설정)
  const balanceSlot = '0x00'
  const ownerBalanceSlot = keccak256(
    hexToBytes(
      '0x' + owner.toString().slice(2).padStart(64, '0') + balanceSlot.slice(2).padStart(64, '0'),
    ),
  )
  await evm.stateManager.putStorage(
    contractAddr,
    ownerBalanceSlot,
    hexToBytes('0x' + '100'.padStart(64, '0')),
  )

  // approve 실행
  const approveAmount = BigInt(50)
  const res = await evm.runCode({
    caller: owner,
    to: contractAddr,
    code: contractCode,
    // approve(address,uint256) 함수 시그니처: 0x095ea7b3
    data: hexToBytes(
      '0x095ea7b3' +
        spender.toString().slice(2).padStart(64, '0') +
        approveAmount.toString(16).padStart(64, '0'),
    ),
  })

  //   // 결과 확인
  //   console.log('\n=== Storage State ===')
  //   // allowance mapping의 slot: keccak256(spender + keccak256(owner + 0x6))
  //   const allowanceSlot = '0x6'
  //   const allowanceKey = keccak256(
  //     hexToBytes(
  //       '0x' +
  //         spender.toString().slice(2).padStart(64, '0') +
  //         keccak256(
  //           hexToBytes(
  //             '0x' +
  //               owner.toString().slice(2).padStart(64, '0') +
  //               allowanceSlot.slice(2).padStart(64, '0'),
  //           ),
  //         ),
  //     ),
  //   )

  //   const allowanceValue = await evm.stateManager.getStorage(contractAddr, allowanceKey)
  //   console.log('Allowance:', BigInt('0x' + allowanceValue.toString()))

  console.log('\n=== Circuit Placements ===')
  console.log(JSON.stringify(res.runState?.synthesizer.placements, null, 2))
}

void main()
