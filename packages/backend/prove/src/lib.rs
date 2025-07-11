    #![allow(non_snake_case)]
    use icicle_runtime::memory::HostSlice;
    use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
    use libs::iotools::{Permutation, Instance, PlacementVariables, SetupParams, SubcircuitInfo, read_R1CS_gen_uvwXY};
    use libs::field_structures::{FieldSerde, hashing};
    use libs::vector_operations::{point_div_two_vecs, resize, transpose_inplace};
    use libs::group_structures::{Sigma, G1serde};
    use libs::polynomial_structures::gen_bXY;
    use icicle_bls12_381::curve::{BaseField, G1Affine, ScalarCfg, ScalarField};
    use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};
    use icicle_core::ntt;
    use icicle_core::vec_ops::VecOpsConfig;
    use serde::{Deserialize, Serialize};
    use bincode;
    use serde_json::{from_reader, to_writer_pretty};

    use std::fs::File;
    use std::io::{self, BufReader, BufWriter};
    use std::{env, fs, vec};
    use byteorder::{BigEndian, ByteOrder};
    use tiny_keccak::Keccak;
    use hex::decode_to_slice;


    macro_rules! poly_comb {
        (($c:expr, $p:expr), $(($rest_c:expr, $rest_p:expr)),+ $(,)?) => {{
            let mut acc = &$p * &$c;
            $(
                acc += &(&$rest_p * &$rest_c);
            )+
            acc
        }};
    }

    // Helper function to convert a scalar field element to a hex string
    pub fn hex_string(field: &ScalarField) -> String {
        let bytes = field.to_bytes_le();
        format!("0x{}", hex_encode(&bytes))
    }

    // More generic helper function for any FieldImpl
    pub fn any_field_to_hex<T: FieldImpl>(field: &T) -> String {
        let bytes = field.to_bytes_le();
        format!("0x{}", hex_encode(&bytes))
    }

    // Helper function to encode bytes as hex string
    pub fn hex_encode(bytes: &[u8]) -> String {
        bytes.iter()
            .map(|byte| format!("{:02x}", byte))
            .collect::<String>()
    }

    pub struct Mixer{
        pub rU_X: ScalarField,
        pub rU_Y: ScalarField,
        pub rV_X: ScalarField,
        pub rV_Y: ScalarField,
        pub rW_X: Vec<ScalarField>,
        pub rW_Y: Vec<ScalarField>,
        pub rB_X: Vec<ScalarField>,
        pub rB_Y: Vec<ScalarField>,
        pub rR_X: ScalarField,
        pub rR_Y: ScalarField,
        pub rO_mid: ScalarField,
    }
    pub struct Compiler{
        pub setup_params: SetupParams,
        pub subcircuit_infos: Box<[SubcircuitInfo]>,
        pub global_wire_list: Box<[Box<[usize]>]>,
        pub placement_variables: Box<[PlacementVariables]>,
        pub permutation_raw: Box<[Permutation]>
    }
    pub struct InstancePolynomials{
        pub s0XY: DensePolynomialExt,
        pub s1XY: DensePolynomialExt,
        pub t_n: DensePolynomialExt,
        pub t_mi: DensePolynomialExt,
        pub t_smax: DensePolynomialExt,
        pub a_pub_X: DensePolynomialExt,
    }
    pub struct Witness{
        pub bXY: DensePolynomialExt,
        pub uXY: DensePolynomialExt,
        pub vXY: DensePolynomialExt,
        pub wXY: DensePolynomialExt,
        pub rXY: DensePolynomialExt,
    }
    pub struct Quotients{
        pub q0XY: DensePolynomialExt,
        pub q1XY: DensePolynomialExt,
        pub q2XY: DensePolynomialExt,
        pub q3XY: DensePolynomialExt,
        pub q4XY: DensePolynomialExt,
        pub q5XY: DensePolynomialExt,
        pub q6XY: DensePolynomialExt,
        pub q7XY: DensePolynomialExt,
    }

    // #[derive(Debug, Serialize, Deserialize)]
    // pub struct ChallengeSerde {
    //     pub thetas: Vec<String>,
    //     pub chi: String,
    //     pub zeta: String,
    //     pub kappa0: String,
    //     pub kappa1: String,
    //     pub kappa2: String,
    // }

    // impl From<Challenge> for ChallengeSerde {
    //     fn from(challenge: Challenge) -> Self {
    //         // Convert each field element to a hex string for serialization
    //         let thetas_vec: Vec<String> = challenge.thetas.iter()
    //             .map(|theta| {
    //                 let mut bytes = theta.to_bytes_le();
    //                 bytes.reverse(); // ✅ Reverse bytes to match verifier
    //                 // Convert to hex format without 0x prefix
    //                 bytes.iter()
    //                     .map(|byte| format!("{:02x}", byte))
    //                     .collect::<String>()
    //             })
    //             .collect();
                
    //         // Helper function to convert a field element to hex string
    //         let to_hex = |field: &ScalarField| {
    //             let mut bytes = field.to_bytes_le();
    //             bytes.reverse(); // ✅ Reverse bytes to match verifier
    //             bytes.iter()
    //                 .map(|byte| format!("{:02x}", byte))
    //                 .collect::<String>()
    //         };
            
    //         ChallengeSerde {
    //             thetas: thetas_vec,
    //             chi: to_hex(&challenge.chi),
    //             zeta: to_hex(&challenge.zeta),
    //             kappa0: to_hex(&challenge.kappa0),
    //             kappa1: to_hex(&challenge.kappa1),
    //             kappa2: to_hex(&challenge.kappa2),
    //         }
    //     }
    // }

    // pub struct Challenge {
    //     pub thetas: Box<[ScalarField]>,
    //     pub chi: ScalarField,
    //     pub zeta: ScalarField,
    //     pub kappa0: ScalarField,
    //     pub kappa1: ScalarField,
    //     pub kappa2: ScalarField,
    // }

    pub struct Prover{
        pub setup_params: SetupParams,
        pub sigma: Sigma,
        pub instance: InstancePolynomials,
        pub witness: Witness,
        pub mixer: Mixer,
        pub quotients: Quotients
    }

    #[derive(Debug, Serialize, Deserialize)]
    pub struct Proof {
        pub binding: Binding,
        pub proof0: Proof0,
        pub proof1: Proof1,
        pub proof2: Proof2,
        pub proof3: Proof3,
        pub proof4: Proof4
    }

    impl Proof {
        pub fn write_into_json(&self, path: &str) -> io::Result<()> {
            let abs_path = env::current_dir()?.join(path);
            if let Some(parent) = abs_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let file = File::create(&abs_path)?;
            let writer = BufWriter::new(file);
            to_writer_pretty(writer, self)?;
            Ok(())
        }

        pub fn read_from_json(path: &str) -> io::Result<Self> {
            let abs_path = env::current_dir()?.join(path);
            let file = File::open(abs_path)?;
            let reader = BufReader::new(file);
            let res: Self = from_reader(reader)?;
            Ok(res)
        }

        pub fn convert_format_for_solidity_verifier(&self) -> FormattedProof {
            // Formatting the proof for the Solidity verifier
            // Part1 is a tuple of hex strings of the first 16 bytes of each proof component
            let mut proof_entries_part1 = Vec::<String>::new();
            // Part2 is a tuple of hex strings of the last 32 bytes of each proof component
            let mut proof_entries_part2 = Vec::<String>::new();
            
            // Helper function to split a G1 point into part1 (16 bytes) and part2 (32 bytes)
            let split_g1 = |point: &G1serde| -> (String, String, String, String) {
                // Get X coordinate bytes in little-endian and convert to big-endian
                let mut x_bytes = point.0.x.to_bytes_le();
                x_bytes.reverse(); // Convert to big-endian
                
                // Get Y coordinate bytes in little-endian and convert to big-endian
                let mut y_bytes = point.0.y.to_bytes_le();
                y_bytes.reverse(); // Convert to big-endian
                
                // For BLS12-381 Fp elements, we have 48 bytes
                // For X: first 16 bytes go to part1, last 32 bytes to part2
                let x_part1 = format!("0x{}", hex_encode(&x_bytes[0..16]));
                let x_part2 = format!("0x{}", hex_encode(&x_bytes[16..48]));
                
                // For Y: first 16 bytes go to part1, last 32 bytes to part2
                let y_part1 = format!("0x{}", hex_encode(&y_bytes[0..16]));
                let y_part2 = format!("0x{}", hex_encode(&y_bytes[16..48]));
                
                (x_part1, x_part2, y_part1, y_part2)
            };
            
            // Helper function to format scalar field as 256-bit hex
            let scalar_to_hex = |scalar: &ScalarField| -> String {
                let mut bytes = scalar.to_bytes_le();
                bytes.reverse(); // Convert to big-endian
                // Pad to 32 bytes if necessary
                while bytes.len() < 32 {
                    bytes.push(0);
                }
                format!("0x{}", hex_encode(&bytes))
            };

            macro_rules! split_push {
                ($( $point:expr ),+ $(,)?) => {
                    $(
                        {
                            let (x_p1, x_p2, y_p1, y_p2) = split_g1($point);
                            proof_entries_part1.push(x_p1);
                            proof_entries_part2.push(x_p2);
                            proof_entries_part1.push(y_p1);
                            proof_entries_part2.push(y_p2);
                        }
                    )+
                };
            }
            
            // Process the rest of the proof commitments
            split_push!(
                // U
                &self.proof0.U,
                // V
                &self.proof0.V,
                // W
                &self.proof0.W,
                // O_mid
                &self.binding.O_mid,
                // O_prv
                &self.binding.O_prv,
                // Q_AX
                &self.proof0.Q_AX,
                // Q_AY
                &self.proof0.Q_AY,
                // Q_CX
                &self.proof2.Q_CX,
                // Q_CY
                &self.proof2.Q_CY,
                // Pi_X
                &self.proof4.Pi_X,
                // Pi_Y
                &self.proof4.Pi_Y,
                // B
                &self.proof0.B,
                // R
                &self.proof1.R,
                // M_Y (appears as M_ζ in comments)
                &self.proof4.M_Y,
                // M_X (appears as M_χ in comments)
                &self.proof4.M_X,
                // N_Y (appears as N_ζ in comments)
                &self.proof4.N_Y,
                // N_X (appears as N_χ in comments)
                &self.proof4.N_X,
                // O_inst from binding (appears to be O_pub in the test)
                &self.binding.O_inst,
                // A from binding
                &self.binding.A
            );
            
            // Add evaluations to part2 only (they're scalar fields, not G1 points)
            proof_entries_part2.push(scalar_to_hex(&self.proof3.R_eval.0));
            proof_entries_part2.push(scalar_to_hex(&self.proof3.R_omegaX_eval.0));
            proof_entries_part2.push(scalar_to_hex(&self.proof3.R_omegaX_omegaY_eval.0));
            proof_entries_part2.push(scalar_to_hex(&self.proof3.V_eval.0));

            return FormattedProof { proof_entries_part1, proof_entries_part2 };
            
        }
    }

    #[derive(Debug, Serialize, Deserialize)]
    pub struct FormattedProof {
        pub proof_entries_part1: Vec<String>,
        pub proof_entries_part2: Vec<String>,
    }

    impl FormattedProof {
         pub fn write_into_json(&self, path: &str) -> io::Result<()> {
            let abs_path = env::current_dir()?.join(path);
            if let Some(parent) = abs_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let file = File::create(&abs_path)?;
            let writer = BufWriter::new(file);
            to_writer_pretty(writer, &self)?;
            Ok(())
        }

        pub fn read_from_json(path: &str) -> io::Result<Self> {
            let abs_path = env::current_dir()?.join(path);
            let file = File::open(abs_path)?;
            let reader = BufReader::new(file);
            let res: Self = from_reader(reader)?;
            Ok(res)
        }

        pub fn recover_proof_from_format(&self) -> Proof {
            // Helper function to recover a BaseField from part1 (16 bytes) and part2 (32 bytes)
            let recover_basefield = |part1: &String, part2: &String| -> BaseField {
                let mut bytes = [0u8; 48];

                decode_to_slice(
                    part1.trim_start_matches("0x"),
                    &mut bytes[0..16],
                )
                .expect("Invalid format");

                decode_to_slice(
                    part2.trim_start_matches("0x"),
                    &mut bytes[16..48],
                )
                .expect("Invalid format");
                bytes.reverse();            // to little Edian

                /* ---------------------------------------------------------
                * 4) limbs  →  BaseField
                * --------------------------------------------------------- */
                return BaseField::from_bytes_le(&bytes);
            };

            let p1 = &self.proof_entries_part1;
            let p2 = &self.proof_entries_part2;

            const G1_CNT: usize = 19;      // The number of G1 points 
            const SCALAR_CNT: usize = 4;   // The number of Scalars

            assert_eq!(p1.len(), G1_CNT * 2);
            assert_eq!(p2.len(), G1_CNT * 2 + SCALAR_CNT);
            
            let mut idx = 0;
            let mut next_point = || -> G1serde {
                let bx = recover_basefield(&p1[idx], &p2[idx]);       
                let by = recover_basefield(&p1[idx + 1], &p2[idx + 1]);
                idx += 2;

                return G1serde(G1Affine {
                    x: bx,
                    y: by,
                });
            };

            macro_rules! pop_recover {
                ($( $point:ident ),+ $(,)?) => {
                    $(
                        let $point = next_point();
                    )+
                };
            }
            // Must follow the same order of inputs as split_push!
            pop_recover!(
                U,
                V,
                W,
                O_mid,
                O_prv,
                Q_AX,
                Q_AY,
                Q_CX,
                Q_CY,
                Pi_X,
                Pi_Y,
                B,
                R,
                M_Y,
                M_X,
                N_Y,
                N_X,
                O_inst,
                A
            );


            let binding = Binding { A, O_inst, O_mid, O_prv};
            let proof0 = Proof0 { U, V, W, Q_AX, Q_AY, B };
            let proof1 = Proof1 { R };
            let proof2 = Proof2 { Q_CX, Q_CY };
            let proof4 = Proof4 { Pi_X, Pi_Y, M_X, M_Y, N_X, N_Y };

            let scalar_slice = &p2[G1_CNT * 2..];
            assert_eq!(scalar_slice.len(), SCALAR_CNT);

            let proof3 = Proof3 {
                R_eval               : FieldSerde(ScalarField::from_hex(&scalar_slice[0])),
                R_omegaX_eval        : FieldSerde(ScalarField::from_hex(&scalar_slice[1])),
                R_omegaX_omegaY_eval : FieldSerde(ScalarField::from_hex(&scalar_slice[2])),
                V_eval               : FieldSerde(ScalarField::from_hex(&scalar_slice[3])),
            };

            return Proof {
                binding,
                proof0,
                proof1,
                proof2,
                proof3,
                proof4,
            };
        }
            
    }

    #[derive(Debug, Serialize, Deserialize)]
    pub struct Binding {
        pub A: G1serde,
        pub O_inst: G1serde,
        pub O_mid: G1serde,
        pub O_prv: G1serde
    }

    #[derive(Serialize, Deserialize, Debug)]
    pub struct Proof0 {
        pub U: G1serde,
        pub V: G1serde,
        pub W: G1serde,
        pub Q_AX: G1serde,
        pub Q_AY: G1serde,
        pub B: G1serde
    }
    impl Proof0 {        
        pub fn verify0_with_manager(&self, manager: &mut TranscriptManager) -> Vec<ScalarField> {
            manager.add_proof0(self);
            manager.get_thetas()
        }
    }

    #[derive(Serialize, Deserialize, Debug)]
    pub struct Proof1 {
        pub R: G1serde
    }
    impl Proof1 {        
        pub fn verify1_with_manager(&self, manager: &mut TranscriptManager) -> ScalarField {
            manager.add_proof1(self);
            manager.get_kappa0()
        }
    }

    #[derive(Serialize, Deserialize, Debug)]
    pub struct Proof2 {
        pub Q_CX: G1serde,
        pub Q_CY: G1serde
    }
    impl Proof2 {        
        pub fn verify2_with_manager(&self, manager: &mut TranscriptManager) -> (ScalarField, ScalarField) {
            manager.add_proof2(self);
            manager.get_chi_zeta()
        }
    }

    #[derive(Serialize, Deserialize, Debug)]
    pub struct Proof3 {
        pub V_eval: FieldSerde,
        pub R_eval: FieldSerde,
        pub R_omegaX_eval: FieldSerde,
        pub R_omegaX_omegaY_eval: FieldSerde
    }
    impl Proof3 {
        pub fn verify3_with_manager(&self, manager: &mut TranscriptManager) -> ScalarField {
            manager.add_proof3(self);
            let kappa1 = manager.get_kappa1();
            kappa1  // Only return kappa1
        }
    }

    #[derive(Serialize, Deserialize, Debug)]
    pub struct Proof4 {
        pub Pi_X: G1serde,
        pub Pi_Y: G1serde,
        pub M_X: G1serde,
        pub M_Y: G1serde,
        pub N_X: G1serde,
        pub N_Y: G1serde
    }

    pub struct Proof4Test {
        pub Pi_AX: G1serde,
        pub Pi_AY: G1serde,
        pub Pi_CX: G1serde,
        pub Pi_CY: G1serde,
        pub Pi_B: G1serde,
        pub M_X: G1serde,
        pub M_Y: G1serde,
        pub N_X: G1serde,
        pub N_Y: G1serde
    }

    impl Prover{
        pub fn init() -> (Self, Binding) {
            // Load setup parameters from JSON file
            let setup_path = "setupParams.json";
            let setup_params = SetupParams::from_path(setup_path).unwrap();

            // Extract key parameters from setup_params
            let l = setup_params.l;     // Number of public I/O wires
            let l_d = setup_params.l_D; // Number of interface wires
            let s_d = setup_params.s_D; // Number of subcircuits
            let n = setup_params.n;     // Number of constraints per subcircuit
            let s_max = setup_params.s_max; // The maximum number of placements
            let l_pub = setup_params.l_pub_in + setup_params.l_pub_out;
            let l_prv = setup_params.l_prv_in + setup_params.l_prv_out;
            
            if !(l_pub.is_power_of_two() || l_pub==0) {
                panic!("l_pub is not a power of two.");
            }
        
            if !(l_prv.is_power_of_two()) {
                panic!("l_prv is not a power of two.");
            }
            // Assert n is a power of two
            if !n.is_power_of_two() {
                panic!("n is not a power of two.");
            }
            // Assert s_max is a power of two
            if !s_max.is_power_of_two() {
                panic!("s_max is not a power of two.");
            }
            // The last wire-related parameter
            let m_i = l_d - l;
            // Assert m_I is a power of two
            if !m_i.is_power_of_two() {
                panic!("m_I is not a power of two.");
            }

            // Load subcircuit information
            let subcircuit_path = "subcircuitInfo.json";
            let subcircuit_infos = SubcircuitInfo::from_path(subcircuit_path).unwrap();

            // Load local variables of placements (public instance + interface witness + internal witness)
            let placement_variables_path = "placementVariables.json";
            let placement_variables = PlacementVariables::from_path(&placement_variables_path).unwrap();

            let witness: Witness = {
                // // Load subcircuit library R1CS
                // println!("Loading subcircuits...");
                // let mut compact_library_R1CS: Vec<SubcircuitR1CS> = Vec::new();
                // for i in 0..s_d {
                //     println!("Loading subcircuit id {}", i);
                //     let r1cs_path: String = format!("json/subcircuit{i}.json");
                //     let compact_r1cs = SubcircuitR1CS::from_path(&r1cs_path, &setup_params, &subcircuit_infos[i]).unwrap();
                //     compact_library_R1CS.push(compact_r1cs);
                // }

                // Parsing the variables
                let bXY = gen_bXY(&placement_variables, &subcircuit_infos, &setup_params);
                let (uXY, vXY, wXY) = read_R1CS_gen_uvwXY(&placement_variables, &subcircuit_infos, &setup_params);
                let rXY = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&vec![ScalarField::zero()]), 1, 1);
                Witness {bXY, uXY, vXY, wXY, rXY}
            };

            let quotients: Quotients = {
                let q0XY = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&vec![ScalarField::zero()]), 1, 1);
                let q1XY = q0XY.clone();
                let q2XY = q0XY.clone();
                let q3XY = q0XY.clone();
                let q4XY = q0XY.clone();
                let q5XY = q0XY.clone();
                let q6XY = q0XY.clone();
                let q7XY = q0XY.clone();
                Quotients {q0XY, q1XY, q2XY, q3XY, q4XY, q5XY, q6XY, q7XY}
            };

            // Load permutation (copy constraints of the variables)
            let permutation_path = "permutation.json";
            let permutation_raw = Permutation::from_path(&permutation_path).unwrap();

            let mut instance: InstancePolynomials = {
                // Load instance
                let instance_path = "instance.json";
                let _instance = Instance::from_path(&instance_path).unwrap();

                // Parsing the inputs
                let a_pub_X = _instance.gen_a_pub_X(&setup_params);
                // Fixed polynomials
                let mut t_n_coeffs = vec![ScalarField::zero(); 2*n];
                t_n_coeffs[0] = ScalarField::zero() - ScalarField::one();
                t_n_coeffs[n] = ScalarField::one();
                let t_n = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_n_coeffs), 2*n, 1);
                let mut t_mi_coeffs = vec![ScalarField::zero(); 2*m_i];
                t_mi_coeffs[0] = ScalarField::zero() - ScalarField::one();
                t_mi_coeffs[m_i] = ScalarField::one();
                let t_mi = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_mi_coeffs), 2*m_i, 1);
                let mut t_smax_coeffs = vec![ScalarField::zero(); 2*s_max];
                t_smax_coeffs[0] = ScalarField::zero() - ScalarField::one();
                t_smax_coeffs[s_max] = ScalarField::one();
                let t_smax = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_smax_coeffs), 1, 2*s_max);
                // Generating permutation polynomials
                let (s0XY, s1XY) = Permutation::to_poly(&permutation_raw, m_i, s_max);

                InstancePolynomials {a_pub_X, t_n, t_mi, t_smax, s0XY, s1XY}
            };

            #[cfg(feature = "testing-mode")] {
                // Checking Lemma 3
                let mut bXY_evals = vec![ScalarField::zero(); m_i*s_max];
                witness.bXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut bXY_evals));
                let mut s0XY_evals = vec![ScalarField::zero(); m_i*s_max];
                instance.s0XY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut s0XY_evals));
                let mut s1XY_evals = vec![ScalarField::zero(); m_i*s_max];
                instance.s1XY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut s1XY_evals));

                let mut X_mono_coef = vec![ScalarField::zero(); m_i];
                X_mono_coef[1] = ScalarField::one();
                let X_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&X_mono_coef), m_i, 1);
                drop(X_mono_coef);
                let mut Y_mono_coef = vec![ScalarField::zero(); s_max];
                Y_mono_coef[1] = ScalarField::one();
                let Y_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&Y_mono_coef), 1, s_max);
                drop(Y_mono_coef);
                let mut X_mono_evals = vec![ScalarField::zero(); m_i];
                X_mono.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut X_mono_evals));
                let mut Y_mono_evals = vec![ScalarField::zero(); s_max];
                Y_mono.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut Y_mono_evals));

                let thetas = ScalarCfg::generate_random(3);
                let fXY = &( &(&witness.bXY + &(&thetas[0] * &instance.s0XY)) + &(&thetas[1] * &instance.s1XY)) + &thetas[2];
                let gXY = &( &(&witness.bXY + &(&thetas[0] * &X_mono)) + &(&thetas[1] * &Y_mono)) + &thetas[2];
                let mut fXY_evals = vec![ScalarField::zero(); m_i*s_max].into_boxed_slice();
                fXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut fXY_evals));
                let mut gXY_evals = vec![ScalarField::zero(); m_i*s_max].into_boxed_slice();
                gXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut gXY_evals));
                let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
                let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);
        
                for i in 0..m_i {
                    for j in 0..s_max {
                        assert!(X_mono_evals[i].eq(&omega_m_i.pow(i)));
                        assert!(Y_mono_evals[j].eq(&omega_s_max.pow(j)));
                    }
                }
                let mut flag_b = true;
                let mut flag_s0 = true;
                let mut flag_s1 = true;
                let mut flag_r = true;
                for permEntry in &permutation_raw {
                    let this_wire_idx = permEntry.row;
                    let this_placement_idx = permEntry.col;
                    let next_wire_idx = permEntry.X as usize;
                    let next_placement_idx = permEntry.Y as usize;
        
                    let this_idx = this_wire_idx * s_max + this_placement_idx;
                    let next_idx = next_wire_idx * s_max + next_placement_idx;
        
                    if !bXY_evals[this_idx].eq(&bXY_evals[next_idx]) {
                        flag_b = false;
                    }
                    if !s0XY_evals[this_idx].eq(&X_mono_evals[next_wire_idx]) {
                        flag_s0 = false;
                    }
                    if !s1XY_evals[this_idx].eq(&Y_mono_evals[next_placement_idx]) {
                        flag_s1 = false;
                    }
                    if !fXY_evals[this_idx].eq(&gXY_evals[next_idx]) {
                        flag_r = false;
                    }
                }
                assert!(flag_b);
                println!("Checked: b(X,Y) satisfies the copy constraints.");
                assert!(flag_s0);
                println!("Checked: s^(0)(X,Y) is well-formed.");
                assert!(flag_s1);
                println!("Checked: s^(1)(X,Y) is well-formed.");
                assert!(flag_r);
                println!("Checked: f(X,Y) and g(X,Y) are well-formed.");
        
                let mut LHS = vec![ScalarField::zero(); 1];
                let mut RHS = vec![ScalarField::zero(); 1];
                let vec_ops = VecOpsConfig::default();
                ScalarCfg::product(HostSlice::from_slice(&fXY_evals), HostSlice::from_mut_slice(&mut LHS), &vec_ops).unwrap();
                ScalarCfg::product(HostSlice::from_slice(&gXY_evals), HostSlice::from_mut_slice(&mut RHS), &vec_ops).unwrap();
                assert!( LHS[0].eq( &RHS[0] ) );
                println!("Checked: Lemma 3");        
            }

            // Load Sigma (reference string)
            let sigma_path = "setup/trusted-setup/output/combined_sigma.json";
            let mut sigma = Sigma::read_from_json(&sigma_path)
            .expect("No reference string is found. Run the Setup first.");

            let mixer: Mixer = {
                let rU_X = ScalarCfg::generate_random(1)[0];
                let rU_Y = ScalarCfg::generate_random(1)[0];
                let rV_X = ScalarCfg::generate_random(1)[0];
                let rV_Y = ScalarCfg::generate_random(1)[0];
                let rW_X = resize(
                    &ScalarCfg::generate_random(3), 
                    3, 
                    1, 
                    4, 
                    1, 
                    ScalarField::zero()
                );
                let rW_Y = resize(
                    &ScalarCfg::generate_random(3), 
                    1, 
                    3, 
                    1, 
                    4, 
                    ScalarField::zero()
                );
                let rB_X = ScalarCfg::generate_random(2);
                let rB_Y = ScalarCfg::generate_random(2);
                let rO_mid = ScalarCfg::generate_random(1)[0];
                let rR_X = ScalarCfg::generate_random(1)[0];
                let rR_Y = ScalarCfg::generate_random(1)[0];

                Mixer {rB_X, rB_Y, rR_X, rR_Y, rU_X, rU_Y, rV_X, rV_Y, rW_X, rW_Y, rO_mid}
            };

            let binding: Binding = {
                let A = sigma.sigma_1.encode_poly(&mut instance.a_pub_X, &setup_params);
                let O_inst = sigma.sigma_1.encode_O_inst(&placement_variables, &subcircuit_infos, &setup_params);
                sigma.sigma_1.gamma_inv_o_inst = vec![G1serde::zero()].into_boxed_slice();
                let O_mid_core = sigma.sigma_1.encode_O_mid_no_zk(&placement_variables, &subcircuit_infos, &setup_params);
                sigma.sigma_1.eta_inv_li_o_inter_alpha4_kj = vec![vec![G1serde::zero()].into_boxed_slice()].into_boxed_slice();
                let O_mid = 
                    O_mid_core
                    + sigma.sigma_1.delta * mixer.rO_mid;
                let O_prv_core = sigma.sigma_1.encode_O_prv_no_zk(&placement_variables, &subcircuit_infos, &setup_params);
                sigma.sigma_1.delta_inv_li_o_prv = vec![vec![G1serde::zero()].into_boxed_slice()].into_boxed_slice();
                let O_prv =
                    O_prv_core
                    - sigma.sigma_1.eta * mixer.rO_mid

                    + sigma.sigma_1.delta_inv_alphak_xh_tx[0][0] * mixer.rU_X
                    + sigma.sigma_1.delta_inv_alphak_xh_tx[1][0] * mixer.rV_X
                    + (
                        sigma.sigma_1.delta_inv_alphak_xh_tx[2][0] * mixer.rW_X[0]
                        + sigma.sigma_1.delta_inv_alphak_xh_tx[2][1] * mixer.rW_X[1]
                        + sigma.sigma_1.delta_inv_alphak_xh_tx[2][2] * mixer.rW_X[2]
                    )
                    + (
                        sigma.sigma_1.delta_inv_alpha4_xj_tx[0] * mixer.rB_X[0]
                        + sigma.sigma_1.delta_inv_alpha4_xj_tx[1] * mixer.rB_X[1]
                    )

                    + sigma.sigma_1.delta_inv_alphak_yi_ty[0][0] * mixer.rU_Y
                    + sigma.sigma_1.delta_inv_alphak_yi_ty[1][0] * mixer.rV_Y
                    + (
                        sigma.sigma_1.delta_inv_alphak_yi_ty[2][0] * mixer.rW_Y[0]
                        + sigma.sigma_1.delta_inv_alphak_yi_ty[2][1] * mixer.rW_Y[1]
                        + sigma.sigma_1.delta_inv_alphak_yi_ty[2][2] * mixer.rW_Y[2]
                    )
                    + (
                        sigma.sigma_1.delta_inv_alphak_yi_ty[3][0] * mixer.rB_Y[0]
                        + sigma.sigma_1.delta_inv_alphak_yi_ty[3][1] * mixer.rB_Y[1]
                    );
                Binding {A, O_inst, O_mid, O_prv}
            };
            
            return (
                Self {sigma, setup_params, instance, witness, mixer, quotients},
                binding
            )
        }

        // // Add method to encode s0XY and s1XY polynomials
        // pub fn get_preprocessed_commitments(&mut self) -> (G1serde, G1serde) {
        //     let s0_commitment = self.sigma.sigma_1.encode_poly(&mut self.instance.s0XY, &self.setup_params);
        //     let s1_commitment = self.sigma.sigma_1.encode_poly(&mut self.instance.s1XY, &self.setup_params);
        //     (s0_commitment, s1_commitment)
        // }
        
        // pub fn get_public_inputs_from_instance(&self) -> Vec<ScalarField> {
        //     // Load instance again to get the raw a values
        //     let instance_path = "instance.json";
        //     let instance = Instance::from_path(&instance_path).unwrap();
            
        //     let l_pub = self.setup_params.l_pub_in + self.setup_params.l_pub_out;
            
        //     // Extract a_pub from instance.a array
        //     let mut a_pub = Vec::with_capacity(l_pub);
        //     for i in 0..l_pub {
        //         a_pub.push(ScalarField::from_hex(&instance.a[i]));
        //     }
            
        //     // Based on the test data, we need exactly 128 public inputs
        //     // Pad with zeros if necessary
        //     while a_pub.len() < 128 {
        //         a_pub.push(ScalarField::zero());
        //     }
            
        //     a_pub
        // }

        pub fn prove0(&mut self) -> Proof0 {
            // Arithmetic constraints argument polynomials
            (self.quotients.q0XY, self.quotients.q1XY) = {
                let mut p0XY = &( &self.witness.uXY * &self.witness.vXY ) - &self.witness.wXY;
                p0XY.div_by_vanishing(
                self.setup_params.n as i64, 
                self.setup_params.s_max as i64
                )
            };

            #[cfg(feature = "testing-mode")] {
                let x_e = ScalarCfg::generate_random(1)[0];
                let y_e = ScalarCfg::generate_random(1)[0];
                let p_0_eval = p0XY.eval(&x_e, &y_e);
                let q_0_eval = self.quotients.q0XY.eval(&x_e, &y_e);
                let q_1_eval = self.quotients.q1XY.eval(&x_e, &y_e);
                let t_n_eval = x_e.pow(self.setup_params.n) - ScalarField::one();
                let t_smax_eval = y_e.pow(self.setup_params.s_max) - ScalarField::one();
                assert!( p_0_eval.eq( &(q_0_eval * t_n_eval + q_1_eval * t_smax_eval) ) );
                println!("Checked: u(X,Y), v(X,Y), and w(X,Y) satisfy the arithmetic constraints.")
            }
            
            // Adding zero-knowledge
            let rW_X = DensePolynomialExt::from_coeffs(
                HostSlice::from_slice(&self.mixer.rW_X), 
                self.mixer.rW_X.len(), 
                1
            );
            let rW_Y = DensePolynomialExt::from_coeffs(
                HostSlice::from_slice(&self.mixer.rW_Y), 
                1, 
                self.mixer.rW_Y.len()
            );

            let U = {
                let mut UXY = poly_comb!(
                    (ScalarField::one(), self.witness.uXY),
                    (self.mixer.rU_X, self.instance.t_n),
                    (self.mixer.rU_Y, self.instance.t_smax)
                );
                self.sigma.sigma_1.encode_poly(&mut UXY, &self.setup_params)
            };

            let V = {
                let mut VXY = poly_comb!(
                    (ScalarField::one(), self.witness.vXY),
                    (self.mixer.rV_X, self.instance.t_n),
                    (self.mixer.rV_Y, self.instance.t_smax)
                );
                self.sigma.sigma_1.encode_poly(&mut VXY, &self.setup_params)
            };
            
            let W = {
                let mut WXY = poly_comb!(
                    (ScalarField::one(), self.witness.wXY),
                    (rW_X, self.instance.t_n),
                    (rW_Y, self.instance.t_smax)
                );
                self.sigma.sigma_1.encode_poly(&mut WXY, &self.setup_params)
            };
            
            let Q_AX = {
                let mut Q_AX_XY = poly_comb!(
                    (ScalarField::one(), self.quotients.q0XY),
                    (self.mixer.rU_X, self.witness.vXY),
                    (self.mixer.rV_X, self.witness.uXY),
                    (ScalarField::zero() - ScalarField::one(), rW_X),
                    (self.mixer.rU_X * self.mixer.rV_X, self.instance.t_n),
                    (self.mixer.rU_Y * self.mixer.rV_X, self.instance.t_smax)
                );
                self.sigma.sigma_1.encode_poly(&mut Q_AX_XY, &self.setup_params)
            };

            let Q_AY = {
                let mut Q_AY_XY = poly_comb!(
                    (ScalarField::one(), self.quotients.q1XY),
                    (self.mixer.rU_Y, self.witness.vXY),
                    (self.mixer.rV_Y, self.witness.uXY),
                    (ScalarField::zero() - ScalarField::one(), rW_Y),
                    (self.mixer.rU_X * self.mixer.rV_Y, self.instance.t_n),
                    (self.mixer.rU_Y * self.mixer.rV_Y, self.instance.t_smax)
                );
                self.sigma.sigma_1.encode_poly(&mut Q_AY_XY, &self.setup_params)
            };
            drop(rW_X);
            drop(rW_Y);

            let B = {
                let rB_X = DensePolynomialExt::from_coeffs(
                    HostSlice::from_slice(&self.mixer.rB_X), 
                    self.mixer.rB_X.len(), 
                    1
                );
                let rB_Y = DensePolynomialExt::from_coeffs(
                    HostSlice::from_slice(&self.mixer.rB_Y), 
                    1, 
                    self.mixer.rB_Y.len()
                );
                let term_B_zk = &(&rB_X * &self.instance.t_mi) + &(&rB_Y * &self.instance.t_smax);
                let mut BXY = &self.witness.bXY + &term_B_zk;
                self.sigma.sigma_1.encode_poly(&mut BXY, &self.setup_params)
            };
            return Proof0 {U, V, W, Q_AX, Q_AY, B}
        }

        pub fn prove1(&mut self, thetas: &Vec<ScalarField>) -> Proof1{
            let m_i = self.setup_params.l_D - self.setup_params.l;
            let s_max = self.setup_params.s_max;

            let mut X_mono_coef = vec![ScalarField::zero(); 2];
            X_mono_coef[1] = ScalarField::one();
            let X_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&X_mono_coef), 2, 1);
            drop(X_mono_coef);

            let mut Y_mono_coef = vec![ScalarField::zero(); 2];
            Y_mono_coef[1] = ScalarField::one();
            let Y_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&Y_mono_coef), 1, 2);
            drop(Y_mono_coef);

            let fXY = &( &(&self.witness.bXY + &(&thetas[0] * &self.instance.s0XY)) + &(&thetas[1] * &self.instance.s1XY)) + &thetas[2];
            let gXY = &( &(&self.witness.bXY + &(&thetas[0] * &X_mono)) + &(&thetas[1] * &Y_mono)) + &thetas[2];

            let mut fXY_evals = vec![ScalarField::zero(); m_i*s_max].into_boxed_slice();
            fXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut fXY_evals));
            let mut gXY_evals = vec![ScalarField::zero(); m_i*s_max].into_boxed_slice();
            gXY.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut gXY_evals));

            // Generating the recursion polynomial r(X,Y)
            let mut rXY_evals = vec![ScalarField::zero(); m_i * s_max];
            let mut scalers_tr = vec![ScalarField::zero(); m_i * s_max];
            point_div_two_vecs(&gXY_evals, &fXY_evals, &mut scalers_tr);
            transpose_inplace(&mut scalers_tr, m_i, s_max);
            rXY_evals[m_i * s_max - 1] = ScalarField::one();
            for idx in (0..m_i * s_max- 1).rev() {
                rXY_evals[idx] = rXY_evals[idx+1] * scalers_tr[idx+1];
            }
            transpose_inplace(&mut rXY_evals, s_max, m_i);

            self.witness.rXY = DensePolynomialExt::from_rou_evals(
                HostSlice::from_slice(&rXY_evals),
                m_i, 
                s_max, 
                None, 
                None
            );

            #[cfg(feature = "testing-mode")] {
                let mut flag1 = true;
                for row_idx in 1..m_i - 1 {
                    for col_idx in 0..s_max-1 {
                        let this_idx = row_idx * s_max + col_idx;
                        let ref_idx = (row_idx - 1) * s_max  + col_idx;
                        if !(rXY_evals[this_idx] * gXY_evals[this_idx]).eq(&(rXY_evals[ref_idx] * fXY_evals[this_idx])) {
                            flag1 = false;
                        }
                    }
                }
                assert!(flag1);
                let mut flag2 = true;
                for col_idx in 0..s_max-1 {
                    let this_idx = col_idx;
                    let ref_idx = s_max * (m_i - 1) + col_idx - 1;
                    if !(rXY_evals[this_idx] * gXY_evals[this_idx]).eq(&(rXY_evals[ref_idx] * fXY_evals[this_idx])) {
                        flag2 = false;
                    }
                }
                assert!(flag2);
                println!("Checked: r(X,Y) is well constructed.")
            }
            
            // Adding zero-knowledge to the copy constraint argument
            let mut RXY = &self.witness.rXY + &(&(&self.mixer.rR_X * &self.instance.t_mi) + &(&self.mixer.rR_Y * &self.instance.t_smax));
            let R = self.sigma.sigma_1.encode_poly(&mut RXY, &self.setup_params);
            return Proof1 {R}
        }
        
        pub fn prove2(&mut self, thetas: &Vec<ScalarField>, kappa0: ScalarField) -> Proof2 {
            let m_i = self.setup_params.l_D - self.setup_params.l;
            let s_max = self.setup_params.s_max;
            let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
            let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);
            let r_omegaX = self.witness.rXY.scale_coeffs_x(&omega_m_i.inv());
            let r_omegaX_omegaY = r_omegaX.scale_coeffs_y(&omega_s_max.inv());
            #[cfg(feature = "testing-mode")] {
                let x_e = ScalarCfg::generate_random(1)[0];
                let y_e = ScalarCfg::generate_random(1)[0];
                let r_eval = self.witness.rXY.eval(&x_e, &y_e);
                let r_eval_from_r_omegaX = r_omegaX.eval(&(omega_m_i * x_e), &y_e);
                let r_eval_from_r_omegaX_omegaY = r_omegaX_omegaY.eval(&(omega_m_i * x_e), &(omega_s_max * y_e));

                assert!( r_eval.eq( &(r_eval_from_r_omegaX) ) );
                assert!( r_eval.eq( &(r_eval_from_r_omegaX_omegaY) ) );    
            }
            let mut X_mono_coef = vec![ScalarField::zero(); 2];
            X_mono_coef[1] = ScalarField::one();
            let X_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&X_mono_coef), 2, 1);

            let mut Y_mono_coef = vec![ScalarField::zero(); 2];
            Y_mono_coef[1] = ScalarField::one();
            let Y_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&Y_mono_coef), 1, 2);

            let fXY = &( &(&self.witness.bXY + &(&thetas[0] * &self.instance.s0XY)) + &(&thetas[1] * &self.instance.s1XY)) + &thetas[2];
            let gXY = &( &(&self.witness.bXY + &(&thetas[0] * &X_mono)) + &(&thetas[1] * &Y_mono)) + &thetas[2];

            // Generating the copy constraints argumet polynomials p_1(X,Y), p_2(X,Y), p_3(X,Y)
            let lagrange_KL_XY = {
                let mut k_evals = vec![ScalarField::zero(); m_i];
                k_evals[m_i - 1] = ScalarField::one();
                let lagrange_K_XY = DensePolynomialExt::from_rou_evals(
                    HostSlice::from_slice(&k_evals),
                    m_i,
                    1,
                    None,
                    None
                );
                
                let mut l_evals = vec![ScalarField::zero(); s_max];
                l_evals[s_max - 1] = ScalarField::one();
                let lagrange_L_XY = DensePolynomialExt::from_rou_evals(
                    HostSlice::from_slice(&l_evals),
                    1,
                    s_max,
                    None,
                    None
                );
                &lagrange_K_XY * &lagrange_L_XY
            };
            

            let mut k0_evals = vec![ScalarField::zero(); m_i];
            k0_evals[0] = ScalarField::one();
            let lagrange_K0_XY = DensePolynomialExt::from_rou_evals(
                HostSlice::from_slice(&k0_evals),
                m_i,
                1,
                None,
                None
            );
            drop(k0_evals);

            (self.quotients.q2XY, self.quotients.q3XY, self.quotients.q4XY, self.quotients.q5XY, self.quotients.q6XY, self.quotients.q7XY) = {
                let mut p1XY = &(&self.witness.rXY - &ScalarField::one()) * &(lagrange_KL_XY);
                let mut p2XY = &(&X_mono - &ScalarField::one()) * &(
                    &(&self.witness.rXY * &gXY) - &(&r_omegaX * &fXY)
                );
                let mut p3XY = &lagrange_K0_XY * &(
                    &(&self.witness.rXY * &gXY) - &(&r_omegaX_omegaY * &fXY)
                );
                let (q2, q3) = p1XY.div_by_vanishing(m_i as i64, s_max as i64);
                let (q4, q5) = p2XY.div_by_vanishing(m_i as i64, s_max as i64);
                let (q6, q7) = p3XY.div_by_vanishing(m_i as i64, s_max as i64);
                (q2, q3, q4, q5, q6, q7)
            };
            
            #[cfg(feature = "testing-mode")] {
                let x_e = ScalarCfg::generate_random(1)[0];
                let y_e = ScalarCfg::generate_random(1)[0];
                let p_1_eval = p1XY.eval(&x_e, &y_e);
                let p_2_eval = p2XY.eval(&x_e, &y_e);
                let p_3_eval = p3XY.eval(&x_e, &y_e);
                let q_2_eval = self.quotients.q2XY.eval(&x_e, &y_e);
                let q_3_eval = self.quotients.q3XY.eval(&x_e, &y_e);
                let q_4_eval = self.quotients.q4XY.eval(&x_e, &y_e);
                let q_5_eval = self.quotients.q5XY.eval(&x_e, &y_e);
                let q_6_eval = self.quotients.q6XY.eval(&x_e, &y_e);
                let q_7_eval = self.quotients.q7XY.eval(&x_e, &y_e);
        
                let t_mi_eval = x_e.pow(m_i) - ScalarField::one();
                let t_smax_eval = y_e.pow(s_max) - ScalarField::one();
                assert!( p_1_eval.eq( &(q_2_eval * t_mi_eval + q_3_eval * t_smax_eval) ) );
                assert!( p_2_eval.eq( &(q_4_eval * t_mi_eval + q_5_eval * t_smax_eval) ) );    
                assert!( p_3_eval.eq( &(q_6_eval * t_mi_eval + q_7_eval * t_smax_eval) ) );
                println!("Checked: r(X,Y) satisfy the recursion for the copy constraints.")
            }
            
            // Adding zero-knowledge to the copy constraint argument
            let r_D1 = &self.witness.rXY - &r_omegaX; 
            let r_D2 = &self.witness.rXY - &r_omegaX_omegaY;
            let g_D = &gXY - &fXY;
            drop(gXY);
            drop(fXY);

            let Q_CX: G1serde = {
                let rB_X = DensePolynomialExt::from_coeffs(
                    HostSlice::from_slice(&self.mixer.rB_X), 
                    self.mixer.rB_X.len(), 
                    1
                );
                let mut Q_CX_XY = poly_comb!(
                    (ScalarField::one(), self.quotients.q2XY),
                    (kappa0, self.quotients.q4XY),
                    (kappa0.pow(2), self.quotients.q6XY),
                    (self.mixer.rR_X, lagrange_KL_XY),
                    (kappa0, (
                            &(&(&rB_X * &(&X_mono - &ScalarField::one())) * &r_D1)
                            + &(&(&self.mixer.rR_X * &(&X_mono - &ScalarField::one())) * &g_D)
                        )
                    ),
                    (kappa0.pow(2), (
                        &(&(&rB_X * &lagrange_K0_XY) * &r_D2)
                        + &(&(&self.mixer.rR_X * &lagrange_K0_XY) * &g_D)
                        )
                    )
                );
                self.sigma.sigma_1.encode_poly(&mut Q_CX_XY, &self.setup_params)
            };

            let Q_CY: G1serde = {
                let rB_Y = DensePolynomialExt::from_coeffs(
                    HostSlice::from_slice(&self.mixer.rB_Y), 
                    1, 
                    self.mixer.rB_Y.len()
                );
                let mut Q_CY_XY = poly_comb!(
                    (ScalarField::one(), self.quotients.q3XY),
                    (kappa0, self.quotients.q5XY),
                    (kappa0.pow(2), self.quotients.q7XY),
                    (self.mixer.rR_Y, lagrange_KL_XY),
                    (kappa0, (
                            &(&(&rB_Y * &(&X_mono - &ScalarField::one())) * &r_D1)
                            + &(&(&self.mixer.rR_Y * &(&X_mono - &ScalarField::one())) * &g_D)
                        )
                    ),
                    (kappa0.pow(2), (
                            &(&(&rB_Y * &lagrange_K0_XY) * &r_D2)
                            + &(&(&self.mixer.rR_Y * &lagrange_K0_XY) * &g_D)
                        )
                    )
                );
                self.sigma.sigma_1.encode_poly(&mut Q_CY_XY, &self.setup_params)
            };
            return Proof2 {Q_CX, Q_CY}
        }

        pub fn prove3(&self, chi: ScalarField, zeta: ScalarField) -> Proof3 {
            let m_i = self.setup_params.l_D - self.setup_params.l;
            let s_max = self.setup_params.s_max;
            let V_eval: ScalarField = {
                let VXY = poly_comb!(
                    (ScalarField::one(), self.witness.vXY),
                    (self.mixer.rV_X, self.instance.t_n),
                    (self.mixer.rV_Y, self.instance.t_smax)
                );
                VXY.eval(&chi, &zeta)
            };

            let RXY = &self.witness.rXY + &(&(&self.mixer.rR_X * &self.instance.t_mi) + &(&self.mixer.rR_Y * &self.instance.t_smax));
            let R_eval = RXY.eval(&chi, &zeta);

            let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
            let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);

            let R_omegaX_XY = RXY.scale_coeffs_x(&omega_m_i.inv());
            let R_omegaX_eval = R_omegaX_XY.eval(&chi, &zeta);
            drop(RXY);

            let R_omegaX_omegaY_XY = R_omegaX_XY.scale_coeffs_y(&omega_s_max.inv());
            let R_omegaX_omegaY_eval = R_omegaX_omegaY_XY.eval(&chi, &zeta);
            return Proof3 {
                V_eval: FieldSerde(V_eval), 
                R_eval: FieldSerde(R_eval), 
                R_omegaX_eval: FieldSerde(R_omegaX_eval), 
                R_omegaX_omegaY_eval: FieldSerde(R_omegaX_omegaY_eval)
            }
        }

        pub fn prove4(&self, proof3: &Proof3, thetas: &Vec<ScalarField>, kappa0: ScalarField, chi: ScalarField, zeta: ScalarField, kappa1: ScalarField) -> (Proof4, Proof4Test) {
            let (Pi_AX, Pi_AY) = {
                let (mut Pi_AX_XY, mut Pi_AY_XY, rem) = {
                    let t_n_eval = self.instance.t_n.eval(&chi, &ScalarField::one());
                    let t_smax_eval = self.instance.t_smax.eval(&ScalarField::one(), &zeta);
                    let small_v_eval = self.witness.vXY.eval(&chi, &zeta);

                    let rW_X = DensePolynomialExt::from_coeffs(
                        HostSlice::from_slice(&self.mixer.rW_X), 
                        self.mixer.rW_X.len(), 
                        1
                    );
                    let rW_Y = DensePolynomialExt::from_coeffs(
                        HostSlice::from_slice(&self.mixer.rW_Y), 
                        1, 
                        self.mixer.rW_Y.len()
                    );

                    let VXY = poly_comb!(
                        (ScalarField::one(), self.witness.vXY),
                        (self.mixer.rV_X, self.instance.t_n),
                        (self.mixer.rV_Y, self.instance.t_smax)
                    );

                    let pA_XY = poly_comb!(
                        // for KZG of V
                        (kappa1, &VXY - &proof3.V_eval.0),

                        // for Arithmetic constraints
                        (small_v_eval, self.witness.uXY),
                        (ScalarField::zero() - ScalarField::one(), self.witness.wXY),
                        ((ScalarField::zero() - ScalarField::one()) * t_n_eval, self.quotients.q0XY),
                        ((ScalarField::zero() - ScalarField::one()) * t_smax_eval, self.quotients.q1XY),

                        // for zero-knowledge
                        (small_v_eval * self.mixer.rU_X, self.instance.t_n),
                        (small_v_eval * self.mixer.rU_Y, self.instance.t_smax),
                        (ScalarField::zero() - ((self.mixer.rU_X * t_n_eval) + (self.mixer.rU_Y * t_smax_eval)), self.witness.vXY),
                        (rW_X, &t_n_eval - &self.instance.t_n),
                        (rW_Y, &t_smax_eval - &self.instance.t_smax)
                    );
                    pA_XY.div_by_ruffini(&chi, &zeta)
                };
                (
                    self.sigma.sigma_1.encode_poly(&mut Pi_AX_XY, &self.setup_params),
                    self.sigma.sigma_1.encode_poly(&mut Pi_AY_XY, &self.setup_params)
                )
            };

            let m_i = self.setup_params.l_D - self.setup_params.l;
            let s_max = self.setup_params.s_max;
            let omega_m_i = ntt::get_root_of_unity::<ScalarField>(m_i as u64);
            let omega_s_max = ntt::get_root_of_unity::<ScalarField>(s_max as u64);
            let RXY = &self.witness.rXY + &(&(&self.mixer.rR_X * &self.instance.t_mi) + &(&self.mixer.rR_Y * &self.instance.t_smax));
            let (M_X, M_Y) = {
                let (mut M_X_XY, mut M_Y_XY, rem2) = (&RXY - &proof3.R_omegaX_eval.0).div_by_ruffini(
                    &(omega_m_i.inv() * chi), 
                    &zeta
                );
                #[cfg(feature = "testing-mode")] {
                    assert_eq!(rem2, ScalarField::zero());
                    let x_e = ScalarCfg::generate_random(1)[0];
                    let y_e = ScalarCfg::generate_random(1)[0];
                    let lhs = (&RXY - &proof3.R_omegaX_eval.0).eval(&x_e, &y_e);
                    let rhs = M_X_XY.eval(&x_e, &y_e) * (x_e - omega_m_i.inv() * chi) + M_Y_XY.eval(&x_e, &y_e) * (y_e - zeta);
                    assert_eq!(lhs, rhs);
                }
                (
                    self.sigma.sigma_1.encode_poly(&mut M_X_XY, &self.setup_params),
                    self.sigma.sigma_1.encode_poly(&mut M_Y_XY, &self.setup_params)
                )
            };

            let (N_X, N_Y) = {
                let (mut N_X_XY, mut N_Y_XY, rem3) = (&RXY - &proof3.R_omegaX_omegaY_eval.0).div_by_ruffini(
                    &(omega_m_i.inv() * chi), 
                    &(omega_s_max.inv() * zeta)
                );
                #[cfg(feature = "testing-mode")] {
                    assert_eq!(rem3, ScalarField::zero());
                    let x_e = ScalarCfg::generate_random(1)[0];
                    let y_e = ScalarCfg::generate_random(1)[0];
                    let lhs = (&RXY - &proof3.R_omegaX_omegaY_eval.0).eval(&x_e, &y_e);
                    let rhs = N_X_XY.eval(&x_e, &y_e) * (x_e - omega_m_i.inv() * chi) + N_Y_XY.eval(&x_e, &y_e) * (y_e - omega_s_max.inv() * zeta);
                    assert_eq!(lhs, rhs);
                }
                (
                    self.sigma.sigma_1.encode_poly(&mut N_X_XY, &self.setup_params),
                    self.sigma.sigma_1.encode_poly(&mut N_Y_XY, &self.setup_params)
                )
            };
            
            let (Pi_CX, Pi_CY) = {
                let LHS_for_copy = {
                    let r_omegaX = self.witness.rXY.scale_coeffs_x(&omega_m_i.inv());
                    let r_omegaX_omegaY = r_omegaX.scale_coeffs_y(&omega_s_max.inv());
                    let mut X_mono_coef = vec![ScalarField::zero(); 2];
                    X_mono_coef[1] = ScalarField::one();
                    let X_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&X_mono_coef), 2, 1);
                    drop(X_mono_coef);
                    let (fXY, gXY) = {
                        let mut Y_mono_coef = vec![ScalarField::zero(); 2];
                        Y_mono_coef[1] = ScalarField::one();
                        let Y_mono = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&Y_mono_coef), 1, 2);
                        (
                            &( &(&self.witness.bXY + &(&thetas[0] * &self.instance.s0XY)) + &(&thetas[1] * &self.instance.s1XY)) + &thetas[2],
                            &( &(&self.witness.bXY + &(&thetas[0] * &X_mono)) + &(&thetas[1] * &Y_mono)) + &thetas[2]
                        )
                    };
                    let t_mi_eval = chi.pow(m_i) - ScalarField::one();
                    let t_s_max_eval = zeta.pow(s_max) - ScalarField::one();
                    let lagrange_K0_XY = {
                        let mut k0_evals = vec![ScalarField::zero(); m_i];
                        k0_evals[0] = ScalarField::one();
                        DensePolynomialExt::from_rou_evals(
                            HostSlice::from_slice(&k0_evals),
                            m_i,
                            1,
                            None,
                            None
                        )
                    };
                    let lagrange_K0_eval = lagrange_K0_XY.eval(&chi, &zeta);
        
                    let pC_XY = {
                        let small_r_eval = self.witness.rXY.eval(&chi, &zeta);
                        let small_r_omegaX_eval = r_omegaX.eval(&chi, &zeta);
                        let small_r_omegaX_omegaY_eval = r_omegaX_omegaY.eval(&chi, &zeta);
                        let lagrange_KL_XY = {
                            let mut k_evals = vec![ScalarField::zero(); m_i];
                            k_evals[m_i - 1] = ScalarField::one();
                            let lagrange_K_XY = DensePolynomialExt::from_rou_evals(
                                HostSlice::from_slice(&k_evals),
                                m_i,
                                1,
                                None,
                                None
                            );
                            let mut l_evals = vec![ScalarField::zero(); s_max];
                            l_evals[s_max - 1] = ScalarField::one();
                            let lagrange_L_XY = DensePolynomialExt::from_rou_evals(
                                HostSlice::from_slice(&l_evals),
                                1,
                                s_max,
                                None,
                                None
                            );
                            &lagrange_K_XY * &lagrange_L_XY
                        };
                        let term5 = poly_comb!(
                            (small_r_eval, gXY),
                            (ScalarField::zero() - small_r_omegaX_eval, fXY)
                        );
                        let term6 = poly_comb!(
                            (small_r_eval, gXY),
                            (ScalarField::zero() - small_r_omegaX_omegaY_eval, fXY)
                        );
                        let term7 = poly_comb!(
                            (ScalarField::one(), self.quotients.q2XY),
                            (kappa0, self.quotients.q4XY),
                            (kappa0.pow(2), self.quotients.q6XY)
                        );
                        let term8 = poly_comb!(
                            (ScalarField::one(), self.quotients.q3XY),
                            (kappa0, self.quotients.q5XY),
                            (kappa0.pow(2), self.quotients.q7XY)
                        );
                        poly_comb!(
                            (small_r_eval - ScalarField::one(), lagrange_KL_XY),
                            (kappa0 * (chi - ScalarField::one()), term5),
                            (kappa0.pow(2) * lagrange_K0_eval, term6),
                            (ScalarField::zero() - t_mi_eval, term7),
                            (ScalarField::zero() - t_s_max_eval, term8)
                        )
                    };
                    let (LHS_zk1, LHS_zk2) = {
                        let r_D1 = &self.witness.rXY - &r_omegaX; 
                        let r_D2 = &self.witness.rXY - &r_omegaX_omegaY;
                        let (term9, term_B_zk) = {
                            let rB_X = DensePolynomialExt::from_coeffs(
                                HostSlice::from_slice(&self.mixer.rB_X), 
                                self.mixer.rB_X.len(), 
                                1
                            );
                            let rB_Y = DensePolynomialExt::from_coeffs(
                                HostSlice::from_slice(&self.mixer.rB_Y), 
                                1, 
                                self.mixer.rB_Y.len()
                            );
                            (
                                &(&t_mi_eval * &rB_X) + &(&t_s_max_eval * &rB_Y),
                                &(&rB_X * &self.instance.t_mi) + &(&rB_Y * &self.instance.t_smax)
                            )
                        };
                        let term10 = &(self.mixer.rR_X * t_mi_eval + self.mixer.rR_Y * t_s_max_eval) * &(&gXY - &fXY);
                        (
                            poly_comb!(
                                ( (chi - ScalarField::one()) * r_D1.eval(&chi, &zeta), term_B_zk),
                                (&ScalarField::one()- &X_mono, &r_D1 * &term9),
                                (term10, (&chi - &X_mono))
                            ),
                            poly_comb!(
                                (lagrange_K0_eval * r_D2.eval(&chi, &zeta), term_B_zk),
                                (&lagrange_K0_XY * &r_D2, -&term9),
                                (term10, &lagrange_K0_eval - &lagrange_K0_XY)
                            )
                        )
                    };
        
                    poly_comb!(
                        (kappa1.pow(2), pC_XY),
                        (kappa1.pow(2) * kappa0, LHS_zk1),
                        (kappa1.pow(2) * kappa0.pow(2), LHS_zk2),
                        (kappa1.pow(3), &RXY - &proof3.R_eval.0)
                    )
                };

                let (mut Pi_CX_XY, mut Pi_CY_XY, rem1) = LHS_for_copy.div_by_ruffini(&chi, &zeta);
                #[cfg(feature = "testing-mode")] {
                    assert_eq!(rem1, ScalarField::zero());
                    let x_e = ScalarCfg::generate_random(1)[0];
                    let y_e = ScalarCfg::generate_random(1)[0];
                    let lhs = LHS_for_copy.eval(&x_e, &y_e);
                    let rhs = Pi_CX_XY.eval(&x_e, &y_e) * (x_e - chi) + Pi_CY_XY.eval(&x_e, &y_e) * (y_e - zeta);
                    assert_eq!(lhs, rhs);
                }
                (
                    self.sigma.sigma_1.encode_poly(&mut Pi_CX_XY, &self.setup_params),
                    self.sigma.sigma_1.encode_poly(&mut Pi_CY_XY, &self.setup_params)
                )
            };
            #[cfg(feature = "testing-mode")] {
                println!("Checked: B(X,Y) and R(X,Y) with zero-knowledge satisfy the copy constraints.")
            }
            drop(RXY);
            let Pi_B = {
                let A_eval = self.instance.a_pub_X.eval(&chi, &zeta);
                let (mut pi_B_XY, _, _) = (&self.instance.a_pub_X - &A_eval).div_by_ruffini(&chi, &zeta);
                self.sigma.sigma_1.encode_poly(&mut pi_B_XY, &self.setup_params) * kappa1.pow(4)
            };

            let Pi_X = Pi_AX + Pi_CX + Pi_B;
            let Pi_Y = Pi_AY + Pi_CY;
            return (
                Proof4 {Pi_X, Pi_Y, M_X, M_Y, N_X, N_Y},
                Proof4Test {Pi_CX, Pi_CY, Pi_AX, Pi_AY, Pi_B, M_X, M_Y, N_X, N_Y}
            )
        }
    }

    // ===== TRANSCRIPT =====

    #[derive(Clone)]
    pub struct RollingKeccakTranscript {
        state_part_0: [u8; 32],
        state_part_1: [u8; 32],
        challenge_counter: u32,
        debug_mode: bool,
    }

    impl RollingKeccakTranscript {
        // Constants
        const DST_0_TAG: u8 = 0;
        const DST_1_TAG: u8 = 1;
        const CHALLENGE_DST_TAG: u8 = 2;

        pub fn new() -> Self {
            Self {
                state_part_0: [0u8; 32],
                state_part_1: [0u8; 32],
                challenge_counter: 0,
                debug_mode: false,
            }
        }
        
        // Enable or disable debug mode
        pub fn set_debug(&mut self, enable: bool) {
            self.debug_mode = enable;
        }
        
        // Debug print helper
        fn debug_print(&self, message: &str) {
            if self.debug_mode {
                println!("[Transcript Debug] {}", message);
            }
        }
        
        // Update function that exactly matches the Solidity memory layout
        fn update(&mut self, bytes: &[u8]) -> Result<(), &'static str> {
            if bytes.len() > 32 {
                return Err("Input must be 32 bytes or less");
            }
            
            if self.debug_mode {
                println!("[Transcript Update] Adding value: 0x{}", hex_encode(bytes));
            }
            
            // Save the old states
            let old_state_0 = self.state_part_0;
            let old_state_1 = self.state_part_1;
            
            // Create a buffer that exactly matches the Solidity memory layout
            // This layout is critical to match exactly
            let mut hash_input = [0u8; 100]; // 0x64 bytes (100 bytes)
            
            // Set the DST tag at offset 0x03
            hash_input[3] = Self::DST_0_TAG;
            
            // Copy the state values
            hash_input[4..36].copy_from_slice(&old_state_0);   // STATE_0 at offset 0x04
            hash_input[36..68].copy_from_slice(&old_state_1);  // STATE_1 at offset 0x24
            
            // Copy the value bytes (32 bytes) at offset 0x44
            // Ensure right-alignment in the 32-byte slot
            let start_idx = 100 - bytes.len();
            hash_input[start_idx..100].copy_from_slice(bytes);
            
            // Print the entire input for debugging
            if self.debug_mode {
                println!("[Hash Input for state_0] 0x{}", hex_encode(&hash_input));
            }
            
            // Hash for state_0 update
            let mut hasher = Keccak::new_keccak256();
            hasher.update(&hash_input);
            hasher.finalize(&mut self.state_part_0);
            
            if self.debug_mode {
                println!("[Transcript State] After DST_0_TAG: state_0=0x{}", hex_encode(&self.state_part_0));
            }
            
            // Now for state_1, update the DST tag to 0x01
            hash_input[3] = Self::DST_1_TAG;
            
            if self.debug_mode {
                println!("[Hash Input for state_1] 0x{}", hex_encode(&hash_input));
            }
            
            // Hash for state_1 update
            let mut hasher = Keccak::new_keccak256();
            hasher.update(&hash_input);
            hasher.finalize(&mut self.state_part_1);
            
            if self.debug_mode {
                println!("[Transcript State] After DST_1_TAG: state_1=0x{}", hex_encode(&self.state_part_1));
            }
            
            Ok(())
        }
        
        // GetChallenge function that strictly follows the provided documentation
        fn get_challenge_raw(&mut self) -> [u8; 32] {
            self.debug_print(&format!("Generating challenge #{}", self.challenge_counter));
            
            // Create a buffer that exactly matches the Solidity memory layout for challenge generation
            let mut hash_input = [0u8; 72]; // 0x48 bytes (72 bytes)
            
            // Set the DST tag at offset 0x03
            hash_input[3] = Self::CHALLENGE_DST_TAG;
            
            // Copy current state
            hash_input[4..36].copy_from_slice(&self.state_part_0);  // STATE_0 at offset 0x04
            hash_input[36..68].copy_from_slice(&self.state_part_1); // STATE_1 at offset 0x24
            
            // Set the challenge counter - shifted left by 224 bits (28 bytes)
            // This puts the counter in the most significant position in a 32-byte word
            // In Solidity: shl(224, numberOfChallenge)
            hash_input[68] = (self.challenge_counter >> 24) as u8;  // Most significant byte
            hash_input[69] = (self.challenge_counter >> 16) as u8;
            hash_input[70] = (self.challenge_counter >> 8) as u8;
            hash_input[71] = self.challenge_counter as u8;          // Least significant byte
            
            if self.debug_mode {
                println!("[Challenge #{} Input] Full hash input: 0x{}", 
                        self.challenge_counter, 
                        hex_encode(&hash_input));
            }
            
            // Increment the counter AFTER using it for this challenge
            let current_counter = self.challenge_counter;
            self.challenge_counter += 1;
            
            let mut value = [0u8; 32];
            let mut hasher = Keccak::new_keccak256();
            hasher.update(&hash_input);
            hasher.finalize(&mut value);
            
            if self.debug_mode {
                println!("[Challenge #{} Raw] 0x{}", current_counter, hex_encode(&value));
            }
            
            value
        }
        
        // Get a challenge as a ScalarField element
        fn get_challenge(&mut self) -> ScalarField {
            let mut result = self.get_challenge_raw();
            
            // Apply the field reduction - mask the top bits to ensure it's within the field
            // This matches the Solidity FR_MASK = 0x1fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            result[0] &= 0x1f;

            result.reverse();
            
            if self.debug_mode {
                println!("[Challenge Masked] 0x{}", hex_encode(&result));
            }
            
            // Convert to scalar field
            let scalar = ScalarField::from_bytes_le(&result);
            
            // Ensure never zero
            if scalar == ScalarField::zero() {
                self.debug_print("Challenge was zero, returning one instead");
                return ScalarField::one();
            }
            
            if self.debug_mode {
                println!("[Challenge Final] 0x{}", hex_string(&scalar));
            }
            
            scalar
        }
        
        // Helper method to convert a field element to bytes, aligned for Solidity
        fn field_to_bytes<T: FieldImpl>(&self, element: &T) -> [u8; 32] {
            let mut le_bytes = element.to_bytes_le();
            
            // Ensure it's no more than 32 bytes
            if le_bytes.len() > 32 {
                let len = le_bytes.len();
                le_bytes = le_bytes[(len-32)..].to_vec();
            }
            
            // Convert to big-endian
            le_bytes.reverse();
            
            // Create a properly aligned 32-byte array
            let mut result = [0u8; 32];
            let start_idx = 32 - le_bytes.len();
            result[start_idx..].copy_from_slice(&le_bytes);
            
            result
        }
        
        // Commit a standard 32-byte scalar field element
        // This is used for BLS12-381 scalar field elements (Fr)
        pub fn commit_field_as_bytes<T: FieldImpl>(&mut self, element: &T) -> Result<(), &'static str> {
            let bytes = self.field_to_bytes(element);
            
            if self.debug_mode {
                println!("[Scalar Field Commit] BE bytes: 0x{}", hex_encode(&bytes));
            }
            
            self.update(&bytes)
        }
        
        // Commit a BLS12-381 field element (split into two parts)
        pub fn commit_bls12_381_field_element<T: FieldImpl>(&mut self, element: &T) -> Result<(), &'static str> {
            // Get field element as bytes (little-endian)
            let mut le_bytes = element.to_bytes_le();
            
            // Ensure it's 48 bytes (384 bits) long
            while le_bytes.len() < 48 {
                le_bytes.push(0);
            }
            
            // Convert to big-endian
            le_bytes.reverse();
            
            // Split into part1 (first 16 bytes) and part2 (remaining 32 bytes)
            let part1 = &le_bytes[0..16];
            let part2 = &le_bytes[16..48];
            
            if self.debug_mode {
                println!("[BLS12-381 Field] Original (BE): 0x{}", hex_encode(&le_bytes));
                println!("[BLS12-381 Field] Part1 (16 bytes): 0x{}", hex_encode(part1));
                println!("[BLS12-381 Field] Part2 (32 bytes): 0x{}", hex_encode(part2));
            }
            
            // Create padded part1 (16 bytes of zeros + 16 bytes of part1)
            let mut part1_padded = [0u8; 32];
            part1_padded[16..32].copy_from_slice(part1);
            
            if self.debug_mode {
                println!("[BLS12-381 Field] Part1 padded (32 bytes): 0x{}", hex_encode(&part1_padded));
            }
            
            // Commit each part separately
            self.update(&part1_padded)?;
            self.update(part2)?;
            
            Ok(())
        }
        
        // Helper function to commit a G1 point
        pub fn commit_g1_point(&mut self, point: &G1serde) -> Result<(), &'static str> {
            // Since we've had issues with the G1 point commitments, let's be extra careful here
            // and commit each part individually with complete state information
            let x = &point.0.x;
            let y = &point.0.y;
            
            if self.debug_mode {
                println!("[G1 Point Commit] Committing X: {}", any_field_to_hex(x));
            }
            self.commit_bls12_381_field_element(x)?;
            
            if self.debug_mode {
                println!("[G1 Point Commit] Committing Y: {}", any_field_to_hex(y));
            }
            self.commit_bls12_381_field_element(y)?;
            
            Ok(())
        }
        
        // Get multiple challenges
        pub fn get_challenges(&mut self, count: usize) -> Vec<ScalarField> {
            let mut challenges = Vec::with_capacity(count);
            for _ in 0..count {
                challenges.push(self.get_challenge());
            }
            challenges
        }
        
        // Commit raw bytes (mainly for testing)
        pub fn commit_bytes(&mut self, bytes: &[u8]) -> Result<(), &'static str> {
            self.update(bytes)
        }
    }


    #[derive(Clone)]
    pub struct TranscriptManager {
        pub transcript: RollingKeccakTranscript
    }

    impl TranscriptManager {
        pub fn new() -> Self {
            Self {
                transcript: RollingKeccakTranscript::new()
            }
        }
        
        pub fn add_proof0(&mut self, proof: &Proof0) {
            //println!("Adding proof0 commitments to transcript...");
            
            // Add each field element individually to match the verifier exactly
            // Order is critical: U_x, U_y, V_x, V_y, etc.
            match self.transcript.commit_bls12_381_field_element(&proof.U.0.x) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit U.x: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.U.0.y) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit U.y: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.V.0.x) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit V.x: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.V.0.y) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit V.y: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.W.0.x) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit W.x: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.W.0.y) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit W.y: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.Q_AX.0.x) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit Q_AX.x: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.Q_AX.0.y) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit Q_AX.y: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.Q_AY.0.x) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit Q_AY.x: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.Q_AY.0.y) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit Q_AY.y: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.B.0.x) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit B.x: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.B.0.y) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit B.y: {}", e)
            }
        }
        
        pub fn get_thetas(&mut self) -> Vec<ScalarField> {
            //println!("Generating thetas from transcript...");
            let thetas = self.transcript.get_challenges(3);
            
            // Print challenges for debugging
            /*
            for (i, theta) in thetas.iter().enumerate() {
                println!("Theta_{}: {}", i, hex_string(theta));
            }
            */
            thetas
        }
        
        pub fn add_proof1(&mut self, proof: &Proof1) {
            //println!("Adding proof1 commitments to transcript...");
            
            match self.transcript.commit_bls12_381_field_element(&proof.R.0.x) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit R.x: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.R.0.y) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit R.y: {}", e)
            }
        }
        
        pub fn get_kappa0(&mut self) -> ScalarField {
            //println!("Generating kappa0 from transcript...");
            let kappa0 = self.transcript.get_challenge();
            //println!("Kappa0: {}", hex_string(&kappa0));
            kappa0
        }
        
        pub fn add_proof2(&mut self, proof: &Proof2) {
            //println!("Adding proof2 commitments to transcript...");
            
            match self.transcript.commit_bls12_381_field_element(&proof.Q_CX.0.x) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit Q_CX.x: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.Q_CX.0.y) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit Q_CX.y: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.Q_CY.0.x) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit Q_CY.x: {}", e)
            }
            
            match self.transcript.commit_bls12_381_field_element(&proof.Q_CY.0.y) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit Q_CY.y: {}", e)
            }
        }
        
        pub fn get_chi_zeta(&mut self) -> (ScalarField, ScalarField) {
            //println!("Generating chi and zeta from transcript...");
            let chi = self.transcript.get_challenge();
            let zeta = self.transcript.get_challenge();
            
            //println!("Chi: {}", hex_string(&chi));
            //println!("Zeta: {}", hex_string(&zeta));
            
            (chi, zeta)
        }
        
        pub fn add_proof3(&mut self, proof: &Proof3) {
            //println!("Adding proof3 commitments to transcript...");
            
            match self.transcript.commit_field_as_bytes(&proof.V_eval.0) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit V_eval: {}", e)
            }
            
            match self.transcript.commit_field_as_bytes(&proof.R_eval.0) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit R_eval: {}", e)
            }
            
            match self.transcript.commit_field_as_bytes(&proof.R_omegaX_eval.0) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit R_omegaX_eval: {}", e)
            }
            
            match self.transcript.commit_field_as_bytes(&proof.R_omegaX_omegaY_eval.0) {
                Ok(_) => {},
                Err(e) => panic!("Failed to commit R_omegaX_omegaY_eval: {}", e)
            }
        }
        
        pub fn get_kappa1(&mut self) -> ScalarField {
            //println!("Generating kappa1 from transcript...");
            let kappa1 = self.transcript.get_challenge();
            //println!("Kappa1: {}", hex_string(&kappa1));
            kappa1
        }
        
        pub fn get_kappa2(&mut self) -> ScalarField {
            //println!("Generating kappa2 from transcript...");
            let kappa2 = self.transcript.get_challenge();
            //println!("Kappa2: {}", hex_string(&kappa2));
            kappa2
        }
    }