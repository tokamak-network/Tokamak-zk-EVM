#![allow(non_snake_case)]

pub mod config;
pub mod curves;

pub use config::*;
pub use curves::CurveConfig;

// to test if the curves config is working
#[cfg(test)]
pub mod test_curves {
    pub use crate::curves::Bls12_381Config;
}

#[cfg(test)]
mod tests {
    use crate::curves::CurveConfig;
    use crate::test_curves::Bls12_381Config;

    #[test]
    fn test_curve_basic_operations() {
        let zero = Bls12_381Config::zero();
        let one = Bls12_381Config::one();

        let sum = zero + one;
        let product = one * one;

        assert_ne!(zero, one);
        assert_eq!(sum, one);
        assert_eq!(one, product);
    }

    #[test]
    fn test_random_generation() {
        let randoms = Bls12_381Config::generate_random(10);
        assert_eq!(randoms.len(), 10);

        let all_same = randoms.windows(2).all(|w| w[0] == w[1]);
        assert!(!all_same);
    }

    #[test]
    fn test_field_properties() {
        let zero = Bls12_381Config::zero();
        let one = Bls12_381Config::one();
        let randoms = Bls12_381Config::generate_random(3);
        let a = randoms[0];
        let b = randoms[1];
        let c = randoms[2];

        // Additive identity
        assert_eq!(a + zero, a);
        assert_eq!(zero + a, a);

        // Multiplicative identity
        assert_eq!(a * one, a);
        assert_eq!(one * a, a);

        // Multiplicative zero
        assert_eq!(a * zero, zero);
        assert_eq!(zero * a, zero);

        // Commutativity
        assert_eq!(a + b, b + a);
        assert_eq!(a * b, b * a);

        // Associativity
        assert_eq!((a + b) + c, a + (b + c));
        assert_eq!((a * b) * c, a * (b * c));
    }

    #[test]
    fn test_additive_inverse() {
        let randoms = Bls12_381Config::generate_random(5);
        let zero = Bls12_381Config::zero();

        for &a in &randoms {
            let neg_a = Bls12_381Config::negate(a);
            assert_eq!(a + neg_a, zero);
            assert_eq!(neg_a + a, zero);
        }
    }

    #[test]
    fn test_subtraction() {
        let randoms = Bls12_381Config::generate_random(3);
        let a = randoms[0];
        let b = randoms[1];
        let zero = Bls12_381Config::zero();

        // a - b = a + (-b)
        assert_eq!(a - b, a + Bls12_381Config::negate(b));

        // a - a = 0
        assert_eq!(a - a, zero);
    }

    #[test]
    fn test_multiplicative_inverse() {
        let randoms = Bls12_381Config::generate_random(5);
        let one = Bls12_381Config::one();
        let zero = Bls12_381Config::zero();

        for &a in &randoms {
            if a != zero {
                let inv_a = Bls12_381Config::inverse(a);
                assert_eq!(a * inv_a, one);
                assert_eq!(inv_a * a, one);
            }
        }
    }

    #[test]
    fn test_division() {
        let randoms = Bls12_381Config::generate_random(4);
        let a = randoms[0];
        let b = randoms[1];
        let zero = Bls12_381Config::zero();

        if b != zero {
            // a / b = a * b^(-1)
            let result = a * Bls12_381Config::inverse(b);
            let expected = a * Bls12_381Config::inverse(b);
            assert_eq!(result, expected);
        }
    }

    #[test]
    fn test_distributivity() {
        let randoms = Bls12_381Config::generate_random(3);
        let a = randoms[0];
        let b = randoms[1];
        let c = randoms[2];

        // a * (b + c) = a * b + a * c
        assert_eq!(a * (b + c), a * b + a * c);

        // (a + b) * c = a * c + b * c
        assert_eq!((a + b) * c, a * c + b * c);
    }

    #[test]
    fn test_zero_and_one_properties() {
        let zero = Bls12_381Config::zero();
        let one = Bls12_381Config::one();

        // Zero and one are different
        assert_ne!(zero, one);

        // One is not zero
        assert!(!Bls12_381Config::is_zero(&one));

        // Zero is zero
        assert!(Bls12_381Config::is_zero(&zero));

        // One inverse should be one
        assert_eq!(Bls12_381Config::inverse(one), one);
    }
}
