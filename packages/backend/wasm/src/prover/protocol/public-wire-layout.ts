import type { SetupParams } from "../../artifacts/setup/setup-params.js";
import {
  validateProverSubcircuitLibrary,
  wireRange,
} from "./subcircuit-library-validation.js";
import {
  placementCount,
  placementSubcircuitId,
  type ProverPlacementVariables,
  type ProverSubcircuitInfo,
} from "./witness.js";

export interface PublicWireSource {
  readonly subcircuitId: number;
  readonly localWireIndex: number;
}

export interface PublicWireSegment {
  readonly start: number;
  readonly end: number;
  readonly subcircuitId: number;
  readonly placementPhase: number;
  readonly region: "free" | "fixed";
}

export interface PublicQueryKey {
  readonly bufferSubcircuitId: number;
  readonly localPublicWireIndex: number;
}

/** Ordered public coordinates derived entirely from normalized producer metadata. */
export class PublicWireLayout {
  private constructor(
    private readonly lFree: number,
    private readonly sources: readonly (PublicWireSource | undefined)[],
    private readonly publicSegments: readonly PublicWireSegment[],
  ) {}

  static derive(setup: SetupParams, subcircuits: readonly ProverSubcircuitInfo[]): PublicWireLayout {
    validateProverSubcircuitLibrary(setup, subcircuits);
    const sources: (PublicWireSource | undefined)[] = [];
    const segments: PublicWireSegment[] = [];
    const phaseNames = new Set<string>();
    const owners = new Map<number, string>();
    let reachedFixed = false;

    for (const phase of setup.publicWirePhases) {
      if (phase.name.length === 0 || phaseNames.has(phase.name)) {
        throw new Error("Public phase names must be unique and non-empty.");
      }
      phaseNames.add(phase.name);
      if (reachedFixed && phase.region === "free") {
        throw new Error("A free public phase follows a fixed public phase.");
      }
      reachedFixed ||= phase.region === "fixed";
      for (const subcircuitId of phase.subcircuitIds) {
        if (owners.has(subcircuitId)) throw new Error("A subcircuit belongs to more than one public phase.");
        owners.set(subcircuitId, phase.name);
        const info = subcircuits[subcircuitId];
        if (info === undefined || info.publicPhase !== phase.name || subcircuitId >= setup.s) {
          throw new Error(`Public phase references inadmissible subcircuit ${subcircuitId}.`);
        }
        const publicRange = wireRange(info.Public_idx);
        const expected = info.bufferDirection === "in" ? wireRange(info.In_idx)
          : info.bufferDirection === "out" ? wireRange(info.Out_idx) : undefined;
        if (publicRange.start === publicRange.end || expected === undefined
          || publicRange.start !== expected.start || publicRange.end !== expected.end) {
          throw new Error(`Public subcircuit ${subcircuitId} does not expose its declared buffer port.`);
        }
        const start = sources.length;
        for (let localWireIndex = publicRange.start; localWireIndex < publicRange.end; localWireIndex += 1) {
          sources.push({ subcircuitId, localWireIndex });
        }
        segments.push({ start, end: sources.length, subcircuitId, placementPhase: subcircuitId, region: phase.region });
      }
    }

    for (const info of subcircuits) {
      const owner = owners.get(info.id);
      const publicRange = wireRange(info.Public_idx);
      if ((publicRange.start === publicRange.end) !== (owner === undefined) || info.publicPhase !== owner) {
        throw new Error(`Subcircuit ${info.id} has inconsistent public ownership.`);
      }
    }

    const actualFreeLength = segments.filter(segment => segment.region === "free")
      .reduce((sum, segment) => sum + segment.end - segment.start, 0);
    const freeLength = nextPowerOfTwo(Math.max(1, actualFreeLength));
    const fixedSources = sources.splice(actualFreeLength);
    const padding = freeLength - actualFreeLength;
    sources.push(...Array.from({ length: padding }, () => undefined), ...fixedSources);
    const adjustedSegments = segments.map(segment => segment.region === "fixed"
      ? { ...segment, start: segment.start + padding, end: segment.end + padding }
      : segment);
    return new PublicWireLayout(freeLength, sources, adjustedSegments);
  }

  length(): number { return this.sources.length; }
  freePublicLen(): number { return this.lFree; }
  sourceForPublicWire(index: number): PublicWireSource | undefined { return this.sources[index]; }
  segments(): readonly PublicWireSegment[] { return this.publicSegments; }

  publicQueryKeyForPublicWire(index: number): PublicQueryKey | undefined {
    const source = this.sourceForPublicWire(index);
    return source === undefined ? undefined : {
      bufferSubcircuitId: source.subcircuitId,
      localPublicWireIndex: source.localWireIndex,
    };
  }

  placementPhaseForPublicWire(index: number): number | undefined {
    return this.sourceForPublicWire(index)?.subcircuitId;
  }

  validateRuntimeBufferPlacements(placements: ProverPlacementVariables): void {
    const required = new Set(this.publicSegments.map(segment => segment.subcircuitId));
    const seen = new Set<number>();
    for (let placement = 0; placement < placementCount(placements); placement += 1) {
      const id = placementSubcircuitId(placements, placement);
      if (!required.has(id)) continue;
      if (seen.has(id) || placement !== id) {
        throw new Error(`Public buffer ${id} must occur exactly once at matching placement ${id}.`);
      }
      seen.add(id);
    }
    for (const id of required) if (!seen.has(id)) throw new Error(`Public buffer ${id} has no runtime placement.`);
  }
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}
