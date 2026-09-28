export interface SetupParams {
  readonly n: number;
  readonly m: number;
  readonly m_b: number;
  readonly t: number;
  readonly s: number;
  readonly publicWirePhases: readonly PublicWirePhase[];
}

export interface PublicWirePhase {
  readonly name: string;
  readonly region: "free" | "fixed";
  readonly subcircuitIds: readonly number[];
}
