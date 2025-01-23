"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RustBN254 = exports.ripemdPrecompileAddress = exports.precompiles = exports.precompileEntries = exports.NobleBN254 = exports.NobleBLS = exports.MCLBLS = exports.getPrecompileName = exports.getActivePrecompiles = void 0;
const index_js_1 = require("@ethereumjs/common/dist/esm/index.js");
const index_js_2 = require("@ethereumjs/util/index.js");
const _01_ecrecover_js_1 = require("./01-ecrecover.js");
const _02_sha256_js_1 = require("./02-sha256.js");
const _03_ripemd160_js_1 = require("./03-ripemd160.js");
const _04_identity_js_1 = require("./04-identity.js");
const _05_modexp_js_1 = require("./05-modexp.js");
const _06_bn254_add_js_1 = require("./06-bn254-add.js");
const _07_bn254_mul_js_1 = require("./07-bn254-mul.js");
const _08_bn254_pairing_js_1 = require("./08-bn254-pairing.js");
const _09_blake2f_js_1 = require("./09-blake2f.js");
const _0a_kzg_point_evaluation_js_1 = require("./0a-kzg-point-evaluation.js");
const _0b_bls12_g1add_js_1 = require("./0b-bls12-g1add.js");
const _0c_bls12_g1mul_js_1 = require("./0c-bls12-g1mul.js");
const _0d_bls12_g1msm_js_1 = require("./0d-bls12-g1msm.js");
const _0e_bls12_g2add_js_1 = require("./0e-bls12-g2add.js");
const _0f_bls12_g2mul_js_1 = require("./0f-bls12-g2mul.js");
const _10_bls12_g2msm_js_1 = require("./10-bls12-g2msm.js");
const _11_bls12_pairing_js_1 = require("./11-bls12-pairing.js");
const _12_bls12_map_fp_to_g1_js_1 = require("./12-bls12-map-fp-to-g1.js");
const _13_bls12_map_fp2_to_g2_js_1 = require("./13-bls12-map-fp2-to-g2.js");
const index_js_3 = require("./bls12_381/index.js");
Object.defineProperty(exports, "MCLBLS", { enumerable: true, get: function () { return index_js_3.MCLBLS; } });
Object.defineProperty(exports, "NobleBLS", { enumerable: true, get: function () { return index_js_3.NobleBLS; } });
const index_js_4 = require("./bn254/index.js");
Object.defineProperty(exports, "NobleBN254", { enumerable: true, get: function () { return index_js_4.NobleBN254; } });
Object.defineProperty(exports, "RustBN254", { enumerable: true, get: function () { return index_js_4.RustBN254; } });
var PrecompileAvailabilityCheck;
(function (PrecompileAvailabilityCheck) {
    PrecompileAvailabilityCheck[PrecompileAvailabilityCheck["EIP"] = 0] = "EIP";
    PrecompileAvailabilityCheck[PrecompileAvailabilityCheck["Hardfork"] = 1] = "Hardfork";
})(PrecompileAvailabilityCheck || (PrecompileAvailabilityCheck = {}));
const BYTES_19 = '00000000000000000000000000000000000000';
const ripemdPrecompileAddress = BYTES_19 + '03';
exports.ripemdPrecompileAddress = ripemdPrecompileAddress;
const precompileEntries = [
    {
        address: BYTES_19 + '01',
        check: {
            type: PrecompileAvailabilityCheck.Hardfork,
            param: index_js_1.Hardfork.Chainstart,
        },
        precompile: _01_ecrecover_js_1.precompile01,
        name: 'ECRECOVER (0x01)',
    },
    {
        address: BYTES_19 + '02',
        check: {
            type: PrecompileAvailabilityCheck.Hardfork,
            param: index_js_1.Hardfork.Chainstart,
        },
        precompile: _02_sha256_js_1.precompile02,
        name: 'SHA256 (0x02)',
    },
    {
        address: BYTES_19 + '03',
        check: {
            type: PrecompileAvailabilityCheck.Hardfork,
            param: index_js_1.Hardfork.Chainstart,
        },
        precompile: _03_ripemd160_js_1.precompile03,
        name: 'RIPEMD160 (0x03)',
    },
    {
        address: BYTES_19 + '04',
        check: {
            type: PrecompileAvailabilityCheck.Hardfork,
            param: index_js_1.Hardfork.Chainstart,
        },
        precompile: _04_identity_js_1.precompile04,
        name: 'IDENTITY (0x04)',
    },
    {
        address: BYTES_19 + '05',
        check: {
            type: PrecompileAvailabilityCheck.Hardfork,
            param: index_js_1.Hardfork.Byzantium,
        },
        precompile: _05_modexp_js_1.precompile05,
        name: 'MODEXP (0x05)',
    },
    {
        address: BYTES_19 + '06',
        check: {
            type: PrecompileAvailabilityCheck.Hardfork,
            param: index_js_1.Hardfork.Byzantium,
        },
        precompile: _06_bn254_add_js_1.precompile06,
        name: 'BN254_ADD (0x06)',
    },
    {
        address: BYTES_19 + '07',
        check: {
            type: PrecompileAvailabilityCheck.Hardfork,
            param: index_js_1.Hardfork.Byzantium,
        },
        precompile: _07_bn254_mul_js_1.precompile07,
        name: 'BN254_MUL (0x07)',
    },
    {
        address: BYTES_19 + '08',
        check: {
            type: PrecompileAvailabilityCheck.Hardfork,
            param: index_js_1.Hardfork.Byzantium,
        },
        precompile: _08_bn254_pairing_js_1.precompile08,
        name: 'BN254_PAIRING (0x08)',
    },
    {
        address: BYTES_19 + '09',
        check: {
            type: PrecompileAvailabilityCheck.Hardfork,
            param: index_js_1.Hardfork.Istanbul,
        },
        precompile: _09_blake2f_js_1.precompile09,
        name: 'BLAKE2f (0x09)',
    },
    {
        address: BYTES_19 + '0a',
        check: {
            type: PrecompileAvailabilityCheck.EIP,
            param: 4844,
        },
        precompile: _0a_kzg_point_evaluation_js_1.precompile0a,
        name: 'KZG_POINT_EVALUATION (0x0a)',
    },
    {
        address: BYTES_19 + '0b',
        check: {
            type: PrecompileAvailabilityCheck.EIP,
            param: 2537,
        },
        precompile: _0b_bls12_g1add_js_1.precompile0b,
        name: 'BLS12_G1ADD (0x0b)',
    },
    {
        address: BYTES_19 + '0c',
        check: {
            type: PrecompileAvailabilityCheck.EIP,
            param: 2537,
        },
        precompile: _0c_bls12_g1mul_js_1.precompile0c,
        name: 'BLS12_G1MUL (0x0c)',
    },
    {
        address: BYTES_19 + '0d',
        check: {
            type: PrecompileAvailabilityCheck.EIP,
            param: 2537,
        },
        precompile: _0d_bls12_g1msm_js_1.precompile0d,
        name: 'BLS12_G1MSM (0x0d)',
    },
    {
        address: BYTES_19 + '0e',
        check: {
            type: PrecompileAvailabilityCheck.EIP,
            param: 2537,
        },
        precompile: _0e_bls12_g2add_js_1.precompile0e,
        name: 'BLS12_G2ADD (0x0e)',
    },
    {
        address: BYTES_19 + '0f',
        check: {
            type: PrecompileAvailabilityCheck.EIP,
            param: 2537,
        },
        precompile: _0f_bls12_g2mul_js_1.precompile0f,
        name: 'BLS12_G2MUL (0x0f)',
    },
    {
        address: BYTES_19 + '10',
        check: {
            type: PrecompileAvailabilityCheck.EIP,
            param: 2537,
        },
        precompile: _10_bls12_g2msm_js_1.precompile10,
        name: 'BLS12_G2MSM (0x10)',
    },
    {
        address: BYTES_19 + '11',
        check: {
            type: PrecompileAvailabilityCheck.EIP,
            param: 2537,
        },
        precompile: _11_bls12_pairing_js_1.precompile11,
        name: 'BLS12_PAIRING (0x11)',
    },
    {
        address: BYTES_19 + '12',
        check: {
            type: PrecompileAvailabilityCheck.EIP,
            param: 2537,
        },
        precompile: _12_bls12_map_fp_to_g1_js_1.precompile12,
        name: 'BLS12_MAP_FP_TO_G1 (0x12)',
    },
    {
        address: BYTES_19 + '13',
        check: {
            type: PrecompileAvailabilityCheck.EIP,
            param: 2537,
        },
        precompile: _13_bls12_map_fp2_to_g2_js_1.precompile13,
        name: 'BLS12_MAP_FP2_TO_G2 (0x13)',
    },
];
exports.precompileEntries = precompileEntries;
const precompiles = {
    [BYTES_19 + '01']: _01_ecrecover_js_1.precompile01,
    [BYTES_19 + '02']: _02_sha256_js_1.precompile02,
    [ripemdPrecompileAddress]: _03_ripemd160_js_1.precompile03,
    [BYTES_19 + '04']: _04_identity_js_1.precompile04,
    [BYTES_19 + '05']: _05_modexp_js_1.precompile05,
    [BYTES_19 + '06']: _06_bn254_add_js_1.precompile06,
    [BYTES_19 + '07']: _07_bn254_mul_js_1.precompile07,
    [BYTES_19 + '08']: _08_bn254_pairing_js_1.precompile08,
    [BYTES_19 + '09']: _09_blake2f_js_1.precompile09,
    [BYTES_19 + '0a']: _0a_kzg_point_evaluation_js_1.precompile0a,
    [BYTES_19 + '0b']: _0b_bls12_g1add_js_1.precompile0b,
    [BYTES_19 + '0c']: _0c_bls12_g1mul_js_1.precompile0c,
    [BYTES_19 + '0d']: _0d_bls12_g1msm_js_1.precompile0d,
    [BYTES_19 + '0e']: _0e_bls12_g2add_js_1.precompile0e,
    [BYTES_19 + '0f']: _0f_bls12_g2mul_js_1.precompile0f,
    [BYTES_19 + '10']: _10_bls12_g2msm_js_1.precompile10,
    [BYTES_19 + '11']: _11_bls12_pairing_js_1.precompile11,
    [BYTES_19 + '12']: _12_bls12_map_fp_to_g1_js_1.precompile12,
    [BYTES_19 + '13']: _13_bls12_map_fp2_to_g2_js_1.precompile13,
};
exports.precompiles = precompiles;
function getActivePrecompiles(common, customPrecompiles) {
    const precompileMap = new Map();
    if (customPrecompiles) {
        for (const precompile of customPrecompiles) {
            precompileMap.set((0, index_js_2.bytesToUnprefixedHex)(precompile.address.bytes), 'function' in precompile ? precompile.function : undefined);
        }
    }
    for (const entry of precompileEntries) {
        if (precompileMap.has(entry.address)) {
            continue;
        }
        const type = entry.check.type;
        if ((type === PrecompileAvailabilityCheck.Hardfork && common.gteHardfork(entry.check.param)) ||
            (entry.check.type === PrecompileAvailabilityCheck.EIP &&
                common.isActivatedEIP(entry.check.param))) {
            precompileMap.set(entry.address, entry.precompile);
        }
    }
    return precompileMap;
}
exports.getActivePrecompiles = getActivePrecompiles;
function getPrecompileName(addressUnprefixedStr) {
    if (addressUnprefixedStr.length < 40) {
        addressUnprefixedStr = addressUnprefixedStr.padStart(40, '0');
    }
    for (const entry of precompileEntries) {
        if (entry.address === addressUnprefixedStr) {
            return entry.name;
        }
    }
    return '';
}
exports.getPrecompileName = getPrecompileName;
//# sourceMappingURL=index.js.map