interface WitnessCalculatorOptions {
  sanityCheck?: boolean
}

interface WASMInstance extends WebAssembly.Instance {
  exports: {
    getVersion: () => number
    getFieldNumLen32: () => number
    getWitnessSize: () => number
    getRawPrime: () => void
    init: (check: number) => void
    getInputSignalSize: (msbHash: number, lsbHash: number) => number
    getInputSize: () => number
    writeSharedRWMemory: (index: number, value: number) => void
    readSharedRWMemory: (index: number) => number
    setInputSignal: (msbHash: number, lsbHash: number, index: number) => void
    getWitness: (index: number) => void
    getMessageChar: () => number
  }
}

type InputMapValue = bigint[] | { [key: string]: InputMapValue }
type InputMap = { [key: string]: InputMapValue }

async function compileWasmModule(code: BufferSource): Promise<WebAssembly.Module> {
  try {
    return await WebAssembly.compile(code)
  } catch (err) {
    console.log(err)
    console.log('\nTry to run circom --c in order to generate c++ code instead\n')
    throw new Error(String(err))
  }
}

class WitnessLogger {
  private errStr: string = '';
    private msgStr: string = '';
    
     private readonly errorMessages: Record<number, string> = {
    1: 'Signal not found.',
    2: 'Too many signals set.',
    3: 'Signal already set.',
    4: 'Assert Failed.',
    5: 'Not enough memory.',
    6: 'Input signal array access exceeds the size.',
  };


  addError(err: string) {
    this.errStr += err + '\n';
  }

  addMessage(msg: string) {
    if (msg === '\n') {
      console.log(this.msgStr);
      this.msgStr = '';
    } else {
      if (this.msgStr !== '') {
        this.msgStr += ' ';
      }
      this.msgStr += msg;
    }
  }

  getErrors(): string {
    return this.errStr;
  }

  getMessages(): string {
    return this.msgStr;
    }
    
    appendMessage(msg: string) {
    if (this.msgStr !== '') {
      this.msgStr += ' ';
    }
    this.msgStr += msg;
  }

  hasErrors(): boolean {
    return this.errStr.length > 0;
    }
    
      handleException(code: number): never {
    const err = this.errorMessages[code] ?? 'Unknown error.';
    throw new Error(err + '\n' + this.errStr);
  }
}

export async function builder(code: BufferSource, options: WitnessCalculatorOptions = {}): Promise<WitnessCalculator> {
  const wasmModule = await compileWasmModule(code)
const logger = new WitnessLogger()

  function getMessage(): string {
    let message = ''
    let c = instance.exports.getMessageChar()
    while (c !== 0) {
      message += String.fromCharCode(c)
      c = instance.exports.getMessageChar()
    }
    return message
  }

  function printSharedRWMemory(): void {
    const sharedRwMemorySize = instance.exports.getFieldNumLen32()
    const arr = new Uint32Array(sharedRwMemorySize)
    for (let j = 0; j < sharedRwMemorySize; j++) {
      arr[sharedRwMemorySize - 1 - j] = instance.exports.readSharedRWMemory(j)
    }

    logger.appendMessage(fromArray32(arr).toString())
  }

  const instance = await WebAssembly.instantiate(wasmModule, {
      runtime: {
      exceptionHandler: (code: number) => logger.handleException(code),
      printErrorMessage: () => logger.addError(getMessage()),
      writeBufferMessage: () => logger.addMessage(getMessage()),
      showSharedRWMemory: printSharedRWMemory,
    },
  }) as WASMInstance

  return new WitnessCalculator(instance, options.sanityCheck)
}

class WitnessCalculator {
  private readonly instance: WASMInstance
  private readonly version: number
  private readonly n32: number
  private readonly prime: bigint
  private readonly witnessSize: number
  private readonly sanityCheck: boolean

  constructor(instance: WASMInstance, sanityCheck = false) {
    this.instance = instance
    this.version = this.instance.exports.getVersion()
    this.n32 = this.instance.exports.getFieldNumLen32()
    
    this.instance.exports.getRawPrime()
    const arr = new Uint32Array(this.n32)
    for (let i = 0; i < this.n32; i++) {
      arr[this.n32 - 1 - i] = this.instance.exports.readSharedRWMemory(i)
    }
    this.prime = fromArray32(arr)
    
    this.witnessSize = this.instance.exports.getWitnessSize()
    this.sanityCheck = sanityCheck
  }

  circom_version(): number {
    return this.version
  }

  private async _doCalculateWitness(inputOrig: InputMap, sanityCheck?: boolean): Promise<void> {
    this.instance.exports.init(this.sanityCheck || sanityCheck ? 1 : 0)
    
    const input: Record<string, unknown> = {}
    qualifyInput('', inputOrig, input)
    
    let inputCounter = 0
    for (const [key, value] of Object.entries(input)) {
      const h = fnvHash(key)
      const hMSB = parseInt(h.slice(0, 8), 16)
      const hLSB = parseInt(h.slice(8, 16), 16)
      const fArr = flatArray(value)
      
      const signalSize = this.instance.exports.getInputSignalSize(hMSB, hLSB)
      if (signalSize < 0) {
        throw new Error(`Signal ${key} not found\n`)
      }
      if (fArr.length < signalSize) {
        throw new Error(`Not enough values for input signal ${key}\n`)
      }
      if (fArr.length > signalSize) {
        throw new Error(`Too many values for input signal ${key}\n`)
      }

      for (let i = 0; i < fArr.length; i++) {
        const arrFr = toArray32(normalize(fArr[i], this.prime), this.n32)
        for (let j = 0; j < this.n32; j++) {
          this.instance.exports.writeSharedRWMemory(j, arrFr[this.n32 - 1 - j])
        }
        
        try {
          this.instance.exports.setInputSignal(hMSB, hLSB, i)
          inputCounter++
        } catch (err) {
          throw new Error(String(err))
        }
      }
    }

    if (inputCounter < this.instance.exports.getInputSize()) {
      throw new Error(
        `Not all inputs have been set. Only ${inputCounter} out of ${this.instance.exports.getInputSize()}`
      )
    }
  }

  // ... rest of the methods remain similar but with proper type annotations
}

// Helper functions with proper type annotations
function qualifyInput(prefix: string, input: unknown, input1: Record<string, unknown>): void {
  if (Array.isArray(input)) {
    const flattenedArray = flatArray(input)
    if (flattenedArray.length > 0) {
      const firstType = typeof flattenedArray[0]
      if (flattenedArray.some(item => typeof item !== firstType)) {
        throw new Error(`Types are not the same in the key ${prefix}`)
      }
      
      if (firstType === 'object') {
        qualifyInputList(prefix, input, input1)
      } else {
        input1[prefix] = input
      }
    } else {
      input1[prefix] = input
    }
  } else if (typeof input === 'object' && input !== null) {
    for (const [key, value] of Object.entries(input)) {
      const newPrefix = prefix ? `${prefix}.${key}` : key
      qualifyInput(newPrefix, value, input1)
    }
  } else {
    input1[prefix] = input
  }
}

function qualifyInputList(prefix: string, input: unknown[], input1: Record<string, unknown>): void {
  input.forEach((item, index) => {
    const newPrefix = `${prefix}[${index}]`
    qualifyInput(newPrefix, item, input1)
  })
}

function toArray32(rem: bigint, size: number): number[] {
  const res: number[] = []
  const radix = BigInt(0x100000000)
  
  while (rem) {
    res.unshift(Number(rem % radix))
    rem = rem / radix
  }
  
  return size ? Array(Math.max(0, size - res.length)).fill(0).concat(res) : res
}

function fromArray32(arr: Uint32Array): bigint {
  return arr.reduce((acc, val) => (acc * BigInt(0x100000000)) + BigInt(val), BigInt(0))
}

function flatArray(arr: unknown): unknown[] {
  const result: unknown[] = []
  
  function fillArray(res: unknown[], item: unknown): void {
    if (Array.isArray(item)) {
      item.forEach(subItem => fillArray(res, subItem))
    } else {
      res.push(item)
    }
  }
  
  fillArray(result, arr)
  return result
}

function normalize(n: unknown, prime: bigint): bigint {
  let res = BigInt(n as string | number | bigint) % prime
  if (res < 0) res += prime
  return res
}

function fnvHash(str: string): string {
  const uint64Max = BigInt(2) ** BigInt(64)
  let hash = BigInt('0xCBF29CE484222325')
  
  for (const char of str) {
    hash ^= BigInt(char.charCodeAt(0))
    hash *= BigInt('0x100000001b3')
    hash %= uint64Max
  }
  
  return hash.toString(16).padStart(16, '0')
} 