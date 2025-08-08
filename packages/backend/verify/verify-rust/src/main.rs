use std::time::Instant;

use icicle_runtime::Device;
use libs::utils::check_device;
use verify::Verifier;

fn main() {
    check_device();
    
    println!("Verifier initialization...");
    let mut timer = Instant::now();
    let verifier = Verifier::init();
    let mut lap = timer.elapsed();
    println!("Verifier init time: {:.6} seconds", lap.as_secs_f64());

    println!("Verifying the proof...");
    timer = Instant::now();
    let res_keccak = verifier.verify_keccak256();
    let res_snark = verifier.verify_snark();
    lap = timer.elapsed();
    println!("Verification time: {:.6} seconds", lap.as_secs_f64());
    println!("Verification result: {:?}, {:?}", res_snark, res_keccak);
}