# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 24.682780 s |

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
| init | 0.748638 s | - | - |
| prove0 | 5.186830 s | 3.067459 s | 0.427519 s |
| prove1 | 0.797343 s | 0.362966 s | 0.064158 s |
| prove2 | 9.086046 s | 7.189995 s | 0.334164 s |
| prove3 | 0.855464 s | 0.522756 s | 0.000000 s |
| prove4 | 7.999111 s | 5.650184 s | 0.439722 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.014071 s | A_free=128x1 |
| build | O_mid_core | 0.016467 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.231320 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010165 s | O_pub_free=128x1 |
| build | a_free_X | 0.000317 s | a_free_X=128x1 |
| build | bXY | 0.028527 s | bXY=4096x256 |
| build | s0_s1 | 0.056796 s | s0/s1=4096x256 |
| build | t_mi | 0.000038 s | t_mi=8192x1 |
| build | t_n | 0.000064 s | t_n=8192x1 |
| build | t_smax | 0.000015 s | t_smax=1x512 |
| build | uvwXY | 0.287435 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000094 s | file_bytes=10284 |
| load | permutation | 0.000870 s | file_bytes=251784 |
| load | placement_variables | 0.087584 s | file_bytes=18449792 |
| load | setup_params | 0.000015 s | file_bytes=140 |
| load | sigma | 0.000122 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000617 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 16.793361 s |
| encode | 1.278846 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.573025 s |
| combine | 12.193201 s |
| div_by_ruffini | 1.539355 s |
| div_by_vanishing_opt | 1.334533 s |
| eval | 0.269090 s |
| from_rou_evals | 0.011818 s |
| mul | 0.007066 s |
| recursion_eval | 0.141496 s |
| scale_coeffs | 0.649927 s |
| to_rou_evals | 0.073849 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.133342 s | R=4096x256 |
| add | prove4 | N_numerator | 0.137043 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000054 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.111477 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.027596 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.163129 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.000385 s | gXY=4096x256 |
| combine | prove0 | B | 0.195282 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.519076 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.395113 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.270559 s | U=4096x256 |
| combine | prove0 | V | 0.139038 s | V=4096x256 |
| combine | prove0 | W | 0.298119 s | W=4096x256 |
| combine | prove0 | p0XY | 0.790392 s | p0XY=4096x256 |
| combine | prove1 | R | 0.139306 s | R=4096x256 |
| combine | prove2 | Q_CX | 1.257638 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 1.320708 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 3.612758 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.154375 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 0.778245 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.007425 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.854335 s | uXY=4096x256 |
| combine | prove4 | V | 0.135800 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.039257 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.064302 s | bXY=4096x256 |
| combine | prove4 | pC | 0.204474 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.007841 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009160 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.295663 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.299265 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.312771 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.000582 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.631074 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.459880 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.874653 s | vanishing=4096x256 |
| eval | prove3 | R | 0.036457 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034887 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034370 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.041456 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.000211 s | K0=4096x1 |
| eval | prove4 | R | 0.015237 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015194 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015180 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015795 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015183 s | R=4096x256 |
| eval | prove4 | t_n | 0.006343 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.023769 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015009 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.008316 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001105 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000900 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000391 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.001106 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.004776 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000277 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.002013 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.141496 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.075442 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.046401 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.219976 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.197067 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.065571 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.045469 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.036899 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.036950 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| add_clone_operands | 0.002002 s |
| add_construct_result | 0.000000 s |
| add_icicle_add | 0.000145 s |
| add_rowwise_construct_result | 0.031205 s |
| add_rowwise_copy_inputs | 0.081618 s |
| add_rowwise_vec_ops | 4.423844 s |
| add_same_stride_icicle_add | 0.054487 s |
| addassign_clone_operands | 0.051853 s |
| addassign_icicle_add | 0.001458 s |
| addassign_update_metadata | 0.000001 s |
| addition | 5.256315 s |
| mul_alloc_lhs_evals | 0.001616 s |
| mul_alloc_out_evals | 0.001286 s |
| mul_alloc_rhs_evals | 0.001375 s |
| mul_clone_resize_lhs | 0.718158 s |
| mul_clone_resize_rhs | 0.776266 s |
| mul_compute_target_size | 0.000002 s |
| mul_find_lhs_degree | 0.129242 s |
| mul_find_rhs_degree | 0.280795 s |
| mul_from_rou_evals | 0.327338 s |
| mul_icicle_eval_mul | 0.119598 s |
| mul_lhs_to_rou_evals | 1.015592 s |
| mul_optimize_size | 0.612561 s |
| mul_rhs_to_rou_evals | 1.015273 s |
| mul_setup_vec_ops | 0.000004 s |
| multiplication | 5.020921 s |
| scalar_add_alloc_host | 0.021751 s |
| scalar_add_clone_coeffs | 0.024776 s |
| scalar_add_copy_coeffs | 0.007039 s |
| scalar_add_from_coeffs | 0.005725 s |
| scalar_add_update_constant | 0.000001 s |
| scalar_mul_alloc_input | 0.054828 s |
| scalar_mul_alloc_output | 0.040296 s |
| scalar_mul_copy_coeffs | 0.275166 s |
| scalar_mul_from_coeffs | 0.051595 s |
| scalar_mul_icicle_scalar_mul | 0.238054 s |
| scalar_mul_one_clone | 0.023032 s |
| scalar_mul_setup | 0.000030 s |
| scalar_sub_alloc_host | 0.056545 s |
| scalar_sub_clone_coeffs | 0.064755 s |
| scalar_sub_copy_coeffs | 0.017001 s |
| scalar_sub_from_coeffs | 0.016226 s |
| scalar_sub_update_constant | 0.000001 s |
| scaling | 0.683432 s |
| sub_clone_operands | 0.009668 s |
| sub_construct_result | 0.000000 s |
| sub_icicle_sub | 0.000318 s |
| sub_rowwise_construct_result | 0.000817 s |
| sub_rowwise_copy_inputs | 0.004000 s |
| sub_rowwise_vec_ops | 0.243792 s |
| sub_same_stride_icicle_sub | 0.009495 s |

## Poly Combine Detail By Target

| module | variable | add_clone_operands | add_construct_result | add_icicle_add | add_rowwise_construct_result | add_rowwise_copy_inputs | add_rowwise_vec_ops | add_same_stride_icicle_add | addassign_clone_operands | addassign_icicle_add | addassign_update_metadata | addition | mul_alloc_lhs_evals | mul_alloc_out_evals | mul_alloc_rhs_evals | mul_clone_resize_lhs | mul_clone_resize_rhs | mul_compute_target_size | mul_find_lhs_degree | mul_find_rhs_degree | mul_from_rou_evals | mul_icicle_eval_mul | mul_lhs_to_rou_evals | mul_optimize_size | mul_rhs_to_rou_evals | mul_setup_vec_ops | multiplication | scalar_add_alloc_host | scalar_add_clone_coeffs | scalar_add_copy_coeffs | scalar_add_from_coeffs | scalar_add_update_constant | scalar_mul_alloc_input | scalar_mul_alloc_output | scalar_mul_copy_coeffs | scalar_mul_from_coeffs | scalar_mul_icicle_scalar_mul | scalar_mul_one_clone | scalar_mul_setup | scalar_sub_alloc_host | scalar_sub_clone_coeffs | scalar_sub_copy_coeffs | scalar_sub_from_coeffs | scalar_sub_update_constant | scaling | sub_clone_operands | sub_construct_result | sub_icicle_sub | sub_rowwise_construct_result | sub_rowwise_copy_inputs | sub_rowwise_vec_ops | sub_same_stride_icicle_sub | total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| prove0 | B | 0.000000 s | 0.000000 s | 0.000000 s | 0.001799 s | 0.001762 s | 0.181307 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.189337 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.374205 s |
| prove0 | Q_AX | 0.000000 s | 0.000000 s | 0.000000 s | 0.002955 s | 0.006524 s | 0.461378 s | 0.001162 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.485364 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004070 s | 0.002262 s | 0.018247 s | 0.001395 s | 0.002215 s | 0.000604 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.028828 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.015005 s |
| prove0 | Q_AY | 0.000000 s | 0.000000 s | 0.000000 s | 0.001937 s | 0.003880 s | 0.351971 s | 0.000870 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.369101 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.005048 s | 0.001073 s | 0.009912 s | 0.002099 s | 0.002209 s | 0.001313 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.021681 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.771097 s |
| prove0 | U | 0.000000 s | 0.000000 s | 0.000000 s | 0.001163 s | 0.000920 s | 0.261687 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.268938 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000953 s | 0.000007 s | 0.000037 s | 0.000066 s | 0.000129 s | 0.000283 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001487 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.535671 s |
| prove0 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.001138 s | 0.000941 s | 0.125799 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.133049 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001777 s | 0.000007 s | 0.000965 s | 0.000064 s | 0.000096 s | 0.002200 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.005123 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.271160 s |
| prove0 | W | 0.000000 s | 0.000000 s | 0.000000 s | 0.001850 s | 0.001792 s | 0.283718 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.291829 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.579188 s |
| prove0 | p0XY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.251953 s | 0.000177 s | 0.000141 s | 0.000153 s | 0.088502 s | 0.087732 s | 0.000001 s | 0.016367 s | 0.016452 s | 0.034990 s | 0.012955 s | 0.107072 s | 0.063603 s | 0.107982 s | 0.000000 s | 0.538434 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000817 s | 0.004000 s | 0.243792 s | 0.000000 s | 1.575123 s |
| prove1 | R | 0.000000 s | 0.000000 s | 0.000000 s | 0.001432 s | 0.003126 s | 0.128107 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.138195 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000885 s | 0.000006 s | 0.000032 s | 0.000038 s | 0.000052 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001023 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.272896 s |
| prove2 | Q_CX | 0.000000 s | 0.000000 s | 0.000000 s | 0.004223 s | 0.011211 s | 0.695293 s | 0.006552 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.730481 s | 0.000172 s | 0.000104 s | 0.000118 s | 0.030401 s | 0.000316 s | 0.000000 s | 0.012327 s | 0.033743 s | 0.016880 s | 0.004891 s | 0.052813 s | 0.031051 s | 0.053238 s | 0.000000 s | 0.238235 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.005173 s | 0.005033 s | 0.015723 s | 0.005689 s | 0.025525 s | 0.002118 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.059314 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001809 s | 2.042436 s |
| prove2 | Q_CY | 0.000000 s | 0.000000 s | 0.000000 s | 0.002018 s | 0.008278 s | 0.454196 s | 0.005250 s | 0.005510 s | 0.000156 s | 0.000000 s | 0.491051 s | 0.000180 s | 0.000141 s | 0.000158 s | 0.062762 s | 0.107663 s | 0.000000 s | 0.010044 s | 0.033711 s | 0.032844 s | 0.011219 s | 0.105049 s | 0.066122 s | 0.106660 s | 0.000000 s | 0.538911 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008096 s | 0.004875 s | 0.007741 s | 0.006014 s | 0.025399 s | 0.006477 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.058666 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001945 s | 2.161142 s |
| prove2 | p_comb | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012635 s | 0.012365 s | 0.000283 s | 0.000000 s | 0.068885 s | 0.000896 s | 0.000756 s | 0.000812 s | 0.473133 s | 0.579952 s | 0.000001 s | 0.086146 s | 0.129564 s | 0.207754 s | 0.078321 s | 0.645285 s | 0.385072 s | 0.640894 s | 0.000002 s | 3.241226 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002179 s | 0.002784 s | 0.022381 s | 0.004118 s | 0.031240 s | 0.004203 s | 0.000001 s | 0.011324 s | 0.012651 s | 0.003571 s | 0.003141 s | 0.000001 s | 0.066919 s | 0.009668 s | 0.000000 s | 0.000318 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002883 s | 6.741367 s |
| prove4 | LHS_for_copy | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.013279 s | 0.012376 s | 0.000316 s | 0.000000 s | 0.026001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002380 s | 0.003694 s | 0.052484 s | 0.007043 s | 0.053500 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.119127 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.290201 s |
| prove4 | LHS_zk1 | 0.000000 s | 0.000000 s | 0.000000 s | 0.002895 s | 0.014988 s | 0.336480 s | 0.004455 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.371778 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001338 s | 0.002159 s | 0.039784 s | 0.004081 s | 0.016695 s | 0.005668 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.069761 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002859 s | 0.872943 s |
| prove4 | LHS_zk2 | 0.000000 s | 0.000000 s | 0.000000 s | 0.002284 s | 0.014437 s | 0.313289 s | 0.002089 s | 0.005502 s | 0.000162 s | 0.000000 s | 0.347738 s | 0.000192 s | 0.000144 s | 0.000134 s | 0.063359 s | 0.000604 s | 0.000000 s | 0.004357 s | 0.067325 s | 0.034870 s | 0.012211 s | 0.105374 s | 0.066713 s | 0.106499 s | 0.000000 s | 0.464115 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006414 s | 0.005394 s | 0.030572 s | 0.005557 s | 0.027172 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.075152 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.761661 s |
| prove4 | Pi_A | 0.000000 s | 0.000000 s | 0.000000 s | 0.004513 s | 0.007753 s | 0.546314 s | 0.003689 s | 0.011603 s | 0.000294 s | 0.000000 s | 0.718066 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.009387 s | 0.007901 s | 0.059929 s | 0.006066 s | 0.027931 s | 0.000000 s | 0.000004 s | 0.045221 s | 0.052104 s | 0.013430 s | 0.013085 s | 0.000001 s | 0.111266 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.638557 s |
| prove4 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.001118 s | 0.000682 s | 0.127412 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.134362 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001014 s | 0.000007 s | 0.000036 s | 0.000041 s | 0.000056 s | 0.000164 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001328 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.266219 s |
| prove4 | fXY | 0.002002 s | 0.000000 s | 0.000145 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.031789 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010690 s | 0.012517 s | 0.003540 s | 0.002884 s | 0.000001 s | 0.000173 s | 0.000250 s | 0.000486 s | 0.001256 s | 0.001118 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003296 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.070149 s |
| prove4 | gXY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000401 s | 0.000873 s | 0.025323 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.058275 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.011061 s | 0.012258 s | 0.003498 s | 0.002842 s | 0.000000 s | 0.000935 s | 0.000011 s | 0.001815 s | 0.000042 s | 0.000060 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002871 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.120266 s |
| prove4 | pC | 0.000000 s | 0.000000 s | 0.000000 s | 0.001480 s | 0.004453 s | 0.131572 s | 0.004506 s | 0.002147 s | 0.000097 s | 0.000000 s | 0.147620 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003157 s | 0.003603 s | 0.013325 s | 0.005574 s | 0.022452 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.048134 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.388121 s |
| prove4 | term5 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001205 s | 0.000072 s | 0.000000 s | 0.001279 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000935 s | 0.000314 s | 0.000308 s | 0.001294 s | 0.001178 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004040 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010625 s |
| prove4 | term6 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001145 s | 0.000078 s | 0.000000 s | 0.001226 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000913 s | 0.000918 s | 0.001388 s | 0.001159 s | 0.001027 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.005414 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.013267 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.013282 s | msm=128x1 |
| prove0 | B | 0.067368 s | msm=4825x258 |
| prove0 | Q_AX | 0.096360 s | msm=4097x511 |
| prove0 | Q_AY | 0.064578 s | msm=4097x257 |
| prove0 | U | 0.066938 s | msm=4097x257 |
| prove0 | V | 0.065114 s | msm=4097x257 |
| prove0 | W | 0.067160 s | msm=4099x259 |
| prove1 | R | 0.064158 s | msm=4097x257 |
| prove2 | Q_CX | 0.198899 s | msm=8192x511 |
| prove2 | Q_CY | 0.135265 s | msm=8191x257 |
| prove4 | M_X | 0.047364 s | msm=4096x256 |
| prove4 | M_Y | 0.011192 s | msm=1x256 |
| prove4 | N_X | 0.048223 s | msm=4096x256 |
| prove4 | N_Y | 0.011479 s | msm=1x256 |
| prove4 | Pi_AX | 0.093921 s | msm=4098x511 |
| prove4 | Pi_AY | 0.011780 s | msm=1x510 |
| prove4 | Pi_B | 0.010629 s | msm=127x1 |
| prove4 | Pi_CX | 0.193984 s | msm=8191x511 |
| prove4 | Pi_CY | 0.011149 s | msm=1x510 |
