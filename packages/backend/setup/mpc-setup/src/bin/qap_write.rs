use libs::iotools::{SetupParams, SubcircuitInfo};
use libs::polynomial_structures::QAP;
use libs::utils::{setup_shape, validate_public_wire_size, validate_setup_shape};
use mpc_setup::QAP_COMPILER_PATH_PREFIX;
use std::env;

//cargo run --release --bin qap_write
fn main() {
    let base_path = env::current_dir().unwrap();
    let qap_path = base_path.join(QAP_COMPILER_PATH_PREFIX);

    // Load setup parameters from JSON file
    let setup_file_name = "setupParams.json";

    println!("qap_path: {:?}", qap_path.join(setup_file_name).display());
    let setup_params = SetupParams::read_from_json(qap_path.join(setup_file_name)).unwrap();
    let shape = setup_shape(&setup_params);
    validate_setup_shape(&shape);
    validate_public_wire_size(shape.l_free);

    // Extract key parameters from setup_params
    let m_d = setup_params.m_D; // Total number of wires
    let n = setup_params.n; // Number of constraints per subcircuit
    let s_max = setup_params.s_max; // The maximum number of placements.
                                    // Additional wire-related parameters
    let l = setup_params.l; // Number of public I/O wires
    let l_free = setup_params.l_free;
    let l_d = setup_params.l_D; // Number of interface wires
                                // The last wire-related parameter
    let m_i = l_d - l;
    println!(
        "Setup parameters: \n n = {:?}, \n s_max = {:?}, \n l = {:?}, \n l_free = {:?}, \n m_I = {:?}, \n m_D = {:?}",
        n, s_max, l, l_free, m_i, m_d
    );

    // Load subcircuit information
    let subcircuit_file_name = "subcircuitInfo.json";
    let subcircuit_infos =
        SubcircuitInfo::read_box_from_json(qap_path.join(subcircuit_file_name)).unwrap();
    let qap = QAP::gen_from_R1CS(&qap_path, &subcircuit_infos, &setup_params);

    println!("len_v {}", qap.v_j_X.len());
    println!("len_u {}", qap.u_j_X.len());
    println!("len_w {}", qap.w_j_X.len());
    //cargo run --release --bin prepare_phase2
}
