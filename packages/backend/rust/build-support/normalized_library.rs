use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::fs::File;
use std::io::{self, BufReader};
use std::ops::Range;
use std::path::Path;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PublicRegion {
    Free,
    Fixed,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct PublicWirePhase {
    pub name: String,
    pub region: PublicRegion,
    pub subcircuit_ids: Box<[usize]>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct NormalizedSetupParams {
    pub n: usize,
    pub m: usize,
    pub m_b: usize,
    pub t: usize,
    pub s: usize,
    #[serde(rename = "publicWirePhases")]
    pub public_wire_phases: Box<[PublicWirePhase]>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BufferDirection {
    In,
    Out,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[allow(non_snake_case)]
#[serde(deny_unknown_fields)]
pub struct NormalizedSubcircuitInfo {
    pub id: usize,
    pub name: String,
    pub Nwires: usize,
    pub NrealWires: usize,
    pub Nconsts: usize,
    pub Out_idx: [usize; 2],
    pub In_idx: [usize; 2],
    pub Wiring_idx: [usize; 2],
    pub Public_idx: [usize; 2],
    pub Internal_idx: [usize; 2],
    #[serde(default)]
    pub bufferDirection: Option<BufferDirection>,
    #[serde(default)]
    pub publicPhase: Option<String>,
    // This producer-owned extension is intentionally admitted but not interpreted by the
    // proving backend. Its schema and semantics belong to the qap-compiler/synthesizer.
    #[serde(default)]
    pub logicalInterface: Option<serde_json::Value>,
}

impl NormalizedSubcircuitInfo {
    pub fn wiring_range(&self) -> Range<usize> {
        self.Wiring_idx[0]..self.Wiring_idx[0] + self.Wiring_idx[1]
    }

    pub fn public_range(&self) -> Range<usize> {
        self.Public_idx[0]..self.Public_idx[0] + self.Public_idx[1]
    }

    pub fn internal_range(&self) -> Range<usize> {
        self.Internal_idx[0]..self.Internal_idx[0] + self.Internal_idx[1]
    }

    pub fn is_wiring_padding(&self, local_wire_index: usize, wiring_width: usize) -> bool {
        local_wire_index >= self.wiring_range().end && local_wire_index < wiring_width
    }

    pub fn is_internal_padding(&self, local_wire_index: usize, wire_width: usize) -> bool {
        local_wire_index >= self.internal_range().end && local_wire_index < wire_width
    }

    pub fn retained_nonpublic_wires(&self) -> Vec<usize> {
        let public = self.public_range();
        self.wiring_range()
            .filter(|local_wire_index| !public.contains(local_wire_index))
            .chain(self.internal_range())
            .collect()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PublicWireSource {
    Padding,
    Mapped {
        subcircuit_id: usize,
        local_wire_index: usize,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PublicWireSegment {
    pub start: usize,
    pub end: usize,
    pub subcircuit_id: usize,
    pub placement_phase: usize,
    pub region: PublicRegion,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NormalizedPublicWireLayout {
    free_public_len: usize,
    sources: Box<[PublicWireSource]>,
    segments: Box<[PublicWireSegment]>,
}

impl NormalizedPublicWireLayout {
    pub fn len(&self) -> usize {
        self.sources.len()
    }

    pub fn is_empty(&self) -> bool {
        self.sources.is_empty()
    }

    pub fn free_public_len(&self) -> usize {
        self.free_public_len
    }

    pub fn source(&self, public_index: usize) -> Option<PublicWireSource> {
        self.sources.get(public_index).copied()
    }

    pub fn segments(&self) -> &[PublicWireSegment] {
        &self.segments
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NormalizedSubcircuitLibrary {
    pub setup: NormalizedSetupParams,
    pub subcircuits: Box<[NormalizedSubcircuitInfo]>,
    pub public: NormalizedPublicWireLayout,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NormalizedLibraryError(String);

impl fmt::Display for NormalizedLibraryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

impl std::error::Error for NormalizedLibraryError {}

impl NormalizedSubcircuitLibrary {
    pub fn read_from_qap_path(path: impl AsRef<Path>) -> io::Result<Self> {
        let path = path.as_ref();
        let setup =
            serde_json::from_reader(BufReader::new(File::open(path.join("setupParams.json"))?))?;
        let subcircuits = serde_json::from_reader(BufReader::new(File::open(
            path.join("subcircuitInfo.json"),
        )?))?;
        Self::new(setup, subcircuits)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
    }

    pub fn new(
        setup: NormalizedSetupParams,
        subcircuits: Box<[NormalizedSubcircuitInfo]>,
    ) -> Result<Self, NormalizedLibraryError> {
        validate_capacities(&setup, subcircuits.len())?;
        validate_subcircuits(&setup, &subcircuits)?;
        let public = derive_public_layout(&setup, &subcircuits)?;
        Ok(Self {
            setup,
            subcircuits,
            public,
        })
    }

    pub fn actual_subcircuit_count(&self) -> usize {
        self.subcircuits.len()
    }

    pub fn empty_subcircuit_id(&self) -> usize {
        self.setup.t - 1
    }

    pub fn physical_wire_offset(
        &self,
        subcircuit_id: usize,
        local_wire_index: usize,
    ) -> Option<usize> {
        if subcircuit_id >= self.setup.t || local_wire_index >= self.setup.m {
            return None;
        }
        subcircuit_id
            .checked_mul(self.setup.m)?
            .checked_add(local_wire_index)
    }
}

fn validate_capacities(
    setup: &NormalizedSetupParams,
    actual_subcircuit_count: usize,
) -> Result<(), NormalizedLibraryError> {
    for (name, value) in [
        ("n", setup.n),
        ("m", setup.m),
        ("m_b", setup.m_b),
        ("t", setup.t),
        ("s", setup.s),
    ] {
        if !value.is_power_of_two() {
            return Err(error(format!("{name} must be a positive power of two")));
        }
    }
    if setup.m_b > setup.m {
        return Err(error("m_b must not exceed m"));
    }
    if actual_subcircuit_count >= setup.t {
        return Err(error(
            "t must reserve its final ID for the virtual empty subcircuit",
        ));
    }
    Ok(())
}

fn validate_subcircuits(
    setup: &NormalizedSetupParams,
    subcircuits: &[NormalizedSubcircuitInfo],
) -> Result<(), NormalizedLibraryError> {
    let mut names = HashSet::new();
    for (expected_id, circuit) in subcircuits.iter().enumerate() {
        if circuit.id != expected_id || !names.insert(circuit.name.as_str()) {
            return Err(error(
                "actual subcircuits must have contiguous IDs and unique names",
            ));
        }
        if circuit.Nwires != setup.m {
            return Err(error(format!(
                "subcircuit {} does not use wire width m",
                circuit.id
            )));
        }
        let [output_start, output_count] = circuit.Out_idx;
        let [input_start, input_count] = circuit.In_idx;
        let [wiring_start, wiring_count] = circuit.Wiring_idx;
        let [internal_start, internal_count] = circuit.Internal_idx;
        if output_start != 1
            || input_start != output_start + output_count
            || wiring_start != 0
            || wiring_count != 1 + output_count + input_count
            || wiring_count > setup.m_b
            || internal_start != setup.m_b
            || internal_start + internal_count > setup.m
            || circuit.NrealWires != wiring_count + internal_count
        {
            return Err(error(format!(
                "subcircuit {} has inconsistent normalized wire ranges",
                circuit.id
            )));
        }
        let public = circuit.public_range();
        if !public.is_empty()
            && public != (output_start..output_start + output_count)
            && public != (input_start..input_start + input_count)
        {
            return Err(error(format!(
                "subcircuit {} public range is not an input or output port",
                circuit.id
            )));
        }
        if public.contains(&0) || circuit.is_wiring_padding(0, setup.m_b) {
            return Err(error(format!(
                "subcircuit {} classifies constant wire zero as public or padding",
                circuit.id
            )));
        }
    }
    Ok(())
}

fn derive_public_layout(
    setup: &NormalizedSetupParams,
    subcircuits: &[NormalizedSubcircuitInfo],
) -> Result<NormalizedPublicWireLayout, NormalizedLibraryError> {
    let mut sources = Vec::new();
    let mut segments = Vec::new();
    let mut phase_names = HashSet::new();
    let mut owners = HashMap::new();
    let mut reached_fixed = false;

    for phase in &setup.public_wire_phases {
        if phase.name.is_empty() || !phase_names.insert(phase.name.as_str()) {
            return Err(error("public phase names must be unique and non-empty"));
        }
        if reached_fixed && phase.region == PublicRegion::Free {
            return Err(error("a free public phase follows a fixed public phase"));
        }
        reached_fixed |= phase.region == PublicRegion::Fixed;
        for &subcircuit_id in &phase.subcircuit_ids {
            if owners.insert(subcircuit_id, phase.name.as_str()).is_some() {
                return Err(error("a subcircuit belongs to more than one public phase"));
            }
            let circuit = subcircuits.get(subcircuit_id).ok_or_else(|| {
                error(format!(
                    "public phase references unavailable subcircuit {subcircuit_id}"
                ))
            })?;
            if circuit.publicPhase.as_deref() != Some(phase.name.as_str()) {
                return Err(error(format!(
                    "subcircuit {subcircuit_id} public phase does not match setup metadata"
                )));
            }
            if circuit.public_range().is_empty() || subcircuit_id >= setup.s {
                return Err(error(format!(
                    "public subcircuit {subcircuit_id} has no admissible placement phase"
                )));
            }
            let direction_matches = match circuit.bufferDirection {
                Some(BufferDirection::In) => circuit.Public_idx == circuit.In_idx,
                Some(BufferDirection::Out) => circuit.Public_idx == circuit.Out_idx,
                None => false,
            };
            if !direction_matches {
                return Err(error(format!(
                    "public subcircuit {subcircuit_id} does not expose its declared buffer port"
                )));
            }
            let start = sources.len();
            sources.extend(circuit.public_range().map(|local_wire_index| {
                PublicWireSource::Mapped {
                    subcircuit_id,
                    local_wire_index,
                }
            }));
            segments.push(PublicWireSegment {
                start,
                end: sources.len(),
                subcircuit_id,
                placement_phase: subcircuit_id,
                region: phase.region,
            });
        }
    }

    for circuit in subcircuits {
        let owner = owners.get(&circuit.id).copied();
        if circuit.public_range().is_empty() != owner.is_none()
            || circuit.publicPhase.as_deref() != owner
        {
            return Err(error(format!(
                "subcircuit {} has inconsistent public ownership",
                circuit.id
            )));
        }
    }

    let actual_free_len = segments
        .iter()
        .filter(|segment| segment.region == PublicRegion::Free)
        .map(|segment| segment.end - segment.start)
        .sum::<usize>();
    let free_public_len = actual_free_len.max(1).next_power_of_two();
    let fixed_sources = sources.split_off(actual_free_len);
    sources.resize(free_public_len, PublicWireSource::Padding);
    sources.extend(fixed_sources);
    let padding = free_public_len - actual_free_len;
    if padding > 0 {
        for segment in segments
            .iter_mut()
            .filter(|segment| segment.region == PublicRegion::Fixed)
        {
            segment.start += padding;
            segment.end += padding;
        }
    }

    Ok(NormalizedPublicWireLayout {
        free_public_len,
        sources: sources.into_boxed_slice(),
        segments: segments.into_boxed_slice(),
    })
}

fn error(message: impl Into<String>) -> NormalizedLibraryError {
    NormalizedLibraryError(message.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repository_library_path() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../frontend/qap-compiler/subcircuits/library")
    }

    #[test]
    fn reads_the_current_normalized_qap_library() {
        let library = NormalizedSubcircuitLibrary::read_from_qap_path(repository_library_path())
            .expect("current local QAP artifacts must satisfy the normalized contract");
        assert_eq!(
            (library.setup.n, library.setup.m, library.setup.m_b),
            (1024, 2048, 512)
        );
        assert_eq!((library.setup.t, library.setup.s), (64, 256));
        assert_eq!(library.actual_subcircuit_count(), 44);
        assert_eq!(library.empty_subcircuit_id(), 63);
        assert_eq!(library.public.free_public_len(), 256);
        assert_eq!(library.public.len(), 396);
        assert_eq!(
            library
                .subcircuits
                .iter()
                .map(|circuit| circuit.retained_nonpublic_wires().len())
                .sum::<usize>(),
            23_464
        );
        assert_eq!(
            library.physical_wire_offset(43, 2047),
            Some(43 * 2048 + 2047)
        );
        assert_eq!(library.physical_wire_offset(64, 0), None);
    }

    #[test]
    fn distinguishes_real_zero_wires_from_declared_padding() {
        let library = NormalizedSubcircuitLibrary::read_from_qap_path(repository_library_path())
            .expect("current local QAP artifacts must satisfy the normalized contract");
        let circuit = &library.subcircuits[0];
        assert!(!circuit.is_wiring_padding(0, library.setup.m_b));
        assert!(circuit.is_wiring_padding(circuit.wiring_range().end, library.setup.m_b));
        assert!(circuit.is_internal_padding(circuit.internal_range().end, library.setup.m));
    }

    #[test]
    fn retained_queries_match_a_dense_zero_padding_reference() {
        let library = NormalizedSubcircuitLibrary::read_from_qap_path(repository_library_path())
            .expect("current local QAP artifacts must satisfy the normalized contract");
        let circuit = &library.subcircuits[7];
        let retained = circuit.retained_nonpublic_wires();
        let public = circuit.public_range();
        let witness = (0..library.setup.m)
            .map(|local_wire_index| {
                if circuit.is_wiring_padding(local_wire_index, library.setup.m_b)
                    || circuit.is_internal_padding(local_wire_index, library.setup.m)
                    || public.contains(&local_wire_index)
                {
                    0usize
                } else {
                    local_wire_index + 1
                }
            })
            .collect::<Vec<_>>();
        let dense = witness
            .iter()
            .enumerate()
            .map(|(local_wire_index, value)| (local_wire_index + 3) * value)
            .sum::<usize>();
        let sparse = retained
            .iter()
            .map(|local_wire_index| (local_wire_index + 3) * witness[*local_wire_index])
            .sum::<usize>();
        assert_eq!(sparse, dense);
        assert!(retained.contains(&0));
        assert!(!retained.contains(&circuit.wiring_range().end));
        assert!(!retained.contains(&circuit.internal_range().end));
    }

    #[test]
    fn rejects_retired_aggregate_setup_fields() {
        let setup = r#"{
            "n": 16,
            "m": 8,
            "m_b": 8,
            "t": 2,
            "s": 8,
            "publicWirePhases": [],
            "globalWireList": []
        }"#;
        assert!(serde_json::from_str::<NormalizedSetupParams>(setup).is_err());

        let subcircuit = r#"{
            "id": 0,
            "name": "buffer",
            "Nwires": 8,
            "NrealWires": 2,
            "Nconsts": 1,
            "Out_idx": [1, 1],
            "In_idx": [2, 0],
            "Wiring_idx": [0, 2],
            "Public_idx": [1, 1],
            "Internal_idx": [8, 0],
            "bufferDirection": "out",
            "publicPhase": "free",
            "logicalInterface": { "inputs": [], "outputs": [] },
            "flattenMap": [0, 1]
        }"#;
        assert!(serde_json::from_str::<NormalizedSubcircuitInfo>(subcircuit).is_err());
    }
}
