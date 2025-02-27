<<<<<<< HEAD
import { createWithdrawal } from "@ethereumjs/util/index.js"

const withdrawal = createWithdrawal({
  index: 0n,
  validatorIndex: 65535n,
  address: '0x0000000000000000000000000000000000000000',
  amount: 0n,
})

console.log('Withdrawal object created:')
console.log(withdrawal.toJSON())
=======
import { createWithdrawal } from "@synthesizer-libs/util"

const withdrawal = createWithdrawal({
  index: 0n,
  validatorIndex: 65535n,
  address: '0x0000000000000000000000000000000000000000',
  amount: 0n,
})

console.log('Withdrawal object created:')
console.log(withdrawal.toJSON())
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
