use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;
use serde::de::{Deserializer, Error, Visitor};
use serde::{Deserialize, Serialize};
use std::fmt;
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

impl Serialize for FieldSerde {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let string = self.0.to_string();
        serializer.serialize_str(&string)
    }
}

impl<'de> Deserialize<'de> for FieldSerde {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct FieldVisitor;

        impl<'de> Visitor<'de> for FieldVisitor {
            type Value = FieldSerde;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a hex string representing ScalarField")
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: Error,
            {
                let scalar = ScalarField::from_hex(v);
                Ok(FieldSerde(scalar))
            }
        }

        deserializer.deserialize_str(FieldVisitor)
    }
}

// TODO: move the tests and add unit tests here.
