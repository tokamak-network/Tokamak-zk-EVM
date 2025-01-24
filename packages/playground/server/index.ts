import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { finalize } from '../../frontend/synthesizer/src/tokamak/core/finalize';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the outputs directory used by the Synthesizer
const projectRoot = path.join(__dirname, '../../..');
const outputDir = path.join(projectRoot, 'packages/frontend/synthesizer/examples/tokamak/outputs');

// Helper function to wait for a file to be generated
const waitForFile = (filePath: string, retries = 5, delay = 200): Promise<void> => {
  return new Promise((resolve, reject) => {
    const checkFile = (attempts: number) => {
      if (fs.existsSync(filePath)) {
        resolve();
      } else if (attempts > 0) {
        setTimeout(() => checkFile(attempts - 1), delay);
      } else {
        reject(new Error(`File not found: ${filePath}`));
      }
    };

    checkFile(retries);
  });
};

const app = express();
app.use(cors());
app.use(bodyParser.json());

// JSON 페이로드 크기 제한 증가
app.use(express.json({limit: '50mb'}));
// URL-encoded 페이로드 크기 제한 증가
app.use(express.urlencoded({limit: '50mb', extended: true}));

app.post('/api/finalize', async (req, res) => {
    try {
    const placementsObj = req.body.placements;

    const placementsMap = new Map<number, any>(
      Object.entries(placementsObj).map(([k, v]) => [Number(k), v])
    );

        const result = await finalize(placementsMap, true);
        
        console.log('result ', result)

    const permutationPath = path.join(outputDir, 'permutation.ts');
    const placementInstancePath = path.join(outputDir, 'placementInstance.ts');

    // Wait for the permutation file to be generated
    console.log('Waiting for permutation file to be generated...');
    await waitForFile(permutationPath);

    const permutation = fs.existsSync(permutationPath)
      ? fs.readFileSync(permutationPath, 'utf-8')
      : 'export const permutationRule = [];'; // Default for empty permutations

    const placementInstance = fs.existsSync(placementInstancePath)
      ? fs.readFileSync(placementInstancePath, 'utf-8')
      : null;

    res.json({
      ok: true,
      data: {
        permutation,
        placementInstance,
      },
    });
  } catch (error) {
    console.error('Error in /api/finalize:', error);
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.listen(3001, () => {
  console.log('Server running on port 3001');
});
