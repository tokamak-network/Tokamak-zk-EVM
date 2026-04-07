use crate::accumulator::{Accumulator, AccumulatorRkyv};
use crate::utils::icicle_g1_generator;
use icicle_bls12_381::curve::G1Affine;
use libs::group_structures::{G1serde, G2serde};
use memmap::{Mmap, MmapOptions};
use std::env;
use std::fs::File;
use std::io;
use std::path::Path;

pub trait Phase1SrsSource {
    fn g1(&self) -> G1serde;
    fn g2(&self) -> G2serde;
    fn alpha_g2(&self, exp_alpha: usize) -> G2serde;
    fn x_g2(&self, exp_x: usize) -> G2serde;
    fn y_g2(&self, exp_y: usize) -> G2serde;
    fn x_g1_range(&self, exp_min: usize, exp_max: usize) -> Vec<G1Affine>;
    fn alphaxy_g1_range(
        &self,
        exp_alpha: usize,
        exp_x_max: usize,
        exp_y_max: usize,
    ) -> Vec<G1Affine>;
    fn alphaxy_g1_chunk(
        &self,
        exp_alpha: usize,
        exp_x_start: usize,
        exp_x_len: usize,
        exp_y_max: usize,
    ) -> Vec<G1Affine> {
        let mut out = Vec::new();
        self.fill_alphaxy_g1_chunk(exp_alpha, exp_x_start, exp_x_len, exp_y_max, &mut out);
        out
    }
    fn fill_alphaxy_g1_chunk(
        &self,
        exp_alpha: usize,
        exp_x_start: usize,
        exp_x_len: usize,
        exp_y_max: usize,
        out: &mut Vec<G1Affine>,
    );
    fn xy_powers(&self) -> Box<[G1serde]> {
        let mut out = Vec::new();
        self.fill_xy_powers(&mut out);
        out.into_boxed_slice()
    }
    fn fill_xy_powers(&self, out: &mut Vec<G1serde>);
    fn alphax_g1(&self, exp_alpha: usize, exp_x: usize) -> G1serde;
    fn alphay_g1(&self, exp_alpha: usize, exp_y: usize) -> G1serde;
    fn xy_g1(&self, exp_x: usize, exp_y: usize) -> G1serde;
}

struct AccumulatorZeroCopy {
    mmap: Mmap,
}

impl AccumulatorZeroCopy {
    fn load(path: &Path) -> io::Result<Self> {
        let file = File::open(path)?;
        let mmap = unsafe { MmapOptions::new().map(&file)? };
        rkyv::check_archived_root::<AccumulatorRkyv>(&mmap).map_err(|err| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Invalid accumulator archive: {err:?}"),
            )
        })?;
        Ok(Self { mmap })
    }

    fn accumulator(&self) -> &rkyv::Archived<AccumulatorRkyv> {
        unsafe { rkyv::archived_root::<AccumulatorRkyv>(&self.mmap) }
    }
}

enum AccumulatorSourceInner {
    Owned(Accumulator),
    Mapped(AccumulatorZeroCopy),
}

pub struct AccumulatorSource {
    inner: AccumulatorSourceInner,
}

impl AccumulatorSource {
    pub fn read_from_json(path: &str) -> io::Result<Self> {
        let abs_json_path = env::current_dir()?.join(path);
        let rkyv_path = Accumulator::rkyv_path_for_json_path(&abs_json_path);
        if cache_is_fresh(&rkyv_path, &abs_json_path) {
            if let Ok(mapped) = AccumulatorZeroCopy::load(&rkyv_path) {
                return Ok(Self {
                    inner: AccumulatorSourceInner::Mapped(mapped),
                });
            }
        }

        let accumulator = Accumulator::read_from_json(path)?;
        let _ = accumulator.write_rkyv_sidecar_for_json_path(path);
        if let Ok(mapped) = AccumulatorZeroCopy::load(&rkyv_path) {
            return Ok(Self {
                inner: AccumulatorSourceInner::Mapped(mapped),
            });
        }

        Ok(Self {
            inner: AccumulatorSourceInner::Owned(accumulator),
        })
    }
}

fn cache_is_fresh(cache_path: &Path, source_path: &Path) -> bool {
    let Ok(cache_meta) = std::fs::metadata(cache_path) else {
        return false;
    };
    let Ok(cache_modified) = cache_meta.modified() else {
        return false;
    };
    let Ok(source_meta) = std::fs::metadata(source_path) else {
        return true;
    };
    let Ok(source_modified) = source_meta.modified() else {
        return true;
    };
    cache_modified >= source_modified
}

fn archived_x_g1_range(
    archived: &rkyv::Archived<AccumulatorRkyv>,
    exp_min: usize,
    exp_max: usize,
) -> Vec<G1Affine> {
    if exp_min > 0 {
        return archived.x.g1[exp_min - 1..exp_max]
            .iter()
            .map(|value| value.to_g1_affine())
            .collect();
    }

    let mut out = Vec::with_capacity(exp_max + 1);
    out.push(icicle_g1_generator().0);
    out.extend(
        archived.x.g1[..exp_max]
            .iter()
            .map(|value| value.to_g1_affine()),
    );
    out
}

fn archived_fill_alphaxy_g1_chunk(
    archived: &rkyv::Archived<AccumulatorRkyv>,
    exp_alpha: usize,
    exp_x_start: usize,
    exp_x_len: usize,
    exp_y_max: usize,
) -> Vec<G1Affine> {
    let mut out = Vec::new();
    fill_archived_alphaxy_g1_chunk(
        archived,
        exp_alpha,
        exp_x_start,
        exp_x_len,
        exp_y_max,
        &mut out,
    );
    out
}

fn fill_archived_alphaxy_g1_chunk(
    archived: &rkyv::Archived<AccumulatorRkyv>,
    exp_alpha: usize,
    exp_x_start: usize,
    exp_x_len: usize,
    exp_y_max: usize,
    out: &mut Vec<G1Affine>,
) {
    let y_len = archived.y.g1.len();
    let alpha_xy_stride = archived.x.g1.len() * y_len;
    let expected_len = exp_x_len * exp_y_max;
    if out.len() != expected_len {
        out.resize(expected_len, G1Affine::zero());
    }

    if exp_alpha > 0 {
        for local_x in 0..exp_x_len {
            let exp_x = exp_x_start + local_x;
            let row = &mut out[local_x * exp_y_max..(local_x + 1) * exp_y_max];
            if exp_x == 0 {
                if !row.is_empty() {
                    row[0] = archived.alpha[exp_alpha - 1].g1.to_g1_affine();
                }
                for exp_y in 1..exp_y_max {
                    row[exp_y] =
                        archived.alpha_y[(exp_alpha - 1) * y_len + exp_y - 1].to_g1_affine();
                }
                continue;
            }

            if !row.is_empty() {
                row[0] = archived.alpha_x[(exp_alpha - 1) * archived.x.g1.len() + exp_x - 1]
                    .to_g1_affine();
            }
            let xy_start = (exp_alpha - 1) * alpha_xy_stride + (exp_x - 1) * y_len;
            let xy_take = exp_y_max.saturating_sub(1).min(y_len);
            for (offset, value) in archived.alpha_xy[xy_start..xy_start + xy_take]
                .iter()
                .enumerate()
            {
                row[offset + 1] = value.to_g1_affine();
            }
        }
        return;
    }

    for local_x in 0..exp_x_len {
        let exp_x = exp_x_start + local_x;
        let row = &mut out[local_x * exp_y_max..(local_x + 1) * exp_y_max];
        if exp_x == 0 {
            if !row.is_empty() {
                row[0] = icicle_g1_generator().0;
            }
            for exp_y in 1..exp_y_max {
                row[exp_y] = archived.y.g1[exp_y - 1].to_g1_affine();
            }
            continue;
        }

        if !row.is_empty() {
            row[0] = archived.x.g1[exp_x - 1].to_g1_affine();
        }
        let xy_start = (exp_x - 1) * y_len;
        let xy_take = exp_y_max.saturating_sub(1).min(y_len);
        for (offset, value) in archived.xy[xy_start..xy_start + xy_take].iter().enumerate() {
            row[offset + 1] = value.to_g1_affine();
        }
    }
}

fn fill_archived_xy_powers(archived: &rkyv::Archived<AccumulatorRkyv>, out: &mut Vec<G1serde>) {
    out.clear();
    out.reserve(archived.xy.len());
    out.extend(archived.xy.iter().map(|value| value.to_g1serde()));
}

impl Phase1SrsSource for AccumulatorSource {
    fn g1(&self) -> G1serde {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.g1,
            AccumulatorSourceInner::Mapped(acc) => acc.accumulator().g1.to_g1serde(),
        }
    }

    fn g2(&self) -> G2serde {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.g2,
            AccumulatorSourceInner::Mapped(acc) => acc.accumulator().g2.to_g2serde(),
        }
    }

    fn alpha_g2(&self, exp_alpha: usize) -> G2serde {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.alpha[exp_alpha - 1].g2,
            AccumulatorSourceInner::Mapped(acc) => {
                acc.accumulator().alpha[exp_alpha - 1].g2.to_g2serde()
            }
        }
    }

    fn x_g2(&self, exp_x: usize) -> G2serde {
        assert_eq!(exp_x, 1, "only x^1 in G2 is stored in phase-1");
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.get_x_g2(exp_x),
            AccumulatorSourceInner::Mapped(acc) => acc.accumulator().x.g2.to_g2serde(),
        }
    }

    fn y_g2(&self, exp_y: usize) -> G2serde {
        assert_eq!(exp_y, 1, "only y^1 in G2 is currently required");
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.y.g2,
            AccumulatorSourceInner::Mapped(acc) => acc.accumulator().y.g2.to_g2serde(),
        }
    }

    fn x_g1_range(&self, exp_min: usize, exp_max: usize) -> Vec<G1Affine> {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.get_x_g1_range(exp_min, exp_max),
            AccumulatorSourceInner::Mapped(acc) => {
                archived_x_g1_range(acc.accumulator(), exp_min, exp_max)
            }
        }
    }

    fn alphaxy_g1_range(
        &self,
        exp_alpha: usize,
        exp_x_max: usize,
        exp_y_max: usize,
    ) -> Vec<G1Affine> {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => {
                acc.get_alphaxy_g1_range(exp_alpha, exp_x_max, exp_y_max)
            }
            AccumulatorSourceInner::Mapped(acc) => archived_fill_alphaxy_g1_chunk(
                acc.accumulator(),
                exp_alpha,
                0,
                exp_x_max,
                exp_y_max,
            ),
        }
    }

    fn fill_alphaxy_g1_chunk(
        &self,
        exp_alpha: usize,
        exp_x_start: usize,
        exp_x_len: usize,
        exp_y_max: usize,
        out: &mut Vec<G1Affine>,
    ) {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => {
                acc.fill_alphaxy_g1_chunk(exp_alpha, exp_x_start, exp_x_len, exp_y_max, out)
            }
            AccumulatorSourceInner::Mapped(acc) => fill_archived_alphaxy_g1_chunk(
                acc.accumulator(),
                exp_alpha,
                exp_x_start,
                exp_x_len,
                exp_y_max,
                out,
            ),
        }
    }

    fn fill_xy_powers(&self, out: &mut Vec<G1serde>) {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.fill_xy_powers(out),
            AccumulatorSourceInner::Mapped(acc) => fill_archived_xy_powers(acc.accumulator(), out),
        }
    }

    fn alphax_g1(&self, exp_alpha: usize, exp_x: usize) -> G1serde {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.get_alphax_g1(exp_alpha, exp_x),
            AccumulatorSourceInner::Mapped(acc) => {
                let archived = acc.accumulator();
                assert!(exp_alpha <= 4);
                assert!(exp_x <= archived.x.g1.len());
                if exp_alpha == 0 && exp_x == 0 {
                    icicle_g1_generator()
                } else if exp_alpha == 0 {
                    if exp_x == 0 {
                        icicle_g1_generator()
                    } else {
                        archived.x.g1[exp_x - 1].to_g1serde()
                    }
                } else if exp_x == 0 {
                    archived.alpha[exp_alpha - 1].g1.to_g1serde()
                } else {
                    archived.alpha_x[(exp_alpha - 1) * archived.x.g1.len() + exp_x - 1].to_g1serde()
                }
            }
        }
    }

    fn alphay_g1(&self, exp_alpha: usize, exp_y: usize) -> G1serde {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.get_alphay_g1(exp_alpha, exp_y),
            AccumulatorSourceInner::Mapped(acc) => {
                let archived = acc.accumulator();
                assert!(exp_alpha <= 4);
                assert!(exp_y <= archived.y.g1.len());
                if exp_alpha == 0 && exp_y == 0 {
                    icicle_g1_generator()
                } else if exp_alpha == 0 {
                    if exp_y == 0 {
                        icicle_g1_generator()
                    } else {
                        archived.y.g1[exp_y - 1].to_g1serde()
                    }
                } else if exp_y == 0 {
                    archived.alpha[exp_alpha - 1].g1.to_g1serde()
                } else {
                    archived.alpha_y[(exp_alpha - 1) * archived.y.g1.len() + exp_y - 1].to_g1serde()
                }
            }
        }
    }

    fn xy_g1(&self, exp_x: usize, exp_y: usize) -> G1serde {
        match &self.inner {
            AccumulatorSourceInner::Owned(acc) => acc.get_xy_g1(exp_x, exp_y),
            AccumulatorSourceInner::Mapped(acc) => {
                let archived = acc.accumulator();
                let y_len = archived.y.g1.len();
                assert!(exp_y <= y_len);
                assert!(exp_x <= archived.x.g1.len());
                if exp_x == 0 && exp_y == 0 {
                    icicle_g1_generator()
                } else if exp_x == 0 {
                    archived.y.g1[exp_y - 1].to_g1serde()
                } else if exp_y == 0 {
                    archived.x.g1[exp_x - 1].to_g1serde()
                } else {
                    archived.xy[(exp_x - 1) * y_len + exp_y - 1].to_g1serde()
                }
            }
        }
    }
}
