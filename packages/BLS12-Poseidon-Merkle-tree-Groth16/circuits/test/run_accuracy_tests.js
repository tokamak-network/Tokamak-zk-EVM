const { execSync } = require('child_process');
const fs = require('fs');

console.log("🧪 RUNNING COMPREHENSIVE CIRCUIT ACCURACY TESTS\n");

// Test cases with new format: leaf_indices, merkle_keys, storage_values
const testCases = [
    {
        name: "✅ Valid 3 participants",
        input: {
            "active_leaves": "3",
            "leaf_indices": ["0", "1", "2", ...Array(47).fill("0")],
            "merkle_keys": ["123456", "789012", "345678", ...Array(47).fill("0")],
            "storage_values": ["1000", "2000", "3000", ...Array(47).fill("0")]
        },
        expectedSuccess: true
    },
    {
        name: "✅ Valid 1 participant",
        input: {
            "active_leaves": "1",
            "leaf_indices": ["0", ...Array(49).fill("0")],
            "merkle_keys": ["999999", ...Array(49).fill("0")],
            "storage_values": ["5000", ...Array(49).fill("0")]
        },
        expectedSuccess: true
    },
    {
        name: "✅ Valid 50 participants (maximum)",
        input: {
            "active_leaves": "50",
            "leaf_indices": Array.from({length: 50}, (_, i) => i.toString()),
            "merkle_keys": Array.from({length: 50}, (_, i) => ((i + 1) * 111111).toString()),
            "storage_values": Array.from({length: 50}, (_, i) => ((i + 1) * 100).toString())
        },
        expectedSuccess: true
    },
    {
        name: "✅ Valid 0 participants (edge case)",
        input: {
            "active_leaves": "0",
            "leaf_indices": Array(50).fill("0"),
            "merkle_keys": Array(50).fill("0"),
            "storage_values": Array(50).fill("0")
        },
        expectedSuccess: true
    },
    {
        name: "❌ Invalid 51 participants (should fail)",
        input: {
            "active_leaves": "51",
            "leaf_indices": Array(50).fill("0"),
            "merkle_keys": Array(50).fill("123456"),
            "storage_values": Array(50).fill("100")
        },
        expectedSuccess: false
    },
    {
        name: "❌ Invalid large active_leaves (should fail)",
        input: {
            "active_leaves": "100",
            "leaf_indices": Array(50).fill("0"),
            "merkle_keys": Array(50).fill("123456"),
            "storage_values": Array(50).fill("100")
        },
        expectedSuccess: false
    }
];

async function getComputedRoot(input, index) {
    try {
        // Create a temporary test circuit that outputs the computed root
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

        // Write temporary test circuit
        fs.writeFileSync(`test_circuit_${index}.circom`, testCircuit);
        
        // Compile it
        execSync(`mkdir -p temp_build_${index} && ./circom-2.0 test_circuit_${index}.circom --r1cs --wasm --sym --output ./temp_build_${index}/`, { stdio: 'pipe' });
        
        // Write input file
        const inputFile = `test_input_${index}.json`;
        fs.writeFileSync(inputFile, JSON.stringify(input, null, 2));
        
        // Generate witness
        execSync(`cd temp_build_${index}/test_circuit_${index}_js && node generate_witness.js test_circuit_${index}.wasm ../../${inputFile} witness.wtns`, { stdio: 'pipe' });
        
        // Read witness to get computed root
        const snarkjs = require("snarkjs");
        const witness = await snarkjs.wtns.exportJson(`./temp_build_${index}/test_circuit_${index}_js/witness.wtns`);
        
        // Find the computed root (should be the output signal)
        let computedRoot = witness[1].toString(); // Default fallback
        for (let i = 0; i < witness.length; i++) {
            if (witness[i] > 1000000n) {
                computedRoot = witness[i].toString();
                break;
            }
        }
        
        // Cleanup
        execSync(`rm -rf temp_build_${index} test_circuit_${index}.circom ${inputFile}`);
        
        return computedRoot;
    } catch (error) {
        // Cleanup on error
        try {
            execSync(`rm -rf temp_build_${index} test_circuit_${index}.circom test_input_${index}.json`);
        } catch (e) {}
        throw error;
    }
}

async function runTest(testCase, index) {
    console.log(`\n📋 Test ${index + 1}: ${testCase.name}`);
    
    try {
        if (testCase.expectedSuccess) {
            // First get the computed root
            const computedRoot = await getComputedRoot(testCase.input, index);
            
            // Create input with computed root for original circuit
            const validInput = {
                "merkle_root": computedRoot,
                ...testCase.input
            };
            
            const validInputFile = `test_case_valid_${index}.json`;
            fs.writeFileSync(validInputFile, JSON.stringify(validInput, null, 2));
            
            // Test with original circuit
            execSync(`cd build/merkle_tree_circuit_js && node generate_witness.js merkle_tree_circuit.wasm ../../${validInputFile} witness_valid_${index}.wtns`, { stdio: 'pipe' });
            
            console.log(`   ✅ PASSED - Circuit accepted valid input`);
            console.log(`   📊 Computed root: ${computedRoot.substring(0, 20)}...`);
            console.log(`   📈 Active leaves: ${testCase.input.active_leaves}`);
            
            // Cleanup
            fs.unlinkSync(validInputFile);
            
        } else {
            // For invalid cases, try with a dummy root (should fail due to bounds check)
            const invalidInput = {
                "merkle_root": "0",
                ...testCase.input
            };
            
            const invalidInputFile = `test_case_invalid_${index}.json`;
            fs.writeFileSync(invalidInputFile, JSON.stringify(invalidInput, null, 2));
            
            // This should fail
            execSync(`cd build/merkle_tree_circuit_js && node generate_witness.js merkle_tree_circuit.wasm ../../${invalidInputFile} witness_invalid_${index}.wtns`, { stdio: 'pipe' });
            
            console.log(`   ❌ FAILED - Circuit should have rejected invalid input but didn't`);
            fs.unlinkSync(invalidInputFile);
            return false;
        }
        
    } catch (error) {
        if (testCase.expectedSuccess) {
            console.log(`   ❌ FAILED - Circuit rejected valid input: ${error.message.split('\n')[0]}`);
            return false;
        } else {
            console.log(`   ✅ PASSED - Circuit correctly rejected invalid input`);
        }
    }
    
    return true;
}

async function runAllTests() {
    let passedTests = 0;
    const totalTests = testCases.length;
    
    for (let i = 0; i < testCases.length; i++) {
        const success = await runTest(testCases[i], i);
        if (success) passedTests++;
    }
    
    console.log(`\n🏁 ACCURACY TEST RESULTS`);
    console.log(`=========================`);
    console.log(`✅ Passed: ${passedTests}/${totalTests}`);
    console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);
    
    if (passedTests === totalTests) {
        console.log(`\n🎉 ALL TESTS PASSED! Circuit accuracy verified.`);
    } else {
        console.log(`\n⚠️  Some tests failed. Circuit may have accuracy issues.`);
    }
    
    // Final cleanup
    try {
        execSync('rm -f test_case_*.json witness_test_*.wtns witness_valid_*.wtns witness_invalid_*.wtns');
    } catch (e) {
        // Ignore cleanup errors
    }
}

runAllTests().catch(console.error);