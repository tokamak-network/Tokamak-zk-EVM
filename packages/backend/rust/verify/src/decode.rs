//! Native decoding of the common canonical affine-byte contract. Never reduce
//! malformed coordinates modulo the field or skip source-group membership.
use ark_bls12_381::{Fq, Fq2, G1Affine, G2Affine};
use ark_ff::{BigInteger, PrimeField};

fn fq(bytes: &[u8]) -> Result<Fq, String> {
    if bytes.len() != 48
        || bytes
            .iter()
            .rev()
            .cmp(Fq::MODULUS.to_bytes_le().iter().rev())
            .is_ge()
    {
        return Err("noncanonical base-field coordinate".into());
    }
    Ok(Fq::from_le_bytes_mod_order(bytes))
}
pub(crate) fn g1(bytes: &[u8; 96]) -> Result<G1Affine, String> {
    if *bytes == [0; 96] {
        return Ok(G1Affine::identity());
    }
    let point = G1Affine::new_unchecked(fq(&bytes[..48])?, fq(&bytes[48..])?);
    if !point.is_on_curve() || !point.is_in_correct_subgroup_assuming_on_curve() {
        return Err("G1 point is outside the prime-order source group".into());
    }
    Ok(point)
}
pub(crate) fn g2(bytes: &[u8; 192]) -> Result<G2Affine, String> {
    if *bytes == [0; 192] {
        return Ok(G2Affine::identity());
    }
    let point = G2Affine::new_unchecked(
        Fq2::new(fq(&bytes[..48])?, fq(&bytes[48..96])?),
        Fq2::new(fq(&bytes[96..144])?, fq(&bytes[144..])?),
    );
    if !point.is_on_curve() || !point.is_in_correct_subgroup_assuming_on_curve() {
        return Err("G2 point is outside the prime-order source group".into());
    }
    Ok(point)
}
