import {
  begin,
  install as installProver,
  type ProverInput,
} from "@tokamak-zk-evm/snark-browser-compat/prover";

export type ProverPhase =
  | "preparing"
  | "arithmetic"
  | "copy"
  | "binding"
  | "finalizing"
  | "completed";

export async function generateProofWithProgress(
  input: ProverInput,
  setPhase: (phase: ProverPhase) => void,
): Promise<Uint8Array> {
  await installProver();
  setPhase("preparing");
  const session = await begin(input);

  try {
    setPhase("arithmetic");
    await session.proveArithmetic();
    setPhase("copy");
    await session.proveCopy();
    setPhase("binding");
    await session.proveBinding();
    setPhase("finalizing");
    const proof = await session.finalize();
    setPhase("completed");
    return proof;
  } finally {
    session.dispose();
  }
}
