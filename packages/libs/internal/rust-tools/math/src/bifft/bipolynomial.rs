use core::{default, result};

use lambdaworks_math::fft::errors::FFTError;
use lambdaworks_math::fft::polynomial::{evaluate_fft_cpu, interpolate_fft_cpu};
use lambdaworks_math::field::element::FieldElement;
use lambdaworks_math::field::traits::{IsFFTField, IsField, IsSubFieldOf};
use lambdaworks_math::polynomial::Polynomial;
use ndarray::{Array2, concatenate, Axis};
use num_traits::zero;

use crate::bipolynomial::BivariatePolynomial;
// Change the naming ??? 
impl<E: IsField> BivariatePolynomial<FieldElement<E>> {
    /// Returns `N*M` evaluations of this polynomial using FFT over a domain in a subfield F of E (so the results
    /// are P(w^i), with w being a primitive root of unity).
    /// `N = max(self.coeff_len(), domain_x_size).next_power_of_two() * x_blowup_factor`.
    /// If `domain_x_size` or `domain_y_size` is `None`, it defaults to 0.
    pub fn evaluate_fft<F: IsFFTField + IsSubFieldOf<E>>(
        bipoly: &BivariatePolynomial<FieldElement<E>>,
        x_blowup_factor: usize,
        y_blowup_factor: usize,
        domain_x_size: Option<usize>,
        domain_y_size: Option<usize>,
    ) -> Result<Array2<FieldElement<E>>, FFTError> {
        let domain_x_size = domain_x_size.unwrap_or(0);
        let domain_y_size = domain_y_size.unwrap_or(0);

        let len_x =
            core::cmp::max(bipoly.x_degree, domain_x_size).next_power_of_two() * x_blowup_factor;
        let len_y =
            core::cmp::max(bipoly.y_degree, domain_y_size).next_power_of_two() * y_blowup_factor;

        // Initialize the coefficients array with zeros and copy the polynomial's coefficients
        let mut coeffs = Array2::<FieldElement<E>>::from_elem((len_y, len_x), FieldElement::zero());
        for (i, row) in bipoly.coefficients.axis_iter(Axis(0)).enumerate() {
            for (j, coeff) in row.iter().enumerate() {
                coeffs[(i, j)] = coeff.clone();
            }
        }

        // Perform FFT row-wise
        for mut row in coeffs.axis_iter_mut(Axis(1)) {
            let fft_result = evaluate_fft_cpu::<F, E>(&row.to_vec())?;
            row.assign(&ndarray::Array1::from(fft_result));
        }

        // Transpose the array to perform FFT column-wise
        let mut transposed_coeffs = coeffs.reversed_axes();

        // Perform FFT column-wise
        for mut col in transposed_coeffs.axis_iter_mut(Axis(1)) {
            let fft_result = evaluate_fft_cpu::<F, E>(&col.to_vec())?;
            col.assign(&ndarray::Array1::from(fft_result));
        }

        // Transpose back to the original orientation
        let final_coeffs = transposed_coeffs.reversed_axes();

        Ok(final_coeffs)
    }

    // TODO :: if we import bipoly as mutable we can call scale_in_place which is more efficient that this one. // k.w^0 , .. . 
    pub fn evaluate_offset_fft<F: IsFFTField + IsSubFieldOf<E>>(
        bipoly: &BivariatePolynomial<FieldElement<E>>,
        x_blowup_factor: usize,
        y_blowup_factor: usize,
        domain_x_size: Option<usize>, 
        domain_y_size: Option<usize>,
        offset_x: &FieldElement<F>,
        offset_y: &FieldElement<F>,
    ) -> Result<Array2<FieldElement<E>>, FFTError> {
        let scaled = bipoly.scale(offset_x,offset_y);
        // change the root ζ 
        BivariatePolynomial::evaluate_fft::<F>(&scaled, x_blowup_factor, y_blowup_factor, domain_x_size, domain_y_size)
    }

    pub fn interpolate_fft<F: IsFFTField + IsSubFieldOf<E>>(
        fft_evals: &Array2<FieldElement<E>>,
    ) -> Result<Self, FFTError> {
        let len_y = fft_evals.nrows();
        let len_x = fft_evals.ncols();

        // Create an Array2 for the x inverse FFT results
        let mut x_ifft = Array2::<FieldElement<E>>::default((len_y, len_x));

        // Perform IFFT for each row
        for (i, val) in fft_evals.axis_iter(Axis(0)).enumerate() {
            let dd = &val.to_vec();
            // have to change this with customized version of interpolate_fft_cpu 
            let mut result_poly = interpolate_fft_cpu::<F, E>(dd)?;
            result_poly.coefficients.resize(len_x, FieldElement::zero());
            x_ifft
                .row_mut(i)
                .assign(&ndarray::Array1::from(result_poly.coefficients));
        }

        // Transpose x_ifft to prepare for the y IFFT
        let transposed_x_fft = x_ifft.reversed_axes();

        // Create an Array2 for the y inverse FFT results
        let mut y_ifft = Array2::<FieldElement<E>>::default((len_x, len_y));

        // Perform IFFT for each transposed row
        for (i, val) in transposed_x_fft.axis_iter(Axis(0)).enumerate() {
            let mut result_poly = interpolate_fft_cpu::<F, E>(&val.to_vec())?;
            result_poly.coefficients.resize(len_y, FieldElement::zero());
            y_ifft
                .row_mut(i)
                .assign(&ndarray::Array1::from(result_poly.coefficients));
        }

        // Transpose back to the original orientation
        let final_coeffs = y_ifft.reversed_axes();

        Ok(BivariatePolynomial::new(final_coeffs))
    }

    // TODO :: if we import bipoly as mutable we can call scale_in_place which is more efficient that this one. // k.w^0 , .. . 
    pub fn interpolate_offset_fft<F: IsFFTField + IsSubFieldOf<E>>(
        fft_evals: &Array2<FieldElement<E>>,
        offset_x: &FieldElement<F>,
        offset_y: &FieldElement<F>,
    ) -> Result<Self, FFTError> {
        let dd = BivariatePolynomial::interpolate_fft::<F>(fft_evals)?; // scaled 
        let xx = dd.scale(&offset_x.inv().unwrap(),&offset_y.inv().unwrap());
        Ok(xx)
       // Ok(scaled.scale(&offset_x.inv().unwrap(),&offset_y.inv().unwrap()))

    }

    // this polynomial division is gonna calculate division algorithm for p(x,y) 
    // t_𝑌 (𝑌 ) ∶= 𝑌 𝑐 − 1
    pub fn coset_division<F: IsFFTField + IsSubFieldOf<E>>(
        bipoly: &BivariatePolynomial<FieldElement<E>>,
        degree_x :usize,
        degree_y :usize) -> Result<(Self,Self), FFTError> {
        // first check the dimension of polynomial is factor of degree_x and degree_y 
        
        // if bipoly degree is not 
        
        
        assert_eq!(bipoly.x_degree % degree_x, 0 ); 
        assert_eq!(bipoly.y_degree % degree_y, 0 ); 
        

        let m = bipoly.x_degree / degree_x; 
        let n = bipoly.y_degree / degree_y; 

        let xi: FieldElement<F> = FieldElement::from(3);
        let zeta: FieldElement<F> = FieldElement::from(5);

        match (m, n) {
            (2, 2) => {

                
                let mut a_prim_coeffs =  Array2::<FieldElement<E>>::default((degree_y, degree_x));

                for i in 0..degree_y {
                    for j in 0..degree_x {
                        let mut segment_sum = FieldElement::<E>::zero();
                        for y in 0..n {
                            for x in 0..m {
                                segment_sum = segment_sum + xi.pow(y * degree_y) * bipoly.coefficients.get((y * degree_y + i , x * degree_x + j)).unwrap_or(&FieldElement::<E>::zero());
                            }
                        }
                        a_prim_coeffs[(i,j)] = segment_sum;
                    }
                }
                let a_prim = BivariatePolynomial::new(a_prim_coeffs);
                let mut r_tilde_evals = BivariatePolynomial::evaluate_offset_fft::<F>(&a_prim, 1, 1, None, None, &FieldElement::<F>::one(), &xi).unwrap();

                let divisor_inv_xi = (xi.pow(degree_y ) - FieldElement::<E>::one()).inv().unwrap(); 
                
                r_tilde_evals = r_tilde_evals.map_mut(|elem| elem.clone() * &divisor_inv_xi);
                let q_tilde_evals = r_tilde_evals; 

                let q_z = BivariatePolynomial::interpolate_offset_fft(&q_tilde_evals, &FieldElement::<F>::one(), &xi).unwrap();

                let q_z_negated_coeffs = q_z.coefficients.mapv(|elem| -elem);
                
                let remainder_poly_coefficients = concatenate(Axis(0), &[q_z_negated_coeffs.view(), q_z.coefficients.view()]).unwrap();
                
                let remainder_poly = BivariatePolynomial::new(remainder_poly_coefficients);

                let b = bipoly - &remainder_poly;

                let mut b_prim_coeffs = Array2::<FieldElement<E>>::default((n * degree_y, degree_x));

                for i in 0..n * degree_y {
                    for j in 0..degree_x {
                        let mut segment_sum = FieldElement::<E>::zero();
                        for x in 0..m {
                            segment_sum = segment_sum + zeta.pow(x * degree_x) * b.coefficients.get((i, x * degree_x + j )).unwrap();
                        }
                        b_prim_coeffs[(i,j)] = segment_sum;
                    }
                }

                let b_prim = BivariatePolynomial::new(b_prim_coeffs); 
                
                let mut q_x_tilde_evals = BivariatePolynomial::evaluate_offset_fft(&b_prim, 1, 1, None, None, &zeta, &FieldElement::<F>::one()).unwrap();

                let divisor_inv_zeta = (zeta.pow(degree_x ) - FieldElement::<E>::one()).inv().unwrap(); 
                
                q_x_tilde_evals = q_x_tilde_evals.map_mut(|elem| elem.clone() * &divisor_inv_zeta);

                let q_x = BivariatePolynomial::interpolate_offset_fft(&q_x_tilde_evals, &zeta, &FieldElement::<F>::one()).unwrap();
                Ok((q_z, q_x))
            },
            (2, n) if n > 2 => {
                // Do something else when m is 2 and n is greater than 2

                let mut a_prim_coeffs =  Array2::<FieldElement<E>>::default((n * degree_y, degree_x));
              
                for i in 0..n * degree_y {
                    for j in 0..degree_x {
                        let mut segment_sum = FieldElement::<E>::zero();
                        for x in 0..m {
                            segment_sum = segment_sum + bipoly.coefficients.get((i, x * degree_x + j )).unwrap();
                        }
                        a_prim_coeffs[(i,j)] = segment_sum;
                    }
                }

                let a_prim = BivariatePolynomial::new(a_prim_coeffs);

                let mut r_tilde_evals = BivariatePolynomial::evaluate_offset_fft::<F>(&a_prim, 1, 1, None, None, &FieldElement::<F>::one(), &xi).unwrap();

                // let mut t_z_coeffs =  Array2::<FieldElement<E>>::default((n * degree_y, degree_x));
                // t_z_coeffs[(0,0)] = -FieldElement::<E>::one();
                // t_z_coeffs[(degree_y, 0)] = FieldElement::<E>::one();

                let tz = Polynomial::new_monomial(FieldElement::<E>::one(), degree_y) - FieldElement::<E>::one();
                let tz_evals = Polynomial::evaluate_offset_fft(&tz, 1, Some(n*degree_y), &xi).unwrap();
                
                
                for (i, mut row) in r_tilde_evals.outer_iter_mut().enumerate() {
                    let tz_eval_inv = &tz_evals[i].inv().unwrap();
                    for elem in row.iter_mut() {
                        *elem = elem.clone() * tz_eval_inv;
                    }
                }

                let q_z_tilde_eval =  r_tilde_evals; 


                let q_z = BivariatePolynomial::interpolate_offset_fft(&q_z_tilde_eval, &FieldElement::<F>::one(),&xi).unwrap();

                let mut t_z_2d_coeffs = Array2::<FieldElement<E>>::default((n * degree_y, degree_x));
                t_z_2d_coeffs[(degree_y, 0)] = FieldElement::<E>::one();
                t_z_2d_coeffs[(0, 0)] = -FieldElement::<E>::one();

                let t_z_2d = BivariatePolynomial::new(t_z_2d_coeffs);

                let r = BivariatePolynomial::poly_multiply::<F>(&q_z, &t_z_2d, m * degree_x, n * degree_y).unwrap();


                let b = bipoly - &r ; 
                
                let mut b_prim_coeffs = Array2::<FieldElement<E>>::default((n * degree_y, degree_x));

                for i in 0..n * degree_y {
                    for j in 0..degree_x {
                        let mut segment_sum = FieldElement::<E>::zero();
                        for x in 0..m {
                            segment_sum = segment_sum + zeta.pow(x * degree_x) * b.coefficients.get((i, x * degree_x + j )).unwrap();
                        }
                        b_prim_coeffs[(i,j)] = segment_sum;
                    }
                }

                let b_prim = BivariatePolynomial::new(b_prim_coeffs); 

                let mut q_x_tilde_evals = BivariatePolynomial::evaluate_offset_fft(&b_prim, 1, 1, None, None, &zeta, &FieldElement::<F>::one()).unwrap();
                let divisor_inv_zeta = (zeta.pow(degree_x ) - FieldElement::<E>::one()).inv().unwrap(); 
                
                q_x_tilde_evals = q_x_tilde_evals.map_mut(|elem| elem.clone() * &divisor_inv_zeta);

                let q_x = BivariatePolynomial::interpolate_offset_fft(&q_x_tilde_evals, &zeta, &FieldElement::<F>::one()).unwrap();

                Ok((q_z, q_x))

            },
            _ => {
                // Handle other cases if necessary

                todo!()
            }
        }

        // todo!() 
    }
    pub fn poly_multiply<F: IsFFTField + IsSubFieldOf<E>>(
        a: &BivariatePolynomial<FieldElement<E>>,
        b :&BivariatePolynomial<FieldElement<E>>,
        result_x_dim :usize,
        result_y_dim :usize,
    ) -> Result<Self, FFTError> {
        let a_evals = BivariatePolynomial::evaluate_fft::<F>(&a, 1, 1, Some(result_x_dim), Some(result_y_dim)).unwrap();
        let b_evals = BivariatePolynomial::evaluate_fft::<F>(&b, 1, 1, Some(result_x_dim), Some(result_y_dim)).unwrap();

        let c_evals = a_evals * b_evals ; 

        BivariatePolynomial::interpolate_fft::<F>(&c_evals)
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use lambdaworks_math::field::element::FieldElement;
    use lambdaworks_math::field::{
        test_fields::u64_test_field::{U64TestField, U64TestFieldExtension},
        traits::RootsConfig,
    };
    use ndarray::{array, Array, Array1};

    use lambdaworks_math::fft::cpu::roots_of_unity::{get_powers_of_primitive_root, get_powers_of_primitive_root_coset};

    fn gen_fft_and_naive_evaluation<F: IsFFTField>(
        poly: BivariatePolynomial<FieldElement<F>>,
    ) -> (Array2<FieldElement<F>>, Array2<FieldElement<F>>) {
        let len_x = poly.x_degree.next_power_of_two();
        let order_x = len_x.trailing_zeros();

        let len_y = poly.y_degree.next_power_of_two();
        let order_y = len_y.trailing_zeros();

        let twiddles_x =
            get_powers_of_primitive_root(order_x.into(), len_x, RootsConfig::Natural).unwrap();
        let twiddles_y= 
            get_powers_of_primitive_root(order_y.into(), len_y, RootsConfig::Natural).unwrap();
        
        // let twiddles_y_array = Array1::from_ve
        // Array2::mapv(&self, f)
        // [(x_0, y_0) , (x_1,y_0)] ... mapv 
        let fft_eval = BivariatePolynomial::evaluate_fft::<F>(&poly, 1,1,None, None).unwrap();
        // let naive_eval = poly.evaluate_slice(&twiddles);




        let naive_eval_vec = twiddles_y
            .iter()
            .map(|y_val| {
                twiddles_x.iter().map(|x_val| poly.evaluate(x_val, y_val)).collect::<Vec<_>>()
            })
            .collect::<Vec<_>>();

        let naive_eval: ndarray::ArrayBase<ndarray::OwnedRepr<FieldElement<F>>, ndarray::Dim<[usize; 2]>> = Array2::from_shape_vec((twiddles_y.len(), twiddles_x.len()), naive_eval_vec.into_iter().flatten().collect()).unwrap();

        (fft_eval, naive_eval)
    }


    mod u64_field_tests {
        use super::*;
        use lambdaworks_math::{fft, field::test_fields::u64_test_field::U64TestField, msm::naive};

        // FFT related tests
        type F = U64TestField;
        type FE = FieldElement<F>;

        // 3 + x + 2x*y + x^2*y + 4x*y^2
        // because we lexicography order is based on y and x the vector should represent like this
        // ( 3 + 1 + 0 ) , ( 0 , 2 , 1) , (0 , 4 , 0)
        fn polynomial_a() -> BivariatePolynomial<FE> {
            BivariatePolynomial::new(array![
                [FE::new(3), FE::new(1), FE::new(0)],
                [FE::new(0), FE::new(2), FE::new(1)],
                [FE::new(0), FE::new(4), FE::new(0)],
            ])
        }

            // 1 + 2x + 3y + 4xy
        fn polynomial_b() -> BivariatePolynomial<FE> {
            BivariatePolynomial::new(array![
                [FE::new(1), FE::new(2), FE::new(0)],
                [FE::new(3), FE::new(4), FE::new(0)],
                [FE::new(0), FE::new(0), FE::new(0)],
            ])
        }

        fn polynomial_j() -> BivariatePolynomial<FE> {
            BivariatePolynomial::new(array![
                [FE::new(1), FE::new(2), FE::new(0),FE::new(1)],
                [FE::new(3), FE::new(4), FE::new(5),FE::new(7)],
            ])
        }


        #[test]
        fn test_evaluation_fft_with_naive_evaluation(){
            let a_poly = polynomial_a();
            // let evals = BivariatePolynomial::evaluate_fft::<F>(&a_poly, 1, 1, None, None);
            let (fft_eval, naive_eval) = gen_fft_and_naive_evaluation(a_poly);
            let mut naive_copy = naive_eval.clone();
            // naive_copy[[0, 0]] = FE::one();

            #[cfg(debug_assertions)]
            for row in naive_copy.axis_iter(Axis(0)) {
                println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
                // println!("{:?}","%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
            }
            #[cfg(debug_assertions)]
            println!("{:?}", "SEPARATOR NAIVE");
            #[cfg(debug_assertions)]
            for row in fft_eval.axis_iter(Axis(0)) {
                println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
                // println!("{:?}","%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
            }
            #[cfg(debug_assertions)]
            println!("{:?}", "SEPARATOR FFT");


            assert_eq!(fft_eval, naive_copy);

            let a_poly_interpolate = BivariatePolynomial::interpolate_fft::<F>(&fft_eval).unwrap();
            let poly_a_zero_pad = BivariatePolynomial::new(array![
                [FE::new(3), FE::new(1), FE::new(0), FE::new(0)],
                [FE::new(0), FE::new(2), FE::new(1), FE::new(0)],
                [FE::new(0), FE::new(4), FE::new(0), FE::new(0)],
                [FE::new(0), FE::new(0), FE::new(0), FE::new(0)]
            ]);

            assert_eq!(poly_a_zero_pad, a_poly_interpolate);

        }

        #[test]
        fn test_multiply_bivariates() {
            let a_times_b = BivariatePolynomial::new(array![
                [FE::new(3), FE::new(7), FE::new(2), FE::new(0)],
                [FE::new(9), FE::new(17), FE::new(9), FE::new(2)],
                [FE::new(0), FE::new(10), FE::new(19), FE::new(4)],
                [FE::new(0), FE::new(12), FE::new(16), FE::new(0)]
            ]); 
            
            let a_evals =  BivariatePolynomial::evaluate_fft::<F>(&polynomial_a(), 1, 1, Some(4), Some(4)).unwrap();
            
            let b_evals = BivariatePolynomial::evaluate_fft::<F>(&polynomial_b(), 1, 1,  Some(4), Some(4)).unwrap();

            let mul_eval = a_evals * b_evals ;

            let mul_poly = BivariatePolynomial::interpolate_fft::<F>(&mul_eval).unwrap();
            
            assert_eq!(mul_poly, a_times_b);

            let a_times_b_zero_pad = BivariatePolynomial::new(array![
                [FE::new(3), FE::new(7), FE::new(2), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0)],
                [FE::new(9), FE::new(17), FE::new(9), FE::new(2), FE::new(0), FE::new(0), FE::new(0), FE::new(0)],
                [FE::new(0), FE::new(10), FE::new(19), FE::new(4), FE::new(0), FE::new(0), FE::new(0), FE::new(0)],
                [FE::new(0), FE::new(12), FE::new(16), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0)],
                [FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0)],
                [FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0)],
                [FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0)],
                [FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0)],

            ]); 
            let a_evals_zero_pad =  BivariatePolynomial::evaluate_fft::<F>(&polynomial_a(), 1, 1, Some(8), Some(8)).unwrap();
            
            let b_evals_zero_pad = BivariatePolynomial::evaluate_fft::<F>(&polynomial_b(), 1, 1,  Some(8), Some(8)).unwrap();
                
            let mul_eval_zero_pad = a_evals_zero_pad * b_evals_zero_pad; 
            
            let mul_poly = BivariatePolynomial::interpolate_fft::<F>(&mul_eval_zero_pad).unwrap();
            
            assert_eq!(mul_poly, a_times_b_zero_pad);

                
        }

        #[test]
        fn test_fft_ifft_is_determenistic(){
            
            let fft_coset_eval = BivariatePolynomial::evaluate_offset_fft::<F>(&polynomial_j(), 1, 1, None, None, &FE::new(3), &FE::new(2)).unwrap();
            
            let poly_a_after_fft_ifft= BivariatePolynomial::interpolate_offset_fft(&fft_coset_eval,  &FE::new(3), &FE::new(2)).unwrap();
            
            #[cfg(debug_assertions)]
            for row in poly_a_after_fft_ifft.coefficients.axis_iter(Axis(0)) {
                println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
                // println!("{:?}","%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
            }
            

            #[cfg(debug_assertions)]
            for row in polynomial_j().coefficients.axis_iter(Axis(0)) {
                println!("{:?}", row.iter().map(|element| element.representative()).collect::<Vec<_>>());
                // println!("{:?}","%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
            }
    


            assert_eq!(polynomial_j(), poly_a_after_fft_ifft);
        }
        
        #[test]
        fn test_coset_division() {

            // 4 x^3 y^4 + 2 x^3 y^3 + 4 x^3 y + 2 x^3 + 3 x^2 y^3 + x^2 y^2 + 3 x^2 y + x^2 - 4 x y^4 - 2 x y^3 - 4 x y - 2 x - 3 y^3 - y^2 - 3 y - 1

            use lambdaworks_math::field::fields::u64_prime_field::{FE17,F17};
            // (x^4 - 1) (x^2 y + 4 x y^2 + 2 x y + x + 3) is equal to 
            // x^6 y + 4 x^5 y^2 + 2 x^5 y + x^5 + 3 x^4 - x^2 y - 4 x y^2 - 2 x y - x - 3 
            // x^6 y + 4 x^5 y^2 + 2 x^5 y + x^5 + 3 x^4 - x^2 y - 4 x y^2 - 2 x y - x - 3  => degree 6,2
            // (-3 , -1 , 0, 0, 3 , 1 ), (0 , -2, -1, 0 ,0 , 2, 1), (0 , -4, 0,0,0, 4)
            let r_x_m2_n2 = BivariatePolynomial::new(array![
                [-FE17::new(3), -FE17::new(1),  FE17::new(0), FE17::new(0), FE17::new(3), FE17::new(1), FE17::new(0), FE17::new(0)],
                [ FE17::new(0), -FE17::new(2), -FE17::new(1), FE17::new(0), FE17::new(0), FE17::new(2), FE17::new(1), FE17::new(0)],
                [ FE17::new(0), -FE17::new(4),  FE17::new(0), FE17::new(0), FE17::new(0), FE17::new(4), FE17::new(0), FE17::new(0)],
                [ FE17::new(0),  FE17::new(0),  FE17::new(0), FE17::new(0), FE17::new(0), FE17::new(0), FE17::new(0), FE17::new(0)],
            ]);
            // println!("{:?}" , q_x_poly.polynomial_dimension());
            // println!("{}" , q_x_poly);


            // 4 x y^3 + 2 x y^2 - 4 x y - 2 x + 3 y^3 + y^2 - 3 y - 1
            // (1 + 2x + 3y + 4xy) (y^2-1)
            // (-1, -2 , 0 ) , (-3, -4, 0) , (1 , 2 , 0), (3, 4, 0)
            // Simplified: 4 x y^3 - 4 x y + 2 x + 3 y + 1 = (1 + 2x + 3y + 4xy) (y^2-1)
            let r_y_m2_n2 = BivariatePolynomial::new(array![
                [-FE17::new(1),  -FE17::new(2), FE17::new(0), FE17::new(0)],
                [-FE17::new(3),  -FE17::new(4), FE17::new(0), FE17::new(0)],
                [ FE17::new(1),   FE17::new(2), FE17::new(0), FE17::new(0)],
                [ FE17::new(3),   FE17::new(4), FE17::new(0), FE17::new(0)],
            ]);


            let p = &r_x_m2_n2 + &r_y_m2_n2; 

            let (q_y, q_x) = BivariatePolynomial::coset_division::<F17>(&p, 4, 2).unwrap();

            
            // 3 + X + 2*X*Y + X^2*Y + 4*X*Y^2
            // x^2 y + 4 x y^2 + 2 x y + x + 3
            let q_x_expected = BivariatePolynomial::new(array![
                [FE17::new(3), FE17::new(1), FE17::new(0), FE17::new(0)],
                [FE17::new(0), FE17::new(2), FE17::new(1), FE17::new(0)],
                [FE17::new(0), FE17::new(4), FE17::new(0), FE17::new(0)],
                [FE17::new(0), FE17::new(0), FE17::new(0), FE17::new(0)],

            ]);
            // println!("{}", q_x_expected);
            assert_eq!(q_x_expected, q_x);



            // (1 + 2x + 3y + 4xy)
            let q_y_expected = BivariatePolynomial::new(array![
                [FE17::new(1), FE17::new(2), FE17::new(0), FE17::new(0)],
                [FE17::new(3), FE17::new(4), FE17::new(0), FE17::new(0)],
            ]);
            assert_eq!(q_y_expected, q_y );


            // n>2 . m=2 

            // 4 x y^6 + 2 x y^5 + 3 y^5 - 4 x y^4 + y^4 + 2 x y^3 + 2 x y^2 - 4 x y - 3 y - 2 x - 1
            // (1 + 2x + 3y + 4xy + y² + 2xy³ + 3y³ + 4xy⁴ ) (y^2 -1)
            let r_y_m2_n_greater_than_2 = BivariatePolynomial::new(array![
                [-FE17::new(1),  -FE17::new(2), FE17::new(0), FE17::new(0)],
                [-FE17::new(3),  -FE17::new(4), FE17::new(0), FE17::new(0)],
                [ FE17::new(0),   FE17::new(2), FE17::new(0), FE17::new(0)],
                [ FE17::new(0),   FE17::new(2), FE17::new(0), FE17::new(0)],
                [ FE17::new(1),  -FE17::new(4), FE17::new(0), FE17::new(0)],
                [ FE17::new(3),   FE17::new(2), FE17::new(0), FE17::new(0)],
                [ FE17::new(0),   FE17::new(4), FE17::new(0), FE17::new(0)],
                [ FE17::new(0),   FE17::new(0), FE17::new(0), FE17::new(0)],

            ]);


            
            let p = &r_x_m2_n2 + &r_y_m2_n_greater_than_2;

            let (q_y , q_x)= BivariatePolynomial::coset_division::<F17>(&p, 4, 2).unwrap();

            // 3 + X + 2*X*Y + X^2*Y + 4*X*Y^2
            // x^2 y + 4 x y^2 + 2 x y + x + 3
            let q_x_expected = BivariatePolynomial::new(array![
                [FE17::new(3), FE17::new(1), FE17::new(0), FE17::new(0)],
                [FE17::new(0), FE17::new(2), FE17::new(1), FE17::new(0)],
                [FE17::new(0), FE17::new(4), FE17::new(0), FE17::new(0)],
                [FE17::new(0), FE17::new(0), FE17::new(0), FE17::new(0)],
                [FE17::new(0), FE17::new(0), FE17::new(0), FE17::new(0)],
                [FE17::new(0), FE17::new(0), FE17::new(0), FE17::new(0)],
                [FE17::new(0), FE17::new(0), FE17::new(0), FE17::new(0)],
                [FE17::new(0), FE17::new(0), FE17::new(0), FE17::new(0)],

            ]);
            assert_eq!(q_x_expected, q_x);

           // 1 + 2*X + 3*Y + 4*X*Y + Y^2 + 3*Y^3 + 2*X*Y^3 + 4*X*Y^4
            let q_y_expected = BivariatePolynomial::new(array![
                [FE17::new(1), FE17::new(2), FE17::new(0), FE17::new(0)],
                [FE17::new(3), FE17::new(4), FE17::new(0), FE17::new(0)],
                [FE17::new(1), FE17::new(0), FE17::new(0), FE17::new(0)],
                [FE17::new(3), FE17::new(2), FE17::new(0), FE17::new(0)],
                [FE17::new(0), FE17::new(4), FE17::new(0), FE17::new(0)],
                [FE17::new(0), FE17::new(0), FE17::new(0), FE17::new(0)],
                [FE17::new(0), FE17::new(0), FE17::new(0), FE17::new(0)],
                [FE17::new(0), FE17::new(0), FE17::new(0), FE17::new(0)],
            ]);
            assert_eq!(q_y, q_y_expected);
        }
    }





}   