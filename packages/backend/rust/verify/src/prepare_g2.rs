//! BLS12-381 M-twist preparation, using the build-computed inverse of two.
//! Formulas follow ark-ec 0.5.0 models/bls12/g2.rs (MIT OR Apache-2.0).
//! Its standard API recomputes this fixed inverse for every dynamic point.
use ark_bls12_381::{Config, Fq2, G2Affine};
use ark_ec::{
    bls12::{Bls12Config, G2Prepared},
    AffineRepr,
};
use ark_ff::{AdditiveGroup, BitIteratorBE, Field, One};

pub(crate) fn prepare(q: G2Affine) -> G2Prepared<Config> {
    let Some((qx, qy)) = q.xy() else {
        return G2Prepared {
            infinity: true,
            ell_coeffs: Vec::new(),
        };
    };
    let (mut x, mut y, mut z) = (qx, qy, Fq2::one());
    let mut ell_coeffs = Vec::new();
    let half = crate::fixed::INV_TWO;
    const B: Fq2 = Fq2::new(ark_ff::MontFp!("4"), ark_ff::MontFp!("4"));
    for bit in BitIteratorBE::new(Config::X).skip(1) {
        let mut a = x * y;
        a.mul_assign_by_fp(&half);
        let b = y.square();
        let c = z.square();
        let e = B * (c.double() + c);
        let f = e.double() + e;
        let mut g = b + f;
        g.mul_assign_by_fp(&half);
        let h = (y + z).square() - (b + c);
        let i = e - b;
        let j = x.square();
        let ee = e.square();
        x = a * (b - f);
        y = g.square() - (ee.double() + ee);
        z = b * h;
        ell_coeffs.push((i, j.double() + j, -h));
        if bit {
            let theta = y - qy * z;
            let lambda = x - qx * z;
            let c = theta.square();
            let d = lambda.square();
            let e = lambda * d;
            let f = z * c;
            let g = x * d;
            let h = e + f - g.double();
            x = lambda * h;
            y = theta * (g - h) - e * y;
            z *= e;
            ell_coeffs.push((theta * qx - lambda * qy, -theta, lambda));
        }
    }
    G2Prepared {
        infinity: false,
        ell_coeffs,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_bls12_381::Fr;
    use ark_ec::CurveGroup;
    #[test]
    fn prepared_lines_match_arkworks() {
        for i in 0..32 {
            let q = (G2Affine::generator() * Fr::from(i)).into_affine();
            assert_eq!(prepare(q), G2Prepared::<Config>::from(q));
        }
    }
}
