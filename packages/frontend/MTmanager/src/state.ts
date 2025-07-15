import { ethers, keccak256, solidityPacked, toBeHex } from 'ethers'
const rpcUrl = 'https://eth-mainnet.g.alchemy.com/v2/e_QJd40sb7aiObJisG_8Q'

export async function extractStorage (ca: string, addrs: Set<string>, slot: number, block: number): Promise<Record<string,string>> {
  const provider = new ethers.JsonRpcProvider(rpcUrl)

  const out: Record<string,string> = {}
  for (const a of addrs) {
    const key = keccak256(solidityPacked(['uint256','uint256'], [a, slot]))
    const v   = await provider.getStorage(ca, key, block)
    out[a] = toBeHex(v)
    // out[a] = toNumber(v)
  }
  console.log(JSON.stringify(out, null, 2))

  return out
}