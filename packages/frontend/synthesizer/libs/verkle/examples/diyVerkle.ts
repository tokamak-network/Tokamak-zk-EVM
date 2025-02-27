<<<<<<< HEAD
import { MapDB, bytesToHex } from '@ethereumjs/util'
import { VerkleTree } from '@ethereumjs/verkle'
import { loadVerkleCrypto } from 'verkle-cryptography-wasm'

const verkleCrypto = await loadVerkleCrypto()

const main = async () => {
  const tree = new VerkleTree({
    cacheSize: 0,
    db: new MapDB<Uint8Array, Uint8Array>(),
    useRootPersistence: false,
    verkleCrypto,
  })
  await tree.createRootNode()
  console.log(bytesToHex(tree.root())) // 0x0000000000000000000000000000000000000000000000000000000000000000
}

void main()
=======
import { MapDB, bytesToHex } from '@synthesizer-libs/util'
import { VerkleTree } from '@synthesizer-libs/verkle'
import { loadVerkleCrypto } from 'verkle-cryptography-wasm'

const verkleCrypto = await loadVerkleCrypto()

const main = async () => {
  const tree = new VerkleTree({
    cacheSize: 0,
    db: new MapDB<Uint8Array, Uint8Array>(),
    useRootPersistence: false,
    verkleCrypto,
  })
  await tree.createRootNode()
  console.log(bytesToHex(tree.root())) // 0x0000000000000000000000000000000000000000000000000000000000000000
}

void main()
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
