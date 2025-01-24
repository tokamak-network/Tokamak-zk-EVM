export const paramsEVM = {
    /**
     * Frontier/Chainstart
     */
    1: {
        // gasConfig
        maxRefundQuotient: 2,
        // gasPrices
        basefeeGas: 2,
        expGas: 10,
        expByteGas: 10,
        keccak256Gas: 30,
        keccak256WordGas: 6,
        sloadGas: 50,
        sstoreSetGas: 20000,
        sstoreResetGas: 5000,
        sstoreRefundGas: 15000,
        jumpdestGas: 1,
        logGas: 375,
        logDataGas: 8,
        logTopicGas: 375,
        createGas: 32000,
        callGas: 40,
        callStipendGas: 2300,
        callValueTransferGas: 9000,
        callNewAccountGas: 25000,
        selfdestructRefundGas: 24000,
        memoryGas: 3,
        quadCoefficientDivGas: 512,
        createDataGas: 200,
        copyGas: 3,
        ecRecoverGas: 3000,
        sha256Gas: 60,
        sha256WordGas: 12,
        ripemd160Gas: 600,
        ripemd160WordGas: 120,
        identityGas: 15,
        identityWordGas: 3,
        stopGas: 0,
        addGas: 3,
        mulGas: 5,
        subGas: 3,
        divGas: 5,
        sdivGas: 5,
        modGas: 5,
        smodGas: 5,
        addmodGas: 8,
        mulmodGas: 8,
        signextendGas: 5,
        ltGas: 3,
        gtGas: 3,
        sltGas: 3,
        sgtGas: 3,
        eqGas: 3,
        iszeroGas: 3,
        andGas: 3,
        orGas: 3,
        xorGas: 3,
        notGas: 3,
        byteGas: 3,
        addressGas: 2,
        balanceGas: 20,
        originGas: 2,
        callerGas: 2,
        callvalueGas: 2,
        calldataloadGas: 3,
        calldatasizeGas: 2,
        calldatacopyGas: 3,
        codesizeGas: 2,
        codecopyGas: 3,
        gaspriceGas: 2,
        extcodesizeGas: 20,
        extcodecopyGas: 20,
        blockhashGas: 20,
        coinbaseGas: 2,
        timestampGas: 2,
        numberGas: 2,
        difficultyGas: 2,
        gaslimitGas: 2,
        popGas: 2,
        mloadGas: 3,
        mstoreGas: 3,
        mstore8Gas: 3,
        sstoreGas: 0,
        jumpGas: 8,
        jumpiGas: 10,
        pcGas: 2,
        msizeGas: 2,
        gasGas: 2,
        pushGas: 3,
        dupGas: 3,
        swapGas: 3,
        callcodeGas: 40,
        returnGas: 0,
        invalidGas: 0,
        selfdestructGas: 0,
        prevrandaoGas: 0,
        // evm
        stackLimit: 1024,
        callCreateDepth: 1024, // Maximum depth of call/create stack
    },
    /**
  .  * Homestead HF Meta EIP
  .  */
    606: {
        // gasPrices
        delegatecallGas: 40, // Base fee of the DELEGATECALL opcode
    },
    /**
  .  * TangerineWhistle HF Meta EIP
  .  */
    608: {
        // gasPrices
        sloadGas: 200,
        callGas: 700,
        extcodesizeGas: 700,
        extcodecopyGas: 700,
        balanceGas: 400,
        delegatecallGas: 700,
        callcodeGas: 700,
        selfdestructGas: 5000, // Base fee of the SELFDESTRUCT opcode
    },
    /**
  .  * Spurious Dragon HF Meta EIP
  .  */
    607: {
        // gasPrices
        expByteGas: 50,
        // evm
        maxCodeSize: 24576, // Maximum length of contract code
    },
    /**
  .  * Byzantium HF Meta EIP
  .  */
    609: {
        // gasPrices
        modexpGquaddivisorGas: 20,
        bn254AddGas: 500,
        bn254MulGas: 40000,
        bn254PairingGas: 100000,
        bn254PairingWordGas: 80000,
        revertGas: 0,
        staticcallGas: 700,
        returndatasizeGas: 2,
        returndatacopyGas: 3, // Base fee of the RETURNDATACOPY opcode
    },
    /**
  .  * Constantinople HF Meta EIP
  .  */
    1013: {
        // gasPrices
        netSstoreNoopGas: 200,
        netSstoreInitGas: 20000,
        netSstoreCleanGas: 5000,
        netSstoreDirtyGas: 200,
        netSstoreClearRefundGas: 15000,
        netSstoreResetRefundGas: 4800,
        netSstoreResetClearRefundGas: 19800,
        shlGas: 3,
        shrGas: 3,
        sarGas: 3,
        extcodehashGas: 400,
        create2Gas: 32000, // Base fee of the CREATE2 opcode
    },
    /**
  .  * Petersburg HF Meta EIP
  .  */
    1716: {
        // gasPrices
        netSstoreNoopGas: null,
        netSstoreInitGas: null,
        netSstoreCleanGas: null,
        netSstoreDirtyGas: null,
        netSstoreClearRefundGas: null,
        netSstoreResetRefundGas: null,
        netSstoreResetClearRefundGas: null, // Removed along EIP-1283
    },
    /**
  .  * Istanbul HF Meta EIP
  .  */
    1679: {
        // gasPrices
        blake2RoundGas: 1,
        bn254AddGas: 150,
        bn254MulGas: 6000,
        bn254PairingGas: 45000,
        bn254PairingWordGas: 34000,
        sstoreSentryEIP2200Gas: 2300,
        sstoreNoopEIP2200Gas: 800,
        sstoreDirtyEIP2200Gas: 800,
        sstoreInitEIP2200Gas: 20000,
        sstoreInitRefundEIP2200Gas: 19200,
        sstoreCleanEIP2200Gas: 5000,
        sstoreCleanRefundEIP2200Gas: 4200,
        sstoreClearRefundEIP2200Gas: 15000,
        balanceGas: 700,
        extcodehashGas: 700,
        chainidGas: 2,
        selfbalanceGas: 5,
        sloadGas: 800, // Base fee of the SLOAD opcode
    },
    /**
  .  * SWAPN, DUPN and EXCHANGE instructions
  .  */
    663: {
        // gasPrices
        dupnGas: 3,
        swapnGas: 3,
        exchangeGas: 3, // Base fee of the EXCHANGE opcode
    },
    /**
  .  * Transient storage opcodes
  .  */
    1153: {
        // gasPrices
        tstoreGas: 100,
        tloadGas: 100, // Base fee of the TLOAD opcode
    },
    1559: {
        elasticityMultiplier: 2, // Maximum block gas target elasticity
    },
    /**
  .  * ModExp gas cost
  .  */
    2565: {
        // gasPrices
        modexpGquaddivisorGas: 3, // Gquaddivisor from modexp precompile for gas calculation
    },
    /**
     * BLS12-381 precompiles
     */
    2537: {
        // gasPrices
        bls12381G1AddGas: 500,
        bls12381G1MulGas: 12000,
        bls12381G2AddGas: 800,
        bls12381G2MulGas: 45000,
        bls12381PairingBaseGas: 65000,
        bls12381PairingPerPairGas: 43000,
        bls12381MapG1Gas: 5500,
        bls12381MapG2Gas: 75000, // Gas cost of BLS12-381 map field element to G2
    },
    /**
  .  * Gas cost increases for state access opcodes
  .  */
    2929: {
        // gasPrices
        coldsloadGas: 2100,
        coldaccountaccessGas: 2600,
        warmstoragereadGas: 100,
        sstoreCleanEIP2200Gas: 2900,
        sstoreNoopEIP2200Gas: 100,
        sstoreDirtyEIP2200Gas: 100,
        sstoreInitRefundEIP2200Gas: 19900,
        sstoreCleanRefundEIP2200Gas: 4900,
        callGas: 0,
        callcodeGas: 0,
        delegatecallGas: 0,
        staticcallGas: 0,
        balanceGas: 0,
        extcodesizeGas: 0,
        extcodecopyGas: 0,
        extcodehashGas: 0,
        sloadGas: 0,
        sstoreGas: 0, // Base fee of the SSTORE opcode
    },
    /**
     * Save historical block hashes in state (Verkle related usage, UNSTABLE)
     */
    2935: {
        // evm
        historyStorageAddress: '0x0aae40965e6800cd9b1f4b05ff21581047e3f91e',
        historyServeWindow: 8192, // The amount of blocks to be served by the historical blockhash contract
    },
    /**
  .  * BASEFEE opcode
  .  */
    3198: {
        // gasPrices
        basefeeGas: 2, // Gas cost of the BASEFEE opcode
    },
    /**
  .  * Reduction in refunds
  .  */
    3529: {
        // gasConfig
        maxRefundQuotient: 5,
        // gasPrices
        selfdestructRefundGas: 0,
        sstoreClearRefundEIP2200Gas: 4800, // Once per SSTORE operation for clearing an originally existing storage slot
    },
    /**
  .  * PUSH0 instruction
  .  */
    3855: {
        // gasPrices
        push0Gas: 2, // Base fee of the PUSH0 opcode
    },
    /**
  .  * Limit and meter initcode
  .  */
    3860: {
        // gasPrices
        initCodeWordGas: 2,
        // vm
        maxInitCodeSize: 49152, // Maximum length of initialization code when creating a contract
    },
    /**
     * EOF - Static relative jumps
     */
    4200: {
        // gasPrices
        rjumpGas: 2,
        rjumpiGas: 4,
        rjumpvGas: 4, // Base fee of the RJUMPV opcode
    },
    /**
  .  * Supplant DIFFICULTY opcode with PREVRANDAO
  .  */
    4399: {
        // gasPrices
        prevrandaoGas: 2, // Base fee of the PREVRANDAO opcode (previously DIFFICULTY)
    },
    /**
     * EOF - Functions
     */
    4750: {
        // gasPrices
        callfGas: 5,
        retfGas: 3, // Base fee of the RETF opcode
    },
    /**
  .  * Shard Blob Transactions
  .  */
    4844: {
        kzgPointEvaluationPrecompileGas: 50000,
        blobhashGas: 3,
        // sharding
        blobCommitmentVersionKzg: 1,
        fieldElementsPerBlob: 4096, // The number of field elements allowed per blob
    },
    /**
     * MCOPY - Memory copying instruction
     */
    5656: {
        // gasPrices
        mcopyGas: 3, // Base fee of the MCOPY opcode
    },
    /**
     * EOF - JUMPF and non-returning functions
     */
    6206: {
        // gasPrices
        jumpfGas: 5, // Base fee of the JUMPF opcode
    },
    /**
     * Ethereum state using a unified verkle tree (experimental)
     */
    6800: {
        // gasPrices
        createGas: 1000,
        coldsloadGas: 0, // Gas cost of the first read of storage from a given location (per transaction)
    },
    /**
  .  * Revamped CALL instructions
  .  */
    7069: {
        /* Note: per EIP these are the additionally required EIPs:
        EIP 150 - This is the entire Tangerine Whistle hardfork
        EIP 211 - (RETURNDATASIZE / RETURNDATACOPY) - Included in Byzantium
        EIP 214 - (STATICCALL) - Included in Byzantium
      */
        // gasPrices
        extcallGas: 0,
        extdelegatecallGas: 0,
        extstaticcallGas: 0,
        returndataloadGas: 3,
        minRetainedGas: 5000,
        minCalleeGas: 2300, //Minimum gas available to the the address called by an EXT*CALL opcode
    },
    /**
     * EOF - Data section access instructions
     */
    7480: {
        // gasPrices
        dataloadGas: 4,
        dataloadnGas: 3,
        datasizeGas: 2,
        datacopyGas: 3, // Base fee of the DATACOPY opcode
    },
    /**
  .  * BLOBBASEFEE opcode
  .  */
    7516: {
        // gasPrices
        blobbasefeeGas: 2, // Gas cost of the BLOBBASEFEE opcode
    },
    /**
  .  * EOF Contract Creation
  .  */
    7620: {
        /* Note: per EIP these are the additionally required EIPs:
        EIP 170 - (Max contract size) - Included in Spurious Dragon
      */
        // gasPrices
        eofcreateGas: 32000,
        returncontractGas: 0, // Base fee of the RETURNCONTRACT opcode
    },
};
//# sourceMappingURL=params.js.map