import type { RunState } from "../../interpreter.js";
import type { Common } from '@ethereumjs/common/dist/esm/index.js'

export type SynthesizerHandler = (runState: RunState, common: Common) => Promise<void>