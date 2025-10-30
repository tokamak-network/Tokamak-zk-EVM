use crate::errors::{TrustedSetupError, Result};
use icicle_bls12_381::curve::{G1Affine, G2Affine, ScalarField};
use icicle_core::traits::FieldImpl;
use ark_bls12_381::{G1Affine as ArkG1, G2Affine as ArkG2, Fr as ArkFr};
use ark_ff::Field;
use serde::{Deserialize, Serialize};

/// Serializable wrapper for G1Affine points using raw bytes
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct G1SerdeWrapper {
    pub x_bytes: Vec<u8>,
    pub y_bytes: Vec<u8>,
}

/// Serializable wrapper for G2Affine points using raw bytes
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct G2SerdeWrapper {
    pub x_bytes: Vec<u8>,
    pub y_bytes: Vec<u8>,
}

/// Serializable wrapper for ScalarField using raw bytes
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScalarFieldWrapper {
    pub bytes: Vec<u8>,
}

/// JSON-friendly wrapper for G1Affine points using hex strings
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct G1JsonWrapper {
    pub x: String,
    pub y: String,
}

/// JSON-friendly wrapper for G2Affine points using hex strings
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct G2JsonWrapper {
    pub x: String,
    pub y: String,
}

/// JSON-friendly wrapper for ScalarField using hex strings
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScalarJsonWrapper {
    pub value: String,
}

impl From<G1Affine> for G1SerdeWrapper {
    fn from(point: G1Affine) -> Self {
        Self {
            x_bytes: point.x.to_bytes_le(),
            y_bytes: point.y.to_bytes_le(),
        }
    }
}

impl From<G2Affine> for G2SerdeWrapper {
    fn from(point: G2Affine) -> Self {
        Self {
            x_bytes: point.x.to_bytes_le(),
            y_bytes: point.y.to_bytes_le(),
        }
    }
}

impl From<ScalarField> for ScalarFieldWrapper {
    fn from(field: ScalarField) -> Self {
        Self {
            bytes: field.to_bytes_le(),
        }
    }
}

impl G1SerdeWrapper {
    pub fn to_g1_affine(&self) -> G1Affine {
        let mut point = G1Affine::zero();
        point.x = FieldImpl::from_bytes_le(&self.x_bytes);
        point.y = FieldImpl::from_bytes_le(&self.y_bytes);
        point
    }
    
    /// Convert to JSON-friendly wrapper
    pub fn to_json(&self) -> G1JsonWrapper {
        G1JsonWrapper {
            x: hex::encode(&self.x_bytes),
            y: hex::encode(&self.y_bytes),
        }
    }
    
    pub fn to_ark_g1(&self) -> Result<ArkG1> {
        let point = self.to_g1_affine();
        let x_bytes = point.x.to_bytes_le();
        let y_bytes = point.y.to_bytes_le();
        
        let x = ark_bls12_381::Fq::from_random_bytes(&x_bytes)
            .ok_or(TrustedSetupError::SerializationError("Failed to deserialize G1 x coordinate".to_string()))?;
        let y = ark_bls12_381::Fq::from_random_bytes(&y_bytes)
            .ok_or(TrustedSetupError::SerializationError("Failed to deserialize G1 y coordinate".to_string()))?;
        
        Ok(ArkG1::new_unchecked(x, y))
    }
}

impl G2SerdeWrapper {
    pub fn to_g2_affine(&self) -> G2Affine {
        let mut point = G2Affine::zero();
        point.x = FieldImpl::from_bytes_le(&self.x_bytes);
        point.y = FieldImpl::from_bytes_le(&self.y_bytes);
        point
    }
    
    /// Convert to JSON-friendly wrapper
    pub fn to_json(&self) -> G2JsonWrapper {
        G2JsonWrapper {
            x: hex::encode(&self.x_bytes),
            y: hex::encode(&self.y_bytes),
        }
    }
    
    pub fn to_ark_g2(&self) -> Result<ArkG2> {
        let point = self.to_g2_affine();
        let x_bytes = point.x.to_bytes_le();
        let y_bytes = point.y.to_bytes_le();
        
        let x = ark_bls12_381::Fq2::from_random_bytes(&x_bytes)
            .ok_or(TrustedSetupError::SerializationError("Failed to deserialize G2 x coordinate".to_string()))?;
        let y = ark_bls12_381::Fq2::from_random_bytes(&y_bytes)
            .ok_or(TrustedSetupError::SerializationError("Failed to deserialize G2 y coordinate".to_string()))?;
        
        Ok(ArkG2::new_unchecked(x, y))
    }
}

impl ScalarFieldWrapper {
    pub fn to_scalar_field(&self) -> ScalarField {
        FieldImpl::from_bytes_le(&self.bytes)
    }
    
    /// Convert to JSON-friendly wrapper
    pub fn to_json(&self) -> ScalarJsonWrapper {
        ScalarJsonWrapper {
            value: hex::encode(&self.bytes),
        }
    }
    
    pub fn to_ark_scalar(&self) -> Result<ArkFr> {
        ArkFr::from_random_bytes(&self.bytes)
            .ok_or(TrustedSetupError::SerializationError("Failed to deserialize scalar field".to_string()))
    }
}