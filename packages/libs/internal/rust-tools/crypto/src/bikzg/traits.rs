use lambdaworks_math::field::element::FieldElement;
use lambdaworks_math::field::traits::IsField;

use zkp_rust_tools_math::bipolynomial::BivariatePolynomial;
use lambdaworks_math::polynomial::Polynomial as UnivariatePolynomial;



pub trait IsCommitmentScheme<F: IsField> {
    type Commitment;


    fn commit_bivariate(&self, bp: &BivariatePolynomial<FieldElement<F>>) -> Self::Commitment;
    fn commit_univariate(&self, bp: &UnivariatePolynomial<FieldElement<F>>) -> Self::Commitment;


    fn open(
        &self,
        x: &FieldElement<F>,
        y: &FieldElement<F>,
        evaluation: &FieldElement<F>,//f(x,y)
        p: &BivariatePolynomial<FieldElement<F>>,
    ) -> (Self::Commitment,Self::Commitment);


    fn verify(
        &self,
        x: &FieldElement<F>,
        y: &FieldElement<F>,
        evaluation: &FieldElement<F>,
        p_commitment: &Self::Commitment,
        proofs: &(Self::Commitment,Self::Commitment),
    ) -> bool;

}
