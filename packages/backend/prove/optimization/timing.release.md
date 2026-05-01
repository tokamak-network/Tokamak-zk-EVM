# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 51.330780 s |

## Timing Boundaries

- `encode` includes only the MSM call inside polynomial encoding.
- Polynomial work needed before encoding is reported under `poly`, usually as `combine`, `add`, `mul`, or `eval`.
- `div_by_vanishing_opt` and `div_by_ruffini` include only the division calls; numerator construction is reported separately under `poly`.
- Raw JSON may contain `encode_call` spans for outer diagnostics, but they are excluded from the encode summary tables.
- `poly_detail` breaks down operations executed inside `poly.combine.*` spans and is excluded from `poly` totals to avoid double-counting.

## Setup Parameters

| param | value |
| --- | --- |
| l_free | 128 |
| l | 728 |
| l_user_out | 65 |
| l_user | 85 |
| l_D | 4824 |
| m_D | 26591 |
| n | 4096 |
| s_D | 14 |
| s_max | 256 |

## Module Times (init + prove0~prove4)

| module | total | poly | encode |
| --- | --- | --- | --- |
| init | 5.013148 s | - | - |
| prove0 | 9.883899 s | 1.278876 s | 7.866113 s |
| prove1 | 2.401104 s | 0.923968 s | 1.375581 s |
| prove2 | 13.924911 s | 6.421116 s | 6.540102 s |
| prove3 | 1.532830 s | 1.122610 s | 0.000000 s |
| prove4 | 18.564807 s | 8.914732 s | 9.017667 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.008295 s | A_free=128x1 |
| build | O_mid_core | 0.085237 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.884200 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.001408 s | O_pub_free=128x1 |
| build | a_free_X | 0.000064 s | a_free_X=128x1 |
| build | bXY | 0.057328 s | bXY=4096x256 |
| build | s0_s1 | 0.110953 s | s0/s1=4096x256 |
| build | t_mi | 0.000007 s | t_mi=8192x1 |
| build | t_n | 0.000007 s | t_n=8192x1 |
| build | t_smax | 0.000001 s | t_smax=1x512 |
| build | uvwXY | 0.196103 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000242 s | file_bytes=10284 |
| load | permutation | 0.002025 s | file_bytes=251784 |
| load | placement_variables | 0.051904 s | file_bytes=18449792 |
| load | setup_params | 0.000053 s | file_bytes=140 |
| load | sigma | 0.002081 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.001634 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 18.661302 s |
| encode | 24.801482 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.055718 s |
| combine | 10.261505 s |
| div_by_ruffini | 1.372518 s |
| div_by_vanishing_opt | 0.246055 s |
| eval | 5.743946 s |
| from_rou_evals | 0.054402 s |
| mul | 0.011301 s |
| recursion_eval | 0.743505 s |
| scale_coeffs | 0.071690 s |
| to_rou_evals | 0.100664 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.007921 s | R=4096x256 |
| add | prove4 | N_numerator | 0.007975 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000009 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.015245 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.010751 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.009145 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.004670 s | gXY=4096x256 |
| combine | prove0 | B | 0.028718 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.171763 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.132528 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.029997 s | U=4096x256 |
| combine | prove0 | V | 0.024313 s | V=4096x256 |
| combine | prove0 | W | 0.027134 s | W=4096x256 |
| combine | prove0 | p0XY | 0.780686 s | p0XY=4096x256 |
| combine | prove1 | R | 0.027298 s | R=4096x256 |
| combine | prove2 | Q_CX | 0.579503 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 0.912663 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 4.750750 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.141274 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 0.256148 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.315232 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.186909 s | uXY=4096x256 |
| combine | prove4 | V | 0.024021 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.018404 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.007989 s | bXY=4096x256 |
| combine | prove4 | pC | 0.701745 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.017064 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.127366 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.297973 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.292875 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.311943 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.001235 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.468491 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.083737 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.162318 s | vanishing=4096x256 |
| eval | prove3 | R | 0.360018 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.360181 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.360726 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.001143 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.001152 s | K0=4096x1 |
| eval | prove4 | R | 0.979584 s | R=4096x256 |
| eval | prove4 | R_omegaX | 1.018808 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 1.139135 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.687143 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.458158 s | R=4096x256 |
| eval | prove4 | t_n | 0.001059 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.228573 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.148266 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.052500 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.000651 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000635 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000043 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.000573 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.000508 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000480 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.010313 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.743505 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.007601 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.006954 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.017194 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.024492 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.007208 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.008242 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.051567 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.049096 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| add_clone_operands | 0.002384 s |
| add_construct_result | 0.000000 s |
| add_icicle_add | 0.003441 s |
| add_same_stride_icicle_add | 0.169110 s |
| add_transpose_add_sub | 0.054609 s |
| add_transpose_inputs | 0.099538 s |
| add_transpose_output | 0.223067 s |
| add_transpose_same_stride_icicle_add | 0.054530 s |
| add_y_align_resize | 0.380468 s |
| add_y_align_same_stride_icicle_add | 0.344403 s |
| addassign_clone_operands | 0.147908 s |
| addassign_icicle_add | 0.079695 s |
| addassign_update_metadata | 0.000000 s |
| addition | 1.648427 s |
| mul_alloc_lhs_evals | 0.000026 s |
| mul_alloc_out_evals | 0.000050 s |
| mul_alloc_rhs_evals | 0.000039 s |
| mul_clone_resize_lhs | 0.065055 s |
| mul_clone_resize_rhs | 0.060763 s |
| mul_compute_target_size | 0.000000 s |
| mul_find_lhs_degree | 0.008493 s |
| mul_find_rhs_degree | 0.025725 s |
| mul_from_rou_evals | 2.396396 s |
| mul_icicle_eval_mul | 0.071668 s |
| mul_lhs_to_rou_evals | 2.543704 s |
| mul_rhs_to_rou_evals | 2.377587 s |
| mul_setup_vec_ops | 0.000003 s |
| multiplication | 7.549808 s |
| scalar_add_alloc_host | 0.000578 s |
| scalar_add_clone_coeffs | 0.001619 s |
| scalar_add_copy_coeffs | 0.001493 s |
| scalar_add_from_coeffs | 0.001370 s |
| scalar_add_update_constant | 0.000001 s |
| scalar_mul_alloc_input | 0.000393 s |
| scalar_mul_alloc_output | 0.000267 s |
| scalar_mul_copy_coeffs | 0.123782 s |
| scalar_mul_from_coeffs | 0.109192 s |
| scalar_mul_icicle_scalar_mul | 0.688259 s |
| scalar_mul_one_clone | 0.036586 s |
| scalar_mul_setup | 0.000088 s |
| scalar_sub_alloc_host | 0.001332 s |
| scalar_sub_clone_coeffs | 0.002901 s |
| scalar_sub_copy_coeffs | 0.002831 s |
| scalar_sub_from_coeffs | 0.003112 s |
| scalar_sub_update_constant | 0.000001 s |
| scaling | 0.959163 s |
| sub_clone_operands | 0.008848 s |
| sub_construct_result | 0.000000 s |
| sub_icicle_sub | 0.007224 s |
| sub_same_stride_icicle_sub | 0.089702 s |
| sub_y_align_resize | 0.013694 s |
| sub_y_align_same_stride_icicle_sub | 0.007649 s |

## Poly Combine Detail By Target

| module | variable | add_clone_operands | add_construct_result | add_icicle_add | add_same_stride_icicle_add | add_transpose_add_sub | add_transpose_inputs | add_transpose_output | add_transpose_same_stride_icicle_add | add_y_align_resize | add_y_align_same_stride_icicle_add | addassign_clone_operands | addassign_icicle_add | addassign_update_metadata | addition | mul_alloc_lhs_evals | mul_alloc_out_evals | mul_alloc_rhs_evals | mul_clone_resize_lhs | mul_clone_resize_rhs | mul_compute_target_size | mul_find_lhs_degree | mul_find_rhs_degree | mul_from_rou_evals | mul_icicle_eval_mul | mul_lhs_to_rou_evals | mul_rhs_to_rou_evals | mul_setup_vec_ops | multiplication | scalar_add_alloc_host | scalar_add_clone_coeffs | scalar_add_copy_coeffs | scalar_add_from_coeffs | scalar_add_update_constant | scalar_mul_alloc_input | scalar_mul_alloc_output | scalar_mul_copy_coeffs | scalar_mul_from_coeffs | scalar_mul_icicle_scalar_mul | scalar_mul_one_clone | scalar_mul_setup | scalar_sub_alloc_host | scalar_sub_clone_coeffs | scalar_sub_copy_coeffs | scalar_sub_from_coeffs | scalar_sub_update_constant | scaling | sub_clone_operands | sub_construct_result | sub_icicle_sub | sub_same_stride_icicle_sub | sub_y_align_resize | sub_y_align_same_stride_icicle_sub | total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| prove0 | B | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.013778 s | 0.012712 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.026512 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.053002 s |
| prove0 | Q_AX | 0.000000 s | 0.000000 s | 0.000000 s | 0.006971 s | 0.005572 s | 0.008723 s | 0.104346 s | 0.005567 s | 0.015838 s | 0.019649 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.161162 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000018 s | 0.000003 s | 0.001070 s | 0.001061 s | 0.006267 s | 0.002151 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010588 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.348991 s |
| prove0 | Q_AY | 0.000000 s | 0.000000 s | 0.000000 s | 0.005382 s | 0.009335 s | 0.020208 s | 0.059288 s | 0.009319 s | 0.011435 s | 0.012903 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.118602 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000012 s | 0.000004 s | 0.001110 s | 0.001117 s | 0.007763 s | 0.003880 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.013909 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.274270 s |
| prove0 | U | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.014535 s | 0.013746 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.028303 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000003 s | 0.000003 s | 0.000019 s | 0.000022 s | 0.001088 s | 0.000544 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001688 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.059952 s |
| prove0 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.013106 s | 0.009571 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.022697 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000003 s | 0.000008 s | 0.000007 s | 0.000011 s | 0.001037 s | 0.000537 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001610 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.048588 s |
| prove0 | W | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010340 s | 0.014612 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.024974 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.049926 s |
| prove0 | p0XY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.021356 s | 0.000002 s | 0.000003 s | 0.000001 s | 0.019474 s | 0.006324 s | 0.000000 s | 0.004147 s | 0.001979 s | 0.237125 s | 0.006862 s | 0.250934 s | 0.232441 s | 0.000000 s | 0.759328 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.013694 s | 0.007649 s | 1.561318 s |
| prove1 | R | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012403 s | 0.013627 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.026056 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000002 s | 0.000001 s | 0.000033 s | 0.000010 s | 0.001186 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001239 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.054556 s |
| prove2 | Q_CX | 0.000000 s | 0.000000 s | 0.000000 s | 0.015884 s | 0.014435 s | 0.025473 s | 0.021213 s | 0.014425 s | 0.028901 s | 0.032905 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.146814 s | 0.000003 s | 0.000006 s | 0.000012 s | 0.002138 s | 0.001386 s | 0.000000 s | 0.000101 s | 0.002516 s | 0.108708 s | 0.004370 s | 0.130065 s | 0.109004 s | 0.000000 s | 0.358341 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000043 s | 0.000021 s | 0.008968 s | 0.010153 s | 0.034972 s | 0.004952 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.059160 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.007917 s | 0.000000 s | 0.000000 s | 1.142890 s |
| prove2 | Q_CY | 0.000000 s | 0.000000 s | 0.000000 s | 0.007109 s | 0.019682 s | 0.035898 s | 0.027563 s | 0.019642 s | 0.000000 s | 0.000000 s | 0.005010 s | 0.004159 s | 0.000000 s | 0.106412 s | 0.000002 s | 0.000006 s | 0.000005 s | 0.003270 s | 0.007082 s | 0.000000 s | 0.000096 s | 0.003335 s | 0.241188 s | 0.007706 s | 0.223622 s | 0.249431 s | 0.000000 s | 0.735773 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000026 s | 0.000026 s | 0.010204 s | 0.009641 s | 0.034413 s | 0.001394 s | 0.000007 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.055759 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006923 s | 0.000000 s | 0.000000 s | 1.815384 s |
| prove2 | p_comb | 0.000000 s | 0.000000 s | 0.000000 s | 0.019457 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010524 s | 0.008633 s | 0.000000 s | 0.092041 s | 0.000011 s | 0.000030 s | 0.000011 s | 0.033569 s | 0.040160 s | 0.000000 s | 0.003984 s | 0.007620 s | 1.523962 s | 0.044112 s | 1.452812 s | 1.444862 s | 0.000002 s | 4.551295 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000016 s | 0.000019 s | 0.013075 s | 0.009950 s | 0.032754 s | 0.014667 s | 0.000001 s | 0.000255 s | 0.000507 s | 0.000510 s | 0.000560 s | 0.000000 s | 0.070503 s | 0.008848 s | 0.000000 s | 0.007224 s | 0.035483 s | 0.000000 s | 0.000000 s | 9.427457 s |
| prove4 | LHS_for_copy | 0.000000 s | 0.000000 s | 0.000000 s | 0.031745 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.011065 s | 0.009256 s | 0.000000 s | 0.052097 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000032 s | 0.000035 s | 0.016546 s | 0.015592 s | 0.056897 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.089151 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.282418 s |
| prove4 | LHS_zk1 | 0.000000 s | 0.000000 s | 0.000000 s | 0.024520 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.043619 s | 0.053978 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.161580 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000050 s | 0.000025 s | 0.007681 s | 0.009623 s | 0.044206 s | 0.007884 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.069544 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.039379 s | 0.000000 s | 0.000000 s | 0.462092 s |
| prove4 | LHS_zk2 | 0.000000 s | 0.000000 s | 0.000000 s | 0.004212 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.029662 s | 0.042040 s | 0.005471 s | 0.004998 s | 0.000000 s | 0.086449 s | 0.000008 s | 0.000006 s | 0.000010 s | 0.006605 s | 0.005811 s | 0.000000 s | 0.000165 s | 0.010275 s | 0.285414 s | 0.008618 s | 0.486271 s | 0.341849 s | 0.000000 s | 1.145071 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000031 s | 0.000026 s | 0.014470 s | 0.009207 s | 0.052278 s | 0.000000 s | 0.000006 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.076063 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 2.615015 s |
| prove4 | Pi_A | 0.000000 s | 0.000000 s | 0.000000 s | 0.012846 s | 0.005584 s | 0.009237 s | 0.010657 s | 0.005576 s | 0.026068 s | 0.033504 s | 0.009475 s | 0.009046 s | 0.000000 s | 0.124901 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000055 s | 0.000026 s | 0.016320 s | 0.010153 s | 0.035352 s | 0.000000 s | 0.000008 s | 0.001077 s | 0.002394 s | 0.002321 s | 0.002553 s | 0.000000 s | 0.061963 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.379117 s |
| prove4 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012290 s | 0.010091 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.022405 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000002 s | 0.000001 s | 0.000007 s | 0.000009 s | 0.001004 s | 0.000576 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001610 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.047997 s |
| prove4 | fXY | 0.002384 s | 0.000000 s | 0.003441 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008438 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000285 s | 0.000957 s | 0.000708 s | 0.000652 s | 0.000000 s | 0.000016 s | 0.000010 s | 0.001577 s | 0.001239 s | 0.007060 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.009915 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.036681 s |
| prove4 | gXY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001089 s | 0.003507 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.007068 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000292 s | 0.000662 s | 0.000785 s | 0.000718 s | 0.000001 s | 0.000002 s | 0.000000 s | 0.000002 s | 0.000004 s | 0.000904 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000917 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.015951 s |
| prove4 | pC | 0.000000 s | 0.000000 s | 0.000000 s | 0.040984 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.147405 s | 0.071557 s | 0.010650 s | 0.029668 s | 0.000000 s | 0.300319 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000043 s | 0.000046 s | 0.029935 s | 0.025784 s | 0.345383 s | 0.000000 s | 0.000050 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.401375 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.403200 s |
| prove4 | term5 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001320 s | 0.002862 s | 0.000000 s | 0.004186 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000030 s | 0.000007 s | 0.001381 s | 0.001405 s | 0.010015 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012868 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.034076 s |
| prove4 | term6 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.094393 s | 0.011073 s | 0.000000 s | 0.106054 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000010 s | 0.000006 s | 0.001378 s | 0.004209 s | 0.015680 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.021300 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.254103 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.002018 s | msm=128x1 |
| prove0 | B | 1.146169 s | msm=4825x258 |
| prove0 | Q_AX | 2.211372 s | msm=4097x511 |
| prove0 | Q_AY | 1.149822 s | msm=4097x257 |
| prove0 | U | 1.148652 s | msm=4097x257 |
| prove0 | V | 1.142059 s | msm=4097x257 |
| prove0 | W | 1.068040 s | msm=4099x259 |
| prove1 | R | 1.375581 s | msm=4097x257 |
| prove2 | Q_CX | 4.284292 s | msm=8192x511 |
| prove2 | Q_CY | 2.255810 s | msm=8191x257 |
| prove4 | M_X | 1.097598 s | msm=4096x256 |
| prove4 | M_Y | 0.001552 s | msm=1x256 |
| prove4 | N_X | 1.529627 s | msm=4096x256 |
| prove4 | N_Y | 0.002126 s | msm=1x256 |
| prove4 | Pi_AX | 2.238597 s | msm=4098x511 |
| prove4 | Pi_AY | 0.002396 s | msm=1x510 |
| prove4 | Pi_B | 0.001290 s | msm=127x1 |
| prove4 | Pi_CX | 4.141629 s | msm=8191x511 |
| prove4 | Pi_CY | 0.002853 s | msm=1x510 |
