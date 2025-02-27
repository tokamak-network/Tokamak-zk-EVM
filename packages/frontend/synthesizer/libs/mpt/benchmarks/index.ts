<<<<<<< HEAD
import { createSuite } from './suite'
import { LevelDB } from './engines/level'
import { MapDB } from '@ethereumjs/util'

createSuite(new MapDB())
createSuite(new LevelDB())
=======
import { createSuite } from './suite'
import { LevelDB } from './engines/level'
import { MapDB } from '@synthesizer-libs/util'

createSuite(new MapDB())
createSuite(new LevelDB())
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
