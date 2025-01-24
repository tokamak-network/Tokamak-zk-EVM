import debugDefault from 'debug';
export class Cache {
    constructor() {
        this._checkpoints = 0;
        this._stats = {
            size: 0,
            reads: 0,
            hits: 0,
            writes: 0,
            deletions: 0,
        };
        /**
         * StateManager cache is run in DEBUG mode (default: false)
         * Taken from DEBUG environment variable
         *
         * Safeguards on debug() calls are added for
         * performance reasons to avoid string literal evaluation
         * @hidden
         */
        this.DEBUG = false;
        // Skip DEBUG calls unless 'ethjs' included in environmental DEBUG variables
        // Additional window check is to prevent vite browser bundling (and potentially other) to break
        this.DEBUG =
            typeof window === 'undefined' ? (process?.env?.DEBUG?.includes('ethjs') ?? false) : false;
        this._debug = debugDefault('statemanager:cache');
    }
}
//# sourceMappingURL=cache.js.map