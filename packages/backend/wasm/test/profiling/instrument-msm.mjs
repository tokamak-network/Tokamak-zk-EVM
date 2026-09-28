// Diagnostic bundle transformations only; installed dependency files are untouched.
export function instrumentMsm(text, name) {
  if (name.endsWith('/browser.esm.js')) {
    const line = text.match(/^const threadStr = .*;$/m);
    if (!line) throw Error('Missing bundled worker source');
    const quoted = line[0].slice(line[0].indexOf('${') + 2, line[0].lastIndexOf('})(self)'));
    const worker = instrumentMsm(JSON.parse(quoted), '/threadman_thread.js');
    text = text.replace(line[0], 'const threadStr = ' + JSON.stringify('(' + worker + ')(self)') + ';');
    const start = text.indexOf('function buildMultiexp(curve, groupName) {');
    const end = text.indexOf('\n}', start) + 2;
    if (start < 0 || end <= start) throw Error('Missing bundled MSM function');
    return text.slice(0, start) + instrumentMsm(text.slice(start, end), '/engine_multiexp.js') + text.slice(end);
  }
  const replace = (needle, replacement) => {
    if (!text.includes(needle)) throw Error(`Missing MSM diagnostic anchor in ${name}: ${needle}`);
    text = text.replace(needle, replacement);
  };
  if (name.endsWith('/threadman_thread.js')) {
    replace('        const oldAlloc = u32a[0];', `        const oldAlloc = u32a[0];
        const msm = task.some(x => x.cmd === "CALL" && /g1m_multiexp/.test(x.fnName));
        const diagnostic = { copyMs: 0, kernelMs: 0, outputMs: 0 };
        let stepStart = 0;`);
    replace('            switch (task[i].cmd) {', '            if (msm) stepStart = performance.now();\n            switch (task[i].cmd) {');
    replace('        return ctx.out;', `        if (msm) ctx.out.msmDiagnostic = diagnostic;
        return ctx.out;`);
    // Account each command after the switch, before the next command.
    replace('        }\n        const u32b = new Uint32Array(memory.buffer, 0, 1);', `            if (msm) {
                const key = task[i].cmd === "CALL" ? "kernelMs" : task[i].cmd === "GET" ? "outputMs" : "copyMs";
                diagnostic[key] += performance.now() - stepStart;
            }
        }
        const u32b = new Uint32Array(memory.buffer, 0, 1);`);
  } else if (name.endsWith('/engine_multiexp.js')) {
    // Both the per-window and per-point-chunk reductions run on the main thread.
    const needle = '        let res = G.zero;';
    if (text.split(needle).length !== 3) throw Error('Unexpected MSM reduction count');
    text = text.replaceAll(needle, '        const reductionStart = performance.now();\n' + needle);
    text = text.replaceAll('        return res;', `        if (groupName === "G1") globalThis.__probe.msm.reductionMs += performance.now() - reductionStart;
        return res;`);
  }
  return text;
}
