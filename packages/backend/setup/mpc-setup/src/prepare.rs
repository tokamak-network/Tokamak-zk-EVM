use icicle_bls12_381::curve::{ScalarCfg, ScalarField};
use icicle_bls12_381::polynomials::DensePolynomial;
use icicle_core::polynomials::UnivariatePolynomial;
use icicle_core::traits::{FieldImpl, GenerateRandom};
use icicle_runtime::memory::HostSlice;
use libs::bivariate_polynomial::{BivariatePolynomial, DensePolynomialExt};
use libs::field_structures::FieldSerde;
use libs::iotools::{read_global_wire_list_as_boxed_boxed_numbers, SetupParams, SubcircuitInfo, SubcircuitR1CS};
use memmap::Mmap;
use rayon::join;
use serde::{Deserialize, Serialize};
use std::fs::File;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct QAPSerialized {
    pub u_j_X: Vec<DensePolynomialExtSerialized>,
    pub v_j_X: Vec<DensePolynomialExtSerialized>,
    pub w_j_X: Vec<DensePolynomialExtSerialized>,
}
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DensePolynomialExtSerialized {
    pub poly: Box<[FieldSerde]>,
    pub x_degree: i64,
    pub y_degree: i64,
    pub x_size: usize,
    pub y_size: usize,
}

pub struct QAP {
    pub u_j_X: Vec<DensePolynomialExt>,
    pub v_j_X: Vec<DensePolynomialExt>,
    pub w_j_X: Vec<DensePolynomialExt>,
}


impl QAP {
    pub fn gen_from_R1CS(
        subcircuit_infos: &Box<[SubcircuitInfo]>,
        setup_params: &SetupParams,
    ) -> Self {
        let m_d = setup_params.m_D;
        let s_d = setup_params.s_D;

        let global_wire_file_name = "globalWireList.json";
        let global_wire_list = read_global_wire_list_as_boxed_boxed_numbers(global_wire_file_name).unwrap();

        let zero_coef_vec = [ScalarField::zero()];
        let zero_coef = HostSlice::from_slice(&zero_coef_vec);
        let zero_poly = DensePolynomialExt::from_coeffs(zero_coef, 1, 1);
        let mut u_j_X = vec![zero_poly.clone(); m_d];
        let mut v_j_X = vec![zero_poly.clone(); m_d];
        let mut w_j_X = vec![zero_poly.clone(); m_d];

        for i in 0..s_d {
            println!("Processing subcircuit id {}", i);
            let r1cs_path: String = format!("json/subcircuit{i}.json");

            let compact_r1cs = SubcircuitR1CS::from_path(&r1cs_path, &setup_params, &subcircuit_infos[i]).unwrap();
            let (u_j_X_local, v_j_X_local, w_j_X_local) = from_subcircuit_to_QAP(
                &compact_r1cs,
                &setup_params,
                &subcircuit_infos[i],
            );

            // Map local wire indices to global wire indices
            let flatten_map = &subcircuit_infos[i].flattenMap;

            for local_idx in 0..subcircuit_infos[i].Nwires {
                let global_idx = flatten_map[local_idx];

                // Verify global wire list consistency with flatten map
                if (global_wire_list[global_idx][0] != subcircuit_infos[i].id) ||
                    (global_wire_list[global_idx][1] != local_idx) {
                    panic!("GlobalWireList is not the inverse of flattenMap.");
                }

                u_j_X[global_idx] = u_j_X_local[local_idx].clone();
                v_j_X[global_idx] = v_j_X_local[local_idx].clone();
                w_j_X[global_idx] = w_j_X_local[local_idx].clone();
            }
        }
        return Self { u_j_X, v_j_X, w_j_X };
    }
    pub fn get_serialized(&self) -> QAPSerialized {
        let mut uj: Vec<DensePolynomialExtSerialized> = vec![];
        let mut vj: Vec<DensePolynomialExtSerialized> = vec![];
        let mut wj: Vec<DensePolynomialExtSerialized> = vec![];
        let zero = ScalarField::zero();
        self.u_j_X.iter().for_each(|x| {
            let mut coeffs_vec = vec![zero; x.x_size * x.y_size];
            let coeffs = HostSlice::from_mut_slice(&mut coeffs_vec);
            x.copy_coeffs(0, coeffs);

            let cf = coeffs.iter().map(|c| { FieldSerde(*c) }).collect();

            let n = DensePolynomialExtSerialized {
                poly: cf,
                x_degree: x.x_degree,
                y_degree: x.y_degree,
                x_size: x.x_size,
                y_size: x.y_size,
            };
            uj.push(n);
        });
        self.v_j_X.iter().for_each(|x| {
            let mut coeffs_vec = vec![zero; x.x_size * x.y_size];
            let coeffs = HostSlice::from_mut_slice(&mut coeffs_vec);
            x.copy_coeffs(0, coeffs);

            let cf = coeffs.iter().map(|c| { FieldSerde(*c) }).collect();

            let n = DensePolynomialExtSerialized {
                poly: cf,
                x_degree: x.x_degree,
                y_degree: x.y_degree,
                x_size: x.x_size,
                y_size: x.y_size,
            };
            vj.push(n);
        });
        self.w_j_X.iter().for_each(|x| {
            let mut coeffs_vec = vec![zero; x.x_size * x.y_size];
            let coeffs = HostSlice::from_mut_slice(&mut coeffs_vec);
            x.copy_coeffs(0, coeffs);

            let cf = coeffs.iter().map(|c| { FieldSerde(*c) }).collect();

            let n = DensePolynomialExtSerialized {
                poly: cf,
                x_degree: x.x_degree,
                y_degree: x.y_degree,
                x_size: x.x_size,
                y_size: x.y_size,
            };
            wj.push(n);
        });

        //TODO remove restriction on the
        QAPSerialized {
            u_j_X: uj.to_vec(),
            v_j_X: vj.to_vec(),
            w_j_X: wj.to_vec(), //[0..64]
        }
    }
    pub fn compare(&self, n: &QAP) -> bool {
        let x = ScalarCfg::generate_random(1)[0];
        let y = ScalarCfg::generate_random(1)[0];

        let check1 = self.u_j_X.iter().zip(&n.u_j_X).all(|(p1, p2)| p1.eval(&x, &y) == p2.eval(&x, &y));
        let check2 = self.v_j_X.iter().zip(&n.v_j_X).all(|(p1, p2)| p1.eval(&x, &y) == p2.eval(&x, &y));
        let check3 = self.w_j_X.iter().zip(&n.w_j_X).all(|(p1, p2)| p1.eval(&x, &y) == p2.eval(&x, &y));

        check1 && check2 && check3
    }
    pub fn save_to_json(&self, path: &str) -> std::io::Result<()> {
        /* let file = File::create(path)?;
         let mut writer = BufWriter::new(file);
         let json_str = serde_json::to_string_pretty(&self.get_serialized())
             .expect("JSON serialization failed");
         writer.write_all(json_str.as_bytes())?;*/
        let encoded: Vec<u8> = bincode::serialize(&self.get_serialized()).unwrap();
        std::fs::write(path, encoded)?;
        Ok(())
    }

    pub fn load_from_json(path: &str) -> std::io::Result<Self> {
        /*let file = File::open(path)?;
        let mut reader = BufReader::new(file);
        let mut json_str = String::new();
        reader.read_to_string(&mut json_str)?;
        let acc: QAPSerialized = serde_json::from_str(&json_str)
            .expect("JSON deserialization failed");
*/
        //let encoded = std::fs::read(path)?;

        let file = File::open(path)?;
        let mmap = unsafe { Mmap::map(&file)? };

        // Deserialize directly from mmap (fastest IO)
        let acc: QAPSerialized = bincode::deserialize(&mmap[..]).unwrap();

        // Parallel extraction of Send-safe coefficients only
        let (u_coeffs, (v_coeffs, w_coeffs)) = join(
            || acc.u_j_X.iter().map(|n| {
                assert!(n.x_size > 0 && n.y_size > 0, "x,y size must be positive");
                (n.poly.iter().map(|c| c.0).collect::<Vec<_>>(), n.x_degree, n.y_degree, n.x_size, n.y_size)
            }).collect::<Vec<_>>(),
            || join(
                || acc.v_j_X.iter().map(|n| {
                    assert!(n.x_size > 0 && n.y_size > 0, "x,y size must be positive");
                    (n.poly.iter().map(|c| c.0).collect::<Vec<_>>(), n.x_degree, n.y_degree, n.x_size, n.y_size)
                }).collect::<Vec<_>>(),
                || acc.w_j_X.iter().map(|n| {
                    assert!(n.x_size > 0 && n.y_size > 0, "x,y size must be positive");
                    (n.poly.iter().map(|c| c.0).collect::<Vec<_>>(), n.x_degree, n.y_degree, n.x_size, n.y_size)
                }).collect::<Vec<_>>(),
            ),
        );

        // Sequentially build non-Send-safe DensePolynomialExt (safe)
        let u_j_X: Vec<_> = u_coeffs.into_iter().map(|(coeffs, x_degree, y_degree, x_size, y_size)| {
            let coeffs_box = HostSlice::from_slice(&coeffs);
            DensePolynomialExt {
                poly: DensePolynomial::from_coeffs(coeffs_box, x_size * y_size),
                x_degree,
                y_degree,
                x_size,
                y_size,
            }
        }).collect();

        let v_j_X: Vec<_> = v_coeffs.into_iter().map(|(coeffs, x_degree, y_degree, x_size, y_size)| {
            let coeffs_box = HostSlice::from_slice(&coeffs);
            DensePolynomialExt {
                poly: DensePolynomial::from_coeffs(coeffs_box, x_size * y_size),
                x_degree,
                y_degree,
                x_size,
                y_size,
            }
        }).collect();

        let w_j_X: Vec<_> = w_coeffs.into_iter().map(|(coeffs, x_degree, y_degree, x_size, y_size)| {
            let coeffs_box = HostSlice::from_slice(&coeffs);
            DensePolynomialExt {
                poly: DensePolynomial::from_coeffs(coeffs_box, x_size * y_size),
                x_degree,
                y_degree,
                x_size,
                y_size,
            }
        }).collect();
        Ok(QAP { u_j_X, v_j_X, w_j_X })
    }
}
pub fn from_subcircuit_to_QAP(
    compact_R1CS: &SubcircuitR1CS,
    setup_params: &SetupParams,
    subcircuit_info: &SubcircuitInfo,
) -> (Vec<DensePolynomialExt>, Vec<DensePolynomialExt>, Vec<DensePolynomialExt>) {
    let compact_A_mat = &compact_R1CS.A_compact_col_mat;
    let compact_B_mat = &compact_R1CS.B_compact_col_mat;
    let compact_C_mat = &compact_R1CS.C_compact_col_mat;
    let active_wires_A = &compact_R1CS.A_active_wires;
    let active_wires_B = &compact_R1CS.B_active_wires;
    let active_wires_C = &compact_R1CS.C_active_wires;
    let n = setup_params.n;

    // Reconstruct local u,v,w polynomials
    let zero_coef_vec = [ScalarField::zero()];
    let zero_coef = HostSlice::from_slice(&zero_coef_vec);
    let zero_poly = DensePolynomialExt::from_coeffs(zero_coef, 1, 1);
    let mut u_j_X = vec![zero_poly.clone(); subcircuit_info.Nwires];
    let mut v_j_X = vec![zero_poly.clone(); subcircuit_info.Nwires];
    let mut w_j_X = vec![zero_poly.clone(); subcircuit_info.Nwires];

    let mut ordered_active_wires_A: Vec<usize> = active_wires_A.iter().cloned().collect();
    ordered_active_wires_A.sort();
    for (idx_u, &idx_o) in ordered_active_wires_A.iter().enumerate() {
        let u_j_eval_vec = &compact_A_mat[idx_u * n..(idx_u + 1) * n];
        let u_j_eval = HostSlice::from_slice(&u_j_eval_vec);
        let u_j_poly = DensePolynomialExt::from_rou_evals(u_j_eval, n, 1, None, None);
        u_j_X[idx_o] = u_j_poly;
    }
    let mut ordered_active_wires_B: Vec<usize> = active_wires_B.iter().cloned().collect();
    ordered_active_wires_B.sort();
    for (idx_v, &idx_o) in ordered_active_wires_B.iter().enumerate() {
        let v_j_eval_vec = &compact_B_mat[idx_v * n..(idx_v + 1) * n];
        let v_j_eval = HostSlice::from_slice(&v_j_eval_vec);
        let v_j_poly = DensePolynomialExt::from_rou_evals(v_j_eval, n, 1, None, None);
        v_j_X[idx_o] = v_j_poly;
    }
    let mut ordered_active_wires_C: Vec<usize> = active_wires_C.iter().cloned().collect();
    ordered_active_wires_C.sort();
    for (idx_w, &idx_o) in ordered_active_wires_C.iter().enumerate() {
        let w_j_eval_vec = &compact_C_mat[idx_w * n..(idx_w + 1) * n];
        let w_j_eval = HostSlice::from_slice(&w_j_eval_vec);
        let w_j_poly = DensePolynomialExt::from_rou_evals(w_j_eval, n, 1, None, None);
        w_j_X[idx_o] = w_j_poly;
    }

    return (u_j_X, v_j_X, w_j_X);
}