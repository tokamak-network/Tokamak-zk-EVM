import { RunState } from "../../interpreter.js";

export type SynthesizerHandler = (runState: RunState) => Promise<void>