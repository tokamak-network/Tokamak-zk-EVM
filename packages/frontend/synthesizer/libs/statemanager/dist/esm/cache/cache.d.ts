import type { Debugger } from 'debug';
export declare class Cache {
    _debug: Debugger;
    _checkpoints: number;
    _stats: {
        size: number;
        reads: number;
        hits: number;
        writes: number;
        deletions: number;
    };
    /**
     * StateManager cache is run in DEBUG mode (default: false)
     * Taken from DEBUG environment variable
     *
     * Safeguards on debug() calls are added for
     * performance reasons to avoid string literal evaluation
     * @hidden
     */
    protected readonly DEBUG: boolean;
    constructor();
}
//# sourceMappingURL=cache.d.ts.map