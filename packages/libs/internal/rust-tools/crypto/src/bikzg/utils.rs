use lambdaworks_math::{
    cyclic_group::IsGroup,
    elliptic_curve::{
        short_weierstrass::curves::bls12_381::{
            curve::BLS12381Curve,
            default_types::{FrElement, FrField},
        },
        traits::IsEllipticCurve,
    },
    fft::{
        cpu::{bit_reversing::in_place_bit_reverse_permute, roots_of_unity},
        errors::FFTError,
    },
    field::traits::{IsPrimeField, RootsConfig},
    polynomial::Polynomial,
    unsigned_integer::element::U256,
};
use rand::Rng;
use rayon::prelude::*;

use crate::bikzg::G1Point;

/// Generate a random field element
pub fn random_fr() -> FrElement {
    let mut rng = rand::thread_rng();
    FrElement::new(U256 {
        limbs: [
            rng.gen::<u64>(),
            rng.gen::<u64>(),
            rng.gen::<u64>(),
            rng.gen::<u64>(),
        ],
    })
}

/// Generate `n` random field elements
pub fn random_field_elements(n: usize) -> Vec<FrElement> {
    let mut result = vec![FrElement::zero(); n];

    result.par_iter_mut().for_each(|op| {
        *op = random_fr();
    });

    result
}


/// Generate a polynomial of degree `degree` with random coefficients
/// in the field FrElement
pub fn random_poly(degree: usize) -> Polynomial<FrElement> {
    Polynomial::new(&random_field_elements(degree + 1))
}

/// Fast Fourier transformation for elliptic curve BLS12-381 G1 points using the domain
pub fn fft_g(points: &[G1Point], domain: &[FrElement]) -> Vec<G1Point> {
    if points.len() == 1 {
        return points.to_vec();
    }

    let odd_points = points.iter().step_by(2).cloned().collect::<Vec<_>>();
    let even_points = points
        .iter()
        .skip(1)
        .step_by(2)
        .cloned()
        .collect::<Vec<_>>();
    let sub_domain = domain.iter().step_by(2).cloned().collect::<Vec<_>>();

    let odd_fft = fft_g(&odd_points, &sub_domain);
    let even_fft = fft_g(&even_points, &sub_domain);

    let g1 = <BLS12381Curve as IsEllipticCurve>::generator();
    let mut result = vec![g1; points.len()];

    odd_fft
        .clone()
        .into_iter()
        .zip(&even_fft)
        .enumerate()
        .for_each(|(i, (odd, even))| {
            let even_times_root = even.operate_with_self(domain[i].representative());

            result[i] = odd.operate_with(&even_times_root);
            result[i + odd_fft.len()] = odd.operate_with(&even_times_root.neg());
        });

    result
}

/// Fast Fourier transformation for elliptic curve BLS12-381 G1 points using the domain(twiddle factors)
pub fn in_place_nr_2radix_fft_g(input: &mut [G1Point], twiddles: &[FrElement]) {
    // divide input in groups, starting with 1, duplicating the number of groups in each stage.
    let mut group_count = 1;
    let mut group_size = input.len();

    // for each group, there'll be group_size / 2 butterflies.
    // a butterfly is the atomic operation of a FFT, e.g: (a, b) = (a + wb, a - wb).
    // The 0.5 factor is what gives FFT its performance, it recursively halves the problem size
    // (group size).

    while group_count < input.len() {
        #[allow(clippy::needless_range_loop)] // the suggestion would obfuscate a bit the algorithm
        for group in 0..group_count {
            let first_in_group = group * group_size;
            let first_in_next_group = first_in_group + group_size / 2;

            let w = &twiddles[group]; // a twiddle factor is used per group

            for i in first_in_group..first_in_next_group {
                let wi = &input[i + group_size / 2].operate_with_self(w.representative());

                let y0 = &input[i].operate_with(&wi);
                let y1 = &input[i].operate_with(&wi.neg());

                input[i] = y0.clone();
                input[i + group_size / 2] = y1.clone();
            }
        }
        group_count *= 2;
        group_size /= 2;
    }
}

// /// Inverse Fast Fourier transformation for elliptic curve BLS12-381 G1 points using the domain(twiddle factors)
// pub fn to_lagrange_basis(points: &[&[G1Point]]) -> Result<Vec<Vec<G1Point>>, FFTError> {

//     let order = points.len().trailing_zeros();
//     let twiddles = roots_of_unity::get_twiddles(order.into(), RootsConfig::BitReverseInversed)?;

//     let mut results = points.to_vec();
//     in_place_nr_2radix_fft_g(&mut results, &twiddles);
//     in_place_bit_reverse_permute(&mut results);

//     let mut exp = FrField::modulus_minus_one();
//     exp.limbs[exp.limbs.len() - 1] -= 1;

//     let inv_length = FrElement::from(points.len() as u64)
//         .pow(exp)
//         .representative();

//     results.par_iter_mut().for_each(|p| {
//         *p = p.operate_with_self(inv_length);
//     });

//     Ok(results)
// }

// pub fn flatten_out<T>(nested_vec: Vec<Vec<T>>) -> Vec<T> {
//     nested_vec.into_iter().flatten().collect()
// }

#[cfg(test)]
mod tests {
    // use lambdaworks_math::{fft::polynomial::FFTPoly, msm::naive::msm, polynomial::Polynomial};

    use crate::bikzg::srs::g1_points_srs;

    use super::*;

    #[test]
    fn test_to_lagrange_basis() {
        let srs = g1_points_srs((2,3), (FrElement::from(2),FrElement::from(3)));

        let coefficients = vec![
            FrElement::from(6),
            FrElement::from(28),
            FrElement::from(31),
            FrElement::from(85),
            FrElement::from(30),
            FrElement::from(71),
            FrElement::from(79),
            FrElement::from(58),
        ];

        // Compute the polynomial commitment in two different ways
        let polynomial = Polynomial::new(&coefficients);

        // 1. Compute the polynomial commitment using polynomial coefficients and powers of tau
        // C = c0 [tau^0 * G] + c1 [tau^1 * G] + ... + cn [tau^n * G]
        // where c0, c1, ..., cn are the coefficients of the polynomial
        // tau^i * G for i = 0, 1, ..., n are the powers of tau
        let cs = polynomial
            .coefficients()
            .iter()
            .map(|c| c.representative())
            .collect::<Vec<_>>();
        // let commitment1 = msm(&cs, &srs).unwrap();

        // 2. Compute the polynomial commitment using SRS in Lagrange basis, and polynomial evaluations
        // C = e0 [l0 * G] + e1 [l1 * G] + ... + en [ln * G]
        // where l0 * G, l1 * G, ..., ln G are the coefficients coated by EC points
        // e0, e1, ..., en are the evaluations of the polynomial
        // let evaluations = polynomial
        //     .evaluate_fft(1, None)
        //     .unwrap()
        //     .iter()
        //     .map(|e| e.representative())
        //     .collect::<Vec<_>>();
        // let lagrange_basis = to_lagrange_basis(&srs).unwrap();
        // let commitment2 = msm(&evaluations, &lagrange_basis).unwrap();

        // assert!(commitment1 == commitment2);
    }
}
