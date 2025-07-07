import { hexToBytes } from '@synthesizer-libs/util';
import { createEVM } from '../../src/constructors.js';
import { Finalizer } from '../../src/tokamak/core/finalize.js';

const main = async () => {
  const evm = await createEVM();
  const res = await evm.runCode({
    code: hexToBytes(
      '0x610001601F53600051602052602051600051016040526040516020510160605260806000F3',
    ),
  });
  console.log(res);
  console.log(res.runState?.memoryPt);
  console.log(res.executionGasUsed); // 3n
  const permutation = await Finalizer.finalize(
    res.runState!.synthesizer.state.placements,
    undefined,
    true,
  );
};

void main();
