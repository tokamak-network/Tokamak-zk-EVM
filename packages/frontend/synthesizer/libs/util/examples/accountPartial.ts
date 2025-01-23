import { createPartialAccount } from "@ethereumjs/util/index.js"

const account = createPartialAccount({
  nonce: '0x02',
  balance: '0x0384',
})
console.log(`Partial account with nonce=${account.nonce} and balance=${account.balance} created`)
