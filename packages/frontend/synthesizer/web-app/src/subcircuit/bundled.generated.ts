import setupParamsJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/setupParams.json' with { type: 'json' };
import globalWireListJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/globalWireList.json' with { type: 'json' };
import frontendCfgJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/frontendCfg.json' with { type: 'json' };
import subcircuitInfoJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/subcircuitInfo.json' with { type: 'json' };
import wasm0 from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit0.wasm';
import wasm1 from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit1.wasm';
import wasm2 from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit2.wasm';
import wasm3 from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit3.wasm';
import wasm4 from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit4.wasm';
import wasm5 from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit5.wasm';
import wasm6 from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit6.wasm';
import wasm7 from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit7.wasm';
import wasm8 from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit8.wasm';
import wasm9 from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit9.wasm';
import wasm10 from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit10.wasm';
import wasm11 from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit11.wasm';
import wasm12 from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit12.wasm';
import wasm13 from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/wasm/subcircuit13.wasm';

export {
  setupParamsJson,
  globalWireListJson,
  frontendCfgJson,
  subcircuitInfoJson,
};

export const wasmFiles: Record<number, Uint8Array> = {
  0: wasm0,
  1: wasm1,
  2: wasm2,
  3: wasm3,
  4: wasm4,
  5: wasm5,
  6: wasm6,
  7: wasm7,
  8: wasm8,
  9: wasm9,
  10: wasm10,
  11: wasm11,
  12: wasm12,
  13: wasm13,
};
