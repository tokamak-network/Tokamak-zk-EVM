//! Normalized-grid relation inputs and connection-permutation admission.

use crate::frontend_artifacts::normalized_library::{
    NormalizedSetupParams, NormalizedSubcircuitInfo, NormalizedSubcircuitLibrary, PublicWireSource,
};
use crate::frontend_artifacts::Permutation;
use crate::univariate_crs::UnivariateCrsShape;
use icicle_bls12_381::curve::ScalarField;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum UnivariateRelationError {
    #[error("selector capacity is {actual}, expected {expected}")]
    SelectorCapacity { actual: usize, expected: usize },
    #[error("subcircuit ID {value} is outside the admitted range")]
    SubcircuitId { value: usize },
    #[error("placement index {value} is outside the placement capacity")]
    PlacementIndex { value: usize },
    #[error("permutation coordinate ({row}, {col}) is outside the connection domain")]
    PermutationCoordinate { row: usize, col: usize },
    #[error("permutation explicitly maps inactive placement slot {placement_index}")]
    PermutationInactivePlacement { placement_index: usize },
    #[error("permutation is not bijective at connection coordinate {index}")]
    PermutationNotBijective { index: usize },
    #[error("permutation violates the application topology: {reason}")]
    PermutationTopology { reason: &'static str },
    #[error("normalized wiring width does not agree with the CRS connection domain")]
    InterfaceWireCount,
}

/// Sparse R1CS data paired with producer-owned normalized local-wire ranges.
/// No global wire map participates in the current protocol.
pub struct NormalizedUnivariateSubcircuit<'a> {
    pub info: &'a NormalizedSubcircuitInfo,
    pub a_active_wires: &'a [usize],
    pub b_active_wires: &'a [usize],
    pub c_active_wires: &'a [usize],
    pub a_rows: &'a [Vec<(usize, ScalarField)>],
    pub b_rows: &'a [Vec<(usize, ScalarField)>],
    pub c_rows: &'a [Vec<(usize, ScalarField)>],
}

/// Resolves the full connection permutation. Sparse artifact entries replace
/// identities over the `m_b × s` local-grid domain.
pub fn normalized_connection_permutation_targets(
    shape: &UnivariateCrsShape,
    library: &NormalizedSubcircuitLibrary,
    selector: &[Option<usize>],
    permutation: &[Permutation],
) -> Result<Vec<usize>, UnivariateRelationError> {
    let setup = &library.setup;
    validate_selector(selector, setup, library.subcircuits.len())?;
    Permutation::validate_normalized_sparse(permutation, setup.m_b, setup.s)
        .map_err(|_| UnivariateRelationError::PermutationNotBijective { index: 0 })?;
    if shape.connection_domain_size != setup.m_b * setup.s {
        return Err(UnivariateRelationError::InterfaceWireCount);
    }
    validate_application_topology(library, selector, permutation)?;
    let mut targets = (0..shape.connection_domain_size).collect::<Vec<_>>();
    for entry in permutation {
        for (row, placement) in [(entry.row, entry.col), (entry.X, entry.Y)] {
            let Some(subcircuit_id) = selector[placement] else {
                return Err(UnivariateRelationError::PermutationInactivePlacement {
                    placement_index: placement,
                });
            };
            if library.subcircuits[subcircuit_id].is_wiring_padding(row, setup.m_b) {
                return Err(UnivariateRelationError::PermutationCoordinate {
                    row,
                    col: placement,
                });
            }
        }
        targets[entry.col + setup.s * entry.row] = entry.Y + setup.s * entry.X;
    }
    Ok(targets)
}

fn validate_selector(
    selector: &[Option<usize>],
    setup: &NormalizedSetupParams,
    subcircuit_count: usize,
) -> Result<(), UnivariateRelationError> {
    if selector.len() != setup.s {
        return Err(UnivariateRelationError::SelectorCapacity {
            actual: selector.len(),
            expected: setup.s,
        });
    }
    if let Some(value) = selector
        .iter()
        .flatten()
        .find(|id| **id >= subcircuit_count)
    {
        return Err(UnivariateRelationError::SubcircuitId { value: *value });
    }
    Ok(())
}

/// The constant-one cycle is deliberately retained: every actual placement's
/// local wire zero is tied to the public constant-one representative.
fn validate_application_topology(
    library: &NormalizedSubcircuitLibrary,
    selector: &[Option<usize>],
    permutation: &[Permutation],
) -> Result<(), UnivariateRelationError> {
    use std::collections::{HashMap, HashSet};

    let public_coordinates = library
        .public
        .segments()
        .iter()
        .flat_map(|segment| {
            (segment.start..segment.end).filter_map(|public_index| {
                match library.public.source(public_index) {
                    Some(PublicWireSource::Mapped {
                        local_wire_index, ..
                    }) => Some((local_wire_index, segment.placement_phase)),
                    _ => None,
                }
            })
        })
        .collect::<HashSet<_>>();
    let edges = permutation
        .iter()
        .map(|entry| ((entry.row, entry.col), (entry.X, entry.Y)))
        .collect::<HashMap<_, _>>();
    let sparse_public = edges
        .keys()
        .filter(|coordinate| public_coordinates.contains(coordinate))
        .copied()
        .collect::<Vec<_>>();
    if sparse_public.len() != 1 {
        return Err(UnivariateRelationError::PermutationTopology {
            reason: "exactly one public coordinate must represent CIRCOM_CONST_ONE",
        });
    }
    let representative = sparse_public[0];
    let mut expected = selector
        .iter()
        .enumerate()
        .filter_map(|(placement, selected)| selected.map(|_| (0, placement)))
        .collect::<HashSet<_>>();
    expected.insert(representative);
    let mut actual = HashSet::with_capacity(expected.len());
    let mut current = representative;
    loop {
        if !actual.insert(current) {
            if current != representative {
                return Err(UnivariateRelationError::PermutationTopology {
                    reason:
                        "the CIRCOM_CONST_ONE cycle repeats before returning to its representative",
                });
            }
            break;
        }
        current = *edges
            .get(&current)
            .ok_or(UnivariateRelationError::PermutationTopology {
                reason: "the CIRCOM_CONST_ONE cycle is incomplete",
            })?;
    }
    if actual != expected {
        return Err(UnivariateRelationError::PermutationTopology {
            reason: "the CIRCOM_CONST_ONE cycle must contain only its public representative and wire zero of every actual placement",
        });
    }
    Ok(())
}
