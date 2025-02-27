<<<<<<< HEAD
import { createPartialAccount } from "@ethereumjs/util/index.js"

const account = createPartialAccount({
  nonce: '0x02',
  balance: '0x0384',
})
console.log(`Partial account with nonce=${account.nonce} and balance=${account.balance} created`)
=======
import { createPartialAccount } from "@synthesizer-libs/util"

const account = createPartialAccount({
  nonce: '0x02',
  balance: '0x0384',
})
console.log(`Partial account with nonce=${account.nonce} and balance=${account.balance} created`)
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
