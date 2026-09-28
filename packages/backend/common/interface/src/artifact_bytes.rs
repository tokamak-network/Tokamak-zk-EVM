// Generated from common/contracts/univariate-artifact-contract.json. Do not edit.
const SCALAR_MODULUS_LE: &[u8] = b"\x01\x00\x00\x00\xff\xff\xff\xff\xfe\x5b\xfe\xff\x02\xa4\xbd\x53\x05\xd8\xa1\x09\x08\xd8\x39\x33\x48\x7d\x9d\x29\x53\xa7\xed\x73";
const BASE_FIELD_MODULUS_LE: &[u8] = b"\xab\xaa\xff\xff\xff\xff\xfe\xb9\xff\xff\x53\xb1\xfe\xff\xab\x1e\x24\xf6\xb0\xf6\xa0\xd2\x30\x67\xbf\x12\x85\xf3\x84\x4b\x77\x64\xd7\xac\x4b\x43\xb6\xa7\x1b\x4b\x9a\xe6\x7f\x39\xea\x11\x01\x1a";

fn canonical(bytes: &[u8], scalar: bool) -> bool {
    let modulus = if scalar {
        SCALAR_MODULUS_LE
    } else {
        BASE_FIELD_MODULUS_LE
    };
    bytes.len() == modulus.len() && bytes.iter().rev().cmp(modulus.iter().rev()).is_lt()
}
fn check_field(bytes: &[u8], scalar: bool) -> Result<(), &'static str> {
    let width = if scalar { 32 } else { 48 };
    if bytes.chunks_exact(width).all(|c| canonical(c, scalar)) {
        Ok(())
    } else {
        Err("noncanonical artifact field")
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProofBytes {
    pub c_l: [u8; 96],
    pub c_h: [u8; 96],
    pub c_o: [u8; 96],
    pub d_q: [u8; 96],
    pub d_q_k: [u8; 96],
    pub c_d: [u8; 96],
    pub c_r: [u8; 96],
    pub c_q: [u8; 96],
    pub pi_chi: [u8; 96],
    pub pi_plus: [u8; 96],
    pub s_c: [u8; 32],
    pub u: [u8; 32],
    pub v: [u8; 32],
    pub w: [u8; 32],
    pub b: [u8; 32],
    pub r: [u8; 32],
    pub r_plus: [u8; 32],
}
impl ProofBytes {
    pub const BYTE_LENGTH: usize = 1184;
    pub const FILE_NAME: &'static str = "univariate_proof.bin";
    pub fn decode(bytes: &[u8]) -> Result<Self, &'static str> {
        if bytes.len() != Self::BYTE_LENGTH {
            return Err("invalid artifact byte length");
        }
        check_field(&bytes[0..96], false)?;
        check_field(&bytes[96..192], false)?;
        check_field(&bytes[192..288], false)?;
        check_field(&bytes[288..384], false)?;
        check_field(&bytes[384..480], false)?;
        check_field(&bytes[480..576], false)?;
        check_field(&bytes[576..672], false)?;
        check_field(&bytes[672..768], false)?;
        check_field(&bytes[768..864], false)?;
        check_field(&bytes[864..960], false)?;
        check_field(&bytes[960..992], true)?;
        check_field(&bytes[992..1024], true)?;
        check_field(&bytes[1024..1056], true)?;
        check_field(&bytes[1056..1088], true)?;
        check_field(&bytes[1088..1120], true)?;
        check_field(&bytes[1120..1152], true)?;
        check_field(&bytes[1152..1184], true)?;
        Ok(Self {
            c_l: bytes[0..96].try_into().unwrap(),
            c_h: bytes[96..192].try_into().unwrap(),
            c_o: bytes[192..288].try_into().unwrap(),
            d_q: bytes[288..384].try_into().unwrap(),
            d_q_k: bytes[384..480].try_into().unwrap(),
            c_d: bytes[480..576].try_into().unwrap(),
            c_r: bytes[576..672].try_into().unwrap(),
            c_q: bytes[672..768].try_into().unwrap(),
            pi_chi: bytes[768..864].try_into().unwrap(),
            pi_plus: bytes[864..960].try_into().unwrap(),
            s_c: bytes[960..992].try_into().unwrap(),
            u: bytes[992..1024].try_into().unwrap(),
            v: bytes[1024..1056].try_into().unwrap(),
            w: bytes[1056..1088].try_into().unwrap(),
            b: bytes[1088..1120].try_into().unwrap(),
            r: bytes[1120..1152].try_into().unwrap(),
            r_plus: bytes[1152..1184].try_into().unwrap(),
        })
    }
    pub fn encode(&self) -> Result<Vec<u8>, &'static str> {
        let mut bytes = Vec::with_capacity(Self::BYTE_LENGTH);
        check_field(&self.c_l, false)?;
        bytes.extend_from_slice(&self.c_l);
        check_field(&self.c_h, false)?;
        bytes.extend_from_slice(&self.c_h);
        check_field(&self.c_o, false)?;
        bytes.extend_from_slice(&self.c_o);
        check_field(&self.d_q, false)?;
        bytes.extend_from_slice(&self.d_q);
        check_field(&self.d_q_k, false)?;
        bytes.extend_from_slice(&self.d_q_k);
        check_field(&self.c_d, false)?;
        bytes.extend_from_slice(&self.c_d);
        check_field(&self.c_r, false)?;
        bytes.extend_from_slice(&self.c_r);
        check_field(&self.c_q, false)?;
        bytes.extend_from_slice(&self.c_q);
        check_field(&self.pi_chi, false)?;
        bytes.extend_from_slice(&self.pi_chi);
        check_field(&self.pi_plus, false)?;
        bytes.extend_from_slice(&self.pi_plus);
        check_field(&self.s_c, true)?;
        bytes.extend_from_slice(&self.s_c);
        check_field(&self.u, true)?;
        bytes.extend_from_slice(&self.u);
        check_field(&self.v, true)?;
        bytes.extend_from_slice(&self.v);
        check_field(&self.w, true)?;
        bytes.extend_from_slice(&self.w);
        check_field(&self.b, true)?;
        bytes.extend_from_slice(&self.b);
        check_field(&self.r, true)?;
        bytes.extend_from_slice(&self.r);
        check_field(&self.r_plus, true)?;
        bytes.extend_from_slice(&self.r_plus);
        Ok(bytes)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreprocessBytes {
    pub s_c: [u8; 96],
    pub c_fix: [u8; 96],
    pub e_kappa: [u8; 192],
}
impl PreprocessBytes {
    pub const BYTE_LENGTH: usize = 384;
    pub const FILE_NAME: &'static str = "univariate_verifier_preprocess.bin";
    pub fn decode(bytes: &[u8]) -> Result<Self, &'static str> {
        if bytes.len() != Self::BYTE_LENGTH {
            return Err("invalid artifact byte length");
        }
        check_field(&bytes[0..96], false)?;
        check_field(&bytes[96..192], false)?;
        check_field(&bytes[192..384], false)?;
        Ok(Self {
            s_c: bytes[0..96].try_into().unwrap(),
            c_fix: bytes[96..192].try_into().unwrap(),
            e_kappa: bytes[192..384].try_into().unwrap(),
        })
    }
    pub fn encode(&self) -> Result<Vec<u8>, &'static str> {
        let mut bytes = Vec::with_capacity(Self::BYTE_LENGTH);
        check_field(&self.s_c, false)?;
        bytes.extend_from_slice(&self.s_c);
        check_field(&self.c_fix, false)?;
        bytes.extend_from_slice(&self.c_fix);
        check_field(&self.e_kappa, false)?;
        bytes.extend_from_slice(&self.e_kappa);
        Ok(bytes)
    }
}
