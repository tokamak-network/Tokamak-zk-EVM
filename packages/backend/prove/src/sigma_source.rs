use std::io;
use std::path::Path;

use libs::bivariate_polynomial::DensePolynomialExt;
use libs::group_structures::G1serde;
use libs::iotools::{ArchivedSigma1Rkyv, ArchivedSigmaRkyv, PlacementVariables, SetupParams, SubcircuitInfo, SigmaRkyv};
use memmap2::Mmap;
use std::fs::File;

pub struct SigmaHolder {
    inner: SigmaZeroCopy,
}

pub struct SigmaZeroCopy {
    mmap: Mmap,
}

impl SigmaZeroCopy {
    pub fn load(path: &Path) -> std::io::Result<Self> {
        let file = File::open(path)?;
        let mmap = unsafe { Mmap::map(&file)? };
        rkyv::check_archived_root::<SigmaRkyv>(&mmap).map_err(|err| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Invalid sigma archive: {err:?}"),
            )
        })?;
        Ok(Self { mmap })
    }

    pub fn sigma(&self) -> &ArchivedSigmaRkyv {
        // Safe because we validated the archive on load and the mmap lives with self.
        unsafe { rkyv::archived_root::<SigmaRkyv>(&self.mmap) }
    }
}

impl SigmaHolder {
    pub fn load(path: &Path) -> std::io::Result<Self> {
        SigmaZeroCopy::load(path).map(|inner| SigmaHolder { inner })
    }

    pub fn sigma1(&self) -> Sigma1Handle<'_> {
        Sigma1Handle(&self.inner.sigma().sigma_1)
    }

    pub fn clear_gamma_inv_o_inst(&mut self) {}

    pub fn clear_eta_inv_li_o_inter_alpha4_kj(&mut self) {}

    pub fn clear_delta_inv_li_o_prv(&mut self) {}
}

pub struct Sigma1Handle<'a>(&'a ArchivedSigma1Rkyv);

impl<'a> Sigma1Handle<'a> {
    pub fn encode_poly(&self, poly: &mut DensePolynomialExt, params: &SetupParams) -> G1serde {
        self.0.encode_poly(poly, params)
    }

    pub fn encode_O_inst(
        &self,
        placement_variables: &[PlacementVariables],
        subcircuit_infos: &[SubcircuitInfo],
        setup_params: &SetupParams,
    ) -> G1serde {
        self.0.encode_O_inst(placement_variables, subcircuit_infos, setup_params)
    }

    pub fn encode_O_mid_no_zk(
        &self,
        placement_variables: &[PlacementVariables],
        subcircuit_infos: &[SubcircuitInfo],
        setup_params: &SetupParams,
    ) -> G1serde {
        self.0.encode_O_mid_no_zk(placement_variables, subcircuit_infos, setup_params)
    }

    pub fn encode_O_prv_no_zk(
        &self,
        placement_variables: &[PlacementVariables],
        subcircuit_infos: &[SubcircuitInfo],
        setup_params: &SetupParams,
    ) -> G1serde {
        self.0.encode_O_prv_no_zk(placement_variables, subcircuit_infos, setup_params)
    }

    pub fn delta(&self) -> G1serde {
        self.0.delta()
    }

    pub fn eta(&self) -> G1serde {
        self.0.eta()
    }

    pub fn delta_inv_alphak_xh_tx(&self, k: usize, h: usize) -> G1serde {
        self.0.delta_inv_alphak_xh_tx(k, h)
    }

    pub fn delta_inv_alpha4_xj_tx(&self, j: usize) -> G1serde {
        self.0.delta_inv_alpha4_xj_tx(j)
    }

    pub fn delta_inv_alphak_yi_ty(&self, k: usize, i: usize) -> G1serde {
        self.0.delta_inv_alphak_yi_ty(k, i)
    }
}
