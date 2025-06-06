use crate::conversions::{
    deserialize_g1serde, deserialize_g2serde, serialize_g1serde, serialize_g2serde,
};
use crate::utils::{
    compute5, icicle_g1_generator, icicle_g2_generator, verify5, PairSerde, Phase1Proof,
    RandomGenerator, SerialSerde,
};
use crate::{impl_read_from_json, impl_write_into_json};
use ark_serialize::Compress;
use ark_std::env;
use ark_std::fs;
use blake2::{Blake2b, Digest};
use clap::builder::Str;
use icicle_bls12_381::curve::G1Affine;
use libs::group_structures::{G1serde, G2serde};
use serde::ser::SerializeStruct;
use serde::{Deserialize, Serialize};
use serde_json::from_reader;
use serde_json::to_writer_pretty;
use std::fs::File;
use std::io;
use std::io::{BufReader, BufWriter, Read, Write};

#[derive(Debug, Clone, PartialEq)]
pub struct Accumulator {
    pub contributor_index: usize,
    pub g1: G1serde,
    pub g2: G2serde,
    pub alpha: Vec<PairSerde>,
    pub x: Vec<PairSerde>,
    pub y: SerialSerde,
    pub alpha_x: Vec<G1serde>,
    pub alpha_y: Vec<G1serde>,
    pub xy: Vec<G1serde>,
    pub alpha_xy: Vec<G1serde>,
    pub compress: bool, // ← this is the controlling flag
}
impl Serialize for Accumulator {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut state = serializer.serialize_struct("Accumulator", 11)?;

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
        state.serialize_field(
            "x",
            &self
                .x
                .iter()
                .map(|p| p.serialize_with_compress(compress))
                .collect::<Vec<_>>(),
        )?;

        let (y_g1, y_g2) = self.y.serialize_with_compress(compress);
        state.serialize_field("y_g1", &y_g1)?;
        state.serialize_field("y_g2", &y_g2)?;

        state.serialize_field("alpha_x", &to_str_vec(&self.alpha_x))?;
        state.serialize_field("alpha_y", &to_str_vec(&self.alpha_y))?;
        state.serialize_field("xy", &to_str_vec(&self.xy))?;
        state.serialize_field("alpha_xy", &to_str_vec(&self.alpha_xy))?;

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
            x: Vec<(String, String)>,
            y_g1: Vec<String>,
            y_g2: String,
            alpha_x: Vec<String>,
            alpha_y: Vec<String>,
            xy: Vec<String>,
            alpha_xy: Vec<String>,
        }

        let Helper {
            contributor_index,
            g1,
            g2,
            compress,
            alpha,
            x,
            y_g1,
            y_g2,
            alpha_x,
            alpha_y,
            xy,
            alpha_xy,
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
            x: x.iter()
                .map(|(a, b)| PairSerde::deserialize_with_compress(a, b, compress_mode))
                .collect(),
            y: SerialSerde::deserialize_with_compress(y_g1, y_g2, compress_mode),
            alpha_x: parse_vec(alpha_x),
            alpha_y: parse_vec(alpha_y),
            xy: parse_vec(xy),
            alpha_xy: parse_vec(alpha_xy),
            compress: compress_mode == Compress::Yes,
        })
    }
}
impl_write_into_json!(Accumulator);
impl_read_from_json!(Accumulator);

impl Accumulator {
    pub fn get_boxed_xypower(&self) -> Box<[G1serde]> {
        let y_len = self.y.len_g1();
        let mut out = vec![G1serde::zero(); self.x.len() * y_len];
        for i in 0..self.x.len() {
            for j in 0..y_len {
                out[i * y_len + j] = self.get_xy_g1(i, j);
            }
        }
        out.into_boxed_slice()
    }
}

impl Accumulator {
    pub fn new(
        g1: G1serde,
        g2: G2serde,
        power_alpha_length: usize,
        power_x_length: usize,
        power_y_length: usize,
        compress: bool,
    ) -> Self {
        let acc = Accumulator {
            g1,
            g2,
            // [alpha^1,alpha^2,...,alpha^power_alpha_length]
            alpha: vec![PairSerde::new(g1, g2); power_alpha_length],
            // [x^1,x^2,...,x^power_x_length]
            x: vec![PairSerde::new(g1, g2); power_x_length],
            // [y^1,y^2,...,y^power_y_length]
            y: SerialSerde::new(g1, g2, power_y_length),
            // [alpha^1 * x^1...alpha^i * x^j,...,alpha^power_alpha_length * x^power_x_length]
            alpha_x: vec![g1; power_alpha_length * power_x_length],
            // [alpha^1 * y^1...alpha^i * y^j,...,alpha^power_alpha_length * y^power_y_length]
            alpha_y: vec![g1; power_alpha_length * power_y_length],
            // [x^1 * y^1...x^i * y^j,...,x^power_x_length * y^power_y_length]
            xy: vec![g1; power_x_length * power_y_length],
            alpha_xy: vec![g1; power_alpha_length * power_x_length * power_y_length],
            contributor_index: 0,
            compress,
        };
        acc
    }
    pub fn get_x_g1_range(&self, exp_min: usize, exp_max: usize) -> Vec<G1Affine> {
        let mut out = vec![G1Affine::zero(); exp_max - exp_min + 1];
        for i in exp_min..exp_max + 1 {
            out[i] = self.get_x_g1(i).0;
        }
        out
    }

    //x^exp * G1
    pub fn get_x_g1(&self, exp: usize) -> G1serde {
        if exp == 0 {
            return icicle_g1_generator();
        }
        let result = self.x.get(exp - 1).unwrap();
        result.g1
    }
    //y^exp * G1
    pub fn get_y_g1(&self, exp: usize) -> G1serde {
        if exp == 0 {
            return icicle_g1_generator();
        }
        self.y.get_g1(exp - 1)
    }
    //alpha^exp * G1
    pub fn get_alpha_g1(&self, exp: usize) -> G1serde {
        if exp == 0 {
            return icicle_g1_generator();
        }
        let result = self.alpha.get(exp - 1).unwrap();
        result.g1
    }

    //alpha^exp_alpha * y^exp_y * G1
    pub fn get_alphay_g1(&self, exp_alpha: usize, exp_y: usize) -> G1serde {
        assert_eq!(exp_y <= self.y.len_g1(), true);
        assert_eq!(exp_alpha <= 4, true);
        if exp_alpha == 0 && exp_y == 0 {
            return icicle_g1_generator();
        } else if exp_alpha == 0 {
            return self.get_y_g1(exp_y);
        } else if exp_y == 0 {
            return self.get_alpha_g1(exp_alpha);
        }
        //TODO check if this is correct
        let idx = (exp_alpha - 1) * self.y.len_g1() + exp_y - 1;
        *self.alpha_y.get(idx).unwrap()
    }

    //alpha^exp_alpha * x^exp_x * G1
    pub fn get_alphax_g1(&self, exp_alpha: usize, exp_x: usize) -> G1serde {
        assert_eq!(exp_alpha <= 4, true);
        assert_eq!(exp_x <= self.x.len(), true);
        if exp_alpha == 0 && exp_x == 0 {
            return icicle_g1_generator();
        } else if exp_alpha == 0 {
            return self.get_x_g1(exp_x);
        } else if exp_x == 0 {
            return self.get_alpha_g1(exp_alpha);
        }
        //TODO check if this is correct
        let idx = (exp_alpha - 1) * self.x.len() + exp_x - 1;
        //   println!("alpha: {} x: {} idx: {} len_alpha_x {}", exp_alpha, exp_x, idx, self.alpha_x.len());
        *self.alpha_x.get(idx).unwrap()
    }

    //x^exp_x * y^exp_y * G1
    pub fn get_xy_g1(&self, exp_x: usize, exp_y: usize) -> G1serde {
        assert_eq!(exp_y <= self.y.len_g1(), true);
        assert_eq!(exp_x <= self.x.len(), true);
        if exp_x == 0 && exp_y == 0 {
            return icicle_g1_generator();
        } else if exp_x == 0 {
            return self.get_y_g1(exp_y);
        } else if exp_y == 0 {
            return self.get_x_g1(exp_x);
        }
        //TODO check if this is correct
        let idx = (exp_x - 1) * self.y.len_g1() + exp_y - 1;
        *self.xy.get(idx).unwrap()
    }

    pub fn get_alphaxy_g1_range(
        &self,
        exp_alpha: usize,
        exp_x_max: usize,
        exp_y_max: usize,
    ) -> Vec<G1Affine> {
        let mut out = vec![G1Affine::zero(); exp_x_max * exp_y_max];
        for i in 0..exp_x_max {
            for k in 0..exp_y_max {
                out[i * exp_y_max + k] = self.get_alphaxy_g1(exp_alpha, i, k).0;
            }
        }
        out
    }
    //alpha^exp_alpha * x^exp_x * y^exp_y * G1
    pub fn get_alphaxy_g1(&self, exp_alpha: usize, exp_x: usize, exp_y: usize) -> G1serde {
        assert_eq!(exp_y <= self.y.len_g1(), true);
        assert_eq!(exp_x <= self.x.len(), true);
        if exp_alpha == 0 && exp_x == 0 && exp_y == 0 {
            return icicle_g1_generator();
        } else if exp_alpha == 0 {
            return self.get_xy_g1(exp_x, exp_y);
        } else if exp_x == 0 {
            return self.get_alphay_g1(exp_alpha, exp_y);
        } else if exp_y == 0 {
            return self.get_alphax_g1(exp_alpha, exp_x);
        }
        //TODO check if this is correct
        let idx = (exp_alpha - 1) * (self.x.len() * self.y.len_g1())
            + (exp_x - 1) * self.y.len_g1()
            + exp_y
            - 1;
        *self.alpha_xy.get(idx).unwrap()
    }

    pub fn compute(&self, rng: &mut RandomGenerator) -> (Accumulator, Phase1Proof) {
        let (cur_alphaxy, cur_xy, cur_alphax, cur_alphay, cur_alpha, cur_x, cur_y, mut proof_5) =
            compute5(
                rng,
                &self.g1,
                &self.g2,
                &self.alpha_xy,
                &self.xy,
                &self.alpha_x,
                &self.alpha_y,
                &self.alpha,
                &self.x,
                &self.y,
                &self.hash(),
            );

        let acc = Accumulator {
            g1: self.g1,
            g2: self.g2,
            alpha: cur_alpha,
            x: cur_x,
            y: cur_y,
            alpha_x: cur_alphax,
            alpha_y: cur_alphay,
            xy: cur_xy,
            alpha_xy: cur_alphaxy,
            contributor_index: self.contributor_index + 1,
            compress: self.compress,
        };
        proof_5.contributor_index = acc.contributor_index;
        (acc, proof_5)
    }
    pub fn verify(&self, cur: &Accumulator, cur_proof: &Phase1Proof) -> bool {
        verify5(
            &self.g1,
            &self.g2,
            &self.alpha,
            &self.x,
            &self.y,
            &cur.alpha_xy,
            &cur.xy,
            &cur.alpha_x,
            &cur.alpha_y,
            &cur.alpha,
            &cur.x,
            &cur.y,
            &cur_proof,
        )
    }
    pub fn hash(&self) -> [u8; 32] {
        let out = self.blake2b_hash();
        let mut result = [0u8; 32];
        result.copy_from_slice(&out[..32]);
        result
    }
    pub fn blake2b_hash(&self) -> [u8; 64] {
        // Serialize without the hash field
        let serialized = bincode::serialize(&self).expect("Serialization failed for Accumulator");

        let hash = Blake2b::digest(&serialized);

        let mut result = [0u8; 64];
        result.copy_from_slice(&hash[..64]);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json;

    #[test]
    fn test_accumulator_serialization_roundtrip() {
        let g1 = icicle_g1_generator();
        let g2 = icicle_g2_generator();
        // Construct dummy data for the Accumulator struct
        let accumulator = Accumulator {
            g1,
            g2,
            alpha: vec![PairSerde::new(g1, g2)],
            x: vec![PairSerde::new(g1, g2)],
            y: SerialSerde::new(g1, g2, 2),
            alpha_x: vec![g1; 2],
            alpha_y: vec![g1; 2],
            xy: vec![g1; 4],
            alpha_xy: vec![g1; 8],
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
        assert_eq!(accumulator.y, deserialized.y, "y mismatch");
        assert_eq!(
            accumulator.alpha_x, deserialized.alpha_x,
            "alpha_x mismatch"
        );
        assert_eq!(
            accumulator.alpha_y, deserialized.alpha_y,
            "alpha_y mismatch"
        );
        assert_eq!(accumulator.xy, deserialized.xy, "xy mismatch");
        assert_eq!(
            accumulator.alpha_xy, deserialized.alpha_xy,
            "alpha_xy mismatch"
        );
        assert_eq!(accumulator.hash(), deserialized.hash(), "hash mismatch");
    }
    #[test]
    fn test_save_load_accumulator() {
        let g1 = icicle_g1_generator();
        let g2 = icicle_g2_generator();
        let accumulator = Accumulator::new(g1, g2, 2, 4, 8, true);
        accumulator
            .write_into_json("accumulator.json")
            .expect("Failed to save");

        let loaded_accumulator =
            Accumulator::read_from_json("accumulator.json").expect("Failed to load");
        println!("Loaded Accumulator: {:?}", loaded_accumulator);
        assert_eq!(accumulator, loaded_accumulator);
    }
}
