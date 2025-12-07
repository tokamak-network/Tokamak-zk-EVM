use libs::iotools::{SetupParams, SubcircuitInfo};
use libs::polynomial_structures::QAP;
use mpc_setup::QAP_COMPILER_PATH_PREFIX;
use std::env;

//cargo run --release --bin qap_write
fn main() {
    let base_path = env::current_dir().unwrap();
    let qap_path = base_path.join(QAP_COMPILER_PATH_PREFIX);

    // Load setup parameters from JSON file
    let setup_file_name = "setupParams.json";

    println!("qap_path: {:?}", qap_path.join(setup_file_name).display());
    let mut setup_params = SetupParams::read_from_json(qap_path.join(setup_file_name)).unwrap();

    // Extract key parameters from setup_params
    let m_d = setup_params.m_D; // Total number of wires
    let s_d = setup_params.s_D; // Number of subcircuits
    let n = setup_params.n; // Number of constraints per subcircuit
    let s_max = setup_params.s_max; // The maximum number of placements.
    // Additional wire-related parameters
    let l = setup_params.l; // Number of public I/O wires
    let l_pub = setup_params.l_pub_in + setup_params.l_pub_out;
    let l_prv = setup_params.l_prv_in + setup_params.l_prv_out;
    let l_d = setup_params.l_D; // Number of interface wires
    // The last wire-related parameter
    let m_i = l_d - l;
    println!(
        "Setup parameters: \n n = {:?}, \n s_max = {:?}, \n l = {:?}, \n m_I = {:?}, \n m_D = {:?}",
        n, s_max, l, m_i, m_d
    );

    // Verify n is a power of two
    if !n.is_power_of_two() {
        panic!("n is not a power of two.");
    }

    if !(l_pub.is_power_of_two() || l_pub == 0) {
        panic!("l_pub is not a power of two.");
    }

    if !(l_prv.is_power_of_two()) {
        panic!("l_prv is not a power of two.");
    }

    // Verify s_max is a power of two
    if !s_max.is_power_of_two() {
        panic!("s_max is not a power of two.");
    }

    // Verify m_I is a power of two
    if !m_i.is_power_of_two() {
        panic!("m_I is not a power of two.");
    }

    // Load subcircuit information
    let subcircuit_file_name = "subcircuitInfo.json";
    let subcircuit_infos = SubcircuitInfo::read_box_from_json(qap_path.join(subcircuit_file_name)).unwrap();
    let qap = QAP::gen_from_R1CS(&qap_path.to_str().unwrap(), &subcircuit_infos, &setup_params);

    println!("len_v {}", qap.v_j_X.len());
    println!("len_u {}", qap.u_j_X.len());
    println!("len_w {}", qap.w_j_X.len());
    //cargo run --release --bin prepare_phase2
}

