#![allow(non_snake_case)]
use prove::{*};
use verify::{*};

// include!("../../setup/trusted-setup/output/combined_sigma.rs");

fn main() {
    let (mut prover, binding) = Prover::init();
    let verifier = Verifier::init();
    let proof0: Proof0 = prover.prove0();
    let thetas = proof0.verify0();
    // println!("thetas: {:?}", thetas);
    let proof1 = prover.prove1(&thetas);
    let kappa0 = proof1.verify1();
    // println!("kappa0: {:?}", kappa0);
    let proof2 = prover.prove2(&thetas, kappa0);
    let (chi, zeta) = proof2.verify2();
    // println!("chi and zeta: ({:?}, {:?})", chi, zeta);
    let proof3 = prover.prove3(chi, zeta);
    let kappa1 = proof3.verify3();
    // println!("kappa1: {:?}", kappa1);

    let (proof4, proof4_test) = prover.prove4(&proof3, &thetas, kappa0, chi, zeta, kappa1);

    #[cfg(feature = "testing-mode")]
    {
        
        let res_arith = verifier.verify_arith(&binding, &proof0, &proof1, &proof2, &proof3, &proof4_test);
        println!("Verification_arith: {:?}", res_arith);
        let res_copy = verifier.verify_copy(&binding, &proof0, &proof1, &proof2, &proof3, &proof4_test);
        println!("Verification_copy: {:?}", res_copy);
        let res_binding = verifier.verify_binding(&binding, &proof0, &proof1, &proof2, &proof3, &proof4_test);
        println!("Verification_binding: {:?}", res_binding);
    }

    #[cfg(not(feature = "testing-mode"))]
    {
        let res = verifier.verify_all(&binding, &proof0, &proof1, &proof2, &proof3, &proof4);
        println!("Verification: {:?}", res);
    }
    
}