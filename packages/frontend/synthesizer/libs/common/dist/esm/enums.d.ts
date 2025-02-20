export declare enum Chain {
    Mainnet = 1,
    Goerli = 5,
    Sepolia = 11155111,
    Holesky = 17000,
    Kaustinen6 = 69420
}
/**
 * Genesis state meta info which is decoupled from common's genesis params
 */
type GenesisState = {
    name: string;
    blockNumber: bigint;
    stateRoot: Uint8Array;
};
/**
 * GenesisState info about well known ethereum chains
 */
export declare const ChainGenesis: Record<Chain, GenesisState>;
export declare enum Hardfork {
    Chainstart = "chainstart",
    Homestead = "homestead",
    Dao = "dao",
    TangerineWhistle = "tangerineWhistle",
    SpuriousDragon = "spuriousDragon",
    Byzantium = "byzantium",
    Constantinople = "constantinople",
    Petersburg = "petersburg",
    Istanbul = "istanbul",
    MuirGlacier = "muirGlacier",
    Berlin = "berlin",
    London = "london",
    ArrowGlacier = "arrowGlacier",
    GrayGlacier = "grayGlacier",
    MergeForkIdTransition = "mergeForkIdTransition",
    Paris = "paris",
    Shanghai = "shanghai",
    Cancun = "cancun",
    Prague = "prague",
    Osaka = "osaka"
}
export declare enum ConsensusType {
    ProofOfStake = "pos",
    ProofOfWork = "pow",
    ProofOfAuthority = "poa"
}
export declare enum ConsensusAlgorithm {
    Ethash = "ethash",
    Clique = "clique",
    Casper = "casper"
}
export {};
//# sourceMappingURL=enums.d.ts.map