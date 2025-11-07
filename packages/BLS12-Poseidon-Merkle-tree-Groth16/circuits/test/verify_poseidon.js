const { execSync } = require('child_process');
const fs = require('fs');
const snarkjs = require('snarkjs');

console.log("🔍 VERIFYING POSEIDON HASH COMPUTATIONS\n");

// Test that different inputs produce different hashes (avalanche effect) with new format
const poseidonTests = [
    {
        name: "Different leaf indices produce different hashes",
        inputs: [
            { leaf_indices: ["0", "1"], merkle_keys: ["123456", "789012"], storage_values: ["1000", "2000"] },
            { leaf_indices: ["2", "3"], merkle_keys: ["123456", "789012"], storage_values: ["1000", "2000"] }
        ]
    },
    {
        name: "Different merkle keys produce different hashes", 
        inputs: [
            { leaf_indices: ["0", "1"], merkle_keys: ["123456", "789012"], storage_values: ["1000", "2000"] },
            { leaf_indices: ["0", "1"], merkle_keys: ["999999", "888888"], storage_values: ["1000", "2000"] }
        ]
    },
    {
        name: "Different storage values produce different hashes",
        inputs: [
            { leaf_indices: ["0", "1"], merkle_keys: ["123456", "789012"], storage_values: ["1000", "2000"] },
            { leaf_indices: ["0", "1"], merkle_keys: ["123456", "789012"], storage_values: ["3000", "4000"] }
        ]
    },
    {
        name: "Adding participants changes root",
        inputs: [
            { leaf_indices: ["0"], merkle_keys: ["123456"], storage_values: ["1000"], active_leaves: "1" },
            { leaf_indices: ["0", "1"], merkle_keys: ["123456", "789012"], storage_values: ["1000", "2000"], active_leaves: "2" }
        ]
    }
];

async function getComputedRoot(input, testIndex, inputIndex) {
    try {
        // Create a simple test circuit
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

        const fileName = `poseidon_test_${testIndex}_${inputIndex}`;
        
        // Write temporary test circuit
        fs.writeFileSync(`${fileName}.circom`, testCircuit);
        
        // Prepare full input (pad to 50 elements)
        const fullInput = {
            active_leaves: input.active_leaves || "2",
            leaf_indices: [...input.leaf_indices, ...Array(50 - input.leaf_indices.length).fill("0")],
            merkle_keys: [...input.merkle_keys, ...Array(50 - input.merkle_keys.length).fill("0")],
            storage_values: [...input.storage_values, ...Array(50 - input.storage_values.length).fill("0")]
        };
        
        const inputFile = `${fileName}_input.json`;
        fs.writeFileSync(inputFile, JSON.stringify(fullInput, null, 2));
        
        // Compile it
        execSync(`mkdir -p ${fileName}_build && ./circom-2.0 ${fileName}.circom --r1cs --wasm --sym --output ./${fileName}_build/`, { stdio: 'pipe' });
        
        // Generate witness
        execSync(`cd ${fileName}_build/${fileName}_js && node generate_witness.js ${fileName}.wasm ../../${inputFile} witness.wtns`, { stdio: 'pipe' });
        
        // Read witness to get computed root
        const witness = await snarkjs.wtns.exportJson(`./${fileName}_build/${fileName}_js/witness.wtns`);
        
        // Find the computed root
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
        const fileName = `poseidon_test_${testIndex}_${inputIndex}`;
        try {
            execSync(`rm -rf ${fileName}_build ${fileName}.circom ${fileName}_input.json`);
        } catch (e) {}
        throw error;
    }
}

async function runPoseidonTest(test, index) {
    console.log(`📋 Test ${index + 1}: ${test.name}`);
    
    try {
        const roots = [];
        
        for (let i = 0; i < test.inputs.length; i++) {
            const root = await getComputedRoot(test.inputs[i], index, i);
            roots.push(root);
        }
        
        // Check if roots are different (as expected)
        const allDifferent = roots.every((root, i) => 
            roots.every((otherRoot, j) => i === j || root !== otherRoot)
        );
        
        if (allDifferent) {
            console.log(`   ✅ PASSED - Different inputs produce different hashes`);
            console.log(`   🔍 Root 1: ${roots[0].substring(0, 20)}...`);
            console.log(`   🔍 Root 2: ${roots[1].substring(0, 20)}...`);
            return true;
        } else {
            console.log(`   ❌ FAILED - Some inputs produced identical hashes`);
            roots.forEach((root, i) => console.log(`   Root ${i + 1}: ${root.substring(0, 30)}...`));
            return false;
        }
        
    } catch (error) {
        console.log(`   ❌ FAILED - Error: ${error.message.split('\n')[0]}`);
        return false;
    }
}

// Test hash determinism (same input should always produce same output)
async function testDeterminism() {
    console.log(`📋 Test: Hash Determinism`);
    
    try {
        const input = {
            active_leaves: "2",
            leaf_indices: ["0", "1"],
            merkle_keys: ["123456", "789012"],
            storage_values: ["1000", "2000"]
        };
        
        const roots = [];
        
        // Generate the same witness multiple times
        for (let i = 0; i < 3; i++) {
            const root = await getComputedRoot(input, 999, i); // Use 999 as test index for determinism
            roots.push(root);
        }
        
        // All roots should be identical
        const allSame = roots.every(root => root === roots[0]);
        
        if (allSame) {
            console.log(`   ✅ PASSED - Hash computation is deterministic`);
            console.log(`   🔍 Consistent root: ${roots[0].substring(0, 20)}...`);
            return true;
        } else {
            console.log(`   ❌ FAILED - Hash computation is non-deterministic`);
            roots.forEach((root, i) => console.log(`   Run ${i + 1}: ${root.substring(0, 30)}...`));
            return false;
        }
        
    } catch (error) {
        console.log(`   ❌ FAILED - Error: ${error.message.split('\n')[0]}`);
        return false;
    }
}

async function runAllPoseidonTests() {
    let passedTests = 0;
    const totalTests = poseidonTests.length + 1; // +1 for determinism test
    
    for (let i = 0; i < poseidonTests.length; i++) {
        const success = await runPoseidonTest(poseidonTests[i], i);
        if (success) passedTests++;
    }
    
    // Test determinism
    const determinismPassed = await testDeterminism();
    if (determinismPassed) passedTests++;
    
    console.log(`\n🔐 POSEIDON HASH VERIFICATION RESULTS`);
    console.log(`====================================`);
    console.log(`✅ Passed: ${passedTests}/${totalTests}`);
    console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);
    
    if (passedTests === totalTests) {
        console.log(`\n🎉 ALL POSEIDON TESTS PASSED! Hash computations verified.`);
    } else {
        console.log(`\n⚠️  Some tests failed. Hash computations may have issues.`);
    }
}

runAllPoseidonTests().catch(console.error);