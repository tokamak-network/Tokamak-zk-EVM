use std::{collections::HashMap, usize};

use lambdaworks_math::{
    elliptic_curve::short_weierstrass::curves::bls12_381::default_types::FrConfig, fft::cpu::roots_of_unity::get_powers_of_primitive_root, field::{element::FieldElement, traits::{IsFFTField, RootsConfig}}, unsigned_integer::element::{U256, U64},

    polynomial::Polynomial as UnivariatePolynomial,
};
use rand_chacha::rand_core::le;
use zkp_rust_tools_math::bipolynomial::BivariatePolynomial;
use ndarray::{Array2, concatenate, Axis,s};
use lambdaworks_groth16::{common::{FrElement,FrField}, r1cs::{self, ConstraintSystem, R1CS}};
use rand::Rng;



// as it is demonstration, we need to think about what should be the input of this struct, 
// the permutation of subcircuit wires is needed to calculate a_0, a_1 , s_0 , s_1, b. 
pub struct CopyConstraintProver {
    s_max: u32,
    l_d: u32,
    l: u32,

    s_0: BivariatePolynomial<FrElement>,
    s_1: BivariatePolynomial<FrElement>,

    b: BivariatePolynomial<FrElement>,


}

impl CopyConstraintProver {
    pub fn new(s_max: u32, l_d: u32, l: u32) -> Self {
        let (b, s_0, s_1) = create_random_permutation(s_max as usize, l_d as usize);
        CopyConstraintProver { s_max, l_d, l,s_0, s_1,b }
    }

    // pub fn set_random_challenges(theta_0: FrElement, theta_1: FrElement, theta_2: FrElement)

    pub fn prove(&self) -> (BivariatePolynomial<FrElement>, BivariatePolynomial<FrElement>){
        let tetha_0 = random_fr(); 
        let tetha_1 = random_fr(); 
        let tetha_2 = random_fr();
        
        let zero_matrix = Array2::<FrElement>::from_elem((self.l_d as usize, self.s_max as usize), FrElement::zero());
        
        let mut y_monomial_matrix = zero_matrix.clone(); 
        y_monomial_matrix[(0,1)] = FrElement::one() ;

        let y_monomial = BivariatePolynomial::new(y_monomial_matrix);

        let mut z_monomial_matrix = zero_matrix.clone(); 
        z_monomial_matrix[(1,0)] = FrElement::one() ;

        let z_monomial = BivariatePolynomial::new(z_monomial_matrix);

        let mut one_x_0_y_0 = zero_matrix.clone();
        one_x_0_y_0[(0,0)] = FieldElement::one();
        let one_x_0_y_0_poly = BivariatePolynomial::new(one_x_0_y_0);


        let f = &self.b + &tetha_0 * &self.s_0   + &tetha_1 * &self.s_1   + &tetha_2 * &one_x_0_y_0_poly;
        let g = &self.b + &tetha_0 * &y_monomial + &tetha_1 * &z_monomial + &tetha_2 * &one_x_0_y_0_poly; 
        
        let f_evals = BivariatePolynomial::evaluate_fft::<FrField>(&f, 1, 1, None, None).unwrap();
        let g_evals = BivariatePolynomial::evaluate_fft::<FrField>(&g, 1, 1, None, None).unwrap();
        

        let w_z = FrField::get_primitive_root_of_unity(self.l_d.trailing_zeros() as u64 ).unwrap();
        let w_y = FrField::get_primitive_root_of_unity(self.s_max.trailing_zeros() as u64).unwrap();

        let one = Array2::<FrElement>::from_elem((self.l_d as usize, self.s_max as usize), FrElement::one());

        let mut c = one.clone(); 

        for i in 0..self.s_max as usize {
            c[(0, i)] = if i > 0 {
                c[(self.l_d as usize - 1 , i - 1)].clone() * f_evals[(0,i)].clone() / g_evals[(0,i)].clone()
            } else {
                c[(self.l_d as usize - 1 , self.s_max as usize - 1)].clone() * f_evals[(0,i)].clone() / g_evals[(0,i)].clone()
            };


            for j in 1..self.l_d as usize {
                c[(j, i)] = c[(j - 1, i)].clone() * f_evals[(j, i)].clone() / g_evals[(j, i)].clone();
            }

        }

        let r = BivariatePolynomial::interpolate_fft::<FrField>(&c).unwrap(); 

        // part4 
        let k = random_fr();
       
        // part5 
        let mut d = zero_matrix.clone(); 
        d[(self.l_d as usize - 1 , self.s_max as usize - 1 )] = FrElement::one(); 


        let e = BivariatePolynomial::interpolate_fft::<FrField>(&d).unwrap(); 

        let r_minus_one = (-FrElement::one()) + &r ;

        let r_minus_one_evaluation =  BivariatePolynomial::evaluate_fft::<FrField>(&r_minus_one, 1, 1, Some(2*self.s_max as usize), Some(3*self.l_d as usize) ).unwrap();
        let e_evaluation =  BivariatePolynomial::evaluate_fft::<FrField>(&e, 1, 1, Some(2*self.s_max as usize), Some(3*self.l_d as usize) ).unwrap();

        let p1_evaluation = r_minus_one_evaluation * e_evaluation; 

        let p_1 = BivariatePolynomial::interpolate_fft::<FrField>(&p1_evaluation).unwrap(); 

        let r_evaluation = BivariatePolynomial::evaluate_fft::<FrField>(&r, 1, 1, Some(2*self.s_max as usize), Some(3*self.l_d as usize) ).unwrap();
        let g_evaluation = BivariatePolynomial::evaluate_fft::<FrField>(&g, 1, 1, Some(2*self.s_max as usize), Some(3*self.l_d as usize) ).unwrap();

        let h_evaluation = r_evaluation * g_evaluation; 
        let h = BivariatePolynomial::interpolate_fft::<FrField>(&h_evaluation).unwrap(); 



        // todo fix this w_z_inverse   -> l_d - l should be replace with current implementation 
        let w_z_inverse = FrField::get_primitive_root_of_unity(self.l_d.trailing_zeros() as u64 ).unwrap().inv().unwrap();
        let w_y_inverse = FrField::get_primitive_root_of_unity(self.s_max.trailing_zeros() as u64).unwrap().inv().unwrap();

        let r_scaled_1_inverse_w_z_evaluation = BivariatePolynomial::evaluate_offset_fft(&r, 1, 1, Some(2*self.s_max as usize), Some(3*self.l_d as usize) ,&FrElement::one() , &w_z_inverse).unwrap();
        let f_evaluation = BivariatePolynomial::evaluate_fft::<FrField>(&f, 1, 1, Some(2*self.s_max as usize), Some(3*self.l_d as usize) ).unwrap();
        
        // shift solution 
        //  
        let c_row_shifted = shift_rows(&c, 1);
        let r_prim = BivariatePolynomial::interpolate_fft::<FrField>(&c_row_shifted).unwrap(); 
        let r_prim_evaluations = BivariatePolynomial::evaluate_fft::<FrField>(&r_prim, 1, 1, Some(2*self.s_max as usize), Some(3*self.l_d as usize) ).unwrap();
     

        let r_row_col_shifted = shift_columns(&c_row_shifted, 1);
        let r_zegond = BivariatePolynomial::interpolate_fft::<FrField>(&r_row_col_shifted).unwrap(); 
        let r_zegond_evaluations = BivariatePolynomial::evaluate_fft::<FrField>(&r_zegond, 1, 1, Some(2*self.s_max as usize), Some(3*self.l_d as usize) ).unwrap();
     
        ///



        let i_evaluation = r_prim_evaluations * &f_evaluation; 
        let j_evaluation = r_zegond_evaluations * &f_evaluation; 



        let i = BivariatePolynomial::interpolate_fft::<FrField>(&i_evaluation).unwrap(); 

        let r_scaled_inverse_w_y_inverse_w_z = BivariatePolynomial::evaluate_offset_fft(&r, 1, 1, Some(2*self.s_max as usize), Some(3*self.l_d as usize) ,&w_y_inverse , &w_z_inverse).unwrap();
        
        //without shifting
        // let i_evaluation = r_scaled_1_inverse_w_z_evaluation * &f_evaluation; 
        // let j_evaluation = r_scaled_inverse_w_y_inverse_w_z * &f_evaluation; 

        let j = BivariatePolynomial::interpolate_fft::<FrField>(&j_evaluation).unwrap(); 


        // let z_minus_one = -FrElement::one() + &z ;


        let z_minus_one = (-FrElement::one()) + &z_monomial ;
        let h_minus_i = &h - &i ; 

        let test=  eval(&h_minus_i, h_minus_i.y_degree/self.l_d as usize , h_minus_i.x_degree/self.s_max as usize);

        for i in 1..test.nrows(){
            for j in 0..test.ncols(){
                assert_eq!(test[(i,j)] , FrElement::zero());
            }
        }

        let h_minus_i_evaluation = BivariatePolynomial::evaluate_fft::<FrField>(&h_minus_i, 1, 1, Some(2*self.s_max as usize), Some(3*self.l_d as usize) ).unwrap();
        
        let z_minuc_one_evaluation = BivariatePolynomial::evaluate_fft::<FrField>(&z_minus_one, 1, 1, Some(2*self.s_max as usize), Some(3*self.l_d as usize) ).unwrap();
        
        let p_2_evaluation = z_minuc_one_evaluation * h_minus_i_evaluation; 
        let p_2 = BivariatePolynomial::interpolate_fft::<FrField>(&p_2_evaluation).unwrap(); 


        let mut k_0_evaluation = zero_matrix.clone() ;
        for j in 0..self.s_max as usize {
            k_0_evaluation[(0, j)] = FrElement::one();
        }



        

        let k_0 = BivariatePolynomial::interpolate_fft::<FrField>(&k_0_evaluation).unwrap(); 
        let k_0_resize_evaluations = BivariatePolynomial::evaluate_fft::<FrField>(&k_0, 1, 1, Some(2*self.s_max as usize), Some(3*self.l_d as usize) ).unwrap();

        // it is not necessary 
        // Some(2*self.s_max as usize), Some(3*self.l_d as usize) 
        // let k_0 = BivariatePolynomial::interpolate_fft::<FrField>(&k_0_evaluation);
        let h_minus_j = &h - &j ; 
      

        let test=  eval(&h_minus_j, h_minus_j.y_degree/self.l_d as usize , h_minus_j.x_degree/self.s_max as usize);

        for j in 0..test.ncols(){
            assert_eq!(test[(0,j)] , FrElement::zero());
        }   
        for i in 1..test.nrows(){
            for j in 0..test.ncols(){
                assert_ne!(test[(i,j)] , FrElement::zero());
            }
        }



        let h_minus_i_evaluation = BivariatePolynomial::evaluate_fft::<FrField>(&h_minus_j, 1, 1, Some(2*self.s_max as usize), Some(3*self.l_d as usize) ).unwrap();
        
        let p3_evaluation = h_minus_i_evaluation * k_0_resize_evaluations;
        let p_3 = BivariatePolynomial::interpolate_fft::<FrField>(&p3_evaluation).unwrap(); 


        let p = k.pow(3 as usize) * p_3 + k.pow(2 as usize) * p_2 + k * p_1 ;


        
        // part 6 


        BivariatePolynomial::coset_division::<FrField>(&p, self.s_max as usize, self.l_d as usize).unwrap()


        
    }


    fn create_recursive_poly(&self, f: BivariatePolynomial<FrElement>, g: BivariatePolynomial<FrElement>) -> BivariatePolynomial<FrElement> {

        let zero_matrix = Array2::<FrElement>::from_elem((self.l_d as usize, self.s_max as usize), FrElement::zero());
            
        let mut c = zero_matrix.clone(); 
        c[(self.l_d as usize - 1 , self.s_max as usize - 1 )] = FrElement::one(); 

        for i in 0..self.s_max as usize {
            c[(0, i)] = if i > 0 {
                c[(self.l_d as usize - 1 , i - 1)].clone()
            } else {
                c[(self.l_d as usize - 1 , self.s_max as usize - 1)].clone()
            };

            for j in 1..self.l_d as usize {
                c[(j, i)] = c[(j - 1, i)].clone() * f.coefficients[(j, i)].clone() / g.coefficients[(j, i)].clone();
            }
        }

        c[(self.l_d as usize - 1 , self.s_max as usize - 1 )] = FrElement::one(); 



        let r = BivariatePolynomial::interpolate_fft::<FrField>(&c).unwrap(); 
        r
    } 

}



// to create A_0 and A_1 we need to now about the upper bound to create random element.
pub fn random_permutation(row: u32, col: u32, upper_bound: u32) ->(Array2<u32> ,Array2<FrElement>)
{
    let mut rng = rand::thread_rng();
    let mut to_power_random_evals = Array2::<FrElement>::from_elem((row as usize, col as usize), FrElement::zero());
    let mut random_evals = Array2::<u32>::from_elem((row as usize, col as usize), 0);

    let w = FrField::get_primitive_root_of_unity(upper_bound as u64).unwrap();

    for i in 0..to_power_random_evals.nrows() {
        for j in 0..to_power_random_evals.ncols() {
            let random = rng.gen_range(0..upper_bound);
            to_power_random_evals[(i, j)] = w.pow(random);
            random_evals[(i, j)] = random;

        }
    }
    (random_evals ,to_power_random_evals)
}


// in this function I create W first and after that calculate IFFT to get B Bipoly.
pub fn calculate_b_permutation_poly(a_0: &Array2<u32>, a_1: &Array2<u32>) -> BivariatePolynomial<FrElement> {
    let mut w = Array2::<FrElement>::from_elem((a_0.nrows() as usize, a_0.ncols() as usize), FrElement::zero());
    #[cfg(debug_assertions)]
    println!("a_1 :: \n{:?}", a_1);
    #[cfg(debug_assertions)]
    println!("a_0 :: \n{:?}", a_0); 

    #[cfg(debug_assertions)]
    println!("len of axis 0 of a_0 :: {:?}", a_0.len_of(Axis(0))); 


    let mut map: HashMap<String, Vec<(usize, usize)>> = HashMap::new();

    for i in 0..a_0.nrows() {
        for j in 0..a_0.ncols() {

            if w[(a_1[(i,j)] as usize ,a_0[(i,j)] as usize)] == FrElement::zero() && w[(i,j)] == FrElement::zero()  {
                let r = random_fr();
                w[(a_1[(i,j)] as usize ,a_0[(i,j)] as usize)]  = r.clone();
                w[(i,j)] = r.clone();

                map.insert(r.to_hex(), vec!((i,j), (a_1[(i,j)] as usize ,a_0[(i,j)] as usize)));

            } else if w[(a_1[(i,j)] as usize ,a_0[(i,j)] as usize)] == FrElement::zero() &&  w[(i,j)] != FrElement::zero() {
                w[(a_1[(i,j)] as usize ,a_0[(i,j)] as usize)] = w[(i,j)].clone();
                // if map.contains_key(&w[(i,j)].clone().to_hex()){
                let mut permutation_vec = map.get(&w[(i,j)].clone().to_hex()).unwrap().clone();
                permutation_vec.push(((a_1[(i,j)] as usize ,a_0[(i,j)] as usize)));
                map.insert(w[(i,j)].clone().to_hex(), permutation_vec);
                // }
            } else if w[(a_1[(i,j)] as usize ,a_0[(i,j)] as usize)] != FrElement::zero() &&  w[(i,j)] == FrElement::zero() {
                w[(i,j)] = w[(a_1[(i,j)] as usize ,a_0[(i,j)] as usize)].clone();
            } else {
            
                #[cfg(debug_assertions)]
                println!("ij :: {:?}", (i,j));
                #[cfg(debug_assertions)]
                println!("p(ij) :: {:?}", (a_1[(i,j)] as usize ,a_0[(i,j)] as usize));
                assert_eq!(w[(a_1[(i,j)] as usize ,a_0[(i,j)] as usize)].clone(),w[(i,j)].clone());
            }

        }
    }


    let b =  BivariatePolynomial::interpolate_fft::<FrField>(&w).unwrap();
    b 
}

/// Generate a random field element
pub fn random_fr_upper_bound(upper_bound: u64) -> FrElement {
    let mut rng = rand::thread_rng();
    FrElement::from(rng.gen_range(0..upper_bound))
}

/// Generate a random field element
pub fn random_fr() -> FrElement {
    let mut rng = rand::thread_rng();
    FrElement::new(U256 {
        limbs: [
            rng.gen::<u64>(),
            rng.gen::<u64>(),
            rng.gen::<u64>(),
            rng.gen::<u64>(),
        ],
    })
}


pub fn create_random_permutation(s_max :usize , l_d :usize) -> (
    BivariatePolynomial<FrElement>,BivariatePolynomial<FrElement>,BivariatePolynomial<FrElement>,
) {   

    let mut list: Vec<(Vec<(usize, usize)>)> = Vec::new(); // Corrected type
    // i -> 0..s_max , j -> 0..l_d 
    let mut rng = rand::thread_rng();
    let wires_connected = rng.gen_range(2..s_max);
    // let wires_connected = s_max;

    for _ in 0..wires_connected {
        let random_index = rng.gen_range(1..l_d);
        // let random_index = l_d;
        let mut shared_wire: Vec<(usize,usize)> = Vec::new();
    
        for _ in 0..random_index{
        let mut unique_pair = false;
            let mut pair = (0, 0);

            while !unique_pair {
                pair = (rng.gen_range(0..s_max), rng.gen_range(0..l_d));    
                if pair == (0,0) {
                    continue;
                }
                unique_pair = !list.iter().any(|vec| vec.contains(&pair)) && !shared_wire.contains(&pair);
                
            }
            
            shared_wire.push(pair);
        }




        list.push(shared_wire);
    }   

    let mut zero_wire: Vec<(usize,usize)> = Vec::new();

    for i in 0..s_max {
        for j in 0..l_d {
            let pair = (i,j);
        if !list.iter().any(|vec| vec.contains(&pair)) {
            zero_wire.push(pair);
            }
        }
    }
    list.push(zero_wire);


    #[cfg(debug_assertions)]
    println!("list :: {:?}",list);

    let mut s_0_evals = Array2::<FrElement>::from_elem((l_d as usize, s_max as usize), FrElement::one());
    let mut a_0 = Array2::<u32>::from_elem((l_d as usize, s_max as usize), 0);
   
    let mut s_1_evals = Array2::<FrElement>::from_elem((l_d as usize, s_max as usize), FrElement::one());
    let mut a_1 = Array2::<u32>::from_elem((l_d as usize, s_max as usize), 0);

    let mut w  = Array2::<FrElement>::from_elem((l_d as usize, s_max as usize), FrElement::zero());
    
    let log2_l_d = (l_d as f64).log2() as usize;
    let log2_s_max = (s_max as f64).log2() as usize;


    let w_z = FrField::get_primitive_root_of_unity(l_d.trailing_zeros() as u64 ).unwrap();
    let w_y = FrField::get_primitive_root_of_unity(s_max.trailing_zeros() as u64).unwrap();
    // let w_z = get_powers_of_primitive_root::<FrField>(l_d.trailing_zeros().into(), 1, RootsConfig::Natural).unwrap().get(0).unwrap().clone();
    // let w_y = get_powers_of_primitive_root::<FrField>(s_max.trailing_zeros().into(), 1, RootsConfig::Natural).unwrap().get(0).unwrap().clone();


    // let dd = get_powers_of_primitive_root::<FrField>(l_d.trailing_zeros().into(), 1, RootsConfig::Natural).unwrap();
    // assert_eq!(dd[0],w_z);


    for (i, connected_wires) in list.iter().enumerate() {   
        
        let wire_value = if i == list.len() {
            FrElement::zero()
        }else{
            random_fr()
        };

        for (i, wire_index) in connected_wires.iter().enumerate() {
            w[(wire_index.1, wire_index.0)] = wire_value.clone();
         

            
            a_0[(wire_index.1 , wire_index.0)] = connected_wires[(i + 1) % connected_wires.len()].0 as u32;
            a_1[(wire_index.1 , wire_index.0)] = connected_wires[(i + 1) % connected_wires.len()].1 as u32;

            s_0_evals[(wire_index.1 , wire_index.0)] = w_y.pow(a_0[(wire_index.1 , wire_index.0)]);
            s_1_evals[(wire_index.1 , wire_index.0)] = w_z.pow(a_1[(wire_index.1 , wire_index.0)]);
        }   
    }
    #[cfg(debug_assertions)]
    println!("a_0 :: \n{:?}",a_0);

    #[cfg(debug_assertions)]
    println!("len of axis 0 of a_0 :: {:?}", a_0.len_of(Axis(0))); 

    #[cfg(debug_assertions)]
    println!("a_1 :: \n{:?}",a_1);


    let s_0 =  BivariatePolynomial::interpolate_fft::<FrField>(&s_0_evals).unwrap();
    let s_1 =  BivariatePolynomial::interpolate_fft::<FrField>(&s_1_evals).unwrap();



    let b =  BivariatePolynomial::interpolate_fft::<FrField>(&w).unwrap();
    // let b_evals = BivariatePolynomial::evaluate_fft::<FrField>(&b, 1, 1, None, None).unwrap();
    for i in 0..s_max {
        for j in 0..l_d {
            let c = b.evaluate(&w_y.pow(i), &w_z.pow(j));

            assert_eq!(c , w[(j,i)]);

        }
    }


    (b,s_0,s_1)


}

fn shift_rows<T: Clone>(arr: &Array2<T>, shift: usize) -> Array2<T> {
    let nrows = arr.nrows();
    let shift = nrows - shift % nrows; 

    let top = arr.slice(s![shift.., ..]);
    let bottom = arr.slice(s![..shift, ..]);

    concatenate(Axis(0), &[top, bottom]).unwrap()
}


fn shift_columns<T: Clone>(arr: &Array2<T>, shift: usize) -> Array2<T> {
    let ncols = arr.ncols();
    let shift = ncols - shift % ncols; // Ensure shift is within bounds

    let left = arr.slice(s![.., shift..]);
    let right = arr.slice(s![.., ..shift]);

    concatenate(Axis(1), &[left, right]).unwrap()
}


fn segment_and_sum<T>(arr: &Array2<T>, row_blow_up_factor: usize, col_blow_up_factor: usize) -> Array2<T>
where
    T: Clone + std::ops::Add<Output = T> + Default,
{
    let nrows = arr.nrows();
    let ncols = arr.ncols();
    let result_nrow = nrows / row_blow_up_factor ; 
    let result_ncol = ncols / col_blow_up_factor; 

    let mut result = Array2::<T>::default((result_nrow, result_ncol));

    for i in 0..result_nrow {
        for j in 0..result_ncol {
            let mut segment_sum = T::default();
            for x in 0.. row_blow_up_factor {
                for y in 0.. col_blow_up_factor {
                    segment_sum = segment_sum + arr[(x * (nrows / row_blow_up_factor) + i, y * (ncols / col_blow_up_factor) + j)].clone();
                }
            }
            result[(i, j)] = segment_sum;
        }
    }

    result
}


fn eval<F>(a: &BivariatePolynomial<FieldElement<F>>, row_blow_up_factor: usize, col_blow_up_factor: usize) 
    -> Array2<FieldElement<F>>
where
    F: IsFFTField,
{
    let b_coeffs = segment_and_sum(&a.coefficients, row_blow_up_factor, col_blow_up_factor);
    let b = BivariatePolynomial::new(b_coeffs);
    BivariatePolynomial::evaluate_fft::<F>(&b, 1, 1, None, None).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use lambdaworks_math::field::traits::IsField;
    use ndarray::array;




    #[test]
    fn test_x(){
        let prover = CopyConstraintProver::new(8, 4, 0);
        let (q_z, q_y) = prover.prove();
        // assert_eq!(q_z.polynomial_dimension() , (self.s_max as usize - 1 , 2* self.l_d as usize - 3));
        // assert_eq!(q_y.polynomial_dimension() , (self.s_max as usize - 2 , 3* self.l_d as usize - 3));

        assert_eq!(q_z.polynomial_dimension() , (8 - 1 , 2* 4 - 3));
        assert_eq!(q_y.polynomial_dimension() , (8 - 2 , 3* 4 - 3));
    }

    // I need to write a test to check the permutation B is correct or not , for that I should write 
    // all the functionality together because current implementation is not compatible with it 
    #[test]
    fn test_b_permutaion_calculation(){
        let l_d = 4; 
        let s_max = 8 ; 
        // let (a_0,s_0_evals) = random_permutation(l_d,s_max,s_max);
        // let (a_1, s1_evals) =  random_permutation(l_d,s_max,l_d);
    

        // let s_0 =  BivariatePolynomial::interpolate_fft::<FrField>(&s_0_evals).unwrap();
        // let s_1 = BivariatePolynomial::interpolate_fft::<FrField>(&s1_evals).unwrap();

        // let b = calculate_b_permutation_poly(&a_0,&a_1);

        let (b,s_0, s_1) = create_random_permutation(s_max, l_d);

    
        let w_z = FrField::get_primitive_root_of_unity(l_d.trailing_zeros() as u64 ).unwrap();
        let w_y = FrField::get_primitive_root_of_unity(s_max.trailing_zeros() as u64).unwrap();
    

        for i in 0..s_max {
            for j in 0..l_d {
                let c = b.evaluate(&w_y.pow(i), &w_z.pow(j));
                let p_i_j_0 = s_0.evaluate(&w_y.pow(i), &w_z.pow(j));
                let p_i_j_1 = s_1.evaluate(&w_y.pow(i), &w_z.pow(j));

                let c_expected = b.evaluate(&p_i_j_0, &p_i_j_1); 

                #[cfg(debug_assertions)]
                println!("{},{} c_or :: ,  {:?}",i,j ,c.value());
                #[cfg(debug_assertions)]
                println!("{},{} c_or :: ,  {:?}",i,j, c_expected.value());
                assert_eq!(c , c_expected);

            }
        }
        
    }
    

    #[test]
    fn test_one_ifft_is_one(){
        // let one = BivariatePolynomial::new(Array2::<FrElement>::from_elem((5, 7), FrElement::one()));
        // #[cfg(debug_assertions)]
        // println!("one :: {}", one);

        let bib_bib = BivariatePolynomial::interpolate_fft::<FrField>(&Array2::<FrElement>::from_elem((4,8), FrElement::one())).unwrap(); 
        #[cfg(debug_assertions)]
        println!("bib_bib :: {}", bib_bib);

        assert_eq!(bib_bib.coefficients.get((0,0)).unwrap(), &FrElement::one());
    }


    #[test]
    fn test_permutation(){
        create_random_permutation(8,4);
    }


    #[test]
    fn test_scale_fft_equal_coset_fft(){ 

        // Define the expected quotient polynomial (3 + x + 2xy + x^2y + 4xy^2)
        let p = BivariatePolynomial::new(array![
            [FrElement::from(3), FrElement::from(1), FrElement::from(0), FrElement::from(0)],
            [FrElement::from(0), FrElement::from(2), FrElement::from(1), FrElement::from(0)],
            [FrElement::from(0), FrElement::from(4), FrElement::from(0), FrElement::from(0)],
            [FrElement::from(0), FrElement::zero(), FrElement::zero(), FrElement::from(0)],
        ]);


        let w_z = FrField::get_primitive_root_of_unity(3).unwrap();

        let p_scaled = p.scale(&FrElement::one(), &w_z);
        let p_scaled_eval = BivariatePolynomial::evaluate_fft::<FrField>(&p_scaled, 1, 1, None, None).unwrap();
        
        let p_eval_scaled = BivariatePolynomial::evaluate_offset_fft(&p, 1, 1, None, None, &FrElement::one(), &w_z).unwrap();
        

        assert_eq!(p_eval_scaled, p_scaled_eval);

        let p = -FrElement::one() + &p ; 

        let p_expected = BivariatePolynomial::new(array![
            [FrElement::from(2), FrElement::from(1), FrElement::from(0), FrElement::from(0)],
            [FrElement::from(0), FrElement::from(2), FrElement::from(1), FrElement::from(0)],
            [FrElement::from(0), FrElement::from(4), FrElement::from(0), FrElement::from(0)],
            [FrElement::from(0), FrElement::zero(), FrElement::zero(), FrElement::from(0)],
        ]);

        assert_eq!(p, p_expected);


    }       

    #[test]
    fn test_shift() {
        let arr = Array2::from_shape_vec((3, 3), (0..9).collect()).unwrap();
        println!("Original array:\n{:?}", arr);
    
        let row_shifted = shift_rows(&arr, 1);
        println!("Row shifted array:\n{:?}", row_shifted);
    
        let col_shifted = shift_columns(&arr, 1);
        println!("Column shifted array:\n{:?}", col_shifted);
    }

    #[test] 
    fn test_segment_and_sum() {
        let arr = Array2::from_shape_vec((4, 4), (0..16).collect()).unwrap();
        println!("Original array:\n{:?}", arr);

        let segments = segment_and_sum(&arr, 2, 2);
        println!("Segments and their sums:\n{:?}", segments);

        let expected_segments = array![
            [20, 24],
            [36, 40],
        ];

        assert_eq!(segments, expected_segments);        
        // assert_eq!(segments, expected_segments);
    }

    #[test]
    fn test_eval(){


        use lambdaworks_math::field::fields::u64_prime_field::{FE17,F17};


        let mut rng = rand::thread_rng();
        let rows = 4; // l_d
        let cols = 8; // s_max
        let mut b = Array2::<FE17>::default((rows, cols));

        for i in 0..rows {
            for j in 0..cols {
                b[(i, j)] = FE17::from(rng.gen_range(0..16));
            }
        }   

        let mut b_zero_padded = Array2::<FE17>::default((4 * rows, 2 * cols));


        for i in 0..rows {
            for j in 0..cols {
                b_zero_padded[(4*i, 2*j)] = b[(i, j)].clone();
            }
        }
        println!("b zero padded");
        for i in 0..b_zero_padded.nrows() {
            for j in 0..b_zero_padded.ncols() {
                let fe = &b_zero_padded[(i, j)];
                print!("{:?}, ", fe.value());
            }
            println!();
        }
        // println!("{:?}",b_zero_padded);



        // let zero_padded_poly = BivariatePolynomial::new(zero_padded_random_array);

        let a = BivariatePolynomial::interpolate_fft::<F17>(&b_zero_padded).unwrap();
        let b_tilda = eval(&a, 4, 2);

        // println!("b_tilda polynomial dimension: {:?}\n {:?}", b_tilda.dim(),b_tilda);
        // println!("b polynomial dimension: {:?}\n {:?}", b.dim(),b);

        println!("b");
        for i in 0..b.nrows() {
            for j in 0..b.ncols() {
                let fe = &b[(i, j)];
                print!("{:?}, ", fe.value());
            }
            println!();
        }

        println!("b_tilda");

        for i in 0..b_tilda.nrows() {
            for j in 0..b_tilda.ncols() {
                let fe = &b_tilda[(i, j)];
                print!("{:?}, ", fe.value());
            }
            println!();
        }

        assert_eq!(b,b_tilda);


    }
}   