use icicle_bls12_381::curve::{ScalarCfg, ScalarField};
use icicle_core::traits::{FieldImpl, GenerateRandom};
use icicle_runtime::memory::HostSlice;

use super::vector_operations::*;
use icicle_core::vec_ops::VecOps;

// Assuming the implementation of DensePolynomialExt and BivariatePolynomial is already available
// This mod tests can be placed in a separate file

#[cfg(test)]
mod msm_vs_rayon_tests {
    use super::*;
    use crate::group_structures::G1serde;
    use crate::iotools::{from_coef_vec_to_g1serde_vec, from_coef_vec_to_g1serde_vec_msm};
    use icicle_bls12_381::curve::{CurveCfg, G1Affine, ScalarCfg, ScalarField};
    use icicle_core::curve::Curve;

    #[test]
    fn cpu_and_gpu_versions_produce_same() {
        let n = 256;
        let coef_vec: Vec<ScalarField> = ScalarCfg::generate_random(n);
        // 3) generator point
        let gen = CurveCfg::generate_random_affine_points(n)[0];

        let mut res_cpu = vec![G1serde(G1Affine::zero()); n];
        let mut res_gpu = vec![G1serde(G1Affine::zero()); n];

        from_coef_vec_to_g1serde_vec(&coef_vec, &gen, &mut res_cpu);
        from_coef_vec_to_g1serde_vec_msm(
            &Box::from(coef_vec.clone().into_boxed_slice()),
            &gen,
            &mut res_gpu,
        );

        assert_eq!(res_cpu.len(), res_gpu.len());
        for i in 0..n {
            assert_eq!(
                res_cpu[i].0, res_gpu[i].0,
                "mismatch at index {}: cpu={:?}, gpu={:?}",
                i, res_cpu[i].0, res_gpu[i].0
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use icicle_core::ntt;
    use icicle_core::traits::Arithmetic;
    use icicle_core::vec_ops::VecOpsConfig;
    use icicle_runtime::memory::{DeviceVec, HostOrDeviceSlice};
    use std::time::{Duration, Instant};
    use std::{cmp, env};

    use super::*;
    use crate::bivariate_polynomial::{
        init_ntt_domain_for_size, BivariatePolynomial, DensePolynomialExt, DivByVanishingCache,
    };
    use crate::utils::check_device;
    // Helper function: Create a simple 2D polynomial
    fn create_simple_polynomial() -> DensePolynomialExt {
        // Simple 2x2 polynomial: 1 + 2x + 3y + 4xy (coefficient matrix: [[1, 3], [2, 4]])
        let coeffs = vec![
            ScalarField::from_u32(1), // Constant term
            ScalarField::from_u32(3), // x coefficient
            ScalarField::from_u32(2), // y coefficient
            ScalarField::from_u32(4), // xy coefficient
        ];
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), 2, 2)
    }

    fn init_bi_ntt_domain(x_size: usize, y_size: usize) {
        let size = x_size
            .checked_mul(y_size)
            .expect("x_size * y_size overflow in init_bi_ntt_domain");
        init_ntt_domain_for_size(size).unwrap();
    }

    fn random_nonzero_scalar() -> ScalarField {
        let mut val = ScalarCfg::generate_random(1)[0];
        if val == ScalarField::zero() {
            val = ScalarField::one();
        }
        val
    }

    #[test]
    fn test_from_coeffs() {
        // pass
        let poly = create_simple_polynomial();
        assert_eq!(poly.x_degree, 1);
        assert_eq!(poly.y_degree, 1);
        assert_eq!(poly.x_size, 2);
        assert_eq!(poly.y_size, 2);

        // Verify coefficients
        assert_eq!(poly.get_coeff(0, 0), ScalarField::from_u32(1));
        assert_eq!(poly.get_coeff(1, 0), ScalarField::from_u32(2));
        assert_eq!(poly.get_coeff(0, 1), ScalarField::from_u32(3));
        assert_eq!(poly.get_coeff(1, 1), ScalarField::from_u32(4));
    }
    #[test]
    fn test_from_evals() {
        let x_size = 2048;
        let y_size = 1;
        init_bi_ntt_domain(x_size, y_size);
        let evals = ScalarCfg::generate_random(x_size * y_size);

        let poly = DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&evals),
            x_size,
            y_size,
            None,
            None,
        );
        let mut recoevered_evals = vec![ScalarField::zero(); x_size * y_size];
        let buff = HostSlice::from_mut_slice(&mut recoevered_evals);
        poly.to_rou_evals(None, None, buff);

        let mut flag = true;
        for i in 0..x_size * y_size {
            if !evals[i].eq(&recoevered_evals[i]) {
                flag = false;
            }
        }
        assert!(flag);
    }

    #[test]
    fn test_coset_ntt_matches_manual_scaling() {
        let x_size = 1 << 4;
        let y_size = 1 << 3;
        init_bi_ntt_domain(x_size, y_size);
        let coeffs = ScalarCfg::generate_random(x_size * y_size);
        let poly = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), x_size, y_size);
        let coset_x = random_nonzero_scalar();
        let coset_y = random_nonzero_scalar();

        let mut evals_coset = vec![ScalarField::zero(); x_size * y_size];
        poly.to_rou_evals(
            Some(&coset_x),
            Some(&coset_y),
            HostSlice::from_mut_slice(&mut evals_coset),
        );

        let mut evals_legacy = vec![ScalarField::zero(); x_size * y_size];
        let mut scaled_poly = poly.clone();
        scaled_poly = scaled_poly.scale_coeffs_x(&coset_x);
        scaled_poly = scaled_poly.scale_coeffs_y(&coset_y);
        scaled_poly.to_rou_evals(None, None, HostSlice::from_mut_slice(&mut evals_legacy));

        assert_eq!(evals_coset, evals_legacy);

        let poly_coset = DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&evals_coset),
            x_size,
            y_size,
            Some(&coset_x),
            Some(&coset_y),
        );
        let mut poly_legacy = DensePolynomialExt::from_rou_evals(
            HostSlice::from_slice(&evals_coset),
            x_size,
            y_size,
            None,
            None,
        );
        poly_legacy = poly_legacy.scale_coeffs_x(&coset_x.inv());
        poly_legacy = poly_legacy.scale_coeffs_y(&coset_y.inv());

        let mut coeffs_coset = vec![ScalarField::zero(); x_size * y_size];
        let mut coeffs_legacy = vec![ScalarField::zero(); x_size * y_size];
        poly_coset.copy_coeffs(0, HostSlice::from_mut_slice(&mut coeffs_coset));
        poly_legacy.copy_coeffs(0, HostSlice::from_mut_slice(&mut coeffs_legacy));
        assert_eq!(coeffs_coset, coeffs_legacy);
    }

    #[test]
    fn test_add() {
        // pass
        let poly1 = create_simple_polynomial();
        let poly2 = create_simple_polynomial();

        let result = &poly1 + &poly2;

        // Verify addition results
        assert_eq!(
            result.get_coeff(0, 0),
            ScalarField::from_u32(1) + ScalarField::from_u32(1)
        ); // 1+1
        assert_eq!(
            result.get_coeff(1, 0),
            ScalarField::from_u32(2) + ScalarField::from_u32(2)
        ); // 2+2
        assert_eq!(
            result.get_coeff(0, 1),
            ScalarField::from_u32(3) + ScalarField::from_u32(3)
        ); // 3+3
        assert_eq!(
            result.get_coeff(1, 1),
            ScalarField::from_u32(4) + ScalarField::from_u32(4)
        ); // 4+4
    }

    #[test]
    fn test_sub() {
        // pass
        let poly1 = create_simple_polynomial();
        // Create a polynomial with different coefficients
        let coeffs2 = vec![
            ScalarField::from_u32(5), // Constant
            ScalarField::from_u32(2), // x
            ScalarField::from_u32(1), // y
            ScalarField::from_u32(3), // xy
        ];
        let poly2 = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs2), 2, 2);

        let result = &poly1 - &poly2;

        // Verify subtraction results
        assert_eq!(
            result.get_coeff(0, 0),
            ScalarField::from_u32(1) - ScalarField::from_u32(5)
        );
        assert_eq!(
            result.get_coeff(1, 0),
            ScalarField::from_u32(2) - ScalarField::from_u32(1)
        );
        assert_eq!(
            result.get_coeff(0, 1),
            ScalarField::from_u32(3) - ScalarField::from_u32(2)
        );
        assert_eq!(
            result.get_coeff(1, 1),
            ScalarField::from_u32(4) - ScalarField::from_u32(3)
        );
    }

    #[test]
    fn test_add_mismatched_y_size() {
        let lhs_coeffs = vec![
            ScalarField::from_u32(1),
            ScalarField::from_u32(2),
            ScalarField::from_u32(3),
            ScalarField::from_u32(4),
        ];
        let rhs_coeffs = vec![
            ScalarField::from_u32(10),
            ScalarField::from_u32(20),
            ScalarField::from_u32(30),
            ScalarField::from_u32(40),
        ];
        let lhs = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&lhs_coeffs), 2, 2);
        let rhs = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rhs_coeffs), 1, 4);

        let result = &lhs + &rhs;

        assert_eq!(result.x_size, 2);
        assert_eq!(result.y_size, 4);
        assert_eq!(result.get_coeff(0, 0), ScalarField::from_u32(11));
        assert_eq!(result.get_coeff(0, 1), ScalarField::from_u32(22));
        assert_eq!(result.get_coeff(0, 2), ScalarField::from_u32(30));
        assert_eq!(result.get_coeff(0, 3), ScalarField::from_u32(40));
        assert_eq!(result.get_coeff(1, 0), ScalarField::from_u32(3));
        assert_eq!(result.get_coeff(1, 1), ScalarField::from_u32(4));
        assert_eq!(result.get_coeff(1, 2), ScalarField::zero());
        assert_eq!(result.get_coeff(1, 3), ScalarField::zero());
    }

    #[test]
    fn test_sub_mismatched_y_size() {
        let lhs_coeffs = vec![
            ScalarField::from_u32(1),
            ScalarField::from_u32(2),
            ScalarField::from_u32(3),
            ScalarField::from_u32(4),
        ];
        let rhs_coeffs = vec![
            ScalarField::from_u32(10),
            ScalarField::from_u32(20),
            ScalarField::from_u32(30),
            ScalarField::from_u32(40),
        ];
        let lhs = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&lhs_coeffs), 2, 2);
        let rhs = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rhs_coeffs), 1, 4);

        let result = &lhs - &rhs;

        assert_eq!(result.x_size, 2);
        assert_eq!(result.y_size, 4);
        assert_eq!(
            result.get_coeff(0, 0),
            ScalarField::from_u32(1) - ScalarField::from_u32(10)
        );
        assert_eq!(
            result.get_coeff(0, 1),
            ScalarField::from_u32(2) - ScalarField::from_u32(20)
        );
        assert_eq!(
            result.get_coeff(0, 2),
            ScalarField::zero() - ScalarField::from_u32(30)
        );
        assert_eq!(
            result.get_coeff(0, 3),
            ScalarField::zero() - ScalarField::from_u32(40)
        );
        assert_eq!(result.get_coeff(1, 0), ScalarField::from_u32(3));
        assert_eq!(result.get_coeff(1, 1), ScalarField::from_u32(4));
        assert_eq!(result.get_coeff(1, 2), ScalarField::zero());
        assert_eq!(result.get_coeff(1, 3), ScalarField::zero());
    }

    #[test]
    fn test_add_assign_mismatched_y_size() {
        let lhs_coeffs = vec![
            ScalarField::from_u32(1),
            ScalarField::from_u32(2),
            ScalarField::from_u32(3),
            ScalarField::from_u32(4),
        ];
        let rhs_coeffs = vec![
            ScalarField::from_u32(10),
            ScalarField::from_u32(20),
            ScalarField::from_u32(30),
            ScalarField::from_u32(40),
        ];
        let mut lhs = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&lhs_coeffs), 2, 2);
        let rhs = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rhs_coeffs), 1, 4);

        lhs += &rhs;

        assert_eq!(lhs.x_size, 2);
        assert_eq!(lhs.y_size, 4);
        assert_eq!(lhs.get_coeff(0, 0), ScalarField::from_u32(11));
        assert_eq!(lhs.get_coeff(0, 1), ScalarField::from_u32(22));
        assert_eq!(lhs.get_coeff(0, 2), ScalarField::from_u32(30));
        assert_eq!(lhs.get_coeff(0, 3), ScalarField::from_u32(40));
        assert_eq!(lhs.get_coeff(1, 0), ScalarField::from_u32(3));
        assert_eq!(lhs.get_coeff(1, 1), ScalarField::from_u32(4));
        assert_eq!(lhs.get_coeff(1, 2), ScalarField::zero());
        assert_eq!(lhs.get_coeff(1, 3), ScalarField::zero());
    }

    #[test]
    fn test_add_mismatched_x_size_same_y_size() {
        let lhs_coeffs = vec![
            ScalarField::from_u32(1),
            ScalarField::from_u32(2),
            ScalarField::from_u32(3),
            ScalarField::from_u32(4),
        ];
        let rhs_coeffs = vec![ScalarField::from_u32(10), ScalarField::from_u32(20)];
        let lhs = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&lhs_coeffs), 2, 2);
        let rhs = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rhs_coeffs), 1, 2);

        let result = &lhs + &rhs;

        assert_eq!(result.x_size, 2);
        assert_eq!(result.y_size, 2);
        assert_eq!(result.get_coeff(0, 0), ScalarField::from_u32(11));
        assert_eq!(result.get_coeff(0, 1), ScalarField::from_u32(22));
        assert_eq!(result.get_coeff(1, 0), ScalarField::from_u32(3));
        assert_eq!(result.get_coeff(1, 1), ScalarField::from_u32(4));
    }

    #[test]
    fn test_add_same_x_size_mismatched_y_size() {
        let lhs_coeffs = vec![
            ScalarField::from_u32(1),
            ScalarField::from_u32(2),
            ScalarField::from_u32(3),
            ScalarField::from_u32(4),
        ];
        let rhs_coeffs = vec![
            ScalarField::from_u32(10),
            ScalarField::from_u32(20),
            ScalarField::from_u32(30),
            ScalarField::from_u32(40),
            ScalarField::from_u32(50),
            ScalarField::from_u32(60),
            ScalarField::from_u32(70),
            ScalarField::from_u32(80),
        ];
        let lhs = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&lhs_coeffs), 2, 2);
        let rhs = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&rhs_coeffs), 2, 4);

        let result = &lhs + &rhs;

        assert_eq!(result.x_size, 2);
        assert_eq!(result.y_size, 4);
        assert_eq!(result.get_coeff(0, 0), ScalarField::from_u32(11));
        assert_eq!(result.get_coeff(0, 1), ScalarField::from_u32(22));
        assert_eq!(result.get_coeff(0, 2), ScalarField::from_u32(30));
        assert_eq!(result.get_coeff(0, 3), ScalarField::from_u32(40));
        assert_eq!(result.get_coeff(1, 0), ScalarField::from_u32(53));
        assert_eq!(result.get_coeff(1, 1), ScalarField::from_u32(64));
        assert_eq!(result.get_coeff(1, 2), ScalarField::from_u32(70));
        assert_eq!(result.get_coeff(1, 3), ScalarField::from_u32(80));
    }

    fn patterned_poly(x_size: usize, y_size: usize, seed: u32) -> DensePolynomialExt {
        let coeffs = (0..x_size)
            .flat_map(|x| {
                (0..y_size)
                    .map(move |y| ScalarField::from_u32(seed + (x as u32) * 97 + (y as u32) * 13))
            })
            .collect::<Vec<_>>();
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), x_size, y_size)
    }

    fn expected_add_sub_coeff(
        lhs: &DensePolynomialExt,
        rhs: &DensePolynomialExt,
        x: usize,
        y: usize,
        add: bool,
    ) -> ScalarField {
        let lhs_coeff = if x < lhs.x_size && y < lhs.y_size {
            lhs.get_coeff(x as u64, y as u64)
        } else {
            ScalarField::zero()
        };
        let rhs_coeff = if x < rhs.x_size && y < rhs.y_size {
            rhs.get_coeff(x as u64, y as u64)
        } else {
            ScalarField::zero()
        };
        if add {
            lhs_coeff + rhs_coeff
        } else {
            lhs_coeff - rhs_coeff
        }
    }

    fn find_add_sub_coeff_reference_mismatch(
        label: &str,
        lhs: &DensePolynomialExt,
        rhs: &DensePolynomialExt,
        add: bool,
        result: &DensePolynomialExt,
    ) -> Option<String> {
        let target_x = cmp::max(lhs.x_size, rhs.x_size);
        let target_y = cmp::max(lhs.y_size, rhs.y_size);
        if (result.x_size, result.y_size) != (target_x, target_y) {
            return Some(format!(
                "{label}: unexpected result shape lhs={}x{} rhs={}x{} result={}x{} expected={}x{}",
                lhs.x_size,
                lhs.y_size,
                rhs.x_size,
                rhs.y_size,
                result.x_size,
                result.y_size,
                target_x,
                target_y
            ));
        }
        for x in 0..target_x {
            for y in 0..target_y {
                let expected = expected_add_sub_coeff(lhs, rhs, x, y, add);
                let actual = result.get_coeff(x as u64, y as u64);
                if actual != expected {
                    return Some(format!(
                        "{label}: mismatch at ({x}, {y}) lhs={}x{} rhs={}x{} result={}x{}",
                        lhs.x_size,
                        lhs.y_size,
                        rhs.x_size,
                        rhs.y_size,
                        result.x_size,
                        result.y_size
                    ));
                }
            }
        }
        None
    }

    #[test]
    #[ignore = "diagnostic for the DPE add/sub fast path correctness bug"]
    fn test_add_sub_fast_path_shape_sweep_against_coeff_reference() {
        let shapes = [
            (1, 1),
            (1, 2),
            (1, 4),
            (2, 1),
            (2, 2),
            (2, 4),
            (4, 1),
            (4, 2),
            (4, 4),
            (8, 1),
            (8, 2),
            (8, 4),
        ];

        let mut all_failures = Vec::new();
        for (case_idx, &(lhs_x, lhs_y)) in shapes.iter().enumerate() {
            for &(rhs_x, rhs_y) in &shapes {
                if lhs_x == rhs_x && lhs_y == rhs_y {
                    continue;
                }
                let lhs = patterned_poly(lhs_x, lhs_y, 10_000 + case_idx as u32);
                let rhs = patterned_poly(rhs_x, rhs_y, 20_000 + rhs_x as u32 * 11 + rhs_y as u32);

                let mut failures = Vec::new();

                let add_result = &lhs + &rhs;
                if let Some(failure) =
                    find_add_sub_coeff_reference_mismatch("add", &lhs, &rhs, true, &add_result)
                {
                    failures.push(failure);
                }
                let sub_result = &lhs - &rhs;
                if let Some(failure) =
                    find_add_sub_coeff_reference_mismatch("sub", &lhs, &rhs, false, &sub_result)
                {
                    failures.push(failure);
                }

                let mut add_assign_result = lhs.clone();
                add_assign_result += &rhs;
                if let Some(failure) = find_add_sub_coeff_reference_mismatch(
                    "add_assign",
                    &lhs,
                    &rhs,
                    true,
                    &add_assign_result,
                ) {
                    failures.push(failure);
                }

                if !failures.is_empty() {
                    all_failures.extend(failures);
                }
            }
        }
        if !all_failures.is_empty() {
            panic!(
                "{} failures:\n{}",
                all_failures.len(),
                all_failures
                    .iter()
                    .take(40)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join("\n")
            );
        }
    }

    fn bench_env_usize(name: &str, default: usize) -> usize {
        env::var(name)
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(default)
    }

    fn bench_poly(x_size: usize, y_size: usize) -> DensePolynomialExt {
        let coeffs = ScalarCfg::generate_random(x_size * y_size);
        DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), x_size, y_size)
    }

    fn percentile(sorted: &[Duration], numerator: usize, denominator: usize) -> Duration {
        let idx = sorted.len().saturating_sub(1).saturating_mul(numerator) / denominator;
        sorted[idx]
    }

    fn print_bench_stats(label: &str, samples: &[Duration]) {
        let mut sorted = samples.to_vec();
        sorted.sort();
        let total: Duration = sorted.iter().copied().sum();
        let mean = total.as_secs_f64() / sorted.len() as f64;
        let min = sorted[0].as_secs_f64();
        let median = percentile(&sorted, 1, 2).as_secs_f64();
        let p95 = percentile(&sorted, 95, 100).as_secs_f64();
        let max = sorted[sorted.len() - 1].as_secs_f64();

        println!(
            "DPE_ADD_PATH_BENCH label={} samples={} mean_s={:.9} median_s={:.9} p95_s={:.9} min_s={:.9} max_s={:.9}",
            label,
            sorted.len(),
            mean,
            median,
            p95,
            min,
            max
        );
    }

    fn measure_binary_op<F>(label: &str, samples: usize, warmup: usize, mut op: F)
    where
        F: FnMut() -> DensePolynomialExt,
    {
        for _ in 0..warmup {
            let result = op();
            std::hint::black_box((result.x_size, result.y_size));
        }

        let mut durations = Vec::with_capacity(samples);
        for _ in 0..samples {
            let start = Instant::now();
            let result = op();
            let elapsed = start.elapsed();
            std::hint::black_box((result.x_size, result.y_size));
            durations.push(elapsed);
        }

        print_bench_stats(label, &durations);
    }

    #[test]
    #[ignore]
    fn bench_add_sub_no_resize_paths() {
        let device = check_device();
        let samples = bench_env_usize("DPE_ADD_PATH_BENCH_SAMPLES", 120);
        let warmup = bench_env_usize("DPE_ADD_PATH_BENCH_WARMUP", 20);
        let lhs_x = bench_env_usize("DPE_ADD_PATH_BENCH_LHS_X", 4096);
        let lhs_y = bench_env_usize("DPE_ADD_PATH_BENCH_LHS_Y", 256);
        let same_y_rhs_x = bench_env_usize("DPE_ADD_PATH_BENCH_SAME_Y_RHS_X", lhs_x / 2);
        let x_same_y_mismatch_rhs_x =
            bench_env_usize("DPE_ADD_PATH_BENCH_X_SAME_Y_MISMATCH_RHS_X", lhs_x);
        let x_same_y_mismatch_rhs_y =
            bench_env_usize("DPE_ADD_PATH_BENCH_X_SAME_Y_MISMATCH_RHS_Y", lhs_y / 2);
        let both_mismatch_rhs_x =
            bench_env_usize("DPE_ADD_PATH_BENCH_BOTH_MISMATCH_RHS_X", lhs_x / 2);
        let both_mismatch_rhs_y =
            bench_env_usize("DPE_ADD_PATH_BENCH_BOTH_MISMATCH_RHS_Y", lhs_y / 2);

        println!(
            "DPE_ADD_PATH_BENCH_CONFIG device={} samples={} warmup={} lhs={}x{} same_y_rhs={}x{} x_same_y_mismatch_rhs={}x{} both_mismatch_rhs={}x{}",
            device,
            samples,
            warmup,
            lhs_x,
            lhs_y,
            same_y_rhs_x,
            lhs_y,
            x_same_y_mismatch_rhs_x,
            x_same_y_mismatch_rhs_y,
            both_mismatch_rhs_x,
            both_mismatch_rhs_y
        );

        let lhs = bench_poly(lhs_x, lhs_y);
        let same_y_rhs = bench_poly(same_y_rhs_x, lhs_y);
        let x_same_y_mismatch_rhs = bench_poly(x_same_y_mismatch_rhs_x, x_same_y_mismatch_rhs_y);
        let both_mismatch_rhs = bench_poly(both_mismatch_rhs_x, both_mismatch_rhs_y);

        measure_binary_op("same_y_add", samples, warmup, || &lhs + &same_y_rhs);
        measure_binary_op("same_y_sub", samples, warmup, || &lhs - &same_y_rhs);
        measure_binary_op("x_same_y_mismatch_add", samples, warmup, || {
            &lhs + &x_same_y_mismatch_rhs
        });
        measure_binary_op("x_same_y_mismatch_sub", samples, warmup, || {
            &lhs - &x_same_y_mismatch_rhs
        });
        measure_binary_op("both_mismatch_add", samples, warmup, || {
            &lhs + &both_mismatch_rhs
        });
        measure_binary_op("both_mismatch_sub", samples, warmup, || {
            &lhs - &both_mismatch_rhs
        });
    }

    fn bintt_transpose_device(
        input: &DeviceVec<ScalarField>,
        x_size: usize,
        y_size: usize,
        dir: ntt::NTTDir,
        coset_x: Option<&ScalarField>,
        coset_y: Option<&ScalarField>,
    ) -> DeviceVec<ScalarField> {
        let size = x_size * y_size;
        let mut cfg = ntt::NTTConfig::<ScalarField>::default();
        let vec_ops_cfg = VecOpsConfig::default();

        let mut out_y = DeviceVec::<ScalarField>::device_malloc(size).unwrap();
        cfg.batch_size = x_size as i32;
        cfg.columns_batch = false;
        cfg.coset_gen = coset_y.copied().unwrap_or(ScalarField::one());
        ntt::ntt(input, dir, &cfg, &mut out_y).unwrap();

        let mut out_y_tr = DeviceVec::<ScalarField>::device_malloc(size).unwrap();
        ScalarCfg::transpose(
            &out_y,
            x_size as u32,
            y_size as u32,
            &mut out_y_tr,
            &vec_ops_cfg,
        )
        .unwrap();

        cfg.batch_size = y_size as i32;
        cfg.columns_batch = false;
        cfg.coset_gen = coset_x.copied().unwrap_or(ScalarField::one());
        let mut out_x_tr = DeviceVec::<ScalarField>::device_malloc(size).unwrap();
        ntt::ntt(&out_y_tr, dir, &cfg, &mut out_x_tr).unwrap();

        let mut out = DeviceVec::<ScalarField>::device_malloc(size).unwrap();
        ScalarCfg::transpose(
            &out_x_tr,
            y_size as u32,
            x_size as u32,
            &mut out,
            &vec_ops_cfg,
        )
        .unwrap();
        out
    }

    fn bintt_column_batch_device(
        input: &DeviceVec<ScalarField>,
        x_size: usize,
        y_size: usize,
        dir: ntt::NTTDir,
        coset_x: Option<&ScalarField>,
        coset_y: Option<&ScalarField>,
    ) -> DeviceVec<ScalarField> {
        let size = x_size * y_size;
        let mut cfg = ntt::NTTConfig::<ScalarField>::default();

        let mut out_y = DeviceVec::<ScalarField>::device_malloc(size).unwrap();
        cfg.batch_size = x_size as i32;
        cfg.columns_batch = false;
        cfg.coset_gen = coset_y.copied().unwrap_or(ScalarField::one());
        ntt::ntt(input, dir, &cfg, &mut out_y).unwrap();

        let mut out = DeviceVec::<ScalarField>::device_malloc(size).unwrap();
        cfg.batch_size = y_size as i32;
        cfg.columns_batch = true;
        cfg.coset_gen = coset_x.copied().unwrap_or(ScalarField::one());
        ntt::ntt(&out_y, dir, &cfg, &mut out).unwrap();
        out
    }

    fn device_vec_from_host(values: &[ScalarField]) -> DeviceVec<ScalarField> {
        let mut out = DeviceVec::<ScalarField>::device_malloc(values.len()).unwrap();
        out.copy_from_host(HostSlice::from_slice(values)).unwrap();
        out
    }

    fn device_vec_to_host(values: &DeviceVec<ScalarField>) -> Vec<ScalarField> {
        let mut out = vec![ScalarField::zero(); values.len()];
        values
            .copy_to_host(HostSlice::from_mut_slice(&mut out))
            .unwrap();
        out
    }

    fn count_mismatches(lhs: &[ScalarField], rhs: &[ScalarField]) -> usize {
        lhs.iter().zip(rhs.iter()).filter(|(a, b)| *a != *b).count()
    }

    #[test]
    #[ignore]
    fn bench_bintt_column_batch_candidate() {
        let device = check_device();
        let samples = bench_env_usize("DPE_BINTT_COLUMN_BATCH_SAMPLES", 60);
        let warmup = bench_env_usize("DPE_BINTT_COLUMN_BATCH_WARMUP", 10);
        let bench_x = bench_env_usize("DPE_BINTT_COLUMN_BATCH_X", 4096);
        let bench_y = bench_env_usize("DPE_BINTT_COLUMN_BATCH_Y", 256);

        for (x_size, y_size) in [(16usize, 8usize), (64usize, 32usize), (bench_x, bench_y)] {
            init_bi_ntt_domain(x_size, y_size);
            let input = ScalarCfg::generate_random(x_size * y_size);
            let input_device = device_vec_from_host(&input);
            let coset_x = random_nonzero_scalar();
            let coset_y = random_nonzero_scalar();

            for (label, cx, cy) in [
                ("plain", None, None),
                ("coset", Some(&coset_x), Some(&coset_y)),
            ] {
                for (dir_label, dir) in [
                    ("forward", ntt::NTTDir::kForward),
                    ("inverse", ntt::NTTDir::kInverse),
                ] {
                    let reference =
                        bintt_transpose_device(&input_device, x_size, y_size, dir, cx, cy);
                    let candidate =
                        bintt_column_batch_device(&input_device, x_size, y_size, dir, cx, cy);
                    let reference_host = device_vec_to_host(&reference);
                    let candidate_host = device_vec_to_host(&candidate);
                    let mismatches = count_mismatches(&reference_host, &candidate_host);
                    println!(
                        "BINTT_COLUMN_BATCH_CHECK device={} shape={}x{} mode={} dir={} mismatches={}",
                        device, x_size, y_size, label, dir_label, mismatches
                    );
                    assert_eq!(mismatches, 0);
                }
            }
        }

        init_bi_ntt_domain(bench_x, bench_y);
        let input = ScalarCfg::generate_random(bench_x * bench_y);
        let input_device = device_vec_from_host(&input);

        let mut transpose_samples = Vec::with_capacity(samples);
        let mut column_batch_samples = Vec::with_capacity(samples);

        for _ in 0..warmup {
            let out = bintt_transpose_device(
                &input_device,
                bench_x,
                bench_y,
                ntt::NTTDir::kForward,
                None,
                None,
            );
            std::hint::black_box(out.len());
            let out = bintt_column_batch_device(
                &input_device,
                bench_x,
                bench_y,
                ntt::NTTDir::kForward,
                None,
                None,
            );
            std::hint::black_box(out.len());
        }

        for _ in 0..samples {
            let start = Instant::now();
            let out = bintt_transpose_device(
                &input_device,
                bench_x,
                bench_y,
                ntt::NTTDir::kForward,
                None,
                None,
            );
            std::hint::black_box(out.len());
            transpose_samples.push(start.elapsed());

            let start = Instant::now();
            let out = bintt_column_batch_device(
                &input_device,
                bench_x,
                bench_y,
                ntt::NTTDir::kForward,
                None,
                None,
            );
            std::hint::black_box(out.len());
            column_batch_samples.push(start.elapsed());
        }

        println!(
            "BINTT_COLUMN_BATCH_CONFIG device={} samples={} warmup={} bench_shape={}x{}",
            device, samples, warmup, bench_x, bench_y
        );
        print_bench_stats("bintt_transpose_forward", &transpose_samples);
        print_bench_stats("bintt_column_batch_forward", &column_batch_samples);
    }

    #[test]
    fn test_mul_scalar() {
        // pass
        let x_size = 2usize.pow(10);
        let y_size = 2usize.pow(5);
        let poly = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&ScalarCfg::generate_random(x_size * y_size)),
            x_size,
            y_size,
        );
        let scalar = ScalarCfg::generate_random(1)[0];

        let result1 = &poly * &scalar;
        let result2 = &scalar * &poly;

        // Verify scalar multiplication results
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];
        assert_eq!(result1.eval(&x, &y), poly.eval(&x, &y) * scalar);
        assert_eq!(result1.eval(&x, &y), result2.eval(&x, &y));
    }

    #[test]
    fn test_sub_scalar() {
        // pass
        let x_size = 2usize.pow(10);
        let y_size = 2usize.pow(5);
        let poly = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&ScalarCfg::generate_random(x_size * y_size)),
            x_size,
            y_size,
        );
        let scalar = ScalarCfg::generate_random(1)[0];
        let result1 = &poly - &scalar;
        let result2 = &scalar - &poly;

        // Verify scalar multiplication results
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];
        assert_eq!(result1.eval(&x, &y), poly.eval(&x, &y) - scalar);
        assert_eq!(result2.eval(&x, &y), scalar - poly.eval(&x, &y));
    }

    #[test]
    fn test_add_scalar() {
        // pass
        let x_size = 2usize.pow(10);
        let y_size = 2usize.pow(5);
        let poly = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&ScalarCfg::generate_random(x_size * y_size)),
            x_size,
            y_size,
        );
        let scalar = ScalarCfg::generate_random(1)[0];
        let result1 = &poly + &scalar;
        let result2 = &scalar + &poly;

        // Verify scalar multiplication results
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];
        assert_eq!(result1.eval(&x, &y), poly.eval(&x, &y) + scalar);
        assert_eq!(result1.eval(&x, &y), result2.eval(&x, &y));
    }

    #[test]
    fn test_neg() {
        // pass
        let poly = create_simple_polynomial();
        let result = -&poly;

        // Verify negation results
        assert_eq!(
            result.get_coeff(0, 0),
            ScalarField::from_u32(0) - ScalarField::from_u32(1)
        );
        assert_eq!(
            result.get_coeff(1, 0),
            ScalarField::from_u32(0) - ScalarField::from_u32(2)
        );
        assert_eq!(
            result.get_coeff(0, 1),
            ScalarField::from_u32(0) - ScalarField::from_u32(3)
        );
        assert_eq!(
            result.get_coeff(1, 1),
            ScalarField::from_u32(0) - ScalarField::from_u32(4)
        );
    }

    #[test]
    fn test_get_univariate_polynomial() {
        // pass
        // Create a polynomial with predictable coefficients
        let mut coeffs = vec![ScalarField::from_u32(0); 16];
        for y in 0..4 {
            for x in 0..4 {
                let idx = y * 4 + x;
                coeffs[idx] = ScalarField::from_u32((x + y) as u32);
            }
        }
        let poly = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), 4, 4);

        // Extract univariate polynomial in x at y = 2
        let x_poly = poly.get_univariate_polynomial_x(2);
        assert_eq!(x_poly.y_size, 1);
        assert_eq!(x_poly.x_size, 4);
        // Check coefficients: at y = 2, the coefficients should be [2, 3, 4, 5]
        for i in 0..4 {
            assert_eq!(
                x_poly.get_coeff(i, 0),
                ScalarField::from_u32((i + 2) as u32)
            );
        }

        // Extract univariate polynomial in y at x = 1
        let y_poly = poly.get_univariate_polynomial_y(1);
        assert_eq!(y_poly.x_size, 1);
        assert_eq!(y_poly.y_size, 4);
        // Check coefficients: at x = 1, the coefficients should be [1, 2, 3, 4]
        for i in 0..4 {
            assert_eq!(
                y_poly.get_coeff(0, i),
                ScalarField::from_u32((1 + i) as u32)
            );
        }
    }

    #[test]
    fn test_eval() {
        // pass
        let poly = create_simple_polynomial();
        let x = ScalarField::from_u32(2);
        let y = ScalarField::from_u32(3);

        // 1 + 2x + 3y + 4xy = 1 + 2*2 + 3*3 + 4*2*3 = 1 + 4 + 9 + 24 = 38
        let expected = ScalarField::from_u32(38);
        let result = poly.eval(&x, &y);

        assert_eq!(result, expected);
    }

    #[test]
    fn test_eval_x() {
        // pass
        let poly = create_simple_polynomial();
        let x = ScalarField::from_u32(2);

        // Polynomial (1 + 2x + 3y + 4xy) with x=2 becomes: (1 + 4) + (3 + 8)y = 5 + 11y
        let result = poly.eval_x(&x);

        assert_eq!(result.x_size, 1);
        assert_eq!(result.y_size, 2);

        // Verify coefficients
        assert_eq!(result.get_coeff(0, 0), ScalarField::from_u32(5)); // Constant: 1 + 2*2
        assert_eq!(result.get_coeff(0, 1), ScalarField::from_u32(11)); // y coeff: 3 + 4*2
    }

    #[test]
    fn test_eval_y() {
        // pass
        let poly = create_simple_polynomial();
        let y = ScalarField::from_u32(3);

        // Polynomial (1 + 2x + 3y + 4xy) with y=3 becomes: (1 + 9) + (2 + 12)x = 10 + 14x
        let result = poly.eval_y(&y);

        assert_eq!(result.x_size, 2);
        assert_eq!(result.y_size, 1);

        // Verify coefficients
        assert_eq!(result.get_coeff(0, 0), ScalarField::from_u32(10)); // Constant: 1 + 3*3
        assert_eq!(result.get_coeff(1, 0), ScalarField::from_u32(14)); // x coeff: 2 + 4*3
    }

    #[test]
    fn test_resize() {
        // pass
        let mut poly = create_simple_polynomial();

        // Resize to 4x4
        poly.resize(4, 4);

        // Verify size
        assert_eq!(poly.x_size, 4);
        assert_eq!(poly.y_size, 4);

        // Verify original coefficients are preserved
        assert_eq!(poly.get_coeff(0, 0), ScalarField::from_u32(1));
        assert_eq!(poly.get_coeff(1, 0), ScalarField::from_u32(2));
        assert_eq!(poly.get_coeff(0, 1), ScalarField::from_u32(3));
        assert_eq!(poly.get_coeff(1, 1), ScalarField::from_u32(4));

        // New parts are filled with zeros
        assert_eq!(poly.get_coeff(2, 0), ScalarField::from_u32(0));
        assert_eq!(poly.get_coeff(0, 2), ScalarField::from_u32(0));
        assert_eq!(poly.get_coeff(3, 3), ScalarField::from_u32(0));
    }

    #[test]
    fn test_optimize_size() {
        // pass
        // Create a larger polynomial (4x4) but with only 2x2 actually used
        let mut coeffs = vec![ScalarField::from_u32(0); 16];
        for y in 0..2 {
            for x in 0..2 {
                let idx = y * 4 + x;
                coeffs[idx] = ScalarField::from_u32(1); // Set non-zero values only in 2x2 submatrix
            }
        }

        let mut poly = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), 4, 4);
        // Manually adjust the degree to reflect the actual non-zero terms
        poly.x_degree = 1;
        poly.y_degree = 1;

        // Optimize size
        poly.optimize_size();

        // Size should be 2x2 (or the next power of 2 that can contain 2x2)
        assert!(poly.x_size <= 2);
        assert!(poly.y_size <= 2);
    }

    #[test]
    fn test_div_by_ruffini() {
        let x_size = 2usize.pow(10);
        let y_size = 2usize.pow(5);
        let p_coeffs_vec = ScalarCfg::generate_random(x_size * y_size);
        let p =
            DensePolynomialExt::from_coeffs(HostSlice::from_slice(&p_coeffs_vec), x_size, y_size);
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];

        let (q_x, q_y, r) = p.div_by_ruffini(&x, &y);
        let a = ScalarCfg::generate_random(1)[0];
        let b = ScalarCfg::generate_random(1)[0];
        let q_x_eval = q_x.eval(&a, &b);
        let q_y_eval = q_y.eval(&a, &b);
        let estimated_p_eval = (q_x_eval * (a - x)) + (q_y_eval * (b - y)) + r;
        let true_p_eval = p.eval(&a, &b);
        assert!(estimated_p_eval.eq(&true_p_eval));
    }

    #[test]
    fn test_divide_x() {
        let x_size = 2usize.pow(10);
        let y_size = 2usize.pow(5);
        let p_coeffs_vec = ScalarCfg::generate_random(x_size * y_size);
        let p =
            DensePolynomialExt::from_coeffs(HostSlice::from_slice(&p_coeffs_vec), x_size, y_size);

        let denom_x_size = 2usize.pow(6);
        let denom_y_size = 1;
        let denom_coeffs_vec = ScalarCfg::generate_random(denom_x_size * denom_y_size);
        let denom = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&denom_coeffs_vec),
            denom_x_size,
            denom_y_size,
        );

        let (q, r) = p.divide_x(&denom);
        let a = ScalarCfg::generate_random(1)[0];
        let b = ScalarCfg::generate_random(1)[0];
        let denom_eval = denom.eval(&a, &b);
        let q_eval = q.eval(&a, &b);
        let r_eval = r.eval(&a, &b);
        let estimated_p_eval = (q_eval * denom_eval) + r_eval;
        let true_p_eval = p.eval(&a, &b);
        assert!(estimated_p_eval.eq(&true_p_eval));
    }

    #[test]
    fn test_divide_y() {
        let x_size = 2usize.pow(5);
        let y_size = 2usize.pow(10);
        let p_coeffs_vec = ScalarCfg::generate_random(x_size * y_size);
        let p =
            DensePolynomialExt::from_coeffs(HostSlice::from_slice(&p_coeffs_vec), x_size, y_size);

        let denom_y_size = 2usize.pow(6);
        let denom_x_size = 1;
        let denom_coeffs_vec = ScalarCfg::generate_random(denom_x_size * denom_y_size);
        let denom = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&denom_coeffs_vec),
            denom_x_size,
            denom_y_size,
        );

        let (q, r) = p.divide_y(&denom);
        let a = ScalarCfg::generate_random(1)[0];
        let b = ScalarCfg::generate_random(1)[0];
        let denom_eval = denom.eval(&a, &b);
        let q_eval = q.eval(&a, &b);
        let r_eval = r.eval(&a, &b);
        let estimated_p_eval = (q_eval * denom_eval) + r_eval;
        let true_p_eval = p.eval(&a, &b);
        assert!(estimated_p_eval.eq(&true_p_eval));
    }

    #[test]
    fn test_mul_monomial() {
        // Create a simple 2x2 polynomial: 1 + 2x + 3y + 4xy
        let coeffs = vec![
            ScalarField::from_u32(1), // Constant
            ScalarField::from_u32(3), // x
            ScalarField::from_u32(2), // y
            ScalarField::from_u32(4), // xy
        ];
        let poly = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), 2, 2);

        // Multiply by xy (shift each term by x^1 * y^1)
        let result = poly.mul_monomial(1, 1);

        // Verify result dimensions are powers of two
        assert_eq!(result.x_size.is_power_of_two(), true);
        assert_eq!(result.y_size.is_power_of_two(), true);

        // In the implemented code, the degrees are calculated as size-1, so we test against that
        assert_eq!(result.x_degree, result.x_size as i64 - 1);
        assert_eq!(result.y_degree, result.y_size as i64 - 1);

        // Original: 1 + 2x + 3y + 4xy
        // After multiplying by xy: xy + 2x^2y + 3xy^2 + 4x^2y^2
        assert_eq!(result.get_coeff(0, 0), ScalarField::from_u32(0)); // No constant term
        assert_eq!(result.get_coeff(1, 1), ScalarField::from_u32(1)); // xy coefficient
        assert_eq!(result.get_coeff(2, 1), ScalarField::from_u32(2)); // x^2y coefficient
        assert_eq!(result.get_coeff(1, 2), ScalarField::from_u32(3)); // xy^2 coefficient
        assert_eq!(result.get_coeff(2, 2), ScalarField::from_u32(4)); // x^2y^2 coefficient
    }

    #[test]
    fn test_mul_polynomial() {
        let m = 11;
        let n = 8;
        let p1_x_size = 2usize.pow(m);
        let p1_y_size = 2usize.pow(n);
        let p2_x_size = 2usize.pow(m);
        let p2_y_size = 2usize.pow(n);

        let p1_coeffs_vec = ScalarCfg::generate_random(p1_x_size * p1_y_size);
        let p2_coeffs_vec = ScalarCfg::generate_random(p2_x_size * p2_y_size);
        let p1 = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&p1_coeffs_vec),
            p1_x_size,
            p1_y_size,
        );
        let p2 = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&p2_coeffs_vec),
            p2_x_size,
            p2_y_size,
        );

        let p3 = &p1 * &p2;

        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];

        let p1_eval = p1.eval(&x, &y);
        let p2_eval = p2.eval(&x, &y);
        let p3_eval = p3.eval(&x, &y);

        assert!(p3_eval.eq(&(p1_eval * p2_eval)));

        let omega_x = ntt::get_root_of_unity::<ScalarField>(2u64.pow(m));
        let omega_y = ntt::get_root_of_unity::<ScalarField>(2u64.pow(n));
        let mut flag = true;
        for i in 0..2usize.pow(m) {
            for j in 0..2usize.pow(n) {
                let x = omega_x.pow(i);
                let y = omega_y.pow(j);
                if !p3.eval(&x, &y).eq(&(p1.eval(&x, &y) * p2.eval(&x, &y))) {
                    flag = false;
                }
            }
        }
        assert!(flag);
    }

    fn run_div_by_vanishing_basic(p_x_size: usize, p_y_size: usize, c: usize, d: usize) {
        if p_x_size % c != 0 || p_y_size % d != 0 {
            panic!("p_x_size and p_y_size must be divisible by c and d.");
        }
        let m = p_x_size / c;
        let n = p_y_size / d;
        let mut t_x_coeffs = vec![ScalarField::zero(); 2 * c];
        let mut t_y_coeffs = vec![ScalarField::zero(); 2 * d];
        t_x_coeffs[c] = ScalarField::one();
        t_x_coeffs[0] = ScalarField::zero() - ScalarField::one();
        t_y_coeffs[d] = ScalarField::one();
        t_y_coeffs[0] = ScalarField::zero() - ScalarField::one();
        let mut t_x = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_x_coeffs), 2 * c, 1);
        let mut t_y = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_y_coeffs), 1, 2 * d);
        t_x.optimize_size();
        t_y.optimize_size();
        println!("t_x_xdeg: {:?}", t_x.x_degree);
        println!("t_y_ydeg: {:?}", t_y.y_degree);

        let q_x_coeffs_opt = ScalarCfg::generate_random(((m - 1) * c - 2) * (n * d - 2));
        let q_y_coeffs_opt = ScalarCfg::generate_random((c - 1) * ((n - 1) * d - 2));
        let q_x_coeffs = resize(
            &q_x_coeffs_opt.into_boxed_slice(),
            (m - 1) * c - 2,
            n * d - 2,
            (m - 1) * c,
            n * d,
            ScalarField::zero(),
        );
        let q_y_coeffs = resize(
            &q_y_coeffs_opt.into_boxed_slice(),
            c - 1,
            (n - 1) * d - 2,
            c,
            (n - 1) * d,
            ScalarField::zero(),
        );
        let mut q_x =
            DensePolynomialExt::from_coeffs(HostSlice::from_slice(&q_x_coeffs), (m - 1) * c, n * d);
        let mut q_y =
            DensePolynomialExt::from_coeffs(HostSlice::from_slice(&q_y_coeffs), c, (n - 1) * d);
        q_x.optimize_size();
        q_y.optimize_size();
        let mut p = &(&q_x * &t_x) + &(&q_y * &t_y);
        p.optimize_size();
        println!("p_xsize: {:?}", p.x_size);
        println!("p_ysize: {:?}", p.y_size);

        let mut cache = DivByVanishingCache {
            denom_x_eval_inv: Box::new([]),
            denom_y_eval_inv: Box::new([]),
            denom_x_axis_inv: Box::new([]),
            denom_y_axis_inv: Box::new([]),
        };
        let (mut q_x_found, mut q_y_found) = p.div_by_vanishing(c as i64, d as i64, &mut cache);
        q_x_found.optimize_size();
        q_y_found.optimize_size();
        let p_reconstruct = &(&q_x_found * &t_x) + &(&q_y_found * &t_y);

        let a = ScalarCfg::generate_random(1)[0];
        let b = ScalarCfg::generate_random(1)[0];

        let p_evaled = p.eval(&a, &b);
        let p_reconstruct_evaled = p_reconstruct.eval(&a, &b);
        assert!(p_evaled.eq(&p_reconstruct_evaled));
        assert_eq!(q_x.x_degree, q_x_found.x_degree);
        assert_eq!(q_x.y_degree, q_x_found.y_degree);
        assert_eq!(q_y.x_degree, q_y_found.x_degree);
        assert_eq!(q_y.y_degree, q_y_found.y_degree);
        println!("Case m={} and n={} passed", m, n);
    }

    fn make_vanishing_instance(
        p_x_size: usize,
        p_y_size: usize,
        c: usize,
        d: usize,
    ) -> (DensePolynomialExt, DensePolynomialExt, DensePolynomialExt) {
        if p_x_size % c != 0 || p_y_size % d != 0 {
            panic!("p_x_size and p_y_size must be divisible by c and d.");
        }
        let m = p_x_size / c;
        let n = p_y_size / d;
        let mut t_x_coeffs = vec![ScalarField::zero(); 2 * c];
        let mut t_y_coeffs = vec![ScalarField::zero(); 2 * d];
        t_x_coeffs[c] = ScalarField::one();
        t_x_coeffs[0] = ScalarField::zero() - ScalarField::one();
        t_y_coeffs[d] = ScalarField::one();
        t_y_coeffs[0] = ScalarField::zero() - ScalarField::one();
        let mut t_x = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_x_coeffs), 2 * c, 1);
        let mut t_y = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&t_y_coeffs), 1, 2 * d);
        t_x.optimize_size();
        t_y.optimize_size();

        let q_x_coeffs_opt = ScalarCfg::generate_random(((m - 1) * c - 2) * (n * d - 2));
        let q_y_coeffs_opt = ScalarCfg::generate_random((c - 1) * ((n - 1) * d - 2));
        let q_x_coeffs = resize(
            &q_x_coeffs_opt.into_boxed_slice(),
            (m - 1) * c - 2,
            n * d - 2,
            (m - 1) * c,
            n * d,
            ScalarField::zero(),
        );
        let q_y_coeffs = resize(
            &q_y_coeffs_opt.into_boxed_slice(),
            c - 1,
            (n - 1) * d - 2,
            c,
            (n - 1) * d,
            ScalarField::zero(),
        );
        let mut q_x =
            DensePolynomialExt::from_coeffs(HostSlice::from_slice(&q_x_coeffs), (m - 1) * c, n * d);
        let mut q_y =
            DensePolynomialExt::from_coeffs(HostSlice::from_slice(&q_y_coeffs), c, (n - 1) * d);
        q_x.optimize_size();
        q_y.optimize_size();
        let mut p = &(&q_x * &t_x) + &(&q_y * &t_y);
        p.optimize_size();
        (p, t_x, t_y)
    }

    // Test for div_by_vanishing - requires specific conditions
    #[test]
    fn test_div_by_vanishing_basic() {
        let c = 1024;
        let d = 256;
        run_div_by_vanishing_basic(2 * c, 2 * d, c, d);
        run_div_by_vanishing_basic(3 * c, 2 * d, c, d);
    }

    #[test]
    fn test_div_by_vanishing_opt_basic() {
        let c = 32;
        let d = 16;
        let (mut p, t_x, t_y) = make_vanishing_instance(2 * c, 2 * d, c, d);
        let mut cache = DivByVanishingCache {
            denom_x_eval_inv: Box::new([]),
            denom_y_eval_inv: Box::new([]),
            denom_x_axis_inv: Box::new([]),
            denom_y_axis_inv: Box::new([]),
        };
        let (mut q_x_found, mut q_y_found) = p.div_by_vanishing_opt(c as i64, d as i64, &mut cache);
        q_x_found.optimize_size();
        q_y_found.optimize_size();
        let p_reconstruct = &(&q_x_found * &t_x) + &(&q_y_found * &t_y);

        let a = ScalarCfg::generate_random(1)[0];
        let b = ScalarCfg::generate_random(1)[0];
        assert!(p.eval(&a, &b).eq(&p_reconstruct.eval(&a, &b)));
    }

    #[test]
    #[ignore]
    fn bench_div_by_vanishing_opt() {
        let c = 1024;
        let d = 256;
        let (p, t_x, t_y) = make_vanishing_instance(2 * c, 2 * d, c, d);

        let mut p_base = p.clone();
        let mut cache_base = DivByVanishingCache {
            denom_x_eval_inv: Box::new([]),
            denom_y_eval_inv: Box::new([]),
            denom_x_axis_inv: Box::new([]),
            denom_y_axis_inv: Box::new([]),
        };
        let (mut q_x_base, mut q_y_base) =
            p_base.div_by_vanishing(c as i64, d as i64, &mut cache_base);
        q_x_base.optimize_size();
        q_y_base.optimize_size();

        let mut p_opt = p.clone();
        let mut cache_opt = DivByVanishingCache {
            denom_x_eval_inv: Box::new([]),
            denom_y_eval_inv: Box::new([]),
            denom_x_axis_inv: Box::new([]),
            denom_y_axis_inv: Box::new([]),
        };
        let (mut q_x_opt, mut q_y_opt) =
            p_opt.div_by_vanishing_opt(c as i64, d as i64, &mut cache_opt);
        q_x_opt.optimize_size();
        q_y_opt.optimize_size();

        let p_reconstruct_base = &(&q_x_base * &t_x) + &(&q_y_base * &t_y);
        let p_reconstruct_opt = &(&q_x_opt * &t_x) + &(&q_y_opt * &t_y);
        let a = ScalarCfg::generate_random(1)[0];
        let b = ScalarCfg::generate_random(1)[0];
        let p_evaled = p.eval(&a, &b);
        assert!(p_evaled.eq(&p_reconstruct_base.eval(&a, &b)));
        assert!(p_evaled.eq(&p_reconstruct_opt.eval(&a, &b)));
    }

    #[test]
    fn update_degree_general_case() {
        let x_size = 2usize.pow(12);
        let y_size = 2usize.pow(6);
        // let x_degree= 2i64.pow(9);
        // let y_degree = 0;
        let x_degree: i64 = (x_size - 1) as i64;
        let y_degree: i64 = (y_size - 1) as i64;

        let dense_coeffs = ScalarCfg::generate_random(((x_degree + 1) * (y_degree + 1)) as usize);
        let dense_coeffs_resized = resize(
            &dense_coeffs,
            (x_degree + 1) as usize,
            (y_degree + 1) as usize,
            x_size,
            y_size,
            ScalarField::zero(),
        );
        let mut _dense_p = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&dense_coeffs_resized),
            x_size,
            y_size,
        );

        let (x_deg, y_deg) = _dense_p.find_degree();
        assert_eq!(x_deg, x_degree);
        assert_eq!(y_deg, y_degree);

        let x_degree = 0;
        let y_degree = 0;

        let sparse_coeffs = ScalarCfg::generate_random(((x_degree + 1) * (y_degree + 1)) as usize);
        let sparse_coeffs_resized = resize(
            &sparse_coeffs,
            (x_degree + 1) as usize,
            (y_degree + 1) as usize,
            x_size,
            y_size,
            ScalarField::zero(),
        );
        let mut _sparse_p = DensePolynomialExt::from_coeffs(
            HostSlice::from_slice(&sparse_coeffs_resized),
            x_size,
            y_size,
        );

        let (x_deg, y_deg) = _sparse_p.find_degree();
        assert_eq!(x_deg, x_degree);
        assert_eq!(y_deg, y_degree);
    }
    // More tests can be added as needed

    fn denom_inv_ntt(
        target_x: usize,
        target_y: usize,
        base: usize,
        coset_x: Option<&ScalarField>,
        coset_y: Option<&ScalarField>,
    ) -> Vec<ScalarField> {
        init_bi_ntt_domain(target_x, target_y);
        let mut coeffs = vec![ScalarField::zero(); 2 * base];
        coeffs[0] = ScalarField::zero() - ScalarField::one();
        coeffs[base] = ScalarField::one();
        let (poly_x, poly_y) = match (coset_x, coset_y) {
            (Some(_), None) => (2 * base, 1),
            (None, Some(_)) => (1, 2 * base),
            _ => panic!("Exactly one of coset_x or coset_y must be provided."),
        };
        let mut t = DensePolynomialExt::from_coeffs(HostSlice::from_slice(&coeffs), poly_x, poly_y);
        t.resize(target_x, target_y);
        let mut denom = DeviceVec::<ScalarField>::device_malloc(target_x * target_y).unwrap();
        t.to_rou_evals(coset_x, coset_y, &mut denom);
        let mut denom_inv_vec = vec![ScalarField::zero(); target_x * target_y];
        let denom_inv = HostSlice::from_mut_slice(&mut denom_inv_vec);
        let vec_ops_cfg = VecOpsConfig::default();
        ScalarCfg::inv(&denom, denom_inv, &vec_ops_cfg).unwrap();
        denom_inv_vec
    }

    fn denom_inv_closed_form(
        target_x: usize,
        target_y: usize,
        base: usize,
        coset_x: Option<&ScalarField>,
        coset_y: Option<&ScalarField>,
    ) -> Vec<ScalarField> {
        let (axis_size, coset, is_y_dir) = match (coset_x, coset_y) {
            (Some(cx), None) => (target_x, cx, false),
            (None, Some(cy)) => (target_y, cy, true),
            _ => panic!("Exactly one of coset_x or coset_y must be provided."),
        };
        let repeat = axis_size / base;
        let root = ntt::get_root_of_unity::<ScalarField>(repeat as u64);
        let coset_pow = coset.pow(base);
        let mut omega_pows = vec![ScalarField::one(); axis_size];
        for i in 1..axis_size {
            omega_pows[i] = omega_pows[i - 1] * root;
        }
        let mut scaled = vec![ScalarField::zero(); axis_size];
        scale_vec(coset_pow, &omega_pows, &mut scaled);
        let mut axis_vals = vec![ScalarField::zero(); axis_size];
        let minus_one = ScalarField::zero() - ScalarField::one();
        scalar_vec_add(minus_one, &scaled, &mut axis_vals);

        let mut denom_evals = vec![ScalarField::zero(); target_x * target_y];
        if is_y_dir {
            for x in 0..target_x {
                let row = &mut denom_evals[x * target_y..(x + 1) * target_y];
                row.copy_from_slice(&axis_vals);
            }
        } else {
            for x in 0..target_x {
                let val = axis_vals[x];
                let row_start = x * target_y;
                for y in 0..target_y {
                    denom_evals[row_start + y] = val;
                }
            }
        }

        let mut denom = DeviceVec::<ScalarField>::device_malloc(target_x * target_y).unwrap();
        denom
            .copy_from_host(HostSlice::from_slice(&denom_evals))
            .unwrap();
        let mut denom_inv_vec = vec![ScalarField::zero(); target_x * target_y];
        let denom_inv = HostSlice::from_mut_slice(&mut denom_inv_vec);
        let vec_ops_cfg = VecOpsConfig::default();
        ScalarCfg::inv(&denom, denom_inv, &vec_ops_cfg).unwrap();
        denom_inv_vec
    }

    #[test]
    fn bench_denom_inv_ntt_vs_closed_form() {
        let c = 2048;
        let d = 256;
        let m = 4;
        let n = 2;
        let target_x = m * c;
        let target_y = n * d;
        let zeta = ScalarCfg::generate_random(1)[0];

        let ntt_inv = denom_inv_ntt(target_x, target_y, c, Some(&zeta), None);

        let closed_inv = denom_inv_closed_form(target_x, target_y, c, Some(&zeta), None);

        assert_eq!(ntt_inv.len(), closed_inv.len());
        for (a, b) in ntt_inv.iter().zip(closed_inv.iter()) {
            assert!(a.eq(b));
        }

        let ntt_inv_y = denom_inv_ntt(c, target_y, d, None, Some(&zeta));

        let closed_inv_y = denom_inv_closed_form(c, target_y, d, None, Some(&zeta));

        assert_eq!(ntt_inv_y.len(), closed_inv_y.len());
        for (a, b) in ntt_inv_y.iter().zip(closed_inv_y.iter()) {
            assert!(a.eq(b));
        }
    }
}

#[cfg(test)]
mod tests_vectors {
    use icicle_bls12_381::curve::{ScalarCfg, ScalarField};
    use icicle_core::traits::{FieldImpl, GenerateRandom};

    use crate::vector_operations::*;

    macro_rules! scalar_vec {
        ( $( $x:expr ),* ) => {
            vec![
                $( ScalarField::from_u32($x) ),*
            ].into_boxed_slice()
        };
    }

    #[test]
    fn test_point_mul_two_vecs() {
        let vec1 = scalar_vec![1, 2, 3];
        let vec2 = scalar_vec![4, 5];
        let vec3 = scalar_vec![2, 0, 2, 4];

        let mut res = vec![ScalarField::zero(); 6].into_boxed_slice();
        outer_product_two_vecs(&vec1, &vec2, &mut res);
        println!("res : {:?}", res);

        let mut res = vec![ScalarField::zero(); 6].into_boxed_slice();
        outer_product_two_vecs(&vec2, &vec1, &mut res);
        println!("res : {:?}", res);

        let mut res = vec![ScalarField::zero(); 12].into_boxed_slice();
        outer_product_two_vecs(&vec1, &vec3, &mut res);
        println!("res : {:?}", res);

        let mut res = vec![ScalarField::zero(); 8].into_boxed_slice();
        outer_product_two_vecs(&vec3, &vec2, &mut res);
        println!("res : {:?}", res);
    }

    #[test]
    fn test_scaled_outer_product() {
        let vec1 = scalar_vec![1, 2, 3];
        let vec2 = scalar_vec![4, 5];
        let vec3 = scalar_vec![2, 0, 2, 4];
        let scaler = ScalarField::from_u32(2);

        let mut res = vec![ScalarField::zero(); 6].into_boxed_slice();
        scaled_outer_product(&vec1, &vec2, Some(&scaler), &mut res);
        println!("res : {:?}", res);

        let mut res = vec![ScalarField::zero(); 8].into_boxed_slice();
        scaled_outer_product(&vec3, &vec2, None, &mut res);
        println!("res : {:?}", res);
    }

    #[test]
    fn test_matrix_matrix_mul_small() {
        // example size: 2x3 * 3x2 = 2x2
        // LHS: 2x3
        // [1 2 3]
        // [4 5 6]
        let lhs = vec![
            ScalarField::from_u32(1u32),
            ScalarField::from_u32(2u32),
            ScalarField::from_u32(3u32),
            ScalarField::from_u32(4u32),
            ScalarField::from_u32(5u32),
            ScalarField::from_u32(6u32),
        ]
        .into_boxed_slice();

        // RHS: 3x2
        // [7  8]
        // [9 10]
        // [11 12]
        let rhs = vec![
            ScalarField::from_u32(7u32),
            ScalarField::from_u32(8u32),
            ScalarField::from_u32(9u32),
            ScalarField::from_u32(10u32),
            ScalarField::from_u32(11u32),
            ScalarField::from_u32(12u32),
        ]
        .into_boxed_slice();

        // expected result: 2x2
        // [1*7+2*9+3*11, 1*8+2*10+3*12] = [58, 64]
        // [4*7+5*9+6*11, 4*8+5*10+6*12] = [139, 154]
        let expected = vec![
            ScalarField::from_u32(58u32),
            ScalarField::from_u32(64u32),
            ScalarField::from_u32(139u32),
            ScalarField::from_u32(154u32),
        ]
        .into_boxed_slice();

        let mut res = vec![ScalarField::zero(); 4].into_boxed_slice();
        matrix_matrix_mul(&lhs, &rhs, 2, 3, 2, &mut res);

        for i in 0..4 {
            assert_eq!(res[i], expected[i], "Mismatch at index {}", i);
        }
    }

    #[test]
    fn test_matrix_matrix_mul_tiled_matches_untiled() {
        let lhs = (1u32..=12)
            .map(ScalarField::from_u32)
            .collect::<Vec<_>>()
            .into_boxed_slice();
        let rhs = (1u32..=20)
            .map(ScalarField::from_u32)
            .collect::<Vec<_>>()
            .into_boxed_slice();

        let mut untiled = vec![ScalarField::zero(); 15].into_boxed_slice();
        matrix_matrix_mul(&lhs, &rhs, 3, 4, 5, &mut untiled);

        let mut tiled = vec![ScalarField::zero(); 15].into_boxed_slice();
        matrix_matrix_mul_tiled(&lhs, &rhs, 3, 4, 5, &mut tiled, 2);

        assert_eq!(tiled, untiled);
    }

    #[test]
    fn test_gen_evaled_lagrange_bases() {
        let x = ScalarCfg::generate_random(1)[0];
        let size = 2048;
        let mut res = vec![ScalarField::zero(); size].into_boxed_slice();
        gen_evaled_lagrange_bases(&x, size, &mut res);
    }
    #[test]
    fn test_resize() {
        let rW_X_coeffs = ScalarCfg::generate_random(3);
        let rW_X_coeffs_resized = resize(&rW_X_coeffs, 3, 1, 4, 1, ScalarField::zero());
        let rW_Y_coeffs = ScalarCfg::generate_random(3);
        let rW_Y_coeffs_resized = resize(&rW_Y_coeffs, 1, 3, 1, 4, ScalarField::zero());

        println!("X_orig: {:?}", rW_X_coeffs);
        println!("X_ext: {:?}", rW_X_coeffs_resized);
        println!("Y_orig: {:?}", rW_Y_coeffs);
        println!("Y_ext: {:?}", rW_Y_coeffs_resized);
    }
}

mod tests_iotools {
    use crate::group_structures::G1serde;
    use crate::iotools::{gen_g1serde_vec_of_xy_monomials, scaled_outer_product_1d};
    use crate::vector_operations::extend_monomial_vec;
    use icicle_bls12_381::curve::{CurveCfg, ScalarCfg, ScalarField};
    use icicle_core::curve::Curve;
    use icicle_core::traits::{FieldImpl, GenerateRandom};

    #[test]
    fn test_scalar_to_G1_conversion() {
        let x_size = 2usize.pow(10);
        let y_size = 2usize.pow(4);
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];
        let gen = CurveCfg::generate_random_affine_points(1)[0];
        let mut res = vec![G1serde::zero(); x_size * y_size];

        let mut x_powers_vec = vec![ScalarField::zero(); x_size];
        let mut y_powers_vec = vec![ScalarField::zero(); y_size];
        extend_monomial_vec(&vec![ScalarField::one(), x], &mut x_powers_vec);
        extend_monomial_vec(&vec![ScalarField::one(), y], &mut y_powers_vec);
        scaled_outer_product_1d(&x_powers_vec, &y_powers_vec, &gen, None, &mut res);
        drop(res);

        let mut res = vec![G1serde::zero(); x_size * y_size];
        gen_g1serde_vec_of_xy_monomials(x, y, &gen, x_size, y_size, &mut res);
    }
}
