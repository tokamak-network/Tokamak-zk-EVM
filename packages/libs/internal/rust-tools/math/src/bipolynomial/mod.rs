use crate::alloc::borrow::ToOwned;
use core::fmt::Debug;
use core::ops::{Add, Sub, Mul};
use lambdaworks_math::field::element::FieldElement;
use lambdaworks_math::field::traits::{IsField, IsSubFieldOf};
use lambdaworks_math::polynomial::Polynomial as UnivariatePolynomial;
use ndarray::{s, Array, Array2, Axis};
use core::fmt;

/// Represents the polynomial:
///
/// (c₀₀ + c₀₁ * X + c₀₂ * X² + ... + c₀ₙ * Xⁿ) * Y⁰ +
/// (c₁₀ + c₁₁ * X + c₁₂ * X² + ... + c₁ₙ * Xⁿ) * Y¹ +
/// ... +
/// (cₙ₀ + cₙ₁ * X + cₙ₂ * X² + ... + cₙₙ * Xⁿ) * Yⁿ
///
/// This polynomial is represented as a vector of coefficients: `[c₀, c₁, ..., cₙ]`
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BivariatePolynomial<FE> {
    pub coefficients: Array2<FE>,
    pub x_degree: usize,
    pub y_degree: usize,
}




impl<F: IsField> fmt::Display for BivariatePolynomial<FieldElement<F>> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    

        let mut true_x_degree = 0;
        let mut true_y_degree = 0;

        for y_power in 0..self.coefficients.nrows() {
            for x_power in 0..self.coefficients.ncols() {
                if self.coefficients[[y_power, x_power]] != FieldElement::zero() {
                    true_x_degree = true_x_degree.max(x_power);
                    true_y_degree = true_y_degree.max(y_power);
                }
            }
        }

        writeln!(f, "Degree in X: {}", true_x_degree)?;
        writeln!(f, "Degree in Y: {}", true_y_degree)?;

        if self.coefficients.is_empty() {
            return write!(f, "Polynomial: 0");
        }

        write!(f, "Polynomial: ")?;
        let mut first_term = true;

        // Iterate over the actual polynomial terms
        for y_power in 0..self.coefficients.nrows() {
            for x_power in 0..self.coefficients.ncols() {
                let coeff = &self.coefficients[[y_power, x_power]];

                if *coeff == FieldElement::zero() {
                    continue;
                }

                if !first_term {
                    write!(f, " + ")?;
                }

                if *coeff != FieldElement::one() || (x_power == 0 && y_power == 0) {
                    write!(f, "{:?}", coeff.value())?; // TODO ::check
                    if x_power > 0 || y_power > 0 {
                        write!(f, "*")?;
                    }
                }

                if x_power > 0 {
                    write!(f, "X")?;
                    if x_power > 1 {
                        write!(f, "^{}", x_power)?;
                    }
                    if y_power > 0 {
                        write!(f, "*")?;
                    }
                }

                if y_power > 0 {
                    write!(f, "Y")?;
                    if y_power > 1 {
                        write!(f, "^{}", y_power)?;
                    }
                }

                first_term = false;
            }
        }

        if first_term {
            write!(f, "0")?;
        }

        Ok(())
    }
}



impl<F: IsField > BivariatePolynomial<FieldElement<F>> {

    pub fn polynomial_dimension(&self) -> (usize, usize) {

        let mut true_x_degree = 0;
        let mut true_y_degree = 0;

        for y_power in 0..self.coefficients.nrows() {
            for x_power in 0..self.coefficients.ncols() {
                if self.coefficients[[y_power, x_power]] != FieldElement::zero() {
                    true_x_degree = true_x_degree.max(x_power);
                    true_y_degree = true_y_degree.max(y_power);
                }
            }
        }
        (true_x_degree, true_y_degree)
    }
}





impl<F: IsField> BivariatePolynomial<FieldElement<F>> {
    /// Creates a new polynomial with the given coefficients
    /// Creates a new polynomial with the given coefficients in the form of an ndarray.
    pub fn new(coefficients: Array2<FieldElement<F>>) -> Self {
        let y_degree = coefficients.nrows();
        let x_degree = coefficients.ncols();

        BivariatePolynomial {
            coefficients,
            x_degree,
            y_degree,
        }
    }
    // // TODO :: return if not possible 
    // pub fn trim_last_row_zeros(&self) -> Self {
    // let last_row = self.coefficients.row(self.y_degree - 1);
    // if last_row.iter().all(|&coeff| coeff.is_zero()) {
    //     let trimmed_coefficients = self.coefficients.slice(s![..-1, ..]);
    //     BivariatePolynomial {
    //         coefficients: trimmed_coefficients,
    //         x_degree: self.x_degree,
    //         y_degree: self.y_degree - 1,
    //     }
    // } else {
    //     self.clone()
    // }
    // }

    pub fn flatten_out(&self) -> alloc::vec::Vec<FieldElement<F>> {
        self.coefficients.iter().cloned().collect()
    }
    // c00 x^0 + ... c0n x^n ] Y^0 
    // c10 x^0 + ... c1n x^n ] Y^1
    // TODO :: check for more efficiency 
    pub fn scale<S: IsSubFieldOf<F>>(&self, x_factor: &FieldElement<S>,y_factor :&FieldElement<S>) -> Self {
        let scaled_coefficient = self
            .coefficients
            .axis_iter(Axis(0)) // ??? check 
            .zip(core::iter::successors(Some(FieldElement::one()), |y| { // y_factor^0 , y_factor^1 
                Some(y * y_factor)
            }))
            .map(|(row, y_power)| {
                row.iter()
                    .zip(core::iter::successors(Some(FieldElement::one()), |x| { // x_factor^0 , x_factor^1 
                        Some(x * x_factor)
                    }))
                    .map(|(coeff, x_power)| y_power.clone() * x_power * coeff)
                    .collect::<alloc::vec::Vec<_>>() // Collect each row into a Vec
            })
            .collect::<alloc::vec::Vec<_>>(); // Collect all rows into a Vec of Vecs

        let scaled_coefficients = Array2::from_shape_vec(
            (self.coefficients.nrows(), self.coefficients.ncols()),
            scaled_coefficient.into_iter().flatten().collect()
        ).unwrap();
        // let mut scaled_coefficients = Array2::<FieldElement<F>>::default(self.coefficients.dim());
        // let mut y_scalar: FieldElement<S> = FieldElement::one();
        // y_scalar = y_scalar * y_factor;
        // for (row_index,row )in self.coefficients.axis_iter(Axis(0)).enumerate() {
        //     let mut x_scalar = FieldElement::one(); // Change to mutable variable
        //     for (column_index, value) in row.iter().enumerate() {
        //         let s_ij = scaled_coefficients.get_mut((row_index, column_index)).unwrap();
        //         *s_ij = value * y_scalar.clone().to_extension() * x_scalar.clone().to_extension();// TODO :: check without cloning !!!
        //         x_scalar = x_factor * x_scalar; // Update without reference
        //     }
        //     y_scalar = y_factor * y_scalar;
        // }


        Self{
            coefficients: scaled_coefficients, 
            x_degree: self.x_degree,
            y_degree: self.y_degree,
        }
    }

    //TODO write ops overloading for it
    pub fn sub_by_field_element(
        &self,
        element: &FieldElement<F>,
    ) -> BivariatePolynomial<FieldElement<F>> {
        // Clone the coefficients array to create a new one for the result
        let mut new_coefficients = self.coefficients.clone();

        // Subtract the given element from the (0, 0) coefficient
        new_coefficients[(0, 0)] = new_coefficients[(0, 0)].clone() - element.clone();

        // Return the new BivariatePolynomial with the updated coefficients
        BivariatePolynomial {
            coefficients: new_coefficients,
            x_degree: self.x_degree,
            y_degree: self.y_degree,
        }
    }

    ///Creates a zero polynomial with no coefficients.
    pub fn zero() -> Array2<FieldElement<F>> {
        Array2::<FieldElement<F>>::default((1, 2))
    }

    /// Evaluates the polynomial at the given x and y values
    pub fn evaluate<E>(&self, x: &FieldElement<E>, y: &FieldElement<E>) -> FieldElement<E>
    where
        E: IsField,
        F: IsSubFieldOf<E>,
    {
        // Iterate over the rows in reverse order
        let mut y_acc = FieldElement::zero();
        for y_row in self.coefficients.axis_iter(Axis(0)).rev() {
            let mut x_acc = FieldElement::zero();
            for x_coeff in y_row.iter().rev() {
                let x_coeff_as_e = x_coeff.clone(); // Convert FieldElement<F> to FieldElement<E>
                x_acc = x_coeff_as_e + x_acc * x.clone();
            }
            y_acc = x_acc + y_acc * y.clone();
        }
        y_acc
    }

    pub fn ruffini_division<L>(
        &self,
        a: &FieldElement<L>,
        b: &FieldElement<L>,
    ) -> (
        BivariatePolynomial<FieldElement<L>>,
        UnivariatePolynomial<FieldElement<L>>,
    )
    where
        L: IsField,
        F: IsSubFieldOf<L>,
    {
         // Initialize a 2D array with the appropriate size filled with zeros
        let mut q_xy_coeffs = Array2::<FieldElement<L>>::default((self.y_degree, self.x_degree));
        let mut remainder_y = UnivariatePolynomial::zero();

        for (y_index, y_row) in self.coefficients.axis_iter(Axis(0)).enumerate() {
            if let Some(c) = y_row.last() {
                // Convert the coefficient to the extension field L
                let mut c = c.clone().to_extension();
                
                let mut x_coeffs = alloc::vec::Vec::with_capacity(self.x_degree);

                for coeff  in y_row.iter().rev().skip(1) {
                    x_coeffs.push(c.clone());
                    c = coeff.clone().to_extension() + c * a;
                }

                // Reverse the coefficients to match the correct order
                x_coeffs.reverse();

                // Fill the q_xy_coeffs array with x_coeffs
                for (x_index, x_coeff) in x_coeffs.iter().enumerate() {
                    q_xy_coeffs[(y_index, x_index)] = x_coeff.clone();
                }

                // Create the remainder polynomial
                let remainder_poly = UnivariatePolynomial::new_monomial(c, y_index);
                remainder_y = remainder_y.add(remainder_poly);
            }
        }

        let q_xy = BivariatePolynomial {
            coefficients: q_xy_coeffs.clone(), // Clone here if you plan to use q_xy_coeffs later
            x_degree: q_xy_coeffs.ncols().max(0),
            y_degree: q_xy_coeffs.nrows().max(0),
        };

        // Perform Ruffini division on the univariate polynomial
        let q_y = remainder_y.ruffini_division(b);

        (q_xy, q_y)
    }

    // TODO :: create a new function which recieve 2 univariate polynomial and multiply them together and create a bivariate polynomial 
    pub fn compose_from_univariate(F_X: UnivariatePolynomial<FieldElement<F>>, F_Y: UnivariatePolynomial<FieldElement<F>>) -> Self {
        todo!()
    }


}   

impl<F: IsField> Add<BivariatePolynomial<FieldElement<F>>> for BivariatePolynomial<FieldElement<F>> {
    type Output = BivariatePolynomial<FieldElement<F>>;

    fn add(
        self,
        other: BivariatePolynomial<FieldElement<F>>,
    ) -> BivariatePolynomial<FieldElement<F>> {
        // Determine the maximum degrees in x and y directions
        let max_y_degree = self.y_degree.max(other.y_degree);
        let max_x_degree = self.x_degree.max(other.x_degree);

        // Resize self's coefficients to match the maximum degrees if necessary
        let mut self_extended_coeffs =
            Array2::<FieldElement<F>>::default((max_y_degree, max_x_degree));
        self_extended_coeffs
            .slice_mut(s![..self.y_degree, ..self.x_degree])
            .assign(&self.coefficients);

        // Resize other's coefficients to match the maximum degrees if necessary
        let mut other_extended_coeffs =
            Array2::<FieldElement<F>>::default((max_y_degree, max_x_degree));
        other_extended_coeffs
            .slice_mut(s![..other.y_degree, ..other.x_degree])
            .assign(&other.coefficients);

        // Perform element-wise addition of the coefficients
        let new_coefficients = self_extended_coeffs + other_extended_coeffs;

        BivariatePolynomial {
            coefficients: new_coefficients,
            x_degree: max_x_degree,
            y_degree: max_y_degree,
        }
    }
}

// Borrowed BivariatePolynomial plus Borrowed FieldElement
impl<F, L> Add<&FieldElement<F>> for &BivariatePolynomial<FieldElement<L>>
where
    L: IsField,
    F: IsSubFieldOf<L>,
{
    type Output = BivariatePolynomial<FieldElement<L>>;

    fn add(self, other: &FieldElement<F>) -> Self::Output {
        let mut new_coefficients = self.coefficients.clone();

        // Add the FieldElement to the constant term
        if new_coefficients.nrows() > 0 && new_coefficients.ncols() > 0 {
            new_coefficients[(0, 0)] =
                new_coefficients[(0, 0)].clone() + other.clone().to_extension();
        } else {
            // If the polynomial has no constant term, initialize it with the FieldElement as the constant term
            new_coefficients = Array2::from_elem((1, 1), other.clone().to_extension());
        }

        BivariatePolynomial {
            coefficients: new_coefficients,
            x_degree: self.x_degree,
            y_degree: self.y_degree,
        }
    }
}

// Implementing the Add trait for references of BivariatePolynomial
impl<F: IsField> Add<BivariatePolynomial<FieldElement<F>>> for &BivariatePolynomial<FieldElement<F>> {
    type Output = BivariatePolynomial<FieldElement<F>>;

    fn add(
        self,
        other: BivariatePolynomial<FieldElement<F>>,
    ) -> BivariatePolynomial<FieldElement<F>> {
        let max_y_degree = self.y_degree.max(other.y_degree);
        let max_x_degree = self.x_degree.max(other.x_degree);

        // Create a new 2D array with the maximum dimensions
        let mut new_coefficients = Array2::<FieldElement<F>>::default((max_y_degree, max_x_degree));

        // Iterate over each coefficient and calculate the sum
        for y in 0..max_y_degree {
            for x in 0..max_x_degree {
                let self_coeff = if y < self.y_degree && x < self.x_degree {
                    self.coefficients[(y, x)].clone()
                } else {
                    FieldElement::zero()
                };

                let other_coeff = if y < other.y_degree && x < other.x_degree {
                    other.coefficients[(y, x)].clone()
                } else {
                    FieldElement::zero()
                };

                new_coefficients[(y, x)] = self_coeff + other_coeff;
            }
        }

        BivariatePolynomial {
            coefficients: new_coefficients,
            x_degree: max_x_degree,
            y_degree: max_y_degree,
        }
    }
}


// Implementing the Add trait for references of BivariatePolynomial
impl<F: IsField> Add<&BivariatePolynomial<FieldElement<F>>> for &BivariatePolynomial<FieldElement<F>> {
    type Output = BivariatePolynomial<FieldElement<F>>;

    fn add(
        self,
        other: &BivariatePolynomial<FieldElement<F>>,
    ) -> BivariatePolynomial<FieldElement<F>> {
        let max_y_degree = self.y_degree.max(other.y_degree);
        let max_x_degree = self.x_degree.max(other.x_degree);

        // Create a new 2D array with the maximum dimensions
        let mut new_coefficients = Array2::<FieldElement<F>>::default((max_y_degree, max_x_degree));

        // Iterate over each coefficient and calculate the sum
        for y in 0..max_y_degree {
            for x in 0..max_x_degree {
                let self_coeff = if y < self.y_degree && x < self.x_degree {
                    self.coefficients[(y, x)].clone()
                } else {
                    FieldElement::zero()
                };

                let other_coeff = if y < other.y_degree && x < other.x_degree {
                    other.coefficients[(y, x)].clone()
                } else {
                    FieldElement::zero()
                };

                new_coefficients[(y, x)] = self_coeff + other_coeff;
            }
        }

        BivariatePolynomial {
            coefficients: new_coefficients,
            x_degree: max_x_degree,
            y_degree: max_y_degree,
        }
    }
}




impl<F: IsField> Sub for BivariatePolynomial<FieldElement<F>> {
    type Output = BivariatePolynomial<FieldElement<F>>;

    fn sub(
        self,
        other: BivariatePolynomial<FieldElement<F>>,
    ) -> BivariatePolynomial<FieldElement<F>> {
        let max_y_degree = self.y_degree.max(other.y_degree);
        let max_x_degree = self.x_degree.max(other.x_degree);

        // Create a new 2D array to store the result coefficients
        let mut new_coefficients = Array2::<FieldElement<F>>::default((max_y_degree, max_x_degree));

        // Iterate over each coefficient and calculate the difference
        for y in 0..max_y_degree {
            for x in 0..max_x_degree {
                let self_coeff = if y < self.y_degree && x < self.x_degree {
                    self.coefficients[(y, x)].clone()
                } else {
                    FieldElement::zero()
                };

                let other_coeff = if y < other.y_degree && x < other.x_degree {
                    other.coefficients[(y, x)].clone()
                } else {
                    FieldElement::zero()
                };

                new_coefficients[(y, x)] = self_coeff - other_coeff;
            }
        }

        BivariatePolynomial {
            coefficients: new_coefficients,
            x_degree: max_x_degree,
            y_degree: max_y_degree,
        }
    }
}

impl<F: IsField> Sub for &BivariatePolynomial<FieldElement<F>> {
    type Output = BivariatePolynomial<FieldElement<F>>;

    fn sub(
        self,
        other: &BivariatePolynomial<FieldElement<F>>,
    ) -> BivariatePolynomial<FieldElement<F>> {
        let max_y_degree = self.y_degree.max(other.y_degree);
        let max_x_degree = self.x_degree.max(other.x_degree);

        // Create a new Array2 for the result with the maximum size
        let mut new_coefficients = Array2::<FieldElement<F>>::default((max_y_degree, max_x_degree));

        for y in 0..max_y_degree {
            for x in 0..max_x_degree {
                let self_coeff = if y < self.coefficients.nrows() && x < self.coefficients.ncols() {
                    self.coefficients[(y, x)].clone()
                } else {
                    FieldElement::default()
                };

                let other_coeff =
                    if y < other.coefficients.nrows() && x < other.coefficients.ncols() {
                        other.coefficients[(y, x)].clone()
                    } else {
                        FieldElement::default()
                    };

                new_coefficients[(y, x)] = self_coeff - other_coeff;
            }
        }

        BivariatePolynomial {
            coefficients: new_coefficients,
            x_degree: max_x_degree,
            y_degree: max_y_degree,
        }
    }
}

//Owned FieldElement minus Owned BivariatePolynomi
impl<F, L> core::ops::Sub<&BivariatePolynomial<FieldElement<L>>> for &FieldElement<F>
where
    L: IsField,
    F: IsSubFieldOf<L>,
{
    type Output = BivariatePolynomial<FieldElement<L>>;

    fn sub(
        self,
        other: &BivariatePolynomial<FieldElement<L>>,
    ) -> BivariatePolynomial<FieldElement<L>> {
        // Clone the coefficients so that we can modify them
        let mut new_coefficients = other.coefficients.clone();

        // Subtract the FieldElement from the constant term (if it exists)
        if new_coefficients.nrows() > 0 && new_coefficients.ncols() > 0 {
            new_coefficients[(0, 0)] =
                self.to_owned().to_extension() - new_coefficients[(0, 0)].clone();
        } else {
            // If the polynomial has no constant term, we effectively add the FieldElement as the constant term
            let mut extended_coefficients = Array2::<FieldElement<L>>::default((1, 1));
            extended_coefficients[(0, 0)] = self.to_owned().to_extension();
            new_coefficients = extended_coefficients;
        }

        BivariatePolynomial {
            coefficients: new_coefficients,
            x_degree: other.x_degree,
            y_degree: other.y_degree,
        }
    }
}

//Owned FieldElement minus Borrowed BivariatePolynomial
impl<F, L> Sub<&BivariatePolynomial<FieldElement<L>>> for FieldElement<F>
where
    L: IsField,
    F: IsSubFieldOf<L>,
{
    type Output = BivariatePolynomial<FieldElement<L>>;

    fn sub(self, poly: &BivariatePolynomial<FieldElement<L>>) -> Self::Output {
        // Clone the coefficients to create a new set for the result
        let mut new_coefficients = poly.coefficients.clone();

        // Subtract the scalar from the constant term of the polynomial (if it exists)
        if new_coefficients.nrows() > 0 && new_coefficients.ncols() > 0 {
            new_coefficients[(0, 0)] = self.to_extension() - poly.coefficients[(0, 0)].clone();
        } else {
            // If the polynomial is effectively empty, create a new 1x1 array with the scalar as the constant term
            new_coefficients = Array2::from_elem((1, 1), self.to_extension());
        }

        // Return the new polynomial with updated coefficients
        BivariatePolynomial {
            coefficients: new_coefficients,
            x_degree: poly.x_degree,
            y_degree: poly.y_degree,
        }
    }
}

// Owned FieldElement minus Owned BivariatePolynomial
impl<F, L> Sub<BivariatePolynomial<FieldElement<L>>> for FieldElement<F>
where
    L: IsField,
    F: IsSubFieldOf<L>,
{
    type Output = BivariatePolynomial<FieldElement<L>>;

    fn sub(self, mut poly: BivariatePolynomial<FieldElement<L>>) -> Self::Output {
        // Subtract the scalar from the constant term of the polynomial
        if poly.coefficients.nrows() > 0 && poly.coefficients.ncols() > 0 {
            poly.coefficients[(0, 0)] = self.to_extension() - poly.coefficients[(0, 0)].clone();
        } else {
            // If the polynomial has no terms, initialize it with the scalar as a constant term
            poly.coefficients = Array2::from_elem((1, 1), self.to_extension());
            poly.x_degree = 0;
            poly.y_degree = 0;
        }

        poly
    }
}

/// Implementing subtraction for a borrowed `FieldElement` minus an owned `BivariatePolynomial`
impl<F, L> Sub<BivariatePolynomial<FieldElement<L>>> for &FieldElement<F>
where
    L: IsField,
    F: IsSubFieldOf<L>,
{
    type Output = BivariatePolynomial<FieldElement<L>>;

    fn sub(self, mut poly: BivariatePolynomial<FieldElement<L>>) -> Self::Output {
        // Subtract the scalar from the constant term of the polynomial
        if poly.coefficients.nrows() > 0 && poly.coefficients.ncols() > 0 {
            // Subtract the scalar from the (0, 0) term
            poly.coefficients[(0, 0)] =
                self.clone().to_extension() - poly.coefficients[(0, 0)].clone();
        } else {
            // If the polynomial is empty, we initialize it with the scalar at (0, 0)
            poly.coefficients = Array2::from_elem((1, 1), self.clone().to_extension());
            poly.x_degree = 0;
            poly.y_degree = 0;
        }

        poly
    }
}

// Borrowed FieldElement plus Borrowed BivariatePolynomial
impl<F, L> Add<&BivariatePolynomial<FieldElement<L>>> for &FieldElement<F>
where
    L: IsField,
    F: IsSubFieldOf<L>,
{
    type Output = BivariatePolynomial<FieldElement<L>>;

    fn add(self, other: &BivariatePolynomial<FieldElement<L>>) -> Self::Output {
        let mut new_coefficients = other.coefficients.clone();

        // Add the FieldElement to the constant term
        if new_coefficients.nrows() > 0 && new_coefficients.ncols() > 0 {
            new_coefficients[(0, 0)] =
                new_coefficients[(0, 0)].clone() + self.clone().to_extension();
        } else {
            // If the polynomial has no constant term, initialize it with the FieldElement as the constant term
            new_coefficients = Array2::from_elem((1, 1), self.clone().to_extension());
        }

        BivariatePolynomial {
            coefficients: new_coefficients,
            x_degree: other.x_degree,
            y_degree: other.y_degree,
        }
    }
}

// Owned FieldElement plus Borrowed BivariatePolynomial
impl<F, L> Add<&BivariatePolynomial<FieldElement<L>>> for FieldElement<F>
where
    L: IsField,
    F: IsSubFieldOf<L>,
{
    type Output = BivariatePolynomial<FieldElement<L>>;

    fn add(self, poly: &BivariatePolynomial<FieldElement<L>>) -> Self::Output {
        // Clone the coefficients to create a new set for the result
        let mut new_coefficients = poly.coefficients.clone();

        // Add the scalar to the constant term of the polynomial
        if new_coefficients.nrows() > 0 && new_coefficients.ncols() > 0 {
            new_coefficients[(0, 0)] = new_coefficients[(0, 0)].clone() + self.to_extension();
        } else {
            // If the polynomial is empty, initialize it with the scalar as the constant term
            new_coefficients = Array2::from_elem((1, 1), self.to_extension());
        }

        BivariatePolynomial {
            coefficients: new_coefficients,
            x_degree: poly.x_degree,
            y_degree: poly.y_degree,
        }
    }
}

// Owned FieldElement plus Owned BivariatePolynomial
impl<F, L> Add<BivariatePolynomial<FieldElement<L>>> for FieldElement<F>
where
    L: IsField,
    F: IsSubFieldOf<L>,
{
    type Output = BivariatePolynomial<FieldElement<L>>;

    fn add(self, mut poly: BivariatePolynomial<FieldElement<L>>) -> Self::Output {
        // Add the scalar to the constant term of the polynomial
        if poly.coefficients.nrows() > 0 && poly.coefficients.ncols() > 0 {
            poly.coefficients[(0, 0)] = poly.coefficients[(0, 0)].clone() + self.to_extension();
        } else {
            // If the polynomial has no terms, initialize a 1x1 array with the FieldElement as the constant term
            poly.coefficients = Array2::from_elem((1, 1), self.to_extension());
        }

        poly
    }
}

// Borrowed FieldElement plus Owned BivariatePolynomial
impl<F, L> Add<BivariatePolynomial<FieldElement<L>>> for &FieldElement<F>
where
    L: IsField,
    F: IsSubFieldOf<L>,
{
    type Output = BivariatePolynomial<FieldElement<L>>;

    fn add(self, mut poly: BivariatePolynomial<FieldElement<L>>) -> Self::Output {
        // Add the scalar to the constant term of the polynomial
        if poly.coefficients.nrows() > 0 && poly.coefficients.ncols() > 0 {
            poly.coefficients[(0, 0)] =
                poly.coefficients[(0, 0)].clone() + self.clone().to_extension();
        } else {
            // If the polynomial has no terms, initialize a 1x1 array with the FieldElement as the constant term
            poly.coefficients = Array2::from_elem((1, 1), self.clone().to_extension());
        }

        poly
    }
}


// Borrowed FieldElement plus Owned BivariatePolynomial
impl<F, L> Mul<BivariatePolynomial<FieldElement<L>>> for &FieldElement<F>
where
    L: IsField,
    F: IsSubFieldOf<L>,
{
    type Output = BivariatePolynomial<FieldElement<L>>;

    fn mul(self, poly: BivariatePolynomial<FieldElement<L>>) -> Self::Output {
        // Add the scalar to the constant term of the polynomial
        let mut output = poly.clone();
        for i in 0..poly.coefficients.nrows(){
            for j in 0..poly.coefficients.ncols(){
                output.coefficients[(i,j)] = poly.coefficients[(i,j)].clone() * self.clone().to_extension();
            }
        }
        output
    }
}

// FieldElement Multiply Owned BivariatePolynomial
impl<F, L> Mul<BivariatePolynomial<FieldElement<L>>> for FieldElement<F>
where
    L: IsField,
    F: IsSubFieldOf<L>,
{
    type Output = BivariatePolynomial<FieldElement<L>>;

    fn mul(self, poly: BivariatePolynomial<FieldElement<L>>) -> Self::Output {
        // Add the scalar to the constant term of the polynomial
        let mut output = poly.clone();
        for i in 0..poly.coefficients.nrows(){
            for j in 0..poly.coefficients.ncols(){
                output.coefficients[(i,j)] = poly.coefficients[(i,j)].clone() * self.clone().to_extension();
            }
        }
        output
    }
}

// Owned FieldElement plus Borrowed BivariatePolynomial
impl<F, L> Mul<&BivariatePolynomial<FieldElement<L>>> for FieldElement<F>
where
    L: IsField,
    F: IsSubFieldOf<L>,
{
    type Output = BivariatePolynomial<FieldElement<L>>;

    fn mul(self, poly: &BivariatePolynomial<FieldElement<L>>) -> Self::Output {
        // Add the scalar to the constant term of the polynomial
        let mut output = poly.clone();
        for i in 0..poly.coefficients.nrows(){
            for j in 0..poly.coefficients.ncols(){
                output.coefficients[(i,j)] = poly.coefficients[(i,j)].clone() * self.clone().to_extension();
            }
        }
        output
    }
}

// Borrowed FieldElement plus Borrowed BivariatePolynomial
impl<F, L> Mul<&BivariatePolynomial<FieldElement<L>>> for &FieldElement<F>
where
    L: IsField,
    F: IsSubFieldOf<L>,
{
    type Output = BivariatePolynomial<FieldElement<L>>;

    fn mul(self, poly: &BivariatePolynomial<FieldElement<L>>) -> Self::Output {
        // Add the scalar to the constant term of the polynomial
        let mut output = poly.clone();
        for i in 0..poly.coefficients.nrows(){
            for j in 0..poly.coefficients.ncols(){
                output.coefficients[(i,j)] = poly.coefficients[(i,j)].clone() * self.clone().to_extension();
            }
        }
        output
    }
}




#[cfg(test)]
mod tests {
    use super::*;
    use lambdaworks_math::field::element::FieldElement;
    use lambdaworks_math::field::fields::u64_prime_field::U64PrimeField;
    const ORDER: u64 = 23;
    type F = U64PrimeField<ORDER>;
    type FE = FieldElement<F>;
    use ndarray::array;

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
    fn polynomial_one() ->BivariatePolynomial<FE> {
        BivariatePolynomial::new(array![
            [FE::new(1), FE::new(1), FE::new(1)],
            [FE::new(1), FE::new(1), FE::new(1)],
            [FE::new(1), FE::new(1), FE::new(1)],
        ])
    }

    #[test]
    fn test_scale_polynomial_x(){
        let a = polynomial_one();
        let scaled_a = a.scale(&FE::new(2), &FE::new(1));
        let expected_a = BivariatePolynomial::new(array![
            [FE::new(1), FE::new(2), FE::new(4)],
            [FE::new(1), FE::new(2), FE::new(4)],
            [FE::new(1), FE::new(2), FE::new(4)],
        ]);
        assert_eq!(scaled_a, expected_a)
    }
    #[test]
    fn test_scale_polynomial_y(){
        let a = polynomial_one();
        let scaled_a = a.scale(&FE::new(1), &FE::new(2));
        let expected_a = BivariatePolynomial::new(array![
            [FE::new(1), FE::new(1), FE::new(1)],
            [FE::new(2), FE::new(2), FE::new(2)],
            [FE::new(4), FE::new(4), FE::new(4)],
        ]);
        assert_eq!(scaled_a, expected_a)
    }



    #[test]
    fn test_bivariate_polynomial_new() {
        // Define the coefficients for the polynomial
        // Example: 3 + x + 2xy + x^2y + 4xy^2
        let coefficients = array![
            [FE::new(3), FE::new(1), FE::new(0)], // 3 + x
            [FE::new(0), FE::new(2), FE::new(1)], // 2xy + x^2y
            [FE::new(0), FE::new(4), FE::new(0)], // 4xy^2
        ];

        // Create the polynomial using the `new` method
        let poly = BivariatePolynomial::new(coefficients);

        // Expected 2D array of coefficients
        let expected_coeffs = array![
            [FE::new(3), FE::new(1), FE::zero()], // 3 + x + 0*x^2
            [FE::new(0), FE::new(2), FE::new(1)], // 0 + 2x + 1x^2
            [FE::new(0), FE::new(4), FE::zero()]  // 0 + 4x + 0*x^2
        ];

        // Verify the dimensions (degrees)
        assert_eq!(poly.x_degree, 3, "x_degree should be 3");
        assert_eq!(poly.y_degree, 3, "y_degree should be 3");

        // Verify the coefficients are as expected
        assert_eq!(
            poly.coefficients, expected_coeffs,
            "The coefficients matrix is incorrect."
        );
    }

    #[test]
    fn new_ndarray_2d_test() {
        let ploy_a = self::polynomial_a();

        assert_eq!(
            ploy_a,
            BivariatePolynomial::new(array![
                [FE::new(3), FE::new(1), FE::new(0)],
                [FE::new(0), FE::new(2), FE::new(1)],
                [FE::new(0), FE::new(4), FE::new(0)],
            ])
        )
    }

    #[test]
    fn test_flatten_out() {
        let coeffs = array![[FE::new(1), FE::new(2)], [FE::new(3), FE::new(4)]];

        let poly = BivariatePolynomial::new(coeffs);
        let flattened = poly.flatten_out();

        let expected = vec![FE::new(1), FE::new(2), FE::new(3), FE::new(4)];

        assert_eq!(flattened, expected);
    }

    #[test]
    fn test_sub_by_field_element() {
        let coeffs = array![[FE::new(5), FE::new(2)], [FE::new(3), FE::new(4)]];

        let poly = BivariatePolynomial::new(coeffs);
        let element_to_subtract = FE::new(3);

        let new_poly = poly.sub_by_field_element(&element_to_subtract);

        let expected_coeffs =
            Array::from_shape_vec((2, 2), vec![FE::new(2), FE::new(2), FE::new(3), FE::new(4)])
                .unwrap();

        assert_eq!(new_poly.coefficients, expected_coeffs);
    }

    #[test]
    fn test_evaluate() {
        let poly = polynomial_a();
        let x = FE::new(2);
        let y = FE::new(3);

        let result = poly.evaluate(&x, &y);

        // Manually compute the expected result
        // 3 + x + 2xy + x^2y + 4xy^2
        // = 3 + 2 + 2*2*3 + 2^2*3 + 4*2*3^2
        // = 3 + 2 + 12 + 12 + 72
        // = 101 mod 23
        let expected = FE::new(101 % ORDER);

        assert_eq!(result, expected);
    }

    #[test]
    fn test_zero() {
        // Create a zero polynomial using the zero method
        let zero_poly = BivariatePolynomial::<FE>::zero();

        // Create an expected zero polynomial
        let expected_zero_poly = Array2::<FE>::default((1, 2));

        // Assert that the polynomial generated by the zero method matches the expected zero polynomial
        assert_eq!(zero_poly, expected_zero_poly);
    }

    // test ruffini implementation
    // Q = (x-1)[3 + x + 2xy + x^2*y + 4xy^2] + (y-2)[ y^2 + 3 ]
    // Q.ruffinit(1,2) => [3+x+2xy+x^2y+4xy^2] , [y^2+3]
    // bear in mind we test it in Z_23 => -9 => 14
    #[test]
    fn ruffini_test() {
        // Define the polynomial Q(x, y)
        let p = BivariatePolynomial::new(array![
            [FE::new(14), FE::new(2), FE::new(1), FE::zero()],
            [FE::new(3), FE::new(21), FE::new(1), FE::new(1)],
            [FE::new(21), FE::new(19), FE::new(4), FE::new(0)],
            [FE::new(1), FE::zero(), FE::zero(), FE::new(0)],
        ]);

        // Evaluate Q(1, 2) to ensure it's zero
        assert_eq!(FE::zero(), p.evaluate(&FE::new(1), &FE::new(2)));

        // Perform Ruffini division by (x - 1) and (y - 2)
        let (q_xy, q_y) = p.ruffini_division(&FE::new(1), &FE::new(2));

        // Define the expected quotient polynomial (3 + x + 2xy + x^2y + 4xy^2)
        let expected_q_xy = BivariatePolynomial::new(array![
            [FE::new(3), FE::new(1), FE::new(0), FE::new(0)],
            [FE::new(0), FE::new(2), FE::new(1), FE::new(0)],
            [FE::new(0), FE::new(4), FE::new(0), FE::new(0)],
            [FE::new(0), FE::zero(), FE::zero(), FE::new(0)],
        ]);

        // Define the expected remainder polynomial (y^2 + 3)
        let expected_q_y = UnivariatePolynomial::new(&[
            FE::new(3), // Constant term
            FE::new(0), // y term
            FE::new(1), // y^2 term
        ]);

        // Assert that the quotient and remainder are as expected
        assert_eq!(expected_q_xy, q_xy, "The quotient polynomial is incorrect.");
        assert_eq!(expected_q_y, q_y, "The remainder polynomial is incorrect.");
    }

    #[test]
    fn test_polynomial_addition_values() {
        // Polynomial p1: 1 + 2x + 3x^2 + 4y + 5xy + 6x^2y
        let p1 = BivariatePolynomial::new(array![
            [FE::new(1), FE::new(2), FE::new(3)],
            [FE::new(4), FE::new(5), FE::new(6)],
            [FE::new(4), FE::new(5), FE::new(6)],
        ]);

        // Polynomial p2: 6 + 5x + 4x^2 + 3y + 2xy + 1x^2y
        let p2 = BivariatePolynomial::new(array![
            [FE::new(6), FE::new(5), FE::new(4)],
            [FE::new(3), FE::new(2), FE::new(1)],
        ]);

        // Expected result: 7 + 7x + 7x^2 + 7y + 7xy + 7x^2y
        let expected = BivariatePolynomial::new(array![
            [FE::new(7), FE::new(7), FE::new(7)],
            [FE::new(7), FE::new(7), FE::new(7)],
            [FE::new(4), FE::new(5), FE::new(6)],
        ]);

        // Test the addition
        let result = p1 + p2;

        assert_eq!(expected, result);
    }

    #[test]
    fn test_polynomial_addition_references() {
        // Polynomial p1: 1 + 2x + 3x^2 + 4y + 5xy + 6x^2y
        let p1 = BivariatePolynomial::new(array![
            [FE::new(1), FE::new(2), FE::new(3)], // 1 + 2x + 3x^2
            [FE::new(4), FE::new(5), FE::new(6)], // 4y + 5xy + 6x^2y
            [FE::new(7), FE::new(8), FE::new(9)], // 7y^2 + 8xy^2 + 9x^2y^2
        ]);

        // Polynomial p2: 6 + 5x + 4x^2 + 3y + 2xy + 1x^2y
        let p2 = BivariatePolynomial::new(array![
            [FE::new(6), FE::new(5), FE::new(4)], // 6 + 5x + 4x^2
            [FE::new(3), FE::new(2), FE::new(1)], // 3y + 2xy + 1x^2y
            [FE::new(0), FE::new(0), FE::new(0)], // 0 + 0xy^2 + 0x^2y^2
        ]);

        // Expected result: p1 + p2
        // = (1 + 6) + (2 + 5)x + (3 + 4)x^2 + (4 + 3)y + (5 + 2)xy + (6 + 1)x^2y + (7 + 0)y^2 + (8 + 0)xy^2 + (9 + 0)x^2y^2
        let expected = BivariatePolynomial::new(array![
            [FE::new(7), FE::new(7), FE::new(7)], // 7 + 7x + 7x^2
            [FE::new(7), FE::new(7), FE::new(7)], // 7y + 7xy + 7x^2y
            [FE::new(7), FE::new(8), FE::new(9)], // 7y^2 + 8xy^2 + 9x^2y^2 (same as p1)
        ]);

        // Perform the addition
        let result = &p1 + &p2;

        // Assert that the result matches the expected polynomial
        assert_eq!(
            result, expected,
            "The polynomial addition result is incorrect."
        );
    }

    #[test]
    fn test_polynomial_subtraction_values() {
        // Polynomial p1: 3 + 2x + x^2 + 4y + 5xy + 6x^2y
        let p1 = BivariatePolynomial::new(array![
            [FE::new(3), FE::new(2), FE::new(1)], // 3 + 2x + x^2
            [FE::new(4), FE::new(5), FE::new(6)], // 4y + 5xy + 6x^2y
            [FE::new(7), FE::new(8), FE::new(9)], // 7y^2 + 8xy^2 + 9x^2y^2
        ]);

        // Polynomial p2: 1 + x + 2x^2 + 2y + 3xy + 4x^2y
        let p2 = BivariatePolynomial::new(array![
            [FE::new(1), FE::new(1), FE::new(2)], // 1 + x + 2x^2
            [FE::new(2), FE::new(3), FE::new(4)], // 2y + 3xy + 4x^2y
            [FE::new(5), FE::new(6), FE::new(7)], // 5y^2 + 6xy^2 + 7x^2y^2
        ]);

        // Expected result: p1 - p2
        // = (3 - 1) + (2 - 1)x + (1 - 2)x^2 + (4 - 2)y + (5 - 3)xy + (6 - 4)x^2y + (7 - 5)y^2 + (8 - 6)xy^2 + (9 - 7)x^2y^2
        let expected = BivariatePolynomial::new(array![
            [FE::new(2), FE::new(1), FE::new(22)], // 2 + x + (-1)x^2 (22 mod 23 = -1)
            [FE::new(2), FE::new(2), FE::new(2)],  // 2y + 2xy + 2x^2y
            [FE::new(2), FE::new(2), FE::new(2)],  // 2y^2 + 2xy^2 + 2x^2y^2
        ]);

        // Perform the subtraction
        let result = p1 - p2;

        // Assert that the result matches the expected polynomial
        assert_eq!(
            result, expected,
            "The polynomial subtraction result is incorrect."
        );
    }

    #[test]
    fn test_bivariate_polynomial_subtraction_references() {
        let poly_a = polynomial_a();
        let poly_b = polynomial_b();

        let result = &poly_a - &poly_b;

        // Expected result: (2 - x + 3x^2) + (-3y + xy) + (-4xy^2)
        let expected_result = BivariatePolynomial::new(array![
            [FE::new(2), FE::new(22), FE::new(0)],
            [FE::new(20), FE::new(21), FE::new(1)],
            [FE::new(0), FE::new(4), FE::new(0)],
        ]);

        assert_eq!(result, expected_result);
    }

    #[test]
    fn test_field_element_minus_polynomial() {
        let element = FE::new(5);

        // Polynomial: 1 + 2x
        let polynomial =
            BivariatePolynomial::new(array![[FE::new(1), FE::new(2)], [FE::new(0), FE::new(0)],]);

        // Expected result: (5 - 1) + 2x = 4 + 2x
        let expected_coeffs = array![[FE::new(4), FE::new(2)], [FE::new(0), FE::new(0)],];

        let result = &element - &polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_owned_field_element_minus_borrowed_polynomial() {
        let element = FE::new(5);

        // Polynomial: 1 + 2x
        let polynomial = BivariatePolynomial::new(array![[FE::new(1), FE::new(2)]]);

        // Expected result: (5 - 1) + 2x = 4 + 2x
        let expected_coeffs = array![[FE::new(4), FE::new(2)]];

        let result = element - &polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_owned_field_element_minus_owned_polynomial() {
        let element = FE::new(5);

        // Polynomial: 1 + 2x
        let polynomial = BivariatePolynomial::new(array![[FE::new(1), FE::new(2)]]);

        // Expected result: (5 - 1) + 2x = 4 + 2x
        let expected_coeffs = array![[FE::new(4), FE::new(2)]];

        let result = element - polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_owned_field_element_minus_empty_polynomial() {
        let element = FE::new(5);

        // Empty polynomial
        let polynomial = BivariatePolynomial::new(array![[]]);

        // Expected result: 5
        let expected_coeffs = array![[FE::new(5)]];

        let result = element - polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_borrowed_field_element_minus_owned_polynomial_2d() {
        let element = FE::new(5);

        // Polynomial: 1 + 2x + 3y + 4xy (2D array)
        let polynomial = BivariatePolynomial::new(array![
            [FE::new(1), FE::new(2)], // 1 + 2x
            [FE::new(3), FE::new(4)], // 3y + 4xy
        ]);

        // Expected result: (5 - 1) + 2x + 3y + 4xy = 4 + 2x + 3y + 4xy
        let expected_coeffs = array![
            [FE::new(4), FE::new(2)], // 4 + 2x
            [FE::new(3), FE::new(4)], // 3y + 4xy
        ];

        let result = &element - polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_borrowed_field_element_minus_empty_polynomial_2d() {
        let element = FE::new(5);

        // Empty polynomial
        let polynomial = BivariatePolynomial::new(array![[]]);

        // Expected result: 5 (in a 1x1 2D array)
        let expected_coeffs = array![[FE::new(5)]];

        let result = &element - polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_borrowed_field_element_minus_owned_polynomial_with_zeros() {
        let element = FE::new(5);

        // Polynomial: 0 + 0x + 0y + 0xy (all coefficients are zero)
        let polynomial = BivariatePolynomial::new(array![
            [FE::zero(), FE::zero()], // 0 + 0x
            [FE::zero(), FE::zero()], // 0y + 0xy
        ]);

        // Expected result: 5 (in a 2x2 2D array with 5 in the top-left corner)
        let expected_coeffs = array![
            [FE::new(5), FE::zero()], // 5 + 0x
            [FE::zero(), FE::zero()], // 0y + 0xy
        ];

        let result = &element - polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_borrowed_field_element_plus_borrowed_polynomial_2d() {
        let element = FE::new(5);

        // Polynomial: 1 + 2x + 3y + 4xy (2D array)
        let polynomial = BivariatePolynomial::new(array![
            [FE::new(1), FE::new(2)], // 1 + 2x
            [FE::new(3), FE::new(4)], // 3y + 4xy
        ]);

        // Expected result: (5 + 1) + 2x + 3y + 4xy = 6 + 2x + 3y + 4xy
        let expected_coeffs = array![
            [FE::new(6), FE::new(2)], // 6 + 2x
            [FE::new(3), FE::new(4)], // 3y + 4xy
        ];

        let result = &element + &polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_borrowed_polynomial_plus_borrowed_field_element_2d() {
        let element = FE::new(5);

        // Polynomial: 1 + 2x + 3y + 4xy (2D array)
        let polynomial = BivariatePolynomial::new(array![
            [FE::new(1), FE::new(2)], // 1 + 2x
            [FE::new(3), FE::new(4)], // 3y + 4xy
        ]);

        // Expected result: (5 + 1) + 2x + 3y + 4xy = 6 + 2x + 3y + 4xy
        let expected_coeffs = array![
            [FE::new(6), FE::new(2)], // 6 + 2x
            [FE::new(3), FE::new(4)], // 3y + 4xy
        ];

        let result = &element + &polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_borrowed_field_element_plus_empty_polynomial_2d() {
        let element = FE::new(5);

        // Empty polynomial
        let polynomial = BivariatePolynomial::new(array![[]]);

        // Expected result: 5 (in a 1x1 2D array)
        let expected_coeffs = array![[FE::new(5)]];

        let result = &element + &polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_borrowed_field_element_plus_polynomial_with_zeros() {
        let element = FE::new(5);

        // Polynomial: 0 + 0x + 0y + 0xy (all coefficients are zero)
        let polynomial = BivariatePolynomial::new(array![
            [FE::zero(), FE::zero()], // 0 + 0x
            [FE::zero(), FE::zero()], // 0y + 0xy
        ]);

        // Expected result: 5 (in a 2x2 2D array with 5 in the top-left corner)
        let expected_coeffs = array![
            [FE::new(5), FE::zero()], // 5 + 0x
            [FE::zero(), FE::zero()], // 0y + 0xy
        ];

        let result = &element + &polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_owned_field_element_plus_borrowed_polynomial_2d() {
        let element = FE::new(5);

        // Polynomial: 1 + 2x + 3y + 4xy (2D array)
        let polynomial = BivariatePolynomial::new(array![
            [FE::new(1), FE::new(2)], // 1 + 2x
            [FE::new(3), FE::new(4)], // 3y + 4xy
        ]);

        // Expected result: (5 + 1) + 2x + 3y + 4xy = 6 + 2x + 3y + 4xy
        let expected_coeffs = array![
            [FE::new(6), FE::new(2)], // 6 + 2x
            [FE::new(3), FE::new(4)], // 3y + 4xy
        ];

        let result = element + &polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_owned_field_element_plus_empty_polynomial_2d_own_ref() {
        let element = FE::new(5);

        // Empty polynomial
        let polynomial = BivariatePolynomial::new(array![[]]);

        // Expected result: 5 (in a 1x1 2D array)
        let expected_coeffs = array![[FE::new(5)]];

        let result = element + &polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_owned_field_element_plus_owned_polynomial_2d_own_own() {
        let element = FE::new(5);

        // Polynomial: 1 + 2x + 3y + 4xy (2D array)
        let polynomial = BivariatePolynomial::new(array![
            [FE::new(1), FE::new(2)], // 1 + 2x
            [FE::new(3), FE::new(4)], // 3y + 4xy
        ]);

        // Expected result: (5 + 1) + 2x + 3y + 4xy = 6 + 2x + 3y + 4xy
        let expected_coeffs = array![
            [FE::new(6), FE::new(2)], // 6 + 2x
            [FE::new(3), FE::new(4)], // 3y + 4xy
        ];

        let result = element + polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_owned_field_element_plus_empty_polynomial_2d() {
        let element = FE::new(5);

        // Empty polynomial
        let polynomial = BivariatePolynomial::new(array![[]]);

        // Expected result: 5 (in a 1x1 2D array)
        let expected_coeffs = array![[FE::new(5)]];

        let result = element + polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_owned_field_element_plus_polynomial_with_zeros() {
        let element = FE::new(5);

        // Polynomial: 0 + 0x + 0y + 0xy (all coefficients are zero)
        let polynomial = BivariatePolynomial::new(array![
            [FE::zero(), FE::zero()], // 0 + 0x
            [FE::zero(), FE::zero()], // 0y + 0xy
        ]);

        // Expected result: 5 (in a 2x2 2D array with 5 in the top-left corner)
        let expected_coeffs = array![
            [FE::new(5), FE::zero()], // 5 + 0x
            [FE::zero(), FE::zero()], // 0y + 0xy
        ];

        let result = element + polynomial;

        assert_eq!(expected_coeffs, result.coefficients);
    }

    #[test]
    fn test_borrowed_field_element_plus_owned_polynomial_2d() {
        let element = FE::new(5);

        // Polynomial: 1 + 2x + 3y + 4xy (2D array)
        let polynomial = BivariatePolynomial::new(array![
            [FE::new(1), FE::new(2)], // 1 + 2x
            [FE::new(3), FE::new(4)], // 3y + 4xy
        ]);

        // Expected result: (5 + 1) + 2x + 3y + 4xy = 6 + 2x + 3y + 4xy
        let expected_coeffs = array![
            [FE::new(6), FE::new(2)], // 6 + 2x
            [FE::new(3), FE::new(4)], // 3y + 4xy
        ];

        let result = &element + polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_borrowed_field_element_plus_owned_empty_polynomial_2d() {
        let element = FE::new(5);

        // Empty polynomial
        let polynomial = BivariatePolynomial::new(array![[]]);

        // Expected result: 5 (in a 1x1 2D array)
        let expected_coeffs = array![[FE::new(5)]];

        let result = &element + polynomial;

        assert_eq!(result.coefficients, expected_coeffs);
    }

    #[test]
    fn test_borrowed_field_element_plus_owned_polynomial_with_zeros() {
        let element = FE::new(5);

        // Polynomial: 0 + 0x + 0y + 0xy (all coefficients are zero)
        let polynomial = BivariatePolynomial::new(array![
            [FE::zero(), FE::zero()], // 0 + 0x
            [FE::zero(), FE::zero()], // 0y + 0xy
        ]);

        // Expected result: 5 (in a 2x2 2D array with 5 in the top-left corner)
        let expected_coeffs = array![
            [FE::new(5), FE::zero()], // 5 + 0x
            [FE::zero(), FE::zero()], // 0y + 0xy
        ];

        let result = &element + polynomial;

        assert_eq!(result.coefficients, expected_coeffs)
    }

    #[test] 
    fn test_multiply_poly_with_field_element() {
        let element = FE::new(2);
        // Polynomial: 1 + 2x + 3y + 4xy (2D array)
        let polynomial = BivariatePolynomial::new(array![
            [FE::new(1), FE::new(2)], // 1 + 2x
            [FE::new(3), FE::new(4)], // 3y + 4xy
        ]);

        let m_polynomial = element * polynomial ; 
        
        let expected_poly = BivariatePolynomial::new(array![
            [FE::new(2), FE::new(4)], // 1 + 2x
            [FE::new(6), FE::new(8)], // 3y + 4xy
        ]);
        assert_eq!(m_polynomial, expected_poly)

    }


    #[test]
    fn test_polynomial_display() {
        use ndarray::array;

        let coeffs = array![[FE::new(1), FE::new(2)], [FE::new(3), FE::new(0)]];
        let poly = BivariatePolynomial::new(coeffs);

        let expected_str = "Degree in X: 1\nDegree in Y: 1\nPolynomial: 1 + 2*X + 3*Y";
        assert_eq!(poly.to_string(), expected_str);
    }



    #[test]
    fn test_polynomial_display_degree_5() {


        let coeffs = array![
            [FE::new(1), FE::new(2), FE::new(0), FE::new(0), FE::new(0), FE::new(0)], // Constant, X, X^2, X^3, X^4, X^5
            [FE::new(3), FE::new(0), FE::new(4), FE::new(0), FE::new(0), FE::new(0)], // Y, XY, X^2Y, X^3Y, X^4Y, X^5Y
            [FE::new(0), FE::new(0), FE::new(5), FE::new(0), FE::new(0), FE::new(0)], // Y^2, XY^2, X^2Y^2, ...
            [FE::new(0), FE::new(0), FE::new(0), FE::new(6), FE::new(0), FE::new(0)], // Y^3, XY^3, X^2Y^3, X^3Y^3
            [FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(7), FE::new(0)], // Y^4, ...
            [FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(8)]  // Y^5
        ];

        let poly = BivariatePolynomial::new(coeffs);

        let expected_output = "Degree in X: 5\nDegree in Y: 5\nPolynomial: 1 + 2*X + 3*Y + 4*X^2*Y + 5*X^2*Y^2 + 6*X^3*Y^3 + 7*X^4*Y^4 + 8*X^5*Y^5";

        assert_eq!(format!("{}", poly), expected_output);
    }

    #[test]
    fn test_polynomial_dimension_in_tuple() {
        let coeffs = array![
            [FE::new(1), FE::new(2), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0)], // Constant, X, X^2, X^3, X^4, X^5
            [FE::new(3), FE::new(0), FE::new(4), FE::new(0), FE::new(0), FE::new(0), FE::new(0)], // Y, XY, X^2Y, X^3Y, X^4Y, X^5Y
            [FE::new(0), FE::new(0), FE::new(5), FE::new(0), FE::new(0), FE::new(0), FE::new(0)], // Y^2, XY^2, X^2Y^2, ...
            [FE::new(0), FE::new(0), FE::new(0), FE::new(6), FE::new(0), FE::new(0), FE::new(0)], // Y^3, XY^3, X^2Y^3, X^3Y^3
            [FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(7), FE::new(0), FE::new(0)], // Y^4, ...
            [FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(8), FE::new(0), FE::new(0)], // Y^5
            [FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0)],  // Y^5
            [FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0), FE::new(0)]  // Y^5


        ];

        let poly = BivariatePolynomial::new(coeffs);

        assert_eq!(poly.polynomial_dimension(), (4, 5))
    }



}