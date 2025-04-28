use libs::group_structures::{SigmaPreprocess, Preprocess};
use libs::iotools::{Permutation, SetupParams};

fn main() {
    let setup_path = "setupParams.json";
    let setup_params = SetupParams::from_path(setup_path).unwrap();
    let sigma_path = "setup/trusted-setup/output/sigma_preprocess.json";
    let sigma = SigmaPreprocess::read_from_json(&sigma_path)
    .expect("No reference string is found. Run the Setup first.");

    // Load permutation (copy constraints of the variables)
    let permutation_path = "permutation.json";
    let permutation_raw = Permutation::from_path(&permutation_path).unwrap();
    let preprocess = Preprocess::gen(&sigma, &permutation_raw, &setup_params);
    let output_path = "verify/preprocess/output/preprocess.json";
    preprocess.write_into_json(&output_path).unwrap();
}