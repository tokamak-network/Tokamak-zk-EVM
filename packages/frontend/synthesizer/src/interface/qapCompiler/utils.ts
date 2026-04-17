import {
  SubcircuitInfo,
} from './libraryTypes.ts';
import {
  SUBCIRCUIT_LIST,
  SubcircuitInfoByName,
  SubcircuitInfoByNameEntry,
  SubcircuitNames,
} from './configuredTypes.ts';


// -----------------------------------------------------------------------------
// Helpers: URL-based JSON loader + tiny runtime validators
// -----------------------------------------------------------------------------
// export async function readJson(u: URL): Promise<unknown> {
//   // Convert URL → filesystem path and parse JSON
//   return JSON.parse(await readFile(fileURLToPath(u), 'utf8')) as unknown;
// }

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

    subcircuitInfoByName.set(subcircuit.name as SubcircuitNames, entryObject);
  }

  return subcircuitInfoByName;
}
