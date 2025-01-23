"use strict";
// Constants, which are taken from https://eips.ethereum.org/EIPS/eip-3540
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_STACK_HEIGHT = exports.OUTPUTS_MAX = exports.INPUTS_MAX = exports.CONTAINER_SIZE_MIN = exports.CONTAINER_MAX = exports.CONTAINER_MIN = exports.CODE_SIZE_MIN = exports.CODE_MIN = exports.TYPE_DIVISOR = exports.TYPE_MAX = exports.TYPE_MIN = exports.TERMINATOR = exports.KIND_DATA = exports.KIND_CONTAINER = exports.KIND_CODE = exports.KIND_TYPE = exports.MAX_HEADER_SIZE = exports.MIN_HEADER_SIZE = exports.VERSION = exports.MAGIC = exports.FORMAT = void 0;
// The "starting bytes" of an EOF contract
exports.FORMAT = 0xef;
exports.MAGIC = 0x00;
exports.VERSION = 0x01;
// The min/max sizes of valid headers
exports.MIN_HEADER_SIZE = 15; // Min size used to invalidate an invalid container quickly
exports.MAX_HEADER_SIZE = 49152; // Max initcode size, EIP 3860
exports.KIND_TYPE = 0x01; // Type byte of types section
exports.KIND_CODE = 0x02; // Type byte of code section
exports.KIND_CONTAINER = 0x03; // Type byte of container section (the only optional section in the header)
exports.KIND_DATA = 0x04; // Type byte of  data section
exports.TERMINATOR = 0x00; // Terminator byte of header
exports.TYPE_MIN = 0x0004; // Minimum size of types section
exports.TYPE_MAX = 0x1000; // Maximum size of types section
exports.TYPE_DIVISOR = 4; // Divisor of types: the type section size should be a multiple of this
exports.CODE_MIN = 0x0001; // Minimum size of code section
exports.CODE_SIZE_MIN = 1; // Minimum size of a code section in the body (the actual code)
exports.CONTAINER_MIN = 0x0001; // Minimum size of container section
exports.CONTAINER_MAX = 0x0100; // Maximum size of container section
exports.CONTAINER_SIZE_MIN = 1; // Minimum size of a container in the body
// Constants regarding the type section in the body of the container
exports.INPUTS_MAX = 0x7f; // Max inputs to a code section in the body
exports.OUTPUTS_MAX = 0x80; // Max outputs of a code section in the body
// Note: 0x80 special amount, marks the code section as "terminating"
// A terminating section will exit the current call frame, such as RETURN / STOP opcodes. It will not RETF to another code section
exports.MAX_STACK_HEIGHT = 0x03ff; // Maximum stack height of a code section (enforces that the stack of this section cannot overflow)
//# sourceMappingURL=constants.js.map