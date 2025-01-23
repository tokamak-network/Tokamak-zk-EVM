/** Conversion constants to wei */
export declare const GWEI_TO_WEI: bigint;
export declare const ETHER_TO_WEI: bigint;
export declare function formatBigDecimal(numerator: bigint, denominator: bigint, maxDecimalFactor: bigint): string;
export declare class Units {
    static validateInput(amount: number | bigint): void;
    /**
     * Convert a number or bigint input of ether to wei
     *
     * @param {number | bigint} amount amount of units of ether to convert to wei
     * @returns {bigint} amount of units in wei
     */
    static ether(amount: number | bigint): bigint;
    /**
     * Convert a number or bigint input of gwei to wei
     *
     * @param amount amount of units of gwei to convert to wei
     * @returns {bigint} amount of units in wei
     */
    static gwei(amount: number | bigint): bigint;
}
//# sourceMappingURL=units.d.ts.map