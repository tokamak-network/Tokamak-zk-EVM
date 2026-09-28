//! Online ingress: no circuit library, selector, permutation, or full CRS.
use crate::{parameters, Verifier, VerifyError};
use ark_bls12_381::Fr;
use ark_ff::PrimeField;
use libs::frontend_artifacts::Instance;
use std::{fs, path::Path};

pub struct OnlineVerifyInputPaths<'a> {
    pub preprocess_path: &'a Path,
    pub instance_path: &'a Path,
    pub proof_path: &'a Path,
}

pub fn verify(paths: &OnlineVerifyInputPaths<'_>) -> Result<bool, VerifyError> {
    let verifier = Verifier::from_bytes(&read(paths.preprocess_path)?)?;
    let public = read_public_inputs(paths.instance_path)?;
    verifier.verify(&public, &read(paths.proof_path)?)
}

pub fn read_public_inputs(path: &Path) -> Result<Vec<Fr>, VerifyError> {
    let instance: Instance = serde_json::from_slice(&read(path)?)
        .map_err(|e| VerifyError::Invalid(format!("{}: {e}", path.display())))?;
    public_inputs(&instance)
}

fn public_inputs(instance: &Instance) -> Result<Vec<Fr>, VerifyError> {
    // Preserve the synthesizer's instance container. Only its free prefix
    // enters the online algorithm; fixed raw values are not required or used.
    let public = instance
        .a_pub_user
        .iter()
        .chain(instance.a_pub_block.iter())
        .chain(instance.a_pub_function.iter())
        .take(parameters::L_FREE as usize)
        .map(|value| scalar(value.as_ref()))
        .collect::<Result<Vec<_>, _>>()?;
    if public.len() != parameters::L_FREE as usize {
        return Err("instance does not contain the complete free-public prefix".into());
    }
    Ok(public)
}

fn scalar(text: &str) -> Result<Fr, VerifyError> {
    let text = text.strip_prefix("0x").unwrap_or(text);
    if text.is_empty() || text.len() > 64 {
        return Err("invalid public scalar length".into());
    }
    let padded = if text.len() % 2 == 1 {
        format!("0{text}")
    } else {
        text.to_owned()
    };
    let mut bytes = hex::decode(padded).map_err(|e| VerifyError::Invalid(e.to_string()))?;
    bytes.reverse();
    bytes.resize(32, 0);
    if !libs::univariate_field::canonical_scalar(&bytes) {
        return Err("noncanonical public scalar".into());
    }
    Ok(Fr::from_le_bytes_mod_order(&bytes))
}

fn read(path: &Path) -> Result<Vec<u8>, VerifyError> {
    fs::read(path).map_err(|source| VerifyError::Io {
        path: path.to_owned(),
        source,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_ff::{BigInteger, Zero};
    #[test]
    fn scalar_encoding_is_strict() {
        assert_eq!(scalar("0x0").unwrap(), Fr::zero());
        assert_eq!(scalar("a").unwrap(), Fr::from(10u64));
        for value in ["", "0x", "-1", "xx"] {
            assert!(scalar(value).is_err());
        }
        assert!(scalar(&hex::encode(Fr::MODULUS.to_bytes_be())).is_err());
        assert!(scalar(&"0".repeat(65)).is_err());
    }

    #[test]
    fn only_the_complete_free_prefix_is_required() {
        let mut instance: Instance = serde_json::from_value(serde_json::json!({
            "a_pub_user": vec!["0x1"; parameters::L_FREE as usize],
            "a_pub_block": [], "a_pub_function": []
        }))
        .unwrap();
        let free = public_inputs(&instance).unwrap();
        assert_eq!(free.len(), parameters::L_FREE as usize);
        instance.a_pub_function = serde_json::from_value(serde_json::json!(["0x9"])).unwrap();
        assert_eq!(public_inputs(&instance).unwrap(), free);
        instance.a_pub_function = Box::new([]);
        instance.a_pub_user = instance.a_pub_user[..instance.a_pub_user.len() - 1]
            .to_vec()
            .into_boxed_slice();
        assert!(public_inputs(&instance).is_err());
    }
}
