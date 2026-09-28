// Sequential paired whole-command timing; never run alongside another benchmark.
// Usage: node compare-release.mjs CONTROL CANDIDATE OUTPUT_DIR [PAIRS]
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const [control, candidate, directory, count = '5'] = process.argv.slice(2);
if (!control || !candidate || !directory) throw Error('CONTROL CANDIDATE OUTPUT_DIR [PAIRS]');
const pairs = Number(count);
if (!Number.isInteger(pairs) || pairs < 1) throw Error('Invalid pair count');
const cwd = process.cwd();
const prior = JSON.parse(readFileSync('docs/optimization/evidence/prover-hardware-split-comparison.json'));
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const out = resolve(directory);
mkdirSync(out, { recursive: true });
const env = { ...process.env, DYLD_LIBRARY_PATH: resolve('external-lib/mac/lib') };
delete env.PROVE_MSM_DIAGNOSTICS;
const report = {
  date: new Date().toISOString(), source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  profile: 'release + timing', host: prior.host, logicalCpus: prior.logicalCpus,
  scope: 'Native CPU proof generation, not verification/E2E. One discarded warmup per binary; alternating-order pairs. Fresh randomizers; default threads; no concurrent task-owned benchmark/build. Ordinary desktop applications uncontrolled.',
  binaries: Object.fromEntries(Object.entries({control, candidate}).map(([k,p]) => [k,{path:resolve(p),sha256:hash(p)}])),
  args: prior.args, inputs: prior.inputs.map(i => {if(hash(i.path)!==i.sha256) throw Error('Changed input: '+i.path);return i;}),
  warmups: [], runs: [],
};
for (let index=0; index<=pairs; index++) {
  for (const variant of (index % 2 ? ['candidate','control'] : ['control','candidate'])) {
    const output = `${out}/${variant}-${index}`;
    const start = process.hrtime.bigint();
    // macOS system launchers strip inherited DYLD_* variables; set it after time.
    const p = spawnSync('/usr/bin/time', ['-l','/usr/bin/env',`DYLD_LIBRARY_PATH=${env.DYLD_LIBRARY_PATH}`,report.binaries[variant].path,...prior.args,'--output',output], {cwd,env,encoding:'utf8',maxBuffer:10_000_000});
    const wallSeconds = Number(process.hrtime.bigint()-start)/1e9;
    writeFileSync(output+'.log',p.stdout+'\n'+p.stderr);
    if(p.status!==0) throw Error(p.stdout+p.stderr);
    const line=p.stdout.split('\n').find(l=>l.startsWith('TIMING_JSON '));
    if(!line) throw Error('Missing timing output');
    const events=JSON.parse(line.slice(12));
    const peakRssBytes=Number(p.stderr.match(/(\d+)\s+maximum resident set size/)?.[1]);
    if(statSync(output+'/univariate_proof.bin').size!==1184) throw Error('Unexpected proof size');
    const row={index,variant,wallSeconds,peakRssBytes,events};
    (index ? report.runs : report.warmups).push(row);
    writeFileSync(out+'/measurement.json',JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({index,variant,wallSeconds,peakRssBytes,totalSeconds:events.find(e=>e.name==='univariate.total').nanos/1e9}));
  }
}
report.meanSeconds=Object.fromEntries(['control','candidate'].map(v=>{
  const runs=report.runs.filter(r=>r.variant===v);
  const names=[...new Set(runs.flatMap(r=>r.events.map(e=>e.name)))];
  return [v,Object.fromEntries(names.map(n=>[n,runs.reduce((sum,r)=>sum+r.events.filter(e=>e.name===n).reduce((s,e)=>s+e.nanos/1e9,0),0)/runs.length]))];
}));
writeFileSync(out+'/measurement.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.meanSeconds));
