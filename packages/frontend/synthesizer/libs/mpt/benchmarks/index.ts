import { createSuite } from './suite'
import { LevelDB } from './engines/level'
import { MapDB } from '@synthesizer-libs/util'

createSuite(new MapDB())
createSuite(new LevelDB())
