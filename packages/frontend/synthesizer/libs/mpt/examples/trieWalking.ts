import { createMPT } from '@synthesizer-libs/mpt'
import { utf8ToBytes } from '@synthesizer-libs/util'

async function main() {
  const trie = await createMPT()
  await trie.put(utf8ToBytes('key'), utf8ToBytes('val'))
  const walk = trie.walkTrieIterable(trie.root())

  for await (const { node, currentKey } of walk) {
    // ... do something
    console.log({ node, currentKey })
  }
}
void main()
