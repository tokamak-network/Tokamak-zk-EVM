/**
 * Create ZIP file from test output directory
 * 
 * This script creates a ZIP file containing all output files from the test
 * for use in the zkp-channel-verifier app.
 * 
 * Usage:
 *   npx tsx examples/L2StateChannel/create-zip-from-output.ts [output-dir]
 */

import { createWriteStream, existsSync, readdirSync, statSync } from 'fs';
import { resolve, basename } from 'path';
import { createReadStream } from 'fs';
import archiver from 'archiver';

const OUTPUT_DIR = process.argv[2] || resolve(process.cwd(), 'test-outputs/channel-8-wton-proof-1');
const ZIP_PATH = resolve(process.cwd(), 'test-outputs/channel-8-wton-proof-1.zip');

async function createZip() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║          Creating ZIP from Test Output Directory           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (!existsSync(OUTPUT_DIR)) {
    console.error(`❌ Output directory not found: ${OUTPUT_DIR}`);
    process.exit(1);
  }

  console.log(`📁 Source directory: ${OUTPUT_DIR}`);
  console.log(`📦 ZIP file: ${ZIP_PATH}\n`);

  // List files to be included
  const files = readdirSync(OUTPUT_DIR).filter(file => {
    const filePath = resolve(OUTPUT_DIR, file);
    return statSync(filePath).isFile();
  });

  if (files.length === 0) {
    console.error(`❌ No files found in ${OUTPUT_DIR}`);
    process.exit(1);
  }

  console.log('📄 Files to include:');
  files.forEach(file => {
    console.log(`   - ${file}`);
  });
  console.log('');

  // Create ZIP file
  return new Promise<void>((resolve, reject) => {
    const output = createWriteStream(ZIP_PATH);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    output.on('close', () => {
      console.log(`✅ ZIP file created successfully!`);
      console.log(`   Size: ${archive.pointer()} bytes (${(archive.pointer() / 1024).toFixed(2)} KB)`);
      console.log(`   Location: ${ZIP_PATH}\n`);
      resolve();
    });

    archive.on('error', (err) => {
      console.error(`❌ Error creating ZIP: ${err.message}`);
      reject(err);
    });

    archive.pipe(output);

    // Add all files from the output directory
    files.forEach(file => {
      const filePath = resolve(OUTPUT_DIR, file);
      archive.file(filePath, { name: file });
      console.log(`   ✓ Added: ${file}`);
    });

    archive.finalize();
  });
}

createZip()
  .then(() => {
    console.log('🎉 Done! You can now use this ZIP file in the zkp-channel-verifier app.\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed to create ZIP:');
    console.error(`   Error: ${error.message}`);
    process.exit(1);
  });

