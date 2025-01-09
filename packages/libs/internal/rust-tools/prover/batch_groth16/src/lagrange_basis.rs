use lambdaworks_math::field::element::FieldElement;
use lambdaworks_math::field::traits::IsField;
use lambdaworks_math::polynomial::Polynomial as UnivariatePolynomial;

pub fn calculate_lagrange_basis<E>(subcircuit_index: u64) -> UnivariatePolynomial<FieldElement<E>>
    where
        E: IsField,
{
    todo!()
}