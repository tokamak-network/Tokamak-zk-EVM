import { ContainerSectionType } from './verify.js';
import type { EVM } from '../evm.js';
export declare enum EOFContainerMode {
    Default = 0,
    Initmode = 1,
    TxInitmode = 2
}
/**
 * The EOFHeader, describing the header of the EOF container
 */
declare class EOFHeader {
    typeSize: number;
    codeSizes: number[];
    containerSizes: number[];
    dataSize: number;
    dataSizePtr: number;
    buffer: Uint8Array;
    private codeStartPos;
    /**
     * Create an EOF header. Performs various validation checks inside the constructor
     * @param input either a raw header or a complete container
     */
    constructor(input: Uint8Array);
    sections(): (number | number[])[];
    sectionSizes(): number[];
    getCodePosition(section: number): number;
}
export interface TypeSection {
    inputs: number;
    outputs: number;
    maxStackHeight: number;
}
/**
 * The EOF body holds the contents of the EOF container, such as the code sections (bytecode),
 * the subcontainers (EOF containers to be deployed via EOFCREATE) and the data section
 */
declare class EOFBody {
    typeSections: TypeSection[];
    codeSections: Uint8Array[];
    containerSections: Uint8Array[];
    entireCode: Uint8Array;
    dataSection: Uint8Array;
    buffer: Uint8Array;
    txCallData?: Uint8Array;
    constructor(buf: Uint8Array, // Buffer of the body. This should be the entire body. It is not valid to pass an entire EOF container in here
    header: EOFHeader, // EOFHeader corresponding to this body
    eofMode?: EOFContainerMode, // Container mode of EOF
    dataSectionAllowedSmaller?: boolean);
    sections(): (Uint8Array | TypeSection[] | Uint8Array[])[];
    size(): {
        typeSize: number;
        codeSize: number;
        dataSize: number;
    };
    sectionSizes(): (number | number[])[];
}
/**
 * Main constructor for the EOFContainer
 */
export declare class EOFContainer {
    header: EOFHeader;
    body: EOFBody;
    buffer: Uint8Array;
    eofMode: EOFContainerMode;
    /**
     *
     * @param buf Entire container buffer
     * @param eofMode Container mode to validate the container on
     * @param dataSectionAllowedSmaller `true` if the data section is allowed to be smaller than the data section size in the header
     */
    constructor(buf: Uint8Array, eofMode?: EOFContainerMode, dataSectionAllowedSmaller?: boolean);
}
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
export declare function validateEOF(input: Uint8Array, evm: EVM, containerMode?: ContainerSectionType, eofMode?: EOFContainerMode): EOFContainer;
export {};
//# sourceMappingURL=container.d.ts.map