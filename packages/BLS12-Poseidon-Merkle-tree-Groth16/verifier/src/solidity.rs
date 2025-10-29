use crate::errors::{VerifierError, Result};
use tokamak_groth16_trusted_setup::VerificationKey;
use std::fs;
use std::path::Path;

/// Solidity verifier contract generator
pub struct SolidityVerifierGenerator;

impl SolidityVerifierGenerator {
    /// Generate Solidity verifier contract from verification key
    pub fn generate_verifier_contract(vk: &VerificationKey) -> Result<String> {
        // Use the optimized Tokamak verifier instead of template
        Self::generate_tokamak_verifier(vk)
    }
    
    /// Generate optimized verifier contract for Tokamak circuit
    pub fn generate_tokamak_verifier(vk: &VerificationKey) -> Result<String> {
        let contract = format!(r#"
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title TokamakGroth16Verifier
 * @dev Optimized Groth16 verifier for Tokamak storage proofs
 * Generated automatically from verification key
 */
contract TokamakGroth16Verifier {{
    using Pairing for *;
    
    struct VerifyingKey {{
        Pairing.G1Point alpha;
        Pairing.G2Point beta;
        Pairing.G2Point gamma;
        Pairing.G2Point delta;
        Pairing.G1Point[] gamma_abc;
    }}
    
    struct Proof {{
        Pairing.G1Point a;
        Pairing.G2Point b;
        Pairing.G1Point c;
    }}
    
    VerifyingKey verifyingKey;
    
    event ProofVerified(bool result);
    
    constructor() {{
        verifyingKey.alpha = Pairing.G1Point(
            // TODO: Insert actual alpha_g1 coordinates
            0x0, 0x0
        );
        verifyingKey.beta = Pairing.G2Point(
            [0x0, 0x0],
            [0x0, 0x0]
        );
        verifyingKey.gamma = Pairing.G2Point(
            [0x0, 0x0], 
            [0x0, 0x0]
        );
        verifyingKey.delta = Pairing.G2Point(
            [0x0, 0x0],
            [0x0, 0x0]
        );
        
        // IC vector for public inputs: [merkle_root, active_leaves, channel_id]
        verifyingKey.gamma_abc = new Pairing.G1Point[]({});
        // TODO: Insert actual IC points
    }}
    
    /**
     * @dev Verify a Groth16 proof for Tokamak storage consistency
     * @param proof The Groth16 proof
     * @param merkleRoot Expected Merkle root of storage
     * @param activeLeaves Number of active participants
     * @param channelId Channel identifier
     * @return result True if proof is valid
     */
    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint256 merkleRoot,
        uint256 activeLeaves, 
        uint256 channelId
    ) public returns (bool result) {{
        Proof memory proof;
        proof.a = Pairing.G1Point(a[0], a[1]);
        proof.b = Pairing.G2Point([b[0][0], b[0][1]], [b[1][0], b[1][1]]);
        proof.c = Pairing.G1Point(c[0], c[1]);
        
        uint[] memory publicInputs = new uint[](3);
        publicInputs[0] = merkleRoot;
        publicInputs[1] = activeLeaves;
        publicInputs[2] = channelId;
        
        result = verifyTx(proof, publicInputs);
        emit ProofVerified(result);
        return result;
    }}
    
    /**
     * @dev Internal verification logic
     */
    function verifyTx(Proof memory proof, uint[] memory input) internal view returns (bool) {{
        uint256 snark_scalar_field = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        VerifyingKey memory vk = verifyingKey;
        require(input.length + 1 == vk.gamma_abc.length);
        
        // Compute the linear combination vk_x
        Pairing.G1Point memory vk_x = Pairing.G1Point(0, 0);
        for (uint i = 0; i < input.length; i++) {{
            require(input[i] < snark_scalar_field);
            vk_x = Pairing.addition(vk_x, Pairing.scalar_mul(vk.gamma_abc[i + 1], input[i]));
        }}
        vk_x = Pairing.addition(vk_x, vk.gamma_abc[0]);
        
        // Verify pairing equation
        return Pairing.pairing(
            Pairing.negate(proof.a),
            proof.b,
            vk.alpha,
            vk.beta,
            vk_x,
            vk.gamma,
            proof.c,
            vk.delta
        );
    }}
}}

/**
 * @title Pairing
 * @dev Pairing library for BLS12-381 curve operations
 */
library Pairing {{
    struct G1Point {{
        uint X;
        uint Y;
    }}
    
    struct G2Point {{
        uint[2] X;
        uint[2] Y;
    }}
    
    /// @return the generator of G1
    function P1() pure internal returns (G1Point memory) {{
        return G1Point(1, 2);
    }}
    
    /// @return the generator of G2
    function P2() pure internal returns (G2Point memory) {{
        return G2Point(
            [11559732032986387107991004021392285783925812861821192530917403151452391805634,
             10857046999023057135944570762232829481370756359578518086990519993285655852781],
            [4082367875863433681332203403145435568316851327593401208105741076214120093531,
             8495653923123431417604973247489272438418190587263600148770280649306958101930]
        );
    }}
    
    /// @return r the negation of p
    function negate(G1Point memory p) pure internal returns (G1Point memory r) {{
        uint q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
        if (p.X == 0 && p.Y == 0)
            return G1Point(0, 0);
        return G1Point(p.X, q - (p.Y % q));
    }}
    
    /// @return r the sum of two points of G1
    function addition(G1Point memory p1, G1Point memory p2) internal view returns (G1Point memory r) {{
        uint[4] memory input;
        input[0] = p1.X;
        input[1] = p1.Y;
        input[2] = p2.X;
        input[3] = p2.Y;
        bool success;
        assembly {{
            success := staticcall(sub(gas(), 2000), 6, input, 0xc0, r, 0x60)
        }}
        require(success);
    }}
    
    /// @return r the product of a point on G1 and a scalar
    function scalar_mul(G1Point memory p, uint s) internal view returns (G1Point memory r) {{
        uint[3] memory input;
        input[0] = p.X;
        input[1] = p.Y;
        input[2] = s;
        bool success;
        assembly {{
            success := staticcall(sub(gas(), 2000), 7, input, 0x80, r, 0x60)
        }}
        require(success);
    }}
    
    /// @return the result of computing the pairing check
    function pairing(G1Point memory a1, G2Point memory a2, G1Point memory b1, G2Point memory b2, 
                    G1Point memory c1, G2Point memory c2, G1Point memory d1, G2Point memory d2) 
                    internal view returns (bool) {{
        G1Point[4] memory p1 = [a1, b1, c1, d1];
        G2Point[4] memory p2 = [a2, b2, c2, d2];
        uint inputSize = 24;
        uint[] memory input = new uint[](inputSize);
        
        for (uint i = 0; i < 4; i++) {{
            input[i * 6 + 0] = p1[i].X;
            input[i * 6 + 1] = p1[i].Y;
            input[i * 6 + 2] = p2[i].X[0];
            input[i * 6 + 3] = p2[i].X[1];
            input[i * 6 + 4] = p2[i].Y[0];
            input[i * 6 + 5] = p2[i].Y[1];
        }}
        
        uint[1] memory out;
        bool success;
        assembly {{
            success := staticcall(sub(gas(), 2000), 8, add(input, 0x20), mul(inputSize, 0x20), out, 0x20)
        }}
        require(success);
        return out[0] != 0;
    }}
}}
        "#, vk.ic.len());
        
        Ok(contract)
    }
    
    /// Save verifier contract to file
    pub fn save_verifier_contract<P: AsRef<Path>>(
        contract: &str, 
        path: P
    ) -> Result<()> {
        fs::write(path, contract)
            .map_err(|e| VerifierError::SolidityError(format!("Failed to write contract: {}", e)))?;
        Ok(())
    }
    
    /// Generate verification interface
    pub fn generate_verifier_interface() -> String {
        r#"
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ITokamakGroth16Verifier
 * @dev Interface for Tokamak Groth16 verifier
 */
interface ITokamakGroth16Verifier {
    /**
     * @dev Verify a Groth16 proof for Tokamak storage consistency
     * @param a Proof element A
     * @param b Proof element B  
     * @param c Proof element C
     * @param merkleRoot Expected Merkle root of storage
     * @param activeLeaves Number of active participants (≤50)
     * @param channelId Channel identifier
     * @return True if proof is valid
     */
    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint256 merkleRoot,
        uint256 activeLeaves,
        uint256 channelId
    ) external returns (bool);
    
    /**
     * @dev Event emitted when proof is verified
     */
    event ProofVerified(bool result);
}
        "#.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokamak_groth16_trusted_setup::{PowersOfTau, R1CS, CircuitSetup};
    
    #[test]
    fn test_solidity_generation() {
        let powers = PowersOfTau::generate(128).unwrap();
        let r1cs = R1CS {
            num_variables: 100,
            num_public_inputs: 3,
            num_constraints: 80,
            a_matrix: vec![vec![]; 80],
            b_matrix: vec![vec![]; 80],
            c_matrix: vec![vec![]; 80],
        };
        
        let (_, verification_key) = CircuitSetup::generate_keys(&r1cs, &powers).unwrap();
        let contract = SolidityVerifierGenerator::generate_tokamak_verifier(&verification_key).unwrap();
        
        // Contract should contain key elements
        assert!(contract.contains("TokamakGroth16Verifier"));
        assert!(contract.contains("verifyProof"));
        assert!(contract.contains("merkleRoot"));
        assert!(contract.contains("activeLeaves"));
        assert!(contract.contains("channelId"));
    }
    
    #[test]
    fn test_interface_generation() {
        let interface = SolidityVerifierGenerator::generate_verifier_interface();
        
        assert!(interface.contains("ITokamakGroth16Verifier"));
        assert!(interface.contains("verifyProof"));
        assert!(interface.contains("external"));
    }
}