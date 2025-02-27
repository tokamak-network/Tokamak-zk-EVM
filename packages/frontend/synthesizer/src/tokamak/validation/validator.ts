<<<<<<< HEAD
import { bytesToBigInt } from "@ethereumjs/util/index.js"

import { InvalidInputCountError, UndefinedSubcircuitError } from './errors.js'

import type { RunState } from '../../interpreter.js'
import type { ArithmeticOperator, DataPt } from '../types/index.js'

/**
 * Class responsible for Synthesizer-related validations
 */
export class SynthesizerValidator {
  /**
   * Validates if the input count matches the expected count
   *
   * @param name Operator name
   * @param actual Actual input count
   * @param expected Expected input count
   * @throws {InvalidInputCountError} If input count doesn't match
   */
  static validateInputCount(name: string, actual: number, expected: number): void {
    if (actual !== expected) {
      throw new InvalidInputCountError(name, expected, actual)
    }
  }

  /**
   * Validates if the subcircuit name is valid
   *
   * @param name Subcircuit name
   * @param validNames List of valid subcircuit names
   * @throws {UndefinedSubcircuitError} If subcircuit name is invalid
   */
  static validateSubcircuitName(name: string, validNames: string[]): void {
    if (!validNames.includes(name)) {
      throw new UndefinedSubcircuitError(name)
    }
  }

  /**
   * Validates if the given opcode is implemented
   * @param opcode Opcode to validate
   * @throws {Error} If opcode is not implemented
   */
  public static validateImplementedOpcode(opcode: string): void {
    const implementedOpcodes: ArithmeticOperator[] = [
      'ADD', 'MUL', 'SUB', 'DIV', 'SDIV', 'MOD', 'SMOD',
      'ADDMOD', 'MULMOD', 'EXP', 'SIGNEXTEND', 'LT', 'GT',
      'SLT', 'SGT', 'EQ', 'ISZERO', 'AND', 'OR', 'XOR',
      'NOT', 'BYTE', 'SHL', 'SHR', 'SAR', 'DecToBit', 'SubEXP',
    ] 

    if (!implementedOpcodes.includes(opcode as ArithmeticOperator)) {
      throw new Error(`Synthesizer: Opcode '${opcode}' is not implemented`)
    }
  }

   /**
   * Validates that the opcode is implemented
   * @param opcode The opcode number
   * @param opcodeName The opcode name
   * @throws Error if the opcode is not implemented
   */
  public static validateOpcodeImplemented(opcode: number, opcodeName: string): void {
    throw new Error(`Synthesizer: Opcode ${opcodeName} (0x${opcode.toString(16)}) is not implemented yet`)
  }

  /**
   * Validates if the inputs are valid
   *
   * @param inputs Array of inputs to validate
   * @throws {Error} If input is null or undefined
   */
  static validateInputs(inputs: DataPt[]): void {
    for (const input of inputs) {
      if (input === null || input === undefined) {
        throw new Error('Input cannot be null or undefined')
      }
      if (typeof input.value !== 'bigint') {
        throw new Error('Input value must be a bigint')
      }
    }
  }

  /**
   * Validates number range
   *
   * @param value Value to validate
   * @param min Minimum value
   * @param max Maximum value
   * @param paramName Parameter name
   * @throws {Error} If value is out of range
   */
  static validateRange(
    value: number | bigint,
    min: number | bigint,
    max: number | bigint,
    paramName: string,
  ): void {
    if (value < min || value > max) {
      throw new Error(`${paramName} must be between ${min} and ${max}, got ${value}`)
    }
  }

  /**
   * Validates if the value is within Ethereum word size limits
   * @param value Value to validate
   * @throws {Error} If value is negative or exceeds word size
   */
  static validateValue(value: bigint): void {
    if (value < 0n) {
      throw new Error('Negative values are not allowed')
    }
    if (value > 2n ** 256n - 1n) {
      throw new Error('The value exceeds Ethereum word size')
    }
  }
}

export class SynthesizerInstructionValidator {
  constructor(private runState: RunState) {}

  /**
   * Validates arithmetic inputs
   */
  public validateArithInputs(inPts: DataPt[], ins: bigint[], op: string): void {
    if (inPts.length !== ins.length) {
      throw new Error(`Synthesizer: ${op}: Input data mismatch`)
    }

    for (let i = 0; i < ins.length; i++) {
      if (inPts[i].value !== ins[i]) {
        throw new Error(`Synthesizer: ${op}: Input data mismatch`)
      }
    }
  }

  /**
   * Validates arithmetic output
   */
  public validateArithOutput(outPt: DataPt, expectedValue: bigint, op: string): void {
    if (outPt.value !== expectedValue) {
      throw new Error(`Synthesizer: ${op}: Output data mismatch`)
    }
  }

  /**
   * Validates Keccak256 data
   */
  public validateKeccakData(offset: number, length: number, mutDataPt: DataPt): void {
    const data = this.runState.memory.read(offset, length)
    if (bytesToBigInt(data) !== mutDataPt.value) {
      throw new Error('Synthesizer: KECCAK256: Data loaded to be hashed mismatch')
    }
  }
}
=======
import { bytesToBigInt } from "@synthesizer-libs/util"

import { InvalidInputCountError, UndefinedSubcircuitError } from './errors.js'

import type { RunState } from '../../interpreter.js'
import type { ArithmeticOperator, DataPt } from '../types/index.js'

/**
 * Class responsible for Synthesizer-related validations
 */
export class SynthesizerValidator {
  /**
   * Validates if the input count matches the expected count
   *
   * @param name Operator name
   * @param actual Actual input count
   * @param expected Expected input count
   * @throws {InvalidInputCountError} If input count doesn't match
   */
  static validateInputCount(name: string, actual: number, expected: number): void {
    if (actual !== expected) {
      throw new InvalidInputCountError(name, expected, actual)
    }
  }

  /**
   * Validates if the subcircuit name is valid
   *
   * @param name Subcircuit name
   * @param validNames List of valid subcircuit names
   * @throws {UndefinedSubcircuitError} If subcircuit name is invalid
   */
  static validateSubcircuitName(name: string, validNames: string[]): void {
    if (!validNames.includes(name)) {
      throw new UndefinedSubcircuitError(name)
    }
  }

  /**
   * Validates if the given opcode is implemented
   * @param opcode Opcode to validate
   * @throws {Error} If opcode is not implemented
   */
  public static validateImplementedOpcode(opcode: string): void {
    const implementedOpcodes: ArithmeticOperator[] = [
      'ADD', 'MUL', 'SUB', 'DIV', 'SDIV', 'MOD', 'SMOD',
      'ADDMOD', 'MULMOD', 'EXP', 'SIGNEXTEND', 'LT', 'GT',
      'SLT', 'SGT', 'EQ', 'ISZERO', 'AND', 'OR', 'XOR',
      'NOT', 'BYTE', 'SHL', 'SHR', 'SAR', 'DecToBit', 'SubEXP',
    ] 

    if (!implementedOpcodes.includes(opcode as ArithmeticOperator)) {
      throw new Error(`Synthesizer: Opcode '${opcode}' is not implemented`)
    }
  }

   /**
   * Validates that the opcode is implemented
   * @param opcode The opcode number
   * @param opcodeName The opcode name
   * @throws Error if the opcode is not implemented
   */
  public static validateOpcodeImplemented(opcode: number, opcodeName: string): void {
    throw new Error(`Synthesizer: Opcode ${opcodeName} (0x${opcode.toString(16)}) is not implemented yet`)
  }

  /**
   * Validates if the inputs are valid
   *
   * @param inputs Array of inputs to validate
   * @throws {Error} If input is null or undefined
   */
  static validateInputs(inputs: DataPt[]): void {
    for (const input of inputs) {
      if (input === null || input === undefined) {
        throw new Error('Input cannot be null or undefined')
      }
      if (typeof input.value !== 'bigint') {
        throw new Error('Input value must be a bigint')
      }
    }
  }

  /**
   * Validates number range
   *
   * @param value Value to validate
   * @param min Minimum value
   * @param max Maximum value
   * @param paramName Parameter name
   * @throws {Error} If value is out of range
   */
  static validateRange(
    value: number | bigint,
    min: number | bigint,
    max: number | bigint,
    paramName: string,
  ): void {
    if (value < min || value > max) {
      throw new Error(`${paramName} must be between ${min} and ${max}, got ${value}`)
    }
  }

  /**
   * Validates if the value is within Ethereum word size limits
   * @param value Value to validate
   * @throws {Error} If value is negative or exceeds word size
   */
  static validateValue(value: bigint): void {
    if (value < 0n) {
      throw new Error('Negative values are not allowed')
    }
    if (value > 2n ** 256n - 1n) {
      throw new Error('The value exceeds Ethereum word size')
    }
  }
}

export class SynthesizerInstructionValidator {
  constructor(private runState: RunState) {}

  /**
   * Validates arithmetic inputs
   */
  public validateArithInputs(inPts: DataPt[], ins: bigint[], op: string): void {
    if (inPts.length !== ins.length) {
      throw new Error(`Synthesizer: ${op}: Input data mismatch`)
    }

    for (let i = 0; i < ins.length; i++) {
      if (inPts[i].value !== ins[i]) {
        throw new Error(`Synthesizer: ${op}: Input data mismatch`)
      }
    }
  }

  /**
   * Validates arithmetic output
   */
  public validateArithOutput(outPt: DataPt, expectedValue: bigint, op: string): void {
    if (outPt.value !== expectedValue) {
      throw new Error(`Synthesizer: ${op}: Output data mismatch`)
    }
  }

  /**
   * Validates Keccak256 data
   */
  public validateKeccakData(offset: number, length: number, mutDataPt: DataPt): void {
    const data = this.runState.memory.read(offset, length)
    if (bytesToBigInt(data) !== mutDataPt.value) {
      throw new Error('Synthesizer: KECCAK256: Data loaded to be hashed mismatch')
    }
  }
}
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
