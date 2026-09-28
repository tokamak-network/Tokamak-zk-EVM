//! Frontend ingress into engine-native fields and the ordered protocol domains.
use super::{engine::Engine, DomainPolynomial, Prepared, UnivariateProverError};
use crate::univariate_crs::ProverCrs;
use libs::{
    frontend_artifacts::{
        normalized_library::{NormalizedSubcircuitLibrary, PublicWireSource},
        Instance, Permutation, PlacementVariables,
    },
    univariate_field::ProtocolField,
    univariate_relation::NormalizedUnivariateSubcircuit,
};

pub fn root<F: ProtocolField>(n: usize) -> Result<F, UnivariateProverError> {
    let r = libs::univariate_field::canonical_root(n)
        .ok_or("unsupported protocol domain".to_owned())?;
    Ok(F::from_le(&r.canonical_le()))
}
fn parse<F: ProtocolField>(text: &str) -> Result<F, UnivariateProverError> {
    let text = text.strip_prefix("0x").unwrap_or(text);
    let padded = if text.len() % 2 == 1 {
        format!("0{text}")
    } else {
        text.to_owned()
    };
    let mut bytes = hex::decode(padded).map_err(|e| e.to_string())?;
    bytes.reverse();
    if bytes.len() > 32 {
        return Err("scalar input exceeds 32 bytes".to_owned().into());
    }
    bytes.resize(32, 0);
    if !libs::univariate_field::canonical_scalar(&bytes) {
        return Err("noncanonical scalar input".to_owned().into());
    }
    Ok(F::from_le(&bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scalar_ingress_has_identical_canonical_bounds_on_both_engines() {
        use ark_bls12_381::Fr;
        use ark_ff::{BigInteger, PrimeField};
        use icicle_bls12_381::curve::ScalarField;
        let modulus = hex::encode(Fr::MODULUS.to_bytes_be());
        for invalid in [modulus.as_str(), "xyz", &"ff".repeat(33)] {
            assert!(parse::<Fr>(invalid).is_err());
            assert!(parse::<ScalarField>(invalid).is_err());
        }
        for valid in ["0", "0x1", "0100", "0x123456789abcdef"] {
            assert_eq!(
                parse::<Fr>(valid).unwrap().canonical_le(),
                parse::<ScalarField>(valid).unwrap().canonical_le()
            );
        }
    }

    #[test]
    fn normalized_prepare_includes_public_wires_in_b_and_rejects_nonzero_padding() {
        use crate::univariate::engine::Cpu;
        use crate::univariate_crs::ProverCrs;
        use backend_univariate_crs_interface::{
            ProverKeysRkyv, TauSequenceRkyv, UnivariateG1Rkyv, UnivariateG2Rkyv,
        };
        use libs::frontend_artifacts::{
            normalized_library::{
                BufferDirection, NormalizedSetupParams, NormalizedSubcircuitInfo, PublicRegion,
                PublicWirePhase,
            },
            HexString,
        };
        use libs::univariate_crs::{UnivariateCrsShape, UNIVARIATE_CRS_SCHEMA_ID};

        let library = NormalizedSubcircuitLibrary::new(
            NormalizedSetupParams {
                n: 1,
                m: 8,
                m_b: 4,
                t: 2,
                s: 1,
                public_wire_phases: vec![PublicWirePhase {
                    name: "free".into(),
                    region: PublicRegion::Free,
                    subcircuit_ids: vec![0].into_boxed_slice(),
                }]
                .into_boxed_slice(),
            },
            vec![NormalizedSubcircuitInfo {
                id: 0,
                name: "public-buffer".into(),
                Nwires: 8,
                NrealWires: 3,
                Nconsts: 1,
                Out_idx: [1, 1],
                In_idx: [2, 1],
                Wiring_idx: [0, 3],
                Public_idx: [1, 1],
                Internal_idx: [4, 0],
                bufferDirection: Some(BufferDirection::Out),
                publicPhase: Some("free".into()),
                logicalInterface: None,
            }]
            .into_boxed_slice(),
        )
        .unwrap();
        let shape = UnivariateCrsShape::from_normalized_setup(
            &library.setup,
            library.public.free_public_len(),
        )
        .unwrap();
        let g1 = UnivariateG1Rkyv {
            x: [0; 48],
            y: [0; 48],
        };
        let g2 = UnivariateG2Rkyv {
            x: [0; 96],
            y: [0; 96],
        };
        let crs = ProverCrs::new(
            TauSequenceRkyv {
                schema_id: UNIVARIATE_CRS_SCHEMA_ID.into(),
                s0_g1: vec![g1; shape.minimum_capacity[0] + 1],
                sxi_g1: vec![g1; shape.minimum_capacity[1] + 1],
                spsi_g1: vec![g1; shape.minimum_capacity[2] + 1],
                tau_powers_g2: Vec::new(),
                psi_g2: g2,
            },
            ProverKeysRkyv {
                schema_id: UNIVARIATE_CRS_SCHEMA_ID.into(),
                weighted_g1: vec![g1; 3],
                weighted_shifted_g1: vec![g1; 3],
                free_public_queries: vec![g1],
                nonpublic_queries: vec![g1; 2],
                mask_u: [g1; 2],
                mask_v: [g1; 2],
                mask_w: [g1; 2],
                mask_b: [g1; 2],
                mask_selection: g1,
            },
            &library,
        )
        .unwrap();
        let selector = [Some(0)];
        let permutation = [
            Permutation {
                row: 0,
                col: 0,
                X: 1,
                Y: 0,
            },
            Permutation {
                row: 1,
                col: 0,
                X: 0,
                Y: 0,
            },
        ];
        let instance = Instance {
            a_pub_user: Box::new([HexString("01".into())]),
            a_pub_block: Box::new([]),
            a_pub_function: Box::new([]),
        };
        let circuit = NormalizedUnivariateSubcircuit {
            info: &library.subcircuits[0],
            a_active_wires: &[],
            b_active_wires: &[],
            c_active_wires: &[],
            a_rows: &[],
            b_rows: &[],
            c_rows: &[],
        };
        let placements = [PlacementVariables {
            subcircuitId: 0,
            variables: ["01", "01", "00", "00", "00", "00", "00", "00"]
                .map(|value| HexString(value.into()))
                .into(),
        }];
        let prepared = prepare::<Cpu>(
            &crs,
            &library,
            &selector,
            &permutation,
            &placements,
            &instance,
            &[circuit],
        )
        .unwrap();
        assert_eq!(
            prepared.maps[3].evaluations,
            vec![1u64.into(), 1u64.into(), 0u64.into(), 0u64.into()]
        );
        assert_eq!(crs.layout.local_wires(0).unwrap(), &[0, 2]);
        validate_public(
            &library,
            &selector,
            &prepared.slots,
            &prepared.public_inputs,
        )
        .unwrap();
        let masks = super::super::ProverRandomizers {
            u: [2u64.into(), 3u64.into()],
            v: [4u64.into(), 5u64.into()],
            w: [6u64.into(), 7u64.into()],
            b: [8u64.into(), 9u64.into()],
            r: [10u64.into(), 11u64.into(), 12u64.into(), 13u64.into()],
            selection: 14u64.into(),
        };
        let (proof, _) = super::super::prove::<Cpu>(super::super::ProvingInput {
            crs: &crs,
            library: &library,
            selector: &selector,
            prepared: &prepared,
            randomizers: &masks,
        })
        .unwrap();
        assert_eq!(proof.encode().unwrap().len(), 1_184);

        let mut invalid = placements.clone();
        invalid[0].variables[3] = HexString("01".into());
        assert!(prepare::<Cpu>(
            &crs,
            &library,
            &selector,
            &permutation,
            &invalid,
            &instance,
            &[NormalizedUnivariateSubcircuit {
                info: &library.subcircuits[0],
                a_active_wires: &[],
                b_active_wires: &[],
                c_active_wires: &[],
                a_rows: &[],
                b_rows: &[],
                c_rows: &[],
            }],
        )
        .is_err());
        let mut invalid = placements;
        invalid[0].variables[0] = HexString("00".into());
        assert!(prepare::<Cpu>(
            &crs,
            &library,
            &selector,
            &permutation,
            &invalid,
            &instance,
            &[NormalizedUnivariateSubcircuit {
                info: &library.subcircuits[0],
                a_active_wires: &[],
                b_active_wires: &[],
                c_active_wires: &[],
                a_rows: &[],
                b_rows: &[],
                c_rows: &[],
            }],
        )
        .is_err());
        let mut invalid_public = prepared.public_inputs.clone();
        invalid_public[0] = 2u64.into();
        assert!(validate_public(&library, &selector, &prepared.slots, &invalid_public,).is_err());
    }
}
pub fn prepare<E: Engine>(
    crs: &ProverCrs,
    library: &NormalizedSubcircuitLibrary,
    selector: &[Option<usize>],
    permutation: &[Permutation],
    placements: &[PlacementVariables],
    instance: &Instance,
    circuits: &[NormalizedUnivariateSubcircuit<'_>],
) -> Result<Prepared<E::F>, UnivariateProverError> {
    let setup = &library.setup;
    if selector.len() != setup.s
        || circuits.len() != library.actual_subcircuit_count()
        || selector
            .iter()
            .flatten()
            .any(|k| *k >= library.actual_subcircuit_count())
    {
        return Err("selector or catalog dimensions mismatch".to_owned().into());
    }
    let na = crs.shape.arithmetic_domain_size;
    let nc = crs.shape.connection_domain_size;
    E::initialize(
        (2 * (na.max(nc) + 4))
            .next_power_of_two()
            .max((crs.shape.selection_domain_size + 1).next_power_of_two()),
    )?;
    let mut records = placements.iter();
    let mut slots = Vec::with_capacity(setup.s);
    for k in selector {
        match k {
            None => slots.push(None),
            Some(k) => {
                let record = records.next().ok_or("missing placement".to_owned())?;
                if record.subcircuitId != *k || record.variables.len() != setup.m {
                    return Err("selector and witness mismatch".to_owned().into());
                }
                let circuit = &library.subcircuits[*k];
                slots.push(Some(
                    record
                        .variables
                        .iter()
                        .enumerate()
                        .map(|(local_wire_index, text)| {
                            let value = parse::<E::F>(text.as_ref())?;
                            if local_wire_index == 0 && value != E::F::one() {
                                return Err(UnivariateProverError::Invalid(
                                    "selected local wire zero must equal one".to_owned(),
                                ));
                            }
                            if (circuit.is_wiring_padding(local_wire_index, setup.m_b)
                                || circuit.is_internal_padding(local_wire_index, setup.m))
                                && value != E::F::zero()
                            {
                                return Err(UnivariateProverError::Invalid(
                                    "producer-declared witness padding must equal zero".to_owned(),
                                ));
                            }
                            Ok(value)
                        })
                        .collect::<Result<Vec<_>, _>>()?
                        .into_boxed_slice(),
                ));
            }
        }
    }
    if records.next().is_some() {
        return Err("extra placement".to_owned().into());
    }
    let public_inputs = instance
        .a_pub_user
        .iter()
        .chain(instance.a_pub_block.iter())
        .chain(instance.a_pub_function.iter())
        .map(|s| parse::<E::F>(s.as_ref()))
        .collect::<Result<Vec<_>, _>>()?;
    if public_inputs.len() != library.public.len() {
        return Err("public instance length mismatch".to_owned().into());
    }
    let mut evaluations = [
        vec![E::F::zero(); na],
        vec![E::F::zero(); na],
        vec![E::F::zero(); na],
        vec![E::F::zero(); nc],
    ];
    // The existing sparse parser exposes canonical field limbs. Convert each
    // library coefficient once at ingress, never during polynomial operations.
    let matrices: Vec<_> = circuits
        .iter()
        .map(|c| {
            [
                (c.a_active_wires, c.a_rows),
                (c.b_active_wires, c.b_rows),
                (c.c_active_wires, c.c_rows),
            ]
            .map(|(active, rows)| {
                (
                    active,
                    rows.iter()
                        .map(|row| {
                            row.iter()
                                .map(|(j, v)| (*j, E::F::from_le(&v.canonical_le())))
                                .collect::<Vec<_>>()
                        })
                        .collect::<Vec<_>>(),
                )
            })
        })
        .collect();
    for (i, slot) in slots.iter().enumerate() {
        if let Some(w) = slot {
            let k = selector[i].unwrap();
            let c = &circuits[k];
            if c.info.id != k {
                return Err("catalog ID mismatch".to_owned().into());
            }
            for (matrix, (active, rows)) in matrices[k].iter().enumerate() {
                if rows.len() > setup.n {
                    return Err("R1CS row count exceeds n".to_owned().into());
                }
                for (r, row) in rows.iter().enumerate() {
                    let mut value = E::F::zero();
                    for (j, v) in row {
                        let local = *active
                            .get(*j)
                            .ok_or("invalid compact R1CS column".to_owned())?;
                        value = value
                            + *v * *w.get(local).ok_or("R1CS wire outside witness".to_owned())?;
                    }
                    evaluations[matrix][i + setup.s * r] = value;
                }
            }
            for (local_wire_index, value) in w[..setup.m_b].iter().enumerate() {
                evaluations[3][i + setup.s * local_wire_index] = *value;
            }
        }
    }
    let ar = E::F::from_le(&crs.shape.arithmetic_root.canonical_le());
    let cr = E::F::from_le(&crs.shape.connection_root.canonical_le());
    let mut at = 0;
    let maps = evaluations.map(|values| {
        let root = if at < 3 { ar } else { cr };
        at += 1;
        let coefficients = E::coefficients(&E::interpolate(&values, root));
        DomainPolynomial {
            evaluations: values,
            coefficients,
        }
    });
    let targets = libs::univariate_relation::normalized_connection_permutation_targets(
        &crs.shape,
        library,
        selector,
        permutation,
    )
    .map_err(|e| e.to_string())?;
    let mut powers = Vec::with_capacity(nc);
    let mut power = E::F::one();
    for _ in 0..nc {
        powers.push(power);
        power = power * cr;
    }
    let evaluations = targets.into_iter().map(|t| powers[t]).collect::<Vec<_>>();
    let coefficients = E::coefficients(&E::interpolate(&evaluations, cr));
    Ok(Prepared {
        slots,
        public_inputs,
        maps,
        s_c: DomainPolynomial {
            evaluations,
            coefficients,
        },
    })
}

pub fn validate_public<F: ProtocolField>(
    library: &NormalizedSubcircuitLibrary,
    selector: &[Option<usize>],
    slots: &[Option<Box<[F]>>],
    values: &[F],
) -> Result<(), UnivariateProverError> {
    let setup = &library.setup;
    let public = &library.public;
    if values.len() != public.len() || selector.len() != setup.s || slots.len() != setup.s {
        return Err("proving input dimensions mismatch".to_owned().into());
    }
    for (i, k) in selector.iter().enumerate() {
        if let Some(k) = k {
            if i != *k && public.segments().iter().any(|s| s.subcircuit_id == *k) {
                return Err("public buffer cannot be repeated at another placement"
                    .to_owned()
                    .into());
            }
        }
    }
    for (g, value) in values.iter().enumerate() {
        let expected = if let Some(PublicWireSource::Mapped {
            subcircuit_id: k,
            local_wire_index,
        }) = public.source(g)
        {
            // The i == subcircuit ID specialization applies only to public
            // buffer wires. Private/intermediate queries use actual placements.
            if selector.get(k) != Some(&Some(k)) {
                return Err("public buffer must occupy its matching placement"
                    .to_owned()
                    .into());
            }
            slots[k]
                .as_ref()
                .and_then(|w| w.get(local_wire_index))
                .copied()
                .ok_or("missing public witness".to_owned())?
        } else {
            F::zero()
        };
        if *value != expected {
            return Err(format!("public wire {g} differs from witness or padding").into());
        }
    }
    Ok(())
}
