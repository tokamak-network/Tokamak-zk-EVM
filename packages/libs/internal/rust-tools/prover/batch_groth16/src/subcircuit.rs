use lambdaworks_groth16::{common::{FrElement,FrField}, r1cs::{self, ConstraintSystem, R1CS}};
use zkp_rust_tools_math::bipolynomial::BivariatePolynomial;
use lambdaworks_math::{fft::errors::FFTError, field::element::{self, FieldElement}, helpers::next_power_of_two, polynomial::Polynomial as UnivariatePolynomial};
use ndarray::{concatenate, s, Array, Array2, ArrayBase, Axis, IndexLonger, Ix2};

// 

#[derive(Debug)]
pub struct SubcircuitManager{
    pub num_subcircuits: usize, 
    pub max_constraints: usize, // 2^4 
    pub max_witness: usize, // maybe not neccessary 
    pub subcircuits: Vec<R1CS>,


    pub xi: FieldElement<FrField> ,// y coset scalar 
    pub zeta: FieldElement<FrField>, // x coset scalar 

}



impl SubcircuitManager {
    pub fn new(num_subcircuits: usize, max_constraints: usize, max_witness: usize, subcircuits: Vec<R1CS>) -> Self {
        let max_constraints = max_constraints.next_power_of_two();
        let max_witness = max_witness.next_power_of_two();
        Self {
            num_subcircuits,
            max_constraints,
            max_witness,
            subcircuits,
            xi : FrElement::from(5), 
            zeta: FrElement::from(3),
        }
    } 
    // will return U V, W matrices 
    pub fn concatinate_subcircuits(&self ,ordered_idx: &[usize], witnesses: &[Vec<FrElement>]) -> Result<(BivariatePolynomial<FrElement>,BivariatePolynomial<FrElement>,BivariatePolynomial<FrElement>),FFTError> {
        // s , d  >=-> s row , d columns 
        let mut l_matrix = Array2::<FrElement>::default((witnesses.len(),self.max_constraints));
        let mut r_matrix = Array2::<FrElement>::default((witnesses.len(),self.max_constraints));
        let mut o_matrix = Array2::<FrElement>::default((witnesses.len(),self.max_constraints));

        

        //y should be length of column or s .


        // d = 8 s = 4 => U 8*4 => deg polynomial (4,8)
        // deg pi_y = d-1, s-2??? really ??? -> pi_y : deg_x = 7 deg_y = 2
        // deg pi_x = d-2, 2s-2 -> 6*6 
        // d is max_constraints . which is the number of rows   

        // degP 14, 6

        
        for i in 0..witnesses.len() {
            for (constraint_cnt, constraint ) in self.subcircuits[ordered_idx[i]].constraints.iter().enumerate(){

                let u_i_j = constraint.a.iter().enumerate().fold(FrElement::zero(), |acc, (j, a_j)| acc + a_j * witnesses[i][j].clone());
                let v_i_j = constraint.b.iter().enumerate().fold(FrElement::zero(), |acc, (j, b_j)| acc + b_j * witnesses[i][j].clone());
                let w_i_j = constraint.c.iter().enumerate().fold(FrElement::zero(), |acc, (j, c_j)| acc + c_j * witnesses[i][j].clone());
                let v_entry = r_matrix.get_mut((i, constraint_cnt)).unwrap();
                *v_entry = v_i_j;

                let w_entry = o_matrix.get_mut((i, constraint_cnt)).unwrap();
                *w_entry = w_i_j;

                let u_entry = l_matrix.get_mut((i, constraint_cnt)).unwrap();
                *u_entry = u_i_j;

            }
        }

        let zero_matrix = (l_matrix.clone() * r_matrix.clone()) - o_matrix.clone();

        #[cfg(debug_assertions)]
        for row in zero_matrix.axis_iter(Axis(0)) {
            println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
        }


        let l_poly = BivariatePolynomial::interpolate_fft::<FrField>(&l_matrix)?;
        let r_poly = BivariatePolynomial::interpolate_fft::<FrField>(&r_matrix)?;
        let o_poly = BivariatePolynomial::interpolate_fft::<FrField>(&o_matrix)?;
    
        Ok((l_poly, r_poly, o_poly))
    }
    // TODO :: error handling , it will return \pi_X and \pi_Y
    pub fn generate_proof_polynomials(&self, u: BivariatePolynomial<FrElement>,v: BivariatePolynomial<FrElement>,w: BivariatePolynomial<FrElement>) -> (BivariatePolynomial<FrElement>, BivariatePolynomial<FrElement>){
        
        let s = u.coefficients.len_of(Axis(0));
        let d = u.coefficients.len_of(Axis(1));

        let a_coset_y_evaluation = BivariatePolynomial::evaluate_offset_fft(&u, 1, 1, None, None, &FrElement::one() , &self.xi).unwrap();
        let b_coset_y_evaluation = BivariatePolynomial::evaluate_offset_fft(&v, 1, 1, None, None, &FrElement::one() , &self.xi).unwrap();
        let c_coset_y_evaluation = BivariatePolynomial::evaluate_offset_fft(&w, 1, 1, None, None, &FrElement::one() , &self.xi).unwrap();

        let mut r_coset_y_evaluation = (a_coset_y_evaluation * b_coset_y_evaluation ) - c_coset_y_evaluation;

        let divisor_inv_xi = (self.xi.pow(s) - FrElement::one()).inv().unwrap(); 
     

        r_coset_y_evaluation = r_coset_y_evaluation.map_mut(|elem| elem.clone() * &divisor_inv_xi);
    
        let pi_y_poly = BivariatePolynomial::interpolate_offset_fft::<FrField>(&r_coset_y_evaluation, &FrElement::one(), &self.xi).unwrap();

        let pi_y_coefficients_negated = pi_y_poly.coefficients.mapv(|elem| -elem);

        //step 5 
        let remainder_poly_coefficients = concatenate(Axis(0), &[pi_y_coefficients_negated.view(), pi_y_poly.coefficients.view()]).unwrap();


    


        let remainder_poly = BivariatePolynomial::new(remainder_poly_coefficients);

        let remainder_poly_evaluation = BivariatePolynomial::evaluate_offset_fft(&remainder_poly, 1, 1, None, None, &self.zeta, &FrElement::one()).unwrap();
        
        let d_coset_x_evaluation_x_zero_padded = BivariatePolynomial::evaluate_offset_fft(&u, 1, 2, None, None, &self.zeta, &FrElement::one()).unwrap();
        let e_coset_x_evaluation_x_zero_padded = BivariatePolynomial::evaluate_offset_fft(&v, 1, 2, None, None, &self.zeta, &FrElement::one()).unwrap();
        let f_coset_x_evaluation_x_zero_padded = BivariatePolynomial::evaluate_offset_fft(&w, 1, 2, None, None, &self.zeta, &FrElement::one()).unwrap();




        let mut q_coset_x_evaluation = (d_coset_x_evaluation_x_zero_padded * e_coset_x_evaluation_x_zero_padded) - f_coset_x_evaluation_x_zero_padded - remainder_poly_evaluation; 


        let divisor_inv_zeta = (self.zeta.pow(d) - FrElement::one()).inv().unwrap(); 
       
        q_coset_x_evaluation = q_coset_x_evaluation.map_mut(|elem| elem.clone() * &divisor_inv_zeta);
    
        let pi_x_poly= BivariatePolynomial::interpolate_offset_fft::<FrField>(&q_coset_x_evaluation, &self.zeta, &FrElement::one()).unwrap();

        // let divisor = FrElement::from(2); // Replace 2 with the specific number you want to divide by
        // let mut r_coset_y_evaluation_divided = r_coset_y_evaluation.clone();
        // for i in 0..r_coset_y_evaluation_divided.nrows() {
        //     for j in 0..r_coset_y_evaluation_divided.ncols() {
        //         r_coset_y_evaluation_divided[(i, j)] /= divisor.clone();
        //     }
        // }    

        (pi_y_poly,pi_x_poly)

    }
}

// #[inline]
// fn get_varialbe_lro_array_from_r1cs() -> []




// this function should calculate lro polynomials with zeropadding which is equal to max_constraints . 
pub fn lro_polys_from_r1cs(r1cs: R1CS, max_constraints: usize) -> [Vec<UnivariatePolynomial<FrElement>>;3] {
    let num_gates = r1cs.number_of_constraints();
    let pad_zeroes: usize = max_constraints - num_gates;

    let mut l: Vec<UnivariatePolynomial<FrElement>> = vec![];
    let mut r: Vec<UnivariatePolynomial<FrElement>> = vec![];
    let mut o: Vec<UnivariatePolynomial<FrElement>> = vec![];
    // 
    for i in 0..r1cs.witness_size() {
        let [l_poly, r_poly, o_poly] =
            get_variable_lro_polynomials_from_r1cs(&r1cs, i, pad_zeroes);
        l.push(l_poly);
        r.push(r_poly);
        o.push(o_poly);
    }

    [l,r,o]
    // todo!()
}   

#[inline]
fn get_variable_lro_polynomials_from_r1cs(
    r1cs: &R1CS,
    var_idx: usize,
    pad_zeroes: usize,
) -> [UnivariatePolynomial<FrElement>; 3] {
    let cap = r1cs.number_of_constraints() + pad_zeroes;
    let mut current_var_l = vec![FrElement::zero(); cap];
    let mut current_var_r = vec![FrElement::zero(); cap];
    let mut current_var_o = vec![FrElement::zero(); cap];

    for (i, c) in r1cs.constraints.iter().enumerate() {
        current_var_l[i] = c.a[var_idx].clone();
        current_var_r[i] = c.b[var_idx].clone();
        current_var_o[i] = c.c[var_idx].clone();
    }

    [current_var_l, current_var_r, current_var_o]
        .map(|e| UnivariatePolynomial::interpolate_fft::<FrField>(&e).unwrap())
}

// pub fn setup_subcircuits(
//     subcircuits_file_content: &[&str], 
// ){
//     todo!()
// }





#[cfg(test)]
mod tests {
    use std::vec;

    use super::*;
    use lambdaworks_groth16::common::FrElement;

    use lazy_static::lazy_static;
    // ... existing code ...
    

    lazy_static! {
        static ref KEVIN_EXAMPLE: R1CS = R1CS::from_matrices(
            vec![
                vec![FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0)],
                vec![FrElement::from(5),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1)]
            ],
            vec![
                vec![FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
            ],
            vec![
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
            ],
            5,
        );
        //https://learn.0xparc.org/materials/circom/additional-learning-resources/r1cs%20explainer/
        static ref KEVIN_WITNESS: Vec<FrElement> = vec![FrElement::from(1),FrElement::from(3),FrElement::from(35),FrElement::from(9),FrElement::from(27),FrElement::from(30)];


        static ref THREE_FAC_MOONMATH: R1CS = R1CS::from_matrices(
            vec![
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0)], // i1
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1)]
            ],
            vec![
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0)], // i2 
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0)]
            ],
            vec![
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1)], // w1 
                vec![FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)]
            ],
            5,
        );
        // 2*3*4 = 24 , i1 , i2 , i3  , i1*i2 = w1 .. w1*i3 = i0
        static ref THREE_FAC_WITNESS: Vec<FrElement> = vec![FrElement::from(1),FrElement::from(24),FrElement::from(2),FrElement::from(3),FrElement::from(4),FrElement::from(6)];



        //four factorization https://www.rareskills.io/post/rank-1-constraint-system#:~:text=are%20as%20follows-,Checking,-our%20work%20for

        static ref FOUR_FAC: R1CS = R1CS::from_matrices(
            vec![
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0)]

            ],
            vec![
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1)]
            ],
            vec![
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1)],
                vec![FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)]
            ],
            7,
        );
        static ref FOUR_FAC_WITNESS: Vec<FrElement> =  vec![FrElement::from(1),FrElement::from(1680),FrElement::from(5),FrElement::from(6),FrElement::from(7),FrElement::from(8),FrElement::from(30),FrElement::from(56)];

        // x^3 + y^3 = z^3 , doesnt have solution, just for fun :) . the only possible solution is zero vector :)
        // [1, x, y, z, w_1(x^2), w_2(y^2), w_3(z^2), w_4(w_1*x), w_5(w_2*y), w_6(w_3*z)]
        static ref CUBIC_FERMA_LAST_THEOREM: R1CS = R1CS::from_matrices(
            vec![
                vec![FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(1),FrElement::from(0)]
            ],
            vec![
                vec![FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                ],
            vec![
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0)],  
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0)],  
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0)],  
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1)],  
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1)],  
                ],
            9,
        );
        static ref CUBIC_FERMA_LAST_THEOREM_WITNESS: Vec<FrElement> = vec![FrElement::from(1),FrElement::from(2),-FrElement::from(2),FrElement::from(0),FrElement::from(4),FrElement::from(4),FrElement::from(0),FrElement::from(8),-FrElement::from(8),FrElement::from(0)];


        // x^3 + 2*x +7 = 19 for x = 2 
        // [1, x , t_1(x^2), t_2(t_1*x), t_3(2*x),t_4(t_2+t_3), t_5(t_4+7)]
        static ref CUBIC_EQUATION: R1CS = R1CS::from_matrices(
            vec![
                vec![FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(2),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(1),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0)],

            ],
            vec![
                vec![FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],

            ],
            vec![
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1),FrElement::from(0)],
                vec![FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(0),FrElement::from(1)],

            ],
            5,
        );

        static ref CUBIC_EQUATION_WITNESS: Vec<FrElement> = vec![FrElement::from(1),FrElement::from(2),FrElement::from(4),FrElement::from(8),FrElement::from(12),FrElement::from(19)];


    }
    
    
    #[test]
    fn test_subcircuit_manager() {
        let subcircuit_manager = SubcircuitManager::new(4, 7, 10, 
            vec![KEVIN_EXAMPLE.clone(),THREE_FAC_MOONMATH.clone(),FOUR_FAC.clone(),CUBIC_FERMA_LAST_THEOREM.clone()],
            );

        let (u,v,w) = subcircuit_manager.concatinate_subcircuits(&[0,1,2,3], &[KEVIN_WITNESS.clone(), THREE_FAC_WITNESS.clone(),FOUR_FAC_WITNESS.clone(),CUBIC_FERMA_LAST_THEOREM_WITNESS.clone()]).unwrap();
        
        let (pi_y, pi_x) = subcircuit_manager.generate_proof_polynomials(u, v, w);
        #[cfg(debug_assertions)]
        for row in pi_x.coefficients.axis_iter(Axis(0)) {
            println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
            // println!("{:?}","%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
        }

        #[cfg(debug_assertions)]
        println!("{:?}",pi_x.coefficients.dim());

        // (0..8).for_each(|d| { // Changed from [0..8].iter() to (0..8).for_each()
        //     #[cfg(debug_assertions)]
        //     println!("{:?}", subcircuit_manager.xi.pow(d as usize).representative());
        // });

        // (0..8).for_each(|d| { // Changed from [0..8].iter() to (0..8).for_each()
        //     #[cfg(debug_assertions)]
        //     println!("{:?}", subcircuit_manager.zeta.pow(d as usize).representative());
        // });

        


    }

    use ndarray::array;

    #[test]
    fn simple_poly_test() {
        // R => 
        // Can we try d=4, s=2 with U(X,Y)=V(X,Y)=X^(d-1)Y^(s-1) and W(X,Y)=X^(d-2)Y^(s-2)?
        let d: usize = 4 ; // d is max constraint
        let s: usize = 2; // number of ciruites
        // X^3 * y^1 

        let u =  BivariatePolynomial::new(array![
            [FrElement::from(0), FrElement::from(0), FrElement::from(0), FrElement::from(0)],
            [FrElement::from(0), FrElement::from(0), FrElement::from(0), FrElement::from(1)],
        ]);

        let v =  BivariatePolynomial::new(array![
            [FrElement::from(0), FrElement::from(0), FrElement::from(0), FrElement::from(0)],
            [FrElement::from(0), FrElement::from(0), FrElement::from(0), FrElement::from(1)], // x^3 * y^1
        ]);

        let w =BivariatePolynomial::new(array![
            [FrElement::from(0), FrElement::from(0), FrElement::from(1), FrElement::from(0)],// x^2 * y^0
            [FrElement::from(0), FrElement::from(0), FrElement::from(0), FrElement::from(0)], 
        ]);




        /////////////////////////////
        /// 
        /// 
        /// 
        /// 
        /// 
        // let s = u.x_degree;
        // let d = self.max_constraints;    
        let xi = FrElement::from(5);
        let zeta =  FrElement::from(2);


        let a_coset_y_evaluation = BivariatePolynomial::evaluate_offset_fft(&u, 1, 1, None, None, &FrElement::one() , &xi).unwrap();
        let b_coset_y_evaluation = BivariatePolynomial::evaluate_offset_fft(&v, 1, 1, None, None, &FrElement::one() , &xi).unwrap();
        let c_coset_y_evaluation = BivariatePolynomial::evaluate_offset_fft(&w, 1, 1, None, None, &FrElement::one() , &xi).unwrap();

        let w_copy =BivariatePolynomial::interpolate_offset_fft(&c_coset_y_evaluation,&FrElement::one(), &xi).unwrap();

        assert_eq!(w_copy,w);

         // xi^2 
        let mut r_coset_y_evaluation = (a_coset_y_evaluation * b_coset_y_evaluation) - c_coset_y_evaluation;

        let r_xy =  BivariatePolynomial::interpolate_offset_fft(&r_coset_y_evaluation, &FieldElement::one(), &xi).unwrap();
        
        #[cfg(debug_assertions)]
        for row in r_xy.coefficients.axis_iter(Axis(0)) {
            println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
            // println!("{:?}","%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
        }
        #[cfg(debug_assertions)]
        println!("{:?}", "R_XY");

    
        let divisor_inv_xi = (xi.pow(s) - FrElement::one()).inv().unwrap(); 
     

        r_coset_y_evaluation =  r_coset_y_evaluation.map_mut(|elem| elem.clone() * &divisor_inv_xi);

        




    
        let pi_y_poly = BivariatePolynomial::interpolate_offset_fft::<FrField>(&r_coset_y_evaluation, &FrElement::one(), &xi).unwrap();

        let pi_y_coefficients_negated = pi_y_poly.coefficients.mapv(|elem| -elem);

        //step 5 
        let remainder_poly_coefficients = concatenate(Axis(0), &[pi_y_coefficients_negated.view(), pi_y_poly.coefficients.view()]).unwrap();

        // #[cfg(debug_assertions)]
        // for row in remainder_poly_coefficients.axis_iter(Axis(0)) {
        //     println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
        // }
        // #[cfg(debug_assertions)]
        // println!("{:?}", "JAKE Debug");
        // #[cfg(debug_assertions)]
        // println!("{:?}", remainder_poly_coefficients.shape());

    


        let remainder_poly = BivariatePolynomial::new(remainder_poly_coefficients);

        let remainder_poly_evaluation = BivariatePolynomial::evaluate_offset_fft(&remainder_poly, 1, 1, None, None, &zeta, &FrElement::one()).unwrap();
        
        let d_coset_x_evaluation_x_zero_padded = BivariatePolynomial::evaluate_offset_fft(&u, 1, 2, None, None, &zeta, &FrElement::one()).unwrap();
        let e_coset_x_evaluation_x_zero_padded = BivariatePolynomial::evaluate_offset_fft(&v, 1, 2, None, None, &zeta, &FrElement::one()).unwrap();
        let f_coset_x_evaluation_x_zero_padded = BivariatePolynomial::evaluate_offset_fft(&w, 1, 2, None, None, &zeta, &FrElement::one()).unwrap();

        let ifft_d = BivariatePolynomial::interpolate_offset_fft(&d_coset_x_evaluation_x_zero_padded,&zeta, &FrElement::one()).unwrap();




        let mut q_coset_x_evaluation = (d_coset_x_evaluation_x_zero_padded * e_coset_x_evaluation_x_zero_padded) - f_coset_x_evaluation_x_zero_padded - remainder_poly_evaluation; 


        let divisor_inv_zeta = (zeta.pow(d) - FrElement::one()).inv().unwrap(); 
       
        q_coset_x_evaluation = q_coset_x_evaluation.map_mut(|elem| elem.clone() * &divisor_inv_zeta);
    
        let pi_x_poly= BivariatePolynomial::interpolate_offset_fft::<FrField>(&q_coset_x_evaluation, &zeta, &FrElement::one()).unwrap();


        #[cfg(debug_assertions)]
        for row in pi_x_poly.coefficients.axis_iter(Axis(0)) {
            println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
            // println!("{:?}","%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
        }
        #[cfg(debug_assertions)]
        println!("{:?}", "PI_X");


        #[cfg(debug_assertions)]
        for row in pi_y_poly.coefficients.axis_iter(Axis(0)) {
            println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
            // println!("{:?}","%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
        }

        // assert_eq!(pi_y_poly.coefficients.get((0,2)).unwrap(), &FrElement::one());
        #[cfg(debug_assertions)]
        println!("{:?}", "PI_Y");

        #[cfg(debug_assertions)]
        println!("{:?}", FrElement::one());


    } 

    #[test]
    fn test_mul() {
        let mut a = array![
            [FrElement::from(1), FrElement::from(2), FrElement::from(3), FrElement::from(4)],
            [FrElement::from(0), FrElement::from(0), FrElement::from(0), FrElement::from(1)],
        ];
        let b = array![
            [FrElement::from(3), FrElement::from(1), FrElement::from(1), FrElement::from(5)],
            [FrElement::from(1), FrElement::from(0), FrElement::from(0), FrElement::from(1)],
        ];
        // let a = a.map_mut(|elem| elem.clone() * &FrElement::from(2));


        // #[cfg(debug_assertions)]
        // for row in a.axis_iter(Axis(0)) {
        //     println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
        //     // println!("{:?}","%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
        // }

        let s:usize = 2 ; 
        let xi = FrElement::from(3);
        let zeta =  FrElement::from(2);

        let divisor_inv_xi = (xi.pow(s) - FrElement::one()).inv().unwrap(); 
        let r  = (xi.pow(s) - FrElement::one()) * divisor_inv_xi;
        
        #[cfg(debug_assertions)]
        println!("{:?}", r);
        #[cfg(debug_assertions)]
        println!("{:?}", FrElement::from(1));
        #[cfg(debug_assertions)]
        println!("{:?}", a.get((0,0)));

        assert_eq!(*a.get((0,0)).unwrap() , FrElement::from(1));

        #[cfg(debug_assertions)]
        println!("{:?}", "What??");

        assert_eq!(r , FrElement::from(1))

    }



    #[test]
    fn simple_poly_test_another() {
        // R => 
        // Can we try d=4, s=2 with U(X,Y)=V(X,Y)=X^(d-1)Y^(s-1) and W(X,Y)=X^(d-2)Y^(s-2)?
        let d: usize = 8 ; // d is max constraint
        let s: usize = 4; // number of ciruites
        // X^3 * y^1 
        // 
        let m = array![
            [FrElement::from(1), FrElement::from(2), FrElement::from(3), FrElement::from(4),FrElement::from(7), FrElement::from(2), FrElement::from(3), FrElement::from(4)],
            [FrElement::from(6), FrElement::from(8), FrElement::from(3), FrElement::from(1),FrElement::from(5), FrElement::from(4), FrElement::from(1), FrElement::from(2)],
            [FrElement::from(9), FrElement::from(8), FrElement::from(3), FrElement::from(6),FrElement::from(1), FrElement::from(3), FrElement::from(4), FrElement::from(4)],
            [FrElement::from(4), FrElement::from(3), FrElement::from(2), FrElement::from(1),FrElement::from(7), FrElement::from(2), FrElement::from(3), FrElement::from(4)],

        ];

        let n = array![
            [FrElement::from(9), FrElement::from(2), FrElement::from(5), FrElement::from(4),FrElement::from(7), FrElement::from(2), FrElement::from(3), FrElement::from(4)],
            [FrElement::from(4), FrElement::from(3), FrElement::from(3), FrElement::from(1),FrElement::from(6), FrElement::from(3), FrElement::from(2), FrElement::from(9)],
            [FrElement::from(3), FrElement::from(3), FrElement::from(2), FrElement::from(4),FrElement::from(4), FrElement::from(2), FrElement::from(3), FrElement::from(4)],
            [FrElement::from(4), FrElement::from(5), FrElement::from(7), FrElement::from(1),FrElement::from(8), FrElement::from(2), FrElement::from(7), FrElement::from(9)],
        ];

        let o =  array![
            [FrElement::from(9), FrElement::from(4), FrElement::from(15), FrElement::from(16),FrElement::from(49), FrElement::from(4), FrElement::from(9), FrElement::from(16)],
            [FrElement::from(24), FrElement::from(24), FrElement::from(9), FrElement::from(1),FrElement::from(30), FrElement::from(12), FrElement::from(2), FrElement::from(18)],
            [FrElement::from(27), FrElement::from(24), FrElement::from(6), FrElement::from(24),FrElement::from(4), FrElement::from(6), FrElement::from(12), FrElement::from(16)],
            [FrElement::from(16), FrElement::from(15), FrElement::from(14), FrElement::from(1),FrElement::from(56), FrElement::from(4), FrElement::from(21), FrElement::from(36)],
        ];

        let u =BivariatePolynomial::interpolate_fft::<FrField>(&m).unwrap();
        let v =BivariatePolynomial::interpolate_fft::<FrField>(&n).unwrap();
        let w =BivariatePolynomial::interpolate_fft::<FrField>(&o).unwrap();


        // #[cfg(debug_assertions)]
        // for row in v.coefficients.axis_iter(Axis(0)) {
        //     println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
        //     // println!("{:?}","%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
        // }


        /////////////////////////////
        /// 
        /// 
        /// 
        /// 
        /// 
        // let s = u.x_degree;
        // let d = self.max_constraints;    
        let xi = FrElement::from(5);
        let zeta =  FrElement::from(2);


        let a_coset_y_evaluation = BivariatePolynomial::evaluate_offset_fft(&u, 1, 1, None, None, &FrElement::one() , &xi).unwrap();
        let b_coset_y_evaluation = BivariatePolynomial::evaluate_offset_fft(&v, 1, 1, None, None, &FrElement::one() , &xi).unwrap();
        let c_coset_y_evaluation = BivariatePolynomial::evaluate_offset_fft(&w, 1, 1, None, None, &FrElement::one() , &xi).unwrap();

        let w_copy =BivariatePolynomial::interpolate_offset_fft(&c_coset_y_evaluation,&FrElement::one(), &xi).unwrap();

        assert_eq!(w_copy,w);

         // xi^2 
        let mut r_coset_y_evaluation = (a_coset_y_evaluation * b_coset_y_evaluation) - c_coset_y_evaluation;

        let r_xy =  BivariatePolynomial::interpolate_offset_fft(&r_coset_y_evaluation, &FieldElement::one(), &xi).unwrap();
        
        #[cfg(debug_assertions)]
        for row in r_xy.coefficients.axis_iter(Axis(0)) {
            println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
            // println!("{:?}","%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
        }
        #[cfg(debug_assertions)]
        println!("{:?}", "R_XY");

    
        let divisor_inv_xi = (xi.pow(s) - FrElement::one()).inv().unwrap(); 
     

        r_coset_y_evaluation =  r_coset_y_evaluation.map_mut(|elem| elem.clone() * &divisor_inv_xi);

        




    
        let pi_y_poly = BivariatePolynomial::interpolate_offset_fft::<FrField>(&r_coset_y_evaluation, &FrElement::one(), &xi).unwrap();

        let pi_y_coefficients_negated = pi_y_poly.coefficients.mapv(|elem| -elem);

        //step 5 
        let remainder_poly_coefficients = concatenate(Axis(0), &[pi_y_coefficients_negated.view(), pi_y_poly.coefficients.view()]).unwrap();

        // #[cfg(debug_assertions)]
        // for row in remainder_poly_coefficients.axis_iter(Axis(0)) {
        //     println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
        // }
        // #[cfg(debug_assertions)]
        // println!("{:?}", "JAKE Debug");
        // #[cfg(debug_assertions)]
        // println!("{:?}", remainder_poly_coefficients.shape());

    


        let remainder_poly = BivariatePolynomial::new(remainder_poly_coefficients);

        let remainder_poly_evaluation = BivariatePolynomial::evaluate_offset_fft(&remainder_poly, 1, 1, None, None, &zeta, &FrElement::one()).unwrap();
        
        let d_coset_x_evaluation_x_zero_padded = BivariatePolynomial::evaluate_offset_fft(&u, 1, 2, None, None, &zeta, &FrElement::one()).unwrap();
        let e_coset_x_evaluation_x_zero_padded = BivariatePolynomial::evaluate_offset_fft(&v, 1, 2, None, None, &zeta, &FrElement::one()).unwrap();
        let f_coset_x_evaluation_x_zero_padded = BivariatePolynomial::evaluate_offset_fft(&w, 1, 2, None, None, &zeta, &FrElement::one()).unwrap();

        let ifft_d = BivariatePolynomial::interpolate_offset_fft(&d_coset_x_evaluation_x_zero_padded,&zeta, &FrElement::one()).unwrap();




        let mut q_coset_x_evaluation = (d_coset_x_evaluation_x_zero_padded * e_coset_x_evaluation_x_zero_padded) - f_coset_x_evaluation_x_zero_padded - remainder_poly_evaluation; 


        let divisor_inv_zeta = (zeta.pow(d) - FrElement::one()).inv().unwrap(); 
       
        q_coset_x_evaluation = q_coset_x_evaluation.map_mut(|elem| elem.clone() * &divisor_inv_zeta);
    
        let pi_x_poly= BivariatePolynomial::interpolate_offset_fft::<FrField>(&q_coset_x_evaluation, &zeta, &FrElement::one()).unwrap();


        #[cfg(debug_assertions)]
        for row in pi_x_poly.coefficients.axis_iter(Axis(0)) {
            println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
            // println!("{:?}","%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
        }
        #[cfg(debug_assertions)]
        println!("{:?}", "PI_X");


        #[cfg(debug_assertions)]
        for row in pi_y_poly.coefficients.axis_iter(Axis(0)) {
            println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
            // println!("{:?}","%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
        }

        // assert_eq!(pi_y_poly.coefficients.get((0,2)).unwrap(), &FrElement::one());
        #[cfg(debug_assertions)]
        println!("{:?}", "PI_Y");

        #[cfg(debug_assertions)]
        println!("{:?}", FrElement::one());


    } 


    

    
}