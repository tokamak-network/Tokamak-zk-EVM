//! Exact equality of one pairing equation; never batch unrelated equations.
use ark_bls12_381::{Bls12_381, G1Affine};
use ark_ec::pairing::Pairing;
use ark_ff::Zero;

pub(crate) type PreparedG2 = <Bls12_381 as Pairing>::G2Prepared;

pub(crate) fn equal(
    a: G1Affine,
    b: impl Into<PreparedG2>,
    c: G1Affine,
    d: impl Into<PreparedG2>,
) -> bool {
    Bls12_381::multi_pairing([a, -c], [b.into(), d.into()]).is_zero()
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_bls12_381::{Fr, G2Affine};
    use ark_ec::{AffineRepr, CurveGroup};
    use ark_ff::UniformRand;
    use rand::{rngs::StdRng, SeedableRng};

    #[test]
    fn exact_equations_match_pairing_oracle_and_reject_cancellation() {
        let mut rng = StdRng::seed_from_u64(15182);
        for _ in 0..16 {
            let a = (G1Affine::generator() * Fr::rand(&mut rng)).into_affine();
            let d = (G2Affine::generator() * Fr::rand(&mut rng)).into_affine();
            let s = Fr::rand(&mut rng);
            let c = (a * s).into_affine();
            let b = (d * s).into_affine();
            for (a, b, c, d) in [
                (a, b, c, d),
                (a, b, -c, d),
                (-a, b, -c, d),
                (G1Affine::zero(), b, G1Affine::zero(), d),
                (a, G2Affine::zero(), c, G2Affine::zero()),
                (G1Affine::zero(), b, c, d),
            ] {
                let expected = Bls12_381::pairing(a, b) == Bls12_381::pairing(c, d);
                assert_eq!(equal(a, b, c, d), expected);
                assert_eq!(
                    equal(a, PreparedG2::from(b), c, PreparedG2::from(d)),
                    expected
                );
            }
        }
        let g = G1Affine::generator();
        let h = G2Affine::generator();
        // Multiplying these unrelated equations would falsely accept both.
        assert!(!equal(g, h, G1Affine::zero(), h));
        assert!(!equal(-g, h, G1Affine::zero(), h));
    }
}
