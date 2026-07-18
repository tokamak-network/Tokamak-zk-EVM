import fs from 'node:fs';
import path from 'node:path';
import appRootPath from 'app-root-path';
import {
  createSynthesisOutputJsonFiles,
  type SynthesisOutput,
  type SynthesisOutputSelectionOptions,
} from '../../../core/src/app.ts';

export function writeSynthesisOutputJson(
  output: SynthesisOutput,
  outputDir?: string,
  options: SynthesisOutputSelectionOptions = {},
): void {
  const files = createSynthesisOutputJsonFiles(output, options);

  for (const [fileName, jsonContent] of Object.entries(files)) {
    const filePath =
      outputDir === undefined
        ? path.resolve(appRootPath.path, 'outputs', fileName)
        : path.resolve(appRootPath.path, outputDir, fileName);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, jsonContent, 'utf-8');
    console.log(`Synthesizer: Success in writing '${filePath}'.`);
  }
}
