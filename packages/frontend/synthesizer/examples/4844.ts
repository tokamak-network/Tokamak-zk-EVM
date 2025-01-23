import { Common, Hardfork, Mainnet } from '@ethereumjs/common/dist/esm/index.js'

const common = new Common({ chain: Mainnet, hardfork: Hardfork.Shanghai, eips: [4844] })
