import type { RunState } from '../interpreter.js';
import type { Common } from '@ethereumjs/common/dist/esm/index.js';
export interface SyncOpHandler {
    (runState: RunState, common: Common): void;
}
export interface AsyncOpHandler {
    (runState: RunState, common: Common): Promise<void>;
}
export type OpHandler = SyncOpHandler | AsyncOpHandler;
export declare const handlers: Map<number, OpHandler>;
//# sourceMappingURL=functions.d.ts.map