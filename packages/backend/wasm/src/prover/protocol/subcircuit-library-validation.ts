import type { SetupParams } from "../../artifacts/setup/setup-params.js";
import { validateSetupParams } from "../../artifacts/setup/validate-setup-params.js";
import type { ProverSubcircuitInfo } from "./witness.js";

export interface WireRange { readonly start: number; readonly end: number }

/** Validates the producer-owned normalized local-wire catalog. */
export function validateProverSubcircuitLibrary(
  setup: SetupParams,
  subcircuits: readonly ProverSubcircuitInfo[],
): void {
  validateSetupParams(setup);
  if (subcircuits.length >= setup.t) {
    throw new Error("Subcircuit capacity t must reserve its final ID for the virtual empty subcircuit.");
  }
  const names = new Set<string>();
  for (const [expectedId, info] of subcircuits.entries()) {
    if (info.id !== expectedId || info.name.length === 0 || names.has(info.name)) {
      throw new Error("Actual subcircuits must have contiguous IDs and unique names.");
    }
    names.add(info.name);
    const output = wireRange(info.Out_idx);
    const input = wireRange(info.In_idx);
    const wiring = wireRange(info.Wiring_idx);
    const publicRange = wireRange(info.Public_idx);
    const internal = wireRange(info.Internal_idx);
    if (info.Nwires !== setup.m || info.Nconsts > setup.n
      || output.start !== 1 || input.start !== output.end
      || wiring.start !== 0 || wiring.end !== input.end || wiring.end > setup.m_b
      || internal.start !== setup.m_b || internal.end > setup.m
      || info.NrealWires !== (wiring.end - wiring.start) + (internal.end - internal.start)) {
      throw new Error(`Subcircuit ${info.id} has inconsistent normalized wire ranges.`);
    }
    const isInput = publicRange.start === input.start && publicRange.end === input.end;
    const isOutput = publicRange.start === output.start && publicRange.end === output.end;
    if (publicRange.start !== publicRange.end && !isInput && !isOutput) {
      throw new Error(`Subcircuit ${info.id} public range is not an input or output port.`);
    }
    if (contains(publicRange, 0) || isWiringPadding(info, setup, 0)) {
      throw new Error(`Subcircuit ${info.id} classifies constant wire zero as public or padding.`);
    }
  }
}

export function wireRange(encoded: readonly [number, number]): WireRange {
  const [start, count] = encoded;
  const end = start + count;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || start < 0 || count < 0
    || !Number.isSafeInteger(end)) {
    throw new Error("Normalized wire range is invalid.");
  }
  return { start, end };
}

export function isWiringPadding(info: ProverSubcircuitInfo, setup: SetupParams, localWire: number): boolean {
  return localWire >= wireRange(info.Wiring_idx).end && localWire < setup.m_b;
}

export function isInternalPadding(info: ProverSubcircuitInfo, setup: SetupParams, localWire: number): boolean {
  return localWire >= wireRange(info.Internal_idx).end && localWire < setup.m;
}

export function retainedNonpublicWires(info: ProverSubcircuitInfo): readonly number[] {
  const wiring = wireRange(info.Wiring_idx);
  const publicRange = wireRange(info.Public_idx);
  const internal = wireRange(info.Internal_idx);
  return [
    ...range(wiring.start, wiring.end).filter(index => !contains(publicRange, index)),
    ...range(internal.start, internal.end),
  ];
}

/**
 * CRS row order for weighted selection commitments.
 *
 * The result is derived from the union of producer-declared real local-wire
 * ranges across the compiled library. It omits only local-wire padding; a
 * retained wire remains present even when a particular witness assigns zero.
 */
export function retainedWeightedWires(
  setup: SetupParams,
  subcircuits: readonly ProverSubcircuitInfo[],
): readonly number[] {
  let wiringEnd = 0;
  let internalEnd = setup.m_b;
  for (const info of subcircuits) {
    wiringEnd = Math.max(wiringEnd, wireRange(info.Wiring_idx).end);
    internalEnd = Math.max(internalEnd, wireRange(info.Internal_idx).end);
  }
  return [
    ...range(0, wiringEnd),
    ...range(setup.m_b, internalEnd),
  ];
}

function contains(rangeValue: WireRange, index: number): boolean {
  return index >= rangeValue.start && index < rangeValue.end;
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, offset) => start + offset);
}
