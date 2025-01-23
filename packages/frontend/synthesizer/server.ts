import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { finalize } from './src/tokamak/core/finalize.js';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Helper function to recursively fix arrays in the object
function deepFixArrays(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(deepFixArrays);
  } else if (obj && typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (keys.length && keys.every(k => /^\d+$/.test(k))) {
      // convert numeric-keyed object => array
      const sorted = keys.sort((a, b) => Number(a) - Number(b));
      return sorted.map(k => deepFixArrays(obj[k]));
    } else {
      for (const k of keys) {
        obj[k] = deepFixArrays(obj[k]);
      }
      return obj;
    }
  }
  return obj;
}

app.post('/api/finalize', async (req, res) => {
  try {
    // 1) Parse placements from request body
    const placementsObj = req.body.placements;

    // 2) Convert placements back into a Map
    const placementsMap = new Map<number, any>(
      Object.entries(placementsObj).map(([k, v]) => {
        return [Number(k), deepFixArrays(v)];
      })
    );

    // 3) Ensure inPts/outPts are arrays for all placements
    for (const [mapKey, placement] of placementsMap.entries()) {
      if (!placement.inPts) {
        placement.inPts = [];
      } else if (!Array.isArray(placement.inPts)) {
        placement.inPts = Object.values(placement.inPts);
      }

      if (!placement.outPts) {
        placement.outPts = [];
      } else if (!Array.isArray(placement.outPts)) {
        placement.outPts = Object.values(placement.outPts);
      }
    }

    // 4) Log the processed placementsMap for debugging
    console.log('--- Final placementsMap before finalize ---');
    for (const [k, v] of placementsMap.entries()) {
      console.log(`Key = ${k}`, JSON.stringify(v, null, 2));
    }

    // 5) Call finalize to generate results
    const result = await finalize(placementsMap, true);

    // Assuming `finalize` writes files to /outputs directory
    const outputDir = path.join(__dirname, 'outputs');

    // Ensure the output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Extract the generated permutation and placementInstance
    const permutationPath = path.join(outputDir, 'permutation.ts');
    const placementInstancePath = path.join(outputDir, 'placementInstance.ts');

    // Read the files if they exist
    const permutation = fs.existsSync(permutationPath)
      ? fs.readFileSync(permutationPath, 'utf-8')
      : null;

    const placementInstance = fs.existsSync(placementInstancePath)
      ? fs.readFileSync(placementInstancePath, 'utf-8')
      : null;

    // Return the results
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

// Start the server
app.listen(3001, () => {
  console.log('Server running on port 3001');
});
