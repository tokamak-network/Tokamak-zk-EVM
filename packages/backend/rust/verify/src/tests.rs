use super::*;
use ark_bls12_381::Fq;
use ark_ec::AffineRepr;
use ark_ff::BigInteger;

#[test]
fn fixed_base_factoring_preserves_the_first_pairing_operand() {
    for i in 1..16u64 {
        let a = Fr::from(i + 17).pow([113]);
        let b = a.square();
        let c = b * a;
        let rp = c.square();
        let mu = Fr::from(i + 3);
        let mu2 = mu.square();
        let mu3 = mu2 * mu;
        let dynamic = fixed::ONE * Fr::from(i);
        let r = fixed::XI * Fr::from(i + 1);
        let before = (dynamic - fixed::ONE * a - fixed::XI * b - fixed::PSI * c) * mu2
            + (r - fixed::ONE * rp) * mu3;
        let after = dynamic * mu2 + r * mu3
            - fixed::ONE * (a * mu2 + rp * mu3)
            - fixed::XI * (b * mu2)
            - fixed::PSI * (c * mu2);
        assert_eq!(before, after);
    }
}

#[test]
fn embedded_g1_tables_match_fixed_points() {
    let tables = fixed::prepared_g1();
    for (table, point) in tables.iter().zip([fixed::ONE, fixed::XI, fixed::PSI]) {
        for scalar in [
            Fr::zero(),
            Fr::one(),
            -Fr::one(),
            Fr::from(137u64).pow([179]),
        ] {
            assert_eq!(
                table.batch_mul(&[scalar])[0],
                (point * scalar).into_affine()
            );
        }
    }
}

#[test]
fn public_interpolation_matches_polynomial_and_root_values() {
    for size in [1, 2, 8, 256] {
        let root = canonical_root(size).unwrap();
        let roots: Vec<_> = (0..size).map(|i| root.pow([i as u64])).collect();
        let weights: Vec<_> = roots.iter().map(|r| *r / Fr::from(size as u64)).collect();
        let polynomial = |x: Fr| {
            (0..size)
                .rev()
                .fold(Fr::zero(), |a, i| a * x + Fr::from(i as u64 + 1))
        };
        let values: Vec<_> = roots.iter().copied().map(polynomial).collect();
        for chi in [Fr::zero(), Fr::from(11), roots[0], roots[size - 1]] {
            assert_eq!(
                evaluate_public(&values, &roots, &weights, chi),
                polynomial(chi)
            );
        }
    }
}

#[test]
fn quotient_reconstruction_uses_both_domain_factors() {
    let ch = UnivariateChallenges {
        upsilon: Fr::from(2),
        beta: Fr::from(3),
        gamma_c: Fr::from(4),
        theta: Fr::from(5),
        chi: Fr::from(7),
        varpi: Fr::from(11),
        mu: Fr::from(13),
    };
    let values = [2u64, 3, 4, 5, 6, 7, 8].map(Fr::from);
    for (na, nc) in [(8, 8), (8, 16), (16, 8)] {
        let [sc, u, v, w, b, r, rp] = values;
        let za = ch.chi.pow([na]) - Fr::one();
        let zc = ch.chi.pow([nc]) - Fr::one();
        // U32 divided through by Z_union: M_A/Z_union=1/Z_A,
        // M_C/Z_union=1/Z_C. This is independent of the implementation's factors.
        let expected = (u * v - w) / za
            + ch.theta * (r - Fr::one()) / (Fr::from(nc) * (ch.chi - Fr::one()))
            + ch.theta.square()
                * (rp * (b + ch.beta * ch.chi + ch.gamma_c) - r * (b + ch.beta * sc + ch.gamma_c))
                / zc;
        assert_eq!(
            quotient_at_challenge(&ch, values, na, nc, Fr::from(nc).inverse().unwrap()),
            expected
        );
    }
}

#[test]
fn points_require_canonical_coordinates_curve_and_subgroup() {
    assert!(decode::g1(&[0; 96]).unwrap().is_zero());
    assert!(decode::g2(&[0; 192]).unwrap().is_zero());
    let mut point = [0; 96];
    point[..48].copy_from_slice(&Fq::MODULUS.to_bytes_le());
    assert!(decode::g1(&point).is_err());
    point = [0; 96];
    point[0] = 1;
    assert!(decode::g1(&point).is_err());
    // (0,2) lies on y^2=x^3+4, but is not in the prime-order subgroup.
    point = [0; 96];
    point[48] = 2;
    assert!(decode::g1(&point).is_err());
    let mut g2 = [0; 192];
    g2[0] = 1;
    assert!(decode::g2(&g2).is_err());
}
