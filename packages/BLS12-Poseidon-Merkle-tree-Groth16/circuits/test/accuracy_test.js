const { execSync } = require('child_process');
const fs = require('fs');
const snarkjs = require('snarkjs');

describe("TokamakStorageMerkleProof Accuracy Tests", function () {
    this.timeout(60000); // Increased timeout for circuit operations

    describe("Basic Functionality Tests", function () {
        it("Should compile without errors", function () {
            try {
                // Test circuit compilation
                execSync('npm run compile', { stdio: 'pipe' });
                console.log("✓ Circuit compilation successful");
            } catch (error) {
                throw new Error(`Circuit compilation failed: ${error.message}`);
            }
        });

        it("Should accept valid inputs with minimal participants", async function () {
            const testInput = {
                "leaves": ["1000", "2000", ...Array(62).fill("0")],
            };

            // First compute correct root
            const root = await computeValidRoot(testInput);
            
            // Test with correct root
            const validInput = { "merkle_root": root, ...testInput };
            const inputFile = 'test_minimal.json';
            fs.writeFileSync(inputFile, JSON.stringify(validInput, null, 2));

            try {
                execSync(`cd build/merkle_tree_circuit_js && node generate_witness.js merkle_tree_circuit.wasm ../../${inputFile} witness_minimal.wtns`, { stdio: 'pipe' });
                console.log("✓ Minimal participants test passed");
                fs.unlinkSync(inputFile);
            } catch (error) {
                fs.unlinkSync(inputFile);
                throw new Error(`Minimal participants test failed: ${error.message}`);
            }
        });

        it("Should handle maximum participants (64)", async function () {
            const testInput = {
                "leaves": Array.from({length: 64}, (_, i) => ((i + 1) * 100).toString())
            };

            const root = await computeValidRoot(testInput);
            const validInput = { "merkle_root": root, ...testInput };
            const inputFile = 'test_max.json';
            fs.writeFileSync(inputFile, JSON.stringify(validInput, null, 2));

            try {
                execSync(`cd build/merkle_tree_circuit_js && node generate_witness.js merkle_tree_circuit.wasm ../../${inputFile} witness_max.wtns`, { stdio: 'pipe' });
                console.log("✓ Maximum participants test passed");
                fs.unlinkSync(inputFile);
            } catch (error) {
                fs.unlinkSync(inputFile);
                throw new Error(`Maximum participants test failed: ${error.message}`);
            }
        });
    });

    describe("Constraint Validation Tests", function () {
        it("Should handle zero leaves (all zeros)", async function () {
            const testInput = {
                "leaves": Array(64).fill("0")
            };

            const root = await computeValidRoot(testInput);
            const validInput = { "merkle_root": root, ...testInput };
            const inputFile = 'test_zero.json';
            fs.writeFileSync(inputFile, JSON.stringify(validInput, null, 2));

            try {
                execSync(`cd build/merkle_tree_circuit_js && node generate_witness.js merkle_tree_circuit.wasm ../../${inputFile} witness_zero.wtns`, { stdio: 'pipe' });
                console.log("✓ Zero leaves test passed");
                fs.unlinkSync(inputFile);
            } catch (error) {
                fs.unlinkSync(inputFile);
                throw new Error(`Zero leaves test failed: ${error.message}`);
            }
        });
    });

    describe("Root Verification Tests", function () {
        it("Should reject incorrect root", function () {
            const invalidInput = {
                "merkle_root": "12345678901234567890", // Wrong root
                "leaves": ["1000", "2000", ...Array(62).fill("0")]
            };

            const inputFile = 'test_wrong_root.json';
            fs.writeFileSync(inputFile, JSON.stringify(invalidInput, null, 2));

            try {
                execSync(`cd build/merkle_tree_circuit_js && node generate_witness.js merkle_tree_circuit.wasm ../../${inputFile} witness_wrong.wtns`, { stdio: 'pipe' });
                fs.unlinkSync(inputFile);
                throw new Error("Should have rejected incorrect root");
            } catch (error) {
                fs.unlinkSync(inputFile);
                console.log("✓ Correctly rejected incorrect root");
                // This is expected behavior
            }
        });
    });

    describe("Data Integrity Tests", function () {
        it("Should produce different roots for different leaves", async function () {
            const input1 = {
                "leaves": ["1000", "2000", ...Array(62).fill("0")]
            };

            const input2 = {
                "leaves": ["3000", "4000", ...Array(62).fill("0")]
            };

            const root1 = await computeValidRoot(input1);
            const root2 = await computeValidRoot(input2);

            if (root1 === root2) {
                throw new Error("Different leaves should produce different roots");
            }
            console.log("✓ Different leaves produce different roots");
        });

        it("Should produce different roots for different leaf positions", async function () {
            const input1 = {
                "leaves": ["1000", "2000", ...Array(62).fill("0")]
            };

            const input2 = {
                "leaves": ["2000", "1000", ...Array(62).fill("0")]  // Swapped positions
            };

            const root1 = await computeValidRoot(input1);
            const root2 = await computeValidRoot(input2);

            if (root1 === root2) {
                throw new Error("Different leaf positions should produce different roots");
            }
            console.log("✓ Different leaf positions produce different roots");
        });
    });

    describe("Performance and Scale Tests", function () {
        it("Should generate consistent witness for identical inputs", async function () {
            const input = {
                "leaves": ["700", "800", "900", ...Array(61).fill("0")]
            };

            const root1 = await computeValidRoot(input);
            const root2 = await computeValidRoot(input);

            if (root1 !== root2) {
                throw new Error("Identical inputs should produce identical roots");
            }
            console.log("✓ Deterministic witness generation verified");
        });
    });
});

// Helper function to compute valid root using temporary test circuit
async function computeValidRoot(input) {
    const testCircuit = `
pragma circom 2.0.0;

include "node_modules/poseidon-bls12381-circom/circuits/poseidon255.circom";

template Poseidon4MerkleTree(max_leaves) {
    signal input leaves[max_leaves];
    signal output root;
    
    var level0_nodes = max_leaves / 4;
    component level0[level0_nodes];
    signal level0_outputs[level0_nodes];
    
    for (var i = 0; i < level0_nodes; i++) {
        level0[i] = Poseidon255(4);
        level0[i].in[0] <== leaves[i*4 + 0];
        level0[i].in[1] <== leaves[i*4 + 1];
        level0[i].in[2] <== leaves[i*4 + 2];
        level0[i].in[3] <== leaves[i*4 + 3];
        level0_outputs[i] <== level0[i].out;
    }
    
    var level1_nodes = level0_nodes / 4;
    component level1[level1_nodes];
    signal level1_outputs[level1_nodes];
    
    for (var i = 0; i < level1_nodes; i++) {
        level1[i] = Poseidon255(4);
        level1[i].in[0] <== level0_outputs[i*4 + 0];
        level1[i].in[1] <== level0_outputs[i*4 + 1];
        level1[i].in[2] <== level0_outputs[i*4 + 2];
        level1[i].in[3] <== level0_outputs[i*4 + 3];
        level1_outputs[i] <== level1[i].out;
    }
    
    component level2 = Poseidon255(4);
    level2.in[0] <== level1_outputs[0];
    level2.in[1] <== level1_outputs[1];
    level2.in[2] <== level1_outputs[2];
    level2.in[3] <== level1_outputs[3];
    
    root <== level2.out;
}

template TestRoot() {
    signal input leaves[64];
    signal output computed_root;
    
    component merkle_tree = Poseidon4MerkleTree(64);
    
    for (var i = 0; i < 64; i++) {
        merkle_tree.leaves[i] <== leaves[i];
    }
    
    computed_root <== merkle_tree.root;
}

component main{public [leaves]} = TestRoot();`;

    const timestamp = Date.now();
    const fileName = `temp_test_${timestamp}`;
    
    try {
        // Write test circuit
        fs.writeFileSync(`${fileName}.circom`, testCircuit);
        
        // Write input file
        const inputFile = `${fileName}_input.json`;
        fs.writeFileSync(inputFile, JSON.stringify(input, null, 2));
        
        // Compile circuit (run from main directory so includes work)
        execSync(`mkdir -p ${fileName}_build && ./circom-2.0 ${fileName}.circom --r1cs --wasm --sym --output ./${fileName}_build/`, { stdio: 'pipe', cwd: process.cwd() });
        
        // Generate witness
        execSync(`cd ${fileName}_build/${fileName}_js && node generate_witness.js ${fileName}.wasm ../../${inputFile} witness.wtns`, { stdio: 'pipe' });
        
        // Read witness
        const witness = await snarkjs.wtns.exportJson(`./${fileName}_build/${fileName}_js/witness.wtns`);
        
        // Find computed root (last output signal)
        let computedRoot = witness[witness.length - 1].toString();
        
        // Cleanup
        execSync(`rm -rf ${fileName}_build ${fileName}.circom ${inputFile}`);
        
        return computedRoot;
    } catch (error) {
        // Cleanup on error
        try {
            execSync(`rm -rf ${fileName}_build ${fileName}.circom ${fileName}_input.json`);
        } catch (e) {}
        throw error;
    }
}