use libs::field_structures::Tau;
use libs::iotools::{SetupParams, SubcircuitInfo};
pub use mpc_setup::prepare::QAP;


//cargo run --release --bin qap_write
fn main() {
    // Elements of the form {x^h y^i}_{h=0,i=0}^{max(2n-2,3m_D-3),2*s_max-2}
    //xy_powers: Box<[G1serde]>,
    //gamma_inv_o_inst: Box<[G1serde]>, // {γ^(-1)(L_t(y)o_j(x) + M_j(x))}_{t=0,j=0}^{1,l-1} where t=0 for j∈[0,l_in-1] and t=1 for j∈[l_in,l-1]
    let mut tau = Tau::gen();

    // Load setup parameters from JSON file
    let setup_file_name = "setupParams.json";
    let mut setup_params = SetupParams::from_path(setup_file_name).unwrap();

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
    let subcircuit_infos = SubcircuitInfo::from_path(subcircuit_file_name).unwrap();

    let qap = QAP::gen_from_R1CS(&subcircuit_infos, &setup_params);
    qap.save_to_json("setup/mpc-setup/output/qap_all.bin").expect("cannot qap save to a json file");
    let qap2 = QAP::load_from_json("setup/mpc-setup/output/qap_all.bin").unwrap();
    println!("{}", qap.compare(&qap2));
    //cargo run --release --bin prepare_phase2
}

 