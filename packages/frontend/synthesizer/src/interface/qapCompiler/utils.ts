import {
  SubcircuitInfo,
} from './libraryTypes.ts';
import {
  SUBCIRCUIT_LIST,
  SubcircuitInfoByName,
  SubcircuitInfoByNameEntry,
  SubcircuitNames,
} from './configuredTypes.ts';

export function createInfoByName(subcircuitInfo: SubcircuitInfo): SubcircuitInfoByName {
  const subcircuitInfoByName = new Map<
    SubcircuitNames,
    SubcircuitInfoByNameEntry
  >();

  for (const subcircuit of subcircuitInfo) {
    const entryObject: SubcircuitInfoByNameEntry = {
      id: subcircuit.id,
      name: subcircuit.name,
      NWires: subcircuit.Nwires,
      NInWires: subcircuit.In_idx[1],
      NOutWires: subcircuit.Out_idx[1],
      inWireIndex: subcircuit.In_idx[0],
      outWireIndex: subcircuit.Out_idx[0],
      flattenMap: subcircuit.flattenMap,
    };

    subcircuitInfoByName.set(subcircuit.name, entryObject);
  }

  return subcircuitInfoByName;
}
