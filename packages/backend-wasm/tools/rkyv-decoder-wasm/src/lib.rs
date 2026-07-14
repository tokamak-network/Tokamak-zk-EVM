#![deny(unsafe_code)]

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SupportedArchiveKind {
    CombinedSigma,
    SigmaPreprocess,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnsupportedArchiveError {
    archive_kind: SupportedArchiveKind,
}

impl UnsupportedArchiveError {
    pub fn archive_kind(&self) -> SupportedArchiveKind {
        self.archive_kind
    }
}

impl core::fmt::Display for UnsupportedArchiveError {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(
            formatter,
            "rkyv archive decoding for {:?} is not implemented in backend-wasm-rkyv-decoder yet",
            self.archive_kind
        )
    }
}

impl std::error::Error for UnsupportedArchiveError {}

pub fn decode_combined_sigma(_input: &[u8]) -> Result<Vec<u8>, UnsupportedArchiveError> {
    Err(UnsupportedArchiveError {
        archive_kind: SupportedArchiveKind::CombinedSigma,
    })
}

pub fn decode_sigma_preprocess(_input: &[u8]) -> Result<Vec<u8>, UnsupportedArchiveError> {
    Err(UnsupportedArchiveError {
        archive_kind: SupportedArchiveKind::SigmaPreprocess,
    })
}

