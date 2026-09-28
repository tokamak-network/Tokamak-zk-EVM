//! Library-derived indexing of retained nonpublic queries.
//!
//! This table is reconstructed from producer-owned local wire ranges and is
//! never serialized. A real wire is retained even if a particular execution
//! assigns it zero.

use std::ops::Range;

#[derive(Debug)]
pub struct NonpublicQueryLayout {
    placements: usize,
    offsets: Vec<usize>,
    wires: Vec<Vec<usize>>,
    count: usize,
}

impl NonpublicQueryLayout {
    pub fn from_retained_wires(
        placements: usize,
        retained_wires: Vec<Vec<usize>>,
    ) -> Result<Self, &'static str> {
        if placements == 0 || retained_wires.is_empty() {
            return Err("query layout requires nonempty library dimensions");
        }
        let mut offsets = Vec::with_capacity(retained_wires.len() + 1);
        offsets.push(0usize);
        for wires in &retained_wires {
            if wires.windows(2).any(|pair| pair[0] >= pair[1]) {
                return Err("retained local wires must be strictly increasing");
            }
            offsets.push(
                offsets
                    .last()
                    .unwrap()
                    .checked_add(wires.len())
                    .ok_or("query count overflow")?,
            );
        }
        let count = placements
            .checked_mul(*offsets.last().unwrap())
            .ok_or("query count overflow")?;
        Ok(Self {
            placements,
            offsets,
            wires: retained_wires,
            count,
        })
    }

    pub fn len(&self) -> usize {
        self.count
    }
    pub fn is_empty(&self) -> bool {
        self.count == 0
    }

    /// One contiguous block; callers supply only actual selected circuit IDs.
    /// An implicit empty placement has no witness or query block to load.
    pub fn range(&self, placement: usize, circuit: usize) -> Result<Range<usize>, &'static str> {
        if placement >= self.placements || circuit >= self.wires.len() {
            return Err("query coordinate is not an actual placement/circuit pair");
        }
        let start = placement * self.offsets.last().unwrap();
        Ok(start + self.offsets[circuit]..start + self.offsets[circuit + 1])
    }

    /// Local witness indices in exactly the same order as range().
    pub fn local_wires(&self, circuit: usize) -> Result<&[usize], &'static str> {
        self.wires
            .get(circuit)
            .map(Vec::as_slice)
            .ok_or("query circuit is outside the compiled catalog")
    }
}

impl crate::ArchivedProverKeysRkyv {
    /// Shared native/offline-reader boundary; no dense restoration is needed.
    pub fn nonpublic_block(
        &self,
        layout: &NonpublicQueryLayout,
        placement: usize,
        circuit: usize,
    ) -> Result<&[crate::ArchivedUnivariateG1Rkyv], &'static str> {
        if self.nonpublic_queries.len() != layout.len() {
            return Err("nonpublic query count does not match the selected library");
        }
        self.nonpublic_queries
            .as_slice()
            .get(layout.range(placement, circuit)?)
            .ok_or("required nonpublic query block is missing")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranges_follow_normalized_retained_wires_without_per_point_descriptors() {
        let layout =
            NonpublicQueryLayout::from_retained_wires(3, vec![vec![0, 2], vec![1]]).unwrap();
        assert_eq!(layout.len(), 9);
        assert_eq!(layout.local_wires(0).unwrap(), &[0, 2]);
        assert_eq!(layout.local_wires(1).unwrap(), &[1]);
        assert_eq!(layout.range(0, 0).unwrap(), 0..2);
        assert_eq!(layout.range(0, 1).unwrap(), 2..3);
        assert_eq!(layout.range(2, 1).unwrap(), 8..9);
        assert!(layout.range(3, 0).is_err());
        assert!(layout.range(0, 2).is_err());
        assert!(layout.local_wires(2).is_err());
        assert!(NonpublicQueryLayout::from_retained_wires(usize::MAX, vec![vec![0, 1]]).is_err());
        let public_only = NonpublicQueryLayout::from_retained_wires(2, vec![vec![]]).unwrap();
        assert!(public_only.is_empty());
        assert_eq!(public_only.range(1, 0).unwrap(), 0..0);
    }

    #[test]
    fn normalized_ranges_use_explicit_retained_local_wires() {
        let layout =
            NonpublicQueryLayout::from_retained_wires(3, vec![vec![0, 2, 8], vec![0, 1]]).unwrap();
        assert_eq!(layout.len(), 15);
        assert_eq!(layout.local_wires(0).unwrap(), &[0, 2, 8]);
        assert_eq!(layout.range(2, 1).unwrap(), 13..15);
        assert!(NonpublicQueryLayout::from_retained_wires(1, vec![vec![2, 2]]).is_err());
        assert!(NonpublicQueryLayout::from_retained_wires(0, vec![vec![]]).is_err());
    }

    #[test]
    fn archive_reader_rejects_missing_extra_and_invalid_blocks() {
        use crate::{archive, ArchivedProverKeysRkyv, ProverKeysRkyv, UnivariateG1Rkyv};
        let point = UnivariateG1Rkyv {
            x: [0; 48],
            y: [0; 48],
        };
        let layout =
            NonpublicQueryLayout::from_retained_wires(2, vec![vec![0, 2], vec![1]]).unwrap();
        for count in [5, 6, 7] {
            let keys = ProverKeysRkyv {
                schema_id: "test".into(),
                weighted_g1: vec![],
                weighted_shifted_g1: vec![],
                free_public_queries: vec![],
                nonpublic_queries: vec![point; count],
                mask_u: [point; 2],
                mask_v: [point; 2],
                mask_w: [point; 2],
                mask_b: [point; 2],
                mask_selection: point,
            };
            let bytes = archive::to_bytes::<archive::rancor::Error>(&keys).unwrap();
            let reader =
                archive::access::<ArchivedProverKeysRkyv, archive::rancor::Error>(&bytes).unwrap();
            assert_eq!(reader.nonpublic_block(&layout, 1, 1).is_ok(), count == 6);
            assert!(reader.nonpublic_block(&layout, 2, 0).is_err());
            assert!(reader.nonpublic_block(&layout, 0, 3).is_err());
            assert!(
                archive::access::<ArchivedProverKeysRkyv, archive::rancor::Error>(
                    &bytes[..bytes.len() / 2]
                )
                .is_err()
            );
        }
    }
}
