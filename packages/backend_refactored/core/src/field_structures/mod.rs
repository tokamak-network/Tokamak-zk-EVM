use crate::curves::CurveConfig;
use std::ops::{Add, Mul, Sub};

#[derive(Clone, Debug, PartialEq)]
pub struct FieldSerde<C: CurveConfig> {
    pub field: C::ScalarField,
}

impl<C: CurveConfig> Add<C::ScalarField> for FieldSerde<C> {
    type Output = Self;

    fn add(self, other: C::ScalarField) -> Self {
        Self {
            field: self.field + other,
        }
    }
}

impl<C: CurveConfig> Sub<C::ScalarField> for FieldSerde<C> {
    type Output = Self;

    fn sub(self, other: C::ScalarField) -> Self {
        Self {
            field: self.field - other,
        }
    }
}

impl<C: CurveConfig> Mul<C::ScalarField> for FieldSerde<C> {
    type Output = Self;

    fn mul(self, other: C::ScalarField) -> Self {
        Self {
            field: self.field * other,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::curves::Bls12_381Config;
    use icicle_core::traits::FieldImpl;

    type TestField = FieldSerde<Bls12_381Config>;

    fn create_test_field(value: <Bls12_381Config as CurveConfig>::ScalarField) -> TestField {
        TestField { field: value }
    }

    #[test]
    fn test_basic_arithmetic() {
        let scalar_a = <Bls12_381Config as CurveConfig>::ScalarField::one();
        let scalar_b = <Bls12_381Config as CurveConfig>::ScalarField::one();

        let a = create_test_field(scalar_a);
        let b = create_test_field(scalar_b);

        let sum = a.clone() + b.field;
        let diff = sum.clone() - a.field;
        let product = a.clone() * b.field;

        assert_eq!(diff, b);
        assert_eq!(product.field, scalar_a * scalar_b);
    }

    #[test]
    fn test_mixed_operations() {
        let scalar_one = <Bls12_381Config as CurveConfig>::ScalarField::one();
        let scalar_two = scalar_one + scalar_one;

        let field_one = create_test_field(scalar_one);
        let field_two = create_test_field(scalar_two);

        let result1 = field_one.clone() + scalar_one;
        assert_eq!(result1, field_two);

        let result2 = field_two.clone() - scalar_one;
        assert_eq!(result2, field_one);

        let result3 = field_one.clone() * scalar_two;
        assert_eq!(result3, field_two);
    }

    #[test]
    fn test_scalar_operations_commutative() {
        let scalar_one = <Bls12_381Config as CurveConfig>::ScalarField::one();
        let scalar_two = scalar_one + scalar_one;

        let field_one = create_test_field(scalar_one);
        let field_three = create_test_field(scalar_one + scalar_two);

        // Test FieldSerde + Scalar (commutative)
        let result1 = field_one.clone() + scalar_two;
        assert_eq!(result1, field_three);

        // Test FieldSerde * Scalar (commutative)
        let result3 = field_one.clone() * scalar_two;
        let field_two = create_test_field(scalar_two);
        assert_eq!(result3, field_two);
    }

    #[test]
    fn test_associativity() {
        let scalar_a = <Bls12_381Config as CurveConfig>::ScalarField::one();
        let scalar_b = scalar_a + scalar_a; // 2
        let scalar_c = scalar_b + scalar_a; // 3

        let a = create_test_field(scalar_a);
        let b = create_test_field(scalar_b);
        let c = create_test_field(scalar_c);

        assert_eq!(
            (a.clone() + b.field) + c.field,
            a.clone() + (b.field + c.field)
        );
        assert_eq!(
            (a.clone() * b.field) * c.field,
            a.clone() * (b.field * c.field)
        );
    }

    #[test]
    fn test_commutativity() {
        let scalar_a = <Bls12_381Config as CurveConfig>::ScalarField::one();
        let scalar_b = scalar_a + scalar_a;

        let a = create_test_field(scalar_a);
        let b = create_test_field(scalar_b);

        assert_eq!(a.clone() + b.field, b.clone() + a.field);
        assert_eq!(a.clone() * b.field, b.clone() * a.field);
    }
}
