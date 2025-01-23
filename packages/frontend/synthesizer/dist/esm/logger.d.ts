export type EVMPerformanceLogOutput = {
    calls: number;
    totalTime: number;
    avgTimePerCall: number;
    gasUsed: number;
    millionGasPerSecond: number;
    blocksPerSlot: number;
    tag: string;
    staticGasUsed?: number;
    dynamicGasUsed?: number;
    staticGas?: number;
};
export declare class Timer {
    private startTime;
    private runTime;
    tag: string;
    constructor(tag: string);
    pause(): void;
    unpause(): void;
    time(): number;
}
export declare class EVMPerformanceLogger {
    private opcodes;
    private precompiles;
    private currentTimer?;
    constructor();
    clear(): void;
    getLogs(): {
        opcodes: EVMPerformanceLogOutput[];
        precompiles: EVMPerformanceLogOutput[];
    };
    hasTimer(): boolean;
    startTimer(tag: string): Timer;
    pauseTimer(): Timer;
    unpauseTimer(timer: Timer): void;
    stopTimer(timer: Timer, gasUsed: number, targetTimer?: 'precompiles' | 'opcodes', staticGas?: number, dynamicGas?: number): void;
}
//# sourceMappingURL=logger.d.ts.map