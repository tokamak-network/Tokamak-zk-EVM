<<<<<<< HEAD
import type { RunState } from "../../interpreter.js";
import type { Common } from '@ethereumjs/common/dist/esm/index.js'

=======
import type { RunState } from "../../interpreter.js";
import type { Common } from '@synthesizer-libs/common'

>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
export type SynthesizerHandler = (runState: RunState, common: Common) => Promise<void>