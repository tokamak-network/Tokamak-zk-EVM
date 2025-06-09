use crate::conversions::{
    deserialize_g1serde, deserialize_g2serde, serialize_g1serde, serialize_g2serde,
};
pub(crate) use crate::conversions::{
    hash_to_g2, icicle_g1_generator, icicle_g2_generator, serialize_g1_affine,
};
use ark_bls12_381::Bls12_381;
use ark_ec::pairing::PairingOutput;
use ark_ec::{AffineRepr, PrimeGroup};
use ark_ff::One;
use ark_serialize::Compress;
use blake2::{Blake2b, Digest};
use blake3::Hasher;
use clap::ValueEnum;
use icicle_bls12_381::curve::{ScalarCfg, ScalarField};
use icicle_core::curve::Curve;
use icicle_core::traits::{Arithmetic, FieldImpl, GenerateRandom};
use libs::field_structures::Tau;
use libs::group_structures::{pairing, G1serde, G2serde, Sigma};
use rand::Rng;
use rayon::join;
use rayon::prelude::*;
use serde::de::{self, MapAccess, SeqAccess, Visitor};
use serde::ser::{SerializeStruct, SerializeTuple};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{BufReader, BufWriter, Read, Write};
use std::ops::{Add, Mul, Sub};
use std::path::{Path, PathBuf};
use std::time::Instant;
use std::{fs, io};
use crate::sigma::SigmaV2;

// Import rayon prelude
pub fn list_files_map(folder: &str) -> io::Result<HashMap<String, PathBuf>> {
    let mut file_map = HashMap::new();
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                file_map.insert(stem.to_string(), path);
            }
        }
    }
    Ok(file_map)
}
pub fn check_outfile_writable(path: &str) -> std::io::Result<()> {
    let path = Path::new(path);
    // Try opening the file in write or create mode
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .append(true)
        .open(path)?;
    // Attempt a no-op write
    writeln!(file, "")?;
    Ok(())
}
pub fn check_outfolder_writable(path: &str) -> std::io::Result<()> {
    let path = Path::new(path);

    if !path.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Folder does not exist",
        ));
    }
    if !path.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Path is not a directory",
        ));
    }

    // Try writing a temp file
    let test_file_path = path.join(".test_write_permission");
    let result = File::create(&test_file_path).and_then(|mut f| f.write_all(b"test"));
    // Clean up if it worked
    if test_file_path.exists() {
        let _ = fs::remove_file(test_file_path);
    }

    result
}
#[macro_export]
macro_rules! impl_read_from_json {
    ($t:ty) => {
        impl $t {
            pub fn read_from_json(path: &str) -> io::Result<Self> {
                let abs_path = env::current_dir()?.join(path);
                let file = File::open(abs_path)?;
                let reader = BufReader::new(file);
                let res: Self = from_reader(reader)?;
                Ok(res)
            }
        }
    };
}

#[macro_export]
macro_rules! impl_write_into_json {
    ($t:ty) => {
        impl $t {
            pub fn write_into_json(&self, path: &str) -> io::Result<()> {
                let abs_path = env::current_dir()?.join(path);
                if let Some(parent) = abs_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                let file = File::create(&abs_path)?;
                let writer = BufWriter::new(file);
                to_writer_pretty(writer, self)?;
                Ok(())
            }
        }
    };
}

#[derive(Clone, Debug, PartialEq)]
pub struct SerialSerde {
    pub g1: Vec<G1serde>, //[xG1, x^2G1, x^3G1, ..., x^s_maxG1]
    pub g2: G2serde,      //xG2
}
impl SerialSerde {
    pub fn serialize_with_compress(&self, compress: Compress) -> (Vec<String>, String) {
        let g1 = self
            .g1
            .iter()
            .map(|g| serialize_g1serde(g, compress))
            .collect();
        let g2 = serialize_g2serde(&self.g2, compress);
        (g1, g2)
    }

    pub fn deserialize_with_compress(
        g1_vec: Vec<String>,
        g2_str: String,
        compress: Compress,
    ) -> Self {
        SerialSerde {
            g1: g1_vec
                .iter()
                .map(|s| deserialize_g1serde(s, compress))
                .collect(),
            g2: deserialize_g2serde(&g2_str, compress),
        }
    }
}
impl SerialSerde {
    //xr, xr^2, xr^3...xr^n where n is the length of xr vector
    pub(crate) fn mul(&self, xr_powers: &Vec<ScalarField>) -> SerialSerde {
        let g1 = &self.g1;
        let g2 = &self.g2;
        let serde = SerialSerde {
            g1: g1
                .par_iter()
                .zip(xr_powers.par_iter())
                .map(|(g1, xr)| g1.mul(*xr))
                .collect(),
            g2: g2.mul(xr_powers[0]),
        };
        serde
    }
    pub(crate) fn get_g1(&self, index: usize) -> G1serde {
        self.g1[index]
    }
    pub(crate) fn get_g2(&self) -> G2serde {
        self.g2
    }
    pub fn len_g1(&self) -> usize {
        self.g1.len()
    }

    pub fn new(g1: G1serde, g2: G2serde, s_max: usize) -> SerialSerde {
        SerialSerde {
            g1: vec![g1; s_max],
            g2,
        }
    }
}

#[derive(Clone, Debug, Copy, PartialEq)]
pub struct PairSerde {
    pub g1: G1serde, //xG1
    pub g2: G2serde, //xG2
}
impl PairSerde {
    pub fn serialize_with_compress(&self, compress: Compress) -> (String, String) {
        (
            serialize_g1serde(&self.g1, compress),
            serialize_g2serde(&self.g2, compress),
        )
    }

    pub fn deserialize_with_compress(g1: &str, g2: &str, compress: Compress) -> Self {
        PairSerde {
            g1: deserialize_g1serde(g1, compress),
            g2: deserialize_g2serde(g2, compress),
        }
    }
}
impl PairSerde {
    pub(crate) fn mul(&self, p0: ScalarField) -> PairSerde {
        let g1 = &self.g1;
        let g2 = &self.g2;
        let serde = PairSerde {
            g1: g1.mul(p0),
            g2: g2.mul(p0),
        };
        serde
    }
    pub fn new(g1: G1serde, g2: G2serde) -> PairSerde {
        PairSerde { g1, g2 }
    }
}
fn serialize_as_hex<S>(bytes: &[u8; 64], serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&hex::encode(bytes))
}
fn deserialize_hex<'de, D>(deserializer: D) -> Result<[u8; 64], D::Error>
where
    D: Deserializer<'de>,
{
    let s = String::deserialize(deserializer)?;
    let bytes = hex::decode(s).map_err(serde::de::Error::custom)?;
    let array: [u8; 64] = bytes
        .try_into()
        .map_err(|_| serde::de::Error::custom("Expected a 64-byte hex string"))?;
    Ok(array)
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Proof2 {
    pub x_r_g1: G1serde, //latest x_r contribution
    pub pok_x: G2serde,
    #[serde(serialize_with = "serialize_as_hex", deserialize_with = "deserialize_hex")]
    pub v: [u8; 64],
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Phase1Proof {
    pub contributor_index: usize,
    pub proof2_alpha: Proof2,
    pub proof2_x: Proof2,
    pub proof2_y: Proof2,
}
impl Phase1Proof {
    /// Save the Proof5 to a JSON file
    pub fn save_to_json(&self, path: &str) -> std::io::Result<()> {
        let file = File::create(path)?;
        let mut writer = BufWriter::new(file);
        let json_str = serde_json::to_string_pretty(&self).expect("JSON serialization failed");
        writer.write_all(json_str.as_bytes())?;
        Ok(())
    }

    /// Load the Accumulator from a JSON file and recalculate the hash
    pub fn load_from_json(path: &str) -> std::io::Result<Self> {
        let file = File::open(path)?;
        let mut reader = BufReader::new(file);
        let mut json_str = String::new();
        reader.read_to_string(&mut json_str)?;
        let proof: Phase1Proof = serde_json::from_str(&json_str)
            .expect(format!("JSON deserialization failed: path {}", path).as_str());
        Ok(proof)
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
//type 1: compute1
pub fn compute1(
    rng: &mut RandomGenerator,
    g1: &G1serde,
    prev_alpha: PairSerde,
    v: &[u8],
) -> (PairSerde, G1serde, G2serde) {
    let alpha_r = rng.next_random();
    let pok_alpha = pok(g1, alpha_r, v);
    let alpha_rG1 = g1.mul(alpha_r);
    let cur_alpha = prev_alpha.mul(alpha_r);
    (cur_alpha, alpha_rG1, pok_alpha)
}
//type 1: verify1
pub fn verify1(
    g1: &G1serde,
    prev_alpha: PairSerde,
    cur_alpha: PairSerde,
    alpha_rG1: &G1serde,
    alpha_pok: G2serde,
    v: &[u8],
) -> bool {
    if check_pok(alpha_rG1, g1, alpha_pok, v) {
        let r_alpha = ro(&alpha_rG1, v);
        return consistent(
            &[prev_alpha.g1, cur_alpha.g1],
            &[prev_alpha.g2, cur_alpha.g2],
            &[r_alpha, alpha_pok],
        );
    }
    false
}

//type 2: compute2
//Let [x^i]^0 = G_1 or [x^i]^0 = G
pub fn compute2(
    rng: &mut RandomGenerator,
    g1: &G1serde,
    prev_x: &SerialSerde,
    v: &[u8; 64],
) -> (SerialSerde, Proof2) {
    let (cur_x, proof2, _) = compute2_temp(rng, &g1, prev_x, v);
    (cur_x, proof2)
}

//type 2: verify2
pub fn verify2(
    g1: &G1serde,
    g2: &G2serde,
    prev_x: &SerialSerde,
    cur_x: &SerialSerde,
    proof2: &Proof2,
) -> bool {
    if !check_pok(&proof2.x_r_g1, g1, proof2.pok_x, proof2.v.as_ref()) {
        return false;
    }

    let r_alpha = ro(&proof2.x_r_g1, proof2.v.as_ref());

    if !consistent(
        &[prev_x.get_g1(0), cur_x.get_g1(0)],
        &[prev_x.get_g2(), cur_x.get_g2()],
        &[r_alpha, proof2.pok_x],
    ) {
        return false;
    }

    // Parallelize loop consistency checks
    (1..cur_x.len_g1()).into_par_iter().all(|i| {
        consistent(
            &[cur_x.get_g1(i - 1), cur_x.get_g1(i)],
            &[],
            &[*g2, cur_x.get_g2()],
        )
    })
}
pub fn verify2i(
    g1: &G1serde,
    g2: &G2serde,
    prev_x: &Vec<PairSerde>,
    cur_x: &Vec<PairSerde>,
    proof2: &Proof2,
) -> bool {
    if !check_pok(&proof2.x_r_g1, g1, proof2.pok_x, proof2.v.as_ref()) {
        return false;
    }

    let r_alpha = ro(&proof2.x_r_g1, proof2.v.as_ref());

    if !consistent(
        &[prev_x[0].g1, cur_x[0].g1],
        &[prev_x[0].g2, cur_x[0].g2],
        &[r_alpha, proof2.pok_x],
    ) {
        return false;
    }

    // Parallelize the consistency checks across elements
    (1..cur_x.len())
        .into_par_iter()
        .all(|i| consistent(&[cur_x[i - 1].g1, cur_x[i].g1], &[], &[*g2, cur_x[0].g2]))
}

fn compute2_temp(
    rng: &mut RandomGenerator,
    g1: &G1serde,
    prev_x: &SerialSerde,
    v: &[u8; 64],
) -> (SerialSerde, Proof2, Vec<ScalarField>) {
    let x_r = rng.next_random();
    let pok_x = pok(g1, x_r, v);
    let x_rG1 = g1.mul(x_r);
    let len_x = prev_x.len_g1();

    // Precompute the powers of x_r efficiently
    let mut x_powers = compute_powers(x_r, len_x);
    let cur_x = prev_x.mul(&x_powers);
    (
        cur_x,
        Proof2 {
            x_r_g1: x_rG1,
            pok_x,
            v: *v,
        },
        x_powers,
    )
}
fn compute2_tempi(
    rng: &mut RandomGenerator,
    g1: &G1serde,
    prev_x: &Vec<PairSerde>,
    v: &[u8; 64],
) -> (Vec<PairSerde>, Proof2, Vec<ScalarField>) {
    let x_r = rng.next_random();
    let pok_x = pok(g1, x_r, v);
    let x_rG1 = g1.mul(x_r);
    let len_x = prev_x.len();

    // Precompute the powers of x_r efficiently
    let mut x_powers = compute_powers(x_r, len_x);
    let cur_x: Vec<PairSerde> = prev_x
        .par_iter()
        .zip(x_powers.par_iter())
        .map(|(x, scalar)| x.mul(*scalar))
        .collect();

    (
        cur_x,
        Proof2 {
            x_r_g1: x_rG1,
            pok_x,
            v: *v,
        },
        x_powers,
    )
}
/// Represents different strategies for random number generation
#[derive(Debug, Clone)]
pub enum RandomStrategy {
    /// Uses only user-provided input
    UserInput,
    /// Uses only system random generator
    SystemRandom,
    /// Combines both user input and system random
    Hybrid,
    /// Used for testing with deterministic values
    Testing,
}

impl Default for RandomStrategy {
    fn default() -> Self {
        RandomStrategy::SystemRandom
    }
}

pub struct RandomGenerator {
    strategy: RandomStrategy,
    current_seed: [u8; 32],
    pub iteration_count: usize,
}

impl RandomGenerator {
    /// Creates a new random generator with the specified strategy and seed
    ///
    /// # Arguments
    /// * `strategy` - The random generation strategy to use
    /// * `initial_seed` - Initial seed value as 32 bytes
    pub fn new(strategy: RandomStrategy, initial_seed: [u8; 32]) -> Self {
        Self {
            strategy,
            current_seed: initial_seed,
            iteration_count: 0,
        }
    }

    /// Generates the next scalar value based on the current seed
    pub fn next_scalar(&mut self) -> Result<ScalarField, Box<dyn std::error::Error>> {
        let scalar = ScalarField::from_u32(0) + ScalarField::from_bytes_le(&self.current_seed);
        let mut hasher = Hasher::new();
        hasher.update(&self.current_seed);
        let hash = hasher.finalize();
        self.current_seed.copy_from_slice(hash.as_bytes());
        Ok(scalar)
    }

    /// Generates the next random value according to the chosen strategy
    pub fn next_random(&mut self) -> ScalarField {
        let out = match self.strategy {
            RandomStrategy::UserInput => self.next_scalar().unwrap(),
            RandomStrategy::SystemRandom => ScalarCfg::generate_random(1)[0],
            RandomStrategy::Hybrid => {
                let user_component = self.next_scalar().unwrap();
                ScalarCfg::generate_random(1)[0] + user_component
            }
            RandomStrategy::Testing => {
                self.iteration_count += 1;
                ScalarField::from_u32((self.iteration_count * 2 + 1) as u32)
            }
        };
        out
    }
}
/// Prompts user for initial random input
pub fn prompt_user_input(title : &str) -> String {
    print!("{}", title);
    io::stdout().flush().unwrap();

    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    input.trim().to_string()
}

/// Prompts user for initial random input
pub fn scalar_from_user_random_input(title : &str) -> [u8; 32] {
    print!("{}", title);
    io::stdout().flush().unwrap();

    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();

    let mut hasher = Hasher::new();
    hasher.update(input.trim().as_bytes());
    let hash = hasher.finalize();

    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(hash.as_bytes());
    bytes
}

#[derive(Debug, Clone, ValueEnum)]
pub enum Mode {
    Testing,
    Random,
    Beacon, //deterministic from a given seed
}
/// Initializes a random generator based on the specified mode
pub fn initialize_random_generator(mode: &Mode) -> RandomGenerator {
    let (strategy, message, seed) = match mode {
        Mode::Testing => (
            RandomStrategy::Testing,
            "Initializing random generator in testing mode",
            [0u8; 32],
        ),
        Mode::Beacon => (
            RandomStrategy::UserInput,
            "Initializing random generator in deterministic mode",
            scalar_from_user_random_input("Enter seed input for randomization: "),
        ),
        Mode::Random => (
            RandomStrategy::Hybrid,
            "Initializing random generator in hybrid random mode",
            scalar_from_user_random_input("Enter seed input for randomization: "),
        ),
    };

    println!("{}", message);
    RandomGenerator::new(strategy, seed)
}

pub fn hash_sigma(sigma: &SigmaV2) -> [u8; 32] {
    // Serialize without the hash field
    let serialized = bincode::serialize(sigma).expect("Serialization failed for Accumulator");

    // Calculate Blake2b hash (32-byte output)
    let hash = Blake2b::digest(&serialized);

    // Convert GenericArray into [u8; 32]
    let mut result = [0u8; 32];
    result.copy_from_slice(&hash[..32]);
    result
}
//type 3: compute3
//Let [x^i*y^k]
pub fn compute3(
    rng: &mut RandomGenerator,
    g1: &G1serde,
    prev_xy: &Vec<G1serde>,
    prev_x: &Vec<PairSerde>,
    prev_y: &SerialSerde,
    v: &[u8; 64],
) -> (
    Vec<G1serde>,
    Vec<PairSerde>,
    SerialSerde,
    Proof2,
    Proof2,
    Vec<ScalarField>,
    Vec<ScalarField>,
    Vec<ScalarField>,
) {
    let len_x = prev_x.len();

    let x_r = rng.next_random();
    let proof2_x = Proof2 {
        x_r_g1: g1.mul(x_r),
        pok_x: pok(g1, x_r, v),
        v: *v,
    };

    // Precompute the powers of x_r efficiently
    let x_powers = compute_powers(x_r, len_x);
    let cur_x: Vec<PairSerde> = prev_x
        .par_iter()
        .zip(x_powers.par_iter())
        .map(|(x, scalar)| x.mul(*scalar))
        .collect();

    let (cur_y, proof2_y, y_powers) = compute2_temp(rng, &g1, prev_y, v);

    let xy_powers = vector_product(&x_powers, &y_powers);
    let cur_xy: Vec<G1serde> = prev_xy
        .par_iter()
        .zip(xy_powers.par_iter())
        .map(|(x, scalar)| x.mul(*scalar))
        .collect();

    (
        cur_xy, cur_x, cur_y, proof2_x, proof2_y, x_powers, y_powers, xy_powers,
    )
}

//type 3: verify3
pub fn verify3(
    g1: &G1serde,
    g2: &G2serde,
    prev_x: &Vec<PairSerde>,
    prev_y: &SerialSerde,
    cur_xy: &Vec<G1serde>,
    cur_x: &Vec<PairSerde>,
    cur_y: &SerialSerde,
    proof2_x: &Proof2,
    proof2_y: &Proof2,
) -> bool {
    if !verify2i(g1, g2, prev_x, cur_x, proof2_x) {
        return false;
    }
    if !verify2(g1, g2, prev_y, cur_y, proof2_y) {
        return false;
    }
    //check xy consistency
    let len_y = cur_y.len_g1();

    (0..cur_x.len()).into_par_iter().all(|i| {
        let xi = cur_x[i];
        (0..len_y).into_par_iter().all(|k| {
            let ykG1 = cur_y.get_g1(k);
            let xyG1 = cur_xy[i * len_y + k];
            consistent(&[ykG1, xyG1], &[], &[*g2, xi.g2])
        })
    })
}

//type 3: verify3i
pub fn verify3i(
    g1: &G1serde,
    g2: &G2serde,
    prev_x: &Vec<PairSerde>,
    prev_y: &Vec<PairSerde>,
    cur_xy: &Vec<G1serde>,
    cur_x: &Vec<PairSerde>,
    cur_y: &Vec<PairSerde>,
    proof2_x: &Proof2,
    proof2_y: &Proof2,
) -> bool {
    if !verify2i(g1, g2, prev_x, cur_x, proof2_x) {
        return false;
    }
    if !verify2i(g1, g2, prev_y, cur_y, proof2_y) {
        return false;
    }
    //check xy consistency
    let len_y = cur_y.len();

    // Nested parallel loops for consistency checks
    (0..cur_x.len()).into_par_iter().all(|i| {
        let xi = cur_x[i];
        (0..len_y).into_par_iter().all(|k| {
            let ykG1 = cur_y[k].g1;
            let xyG1 = cur_xy[i * len_y + k];
            consistent(&[ykG1, xyG1], &[], &[*g2, xi.g2])
        })
    })
}
#[test]
pub fn test_bilinear_map() {
    //initialize
    let g1 = icicle_g1_generator();
    let g2 = icicle_g2_generator();

    let minusG2 = G2serde::zero() - g2;

    let pairing1 = pairing(&[g1, g1], &[g2, minusG2]);
    assert_eq!(pairing1.0.is_one(), true)
}

#[test]
pub fn test_compute3() {
    let rng = &mut RandomGenerator::new(RandomStrategy::SystemRandom, [0u8; 32]);
    //initialize
    let g1 = icicle_g1_generator();
    let g2 = icicle_g2_generator();

    let s_max1: usize = 4;
    let s_max2: usize = 5;

    let v = [34u8; 64];
    let mut prev_x = vec![
        PairSerde {
            g1: g1.clone(),
            g2: g2.clone()
        };
        s_max1
    ];
    let mut prev_y = SerialSerde::new(g1, g2, s_max2);
    let mut prev_xy = vec![g1; s_max1 * s_max2];

    // first participant
    let (cur_xy, cur_x, cur_y, proof2_x, proof2_y, _, _, _) =
        compute3(rng, &g1, &prev_xy, &prev_x, &prev_y, &v);
    assert_eq!(
        verify3(&g1, &g2, &prev_x, &prev_y, &cur_xy, &cur_x, &cur_y, &proof2_x, &proof2_y),
        true,
    );
    prev_xy = cur_xy;
    prev_x = cur_x;
    prev_y = cur_y;

    let (cur_xy, cur_x, cur_y, proof2_x, proof2_y, _, _, _) =
        compute3(rng, &g1, &prev_xy, &prev_x, &prev_y, &v);
    assert_eq!(
        verify3(&g1, &g2, &prev_x, &prev_y, &cur_xy, &cur_x, &cur_y, &proof2_x, &proof2_y),
        true,
    );
    prev_xy = cur_xy;
    prev_x = cur_x;
    prev_y = cur_y;

    let (cur_xy, cur_x, cur_y, proof2_x, proof2_y, _, _, _) =
        compute3(rng, &g1, &prev_xy, &prev_x, &prev_y, &v);
    assert_eq!(
        verify3(&g1, &g2, &prev_x, &prev_y, &cur_xy, &cur_x, &cur_y, &proof2_x, &proof2_y),
        true,
    );
    prev_xy = cur_xy;
    prev_x = cur_x;
    prev_y = cur_y;
}

pub fn compute5(
    rng: &mut RandomGenerator,
    g1: &G1serde,
    g2: &G2serde,
    prev_alphaxy: &Vec<G1serde>,
    prev_xy: &Vec<G1serde>,
    prev_alphax: &Vec<G1serde>,
    prev_alphay: &Vec<G1serde>,
    prev_alpha: &Vec<PairSerde>,
    prev_x: &Vec<PairSerde>,
    prev_y: &SerialSerde,
    v: &[u8; 64],
) -> (
    Vec<G1serde>,
    Vec<G1serde>,
    Vec<G1serde>,
    Vec<G1serde>,
    Vec<PairSerde>,
    Vec<PairSerde>,
    SerialSerde,
    Phase1Proof,
) {
    let (cur_xy, cur_x, cur_y, proof2_x, proof2_y, x_powers, y_powers, xy_powers) =
        compute3(rng, &g1, &prev_xy, &prev_x, &prev_y, &v);
    let (cur_alpha, proof2_alpha, alpha_powers) = compute2_tempi(rng, g1, prev_alpha, v);

    let alphaxy_powers = vector_product(&alpha_powers, &xy_powers);
    let cur_alphaxy: Vec<G1serde> = prev_alphaxy
        .par_iter()
        .zip(alphaxy_powers.par_iter())
        .map(|(x, scalar)| x.mul(*scalar))
        .collect();

    let alphax_powers = vector_product(&alpha_powers, &x_powers);
    let cur_alphax: Vec<G1serde> = prev_alphax
        .par_iter()
        .zip(alphax_powers.par_iter())
        .map(|(x, scalar)| x.mul(*scalar))
        .collect();

    let alphay_powers = vector_product(&alpha_powers, &y_powers);
    let cur_alphay: Vec<G1serde> = prev_alphay
        .par_iter()
        .zip(alphay_powers.par_iter())
        .map(|(y, scalar)| y.mul(*scalar))
        .collect();

    (
        cur_alphaxy,
        cur_xy,
        cur_alphax,
        cur_alphay,
        cur_alpha,
        cur_x,
        cur_y,
        Phase1Proof {
            contributor_index: 0,
            proof2_alpha,
            proof2_x,
            proof2_y,
        },
    )
}

//type 5: verify5
pub fn verify5(
    g1: &G1serde,
    g2: &G2serde,
    prev_alpha: &Vec<PairSerde>,
    prev_x: &Vec<PairSerde>,
    prev_y: &SerialSerde,
    cur_alphaxy: &Vec<G1serde>,
    cur_xy: &Vec<G1serde>,
    cur_alphax: &Vec<G1serde>,
    cur_alphay: &Vec<G1serde>,
    cur_alpha: &Vec<PairSerde>,
    cur_x: &Vec<PairSerde>,
    cur_y: &SerialSerde,
    proof5: &Phase1Proof,
) -> bool {
    if !verify2i(g1, g2, prev_alpha, cur_alpha, &proof5.proof2_alpha) {
        return false;
    }
    if !verify3(
        g1,
        g2,
        prev_x,
        prev_y,
        cur_xy,
        cur_x,
        cur_y,
        &proof5.proof2_x,
        &proof5.proof2_y,
    ) {
        return false;
    }
    if !verify3(
        g1,
        g2,
        prev_alpha,
        prev_y,
        cur_alphay,
        cur_alpha,
        cur_y,
        &proof5.proof2_alpha,
        &proof5.proof2_y,
    ) {
        return false;
    }
    if !verify3i(
        g1,
        g2,
        prev_alpha,
        prev_x,
        cur_alphax,
        cur_alpha,
        cur_x,
        &proof5.proof2_alpha,
        &proof5.proof2_x,
    ) {
        return false;
    }
    let start = Instant::now();

    let len_x = prev_x.len();
    let len_y = prev_y.len_g1();

    let result = cur_alpha.par_iter().enumerate().all(|(h, alpha)| {
        (0..cur_x.len()).into_par_iter().all(|i| {
            let y_len = cur_y.len_g1();
            let mut g1_0 = Vec::with_capacity(y_len);
            let mut g2_1 = Vec::with_capacity(y_len);
            let mut g1_1 = Vec::with_capacity(y_len);
            let mut g2_0 = Vec::with_capacity(y_len);

            for k in 0..y_len {
                let xy = cur_xy[i * len_y + k];
                let cur_alphaxy = cur_alphaxy[get_alphaxy_index(h, i, k, len_x, len_y)];
                g1_0.push(xy);
                g2_1.push(cur_alphaxy);
                g1_1.push(*g2);
                g2_0.push(alpha.g2);
            }

            let results: Vec<PairingOutput<Bls12_381>> = [(&g1_0, &g2_0), (&g2_1, &g1_1)]
                .par_iter()
                .map(|(g1, g2)| pairing(*g1, *g2))
                .collect();
            results[0].eq(&results[1])
        })
    });

    println!(
        "Time elapsed for verify for the last consistency: {:?}",
        start.elapsed().as_secs()
    );
    result
}
//index = (h* len_x * len_y) + (i * len_y) + k;
fn get_alphaxy_index(h: usize, i: usize, k: usize, len_x: usize, len_y: usize) -> usize {
    h * len_x * len_y + i * len_y + k
}

#[test]
pub fn test_compute5() {
    let rng = &mut RandomGenerator::new(RandomStrategy::SystemRandom, [0u8; 32]);
    //initialize
    let g1 = icicle_g1_generator();
    let g2 = icicle_g2_generator();

    let s_max0: usize = 4; //alpha
    let s_max1: usize = 16; //x^i
    let s_max2: usize = 32; //y^k

    let v = [34u8; 64];
    let mut prev_alpha = vec![
        PairSerde {
            g1: g1.clone(),
            g2: g2.clone()
        };
        s_max0
    ];
    let mut prev_x = vec![
        PairSerde {
            g1: g1.clone(),
            g2: g2.clone()
        };
        s_max1
    ];
    let mut prev_y = SerialSerde::new(g1, g2, s_max2);
    let mut prev_xy = vec![g1; s_max1 * s_max2];
    let mut prev_alphax = vec![g1; s_max0 * s_max1];
    let mut prev_alphay = vec![g1; s_max0 * s_max2];

    let mut prev_alphaxy = vec![g1; s_max0 * s_max1 * s_max2];

    // first participant
    let (cur_alphaxy, cur_xy, cur_alphax, cur_alphay, cur_alpha, cur_x, cur_y, proof5) = compute5(
        rng,
        &g1,
        &g2,
        &prev_alphaxy,
        &prev_xy,
        &prev_alphax,
        &prev_alphay,
        &prev_alpha,
        &prev_x,
        &prev_y,
        &v,
    );

    assert_eq!(
        verify5(
            &g1,
            &g2,
            &prev_alpha,
            &prev_x,
            &prev_y,
            &cur_alphaxy,
            &cur_xy,
            &cur_alphax,
            &cur_alphay,
            &cur_alpha,
            &cur_x,
            &cur_y,
            &proof5
        ),
        true,
    );

    prev_alpha = cur_alpha;
    prev_x = cur_x;
    prev_y = cur_y;
    prev_xy = cur_xy;
    prev_alphaxy = cur_alphaxy;
    prev_alphax = cur_alphax;
    prev_alphay = cur_alphay;

    // second participant
    let (cur_alphaxy, cur_xy, cur_alphax, cur_alphay, cur_alpha, cur_x, cur_y, proof5) = compute5(
        rng,
        &g1,
        &g2,
        &prev_alphaxy,
        &prev_xy,
        &prev_alphax,
        &prev_alphay,
        &prev_alpha,
        &prev_x,
        &prev_y,
        &v,
    );

    assert_eq!(
        verify5(
            &g1,
            &g2,
            &prev_alpha,
            &prev_x,
            &prev_y,
            &cur_alphaxy,
            &cur_xy,
            &cur_alphax,
            &cur_alphay,
            &cur_alpha,
            &cur_x,
            &cur_y,
            &proof5
        ),
        true,
    );
}

//ab_g1 = [A1 B1], ab_g2 = [A2, B2], c = [C1, C2]
pub fn consistent(ab_g1: &[G1serde], ab_g2: &[G2serde], c: &[G2serde]) -> bool {
    let a1 = ab_g1[0];
    let b1 = ab_g1[1];
    let c1 = c[0];
    let c2 = c[1];

    if ab_g2.is_empty() {
        same_ratio(a1, b1, c1, c2)
    } else {
        let a2 = ab_g2[0];
        let b2 = ab_g2[1];

        let (res_ab, res_c) = join(|| same_ratio(a1, b1, a2, b2), || same_ratio(a1, b1, c1, c2));

        res_ab && res_c
    }
}

pub fn check_pok(a: &G1serde, g1: &G1serde, b: G2serde, v: &[u8]) -> bool {
    let y = ro(&G1serde(a.0), v);
    same_ratio(*g1, *a, y, b)
}

pub fn pok(g1: &G1serde, alpha: ScalarField, v: &[u8]) -> G2serde {
    let alphaG1 = g1.mul(alpha);
    let y = ro(&alphaG1, v);
    y.mul(alpha)
}

pub fn same_ratio(g1_0: G1serde, g1_1: G1serde, g2_0: G2serde, g2_1: G2serde) -> bool {
    let results: Vec<PairingOutput<Bls12_381>> = [(&[g1_0], &[g2_1]), (&[g1_1], &[g2_0])]
        .par_iter()
        .map(|(g1, g2)| pairing(*g1, *g2))
        .collect();

    results[0].eq(&results[1])
}

pub fn ro(a: &G1serde, v: &[u8]) -> G2serde {
    let mut h = Blake2b::default();
    h.input(v);
    h.input(serialize_g1_affine(&a.0, Compress::No));
    hash_to_g2(h.result().as_ref())
}

fn vector_product(a: &Vec<ScalarField>, b: &Vec<ScalarField>) -> Vec<ScalarField> {
    let mut result: Vec<ScalarField> = Vec::with_capacity(a.len() * b.len());
    for i in 0..a.len() {
        for j in 0..b.len() {
            result.push(a[i].mul(b[j]));
        }
    }
    result
}
fn compute_powers(x_r: ScalarField, len_x: usize) -> Vec<ScalarField> {
    let mut x_powers: Vec<ScalarField> = Vec::with_capacity(len_x);
    let mut current_power = ScalarField::one();
    for i in 0..len_x {
        current_power = current_power.mul(x_r);
        x_powers.push(current_power);
    }
    x_powers
}

#[test]
pub fn test_consistent_case1() {
    let rng = &mut RandomGenerator::new(RandomStrategy::SystemRandom, [0u8; 32]);
    // a1*c2 == b1*c1
    let g1_gen = icicle_g1_generator();
    let g2_gen = icicle_g2_generator();
    let a1 = rng.next_random();
    let b1 = rng.next_random();
    let c1 = rng.next_random();
    let c2 = b1 * c1 * a1.inv();

    let a1G = g1_gen.mul(a1);
    let b1G = g1_gen.mul(b1);

    let c1G = g2_gen.mul(c1);
    let c2G = g2_gen.mul(c2);

    assert_eq!(consistent(&[a1G, b1G], &[], &[c1G, c2G]), true)
}

#[test]
pub fn test_consistent_case3() {
    let rng = &mut RandomGenerator::new(RandomStrategy::SystemRandom, [0u8; 32]);
    let g1_gen = icicle_g1_generator();
    let g2_gen = icicle_g2_generator();

    let a = rng.next_random();

    let two = ScalarField::one() + ScalarField::one();
    let three = two + ScalarField::one();
    let six = three + three;

    let a1 = a.mul(two); //2a
    let b1 = a.pow(2).mul(six); //6*a^2

    let c1 = a.mul(three); //3a

    let a1G = g1_gen.mul(a1);
    let b1G = g1_gen.mul(b1);

    let c1G = g2_gen; //G2
    let c2G = g2_gen.mul(c1); //3a * G2

    assert_eq!(consistent(&[a1G, b1G], &[], &[c1G, c2G]), true)
}

#[test]
pub fn test_compute1() {
    let rng = &mut RandomGenerator::new(RandomStrategy::SystemRandom, [0u8; 32]);
    //initialize
    let g1 = &icicle_g1_generator();
    let g2 = &icicle_g2_generator();

    let alpha_0G1 = g1.clone();
    let alpha_0G2 = g2.clone();

    let v = [34u8; 32];
    let mut prev_pair = PairSerde {
        g1: alpha_0G1,
        g2: alpha_0G2,
    };
    // first participant
    let (cur_pair, alphaG1, pok_alpha) = compute1(rng, g1, prev_pair.clone(), &v);

    assert_eq!(
        verify1(g1, prev_pair, cur_pair, &alphaG1, pok_alpha, &v),
        true,
    );
    prev_pair = cur_pair;
    let (cur_pair, alphaG1, pok_alpha) = compute1(rng, g1, prev_pair.clone(), &v);

    assert_eq!(
        verify1(g1, prev_pair, cur_pair, &alphaG1, pok_alpha, &v),
        true,
    );
    prev_pair = cur_pair;
    let (cur_pair, alphaG1, pok_alpha) = compute1(rng, g1, prev_pair.clone(), &v);

    //beacon verified
    assert_eq!(
        verify1(g1, prev_pair, cur_pair, &alphaG1, pok_alpha, &v),
        true,
    );
}

#[test]
pub fn test_invs() {
    let g2 = &icicle_g2_generator();
    let sc = ScalarField::from_u32(3);
    let scInv = sc.inv();

    println!("{}", sc);
    println!("{}", scInv);

    let x = g2.mul(sc);
    //multiplicative inverse
    let xInvG2 = g2.mul(scInv);
    //addition inverse
    let minusX = G2serde::zero().sub(x);

    assert_eq!(xInvG2.mul(sc), *g2);
    assert_eq!(x.add(minusX), G2serde::zero());
}

#[test]
pub fn test_compute2() {
    let rng = &mut RandomGenerator::new(RandomStrategy::SystemRandom, [0u8; 32]);
    let s_max: usize = 16;

    let g1 = &icicle_g1_generator();
    let g2 = &icicle_g2_generator();

    let x = vec![ScalarField::one(); s_max];

    let v = [34u8; 64];
    let mut prev_x_serial = SerialSerde::new(*g1, *g2, s_max);

    // first participant
    let (cur_pair, proof2) = compute2(rng, &g1, &prev_x_serial, &v);
    assert_eq!(verify2(g1, g2, &prev_x_serial, &cur_pair, &proof2), true,);
    prev_x_serial = cur_pair;

    //second participant
    let (cur_pair, proof2) = compute2(rng, &g1, &prev_x_serial, &v);
    assert_eq!(verify2(g1, g2, &prev_x_serial, &cur_pair, &proof2), true,);
    prev_x_serial = cur_pair;

    //third participant
    let (cur_x_serial, proof2) = compute2(rng, &g1, &prev_x_serial, &v);
    assert_eq!(
        verify2(g1, g2, &prev_x_serial, &cur_x_serial, &proof2),
        true,
    );
}
#[test]
pub fn test_consistent_case4() {
    let rng = &mut RandomGenerator::new(RandomStrategy::SystemRandom, [0u8; 32]);
    let g1_gen = icicle_g1_generator();
    let g2_gen = icicle_g2_generator();

    let two = ScalarField::from_u32(2);

    //same_ratio(A1, B1, A2, B2) && same_ratio(A1, B1, G2serde(g2), C2)
    // a1*b2 == b1*a2
    // a1 * c2 == b1 * 1
    let a1 = rng.next_random();
    let a2 = rng.next_random();

    let b1 = a1 * two;
    let b2 = a2 * two;

    let c1 = a1;
    let c2 = c1 * two;

    let a1G = g1_gen.mul(a1);
    let b1G = g1_gen.mul(b1);

    let a2G = g2_gen.mul(a2);
    let b2G = g2_gen.mul(b2);

    let c1G = g2_gen.mul(c1);
    let c2G = g2_gen.mul(c2);

    assert_eq!(consistent(&[a1G, b1G], &[a2G, b2G], &[c1G, c2G]), true)
}

#[test]
pub fn test_same_ratio() {
    let g1_gen = icicle_g1_generator();
    let g2_gen = icicle_g2_generator();

    let tau = Tau::gen();

    let x2G1 = g1_gen.mul(tau.x.pow(2));
    let xyG1 = g1_gen.mul(tau.x).mul(tau.y);

    let y2G2 = g2_gen.mul(tau.y.pow(2));
    let xyG2 = g2_gen.mul(tau.y).mul(tau.x);

    let result = same_ratio(x2G1, xyG1, xyG2, y2G2);
    assert_eq!(result, true)
}
#[test]
pub fn test_pok() {
    let g1 = icicle_g1_generator();

    let tau = Tau::gen();
    let v = [72u8; 64];
    let A = g1.mul(tau.alpha);
    let cpok = pok(&g1, tau.alpha, &v);

    let result = check_pok(&A, &g1, cpok, &v);
    assert_eq!(result, true)
}

#[test]
pub fn test_ro() {
    let g1_gen = icicle_g1_generator();
    let v = [99u8; 64];
    let out1 = ro(&g1_gen, &v);
    let out2 = ro(&g1_gen, &v);
    assert_eq!(out1.0, out2.0)
}

fn main() {}
