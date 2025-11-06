import { subcircuits } from '../constant/index.js';
import type {
  SubcircuitInfoByName,
  SubcircuitInfoByNameEntry,
  SubcircuitNames,
} from '../types/index.js';
import { isValidSubcircuitName } from '../types/index.js';

export interface SubcircuitRegistryOptions {
  includeFlattenMap?: boolean;
  errorOnInvalid?: boolean; // true = throw error, false = warn and skip
}

/**
 * Centralized registry for managing subcircuit information processing.
 * Eliminates code duplication between StateManager and Permutation classes.
 */
export class SubcircuitRegistry {
  /**
   * Creates a subcircuitInfoByName map from raw subcircuit data
   */
  static createInfoByName(
    options: SubcircuitRegistryOptions = {},
  ): SubcircuitInfoByName {
    const { includeFlattenMap = false, errorOnInvalid = false } = options;
    const subcircuitInfoByName = new Map<
      SubcircuitNames,
      SubcircuitInfoByNameEntry
    >();

    for (const subcircuit of subcircuits) {
      const entryObject: SubcircuitInfoByNameEntry = {
        id: subcircuit.id,
        NWires: subcircuit.Nwires,
        NInWires: subcircuit.In_idx[1],
        NOutWires: subcircuit.Out_idx[1],
        inWireIndex: subcircuit.In_idx[0],
        outWireIndex: subcircuit.Out_idx[0],
      };

      // Include flattenMap if requested
      if (includeFlattenMap && subcircuit.flattenMap) {
        entryObject.flattenMap = subcircuit.flattenMap;
      }

      // Type-safe subcircuit name handling
      const subcircuitName = subcircuit.name;
      if (!isValidSubcircuitName(subcircuitName)) {
        const message = `Invalid subcircuit name: ${subcircuitName}`;

        if (errorOnInvalid) {
          throw new Error(`SubcircuitRegistry: ${message}`);
        } else {
          console.warn(`SubcircuitRegistry: Skipping ${message}`);
          continue;
        }
      }

      subcircuitInfoByName.set(subcircuitName, entryObject);
    }

    return subcircuitInfoByName;
  }

  /**
   * Gets filtered list of valid subcircuit names
   */
  static getValidSubcircuitNames(): SubcircuitNames[] {
    return subcircuits
      .map((circuit: any) => circuit.name)
      .filter((name: any): name is SubcircuitNames =>
        isValidSubcircuitName(name),
      );
  }

  /**
   * Creates subcircuit info for StateManager (without flattenMap, warns on invalid)
   */
  static createForStateManager(): {
    subcircuitInfoByName: SubcircuitInfoByName;
    subcircuitNames: SubcircuitNames[];
  } {
    return {
      subcircuitInfoByName: this.createInfoByName({
        includeFlattenMap: false,
        errorOnInvalid: false,
      }),
      subcircuitNames: this.getValidSubcircuitNames(),
    };
  }

  /**
   * Creates subcircuit info for Permutation (with flattenMap, throws on invalid)
   */
  static createForPermutation(): SubcircuitInfoByName {
    return this.createInfoByName({
      includeFlattenMap: true,
      errorOnInvalid: true,
    });
  }
}
