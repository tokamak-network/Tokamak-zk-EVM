use libs::iotools::{Permutation, PlacementVariables, SetupParams, SubcircuitInfo, SubcircuitR1CS};
use libs::field_structures::{Tau};
use libs::iotools::{read_json_as_boxed_boxed_numbers};
use libs::vector_operations::gen_evaled_lagrange_bases;
use libs::group_structures::{Sigma1, Sigma};
use libs::polynomial_structures::{gen_aX, gen_bXY, gen_uXY, gen_vXY, gen_wXY, gen_arbit_poly};
use icicle_bls12_381::curve::{ScalarField, CurveCfg, G2CurveCfg};
use icicle_core::traits::{Arithmetic, FieldImpl};
use icicle_core::ntt;
use icicle_core::curve::Curve;

use std::{vec, cmp};
use std::time::Instant;
use std::fs::File;
use std::io::Write;

fn main() {   
    // Generate a random secret parameter tau (x and y only, no z as per the paper)
    println!("Generating random tau parameter for simulation...");
    let simTau = Tau::gen();
    
    // Load setup parameters from JSON file
    println!("Loading setup parameters...");
    let setup_path = "setup/trusted-setup/inputs/setupParams.json";
    let setup_params = SetupParams::from_path(setup_path).unwrap();

    // Extract key parameters from setup_params
    let l = setup_params.l;     // Number of public I/O wires
    let l_d = setup_params.l_D; // Number of interface wires
    let m_d = setup_params.m_D; // Total number of wires
    let s_d = setup_params.s_D; // Number of subcircuits
    let n = setup_params.n;     // Number of constraints per subcircuit
    let s_max = setup_params.s_max; // The maximum number of placements
    
    // Assert l is a power of two
    if !l.is_power_of_two() {
        panic!("l is not a power of two.");
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
    println!("Loading subcircuit information...");
    let subcircuit_path = "setup/trusted-setup/inputs/subcircuitInfo.json";
    let subcircuit_infos = SubcircuitInfo::from_path(subcircuit_path).unwrap();

    // Load subcircuit library R1CS
    println!("Loading subcircuits...");
    let mut compact_library_R1CS: Vec<SubcircuitR1CS> = Vec::new();
    for i in 0..s_d {
        println!("Loading subcircuit id {}", i);
        let r1cs_path: String = format!("setup/trusted-setup/inputs/json/subcircuit{i}.json");

        // Evaluate QAP for the current subcircuit
        let compact_r1cs = SubcircuitR1CS::from_path(&r1cs_path, &setup_params, &subcircuit_infos[i]).unwrap();
        compact_library_R1CS.push(compact_r1cs);
    }

    // Load global wire list
    println!("Loading global wire list...");
    let global_wire_path = "setup/trusted-setup/inputs/globalWireList.json";
    let global_wire_list = read_json_as_boxed_boxed_numbers(global_wire_path).unwrap();
    
    // Load Sigma (reference string)
    println!("Loading the reference string...");
    let sigma_path = "setup/trusted-setup/output/combined_sigma.json";
    let sigma = Sigma::read_from_json(&sigma_path).unwrap();

    // Load local variables of placements (public instance + interface witness + internal witness)
    println!("Loading placement variables...");
    let placement_variables_path = "prove/inputs/placementVariables.json";
    let placement_variables = PlacementVariables::from_path(&placement_variables_path).unwrap();

    // Load permutation (copy constraints of the variables)
    println!("Loading a permutation...");
    let permutation_path = "prove/inputs/permutation.json";
    let permutation_raw = Permutation::from_path(&permutation_path).unwrap();
    
    // Parsing the inputs
    // Parsing the variables
    println!("Parsing the input variables...");
    println!("Generating a(X)...");
    let aX = gen_aX(&placement_variables, &subcircuit_infos, &setup_params);
    println!("Generating b(X,Y)...");
    let bXY = gen_bXY(&placement_variables, &subcircuit_infos, &setup_params);
    println!("Generating u(X,Y)...");
    let uXY = gen_uXY(&placement_variables, &compact_library_R1CS, &setup_params);
    println!("Generating v(X,Y)...");
    let vXY = gen_vXY(&placement_variables, &compact_library_R1CS, &setup_params);
    println!("Generating w(X,Y)...");
    let wXY = gen_wXY(&placement_variables, &compact_library_R1CS, &setup_params);
    
    // Generating a permutation matrix
    println!("Converting the permutation into polynomials s^0 and s^1...");
    let (s0, s1) = Permutation::to_poly(&permutation_raw, m_i, s_max);
    drop(permutation_raw);

}