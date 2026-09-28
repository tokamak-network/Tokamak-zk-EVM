import { readFile, writeFile, mkdir, link, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const [sourceArg, outputArg, sizeArg] = process.argv.slice(2);
if (!sourceArg || !outputArg || !Number.isSafeInteger(Number(sizeArg)) || Number(sizeArg) < 96) throw Error('Usage: repartition-crs.mjs SOURCE_FIXTURE NEW_FIXTURE MAX_BYTES');
const source = path.resolve(sourceArg), output = path.resolve(outputArg);
await mkdir(output); // Existing evidence is never overwritten.
await mkdir(path.join(output, 'chunks/chunks'), { recursive: true });
for (const name of ['browser', 'inputs', 'preprocess']) await symlink(path.join(source, name), path.join(output, name));
const manifest = JSON.parse(await readFile(path.join(source, 'chunks/univariate-crs-manifest.json'), 'utf8'));
for (const section of manifest.sections) {
  const parts = [];
  for (const chunk of section.chunks) {
    if (section.label !== 'crs.nonpublic-queries') {
      const target = path.join(output, 'chunks', chunk.path);
      await mkdir(path.dirname(target), { recursive: true });
      await link(path.join(source, 'chunks', chunk.path), target);
      parts.push(chunk);
      continue;
    }
    const bytes = await readFile(path.join(source, 'chunks', chunk.path));
    const maxCount = Math.floor(Number(sizeArg) / section.elementByteLength);
    for (let first = 0; first < chunk.elementCount; first += maxCount) {
      const count = Math.min(maxCount, chunk.elementCount - first);
      const part = bytes.subarray(first * section.elementByteLength, (first + count) * section.elementByteLength);
      const name = `${chunk.path}.${first}.bin`, target = path.join(output, 'chunks', name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, part);
      parts.push({ path: name, firstElement: chunk.firstElement + first, elementCount: count, byteLength: part.length, sha256: createHash('sha256').update(part).digest('hex') });
    }
  }
  section.chunks = parts;
}
await writeFile(path.join(output, 'chunks/univariate-crs-manifest.json'), JSON.stringify(manifest) + '\n');
console.log(output);
