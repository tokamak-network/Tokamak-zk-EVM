"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEOF = exports.EOFContainer = exports.EOFContainerMode = void 0;
const constants_js_1 = require("./constants.js");
const errors_js_1 = require("./errors.js");
const verify_js_1 = require("./verify.js");
/*
  This file creates EOF Containers
  EOF Containers are described in EIP-3540.
  A container consists of a header and a body. The header describes the layout of the body.
  The body has the actual "interesting" contents, such as the bytecode to run, the data section,
  and possibly yet-to-be-deployed containers (via EOFCREATE, to create new EOF contracts from an existing one)
*/
// This enum marks the "mode" of a container
// Depending on this mode, certain extra checks for validity have to be done, or some checks can be skipped
var EOFContainerMode;
(function (EOFContainerMode) {
    EOFContainerMode[EOFContainerMode["Default"] = 0] = "Default";
    EOFContainerMode[EOFContainerMode["Initmode"] = 1] = "Initmode";
    EOFContainerMode[EOFContainerMode["TxInitmode"] = 2] = "TxInitmode";
})(EOFContainerMode = exports.EOFContainerMode || (exports.EOFContainerMode = {}));
// The StreamReader is a helper class to help reading byte arrays
class StreamReader {
    constructor(stream) {
        this.data = stream;
        this.ptr = 0;
    }
    /**
     * Read `amount` bytes from the stream. Throws when trying to read out of bounds with an optional error string.
     * This also updates the internal pointer
     * @param amount Bytes to read
     * @param errorStr Optional error string to throw when trying to read out-of-bounds
     * @returns The byte array with length `amount`
     */
    readBytes(amount, errorStr) {
        const end = this.ptr + amount;
        if (end > this.data.length) {
            (0, errors_js_1.validationError)(errors_js_1.EOFError.OutOfBounds, this.ptr, errorStr);
        }
        const ptr = this.ptr;
        this.ptr += amount;
        return this.data.slice(ptr, end);
    }
    /**
     * Reads an Uint8. Also updates the pointer.
     * @param errorStr Optional error string
     * @returns The uint8
     */
    readUint(errorStr) {
        if (this.ptr >= this.data.length) {
            (0, errors_js_1.validationError)(errors_js_1.EOFError.OutOfBounds, this.ptr, errorStr);
        }
        return this.data[this.ptr++];
    }
    /**
     * Verify that the current uint8 pointed to by the pointer is the expected uint8
     * Also updates the pointer
     * @param expect The uint to expect
     * @param errorStr Optional error string when the read uint is not the expected uint
     */
    verifyUint(expect, errorStr) {
        if (this.readUint() !== expect) {
            (0, errors_js_1.validationError)(errors_js_1.EOFError.VerifyUint, this.ptr - 1, errorStr);
        }
    }
    /**
     * Same as readUint, except this reads an uint16
     * @param errorStr
     * @returns
     */
    readUint16(errorStr) {
        const end = this.ptr + 2;
        if (end > this.data.length) {
            (0, errors_js_1.validationError)(errors_js_1.EOFError.OutOfBounds, this.ptr, errorStr);
        }
        const ptr = this.ptr;
        this.ptr += 2;
        return new DataView(this.data.buffer).getUint16(ptr);
    }
    /**
     * Get the current pointer of the stream
     * @returns The pointer
     */
    getPtr() {
        return this.ptr;
    }
    // Get the remainder bytes of the current stream
    readRemainder() {
        return this.data.slice(this.ptr);
    }
    // Returns `true` if the stream is fully read, or false if there are dangling bytes
    isAtEnd() {
        return this.ptr === this.data.length;
    }
}
// TODO add initcode flags (isEOFContract)
// TODO validation: mark sections as either initcode or runtime code to validate
/**
 * The EOFHeader, describing the header of the EOF container
 */
class EOFHeader {
    /**
     * Create an EOF header. Performs various validation checks inside the constructor
     * @param input either a raw header or a complete container
     */
    constructor(input) {
        if (input.length > constants_js_1.MAX_HEADER_SIZE) {
            throw new Error('err: container size more than maximum valid size');
        }
        const stream = new StreamReader(input);
        // Verify that the header starts with 0xEF0001
        stream.verifyUint(constants_js_1.FORMAT, errors_js_1.EOFError.FORMAT);
        stream.verifyUint(constants_js_1.MAGIC, errors_js_1.EOFError.MAGIC);
        stream.verifyUint(constants_js_1.VERSION, errors_js_1.EOFError.VERSION);
        if (input.length < 15) {
            throw new Error('err: container size less than minimum valid size');
        }
        // Verify that the types section is present and its length is valid
        stream.verifyUint(constants_js_1.KIND_TYPE, errors_js_1.EOFError.KIND_TYPE);
        const typeSize = stream.readUint16(errors_js_1.EOFError.TypeSize);
        if (typeSize < constants_js_1.TYPE_MIN) {
            (0, errors_js_1.validationError)(errors_js_1.EOFError.InvalidTypeSize, typeSize);
        }
        if (typeSize % constants_js_1.TYPE_DIVISOR !== 0) {
            (0, errors_js_1.validationError)(errors_js_1.EOFError.InvalidTypeSize, typeSize);
        }
        if (typeSize > constants_js_1.TYPE_MAX) {
            throw new Error(`err: number of code sections must not exceed 1024 (got ${typeSize})`);
        }
        // Verify that the code section is present and its size is valid
        stream.verifyUint(constants_js_1.KIND_CODE, errors_js_1.EOFError.KIND_CODE);
        const codeSize = stream.readUint16(errors_js_1.EOFError.CodeSize);
        if (codeSize < constants_js_1.CODE_MIN) {
            (0, errors_js_1.validationError)(errors_js_1.EOFError.MinCodeSections);
        }
        if (codeSize !== typeSize / constants_js_1.TYPE_DIVISOR) {
            (0, errors_js_1.validationError)(errors_js_1.EOFError.TypeSections, typeSize / constants_js_1.TYPE_DIVISOR, codeSize);
        }
        // Read the actual code sizes in the code section and verify that each section has the minimum size
        const codeSizes = [];
        for (let i = 0; i < codeSize; i++) {
            const codeSectionSize = stream.readUint16(errors_js_1.EOFError.CodeSection);
            if (codeSectionSize < constants_js_1.CODE_SIZE_MIN) {
                (0, errors_js_1.validationError)(errors_js_1.EOFError.CodeSectionSize);
            }
            codeSizes.push(codeSectionSize);
        }
        // Check if there are container sections
        let nextSection = stream.readUint();
        const containerSizes = [];
        if (nextSection === constants_js_1.KIND_CONTAINER) {
            // The optional container section is present, validate that the size is within bounds
            const containerSectionSize = stream.readUint16(errors_js_1.EOFError.ContainerSize);
            if (containerSectionSize < constants_js_1.CONTAINER_MIN) {
                (0, errors_js_1.validationError)(errors_js_1.EOFError.ContainerSectionSize);
            }
            if (containerSectionSize > constants_js_1.CONTAINER_MAX) {
                (0, errors_js_1.validationError)(errors_js_1.EOFError.ContainerSectionSize);
            }
            // Read the actual container sections and validate that each section has the minimum size
            for (let i = 0; i < containerSectionSize; i++) {
                const containerSize = stream.readUint16(errors_js_1.EOFError.ContainerSection);
                if (containerSize < constants_js_1.CONTAINER_SIZE_MIN) {
                    (0, errors_js_1.validationError)(errors_js_1.EOFError.ContainerSectionMin);
                }
                containerSizes.push(containerSize);
            }
            nextSection = stream.readUint();
        }
        // Verify that the next section is of the data type
        if (nextSection !== constants_js_1.KIND_DATA) {
            (0, errors_js_1.validationError)(errors_js_1.EOFError.KIND_DATA);
        }
        this.dataSizePtr = stream.getPtr();
        const dataSize = stream.readUint16(errors_js_1.EOFError.DataSize);
        // Verify that the header ends with the TERMINATOR byte
        stream.verifyUint(constants_js_1.TERMINATOR, errors_js_1.EOFError.TERMINATOR);
        // Write all values to the header object
        this.typeSize = typeSize;
        this.codeSizes = codeSizes;
        this.containerSizes = containerSizes;
        this.dataSize = dataSize;
        // Slice the input such that `this.buffer` is now the complete header
        // If there are dangling bytes in the stream, this is OK: this is the body section of the container
        this.buffer = input.slice(0, stream.getPtr());
        const relativeOffset = this.buffer.length + this.typeSize;
        // Write the start of the first code section into `codeStartPos`
        // Note: in EVM, if one would set the Program Counter to this byte, it would start executing the bytecode of the first code section
        this.codeStartPos = [relativeOffset];
    }
    sections() {
        return [this.typeSize, this.codeSizes, this.containerSizes, this.dataSize];
    }
    sectionSizes() {
        return [1, this.codeSizes.length, this.containerSizes.length, 1];
    }
    // Returns the code position in the container for the requested section
    // Setting the Program Counter in the EVM to a number of this array would start executing the bytecode of the indexed section
    getCodePosition(section) {
        if (this.codeStartPos[section]) {
            return this.codeStartPos[section];
        }
        const start = this.codeStartPos.length;
        let offset = this.codeStartPos[start - 1];
        for (let i = start; i <= section; i++) {
            offset += this.codeSizes[i - 1];
            this.codeStartPos[i] = offset;
        }
        return offset;
    }
}
/**
 * The EOF body holds the contents of the EOF container, such as the code sections (bytecode),
 * the subcontainers (EOF containers to be deployed via EOFCREATE) and the data section
 */
class EOFBody {
    // and these are used for the CALLDATA in the EVM when trying to create a contract via a transaction, and the deployment code is an EOF container
    constructor(buf, // Buffer of the body. This should be the entire body. It is not valid to pass an entire EOF container in here
    header, // EOFHeader corresponding to this body
    eofMode = EOFContainerMode.Default, // Container mode of EOF
    dataSectionAllowedSmaller = false) {
        const stream = new StreamReader(buf);
        const typeSections = [];
        // Read and parse each type section, and validate that the type section values are within valid bounds
        for (let i = 0; i < header.typeSize / 4; i++) {
            const inputs = stream.readUint(errors_js_1.EOFError.Inputs);
            const outputs = stream.readUint(errors_js_1.EOFError.Outputs);
            const maxStackHeight = stream.readUint16(errors_js_1.EOFError.MaxStackHeight);
            if (i === 0) {
                if (inputs !== 0) {
                    (0, errors_js_1.validationError)(errors_js_1.EOFError.Code0Inputs);
                }
                if (outputs !== 0x80) {
                    (0, errors_js_1.validationError)(errors_js_1.EOFError.Code0Outputs);
                }
            }
            if (inputs > constants_js_1.INPUTS_MAX) {
                (0, errors_js_1.validationError)(errors_js_1.EOFError.MaxInputs, i, inputs);
            }
            if (outputs > constants_js_1.OUTPUTS_MAX) {
                (0, errors_js_1.validationError)(errors_js_1.EOFError.MaxOutputs, i, outputs);
            }
            if (maxStackHeight > constants_js_1.MAX_STACK_HEIGHT) {
                (0, errors_js_1.validationError)(errors_js_1.EOFError.MaxStackHeightLimit, i, maxStackHeight);
            }
            typeSections.push({
                inputs,
                outputs,
                maxStackHeight,
            });
        }
        // Read each code section
        const codeStartPtr = stream.getPtr();
        const codes = [];
        for (const [i, codeSize] of header.codeSizes.entries()) {
            try {
                const code = stream.readBytes(codeSize);
                codes.push(code);
            }
            catch {
                (0, errors_js_1.validationError)(errors_js_1.EOFError.CodeSection, i);
            }
        }
        // Write the entire code section to the entireCodeSection
        const entireCodeSection = buf.slice(codeStartPtr, stream.getPtr());
        // Read all raw subcontainers and push those to the containers array
        const containers = [];
        for (const [i, containerSize] of header.containerSizes.entries()) {
            try {
                const container = stream.readBytes(containerSize);
                containers.push(container);
            }
            catch {
                (0, errors_js_1.validationError)(errors_js_1.EOFError.ContainerSection, i);
            }
        }
        // Data section of the body
        // Note: for EOF containers in Initmode (these are Subcontainers) it is allowed
        // to have a data section of size lower than what is written in the header
        // For details, see "Data section lifecycle" of EIP 7620
        let dataSection;
        // Edge case: deployment code validation
        if (eofMode !== EOFContainerMode.Initmode && !dataSectionAllowedSmaller) {
            dataSection = stream.readBytes(header.dataSize, errors_js_1.EOFError.DataSection);
            if (eofMode === EOFContainerMode.Default) {
                if (!stream.isAtEnd()) {
                    // If there are dangling bytes in default container mode, this is invalid
                    (0, errors_js_1.validationError)(errors_js_1.EOFError.DanglingBytes);
                }
            }
            else {
                // Tx init mode: the remaining bytes (if any) are used as CALLDATA in the EVM, in case of a Tx init
                this.txCallData = stream.readRemainder();
            }
        }
        else {
            dataSection = stream.readRemainder();
        }
        // Write all data to the object
        this.typeSections = typeSections;
        this.codeSections = codes;
        this.containerSections = containers;
        this.entireCode = entireCodeSection;
        this.dataSection = dataSection;
        this.buffer = buf;
    }
    sections() {
        return [this.typeSections, this.codeSections, this.dataSection];
    }
    size() {
        return {
            typeSize: this.typeSections.length,
            codeSize: this.codeSections.length,
            dataSize: this.dataSection.length,
        };
    }
    sectionSizes() {
        return [
            this.typeSections.map(() => 4),
            this.codeSections.map((b) => b.length),
            this.dataSection.length,
        ];
    }
}
/**
 * Main constructor for the EOFContainer
 */
class EOFContainer {
    /**
     *
     * @param buf Entire container buffer
     * @param eofMode Container mode to validate the container on
     * @param dataSectionAllowedSmaller `true` if the data section is allowed to be smaller than the data section size in the header
     */
    constructor(buf, eofMode = EOFContainerMode.Default, dataSectionAllowedSmaller = false) {
        this.eofMode = eofMode;
        this.header = new EOFHeader(buf);
        this.body = new EOFBody(buf.slice(this.header.buffer.length), this.header, eofMode, dataSectionAllowedSmaller);
        this.buffer = buf;
    }
}
exports.EOFContainer = EOFContainer;
/**
 * This method validates the EOF. It also performs deeper validation of the body, such as stack/opcode validation
 * This is ONLY necessary when trying to deploy contracts from a transaction: these can submit containers which are invalid
 * Since all deployed EOF containers are valid by definition, `validateEOF` does not need to be called each time an EOF contract is called
 * @param input Full container buffer
 * @param evm EVM, to read opcodes from
 * @param containerMode Container mode to validate on
 * @param eofMode EOF mode to run in
 * @returns
 */
function validateEOF(input, evm, containerMode = verify_js_1.ContainerSectionType.RuntimeCode, eofMode = EOFContainerMode.Default) {
    const container = new EOFContainer(input, eofMode, containerMode === verify_js_1.ContainerSectionType.DeploymentCode);
    const containerMap = (0, verify_js_1.verifyCode)(container, evm, containerMode);
    // Recursively validate the containerSections
    for (let i = 0; i < container.body.containerSections.length; i++) {
        const subContainer = container.body.containerSections[i];
        const mode = containerMap.get(i);
        validateEOF(subContainer, evm, mode);
    }
    return container;
}
exports.validateEOF = validateEOF;
//# sourceMappingURL=container.js.map