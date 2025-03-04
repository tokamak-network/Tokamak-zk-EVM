import { createMPT } from '@synthesizer-libs/mpt'
import { MapDB, bytesToUtf8, utf8ToBytes } from '@synthesizer-libs/util'

async function test() {
  const trie = await createMPT({ db: new MapDB() })
  await trie.put(utf8ToBytes('test'), utf8ToBytes('one'))
  const value = await trie.get(utf8ToBytes('test'))
  console.log(value ? bytesToUtf8(value) : 'not found') // 'one'
}

void test()
