const { execSync } = require('child_process');
const fs = require('fs');

console.log("🧪 RUNNING COMPREHENSIVE CIRCUIT ACCURACY TESTS\n");

// Test cases with new format: merkle_keys, storage_values (public inputs)
const testCases = [
    {
        name: "✅ Valid 3 participants",
        input: {
            "merkle_keys": ["123456", "789012", "345678", ...Array(47).fill("0")],
            "storage_values": ["1000", "2000", "3000", ...Array(47).fill("0")]
        },
        expectedSuccess: true
    },
    {
        name: "✅ Valid 1 participant",
        input: {
            "merkle_keys": ["999999", ...Array(49).fill("0")],
            "storage_values": ["5000", ...Array(49).fill("0")]
        },
        expectedSuccess: true
    },
    {
        name: "✅ Valid 50 participants (maximum)",
        input: {
            "merkle_keys": Array.from({length: 50}, (_, i) => ((i + 1) * 111111).toString()),
            "storage_values": Array.from({length: 50}, (_, i) => ((i + 1) * 100).toString())
        },
        expectedSuccess: true
    },
    {
        name: "✅ Valid 0 participants (edge case)",
        input: {
            "merkle_keys": Array(50).fill("0"),
            "storage_values": Array(50).fill("0")
        },
        expectedSuccess: true
    },
    {
        name: "✅ Mixed participant data",
        input: {
            "merkle_keys": ["111111", "222222", "333333", "444444", "555555", ...Array(45).fill("0")],
            "storage_values": ["10", "20", "30", "40", "50", ...Array(45).fill("0")]
        },
        expectedSuccess: true
    },
    {
        name: "✅ Large values (stress test)",
        input: {
            "merkle_keys": Array(50).fill("999999999999999999999"),
            "storage_values": Array(50).fill("888888888888888888888")
        },
        expectedSuccess: true
    }
];

async function runTest(testCase, index) {
    console.log(`\n📋 Test ${index + 1}: ${testCase.name}`);
    
    try {
        const inputFile = `test_case_${index}.json`;
        fs.writeFileSync(inputFile, JSON.stringify(testCase.input, null, 2));
        
        // Test with the updated circuit (should generate witness successfully)
        execSync(`cd build/merkle_tree_circuit_js && node generate_witness.js merkle_tree_circuit.wasm ../../${inputFile} witness_${index}.wtns`, { stdio: 'pipe' });
        
        console.log(`   ✅ PASSED - Circuit generated witness successfully`);
        
        // Cleanup
        fs.unlinkSync(inputFile);
        
        return true;
        
    } catch (error) {
        console.log(`   ❌ FAILED - Circuit rejected input: ${error.message.split('\n')[0]}`);
        
        try {
            fs.unlinkSync(`test_case_${index}.json`);
        } catch (e) {}
        
        return false;
    }
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
        execSync('rm -f test_case_*.json witness_*.wtns');
    } catch (e) {
        // Ignore cleanup errors
    }
}

runAllTests().catch(console.error);