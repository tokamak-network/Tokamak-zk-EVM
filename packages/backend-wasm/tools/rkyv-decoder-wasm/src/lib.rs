#![deny(unsafe_code)]
#![allow(non_snake_case)]

use rkyv::check_archived_root;
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

const G1_BYTES: usize = 96;
const G2_BYTES: usize = 192;
const PAYLOAD_MAGIC: &[u8; 8] = b"TKCRS001";
const COMBINED_SIGMA_SECTION_COUNT: u32 = 9;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SupportedArchiveKind {
    CombinedSigma,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArchiveDecodeError {
    archive_kind: SupportedArchiveKind,
    message: String,
}

impl ArchiveDecodeError {
    pub fn new(archive_kind: SupportedArchiveKind, message: impl Into<String>) -> Self {
        Self {
            archive_kind,
            message: message.into(),
        }
    }

    pub fn archive_kind(&self) -> SupportedArchiveKind {
        self.archive_kind
    }
}

impl core::fmt::Display for ArchiveDecodeError {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(formatter, "{:?} rkyv archive decode failed: {}", self.archive_kind, self.message)
    }
}

impl std::error::Error for ArchiveDecodeError {}

#[derive(Debug, Clone, Copy, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
#[archive(check_bytes)]
pub struct G1SerdeRkyv {
    pub x: [u8; 48],
    pub y: [u8; 48],
}

#[derive(Debug, Clone, Copy, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
#[archive(check_bytes)]
pub struct G2SerdeRkyv {
    pub x: [u8; 96],
    pub y: [u8; 96],
}

#[derive(Debug, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
#[archive(check_bytes)]
pub struct SigmaRkyv {
    pub G: G1SerdeRkyv,
    pub H: G2SerdeRkyv,
    pub sigma_1: Sigma1Rkyv,
    pub sigma_2: Sigma2Rkyv,
    pub lagrange_KL: G1SerdeRkyv,
}

#[derive(Debug, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
#[archive(check_bytes)]
pub struct Sigma1Rkyv {
    pub xy_powers: Vec<G1SerdeRkyv>,
    pub x: G1SerdeRkyv,
    pub y: G1SerdeRkyv,
    pub delta: G1SerdeRkyv,
    pub eta: G1SerdeRkyv,
    pub gamma_inv_o_inst: Vec<G1SerdeRkyv>,
    pub eta_inv_li_o_inter_alpha4_kj: Vec<Vec<G1SerdeRkyv>>,
    pub delta_inv_li_o_prv: Vec<Vec<G1SerdeRkyv>>,
    pub delta_inv_alphak_xh_tx: Vec<Vec<G1SerdeRkyv>>,
    pub delta_inv_alpha4_xj_tx: Vec<G1SerdeRkyv>,
    pub delta_inv_alphak_yi_ty: Vec<Vec<G1SerdeRkyv>>,
}

#[derive(Debug, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
#[archive(check_bytes)]
pub struct Sigma2Rkyv {
    pub alpha: G2SerdeRkyv,
    pub alpha2: G2SerdeRkyv,
    pub alpha3: G2SerdeRkyv,
    pub alpha4: G2SerdeRkyv,
    pub gamma: G2SerdeRkyv,
    pub delta: G2SerdeRkyv,
    pub eta: G2SerdeRkyv,
    pub x: G2SerdeRkyv,
    pub y: G2SerdeRkyv,
}

pub fn decode_combined_sigma(input: &[u8]) -> Result<Vec<u8>, ArchiveDecodeError> {
    let sigma = check_archived_root::<SigmaRkyv>(input).map_err(|error| {
        ArchiveDecodeError::new(
            SupportedArchiveKind::CombinedSigma,
            format!("invalid archive shape: {error:?}"),
        )
    })?;

    Ok(encode_combined_sigma_payload(sigma))
}

#[wasm_bindgen(js_name = decodeCombinedSigma)]
pub fn decode_combined_sigma_wasm(input: &[u8]) -> Result<Vec<u8>, JsValue> {
    decode_combined_sigma(input).map_err(|error| JsValue::from_str(&error.to_string()))
}

fn encode_combined_sigma_payload(sigma: &ArchivedSigmaRkyv) -> Vec<u8> {
    let sections = [
        encode_sigma_g1(sigma),
        encode_g1_slice(sigma.sigma_1.xy_powers.as_slice()),
        encode_g1_slice(sigma.sigma_1.gamma_inv_o_inst.as_slice()),
        encode_nested_g1_slice(sigma.sigma_1.eta_inv_li_o_inter_alpha4_kj.as_slice()),
        encode_nested_g1_slice(sigma.sigma_1.delta_inv_li_o_prv.as_slice()),
        encode_nested_g1_slice(sigma.sigma_1.delta_inv_alphak_xh_tx.as_slice()),
        encode_g1_slice(sigma.sigma_1.delta_inv_alpha4_xj_tx.as_slice()),
        encode_nested_g1_slice(sigma.sigma_1.delta_inv_alphak_yi_ty.as_slice()),
        encode_sigma_g2(sigma),
    ];

    let total_section_bytes = sections.iter().map(Vec::len).sum::<usize>();
    let mut output = Vec::with_capacity(12 + sections.len() * 4 + total_section_bytes);

    output.extend_from_slice(PAYLOAD_MAGIC);
    output.extend_from_slice(&COMBINED_SIGMA_SECTION_COUNT.to_le_bytes());
    for section in &sections {
        output.extend_from_slice(&(section.len() as u32).to_le_bytes());
    }
    for section in sections {
        output.extend_from_slice(&section);
    }

    output
}

fn encode_sigma_g1(sigma: &ArchivedSigmaRkyv) -> Vec<u8> {
    let mut output = Vec::with_capacity(6 * G1_BYTES);
    push_g1(&mut output, &sigma.G);
    push_g1(&mut output, &sigma.sigma_1.x);
    push_g1(&mut output, &sigma.sigma_1.y);
    push_g1(&mut output, &sigma.sigma_1.delta);
    push_g1(&mut output, &sigma.sigma_1.eta);
    push_g1(&mut output, &sigma.lagrange_KL);
    output
}

fn encode_sigma_g2(sigma: &ArchivedSigmaRkyv) -> Vec<u8> {
    let mut output = Vec::with_capacity(10 * G2_BYTES);
    push_g2(&mut output, &sigma.H);
    push_g2(&mut output, &sigma.sigma_2.alpha);
    push_g2(&mut output, &sigma.sigma_2.alpha2);
    push_g2(&mut output, &sigma.sigma_2.alpha3);
    push_g2(&mut output, &sigma.sigma_2.alpha4);
    push_g2(&mut output, &sigma.sigma_2.gamma);
    push_g2(&mut output, &sigma.sigma_2.delta);
    push_g2(&mut output, &sigma.sigma_2.eta);
    push_g2(&mut output, &sigma.sigma_2.x);
    push_g2(&mut output, &sigma.sigma_2.y);
    output
}

fn encode_g1_slice(points: &[ArchivedG1SerdeRkyv]) -> Vec<u8> {
    let mut output = Vec::with_capacity(points.len() * G1_BYTES);
    for point in points {
        push_g1(&mut output, point);
    }
    output
}

fn encode_nested_g1_slice(rows: &[rkyv::vec::ArchivedVec<ArchivedG1SerdeRkyv>]) -> Vec<u8> {
    let element_count = rows.iter().map(|row| row.len()).sum::<usize>();
    let mut output = Vec::with_capacity(element_count * G1_BYTES);
    for row in rows {
        for point in row.as_slice() {
            push_g1(&mut output, point);
        }
    }
    output
}

fn push_g1(output: &mut Vec<u8>, point: &ArchivedG1SerdeRkyv) {
    output.extend_from_slice(&point.x);
    output.extend_from_slice(&point.y);
}

fn push_g2(output: &mut Vec<u8>, point: &ArchivedG2SerdeRkyv) {
    output.extend_from_slice(&point.x);
    output.extend_from_slice(&point.y);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_combined_sigma_archive_into_section_payloads() {
        let sigma = sample_sigma();
        let archive = rkyv::to_bytes::<_, 256>(&sigma).expect("serialize sample sigma");
        let payload = decode_combined_sigma(archive.as_ref()).expect("decode sample sigma");
        let sections = parse_payload(&payload);

        assert_eq!(sections.len(), COMBINED_SIGMA_SECTION_COUNT as usize);
        assert_eq!(sections[0].len(), 6 * G1_BYTES);
        assert_eq!(sections[1].len(), 2 * G1_BYTES);
        assert_eq!(sections[2].len(), G1_BYTES);
        assert_eq!(sections[3].len(), 3 * G1_BYTES);
        assert_eq!(sections[4].len(), G1_BYTES);
        assert_eq!(sections[5].len(), 3 * G1_BYTES);
        assert_eq!(sections[6].len(), G1_BYTES);
        assert_eq!(sections[7].len(), 2 * G1_BYTES);
        assert_eq!(sections[8].len(), 10 * G2_BYTES);

        assert_eq!(&sections[0][0..G1_BYTES], &encode_g1(&sigma.G));
        assert_eq!(&sections[0][G1_BYTES..2 * G1_BYTES], &encode_g1(&sigma.sigma_1.x));
        assert_eq!(&sections[0][5 * G1_BYTES..6 * G1_BYTES], &encode_g1(&sigma.lagrange_KL));
        assert_eq!(&sections[8][0..G2_BYTES], &encode_g2(&sigma.H));
        assert_eq!(&sections[8][9 * G2_BYTES..10 * G2_BYTES], &encode_g2(&sigma.sigma_2.y));
    }

    #[test]
    fn rejects_invalid_combined_sigma_archive() {
        let error = decode_combined_sigma(b"not an archive").expect_err("invalid archive must fail");
        assert_eq!(error.archive_kind(), SupportedArchiveKind::CombinedSigma);
    }

    fn sample_sigma() -> SigmaRkyv {
        SigmaRkyv {
            G: g1(1),
            H: g2(2),
            sigma_1: Sigma1Rkyv {
                xy_powers: vec![g1(3), g1(4)],
                x: g1(5),
                y: g1(6),
                delta: g1(7),
                eta: g1(8),
                gamma_inv_o_inst: vec![g1(9)],
                eta_inv_li_o_inter_alpha4_kj: vec![vec![g1(10), g1(11)], vec![g1(12)]],
                delta_inv_li_o_prv: vec![vec![g1(13)]],
                delta_inv_alphak_xh_tx: vec![vec![g1(14)], vec![g1(15), g1(16)]],
                delta_inv_alpha4_xj_tx: vec![g1(17)],
                delta_inv_alphak_yi_ty: vec![vec![g1(18), g1(19)]],
            },
            sigma_2: Sigma2Rkyv {
                alpha: g2(20),
                alpha2: g2(21),
                alpha3: g2(22),
                alpha4: g2(23),
                gamma: g2(24),
                delta: g2(25),
                eta: g2(26),
                x: g2(27),
                y: g2(28),
            },
            lagrange_KL: g1(29),
        }
    }

    fn g1(seed: u8) -> G1SerdeRkyv {
        let mut x = [0u8; 48];
        let mut y = [0u8; 48];
        for index in 0..48 {
            x[index] = seed.wrapping_add(index as u8);
            y[index] = seed.wrapping_add(48).wrapping_add(index as u8);
        }
        G1SerdeRkyv { x, y }
    }

    fn g2(seed: u8) -> G2SerdeRkyv {
        let mut x = [0u8; 96];
        let mut y = [0u8; 96];
        for index in 0..96 {
            x[index] = seed.wrapping_add(index as u8);
            y[index] = seed.wrapping_add(96).wrapping_add(index as u8);
        }
        G2SerdeRkyv { x, y }
    }

    fn encode_g1(point: &G1SerdeRkyv) -> Vec<u8> {
        let mut output = Vec::with_capacity(G1_BYTES);
        output.extend_from_slice(&point.x);
        output.extend_from_slice(&point.y);
        output
    }

    fn encode_g2(point: &G2SerdeRkyv) -> Vec<u8> {
        let mut output = Vec::with_capacity(G2_BYTES);
        output.extend_from_slice(&point.x);
        output.extend_from_slice(&point.y);
        output
    }

    fn parse_payload(payload: &[u8]) -> Vec<&[u8]> {
        assert_eq!(&payload[0..8], PAYLOAD_MAGIC);
        let section_count = u32::from_le_bytes(payload[8..12].try_into().unwrap()) as usize;
        let mut lengths = Vec::with_capacity(section_count);
        let mut offset = 12;
        for _ in 0..section_count {
            lengths.push(u32::from_le_bytes(payload[offset..offset + 4].try_into().unwrap()) as usize);
            offset += 4;
        }

        let mut sections = Vec::with_capacity(section_count);
        for length in lengths {
            sections.push(&payload[offset..offset + length]);
            offset += length;
        }

        assert_eq!(offset, payload.len());
        sections
    }
}
