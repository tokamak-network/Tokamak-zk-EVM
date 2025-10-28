# Tokamak zkSNARK Storage Proof FAQ

## Frequently Asked Questions

### 1. In the trusted setup, why do we load R1CS file instead of WASM?

**Answer**: The R1CS (Rank-1 Constraint System) file and WASM file serve different purposes in the zkSNARK pipeline:

- **R1CS File**: Contains the **constraint system** that defines the mathematical relationships between circuit variables. It specifies how inputs, outputs, and intermediate values must relate to each other through quadratic arithmetic constraints of the form `A × B = C`.

- **WASM File**: Contains the **witness calculator** - executable code that computes actual values for all circuit variables given specific inputs.

**Why trusted setup uses R1CS**:
```rust
// From trusted-setup/src/utils.rs:25
pub fn parse_r1cs_file(data: &[u8]) -> Result<crate::r1cs::R1CS>
```

The trusted setup ceremony needs to know the **structure** of the circuit (number of variables, constraints, public inputs) to generate the appropriate cryptographic parameters (proving/verification keys). It doesn't need to execute the circuit - only understand its mathematical structure.

**Key differences**:
- **R1CS**: Circuit structure → Used for trusted setup
- **WASM**: Circuit execution → Used for witness generation during proving

### 2. Why do we use 64 rounds for the hash function?

**Answer**: We use 64-round Poseidon (4+56+4 configuration) for security and compatibility reasons:

**Security Analysis**:
```circom
// From circuits/src/poseidon_optimized_bls12381.circom:88-90
var FULL_ROUNDS_HALF = 4;
var PARTIAL_ROUNDS = 56;
var TOTAL_ROUNDS = 64;
```

- **Full rounds (4+4=8)**: All 5 state elements go through S-box (x^5), providing full diffusion
- **Partial rounds (56)**: Only first element goes through S-box, optimized for efficiency while maintaining security
- **Total security margin**: 64 rounds provides substantial security against known algebraic attacks

**Compatibility**:
```rust
// From prover/src/poseidon.rs:38
let r_partial = 56; // STANDARD 64-ROUND POSEIDON: 56 rounds
```

- **Industry standard**: 64-round Poseidon is the widely adopted secure configuration
- **Cross-system compatibility**: Ensures our proofs verify correctly with other systems using standard Poseidon
- **Future-proofing**: Higher round count provides security margin against future cryptanalytic advances

**Performance vs Security Trade-off**:
- 32 rounds: Faster but potentially vulnerable to advanced attacks
- 64 rounds: Industry-standard security with acceptable performance
- 128+ rounds: Excessive overhead without meaningful security benefit

### 3. Why are we using zero knowledge for our merkle tree construction?

**Answer**: Zero-knowledge proofs provide **privacy** and **scalability** for our storage verification system:

**Privacy Benefits**:
```circom
// From circuits/src/main_optimized.circom:88-90
signal input storage_keys[50];    // Private
signal input storage_values[50];  // Private
signal input merkle_root;         // Public
```

- **Data confidentiality**: Storage keys and values remain private - only the merkle root is revealed
- **Pattern hiding**: Number and structure of actual storage entries is hidden through padding
- **Participant privacy**: Individual storage operations cannot be linked to specific users

**Scalability Benefits**:
- **Constant verification time**: Proof verification is O(1) regardless of storage size (50 entries → single proof)
- **Succinct proofs**: ~1KB proof size vs. potentially MBs of raw storage data
- **Batch processing**: Single proof covers all 50 storage operations simultaneously

**Security Model**:
```circom
// From circuits/src/main_optimized.circom:122-126
component root_check = IsEqual();
root_check.in[0] <== merkle_root;        // Expected root (public)
root_check.in[1] <== merkle_tree.root;   // Computed root (from private data)
root_check.out === 1;                    // Constraint: must be equal
```

The circuit **proves** that the prover knows private storage data that results in the public merkle root, without revealing the private data itself.

### 4. Why using a power of tau is essential?

**Answer**: Powers of Tau provide the cryptographic foundation that makes Groth16 zkSNARKs secure and practical:

**Mathematical Foundation**:
```rust
// From trusted-setup/src/powers_of_tau.rs conceptual structure
// Powers of Tau ceremony generates:
// G1: [1, τ, τ², τ³, ..., τⁿ] in G1
// G2: [1, τ, τ², τ³, ..., τⁿ] in G2
// α-shifted: [α, ατ, ατ², ..., ατⁿ] in G1
// β-shifted: [β, βτ, βτ², ..., βτⁿ] in G1
```

**Why τ (Tau) is Critical**:

1. **Polynomial Evaluation**: Groth16 proofs rely on evaluating polynomials at a secret point τ. Powers of τ allow this evaluation without revealing τ itself.

2. **Zero-Knowledge**: The secret τ ensures that proofs don't leak information about the witness values.

3. **Soundness**: If τ were known, anyone could create fake proofs. The ceremony ensures τ is destroyed after generating the powers.

4. **Efficiency**: Pre-computed powers enable fast proof generation through Multi-Scalar Multiplication (MSM).

**Trusted Setup Process**:
```rust
// From trusted-setup/src/powers_of_tau.rs:59-65
🔐 Generated cryptographically secure random parameters (tau, alpha, beta)
🧮 Computing G1 powers (131073 points)...
🧮 Computing G2 powers (131073 points)...
```

- **Degree requirement**: Our circuit has 66,735 constraints → needs 2^17 = 131,072 degree polynomial
- **Multi-party ceremony**: In production, multiple parties contribute randomness ensuring no single party knows τ
- **Verification**: Pairing checks ensure the powers are correctly formed

**Security Guarantee**:
If **any** participant in the ceremony honestly deletes their secret randomness, the final τ remains unknown to everyone, making the system secure.

**Why not alternatives?**
- **Universal setups (PLONK)**: More complex, larger proof sizes
- **Transparent setups (STARKs)**: Much larger proof sizes (100KB+ vs 1KB)
- **Groth16 with Powers of Tau**: Optimal balance of security, efficiency, and proof size

---

## Additional Resources

- **Circuit Implementation**: `/circuits/src/main_optimized.circom`
- **Trusted Setup**: `/trusted-setup/src/`
- **Prover Implementation**: `/prover/src/`
- **Technical Documentation**: `/circuits/TECHNICAL_DOCUMENTATION.md`