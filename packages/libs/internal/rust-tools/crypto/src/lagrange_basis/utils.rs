

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
use rayon::iter::{IntoParallelRefMutIterator, ParallelIterator};

use crate::lagrange_basis::G1Point;

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


// m*n = > m or n 2^n => 
// Inverse Fast Fourier transformation for elliptic curve BLS12-381 G1 points using the domain(twiddle factors)
pub fn to_lagrange_basis(points: Vec<Vec<G1Point>>) -> Result<Vec<Vec<G1Point>>, FFTError> {
 
    let mut points = points.clone();
    
    let len_y =  points.len();
    let len_x = points[0].len();

    // p-2 , x^p-1 = 1 . so x^p-2 = inv(x)
    let mut exp = FrField::modulus_minus_one();
    exp.limbs[exp.limbs.len() - 1] -= 1;

    let inv_x_len = FrElement::from(len_x as u64)
        .pow(exp)
        .representative();

    let inv_y_len = FrElement::from(len_y as u64)
        .pow(exp)
        .representative();

    let iter = points.iter_mut();
    for val in iter {
        if val.len() != len_x {
            return Err(FFTError::InputError(len_x));
        }
        let order = len_x.trailing_zeros();
        let twiddles = roots_of_unity::get_twiddles(order.into(), RootsConfig::BitReverseInversed)?;
        
        in_place_nr_2radix_fft_g(val, &twiddles);
        // 1/n [A]
        val.par_iter_mut().for_each(|p| {
            *p = p.operate_with_self(inv_x_len);
        })
    }

    


    let mut transposed_x_fft: Vec<Vec<G1Point>> = Vec::new();
    for i in 0..len_x {
        let mut row: Vec<G1Point> = Vec::new();
        for j in 0..len_y {
            row.push(points[j][i].clone());
        }
        transposed_x_fft.push(row);
    }



    let iter = transposed_x_fft.iter_mut();
    for val in iter {
        if val.len() != len_y {
            return Err(FFTError::InputError(len_x));
        }
        let order = len_y.trailing_zeros();
        let twiddles = roots_of_unity::get_twiddles(order.into(), RootsConfig::BitReverseInversed)?;
    
        in_place_nr_2radix_fft_g(val, &twiddles);
                // 1/n [A]
        val.par_iter_mut().for_each(|p| {
            *p = p.operate_with_self(inv_y_len);
        })
    }

    let mut transposed_y_fft: Vec<Vec<G1Point>> = Vec::new();
    for i in 0..len_y {
        let mut row: Vec<G1Point> = Vec::new();
        for j in 0..len_x {
            row.push(points[j][i].clone());
        }
        transposed_y_fft.push(row);
    }


    Ok(transposed_y_fft)



}
