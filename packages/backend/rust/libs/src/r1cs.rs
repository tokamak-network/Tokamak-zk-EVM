// R1CS matrices and derived QAP terms retain their established protocol notation.
#![allow(non_snake_case)]

use crate::frontend_artifacts::normalized_library::{
    NormalizedSetupParams, NormalizedSubcircuitInfo,
};
use crate::univariate_relation::NormalizedUnivariateSubcircuit;
use icicle_bls12_381::curve::ScalarField;
use icicle_core::traits::FieldImpl;
use std::collections::HashSet;
use std::env;
use std::fs::File;
use std::io::{self, Read};
use std::path::PathBuf;
use std::time::Instant;

pub struct SubcircuitR1CS {
    pub A_compact_col_mat: Vec<ScalarField>,
    pub B_compact_col_mat: Vec<ScalarField>,
    pub C_compact_col_mat: Vec<ScalarField>,
    pub A_active_wires: Vec<usize>,
    pub B_active_wires: Vec<usize>,
    pub C_active_wires: Vec<usize>,
    // Sparse rows for CPU evaluation: row -> list of (compact_idx, coeff)
    pub A_sparse_rows: Vec<Vec<(usize, ScalarField)>>,
    pub B_sparse_rows: Vec<Vec<(usize, ScalarField)>>,
    pub C_sparse_rows: Vec<Vec<(usize, ScalarField)>>,
}

struct R1csBinary {
    data: Vec<u8>,
    constraints_offset: usize,
    constraints_size: usize,
    field_size: usize,
    n_wires: usize,
    n_constraints: usize,
}

impl R1csBinary {
    fn read(path: PathBuf) -> io::Result<Self> {
        let mut file = File::open(path)?;
        let mut data = Vec::new();
        file.read_to_end(&mut data)?;

        let mut offset = 0usize;
        let magic = read_bytes(&data, &mut offset, 4)?;
        if magic != b"r1cs" {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid R1CS magic",
            ));
        }
        let version = read_u32_le(&data, &mut offset)?;
        if version != 1 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("unsupported R1CS version {version}"),
            ));
        }
        let section_count = read_u32_le(&data, &mut offset)? as usize;

        let mut header_offset = None;
        let mut header_size = 0usize;
        let mut constraints_offset = None;
        let mut constraints_size = 0usize;

        for _ in 0..section_count {
            let section_type = read_u32_le(&data, &mut offset)?;
            let section_size = read_u64_le(&data, &mut offset)? as usize;
            let section_offset = offset;
            let section_end = section_offset.checked_add(section_size).ok_or_else(|| {
                io::Error::new(io::ErrorKind::InvalidData, "R1CS section size overflow")
            })?;
            if section_end > data.len() {
                return Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "R1CS section extends past end of file",
                ));
            }

            match section_type {
                1 => {
                    header_offset = Some(section_offset);
                    header_size = section_size;
                }
                2 => {
                    constraints_offset = Some(section_offset);
                    constraints_size = section_size;
                }
                _ => {}
            }
            offset = section_end;
        }

        let header_offset = header_offset.ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidData, "missing R1CS header section")
        })?;
        let constraints_offset = constraints_offset.ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "missing R1CS constraints section",
            )
        })?;

        let header_end = header_offset + header_size;
        let mut header_cursor = header_offset;
        let field_size = read_u32_le(&data, &mut header_cursor)? as usize;
        if field_size == 0 || field_size % 8 != 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("invalid R1CS field size {field_size}"),
            ));
        }
        let _prime = read_bytes(&data, &mut header_cursor, field_size)?;
        let n_wires = read_u32_le(&data, &mut header_cursor)? as usize;
        let _n_pub_out = read_u32_le(&data, &mut header_cursor)?;
        let _n_pub_in = read_u32_le(&data, &mut header_cursor)?;
        let _n_prv_in = read_u32_le(&data, &mut header_cursor)?;
        let _n_labels = read_u64_le(&data, &mut header_cursor)?;
        let n_constraints = read_u32_le(&data, &mut header_cursor)? as usize;
        if header_cursor > header_end {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "R1CS header extends past section end",
            ));
        }

        Ok(Self {
            data,
            constraints_offset,
            constraints_size,
            field_size,
            n_wires,
            n_constraints,
        })
    }

    fn scan_constraints<F>(&self, mut visit: F) -> io::Result<()>
    where
        F: FnMut(usize, usize, ScalarField, usize),
    {
        let mut offset = self.constraints_offset;
        let constraints_end = self.constraints_offset + self.constraints_size;

        for row_idx in 0..self.n_constraints {
            for matrix_idx in 0..3 {
                let entry_count = read_u32_le(&self.data, &mut offset)? as usize;
                for _ in 0..entry_count {
                    let wire_idx = read_u32_le(&self.data, &mut offset)? as usize;
                    if wire_idx >= self.n_wires {
                        return Err(io::Error::new(
                            io::ErrorKind::InvalidData,
                            format!("R1CS wire index {wire_idx} exceeds nWires {}", self.n_wires),
                        ));
                    }
                    let coeff_bytes = read_bytes(&self.data, &mut offset, self.field_size)?;
                    let coeff = ScalarField::from_bytes_le(coeff_bytes);
                    visit(matrix_idx, wire_idx, coeff, row_idx);
                }
            }
        }

        if offset != constraints_end {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    "R1CS constraints section has {} trailing bytes",
                    constraints_end.saturating_sub(offset)
                ),
            ));
        }

        Ok(())
    }
}

fn read_bytes<'a>(data: &'a [u8], offset: &mut usize, len: usize) -> io::Result<&'a [u8]> {
    let end = offset
        .checked_add(len)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "R1CS offset overflow"))?;
    if end > data.len() {
        return Err(io::Error::new(
            io::ErrorKind::UnexpectedEof,
            "unexpected end of R1CS file",
        ));
    }
    let out = &data[*offset..end];
    *offset = end;
    Ok(out)
}

fn read_u32_le(data: &[u8], offset: &mut usize) -> io::Result<u32> {
    let bytes = read_bytes(data, offset, 4)?;
    Ok(u32::from_le_bytes(bytes.try_into().unwrap()))
}

fn read_u64_le(data: &[u8], offset: &mut usize) -> io::Result<u64> {
    let bytes = read_bytes(data, offset, 8)?;
    Ok(u64::from_le_bytes(bytes.try_into().unwrap()))
}

impl SubcircuitR1CS {
    pub fn as_normalized_univariate_subcircuit<'a>(
        &'a self,
        subcircuit_info: &'a NormalizedSubcircuitInfo,
    ) -> NormalizedUnivariateSubcircuit<'a> {
        NormalizedUnivariateSubcircuit {
            info: subcircuit_info,
            a_active_wires: &self.A_active_wires,
            b_active_wires: &self.B_active_wires,
            c_active_wires: &self.C_active_wires,
            a_rows: &self.A_sparse_rows,
            b_rows: &self.B_sparse_rows,
            c_rows: &self.C_sparse_rows,
        }
    }

    pub fn from_normalized_r1cs_sparse_only(
        path: PathBuf,
        setup_params: &NormalizedSetupParams,
        subcircuit_info: &NormalizedSubcircuitInfo,
    ) -> io::Result<Self> {
        Self::from_r1cs_with_dimensions(
            path,
            setup_params.n,
            subcircuit_info.id,
            subcircuit_info.Nwires,
            subcircuit_info.Nconsts,
            false,
            true,
        )
    }

    fn from_r1cs_with_dimensions(
        path: PathBuf,
        n: usize,
        subcircuit_id: usize,
        wire_count: usize,
        constraint_count: usize,
        include_compact_matrices: bool,
        include_sparse_rows: bool,
    ) -> io::Result<Self> {
        let phase_profile = env::var("TOKAMAK_UVWXY_PHASE_PROFILE").ok().as_deref() == Some("1");
        let total_start = phase_profile.then(Instant::now);

        let read_binary_start = phase_profile.then(Instant::now);
        let binary = R1csBinary::read(path)?;
        if let Some(start) = read_binary_start {
            print_r1cs_binary_phase(subcircuit_id, "read_binary", start.elapsed().as_nanos());
        }

        if binary.n_wires != wire_count {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    "R1CS nWires mismatch for subcircuit {}: binary={}, info={}",
                    subcircuit_id, binary.n_wires, wire_count
                ),
            ));
        }
        if binary.n_constraints != constraint_count {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    "R1CS nConstraints mismatch for subcircuit {}: binary={}, info={}",
                    subcircuit_id, binary.n_constraints, constraint_count
                ),
            ));
        }
        if n < constraint_count {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "n is smaller than the actual number of constraints",
            ));
        }

        let active_wire_scan_start = phase_profile.then(Instant::now);
        let mut active_sets = [
            HashSet::<usize>::new(),
            HashSet::<usize>::new(),
            HashSet::<usize>::new(),
        ];
        binary.scan_constraints(|matrix_idx, wire_idx, _coeff, _row_idx| {
            active_sets[matrix_idx].insert(wire_idx);
        })?;
        if let Some(start) = active_wire_scan_start {
            print_r1cs_binary_phase(
                subcircuit_id,
                "active_wire_scan",
                start.elapsed().as_nanos(),
            );
        }

        let active_wire_sort_start = phase_profile.then(Instant::now);
        let mut A_active_wire_indices: Vec<usize> = active_sets[0].iter().copied().collect();
        let mut B_active_wire_indices: Vec<usize> = active_sets[1].iter().copied().collect();
        let mut C_active_wire_indices: Vec<usize> = active_sets[2].iter().copied().collect();
        A_active_wire_indices.sort_unstable();
        B_active_wire_indices.sort_unstable();
        C_active_wire_indices.sort_unstable();
        if let Some(start) = active_wire_sort_start {
            print_r1cs_binary_phase(
                subcircuit_id,
                "active_wire_sort",
                start.elapsed().as_nanos(),
            );
        }

        let index_map_start = phase_profile.then(Instant::now);
        let mut a_index_map = vec![usize::MAX; wire_count];
        for (i, &wire_idx) in A_active_wire_indices.iter().enumerate() {
            a_index_map[wire_idx] = i;
        }
        let mut b_index_map = vec![usize::MAX; wire_count];
        for (i, &wire_idx) in B_active_wire_indices.iter().enumerate() {
            b_index_map[wire_idx] = i;
        }
        let mut c_index_map = vec![usize::MAX; wire_count];
        for (i, &wire_idx) in C_active_wire_indices.iter().enumerate() {
            c_index_map[wire_idx] = i;
        }
        let index_maps = [a_index_map, b_index_map, c_index_map];
        if let Some(start) = index_map_start {
            print_r1cs_binary_phase(
                subcircuit_id,
                "compact_index_maps",
                start.elapsed().as_nanos(),
            );
        }

        let alloc_sparse_start = phase_profile.then(Instant::now);
        let A_len = A_active_wire_indices.len();
        let B_len = B_active_wire_indices.len();
        let C_len = C_active_wire_indices.len();
        let mut A_compact_col_mat = if include_compact_matrices {
            vec![ScalarField::zero(); n * A_len]
        } else {
            Vec::new()
        };
        let mut B_compact_col_mat = if include_compact_matrices {
            vec![ScalarField::zero(); n * B_len]
        } else {
            Vec::new()
        };
        let mut C_compact_col_mat = if include_compact_matrices {
            vec![ScalarField::zero(); n * C_len]
        } else {
            Vec::new()
        };
        let mut sparse_rows = if include_sparse_rows {
            [
                vec![Vec::new(); n],
                vec![Vec::new(); n],
                vec![Vec::new(); n],
            ]
        } else {
            [Vec::new(), Vec::new(), Vec::new()]
        };
        if let Some(start) = alloc_sparse_start {
            print_r1cs_binary_phase(
                subcircuit_id,
                "alloc_sparse_rows",
                start.elapsed().as_nanos(),
            );
        }

        let fill_sparse_start = phase_profile.then(Instant::now);
        binary.scan_constraints(|matrix_idx, wire_idx, coeff, row_idx| {
            let compact_idx = index_maps[matrix_idx][wire_idx];
            if compact_idx != usize::MAX {
                if include_compact_matrices {
                    match matrix_idx {
                        0 => A_compact_col_mat[A_len * row_idx + compact_idx] = coeff,
                        1 => B_compact_col_mat[B_len * row_idx + compact_idx] = coeff,
                        2 => C_compact_col_mat[C_len * row_idx + compact_idx] = coeff,
                        _ => unreachable!(),
                    }
                }
                if include_sparse_rows {
                    sparse_rows[matrix_idx][row_idx].push((compact_idx, coeff));
                }
            }
        })?;
        if include_sparse_rows {
            for matrix_rows in sparse_rows.iter_mut() {
                for row in matrix_rows.iter_mut() {
                    row.sort_unstable_by_key(|(compact_idx, _)| *compact_idx);
                }
            }
        }
        if let Some(start) = fill_sparse_start {
            print_r1cs_binary_phase(
                subcircuit_id,
                "fill_sparse_rows",
                start.elapsed().as_nanos(),
            );
        }

        // The normalized path requests sparse rows only. Compact-column
        // matrices are retained in the struct solely to keep the binary reader
        // allocation-free for current callers.

        if let Some(start) = total_start {
            print_r1cs_binary_phase(subcircuit_id, "total", start.elapsed().as_nanos());
        }

        Ok(Self {
            A_compact_col_mat,
            B_compact_col_mat,
            C_compact_col_mat,
            A_active_wires: A_active_wire_indices,
            B_active_wires: B_active_wire_indices,
            C_active_wires: C_active_wire_indices,
            A_sparse_rows: std::mem::take(&mut sparse_rows[0]),
            B_sparse_rows: std::mem::take(&mut sparse_rows[1]),
            C_sparse_rows: std::mem::take(&mut sparse_rows[2]),
        })
    }
}

fn print_r1cs_binary_phase(subcircuit_id: usize, name: &str, nanos: u128) {
    println!("r1cs_binary.phase subcircuit={subcircuit_id} name={name} nanos={nanos}");
}
