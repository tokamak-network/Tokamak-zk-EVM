use std::ops::Mul;

use core::{marker::PhantomData, mem};

use lambdaworks_math::{
    cyclic_group::IsGroup,
    elliptic_curve::{
        short_weierstrass::{curves::bls12_381::{curve::BLS12381Curve, default_types::FrElement}, point::ShortWeierstrassProjectivePoint},
        traits::IsEllipticCurve,
    },
    traits::{AsBytes, Deserializable},
    errors::DeserializationError,
    field::{element::FieldElement, traits::IsPrimeField},
    elliptic_curve::traits::IsPairing,
    msm::pippenger::msm,
    unsigned_integer::element::UnsignedInteger,
};

use crate::bikzg::traits::IsCommitmentScheme;

use lambdaworks_math::polynomial::Polynomial as UnivariatePolynomial;

use rayon::prelude::*;
use crate::bikzg::G1Point;
use zkp_rust_tools_math::bipolynomial::BivariatePolynomial;

#[derive(PartialEq, Clone, Debug)]
pub struct StructuredReferenceString<G1Point, G2Point> {
    pub dimention_x: usize, 
    pub dimention_y: usize,
    pub powers_main_group: Vec<G1Point>,
    pub powers_secondary_group: [G2Point; 3],// 1 , tau, theta 
}
// X,Y 
// powers of tau , delta    , [P(tau,delta)]_1 
 
impl<G1Point, G2Point> StructuredReferenceString<G1Point, G2Point>
where
    G1Point: IsGroup,
    G2Point: IsGroup,
{
    pub fn new(dim_x: usize, dim_y: usize,powers_main_group: &[G1Point], powers_secondary_group: &[G2Point; 3]) -> Self {
        Self {
            dimention_x: dim_x, 
            dimention_y: dim_y,
            powers_main_group: powers_main_group.into(),
            powers_secondary_group: powers_secondary_group.clone(),
        }
    }

    pub fn flatten_partitioned_g1_points(&self, x_len: usize, y_len: usize) -> Vec<G1Point> {
        let mut chunk_iter = self.powers_main_group.chunks(self.dimention_x);
        let mut output: Vec<G1Point> = vec![];
        for _ in 0..y_len{
            // let dd = chunk_iter.next();
            // dd.iter().take(x_len).cloned().collect();
            output.extend( chunk_iter.next().unwrap().iter().take(x_len).cloned());
        }

        output
    }
}

impl<G1Point, G2Point> AsBytes for StructuredReferenceString<G1Point, G2Point>
where
    G1Point: IsGroup + AsBytes,
    G2Point: IsGroup + AsBytes,
{
    fn as_bytes(&self) -> Vec<u8> {
        let mut serialized_data: Vec<u8> = Vec::new();
        // First 4 bytes encodes protocol version
        let protocol_version: [u8; 4] = [0; 4];

        serialized_data.extend(&protocol_version);

        add_usize(& mut serialized_data, self.dimention_x);
        add_usize(& mut serialized_data, self.dimention_y);


        // Second 8 bytes store the amount of G1 elements to be stored, this is more than can be indexed with a 64-bit architecture, and some millions of terabytes of data if the points were compressed
        let mut main_group_len_bytes: Vec<u8> = self.powers_main_group.len().to_le_bytes().to_vec();

        // For architectures with less than 64 bits for pointers
        // We add extra zeros at the end
        while main_group_len_bytes.len() < 8 {
            main_group_len_bytes.push(0)
        }

        serialized_data.extend(&main_group_len_bytes);

        // G1 elements
        for point in &self.powers_main_group {
            serialized_data.extend(point.as_bytes());
        }

        // G2 elements
        for point in &self.powers_secondary_group {
            serialized_data.extend(point.as_bytes());
        }

        serialized_data
    }
}

fn add_usize(serialized_data: & mut Vec<u8>, data: usize) {
    let mut data_bytes: Vec<u8> = data.to_le_bytes().to_vec();
    // For data with less than 64 bits for pointers
    // We add extra zeros at the end`
    while data_bytes.len() < 8 { 
        data_bytes.push(0);
    }
    serialized_data.extend(&data_bytes);
}



impl<G1Point, G2Point> Deserializable for StructuredReferenceString<G1Point, G2Point>
where
    G1Point: IsGroup + Deserializable,
    G2Point: IsGroup + Deserializable,
{
    fn deserialize(bytes: &[u8]) -> Result<Self, DeserializationError> {
        const X_DIMENTION_LEN_START: usize = 4; 
        const X_DIMENTION_LEN_END: usize = 12; 

        const Y_DIMENTION_LEN_START: usize = 12; 
        const Y_DIMENTION_LEN_END: usize = 20; 
   
        const MAIN_GROUP_LEN_OFFSET: usize = 20;
        const MAIN_GROUP_OFFSET: usize = 28;

        let x_dim_len_u64 = u64::from_le_bytes(
            // This unwrap can't fail since we are fixing the size of the slice
            bytes[X_DIMENTION_LEN_START..X_DIMENTION_LEN_END]
                .try_into()
                .unwrap(),
        );

        let x_dim_len = usize::try_from(x_dim_len_u64)
        .map_err(|_| DeserializationError::PointerSizeError)?;

        let y_dim_len_u64 = u64::from_le_bytes(
            // This unwrap can't fail since we are fixing the size of the slice
            bytes[Y_DIMENTION_LEN_START..Y_DIMENTION_LEN_END]
                .try_into()
                .unwrap(),
        );

        let y_dim_len = usize::try_from(y_dim_len_u64)
        .map_err(|_| DeserializationError::PointerSizeError)?;

        let main_group_len_u64 = u64::from_le_bytes(
            // This unwrap can't fail since we are fixing the size of the slice
            bytes[MAIN_GROUP_LEN_OFFSET..MAIN_GROUP_OFFSET]
                .try_into()
                .unwrap(),
        );

        let main_group_len = usize::try_from(main_group_len_u64)
            .map_err(|_| DeserializationError::PointerSizeError)?;

        let mut main_group: Vec<G1Point> = Vec::new();
        let mut secondary_group: Vec<G2Point> = Vec::new();

        let size_g1_point = mem::size_of::<G1Point>();
        let size_g2_point = mem::size_of::<G2Point>();

        for i in 0..main_group_len {
            // The second unwrap shouldn't fail since the amount of bytes is fixed
            let point = G1Point::deserialize(
                bytes[i * size_g1_point + MAIN_GROUP_OFFSET
                    ..i * size_g1_point + size_g1_point + MAIN_GROUP_OFFSET]
                    .try_into()
                    .unwrap(),
            )?;
            main_group.push(point);
        }

        let g2s_offset = size_g1_point * main_group_len + 28;
        for i in 0..3 {
            // The second unwrap shouldn't fail since the amount of bytes is fixed
            let point = G2Point::deserialize(
                bytes[i * size_g2_point + g2s_offset
                    ..i * size_g2_point + g2s_offset + size_g2_point]
                    .try_into()
                    .unwrap(),
            )?;
            secondary_group.push(point);
        }

        let secondary_group_slice = [secondary_group[0].clone(), secondary_group[1].clone(), secondary_group[2].clone()];

        let srs = StructuredReferenceString::new(x_dim_len,y_dim_len,&main_group, &secondary_group_slice);
        Ok(srs)
    }
}


#[derive(Clone)]
pub struct BivariateKateZaveruchaGoldberg<F: IsPrimeField, P: IsPairing> {
    srs: StructuredReferenceString<P::G1Point, P::G2Point>,
    phantom: PhantomData<F>,
}

impl<F: IsPrimeField, P: IsPairing> BivariateKateZaveruchaGoldberg<F, P> {
    pub fn new(srs: StructuredReferenceString<P::G1Point, P::G2Point>) -> Self {
        Self {
            srs,
            phantom: PhantomData,
        }
    }
}
impl<const N: usize, F: IsPrimeField<RepresentativeType = UnsignedInteger<N>>, P: IsPairing>
    IsCommitmentScheme<F> for BivariateKateZaveruchaGoldberg<F, P>
{
    type Commitment = P::G1Point;

    fn commit_bivariate(&self, bp: &BivariatePolynomial<FieldElement<F>>) -> Self::Commitment{
        let coefficients_x_y: Vec<_> = bp.flatten_out()
            .iter()
            .map(|coefficient| coefficient.representative())
            .collect();
        

        msm(
            &coefficients_x_y,
            &self.srs.flatten_partitioned_g1_points(bp.x_degree, bp.y_degree),
        )
        .expect("`points` is sliced by `cs`'s length")
    }

    fn commit_univariate(&self, p: &UnivariatePolynomial<FieldElement<F>>) -> Self::Commitment {
        let coefficients_y: Vec<_> = p
            .coefficients
            .iter()
            .map(|coefficient| coefficient.representative())
            .collect();
        let first_col_powers_main_group: Vec<_> = self.srs.powers_main_group.iter().step_by(self.srs.dimention_x).cloned().collect();
        msm(
            &coefficients_y, &first_col_powers_main_group[..coefficients_y.len()]
        ).expect("`points` is sliced by `cs`'s length")
    }

    

    //not compeleted , should return 2 commitment, one for q_xy another for q_y
    fn open(
        &self,
        x: &FieldElement<F>,
        y: &FieldElement<F>,
        evaluation: &FieldElement<F>,
        p: &BivariatePolynomial<FieldElement<F>>,
    ) -> (Self::Commitment,Self::Commitment) {
        // let mut poly_to_commit = p - y;
        let poly_to_commit = p.sub_by_field_element(evaluation);
        let (q_xy, q_y) = poly_to_commit.ruffini_division(x,y);
        // commitment to q_y , I should change the SRS to be compatible with it 
        let q_xy_commitment = self.commit_bivariate(&q_xy);
        let q_y_commitment = self.commit_univariate(&q_y);
        (q_xy_commitment,q_y_commitment)
    }

    // should accept 2 commitment instead of 1
    fn verify(
        &self,
        x: &FieldElement<F>, // x random point 
        y: &FieldElement<F>, // y random point 
        evaluation: &FieldElement<F>, // F(x,y) = evaluation
        p_commitment: &Self::Commitment,
        proofs: &(Self::Commitment,Self::Commitment),
    ) -> bool {

        let g1 = &self.srs.powers_main_group[0];
        let g2 = &self.srs.powers_secondary_group[0];
        let tau_g2 = &self.srs.powers_secondary_group[1];
        let tetha_g2 = &self.srs.powers_secondary_group[2];



        let e = P::compute_batch(&[
            (
                &p_commitment.operate_with(&(g1.operate_with_self(evaluation.representative())).neg()),
                g2,
            ),
            (
                &proofs.0.neg(),
                &(tau_g2.operate_with(&(g2.operate_with_self(x.representative())).neg())),
            ),  
            (
                &proofs.1.neg(),
                &(tetha_g2.operate_with(&(g2.operate_with_self(y.representative())).neg())),
            ),
        ]);
        e == Ok(FieldElement::one())
    }

}


// always first row and second column -> (m,n)
/// Generate SRS for a tau and tetha 
pub fn g1_points_srs(dims: (usize,usize), taus: (FrElement,FrElement)) -> Vec<Vec<G1Point>> {
    // Generate powers of tau: tau^1, tau^2, ..., tau^n
    let powers_of_tau_theta = vandemonde_challenge(&taus.0, &taus.1, dims.0, dims.1);

    let g1: ShortWeierstrassProjectivePoint<BLS12381Curve>   = <BLS12381Curve as IsEllipticCurve>::generator();
    let mut two_dim_tau_g1: Vec<Vec<ShortWeierstrassProjectivePoint<BLS12381Curve>>> = Vec::with_capacity(dims.0);
   
    for i in 0..dims.0 {
        let mut tau_g1 = vec![g1.clone(); dims.1];
        tau_g1
            .par_iter_mut()
            .zip(&powers_of_tau_theta[i])
            .for_each(|(g1, tau_i)| {
                *g1 = g1.operate_with_self(tau_i.representative());
            });
        two_dim_tau_g1.push(tau_g1);
    }

    two_dim_tau_g1

}

/// Computes the powers of tau and theta: [tau^0 , tau^1 , ... ,  tau^n-1 ] * theta^0
///                               , ... , [tau^0 , tau^1 , ... ,  tau^n-1 ] * theta^m
/// 
fn vandemonde_challenge(tau: &FrElement,theta: &FrElement , row_len: usize,col_len: usize) -> Vec<Vec<FrElement>> {

    let mut vec: Vec<Vec<FrElement>> = Vec::with_capacity(row_len);

    for _ in 0..row_len {
        vec.push(Vec::with_capacity(col_len));
    }

    for i in 0..row_len {
        let y_row = theta.pow(i);

        let mut row: Vec<FrElement> = Vec::with_capacity(row_len);
        for j in 0..col_len{
            row.push(y_row.clone().mul( tau.pow(j)));// TODO check for not being wrong.
        }
        vec[i]=row;
    }
    vec
}

#[cfg(test)]
mod tests {
    // use alloc::vec::Vec;
    use lambdaworks_math::{
        cyclic_group::IsGroup,
        elliptic_curve::{
            short_weierstrass::{
                curves::bls12_381::{
                    curve::BLS12381Curve,
                    default_types::{FrConfig, FrElement, FrField},
                    pairing::BLS12381AtePairing,
                    twist::BLS12381TwistCurve,
                },
                point::ShortWeierstrassProjectivePoint,
            },
            traits::{IsEllipticCurve, IsPairing},
        },
        field::element::FieldElement,
        polynomial::Polynomial,
        traits::{AsBytes, Deserializable},
        unsigned_integer::element::U256,
    };
    use ndarray::{s, Array, Array2, Axis, Ix2};
    use ndarray::array;


    use crate::bikzg::traits::IsCommitmentScheme;

    // use super::{KateZaveruchaGoldberg, StructuredReferenceString};
    use rand::Rng;

    type G1 = ShortWeierstrassProjectivePoint<BLS12381Curve>;

    use super::*;

    #[allow(clippy::upper_case_acronyms)]
    type KZG = BivariateKateZaveruchaGoldberg<FrField, BLS12381AtePairing>;


    fn create_srs() -> StructuredReferenceString<
        <BLS12381AtePairing as IsPairing>::G1Point,
        <BLS12381AtePairing as IsPairing>::G2Point,
    > {
        let mut rng = rand::thread_rng();
        let tau_toxic_waste = FrElement::new(U256 {
            limbs: [
                rng.gen::<u64>(),
                rng.gen::<u64>(),
                rng.gen::<u64>(),
                rng.gen::<u64>(),
            ],
        });

        let tetha_toxic_waste = FrElement::new(U256 {
            limbs: [
                rng.gen::<u64>(),
                rng.gen::<u64>(),
                rng.gen::<u64>(),
                rng.gen::<u64>(),
            ],
        });

        let g1_points_2d_vec = g1_points_srs((10,10), (tau_toxic_waste.clone(),tetha_toxic_waste.clone()));

        
        let powers_main_group: Vec<_> = g1_points_2d_vec.into_iter().flatten().collect();

        let g1 = BLS12381Curve::generator();
        let g2 = BLS12381TwistCurve::generator();

        let powers_secondary_group = [
            g2.clone(),
            g2.operate_with_self(tau_toxic_waste.representative()),
            g2.operate_with_self(tetha_toxic_waste.representative()),

        ];
        StructuredReferenceString::new(10,10,&powers_main_group, &powers_secondary_group)
    }

    #[test]
    fn kzg_1() {
        // (x+1)(y+1) = xy + y + x + 1 
        let bikzg = KZG::new(create_srs());
        // let p = Polynomial::<FrElement>::new(&[FieldElement::one(), FieldElement::one()]);
        let coefficients = array![
            [FrElement::from(1), FrElement::from(1)],
            [FrElement::from(1), FrElement::from(1)]
        ];
        let bp = BivariatePolynomial::new(coefficients);
        // let (qxy, qy) = bp.ruffini_division(&-FieldElement::<FrField>::one(),& -FieldElement::<FrField>::one());
        let p_commitment: <BLS12381AtePairing as IsPairing>::G1Point = bikzg.commit_bivariate(&bp);
        let x = FieldElement::zero(); 
        let y = FrElement::from(10);
        let evaluation = bp.evaluate(&x, &y);
        let proof = bikzg.open(&x, &y, &evaluation,&bp);
        let fake_proof = (BLS12381Curve::generator(),BLS12381Curve::generator());
        

        // assert_eq!(evaluation, FieldElement::zero());
        // assert_eq!(proof.0, BLS12381Curve::generator());
        // assert_eq!(proof.1, BLS12381Curve::generator());
        assert!(bikzg.verify(&x, &y,&evaluation, &p_commitment, &proof));


        // let x = -FieldElement::one();
        // let y = p.evaluate(&x);
        // let proof = kzg.open(&x, &y, &p);
        // assert_eq!(y, FieldElement::zero());
        // assert_eq!(proof, BLS12381Curve::generator());
        // assert!(kzg.verify(&x, &y, &p_commitment, &proof));
    }


    #[test]
    fn kzg_2() {
        let bikzg = KZG::new(create_srs());
        // let p = Polynomial::<FrElement>::new(&[FieldElement::one(), FieldElement::one()]);

        let coefficients = array![
            [FrElement::from(2),FrElement::from(1), FrElement::from(1)],//(2+x+x2) =2 
            [FrElement::from(1), FrElement::from(1),FrElement::from(1)],//1
            [FrElement::from(5), FrElement::from(2),FrElement::from(0)],//1
            [FrElement::from(3), FrElement::from(0),FrElement::from(1)],//1
        ];

        let bp = BivariatePolynomial::new(coefficients);
        // let (qxy, qy) = bp.ruffini_division(&-FieldElement::<FrField>::one(),& -FieldElement::<FrField>::one());
        let p_commitment: <BLS12381AtePairing as IsPairing>::G1Point = bikzg.commit_bivariate(&bp);
        let x = -FieldElement::one();
        let y = -FieldElement::one();
        let evaluation = bp.evaluate(&x, &y);
        let fake_evaluation = FrElement::from(1000);
        let proof = bikzg.open(&x, &y, &fake_evaluation,&bp);
        let fake_proof = (BLS12381Curve::generator(),BLS12381Curve::generator());
        

        // assert_eq!(evaluation, FieldElement::zero());
        // assert_eq!(proof.0, BLS12381Curve::generator());
        // assert_eq!(proof.1, BLS12381Curve::generator());
        assert!(bikzg.verify(&x, &y,&evaluation, &p_commitment, &proof));


        // let x = -FieldElement::one();
        // let y = p.evaluate(&x);
        // let proof = kzg.open(&x, &y, &p);
        // assert_eq!(y, FieldElement::zero());
        // assert_eq!(proof, BLS12381Curve::generator());
        // assert!(kzg.verify(&x, &y, &p_commitment, &proof));
    }





    #[test]
    fn test_vandemonde_challenge() {
        let challenge = vandemonde_challenge(&FrElement::from(2),&FrElement::from(3), 2,3);

        assert_eq!(
            challenge,
            vec![
                vec![FrElement::from(1),FrElement::from(2),FrElement::from(4)],
                vec![FrElement::from(3),FrElement::from(6),FrElement::from(12)]
            ]
        );
    }
}
