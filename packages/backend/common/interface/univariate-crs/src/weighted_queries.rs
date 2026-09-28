//! Library-derived indexing of stored weighted-query rows.
//!
//! The logical local-wire domain is `0..m`, while the normalized library
//! declares only two ranges which can contain a real wire in any compiled
//! subcircuit: the wiring prefix and the shifted internal prefix.  The CRS
//! stores those ranges contiguously and never materializes the remaining
//! producer-declared padding rows.  A real wire is retained regardless of its
//! witness value.

use std::ops::Range;

/// Compact row order for the two normalized local-wire ranges.
///
/// `wiring_end` is `max_k b_k`; `internal_end` is `m_b + max_k r_k`.
/// The stored order is `[0, wiring_end)`, followed by
/// `[wiring_capacity, internal_end)`, with each row followed by all placement
/// coefficients.  The layout contains no serialized lookup table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WeightedQueryLayout {
    placements: usize,
    wire_capacity: usize,
    wiring_capacity: usize,
    wiring_end: usize,
    internal_end: usize,
    retained_rows: usize,
}

impl WeightedQueryLayout {
    /// Derive the reusable CRS layout from canonical normalized library ranges.
    ///
    /// Each pair is `(b_k, r_k)`, where `b_k` is the wiring-prefix length and
    /// `r_k` is the shifted internal-range length for one compiled subcircuit.
    pub fn from_normalized_ranges(
        placements: usize,
        wire_capacity: usize,
        wiring_capacity: usize,
        circuit_ranges: impl IntoIterator<Item = (usize, usize)>,
    ) -> Result<Self, &'static str> {
        if placements == 0 || wire_capacity == 0 || wiring_capacity > wire_capacity {
            return Err("weighted query layout has invalid library dimensions");
        }

        let mut wiring_end = 0usize;
        let mut internal_len = 0usize;
        let mut count = 0usize;
        for (wiring_len, internal_range_len) in circuit_ranges {
            if wiring_len > wiring_capacity || internal_range_len > wire_capacity - wiring_capacity
            {
                return Err("normalized local wire range exceeds its capacity");
            }
            wiring_end = wiring_end.max(wiring_len);
            internal_len = internal_len.max(internal_range_len);
            count += 1;
        }
        if count == 0 {
            return Err("weighted query layout requires a compiled subcircuit");
        }

        let internal_end = wiring_capacity
            .checked_add(internal_len)
            .ok_or("weighted query range overflow")?;
        let retained_rows = wiring_end
            .checked_add(internal_len)
            .ok_or("weighted query row count overflow")?;
        retained_rows
            .checked_mul(placements)
            .ok_or("weighted query count overflow")?;

        Ok(Self {
            placements,
            wire_capacity,
            wiring_capacity,
            wiring_end,
            internal_end,
            retained_rows,
        })
    }

    pub fn placements(&self) -> usize {
        self.placements
    }

    pub fn wire_capacity(&self) -> usize {
        self.wire_capacity
    }

    pub fn wiring_range(&self) -> Range<usize> {
        0..self.wiring_end
    }

    pub fn internal_range(&self) -> Range<usize> {
        self.wiring_capacity..self.internal_end
    }

    pub fn retained_rows(&self) -> usize {
        self.retained_rows
    }

    pub fn len(&self) -> usize {
        self.retained_rows * self.placements
    }

    pub fn is_empty(&self) -> bool {
        self.retained_rows == 0
    }

    /// Return the stored row for a real local wire. Padding has no stored row.
    pub fn compact_row(&self, local_wire: usize) -> Result<usize, &'static str> {
        if local_wire < self.wiring_end {
            return Ok(local_wire);
        }
        if local_wire >= self.wiring_capacity && local_wire < self.internal_end {
            return self
                .wiring_end
                .checked_add(local_wire - self.wiring_capacity)
                .ok_or("weighted query row overflow");
        }
        Err("local wire is producer-declared padding")
    }

    /// Return the contiguous base block for one stored local-wire row.
    pub fn block(&self, local_wire: usize) -> Result<Range<usize>, &'static str> {
        let start = self
            .compact_row(local_wire)?
            .checked_mul(self.placements)
            .ok_or("weighted query block overflow")?;
        let end = start
            .checked_add(self.placements)
            .ok_or("weighted query block overflow")?;
        Ok(start..end)
    }

    /// Iterate real local wires in their canonical compact order.
    pub fn retained_wires(&self) -> impl Iterator<Item = usize> + '_ {
        self.wiring_range().chain(self.internal_range())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compact_order_is_derived_from_the_union_of_all_real_ranges() {
        let layout =
            WeightedQueryLayout::from_normalized_ranges(4, 16, 6, [(3, 2), (5, 0), (4, 7)])
                .unwrap();

        assert_eq!(layout.wiring_range(), 0..5);
        assert_eq!(layout.internal_range(), 6..13);
        assert_eq!(layout.retained_rows(), 12);
        assert_eq!(layout.len(), 48);
        assert_eq!(layout.compact_row(0), Ok(0));
        assert_eq!(layout.compact_row(4), Ok(4));
        assert_eq!(layout.compact_row(6), Ok(5));
        assert_eq!(layout.compact_row(12), Ok(11));
        assert_eq!(layout.block(6), Ok(20..24));
        assert_eq!(
            layout.retained_wires().collect::<Vec<_>>(),
            vec![0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]
        );
        assert!(layout.compact_row(5).is_err());
        assert!(layout.compact_row(13).is_err());
        assert!(layout.compact_row(16).is_err());
    }

    #[test]
    fn compact_scalars_match_dense_zero_padding_reference() {
        let layout =
            WeightedQueryLayout::from_normalized_ranges(2, 8, 3, [(2, 1), (3, 4)]).unwrap();
        let dense_bases = (0i64..16).collect::<Vec<_>>();
        let mut dense_scalars = vec![0i64; 16];
        // A real wire with a zero runtime value remains present.
        dense_scalars[1] = 0;
        dense_scalars[2] = 7;
        dense_scalars[7] = -3;
        dense_scalars[8] = 11;
        dense_scalars[13] = 5;
        let compact_bases = layout
            .retained_wires()
            .flat_map(|j| dense_bases[j * 2..j * 2 + 2].iter().copied())
            .collect::<Vec<_>>();
        let compact_scalars = layout
            .retained_wires()
            .flat_map(|j| dense_scalars[j * 2..j * 2 + 2].iter().copied())
            .collect::<Vec<_>>();
        let dense_commitment = dense_bases
            .iter()
            .zip(&dense_scalars)
            .map(|(base, scalar)| base * scalar)
            .sum::<i64>();
        let compact_commitment = compact_bases
            .iter()
            .zip(&compact_scalars)
            .map(|(base, scalar)| base * scalar)
            .sum::<i64>();
        assert_eq!(compact_commitment, dense_commitment);
        assert_eq!(compact_bases.len(), layout.len());
    }

    #[test]
    fn rejects_invalid_or_unrepresentable_normalized_ranges() {
        assert!(WeightedQueryLayout::from_normalized_ranges(0, 8, 3, [(1, 1)]).is_err());
        assert!(WeightedQueryLayout::from_normalized_ranges(1, 8, 9, [(1, 1)]).is_err());
        assert!(WeightedQueryLayout::from_normalized_ranges(1, 8, 3, []).is_err());
        assert!(WeightedQueryLayout::from_normalized_ranges(1, 8, 3, [(4, 0)]).is_err());
        assert!(WeightedQueryLayout::from_normalized_ranges(1, 8, 3, [(1, 6)]).is_err());
    }
}
