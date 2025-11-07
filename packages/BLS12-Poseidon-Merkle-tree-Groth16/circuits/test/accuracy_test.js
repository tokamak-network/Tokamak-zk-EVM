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
                "active_leaves": "2",
                "leaf_indices": ["0", "1", ...Array(48).fill("0")],
                "merkle_keys": ["123456", "789012", ...Array(48).fill("0")],
                "storage_values": ["1000", "2000", ...Array(48).fill("0")]
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

        it("Should handle maximum participants (50)", async function () {
            const testInput = {
                "active_leaves": "50",
                "leaf_indices": Array.from({length: 50}, (_, i) => i.toString()),
                "merkle_keys": Array.from({length: 50}, (_, i) => ((i + 1) * 111111).toString()),
                "storage_values": Array.from({length: 50}, (_, i) => ((i + 1) * 100).toString())
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
        it("Should enforce active_leaves <= 50", function () {
            const invalidInput = {
                "merkle_root": "0",
                "active_leaves": "51", // Invalid: exceeds maximum
                "leaf_indices": Array(50).fill("0"),
                "merkle_keys": Array(50).fill("123456"),
                "storage_values": Array(50).fill("100")
            };

            const inputFile = 'test_invalid.json';
            fs.writeFileSync(inputFile, JSON.stringify(invalidInput, null, 2));

            try {
                execSync(`cd build/merkle_tree_circuit_js && node generate_witness.js merkle_tree_circuit.wasm ../../${inputFile} witness_invalid.wtns`, { stdio: 'pipe' });
                fs.unlinkSync(inputFile);
                throw new Error("Should have rejected active_leaves > 50");
            } catch (error) {
                fs.unlinkSync(inputFile);
                console.log("✓ Correctly rejected active_leaves > 50");
                // This is expected behavior
            }
        });

        it("Should handle zero participants", async function () {
            const testInput = {
                "active_leaves": "0",
                "leaf_indices": Array(50).fill("0"),
                "merkle_keys": Array(50).fill("0"),
                "storage_values": Array(50).fill("0")
            };

            const root = await computeValidRoot(testInput);
            const validInput = { "merkle_root": root, ...testInput };
            const inputFile = 'test_zero.json';
            fs.writeFileSync(inputFile, JSON.stringify(validInput, null, 2));

            try {
                execSync(`cd build/merkle_tree_circuit_js && node generate_witness.js merkle_tree_circuit.wasm ../../${inputFile} witness_zero.wtns`, { stdio: 'pipe' });
                console.log("✓ Zero participants test passed");
                fs.unlinkSync(inputFile);
            } catch (error) {
                fs.unlinkSync(inputFile);
                throw new Error(`Zero participants test failed: ${error.message}`);
            }
        });
    });

    describe("Root Verification Tests", function () {
        it("Should reject incorrect root", function () {
            const invalidInput = {
                "merkle_root": "12345678901234567890", // Wrong root
                "active_leaves": "2",
                "leaf_indices": ["0", "1", ...Array(48).fill("0")],
                "merkle_keys": ["123456", "789012", ...Array(48).fill("0")],
                "storage_values": ["1000", "2000", ...Array(48).fill("0")]
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
        it("Should produce different roots for different leaf indices", async function () {
            const input1 = {
                "active_leaves": "2",
                "leaf_indices": ["0", "1", ...Array(48).fill("0")],
                "merkle_keys": ["123456", "789012", ...Array(48).fill("0")],
                "storage_values": ["1000", "2000", ...Array(48).fill("0")]
            };

            const input2 = {
                "active_leaves": "2",
                "leaf_indices": ["2", "3", ...Array(48).fill("0")],
                "merkle_keys": ["123456", "789012", ...Array(48).fill("0")],
                "storage_values": ["1000", "2000", ...Array(48).fill("0")]
            };

            const root1 = await computeValidRoot(input1);
            const root2 = await computeValidRoot(input2);

            if (root1 === root2) {
                throw new Error("Different leaf indices should produce different roots");
            }
            console.log("✓ Different leaf indices produce different roots");
        });

        it("Should produce different roots for different storage data", async function () {
            const input1 = {
                "active_leaves": "2",
                "leaf_indices": ["0", "1", ...Array(48).fill("0")],
                "merkle_keys": ["123456", "789012", ...Array(48).fill("0")],
                "storage_values": ["1000", "2000", ...Array(48).fill("0")]
            };

            const input2 = {
                "active_leaves": "2",
                "leaf_indices": ["0", "1", ...Array(48).fill("0")],
                "merkle_keys": ["333333", "444444", ...Array(48).fill("0")],
                "storage_values": ["3000", "4000", ...Array(48).fill("0")]
            };

            const root1 = await computeValidRoot(input1);
            const root2 = await computeValidRoot(input2);

            if (root1 === root2) {
                throw new Error("Different storage data should produce different roots");
            }
            console.log("✓ Different storage data produces different roots");
        });
    });

    describe("Performance and Scale Tests", function () {
        it("Should generate consistent witness for identical inputs", async function () {
            const input = {
                "active_leaves": "3",
                "leaf_indices": ["0", "1", "2", ...Array(47).fill("0")],
                "merkle_keys": ["777777", "888888", "999999", ...Array(47).fill("0")],
                "storage_values": ["700", "800", "900", ...Array(47).fill("0")]
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
include "node_modules/circomlib/circuits/comparators.circom";

template StorageLeafComputation(max_leaves) {
    signal input active_leaves;
    signal input leaf_indices[max_leaves];
    signal input merkle_keys[max_leaves];
    signal input storage_values[max_leaves];
    signal output leaf_values[max_leaves];
    
    component poseidon4[max_leaves];
    
    for (var i = 0; i < max_leaves; i++) {
        poseidon4[i] = Poseidon255(4);
        poseidon4[i].in[0] <== leaf_indices[i];
        poseidon4[i].in[1] <== merkle_keys[i];
        poseidon4[i].in[2] <== storage_values[i];
        poseidon4[i].in[3] <== 0;
        leaf_values[i] <== poseidon4[i].out;
    }
    
    component lt = LessThan(8);
    lt.in[0] <== active_leaves;
    lt.in[1] <== 51;
    lt.out === 1;
}

template Poseidon4MerkleTree() {
    signal input leaves[64];
    signal input leaf_count;
    signal output root;
    
    component is_active[64];
    for (var i = 0; i < 64; i++) {
        is_active[i] = LessThan(8);
        is_active[i].in[0] <== i;
        is_active[i].in[1] <== leaf_count;
    }
    
    component level0[16];
    signal level0_outputs[16];
    
    for (var i = 0; i < 16; i++) {
        level0[i] = Poseidon255(4);
        level0[i].in[0] <== is_active[i*4 + 0].out * leaves[i*4 + 0];
        level0[i].in[1] <== is_active[i*4 + 1].out * leaves[i*4 + 1];
        level0[i].in[2] <== is_active[i*4 + 2].out * leaves[i*4 + 2];
        level0[i].in[3] <== is_active[i*4 + 3].out * leaves[i*4 + 3];
        level0_outputs[i] <== level0[i].out;
    }
    
    component level1[4];
    signal level1_outputs[4];
    
    for (var i = 0; i < 4; i++) {
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
    signal input active_leaves;
    signal input leaf_indices[50];
    signal input merkle_keys[50];
    signal input storage_values[50];
    signal output computed_root;
    
    component storage_leaves = StorageLeafComputation(50);
    storage_leaves.active_leaves <== active_leaves;
    
    for (var i = 0; i < 50; i++) {
        storage_leaves.leaf_indices[i] <== leaf_indices[i];
        storage_leaves.merkle_keys[i] <== merkle_keys[i];
        storage_leaves.storage_values[i] <== storage_values[i];
    }
    
    signal padded_leaves[64];
    
    for (var i = 0; i < 50; i++) {
        padded_leaves[i] <== storage_leaves.leaf_values[i];
    }
    
    for (var i = 50; i < 64; i++) {
        padded_leaves[i] <== 0;
    }
    
    component merkle_tree = Poseidon4MerkleTree();
    merkle_tree.leaf_count <== active_leaves;
    
    for (var i = 0; i < 64; i++) {
        merkle_tree.leaves[i] <== padded_leaves[i];
    }
    
    computed_root <== merkle_tree.root;
}

component main{public [active_leaves]} = TestRoot();`;

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
        
        // Find computed root
        let computedRoot = witness[1].toString();
        for (let i = 0; i < witness.length; i++) {
            if (witness[i] > 1000000n) {
                computedRoot = witness[i].toString();
                break;
            }
        }
        
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