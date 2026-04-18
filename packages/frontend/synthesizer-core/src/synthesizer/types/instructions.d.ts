export type SynthesizerSupportedOpcodes = 'STOP' | SynthesizerSupportedArithOpcodes | SynthesizerSupportedEnvInfOpcodes | SynthesizerSupportedBlkInfOpcodes | SynthesizerSupportedSysFlowOpcodes | 'PUSH1' | 'PUSH2' | 'PUSH3' | 'PUSH4' | 'PUSH5' | 'PUSH6' | 'PUSH7' | 'PUSH8' | 'PUSH9' | 'PUSH10' | 'PUSH11' | 'PUSH12' | 'PUSH13' | 'PUSH14' | 'PUSH15' | 'PUSH16' | 'PUSH17' | 'PUSH18' | 'PUSH19' | 'PUSH20' | 'PUSH21' | 'PUSH22' | 'PUSH23' | 'PUSH24' | 'PUSH25' | 'PUSH26' | 'PUSH27' | 'PUSH28' | 'PUSH29' | 'PUSH30' | 'PUSH31' | 'PUSH32' | 'DUP1' | 'DUP2' | 'DUP3' | 'DUP4' | 'DUP5' | 'DUP6' | 'DUP7' | 'DUP8' | 'DUP9' | 'DUP10' | 'DUP11' | 'DUP12' | 'DUP13' | 'DUP14' | 'DUP15' | 'DUP16' | 'SWAP1' | 'SWAP2' | 'SWAP3' | 'SWAP4' | 'SWAP5' | 'SWAP6' | 'SWAP7' | 'SWAP8' | 'SWAP9' | 'SWAP10' | 'SWAP11' | 'SWAP12' | 'SWAP13' | 'SWAP14' | 'SWAP15' | 'SWAP16' | SynthesizerSupportedLogOpcodes;
export type SynthesizerSupportedArithOpcodes = 'ADD' | 'MUL' | 'SUB' | 'DIV' | 'SDIV' | 'MOD' | 'SMOD' | 'ADDMOD' | 'MULMOD' | 'EXP' | 'SIGNEXTEND' | 'LT' | 'GT' | 'SLT' | 'SGT' | 'EQ' | 'ISZERO' | 'AND' | 'OR' | 'XOR' | 'NOT' | 'BYTE' | 'SHL' | 'SHR' | 'SAR' | 'KECCAK256';
export type SynthesizerSupportedEnvInfOpcodes = 'ADDRESS' | 'BALANCE' | 'ORIGIN' | 'CALLER' | 'CALLVALUE' | 'CALLDATALOAD' | 'CALLDATASIZE' | 'CALLDATACOPY' | 'CODESIZE' | 'CODECOPY' | 'GASPRICE' | 'EXTCODESIZE' | 'EXTCODECOPY' | 'RETURNDATASIZE' | 'RETURNDATACOPY' | 'EXTCODEHASH';
export type SynthesizerSupportedBlkInfOpcodes = 'BLOCKHASH' | 'COINBASE' | 'TIMESTAMP' | 'NUMBER' | 'PREVRANDAO' | 'GASLIMIT' | 'CHAINID' | 'SELFBALANCE' | 'BASEFEE';
export type SynthesizerSupportedSysFlowOpcodes = 'POP' | 'MLOAD' | 'MSTORE' | 'MSTORE8' | 'SLOAD' | 'SSTORE' | 'JUMP' | 'JUMPI' | 'PC' | 'MSIZE' | 'GAS' | 'JUMPDEST' | 'MCOPY' | 'PUSH0' | 'CALL' | 'CALLCODE' | 'RETURN' | 'DELEGATECALL' | 'STATICCALL' | 'REVERT';
export type SynthesizerSupportedLogOpcodes = 'LOG0' | 'LOG1' | 'LOG2' | 'LOG3' | 'LOG4';
export declare const synthesizerOpcodeList: Record<number, SynthesizerSupportedOpcodes>;
/**
 * Reverse mapping: opcode name -> opcode number
 * Note: uses the declared list above as source of truth.
 */
export declare const synthesizerOpcodeByName: Readonly<Record<SynthesizerSupportedOpcodes, number>>;
//# sourceMappingURL=instructions.d.ts.map