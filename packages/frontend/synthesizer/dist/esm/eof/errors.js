export var EOFError;
(function (EOFError) {
    // Stream Reader
    EOFError["OutOfBounds"] = "Trying to read out of bounds";
    EOFError["VerifyUint"] = "Uint does not match expected value ";
    EOFError["VerifyBytes"] = "Bytes do not match expected value";
    // Section Markers
    EOFError["FORMAT"] = "err: invalid format";
    EOFError["MAGIC"] = "err: invalid magic";
    EOFError["VERSION"] = "err: invalid eof version";
    EOFError["KIND_TYPE"] = "err: expected kind types";
    EOFError["KIND_CODE"] = "err: expected kind code";
    EOFError["KIND_DATA"] = "err: expected kind data";
    EOFError["TERMINATOR"] = "err: expected terminator";
    // Section Sizes
    EOFError["TypeSize"] = "missing type size";
    EOFError["InvalidTypeSize"] = "err: type section size invalid";
    EOFError["CodeSize"] = "missing code size";
    EOFError["CodeSectionSize"] = "code section should be at least one byte";
    EOFError["InvalidCodeSize"] = "code size does not match type size";
    EOFError["DataSize"] = "missing data size";
    EOFError["ContainerSize"] = "missing container size";
    EOFError["ContainerSectionSize"] = "container section should at least contain one section and at most 255 sections";
    // Type Section
    EOFError["TypeSections"] = "err: mismatch of code sections count and type signatures";
    EOFError["Inputs"] = "expected inputs";
    EOFError["Outputs"] = "expected outputs";
    EOFError["MaxInputs"] = "inputs exceeds 127, the maximum, got: ";
    EOFError["MaxOutputs"] = "outputs exceeds 127, the maximum, got: ";
    EOFError["Code0Inputs"] = "first code section should have 0 inputs";
    EOFError["Code0Outputs"] = "first code section should have 0x80 (terminating section) outputs";
    EOFError["MaxStackHeight"] = "expected maxStackHeight";
    EOFError["MaxStackHeightLimit"] = "stack height limit of 1024 exceeded: ";
    // Code/Data Section
    EOFError["MinCodeSections"] = "should have at least 1 code section";
    EOFError["MaxCodeSections"] = "can have at most 1024 code sections";
    EOFError["CodeSection"] = "expected a code section";
    EOFError["DataSection"] = "Expected data section";
    // Container section
    EOFError["ContainerSection"] = "expected a container section";
    EOFError["ContainerSectionMin"] = "container section should be at least 1 byte";
    EOFError["InvalidEOFCreateTarget"] = "EOFCREATE targets an undefined container";
    EOFError["InvalidRETURNContractTarget"] = "RETURNCONTRACT targets an undefined container";
    EOFError["ContainerDoubleType"] = "Container is targeted by both EOFCREATE and RETURNCONTRACT";
    EOFError["UnreachableContainerSections"] = "Unreachable containers (by both EOFCREATE and RETURNCONTRACT)";
    EOFError["ContainerTypeError"] = "Container contains opcodes which this mode (deployment mode / init code / runtime mode) cannot have";
    // Dangling Bytes
    EOFError["DanglingBytes"] = "got dangling bytes in body";
    // Code verification
    EOFError["InvalidOpcode"] = "invalid opcode";
    EOFError["InvalidTerminator"] = "invalid terminating opcode";
    EOFError["OpcodeIntermediatesOOB"] = "invalid opcode: intermediates out-of-bounds";
    EOFError["InvalidRJUMP"] = "invalid rjump* target";
    EOFError["InvalidCallTarget"] = "invalid callf/jumpf target";
    EOFError["InvalidCALLFReturning"] = "invalid callf: calls to non-returning function";
    EOFError["InvalidStackHeight"] = "invalid stack height";
    EOFError["InvalidJUMPF"] = "invalid jumpf target (output count)";
    EOFError["InvalidReturningSection"] = "invalid returning code section: section is not returning";
    EOFError["RJUMPVTableSize0"] = "invalid RJUMPV: table size 0";
    EOFError["UnreachableCodeSections"] = "unreachable code sections";
    EOFError["UnreachableCode"] = "unreachable code (by forward jumps)";
    EOFError["DataLoadNOutOfBounds"] = "DATALOADN reading out of bounds";
    EOFError["MaxStackHeightViolation"] = "Max stack height does not match the reported max stack height";
    EOFError["StackUnderflow"] = "Stack underflow";
    EOFError["StackOverflow"] = "Stack overflow";
    EOFError["UnstableStack"] = "Unstable stack (can reach stack under/overflow by jumps)";
    EOFError["RetfNoReturn"] = "Trying to return to undefined function";
    EOFError["ReturnStackOverflow"] = "Return stack overflow";
    EOFError["InvalidExtcallTarget"] = "invalid extcall target: address > 20 bytes";
    EOFError["InvalidReturnContractDataSize"] = "invalid RETURNCONTRACT: data size lower than expected";
    EOFError["InvalidEofFormat"] = "invalid EOF format";
})(EOFError = EOFError || (EOFError = {}));
export var SimpleErrors;
(function (SimpleErrors) {
    SimpleErrors["minContainerSize"] = "err: container size less than minimum valid size";
    SimpleErrors["invalidContainerSize"] = "err: invalid container size";
    SimpleErrors["typeSize"] = "err: type section size invalid";
    SimpleErrors["code0msh"] = "err: computed max stack height for code section 0 does not match expect";
    SimpleErrors["underflow"] = "err: stack underflow";
    SimpleErrors["code0IO"] = "err: input and output of first code section must be 0";
    // Stream Reader
    // OutOfBounds = 'err: relative offset out-of-bounds: ',
    SimpleErrors["VerifyUint"] = "Uint does not match expected value ";
    SimpleErrors["VerifyBytes"] = "Bytes do not match expected value";
    // Section Sizes
    SimpleErrors["TypeSize"] = "missing type size";
    SimpleErrors["InvalidTypeSize"] = "err: type section invalid";
    SimpleErrors["CodeSize"] = "missing code size";
    SimpleErrors["CodeSectionSize"] = "code section should be at least one byte";
    SimpleErrors["InvalidCodeSize"] = "code size does not match type size";
    SimpleErrors["DataSize"] = "missing data size";
    // Type Section
    SimpleErrors["TypeSections"] = "need to have a type section for each code section";
    SimpleErrors["Inputs"] = "expected inputs";
    SimpleErrors["Outputs"] = "expected outputs";
    SimpleErrors["MaxInputs"] = "inputs exceeds 127, the maximum, got: ";
    SimpleErrors["MaxOutputs"] = "outputs exceeds 127, the maximum, got: ";
    SimpleErrors["Code0Inputs"] = "first code section should have 0 inputs";
    SimpleErrors["Code0Outputs"] = "first code section should have 0 outputs";
    SimpleErrors["MaxStackHeight"] = "expected maxStackHeight";
    SimpleErrors["MaxStackHeightLimit"] = "stack height limit of 1024 exceeded: ";
    // Code/Data Section
    SimpleErrors["MinCodeSections"] = "should have at least 1 code section";
    SimpleErrors["MaxCodeSections"] = "can have at most 1024 code sections";
    SimpleErrors["CodeSection"] = "expected a code section";
    SimpleErrors["DataSection"] = "Expected data section";
    // Dangling Bytes
    SimpleErrors["DanglingBytes"] = "got dangling bytes in body";
})(SimpleErrors = SimpleErrors || (SimpleErrors = {}));
export function validationErrorMsg(type, ...args) {
    switch (type) {
        case EOFError.OutOfBounds: {
            return EOFError.OutOfBounds + ` at pos: ${args[0]}: ${args[1]}`;
        }
        case EOFError.VerifyBytes: {
            return EOFError.VerifyBytes + ` at pos: ${args[0]}: ${args[1]}`;
        }
        case EOFError.VerifyUint: {
            return EOFError.VerifyUint + `at pos: ${args[0]}: ${args[1]}`;
        }
        case EOFError.TypeSize: {
            return EOFError.TypeSize + args[0];
        }
        case EOFError.InvalidTypeSize: {
            return EOFError.InvalidTypeSize + args[0];
        }
        case EOFError.InvalidCodeSize: {
            return EOFError.InvalidCodeSize + args[0];
        }
        case EOFError.Inputs: {
            return `${EOFError.Inputs} - typeSection ${args[0]}`;
        }
        case EOFError.Outputs: {
            return `${EOFError.Outputs} - typeSection ${args[0]}`;
        }
        case EOFError.Code0Inputs: {
            return `first code section should have 0 inputs`;
        }
        case EOFError.Code0Outputs: {
            return `first code section should have 0 outputs`;
        }
        case EOFError.MaxInputs: {
            return EOFError.MaxInputs + `${args[1]} - code section ${args[0]}`;
        }
        case EOFError.MaxOutputs: {
            return EOFError.MaxOutputs + `${args[1]} - code section ${args[0]}`;
        }
        case EOFError.CodeSection: {
            return `expected code: codeSection ${args[0]}: `;
        }
        case EOFError.DataSection: {
            return EOFError.DataSection;
        }
        case EOFError.MaxStackHeight: {
            return `${EOFError.MaxStackHeight} - typeSection ${args[0]}: `;
        }
        case EOFError.MaxStackHeightLimit: {
            return `${EOFError.MaxStackHeightLimit}, got: ${args[1]} - typeSection ${args[0]}`;
        }
        case EOFError.DanglingBytes: {
            return EOFError.DanglingBytes;
        }
        default: {
            return type;
        }
    }
}
export function validationError(type, ...args) {
    switch (type) {
        case EOFError.OutOfBounds: {
            const pos = args[0];
            if (pos === 0 || pos === 2 || pos === 3 || pos === 6) {
                throw new Error(args[1]);
            }
            throw new Error(EOFError.OutOfBounds + ` `);
        }
        case EOFError.VerifyBytes: {
            const pos = args[0];
            if (pos === 0 || pos === 2 || pos === 3 || pos === 6) {
                throw new Error(args[1]);
            }
            throw new Error(EOFError.VerifyBytes + ` at pos: ${args[0]}: ${args[1]}`);
        }
        case EOFError.VerifyUint: {
            const pos = args[0];
            if (pos === 0 || pos === 2 || pos === 3 || pos === 6 || pos === 18) {
                throw new Error(args[1]);
            }
            throw new Error(EOFError.VerifyUint + `at pos: ${args[0]}: ${args[1]}`);
        }
        case EOFError.TypeSize: {
            throw new Error(EOFError.TypeSize + args[0]);
        }
        case EOFError.TypeSections: {
            throw new Error(`${EOFError.TypeSections} (types ${args[0]} code ${args[1]})`);
        }
        case EOFError.InvalidTypeSize: {
            throw new Error(EOFError.InvalidTypeSize);
        }
        case EOFError.InvalidCodeSize: {
            throw new Error(EOFError.InvalidCodeSize + args[0]);
        }
        case EOFError.Inputs: {
            throw new Error(`${EOFError.Inputs} - typeSection ${args[0]}`);
        }
        case EOFError.Outputs: {
            throw new Error(`${EOFError.Outputs} - typeSection ${args[0]}`);
        }
        case EOFError.Code0Inputs: {
            throw new Error(`first code section should have 0 inputs`);
        }
        case EOFError.Code0Outputs: {
            throw new Error(`first code section should have 0 outputs`);
        }
        case EOFError.MaxInputs: {
            throw new Error(EOFError.MaxInputs + `${args[1]} - code section ${args[0]}`);
        }
        case EOFError.MaxOutputs: {
            throw new Error(EOFError.MaxOutputs + `${args[1]} - code section ${args[0]}`);
        }
        case EOFError.CodeSection: {
            throw new Error(`expected code: codeSection ${args[0]}: `);
        }
        case EOFError.DataSection: {
            throw new Error(EOFError.DataSection);
        }
        case EOFError.MaxStackHeight: {
            throw new Error(`${EOFError.MaxStackHeight} - typeSection ${args[0]}: `);
        }
        case EOFError.MaxStackHeightLimit: {
            throw new Error(`${EOFError.MaxStackHeightLimit}, got: ${args[1]} - typeSection ${args[0]}`);
        }
        case EOFError.DanglingBytes: {
            throw new Error(EOFError.DanglingBytes);
        }
        default: {
            throw new Error(type);
        }
    }
}
//# sourceMappingURL=errors.js.map