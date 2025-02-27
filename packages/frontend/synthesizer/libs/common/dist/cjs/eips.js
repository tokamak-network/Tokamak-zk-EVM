"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eipsDict = void 0;
const enums_js_1 = require("./enums.js");
exports.eipsDict = {
    /**
     * Frontier/Chainstart
     * (there is no Meta-EIP currently for Frontier, so 1 was chosen)
     */
    1: {
        minimumHardfork: enums_js_1.Hardfork.Chainstart,
    },
    /**
     * Homestead HF Meta EIP
     */
    606: {
        minimumHardfork: enums_js_1.Hardfork.Chainstart,
    },
    /**
     * TangerineWhistle HF Meta EIP
     */
    608: {
        minimumHardfork: enums_js_1.Hardfork.Homestead,
    },
    /**
     * Spurious Dragon HF Meta EIP
     */
    607: {
        minimumHardfork: enums_js_1.Hardfork.TangerineWhistle,
    },
    /**
     * Byzantium HF Meta EIP
     */
    609: {
        minimumHardfork: enums_js_1.Hardfork.SpuriousDragon,
    },
    /**
     * Constantinople HF Meta EIP
     */
    1013: {
        minimumHardfork: enums_js_1.Hardfork.Constantinople,
    },
    /**
     * Petersburg HF Meta EIP
     */
    1716: {
        minimumHardfork: enums_js_1.Hardfork.Constantinople,
    },
    /**
     * Istanbul HF Meta EIP
     */
    1679: {
        minimumHardfork: enums_js_1.Hardfork.Constantinople,
    },
    /**
     * MuirGlacier HF Meta EIP
     */
    2384: {
        minimumHardfork: enums_js_1.Hardfork.Istanbul,
    },
    /**
     * Description : SWAPN, DUPN and EXCHANGE instructions
     * URL         : https://github.com/ethereum/EIPs/blob/bd421962b4e241aa2b00a85d9cf4e57770bdb954/EIPS/eip-663.md
     * Status      : Review
     */
    663: {
        minimumHardfork: enums_js_1.Hardfork.Chainstart,
        requiredEIPs: [3540, 5450],
    },
    /**
     * Description : Transient storage opcodes
     * URL         : https://eips.ethereum.org/EIPS/eip-1153
     * Status      : Final
     */
    1153: {
        minimumHardfork: enums_js_1.Hardfork.Chainstart,
    },
    /**
     * Description : Fee market change for ETH 1.0 chain
     * URL         : https://eips.ethereum.org/EIPS/eip-1559
     * Status      : Final
     */
    1559: {
        minimumHardfork: enums_js_1.Hardfork.Berlin,
        requiredEIPs: [2930],
    },
    /**
     * Description : ModExp gas cost
     * URL         : https://eips.ethereum.org/EIPS/eip-2565
     * Status      : Final
     */
    2565: {
        minimumHardfork: enums_js_1.Hardfork.Byzantium,
    },
    /**
     * Description : BLS12-381 precompiles
     * URL         : https://eips.ethereum.org/EIPS/eip-2537
     * Status      : Review
     */
    2537: {
        minimumHardfork: enums_js_1.Hardfork.Chainstart,
    },
    /**
     * Description : Typed Transaction Envelope
     * URL         : https://eips.ethereum.org/EIPS/eip-2718
     * Status      : Final
     */
    2718: {
        minimumHardfork: enums_js_1.Hardfork.Chainstart,
    },
    /**
     * Description : Gas cost increases for state access opcodes
     * URL         : https://eips.ethereum.org/EIPS/eip-2929
     * Status      : Final
     */
    2929: {
        minimumHardfork: enums_js_1.Hardfork.Chainstart,
    },
    /**
     * Description : Optional access lists
     * URL         : https://eips.ethereum.org/EIPS/eip-2930
     * Status      : Final
     */
    2930: {
        minimumHardfork: enums_js_1.Hardfork.Istanbul,
        requiredEIPs: [2718, 2929],
    },
    /**
     * Description : Save historical block hashes in state (Verkle related usage, UNSTABLE)
     * URL         : https://github.com/gballet/EIPs/pull/3/commits/2e9ac09a142b0d9fb4db0b8d4609f92e5d9990c5
     * Status      : Draft
     */
    2935: {
        minimumHardfork: enums_js_1.Hardfork.Chainstart,
    },
    /**
     * Description : BASEFEE opcode
     * URL         : https://eips.ethereum.org/EIPS/eip-3198
     * Status      : Final
     */
    3198: {
        minimumHardfork: enums_js_1.Hardfork.London,
    },
    /**
     * Description : Reduction in refunds
     * URL         : https://eips.ethereum.org/EIPS/eip-3529
     * Status      : Final
     */
    3529: {
        minimumHardfork: enums_js_1.Hardfork.Berlin,
        requiredEIPs: [2929],
    },
    /**
     * Description : EVM Object Format (EOF) v1
     * URL         : https://github.com/ethereum/EIPs/blob/bd421962b4e241aa2b00a85d9cf4e57770bdb954/EIPS/eip-3540.md
     * Status      : Review
     */
    3540: {
        minimumHardfork: enums_js_1.Hardfork.London,
        requiredEIPs: [3541, 3860],
    },
    /**
     * Description : Reject new contracts starting with the 0xEF byte
     * URL         : https://eips.ethereum.org/EIPS/eip-3541
     * Status      : Final
     */
    3541: {
        minimumHardfork: enums_js_1.Hardfork.Berlin,
    },
    /**
     * Description : Difficulty Bomb Delay to December 1st 2021
     * URL         : https://eips.ethereum.org/EIPS/eip-3554
     * Status      : Final
     */
    3554: {
        minimumHardfork: enums_js_1.Hardfork.MuirGlacier,
    },
    /**
     * Description : Reject transactions from senders with deployed code
     * URL         : https://eips.ethereum.org/EIPS/eip-3607
     * Status      : Final
     */
    3607: {
        minimumHardfork: enums_js_1.Hardfork.Chainstart,
    },
    /**
     * Description : Warm COINBASE
     * URL         : https://eips.ethereum.org/EIPS/eip-3651
     * Status      : Final
     */
    3651: {
        minimumHardfork: enums_js_1.Hardfork.London,
        requiredEIPs: [2929],
    },
    /**
     * Description : EOF - Code Validation
     * URL         : https://github.com/ethereum/EIPs/blob/bd421962b4e241aa2b00a85d9cf4e57770bdb954/EIPS/eip-3670.md
     * Status      : Review
     */
    3670: {
        minimumHardfork: enums_js_1.Hardfork.London,
        requiredEIPs: [3540],
    },
    /**
     * Description : Upgrade consensus to Proof-of-Stake
     * URL         : https://eips.ethereum.org/EIPS/eip-3675
     * Status      : Final
     */
    3675: {
        minimumHardfork: enums_js_1.Hardfork.London,
    },
    /**
     * Description : PUSH0 instruction
     * URL         : https://eips.ethereum.org/EIPS/eip-3855
     * Status      : Final
     */
    3855: {
        minimumHardfork: enums_js_1.Hardfork.Chainstart,
    },
    /**
     * Description : Limit and meter initcode
     * URL         : https://eips.ethereum.org/EIPS/eip-3860
     * Status      : Final
     */
    3860: {
        minimumHardfork: enums_js_1.Hardfork.SpuriousDragon,
    },
    /**
     * Description : EOF - Static relative jumps
     * URL         : https://github.com/ethereum/EIPs/blob/bd421962b4e241aa2b00a85d9cf4e57770bdb954/EIPS/eip-4200.md
     * Status      : Review
     */
    4200: {
        minimumHardfork: enums_js_1.Hardfork.London,
        requiredEIPs: [3540, 3670],
    },
    /**
     * Description : Difficulty Bomb Delay to June 2022
     * URL         : https://eips.ethereum.org/EIPS/eip-4345
     * Status      : Final
     */
    4345: {
        minimumHardfork: enums_js_1.Hardfork.London,
    },
    /**
     * Description : Supplant DIFFICULTY opcode with PREVRANDAO
     * URL         : https://eips.ethereum.org/EIPS/eip-4399
     * Status      : Final
     */
    4399: {
        minimumHardfork: enums_js_1.Hardfork.London,
    },
    /**
     * Description : EOF - Functions
     * URL         : https://github.com/ethereum/EIPs/blob/bd421962b4e241aa2b00a85d9cf4e57770bdb954/EIPS/eip-4750.md
     * Status      : Review
     */
    4750: {
        minimumHardfork: enums_js_1.Hardfork.London,
        requiredEIPs: [3540, 3670, 5450],
    },
    /**
     * Description : Beacon block root in the EVM
     * URL         : https://eips.ethereum.org/EIPS/eip-4788
     * Status      : Final
     */
    4788: {
        minimumHardfork: enums_js_1.Hardfork.Cancun,
    },
    /**
     * Description : Shard Blob Transactions
     * URL         : https://eips.ethereum.org/EIPS/eip-4844
     * Status      : Final
     */
    4844: {
        minimumHardfork: enums_js_1.Hardfork.Paris,
        requiredEIPs: [1559, 2718, 2930, 4895],
    },
    /**
     * Description : Beacon chain push withdrawals as operations
     * URL         : https://eips.ethereum.org/EIPS/eip-4895
     * Status      : Final
     */
    4895: {
        minimumHardfork: enums_js_1.Hardfork.Paris,
    },
    /**
     * Description : Delaying Difficulty Bomb to mid-September 2022
     * URL         : https://eips.ethereum.org/EIPS/eip-5133
     * Status      : Final
     */
    5133: {
        minimumHardfork: enums_js_1.Hardfork.GrayGlacier,
    },
    /**
     * Description : EOF - Stack Validation
     * URL         : https://github.com/ethereum/EIPs/blob/bd421962b4e241aa2b00a85d9cf4e57770bdb954/EIPS/eip-5450.md
     * Status      : Review
     */
    5450: {
        minimumHardfork: enums_js_1.Hardfork.London,
        requiredEIPs: [3540, 3670, 4200, 4750],
    },
    /**
     * Description : MCOPY - Memory copying instruction
     * URL         : https://eips.ethereum.org/EIPS/eip-5656
     * Status      : Final
     */
    5656: {
        minimumHardfork: enums_js_1.Hardfork.Shanghai,
    },
    /**
     * Description : Supply validator deposits on chain
     * URL         : https://eips.ethereum.org/EIPS/eip-6110
     * Status      : Review
     */
    6110: {
        minimumHardfork: enums_js_1.Hardfork.Cancun,
        requiredEIPs: [7685],
    },
    /**
     * Description : EOF - JUMPF and non-returning functions
     * URL         : https://github.com/ethereum/EIPs/blob/bd421962b4e241aa2b00a85d9cf4e57770bdb954/EIPS/eip-6206.md
     * Status      : Review
     */
    6206: {
        minimumHardfork: enums_js_1.Hardfork.London,
        requiredEIPs: [4750, 5450],
    },
    /**
     * Description : SELFDESTRUCT only in same transaction
     * URL         : https://eips.ethereum.org/EIPS/eip-6780
     * Status      : Final
     */
    6780: {
        minimumHardfork: enums_js_1.Hardfork.London,
    },
    /**
     * Description : Ethereum state using a unified verkle tree (experimental)
     * URL         : https://github.com/ethereum/EIPs/pull/6800
     * Status      : Draft
     */
    6800: {
        minimumHardfork: enums_js_1.Hardfork.London,
    },
    /**
     * Description : Execution layer triggerable withdrawals (experimental)
     * URL         : https://github.com/ethereum/EIPs/blob/3b5fcad6b35782f8aaeba7d4ac26004e8fbd720f/EIPS/eip-7002.md
     * Status      : Review
     */
    7002: {
        minimumHardfork: enums_js_1.Hardfork.Paris,
        requiredEIPs: [7685],
    },
    /**
     * Description : Revamped CALL instructions
     * URL         : https://github.com/ethereum/EIPs/blob/bd421962b4e241aa2b00a85d9cf4e57770bdb954/EIPS/eip-7069.md
     * Status      : Review
     */
    7069: {
        minimumHardfork: enums_js_1.Hardfork.Berlin,
        /* Note: per EIP these are the additionally required EIPs:
          EIP 150 - This is the entire Tangerine Whistle hardfork
          EIP 211 - (RETURNDATASIZE / RETURNDATACOPY) - Included in Byzantium
          EIP 214 - (STATICCALL) - Included in Byzantium
        */
        requiredEIPs: [2929],
    },
    /**
     * Description : Increase the MAX_EFFECTIVE_BALANCE -> Execution layer triggered consolidations (experimental)
     * URL         : https://eips.ethereum.org/EIPS/eip-7251
     * Status      : Draft
     */
    7251: {
        minimumHardfork: enums_js_1.Hardfork.Paris,
        requiredEIPs: [7685],
    },
    /**
     * Description : EOF - Data section access instructions
     * URL         : https://github.com/ethereum/EIPs/blob/bd421962b4e241aa2b00a85d9cf4e57770bdb954/EIPS/eip-7480.md
     * Status      : Review
     */
    7480: {
        minimumHardfork: enums_js_1.Hardfork.London,
        requiredEIPs: [3540, 3670],
    },
    /**
     * Description : BLOBBASEFEE opcode
     * URL         : https://eips.ethereum.org/EIPS/eip-7516
     * Status      : Final
     */
    7516: {
        minimumHardfork: enums_js_1.Hardfork.Paris,
        requiredEIPs: [4844],
    },
    /**
     * Description : EOF Contract Creation
     * URL         : https://github.com/ethereum/EIPs/blob/dd32a34cfe4473bce143641bfffe4fd67e1987ab/EIPS/eip-7620.md
     * Status      : Review
     */
    7620: {
        minimumHardfork: enums_js_1.Hardfork.London,
        /* Note: per EIP these are the additionally required EIPs:
          EIP 170 - (Max contract size) - Included in Spurious Dragon
        */
        requiredEIPs: [3540, 3541, 3670],
    },
    /**
     * Description : General purpose execution layer requests
     * URL         : https://eips.ethereum.org/EIPS/eip-7685
     * Status      : Review
     */
    7685: {
        // TODO: Set correct minimum hardfork
        minimumHardfork: enums_js_1.Hardfork.Cancun,
        requiredEIPs: [3675],
    },
    /**
     * Description : EVM Object Format (EOFv1) Meta
     * URL         : https://github.com/ethereum/EIPs/blob/4153e95befd0264082de3c4c2fe3a85cc74d3152/EIPS/eip-7692.md
     * Status      : Draft
     */
    7692: {
        minimumHardfork: enums_js_1.Hardfork.Cancun,
        requiredEIPs: [663, 3540, 3670, 4200, 4750, 5450, 6206, 7069, 7480, 7620, 7698],
    },
    /**
     * Description : EOF - Creation transaction
     * URL         : https://github.com/ethereum/EIPs/blob/bd421962b4e241aa2b00a85d9cf4e57770bdb954/EIPS/eip-7698.md
     * Status      : Draft
     */
    7698: {
        minimumHardfork: enums_js_1.Hardfork.London,
        requiredEIPs: [3540, 7620],
    },
    /**
     * Description : Set EOA account code for one transaction
     * URL         : https://github.com/ethereum/EIPs/blob/62419ca3f45375db00b04a368ea37c0bfb05386a/EIPS/eip-7702.md
     * Status      : Review
     */
    7702: {
        // TODO: Set correct minimum hardfork
        minimumHardfork: enums_js_1.Hardfork.Cancun,
        requiredEIPs: [2718, 2929, 2930],
    },
    /**
     * Description : Use historical block hashes saved in state for BLOCKHASH
     * URL         : https://eips.ethereum.org/EIPS/eip-7709
     * Status      : Final
     */
    7709: {
        minimumHardfork: enums_js_1.Hardfork.Chainstart,
        requiredEIPs: [2935],
    },
};
//# sourceMappingURL=eips.js.map