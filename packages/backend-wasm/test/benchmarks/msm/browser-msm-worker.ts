import { createCurveRuntime, type CurveRuntime } from "../../../src/index.js";

interface WorkerJob {
  readonly index: number;
  readonly length: number;
  readonly rawBases: Uint8Array;
  readonly rawScalars: Uint8Array;
}

interface WorkerResult {
  readonly index: number;
  readonly result: Uint8Array;
}

interface WorkerCommand {
  readonly id: number;
  readonly command: "init" | "run";
  readonly workerIndex?: number;
  readonly jobs?: readonly WorkerJob[];
}

let runtime: CurveRuntime | undefined;
let jobs: readonly WorkerJob[] | undefined;

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  void handleMessage(event.data);
});

async function handleMessage(message: unknown): Promise<void> {
  if (!isWorkerCommand(message)) {
    return;
  }

  try {
    if (message.command === "init") {
      await handleInit(message);
      postOk(message.id);
      return;
    }

    postOk(message.id, await handleRun());
  } catch (error) {
    postError(message.id, error instanceof Error ? error.message : String(error));
  }
}

async function handleInit(message: WorkerCommand): Promise<void> {
  runtime = await createCurveRuntime({ singleThread: true });
  jobs = message.jobs ?? [];
}

async function handleRun(): Promise<WorkerResult[]> {
  if (runtime === undefined || jobs === undefined) {
    throw new Error("Browser MSM worker was not initialized.");
  }

  const results: WorkerResult[] = [];
  for (const job of jobs) {
    results.push({
      index: job.index,
      result: await runtime.G1.msmAffineRaw(job.rawBases, job.rawScalars),
    });
  }

  return results;
}

function postOk(id: number, results?: readonly WorkerResult[]): void {
  self.postMessage({ id, status: "ok", results });
}

function postError(id: number, error: string): void {
  self.postMessage({ id, status: "error", error });
}

function isWorkerCommand(value: unknown): value is WorkerCommand {
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isSafeInteger((value as { id?: unknown }).id) &&
    ((value as { command?: unknown }).command === "init" || (value as { command?: unknown }).command === "run")
  );
}
