import { EOFContainerMode } from './container.js';
import type { RunState } from '../interpreter.js';
/**
 * Setup EOF by preparing the `RunState` to run EVM in EOF mode
 * @param runState Current run state
 * @param eofMode EOF mode to run in (only changes in case of EOFCREATE)
 */
export declare function setupEOF(runState: RunState, eofMode?: EOFContainerMode): void;
//# sourceMappingURL=setup.d.ts.map