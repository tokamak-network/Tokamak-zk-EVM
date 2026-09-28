import * as prover from '../../src/prover/index.js';
import * as preprocess from '../../src/preprocess/index.js';
import * as verifier from '../../src/verifier/index.js';
import { DenseUnivariatePolynomial } from '../../src/univariate/polynomial.js';

const w = globalThis as any;
const probe = w.__probe = {
  phase: '', last: 0, stages: [] as any[], operations: {} as any, runtimes: [] as any[],
  msm: { reductionMs: 0, tasks: [] as any[], calls: [] as any[] },
  mark(label: string) {
    const now = performance.now();
    if (this.phase) this.stages.push({ label: this.phase, ms: now - this.last });
    this.phase = label; this.last = now;
  },
  add(this: any, name: string, started: number, count = 0, phase = this.phase) {
    const key = phase + '/' + name;
    const item = this.operations[key] ??= { calls: 0, ms: 0, elements: 0 };
    item.calls++; item.ms += performance.now() - started; item.elements += count;
  },
  wrap(object: any, name: string, prefix: string) {
    const original = object[name];
    object[name] = function (this: any, ...args: any[]) {
      const start = performance.now(), phase = probe.phase;
      const out = original.apply(this, args);
      const count = args[0] instanceof Uint8Array ? args[0].byteLength / 32 : 0;
      if (out && typeof out.then === 'function') return out.then((value: any) => { probe.add(prefix + name, start, count, phase); return value; });
      probe.add(prefix + name, start, count, phase); return out;
    };
  },
  runtime(fr: any, g1: any, g2: any, raw: any) {
    this.runtimes.push({ workers: raw.Fr.tm.concurrency });
    const tm = raw.G1.tm, queued = new WeakMap(), originalQueue = tm.queueAction, originalPost = tm.postAction;
    tm.postAction = function (worker: number, task: any[], ...rest: any[]) {
      const record = queued.get(task);
      if (record) record.queueMs = performance.now() - record.start;
      return originalPost.call(this, worker, task, ...rest);
    };
    tm.queueAction = function (task: any[], ...rest: any[]) {
      const calls = task.filter(x => x.cmd === 'CALL' && /g1m_multiexp/.test(x.fnName));
      if (!calls.length) return originalQueue.call(this, task, ...rest);
      const record: any = { phase: probe.phase, start: performance.now(), queueMs: 0,
        inputBytes: task.filter(x => x.cmd === 'ALLOCSET').reduce((n, x) => n + x.buff.byteLength, 0),
        outputBytes: task.filter(x => x.cmd === 'GET').reduce((n, x) => n + x.len, 0),
        windows: calls.map(x => x.fnName === 'g1m_multiexpSigned_window'
          ? { signed: true, points: x.params[2]?.val, buckets: x.params[3]?.val }
          : { points: x.params[3]?.val, startBit: x.params[4]?.val, bits: x.params[5]?.val }) };
      queued.set(task, record);
      return originalQueue.call(this, task, ...rest).then((out: any) => {
        probe.msm.tasks.push({ ...record, start: undefined, elapsedMs: performance.now() - record.start, ...out.msmDiagnostic });
        return out;
      });
    };
    const originalMsm = g1.msmAffineRaw;
    g1.msmAffineRaw = async function (bases: Uint8Array, scalars: Uint8Array) {
      const start = performance.now(), phase = probe.phase;
      const out = await originalMsm.call(this, bases, scalars);
      probe.msm.calls.push({ phase, points: bases.byteLength / 96, ms: performance.now() - start });
      return out;
    };
    for (const name of ['fftBuffer', 'ifftBuffer', 'batchMulBuffer', 'batchSubBuffer', 'batchAddScaledBuffer', 'batchFromMontgomeryBuffer', 'sparseRowDotBuffer', 'selectionAccumulateBuffer', 'selectionCofactorsBuffer', 'copyOperandsBuffer', 'orderedRecurrenceBuffer', 'batchInverseBuffer', 'divideUnivariateVanishingBuffer', 'evaluatePolynomialBuffer', 'ruffiniYBuffer', 'batchApplyKeyBuffer']) this.wrap(fr, name, 'Fr.');
    this.wrap(g1, 'msmAffineRaw', 'G1.'); this.wrap(g2, 'msmAffineRaw', 'G2.');
  }
};
if (location.search.includes('profile')) {
  for (const name of ['add', 'sub', 'scale', 'scaleArgument', 'multiply', 'divideVanishingExact', 'divideVanishingExactBatched', 'ruffini', 'evaluate']) probe.wrap(DenseUnivariatePolynomial.prototype, name, 'poly.');
}

async function bytes(url: string) {
  const r = await fetch(url); if (!r.ok) throw Error(url + ': ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}
w.run = async () => {
  w.result = { status: 'running' };
  try {
    const [witness, selector, permutation, instance, nativePreprocess] = await Promise.all(['witness', 'selector', 'permutation', 'instance', 'univariate_verifier_preprocess'].map(name => bytes('/fixture/' + name + '.bin')));
    const manifest = await (await fetch('/crs/univariate-crs-manifest.json')).json();
    const crs = { manifest, loadChunk: (name: string) => bytes('/crs/' + name) };
    const timings: any[] = [];
    const timed = async (label: string, f: () => Promise<any>) => { const start = performance.now(); const value = await f(); timings.push({ label, ms: performance.now() - start }); return value; };
    await timed('install', () => Promise.all([prover.install(), preprocess.install(), verifier.install()]));
    const checkDigests = new URLSearchParams(location.search).has('checkDigests');
    const pp = await timed('preprocess', () => preprocess.preprocess({ selector, permutation, instance, preprocessCrs: crs }, { checkDigests }));
    probe.mark('');
    const proof = await timed('prove', () => prover.prove({ witness, selector, permutation, instance, proverCrs: crs }, { checkDigests }));
    probe.mark('');
    const valid = await timed('verify', () => verifier.verify({ instance, proof, verifierPreprocess: pp }));
    probe.mark('');
    if (!valid || pp.length !== nativePreprocess.length || !pp.every((x: number, i: number) => x === nativePreprocess[i])) throw Error('Verification/preprocess parity failed');
    w.proof = Array.from(proof);
    w.result = { status: 'ok', checkDigests, valid, preprocessMatchesNative: true, proofBytes: proof.length, timings, stages: probe.stages, operations: probe.operations, msm: probe.msm, runtimes: probe.runtimes, hardwareConcurrency: navigator.hardwareConcurrency, userAgent: navigator.userAgent };
  } catch (e: any) { w.result = { status: 'error', error: e.stack, cause: e.cause?.stack }; }
};
