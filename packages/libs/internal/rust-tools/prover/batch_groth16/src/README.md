# Batch Groth16 - Tokamak Ooo Project 

here we can set the subcircuits with their order. I think map is the best choice for our problem . 

so we need to call the setup_subcircuits in the following way 

["1", "tests/first_subcircuits.??? "]

the second problem how I need to deal with the problem , I think using methodology for circom adapter is good. it need a witness and r1cs 


QAP from lambda is very helpful . getting QAP polynomial from r1cs is easy . also scale_and_accumulate_variable_polynomials multiply qap polynomial with witnesses 

in this step it is one dimentional vector<FieldElement> and now I should multiply it with Lagrange basis. so now I have to multiply each of elements in the coefficient of Y^n so we have n vector of vector ,


now we have n*m matrix which is a bivariate polynomial . next step I need to multiply 2 polynomials, so I need to zero pad it 


IFFT on [0,...,0,1,0,...,0] should be calculated here 









