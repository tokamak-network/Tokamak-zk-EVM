//! Signed-window CPU MSM using arkworks group operations. The input-size
//! window rule and half-range buckets are measured in the P13 report.
use ark_bls12_381::{Fr, G1Affine, G1Projective};
use ark_ec::CurveGroup;
use ark_ff::{AdditiveGroup, PrimeField, Zero};
use rayon::prelude::*;

pub(super) fn msm(bases: &[G1Affine], scalars: &[Fr]) -> G1Affine {
    assert_eq!(bases.len(), scalars.len());
    let width = if bases.len() < 32 {
        3
    } else {
        ((usize::BITS - (bases.len() - 1).leading_zeros()) as usize * 69 / 100) + 1
    };
    let windows = (Fr::MODULUS_BIT_SIZE as usize).div_ceil(width);
    let mask = (1u64 << width) - 1;
    let digits: Vec<i32> = scalars
        .par_iter()
        .flat_map_iter(|s| {
            let mut b = s.into_bigint();
            let mut carry = 0;
            (0..windows).map(move |i| {
                let value = (b.0[0] & mask) + carry;
                b >>= width as u32;
                carry = (value + (1 << (width - 1))) >> width;
                if i + 1 == windows {
                    value as i32
                } else {
                    value as i32 - (carry << width) as i32
                }
            })
        })
        .collect();
    let sums: Vec<_> = (0..windows)
        .into_par_iter()
        .map(|w| {
            // Nonfinal signed digits fit half the unsigned range. The final
            // window retains the carry and therefore needs the full range.
            let size = if w + 1 == windows {
                1 << width
            } else {
                1 << (width - 1)
            };
            let mut buckets = vec![G1Projective::zero(); size];
            for (digit, base) in digits.chunks_exact(windows).zip(bases) {
                let d = digit[w];
                if d > 0 {
                    buckets[d as usize - 1] += base;
                }
                if d < 0 {
                    buckets[(-d) as usize - 1] -= base;
                }
            }
            let mut running = G1Projective::zero();
            let mut sum = G1Projective::zero();
            for bucket in buckets.into_iter().rev() {
                running += bucket;
                sum += running;
            }
            sum
        })
        .collect();
    let mut result = G1Projective::zero();
    for sum in sums.into_iter().rev() {
        for _ in 0..width {
            result.double_in_place();
        }
        result += sum;
    }
    result.into_affine()
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_ec::VariableBaseMSM;
    use ark_ff::UniformRand;
    use rand::{rngs::StdRng, SeedableRng};

    #[test]
    fn signed_kernel_matches_stock_at_window_boundaries() {
        let mut rng = StdRng::seed_from_u64(134);
        for n in [0, 1, 31, 32, 63, 64, 127, 1024] {
            let mut points: Vec<_> = (0..n)
                .map(|_| G1Projective::rand(&mut rng).into_affine())
                .collect();
            if n > 0 {
                points[0] = G1Affine::identity();
            }
            if n > 2 {
                points[2] = points[1];
            }
            let random: Vec<_> = (0..n).map(|_| Fr::rand(&mut rng)).collect();
            for values in [
                vec![Fr::zero(); n],
                vec![Fr::from(1u64); n],
                vec![-Fr::from(1u64); n],
                random,
            ] {
                assert_eq!(
                    msm(&points, &values),
                    G1Projective::msm(&points, &values).unwrap().into_affine(),
                    "size {n}"
                );
            }
        }
    }
}
