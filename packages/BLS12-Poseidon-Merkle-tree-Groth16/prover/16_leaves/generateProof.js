#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function generateProof() {
    try {
        console.log('🔧 Starting proof generation process...');
        
        // Step 1: Generate witness
        console.log('📝 Generating witness...');
        execSync('snarkjs wtns calculate ../../circuits/build/circuit_N2_js/circuit_N2.wasm input.json witness.wtns', {
            stdio: 'inherit',
            cwd: process.cwd()
        });
        console.log('✅ Witness generated successfully');
        
        // Step 2: Generate proof
        console.log('🔐 Generating proof...');
        execSync('snarkjs groth16 prove ../../trusted-setup/16_leaves/circuit_final.zkey witness.wtns proof.json public.json', {
            stdio: 'inherit',
            cwd: process.cwd()
        });
        console.log('✅ Proof generated successfully');
        
        // Step 3: Verify the generated files exist
        const proofPath = './proof.json';
        const publicPath = './public.json';
        
        if (fs.existsSync(proofPath) && fs.existsSync(publicPath)) {
            console.log('📄 Generated files:');
            console.log(`  - Proof: ${proofPath}`);
            console.log(`  - Public signals: ${publicPath}`);
            
            // Display proof summary
            const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
            const publicSignals = JSON.parse(fs.readFileSync(publicPath, 'utf8'));
            
            console.log('\n📊 Proof Summary:');
            console.log(`  - Protocol: Groth16`);
            console.log(`  - Curve: BLS12-381`);
            console.log(`  - Circuit: 16 leaves (N=2)`);
            console.log(`  - Public signals count: ${publicSignals.length}`);
            console.log(`  - Proof components: pi_a, pi_b, pi_c`);
            
        } else {
            throw new Error('Generated proof files not found');
        }
        
        console.log('\n🎉 Proof generation completed successfully!');
        
    } catch (error) {
        console.error('❌ Error during proof generation:', error.message);
        process.exit(1);
    }
}

// Check if required files exist before starting
function checkRequiredFiles() {
    const requiredFiles = [
        '../../circuits/build/circuit_N2_js/circuit_N2.wasm',
        'input.json',
        '../../trusted-setup/16_leaves/circuit_final.zkey'
    ];
    
    const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));
    
    if (missingFiles.length > 0) {
        console.error('❌ Missing required files:');
        missingFiles.forEach(file => console.error(`  - ${file}`));
        console.error('\nPlease ensure all required files are present before running this script.');
        process.exit(1);
    }
}

// Ensure output directories exist
function ensureDirectories() {
    console.log(`📁 Working in directory: ${process.cwd()}`);
}

// Main execution
if (require.main === module) {
    console.log('🚀 Tokamak ZK Proof Generator (16 Leaves)');
    console.log('==========================================\n');
    
    checkRequiredFiles();
    ensureDirectories();
    generateProof();
}

module.exports = { generateProof };