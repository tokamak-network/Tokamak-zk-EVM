export async function builder(code: any): Promise<any> {
  let wasmModule: any;
  try {
    wasmModule = await WebAssembly.compile(code);
  } catch (err: any) {
    console.log(err);
    console.log(
      '\nTry to run circom --c in order to generate c++ code instead\n',
    );
    throw new Error(err);
  }

  let errStr = '';
  let msgStr = '';

  const instance: any = await WebAssembly.instantiate(wasmModule, {
    runtime: {
      exceptionHandler: function (code: number): void {
        let err: string;
        if (code == 1) {
          err = 'Signal not found.\n';
        } else if (code == 2) {
          err = 'Too many signals set.\n';
        } else if (code == 3) {
          err = 'Signal already set.\n';
        } else if (code == 4) {
          err = 'Assert Failed.\n';
        } else if (code == 5) {
          err = 'Not enough memory.\n';
        } else if (code == 6) {
          err = 'Input signal array access exceeds the size.\n';
        } else {
          err = 'Unknown error.\n';
        }
        throw new Error(err + errStr);
      },
      printErrorMessage: function (): void {
        errStr += getMessage() + '\n';
        // console.error(getMessage());
      },
      writeBufferMessage: function (): void {
        const msg = getMessage();
        // Any calls to `log()` will always end with a `\n`, so that's when we print and reset
        if (msg === '\n') {
          console.log(msgStr);
          msgStr = '';
        } else {
          // If we've buffered other content, put a space in between the items
          if (msgStr !== '') {
            msgStr += ' ';
          }
          // Then append the message to the message we are creating
          msgStr += msg;
        }
      },
      showSharedRWMemory: function (): void {
        printSharedRWMemory();
      },
    },
  });

  return new WitnessCalculator(instance);

  function getMessage(): string {
    var message = '';
    var c = instance.exports.getMessageChar();
    while (c != 0) {
      message += String.fromCharCode(c);
      c = instance.exports.getMessageChar();
    }
    return message;
  }

  function printSharedRWMemory(): void {
    const shared_rw_memory_size = instance.exports.getFieldNumLen32();
    const arr = new Uint32Array(shared_rw_memory_size);
    for (let j = 0; j < shared_rw_memory_size; j++) {
      arr[shared_rw_memory_size - 1 - j] =
        instance.exports.readSharedRWMemory(j);
    }

    // If we've buffered other content, put a space in between the items
    if (msgStr !== '') {
      msgStr += ' ';
    }
    // Then append the value to the message we are creating
    msgStr += fromArray32(arr).toString();
  }
}

class WitnessCalculator {
  instance: any;
  n32: number;
  prime: bigint;
  witnessSize: number;

  constructor(instance: any) {
    this.instance = instance;

    this.n32 = this.instance.exports.getFieldNumLen32();

    this.instance.exports.getRawPrime();
    const arr = new Uint32Array(this.n32);
    for (let i = 0; i < this.n32; i++) {
      arr[this.n32 - 1 - i] = this.instance.exports.readSharedRWMemory(i);
    }
    this.prime = fromArray32(arr);

    this.witnessSize = this.instance.exports.getWitnessSize();

  }

  async _doCalculateWitness(input_orig: any): Promise<void> {
    //input is assumed to be a map from signals to arrays of bigints
    this.instance.exports.init(0);
    let prefix = '';
    var input: any = new Object();
    //console.log("Input: ", input_orig);
    qualify_input(prefix, input_orig, input);
    //console.log("Input after: ",input);
    const keys = Object.keys(input);
    var input_counter = 0;
    keys.forEach((k) => {
      const h = fnvHash(k);
      const hMSB = parseInt(h.slice(0, 8), 16);
      const hLSB = parseInt(h.slice(8, 16), 16);
      const fArr = flatArray(input[k]);
      let signalSize = this.instance.exports.getInputSignalSize(hMSB, hLSB);
      if (signalSize < 0) {
        throw new Error(`Signal ${k} not found\n`);
      }
      if (fArr.length < signalSize) {
        throw new Error(`Not enough values for input signal ${k}\n`);
      }
      if (fArr.length > signalSize) {
        throw new Error(`Too many values for input signal ${k}\n`);
      }
      for (let i = 0; i < fArr.length; i++) {
        const arrFr = toArray32(normalize(fArr[i], this.prime), this.n32);
        for (let j = 0; j < this.n32; j++) {
          this.instance.exports.writeSharedRWMemory(j, arrFr[this.n32 - 1 - j]);
        }
        try {
          this.instance.exports.setInputSignal(hMSB, hLSB, i);
          input_counter++;
        } catch (err: any) {
          // console.log(`After adding signal ${i} of ${k}`)
          throw new Error(err);
        }
      }
    });
    if (input_counter < this.instance.exports.getInputSize()) {
      throw new Error(
        `Not all inputs have been set. Only ${input_counter} out of ${this.instance.exports.getInputSize()}`,
      );
    }
  }

  async calculateWitness(input: any): Promise<any[]> {
    const w: any[] = [];
    await this._doCalculateWitness(input);

    for (let i = 0; i < this.witnessSize; i++) {
      this.instance.exports.getWitness(i);
      const arr = new Uint32Array(this.n32);
      for (let j = 0; j < this.n32; j++) {
        arr[this.n32 - 1 - j] = this.instance.exports.readSharedRWMemory(j);
      }
      w.push(fromArray32(arr));
    }

    return w;
  }

}

function qualify_input_list(prefix: string, input: any, input1: any): void {
  if (Array.isArray(input)) {
    for (let i = 0; i < input.length; i++) {
      let new_prefix = prefix + '[' + i + ']';
      qualify_input_list(new_prefix, input[i], input1);
    }
  } else {
    qualify_input(prefix, input, input1);
  }
}

function qualify_input(prefix: string, input: any, input1: any): void {
  if (Array.isArray(input)) {
    let a = flatArray(input);
    if (a.length > 0) {
      let t = typeof a[0];
      for (let i = 1; i < a.length; i++) {
        if (typeof a[i] != t) {
          throw new Error(`Types are not the same in the the key ${prefix}`);
        }
      }
      if (t == 'object') {
        qualify_input_list(prefix, input, input1);
      } else {
        input1[prefix] = input;
      }
    } else {
      input1[prefix] = input;
    }
  } else if (typeof input == 'object') {
    const keys = Object.keys(input);
    keys.forEach((k) => {
      let new_prefix = prefix == '' ? k : prefix + '.' + k;
      qualify_input(new_prefix, input[k], input1);
    });
  } else {
    input1[prefix] = input;
  }
}

function toArray32(rem: any, size: number): number[] {
  const res: number[] = []; //new Uint32Array(size); //has no unshift
  const radix = BigInt(0x100000000);
  while (rem) {
    res.unshift(Number(rem % radix));
    rem = rem / radix;
  }
  if (size) {
    var i = size - res.length;
    while (i > 0) {
      res.unshift(0);
      i--;
    }
  }
  return res;
}

function fromArray32(arr: Uint32Array | number[]): bigint {
  //returns a BigInt
  var res = BigInt(0);
  const radix = BigInt(0x100000000);
  for (let i = 0; i < arr.length; i++) {
    res = res * radix + BigInt(arr[i]);
  }
  return res;
}

function flatArray(a: any): any[] {
  var res: any[] = [];
  fillArray(res, a);
  return res;

  function fillArray(res: any[], a: any): void {
    if (Array.isArray(a)) {
      for (let i = 0; i < a.length; i++) {
        fillArray(res, a[i]);
      }
    } else {
      res.push(a);
    }
  }
}

function normalize(n: any, prime: bigint): bigint {
  let res = BigInt(n) % prime;
  if (res < 0) res += prime;
  return res;
}

function fnvHash(str: string): string {
  const uint64_max = BigInt(2) ** BigInt(64);
  let hash = BigInt('0xCBF29CE484222325');
  for (var i = 0; i < str.length; i++) {
    hash ^= BigInt(str[i].charCodeAt(0));
    hash *= BigInt(0x100000001b3);
    hash %= uint64_max;
  }
  let shash = hash.toString(16);
  let n = 16 - shash.length;
  shash = '0'.repeat(n).concat(shash);
  return shash;
}
