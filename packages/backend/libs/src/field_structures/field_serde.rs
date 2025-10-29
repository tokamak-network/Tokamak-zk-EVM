use icicle_bls12_381::curve::ScalarField;
use std::ops::{Add, Mul, Sub};

#[derive(Clone, Debug, Copy, PartialEq)]
pub struct FieldSerde(pub ScalarField);
impl Add for FieldSerde {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        FieldSerde(self.0 + other.0)
    }
}

impl Sub for FieldSerde {
    type Output = Self;

    fn sub(self, other: Self) -> Self {
        FieldSerde(self.0 - other.0)
    }
}

impl Mul for FieldSerde {
    type Output = Self;

    fn mul(self, other: Self) -> Self {
        FieldSerde(self.0 * other.0)
    }
}

// serde - original
impl Sub<ScalarField> for FieldSerde {
    type Output = Self;

    fn sub(self, other: ScalarField) -> Self {
        FieldSerde(self.0 - other)
    }
}

// original - serde
impl Sub<FieldSerde> for ScalarField {
    type Output = FieldSerde;

    fn sub(self, other: FieldSerde) -> Self::Output {
        FieldSerde(self - other.0)
    }
}

// serde + original
impl Add<ScalarField> for FieldSerde {
    type Output = Self;

    fn add(self, other: ScalarField) -> Self {
        FieldSerde(self.0 + other)
    }
}

// original + serde
impl Add<FieldSerde> for ScalarField {
    type Output = FieldSerde;

    fn add(self, other: FieldSerde) -> Self::Output {
        FieldSerde(self + other.0)
    }
}

// serde * original
impl Mul<ScalarField> for FieldSerde {
    type Output = Self;

    fn mul(self, other: ScalarField) -> Self {
        FieldSerde(self.0 * other)
    }
}

// original * serde
impl Mul<FieldSerde> for ScalarField {
    type Output = FieldSerde;

    fn mul(self, other: FieldSerde) -> Self::Output {
        FieldSerde(self * other.0)
    }
}

// TODO: move (de)serialize impl here
// TODO: move the tests and add unit tests here.
