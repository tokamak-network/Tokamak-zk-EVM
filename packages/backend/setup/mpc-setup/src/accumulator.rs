use crate::conversions::{
    deserialize_g1serde, deserialize_g2serde, serialize_g1serde, serialize_g2serde,
};
use crate::sigma::{AaccExt, HASH_BYTES_LEN};
use crate::utils::{
    compute_phase1_x_only, verify_phase1_x_only, PairSerde, Phase1Proof, RandomGenerator,
    SerialSerde,
};
use crate::{impl_read_from_json, impl_write_into_json};
use ark_serialize::Compress;
use ark_std::env;
use ark_std::fs;
use blake2::{Blake2b, Digest};
use icicle_bls12_381::curve::G1Affine;
use libs::group_structures::{G1serde, G2serde};
use libs::iotools::{G1SerdeRkyv, G2SerdeRkyv};
use serde::ser::SerializeStruct;
use serde::{Deserialize, Serialize};
use serde_json::from_reader;
use serde_json::to_writer_pretty;
use std::fs::File;
use std::io;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq)]
pub struct Accumulator {
    pub contributor_index: usize,
    pub g1: G1serde,
    pub g2: G2serde,
    pub alpha: Vec<PairSerde>,
    pub x: SerialSerde,
    pub alpha_x: Vec<G1serde>,
    pub compress: bool, // ← this is the controlling flag
}
impl Serialize for Accumulator {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut state = serializer.serialize_struct("Accumulator", 7)?;

        let compress = if self.compress {
            Compress::Yes
        } else {
            Compress::No
        };

        let to_str_vec = |v: &Vec<G1serde>| -> Vec<String> {
            v.iter().map(|g| serialize_g1serde(g, compress)).collect()
        };

        state.serialize_field("contributor_index", &self.contributor_index)?;
        state.serialize_field("g1", &serialize_g1serde(&self.g1, compress))?;
        state.serialize_field("g2", &serialize_g2serde(&self.g2, compress))?;
        state.serialize_field("compress", &format!("{:?}", compress == Compress::Yes))?;

        state.serialize_field(
            "alpha",
            &self
                .alpha
                .iter()
                .map(|p| p.serialize_with_compress(compress))
                .collect::<Vec<_>>(),
        )?;
        let (x_g1, x_g2) = self.x.serialize_with_compress(compress);
        state.serialize_field("x_g1", &x_g1)?;
        state.serialize_field("x_g2", &x_g2)?;
        state.serialize_field("alpha_x", &to_str_vec(&self.alpha_x))?;

        state.end()
    }
}
impl<'de> Deserialize<'de> for Accumulator {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct Helper {
            contributor_index: usize,
            g1: String,
            g2: String,
            compress: String,
            alpha: Vec<(String, String)>,
            x_g1: Vec<String>,
            x_g2: String,
            alpha_x: Vec<String>,
        }

        let Helper {
            contributor_index,
            g1,
            g2,
            compress,
            alpha,
            x_g1,
            x_g2,
            alpha_x,
        } = Helper::deserialize(deserializer)?;

        let compress_mode = match compress.as_str() {
            "true" => Compress::Yes,
            "false" => Compress::No,
            _ => return Err(serde::de::Error::custom("Invalid compress flag")),
        };

        let parse_vec = |v: Vec<String>| -> Vec<G1serde> {
            v.iter()
                .map(|s| deserialize_g1serde(s, compress_mode))
                .collect()
        };

        Ok(Accumulator {
            contributor_index,
            g1: deserialize_g1serde(&g1, compress_mode),
            g2: deserialize_g2serde(&g2, compress_mode),
            alpha: alpha
                .iter()
                .map(|(a, b)| PairSerde::deserialize_with_compress(a, b, compress_mode))
                .collect(),
            x: SerialSerde::deserialize_with_compress(x_g1, x_g2, compress_mode),
            alpha_x: parse_vec(alpha_x),
            compress: compress_mode == Compress::Yes,
        })
    }
}
impl_write_into_json!(Accumulator);
impl_read_from_json!(Accumulator);

#[derive(Debug, Clone, Copy, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
#[archive(check_bytes)]
pub struct PairSerdeRkyv {
    pub g1: G1SerdeRkyv,
    pub g2: G2SerdeRkyv,
}

#[derive(Debug, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
#[archive(check_bytes)]
pub struct SerialSerdeRkyv {
    pub g1: Vec<G1SerdeRkyv>,
    pub g2: G2SerdeRkyv,
}

#[derive(Debug, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
#[archive(check_bytes)]
pub struct AccumulatorRkyv {
    pub contributor_index: usize,
    pub g1: G1SerdeRkyv,
    pub g2: G2SerdeRkyv,
    pub alpha: Vec<PairSerdeRkyv>,
    pub x: SerialSerdeRkyv,
    pub alpha_x: Vec<G1SerdeRkyv>,
    pub compress: bool,
}

impl PairSerdeRkyv {
    fn from_pair_serde(value: &PairSerde) -> Self {
        Self {
            g1: G1SerdeRkyv::from_g1serde(&value.g1),
            g2: G2SerdeRkyv::from_g2serde(&value.g2),
        }
    }
}

impl SerialSerdeRkyv {
    fn from_serial_serde(value: &SerialSerde) -> Self {
        Self {
            g1: value.g1.iter().map(G1SerdeRkyv::from_g1serde).collect(),
            g2: G2SerdeRkyv::from_g2serde(&value.g2),
        }
    }
}

impl AccumulatorRkyv {
    pub fn from_accumulator(value: &Accumulator) -> Self {
        Self {
            contributor_index: value.contributor_index,
            g1: G1SerdeRkyv::from_g1serde(&value.g1),
            g2: G2SerdeRkyv::from_g2serde(&value.g2),
            alpha: value
                .alpha
                .iter()
                .map(PairSerdeRkyv::from_pair_serde)
                .collect(),
            x: SerialSerdeRkyv::from_serial_serde(&value.x),
            alpha_x: value
                .alpha_x
                .iter()
                .map(G1SerdeRkyv::from_g1serde)
                .collect(),
            compress: value.compress,
        }
    }
}

impl Accumulator {
    pub fn rkyv_path_for_json_path(path: &Path) -> PathBuf {
        path.with_extension("rkyv")
    }

    pub fn write_into_rkyv_path(&self, path: &Path) -> io::Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let archive = AccumulatorRkyv::from_accumulator(self);
        let bytes = rkyv::to_bytes::<_, 256>(&archive).map_err(|err| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("failed to serialize accumulator archive: {err}"),
            )
        })?;
        std::fs::write(path, bytes)
    }

    pub fn write_rkyv_sidecar_for_json_path(&self, path: &str) -> io::Result<PathBuf> {
        let abs_json_path = env::current_dir()?.join(path);
        let rkyv_path = Self::rkyv_path_for_json_path(&abs_json_path);
        self.write_into_rkyv_path(&rkyv_path)?;
        Ok(rkyv_path)
    }

    pub fn new(
        g1: G1serde,
        g2: G2serde,
        power_alpha_length: usize,
        power_x_length: usize,
        compress: bool,
    ) -> Self {
        Accumulator {
            g1,
            g2,
            // [alpha^1,alpha^2,...,alpha^power_alpha_length]
            alpha: vec![PairSerde::new(g1, g2); power_alpha_length],
            // [x^1,x^2,...,x^power_x_length]
            x: SerialSerde::new(g1, g2, power_x_length),
            // [alpha^1 * x^1...alpha^i * x^j,...,alpha^power_alpha_length * x^power_x_length]
            alpha_x: vec![g1; power_alpha_length * power_x_length],
            contributor_index: 0,
            compress,
        }
    }
    pub fn get_x_g1_range(&self, exp_min: usize, exp_max: usize) -> Vec<G1Affine> {
        let mut out = vec![G1Affine::zero(); exp_max - exp_min + 1];
        for i in exp_min..exp_max + 1 {
            out[i - exp_min] = self.get_x_g1(i).0;
        }
        out
    }

    //x^exp * G1
    pub fn get_x_g1(&self, exp: usize) -> G1serde {
        if exp == 0 {
            return self.g1;
        }
        self.x.get_g1(exp - 1)
    }
    pub fn get_x_g2(&self, exp: usize) -> G2serde {
        assert_eq!(exp, 1, "only x^1 in G2 is stored in phase-1");
        self.x.get_g2()
    }
    //alpha^exp * G1
    pub fn get_alpha_g1(&self, exp: usize) -> G1serde {
        if exp == 0 {
            return self.g1;
        }
        let result = self.alpha.get(exp - 1).unwrap();
        result.g1
    }

    //alpha^exp_alpha * x^exp_x * G1
    pub fn get_alphax_g1(&self, exp_alpha: usize, exp_x: usize) -> G1serde {
        assert_eq!(exp_alpha <= 4, true);
        assert_eq!(exp_x <= self.x.len_g1(), true);
        if exp_alpha == 0 && exp_x == 0 {
            return self.g1;
        } else if exp_alpha == 0 {
            return self.get_x_g1(exp_x);
        } else if exp_x == 0 {
            return self.get_alpha_g1(exp_alpha);
        }
        //TODO check if this is correct
        let idx = (exp_alpha - 1) * self.x.len_g1() + exp_x - 1;
        //   println!("alpha: {} x: {} idx: {} len_alpha_x {}", exp_alpha, exp_x, idx, self.alpha_x.len());
        *self.alpha_x.get(idx).unwrap()
    }

    pub fn compute(&self, rng: &mut RandomGenerator) -> (Accumulator, Phase1Proof) {
        let (cur_alphax, cur_alpha, cur_x, mut proof_5) = compute_phase1_x_only(
            rng,
            &self.g1,
            &self.alpha_x,
            &self.alpha,
            &self.x,
            &self.hash(),
        );

        let acc = Accumulator {
            g1: self.g1,
            g2: self.g2,
            alpha: cur_alpha,
            x: cur_x,
            alpha_x: cur_alphax,
            contributor_index: self.contributor_index + 1,
            compress: self.compress,
        };
        proof_5.contributor_index = acc.contributor_index;
        (acc, proof_5)
    }
    pub fn verify(&self, cur: &Accumulator, cur_proof: &Phase1Proof) -> bool {
        verify_phase1_x_only(
            &self.g1,
            &self.g2,
            &self.alpha,
            &self.x,
            &cur.alpha_x,
            &cur.alpha,
            &cur.x,
            &cur_proof,
        )
    }
    pub fn hash(&self) -> [u8; HASH_BYTES_LEN] {
        let out = self.blake2b_hash();
        let mut result = [0u8; HASH_BYTES_LEN];
        result.copy_from_slice(&out[..HASH_BYTES_LEN]);
        result
    }
}

impl AaccExt for Accumulator {
    fn get_contributor_index(&self) -> u32 {
        self.contributor_index as u32
    }
    fn blake2b_hash(&self) -> [u8; HASH_BYTES_LEN] {
        // Serialize without the hash field
        let serialized = bincode::serialize(&self).expect("Serialization failed for Accumulator");

        let hash = Blake2b::digest(&serialized);

        let mut result = [0u8; HASH_BYTES_LEN];
        result.copy_from_slice(&hash[..HASH_BYTES_LEN]);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json;

    #[test]
    fn test_accumulator_serialization_roundtrip() {
        let g1 = crate::utils::icicle_g1_generator();
        let g2 = crate::utils::icicle_g2_generator();
        // Construct dummy data for the Accumulator struct
        let accumulator = Accumulator {
            g1,
            g2,
            alpha: vec![PairSerde::new(g1, g2)],
            x: SerialSerde::new(g1, g2, 1),
            alpha_x: vec![g1; 2],
            contributor_index: 0,
            compress: false,
        };

        // Serialize the Accumulator to JSON
        let serialized = serde_json::to_string_pretty(&accumulator)
            .expect("Serialization of Accumulator failed");

        println!("Serialized Accumulator:\n{}", serialized);

        // Deserialize JSON back into Accumulator
        let deserialized: Accumulator =
            serde_json::from_str(&serialized).expect("Deserialization of Accumulator failed");

        // Verify integrity (assuming Accumulator implements PartialEq)
        assert_eq!(accumulator.alpha, deserialized.alpha, "alpha mismatch");
        assert_eq!(accumulator.x, deserialized.x, "x mismatch");
        assert_eq!(
            accumulator.alpha_x, deserialized.alpha_x,
            "alpha_x mismatch"
        );
        assert_eq!(accumulator.hash(), deserialized.hash(), "hash mismatch");
    }
    #[test]
    fn test_save_load_accumulator() {
        let g1 = crate::utils::icicle_g1_generator();
        let g2 = crate::utils::icicle_g2_generator();
        let accumulator = Accumulator::new(g1, g2, 2, 4, true);
        accumulator
            .write_into_json("accumulator.json")
            .expect("Failed to save");

        let loaded_accumulator =
            Accumulator::read_from_json("accumulator.json").expect("Failed to load");
        println!("Loaded Accumulator: {:?}", loaded_accumulator);
        assert_eq!(accumulator, loaded_accumulator);
    }
}
