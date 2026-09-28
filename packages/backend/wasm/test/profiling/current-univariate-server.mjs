import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { instrumentMsm } from './instrument-msm.mjs';

const root = process.cwd();
const output = path.join(root, 'tmp/optimization-profile');
if (!process.argv[2]) throw Error('Usage: node test/profiling/current-univariate-server.mjs E2E_DIRECTORY');
const fixture = path.resolve(process.argv[2]);
const candidate = process.env.BACKEND_WASM_PROFILE_CANDIDATE;
if (candidate && candidate !== 'grouped-msm') throw Error('Unknown profiling candidate: ' + candidate);
const candidatePlugins = candidate ? [{ name: 'experimental-msm', setup(b) {
  b.onLoad({ filter: /\/src\/runtime\/group\/group\.ts$/ }, async args => {
    let text = await readFile(args.path, 'utf8');
    text = `import { groupedG1Msm } from ${JSON.stringify(path.join(root, 'test/profiling/candidates/grouped-msm.ts'))};\n` + text;
    const end = text.indexOf('export function createG2Runtime');
    if (end < 0) throw Error('Missing G1/G2 boundary in grouped MSM experiment');
    if (text.slice(0, end).split('group.multiExpAffine(').length !== 3) throw Error('Grouped MSM experiment requires its recorded unsigned control revision');
    text = text.slice(0, end).replaceAll('group.multiExpAffine(', 'groupedG1Msm(group, group.tm, ') + text.slice(end);
    return { contents: text, loader: 'ts' };
  });
} }] : [];
const mark = label => `globalThis.__probe.mark(${JSON.stringify(label)});\n`;
const boundaries = {
  'univariate/reference-prover.ts': [
    ['  const { setup, crs } = input;', 'prove.domain'],
    ['  const sC = await', 'prove.permutation'], ['  const slots =', 'prove.witness-slots'],
    ['  const maps =', 'prove.witness-maps'], ['  const layout =', 'prove.public-check-masks'],
    ['  const qA =', 'prove.arithmetic-quotient'], ['  const a = setup.l_free', 'prove.public-polynomial'],
    ['  const cL =', 'prove.commit-cL-cH'], ['  const cO =', 'prove.binding-cO'],
    ['  const roots =', 'prove.selected-roots'], ['  const witness =', 'prove.selection-witness'],
    ['  const qSelection =', 'prove.selection-quotients'], ['  const dQ =', 'prove.commit-dQ-dQK'],
    ['  const transcript =', 'prove.transcript-1'], ['  const cD =', 'prove.commit-cD'],
    ['  transcript.setMessage(encodeG1MessageBlock("F2.a2"', 'prove.transcript-2'],
    ['  const copy =', 'prove.copy-relation'], ['  const cR =', 'prove.commit-cR'],
    ['  transcript.setMessage(encodeG1MessageBlock("F2.a3"', 'prove.combine-quotients'],
    ['  const cQ =', 'prove.commit-cQ'], ['  transcript.setMessage(encodeG1MessageBlock("F2.a4"', 'prove.evaluations'],
    ['  const ordinary =', 'prove.opening-combination'], ['  const piChi =', 'prove.opening-piChi'],
    ['  const piPlus =', 'prove.opening-piPlus'], ['  transcript.setMessage(encodeG1MessageBlock("F2.a6"', 'prove.final-transcript'],
    ['  const { evaluations: rEvals, numerators, denominators } =', 'prove.copy-recurrence'], ['  const rBase =', 'prove.copy-interpolation'],
    ['  const qC0 =', 'prove.copy-qC0'], ['  const qC1 =', 'prove.copy-qC1'],
  ],
  'prover/api/public-api.ts': [['    const parsed =', 'prove.input-admission'], ['    return await encodeUnivariateProof', 'prove.encode']],
  'preprocess/api/public-api.ts': [['      runtimeInput =', 'preprocess.input-admission'], ['      return await createPreprocessOutput', 'preprocess.encode']],
  'preprocess/protocol/preprocess-snark.ts': [['  const chunkPoints =', 'preprocess.domain'], ['  const roots =', 'preprocess.selected-roots'], ['  const permutation =', 'preprocess.permutation'], ['  const layout =', 'preprocess.public-check'], ['  const sC =', 'preprocess.commit-SC'], ['  const cFix =', 'preprocess.commit-Cfix'], ['  const zu =', 'preprocess.unselected-division'], ['  let eKappa =', 'preprocess.commit-Ekappa']],
  'verifier/api/public-api.ts': [['      runtimeInput =', 'verify.decode'], ['      return await verifyUnivariateReference', 'verify.online']],
  'univariate/reference-verifier.ts': [['  const za =', 'verify.field-algebra'], ['  const v2 =', 'verify.group-algebra'], ['  const prepared =', 'verify.prepare-G2'], ['  return runtime.pairing.preparedProductIsOne', 'verify.pairing']],
};
function inject(text, key) {
  for (const [needle, label] of boundaries[key] ?? []) {
    // Shared scalar preparation belongs to the same complete D_Q commitment span.
    const anchor = label === 'prove.commit-dQ-dQK' && text.includes('  const [weightedQ, shiftedQ] =')
      ? '  const [weightedQ, shiftedQ] =' : needle;
    if (!text.includes(anchor)) throw Error('Missing instrumentation anchor: ' + anchor);
    text = text.replace(anchor, mark(label) + anchor);
  }
  if (key === 'runtime/curve/curve.ts') text = text.replace('  return {\n    name: "bls12-381",', '  globalThis.__probe.runtime(Fr, G1, G2, raw);\n  return {\n    name: "bls12-381",');
  if (key === 'runtime/group/signed-msm.ts') {
    text = text.replace('  let out = group.zero;', '  const reductionStart = performance.now();\n  let out = group.zero;');
    text = text.replace('  return out;', '  globalThis.__probe.msm.reductionMs += performance.now() - reductionStart;\n  return out;');
  }
  if (key === 'univariate/chunked-crs.ts') {
    text = text.replace('    requireRange(firstElement, elementCount, this.elementCount, this.label);', '    const __start = performance.now();\n    requireRange(firstElement, elementCount, this.elementCount, this.label);');
    text = text.replace('    return output;\n  }\n\n  async readStridedElements', '    globalThis.__probe.add("CRS.readElements", __start, elementCount);\n    return output;\n  }\n\n  async readStridedElements');
    text = text.replace('hex(sha256(bytes))', '(() => { const start = performance.now(); const digest = hex(sha256(bytes)); globalThis.__probe.add("CRS.sha256", start, bytes.length); return digest; })()');
  }
  return text;
}
for (const profiled of [false, true]) await build({
  entryPoints: [path.join(root, 'test/profiling/current-univariate-entry.ts')], outfile: path.join(output, profiled ? 'profile.js' : 'control.js'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  plugins: [...candidatePlugins, ...(profiled ? [{ name: 'measurement-only', setup(b) {
    b.onLoad({ filter: /ffjavascript\/build\/browser\.esm\.js$/ }, async args => ({
      contents: instrumentMsm(await readFile(args.path, 'utf8'), args.path), loader: 'js',
    }));
    b.onLoad({ filter: /\/src\/.*\.ts$/ }, async args => {
    const key = args.path.split('/src/')[1];
    if (!(key in boundaries) && !['runtime/curve/curve.ts', 'runtime/group/signed-msm.ts', 'univariate/chunked-crs.ts'].includes(key)) return;
    return { contents: inject(await readFile(args.path, 'utf8'), key), loader: 'ts' };
  }); } }] : [])],
});
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(`<title>WASM optimization profile</title><p>Measurement-only current protocol harness</p><script type="module" src="/${url.searchParams.has('baseline') ? 'baseline' : url.searchParams.has('profile') ? 'profile' : 'control'}.js"></script>`); return; }
    let file;
    if (['/control.js', '/profile.js'].includes(url.pathname)) file = path.join(output, url.pathname.slice(1));
    else if (url.pathname === '/baseline.js' && process.env.BACKEND_WASM_PROFILE_CONTROL_BUNDLE) file = path.resolve(process.env.BACKEND_WASM_PROFILE_CONTROL_BUNDLE);
    else if (url.pathname.startsWith('/fixture/')) file = path.join(fixture, 'browser', path.basename(url.pathname));
    else if (url.pathname.startsWith('/crs/') && !url.pathname.includes('..')) file = path.join(fixture, 'chunks', url.pathname.slice(5));
    if (!file) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
    res.end(await readFile(file));
  } catch(e) { res.writeHead(500); res.end(String(e)); }
});
server.listen(0, '127.0.0.1', () => console.log('PROFILE_ORIGIN=http://127.0.0.1:' + server.address().port));
