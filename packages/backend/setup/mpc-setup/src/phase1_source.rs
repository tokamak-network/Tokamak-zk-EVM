use crate::accumulator::Accumulator;
use icicle_bls12_381::curve::G1Affine;
use libs::group_structures::{G1serde, G2serde};
use std::io;

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
    ) -> Vec<G1Affine>;
    fn xy_powers(&self) -> Box<[G1serde]>;
    fn alphax_g1(&self, exp_alpha: usize, exp_x: usize) -> G1serde;
    fn alphay_g1(&self, exp_alpha: usize, exp_y: usize) -> G1serde;
    fn xy_g1(&self, exp_x: usize, exp_y: usize) -> G1serde;
}

pub struct AccumulatorSource {
    inner: Accumulator,
}

impl AccumulatorSource {
    pub fn read_from_json(path: &str) -> io::Result<Self> {
        Ok(Self {
            inner: Accumulator::read_from_json(path)?,
        })
    }
}

impl Phase1SrsSource for AccumulatorSource {
    fn g1(&self) -> G1serde {
        self.inner.g1
    }

    fn g2(&self) -> G2serde {
        self.inner.g2
    }

    fn alpha_g2(&self, exp_alpha: usize) -> G2serde {
        self.inner.alpha[exp_alpha - 1].g2
    }

    fn x_g2(&self, exp_x: usize) -> G2serde {
        self.inner.x[exp_x - 1].g2
    }

    fn y_g2(&self, exp_y: usize) -> G2serde {
        assert_eq!(exp_y, 1, "only y^1 in G2 is currently required");
        self.inner.y.g2
    }

    fn x_g1_range(&self, exp_min: usize, exp_max: usize) -> Vec<G1Affine> {
        self.inner.get_x_g1_range(exp_min, exp_max)
    }

    fn alphaxy_g1_range(
        &self,
        exp_alpha: usize,
        exp_x_max: usize,
        exp_y_max: usize,
    ) -> Vec<G1Affine> {
        self.inner
            .get_alphaxy_g1_range(exp_alpha, exp_x_max, exp_y_max)
    }

    fn alphaxy_g1_chunk(
        &self,
        exp_alpha: usize,
        exp_x_start: usize,
        exp_x_len: usize,
        exp_y_max: usize,
    ) -> Vec<G1Affine> {
        self.inner
            .get_alphaxy_g1_chunk(exp_alpha, exp_x_start, exp_x_len, exp_y_max)
    }

    fn xy_powers(&self) -> Box<[G1serde]> {
        self.inner.get_boxed_xypower()
    }

    fn alphax_g1(&self, exp_alpha: usize, exp_x: usize) -> G1serde {
        self.inner.get_alphax_g1(exp_alpha, exp_x)
    }

    fn alphay_g1(&self, exp_alpha: usize, exp_y: usize) -> G1serde {
        self.inner.get_alphay_g1(exp_alpha, exp_y)
    }

    fn xy_g1(&self, exp_x: usize, exp_y: usize) -> G1serde {
        self.inner.get_xy_g1(exp_x, exp_y)
    }
}
