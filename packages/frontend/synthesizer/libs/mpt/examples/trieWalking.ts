<<<<<<< HEAD
import { createMPT } from '@ethereumjs/mpt'
import { utf8ToBytes } from '@ethereumjs/util'

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
=======
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
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
