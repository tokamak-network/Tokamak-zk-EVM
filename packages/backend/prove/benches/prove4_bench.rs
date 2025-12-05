use criterion::{criterion_group, criterion_main, Criterion};
use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarCfg, ScalarField};
use icicle_core::traits::{FieldImpl, GenerateRandom};
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::field_structures::FieldSerde;
use libs::group_structures::{G1serde, G2serde, Sigma, Sigma1, Sigma2};
use libs::iotools::SetupParams;
use prove::{Prover, Proof3, InstancePolynomials, Witness, Mixer, Quotients};
use std::time::Duration;
use std::time::Instant;
use icicle_runtime::memory::HostSlice;

mod utils;
use utils::prove4_batch::{prove4_batched, prove4_sequential};

fn mock_prover() -> Prover {
    let n = 1 << 8; // Small size for benchmark correctness. Adjust for load testing.
    let l_D = n/2;
    let l = n/4;
    let s_max = 2; // small s_max

    let setup_params = SetupParams {
        n,
        l,
        l_D,
        m_D: l_D + 10,
        l_user: 1,
        l_user_out: 1,
        l_block: 2,
        s_D: 2,
        s_max,
    };

    let make_poly = |x_size, y_size| {
        let size = x_size * y_size;
        let coeffs = vec![ScalarField::one(); size]; // Use 1 for simplicity
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), x_size, y_size)
    };

    let instance = InstancePolynomials {
        s0XY: make_poly(n, s_max),
        s1XY: make_poly(n, s_max),
        t_n: make_poly(n, 1),
        t_mi: make_poly(n, 1),
        t_smax: make_poly(1, s_max),
        a_pub_X: make_poly(n, 1),
    };

    let witness = Witness {
        bXY: make_poly(n, s_max),
        uXY: make_poly(n, s_max),
        vXY: make_poly(n, s_max),
        wXY: make_poly(n, s_max),
        rXY: make_poly(n, s_max),
    };

    let mixer = Mixer {
        rU_X: ScalarField::one(),
        rU_Y: ScalarField::one(),
        rV_X: ScalarField::one(),
        rV_Y: ScalarField::one(),
        rW_X: vec![ScalarField::one()],
        rW_Y: vec![ScalarField::one()],
        rB_X: vec![ScalarField::one()],
        rB_Y: vec![ScalarField::one()],
        rR_X: ScalarField::one(),
        rR_Y: ScalarField::one(),
        rO_mid: ScalarField::one(),
    };

    let quotients = Quotients {
        q0XY: make_poly(n, s_max),
        q1XY: make_poly(n, s_max),
        q2XY: make_poly(n, s_max),
        q3XY: make_poly(n, s_max),
        q4XY: make_poly(n, s_max),
        q5XY: make_poly(n, s_max),
        q6XY: make_poly(n, s_max),
        q7XY: make_poly(n, s_max),
    };

    // Sigma1 mocking
    // Need xy_powers large enough
    let h_max = std::cmp::max(2*n, 2*(l_D - l));
    let rs_x_size = std::cmp::max(2*n, 2*(l_D - l));
    let rs_y_size = s_max * 2;
    // We typically need size around rs_x_size * rs_y_size
    // Logic in encode_poly checks resize against target_x_size (n+1)
    
    let xy_powers_len = rs_x_size * rs_y_size * 2; // Safe margin
    let xy_powers = vec![G1serde::zero(); xy_powers_len].into_boxed_slice();

    let sigma_1 = Sigma1 {
        xy_powers,
        x: G1serde::zero(),
        y: G1serde::zero(),
        delta: G1serde::zero(),
        eta: G1serde::zero(),
        gamma_inv_o_inst: vec![].into_boxed_slice(),
        eta_inv_li_o_inter_alpha4_kj: vec![].into_boxed_slice(),
        delta_inv_li_o_prv: vec![].into_boxed_slice(),
        delta_inv_alphak_xh_tx: vec![].into_boxed_slice(),
        delta_inv_alpha4_xj_tx: vec![].into_boxed_slice(),
        delta_inv_alphak_yi_ty: vec![].into_boxed_slice(),
    };

    let sigma_2 = Sigma2 {
        alpha: G2serde(G2Affine::zero()),
        alpha2: G2serde(G2Affine::zero()),
        alpha3: G2serde(G2Affine::zero()),
        alpha4: G2serde(G2Affine::zero()),
        gamma: G2serde(G2Affine::zero()),
        delta: G2serde(G2Affine::zero()),
        eta: G2serde(G2Affine::zero()),
        x: G2serde(G2Affine::zero()),
        y: G2serde(G2Affine::zero()),
    };

    let sigma = Sigma {
        G: G1serde::zero(),
        H: G2serde(G2Affine::zero()),
        sigma_1,
        sigma_2,
        lagrange_KL: G1serde::zero(),
    };

    Prover {
        setup_params,
        sigma,
        instance,
        witness,
        mixer,
        quotients,
    }
}

pub fn bench_prove4(c: &mut Criterion) {
    println!("Initializing mock prover...");
    let prover = mock_prover();

    // Prepare inputs
    let scalars = ScalarCfg::generate_random(10);
    let chi = scalars[0];
    let zeta = scalars[1];
    let kappa0 = scalars[2];
    let kappa1 = scalars[3];
    let thetas = vec![scalars[4], scalars[5], scalars[6]];
    
    // Mock Proof3
    let proof3 = Proof3 {
        V_eval: FieldSerde(scalars[7]),
        R_eval: FieldSerde(scalars[8]),
        R_omegaX_eval: FieldSerde(scalars[9]),
        R_omegaX_omegaY_eval: FieldSerde(scalars[0]), 
    };

    println!("Verifying that batched and sequential prove4 implementations produce identical results...");
    
    // Warmup / Verification
    let (seq_proof, _) = prove4_sequential(
        &prover, &proof3, &thetas, kappa0, chi, zeta, kappa1
    );
    let (batch_proof, _) = prove4_batched(
        &prover, &proof3, &thetas, kappa0, chi, zeta, kappa1
    );

    let seq_pi_x = seq_proof.Pi_X;
    let batch_pi_x = batch_proof.Pi_X;
    let seq_str = format!("{:?}", seq_pi_x);
    let batch_str = format!("{:?}", batch_pi_x);
    
    if seq_str != batch_str {
        panic!("Verification FAILED: Batched and Sequential results DO NOT match.\nSeq: {}\nBatch: {}", seq_str, batch_str);
    } else {
         println!("✅ Verification PASSED: Batched and Sequential results match.");
    }

    // Manual Timing
    let start = Instant::now();
    prove4_batched(&prover, &proof3, &thetas, kappa0, chi, zeta, kappa1);
    println!("prove4_batched (single run) took {} ms", start.elapsed().as_millis());

    let start = Instant::now();
    prove4_sequential(&prover, &proof3, &thetas, kappa0, chi, zeta, kappa1);
    println!("prove4_sequential (single run) took {} ms", start.elapsed().as_millis());

    let mut group = c.benchmark_group("prove4 (batched vs sequential)");
    group.measurement_time(Duration::from_secs(10));
    group.sample_size(10);

    group.bench_function("prove4_batched", |b| {
        b.iter(|| prove4_batched(&prover, &proof3, &thetas, kappa0, chi, zeta, kappa1))
    });

    group.bench_function("prove4_sequential", |b| {
        b.iter(|| prove4_sequential(&prover, &proof3, &thetas, kappa0, chi, zeta, kappa1))
    });

    group.finish();
}

criterion_group!(benches, bench_prove4);
criterion_main!(benches);
