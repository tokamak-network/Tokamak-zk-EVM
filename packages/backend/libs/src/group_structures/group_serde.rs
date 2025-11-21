use crate::field_structures::FieldSerde;
use ark_bls12_381::{Bls12_381, G1Affine as ArkG1Affine, G2Affine as ArkG2Affine};
use ark_ec::pairing::{Pairing, PairingOutput};
use ark_ff::Field;
use icicle_bls12_381::curve::{BaseField, G1Affine, G2Affine, G2BaseField, ScalarField};
use icicle_core::traits::FieldImpl;
use serde::ser::SerializeStruct;
use serde::{Deserialize, Serialize};
use std::ops::{Add, Mul, Sub};

#[derive(Clone, Debug, Copy, PartialEq)]
pub struct G1serde(pub G1Affine);
impl G1serde {
    pub fn zero() -> Self {
        Self(G1Affine::zero())
    }
}

impl Add for G1serde {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        G1serde(G1Affine::from(
            self.0.to_projective() + other.0.to_projective(),
        ))
    }
}

impl Sub for G1serde {
    type Output = Self;

    fn sub(self, other: Self) -> Self {
        G1serde(G1Affine::from(
            self.0.to_projective() - other.0.to_projective(),
        ))
    }
}

// G1serde * original field
impl Mul<ScalarField> for G1serde {
    type Output = Self;

    fn mul(self, other: ScalarField) -> Self {
        G1serde(G1Affine::from(self.0.to_projective() * other))
    }
}

// original field * G1serde
impl Mul<G1serde> for ScalarField {
    type Output = G1serde;

    fn mul(self, other: G1serde) -> Self::Output {
        G1serde(G1Affine::from(other.0.to_projective() * self))
    }
}

// G1serde * FieldSerde
impl Mul<FieldSerde> for G1serde {
    type Output = Self;

    fn mul(self, other: FieldSerde) -> Self {
        G1serde(G1Affine::from(self.0.to_projective() * other.0))
    }
}

// original field * G1serde
impl Mul<G1serde> for FieldSerde {
    type Output = G1serde;

    fn mul(self, other: G1serde) -> Self::Output {
        G1serde(G1Affine::from(other.0.to_projective() * self.0))
    }
}

#[derive(Clone, Debug, Copy, PartialEq)]
pub struct G2serde(pub G2Affine);
impl G2serde {
    pub fn zero() -> Self {
        Self(G2Affine::zero())
    }
}

//new added for G2Serde
impl Add for G2serde {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        G2serde(G2Affine::from(
            self.0.to_projective() + other.0.to_projective(),
        ))
    }
}

impl Sub for G2serde {
    type Output = Self;

    fn sub(self, other: Self) -> Self {
        G2serde(G2Affine::from(
            self.0.to_projective() - other.0.to_projective(),
        ))
    }
}

// G2serde * original field
impl Mul<ScalarField> for G2serde {
    type Output = Self;

    fn mul(self, other: ScalarField) -> Self {
        G2serde(G2Affine::from(self.0.to_projective() * other))
    }
}

// original field * G2serde
impl Mul<G2serde> for ScalarField {
    type Output = G2serde;

    fn mul(self, other: G2serde) -> Self::Output {
        G2serde(G2Affine::from(other.0.to_projective() * self))
    }
}

// G2serde * FieldSerde
impl Mul<FieldSerde> for G2serde {
    type Output = Self;

    fn mul(self, other: FieldSerde) -> Self {
        G2serde(G2Affine::from(self.0.to_projective() * other.0))
    }
}

// original field * G2serde
impl Mul<G2serde> for FieldSerde {
    type Output = G2serde;

    fn mul(self, other: G2serde) -> Self::Output {
        G2serde(G2Affine::from(other.0.to_projective() * self.0))
    }
}

impl Serialize for G1serde {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut s = serializer.serialize_struct("G1serde", 2)?;
        let x_coord = &self.0.x.to_string();
        let y_coord = &self.0.y.to_string();
        s.serialize_field("x", x_coord)?;
        s.serialize_field("y", y_coord)?;
        s.end()
    }
}
impl<'de> Deserialize<'de> for G1serde {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct G1Coords {
            x: String,
            y: String,
        }
        let G1Coords { x, y } = G1Coords::deserialize(deserializer)?;
        let x_field = BaseField::from_hex(&x).into();
        let y_field = BaseField::from_hex(&y).into();
        let point = G1Affine::from_limbs(x_field, y_field);
        Ok(G1serde(point))
    }
}

impl G1serde {
    pub fn to_rust_code(&self) -> String {
        let x_bytes = self.0.x.to_bytes_le();
        let y_bytes = self.0.y.to_bytes_le();

        format!(
            "G1serde(G1Affine::from_limbs(BaseField::from_bytes_le(&[{}]).into(),BaseField::from_bytes_le(&[{}]).into()))",
            &x_bytes.iter().map(|b| format!("{}", b)).collect::<Vec<_>>().join(", "),
            &y_bytes.iter().map(|b| format!("{}", b)).collect::<Vec<_>>().join(", ")
        )
    }
}

impl Serialize for G2serde {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut s = serializer.serialize_struct("G2", 2)?;
        let x_coord = &self.0.x.to_string();
        let y_coord = &self.0.y.to_string();
        s.serialize_field("x", x_coord)?;
        s.serialize_field("y", y_coord)?;
        s.end()
    }
}
impl<'de> Deserialize<'de> for G2serde {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct G2Coords {
            x: String,
            y: String,
        }
        let G2Coords { x, y } = G2Coords::deserialize(deserializer)?;
        let x_field = G2BaseField::from_hex(&x).into();
        let y_field = G2BaseField::from_hex(&y).into();
        let point = G2Affine::from_limbs(x_field, y_field);
        Ok(G2serde(point))
    }
}
impl G2serde {
    pub fn to_rust_code(&self) -> String {
        let x_bytes = self.0.x.to_bytes_le();
        let y_bytes = self.0.y.to_bytes_le();

        format!(
            "G2serde(G2Affine::from_limbs(G2BaseField::from_bytes_le(&[{}]).into(),G2BaseField::from_bytes_le(&[{}]).into()))",
            &x_bytes.iter().map(|b| format!("{}", b)).collect::<Vec<_>>().join(", "),
            &y_bytes.iter().map(|b| format!("{}", b)).collect::<Vec<_>>().join(", ")
        )
    }
}

// Pairing function for multi-pairing computation
pub fn pairing(lhs: &[G1serde], rhs: &[G2serde]) -> PairingOutput<Bls12_381> {
    let lhs_ark: Vec<ArkG1Affine> = lhs.iter().map(|x| icicle_g1_affine_to_ark(&x.0)).collect();
    let rhs_ark: Vec<ArkG2Affine> = rhs.iter().map(|x| icicle_g2_affine_to_ark(&x.0)).collect();
    Bls12_381::multi_pairing(lhs_ark, rhs_ark)
}

// Conversion functions from Icicle to Arkworks format
pub fn icicle_g1_affine_to_ark(g: &G1Affine) -> ArkG1Affine {
    let x_bytes = g.x.to_bytes_le();
    let y_bytes = g.y.to_bytes_le();
    let x = ark_bls12_381::Fq::from_random_bytes(&x_bytes)
        .expect("failed to convert x from icicle to ark");
    let y = ark_bls12_381::Fq::from_random_bytes(&y_bytes)
        .expect("failed to convert y from icicle to ark");
    ArkG1Affine::new_unchecked(x, y)
}

pub fn icicle_g2_affine_to_ark(g: &G2Affine) -> ArkG2Affine {
    let x_bytes = g.x.to_bytes_le();
    let y_bytes = g.y.to_bytes_le();
    let x = ark_bls12_381::Fq2::from_random_bytes(&x_bytes)
        .expect("failed to convert x from icicle to ark");
    let y = ark_bls12_381::Fq2::from_random_bytes(&y_bytes)
        .expect("failed to convert y from icicle to ark");
    ArkG2Affine::new_unchecked(x, y)
}

// TODO: move the tests and add unit tests here.
