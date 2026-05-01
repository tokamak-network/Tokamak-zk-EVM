# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 22.142922 s |

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
| init | 0.757955 s | - | - |
| prove0 | 4.106111 s | 1.973491 s | 0.415369 s |
| prove1 | 0.776955 s | 0.358368 s | 0.065228 s |
| prove2 | 8.212712 s | 6.322139 s | 0.326569 s |
| prove3 | 0.870517 s | 0.532785 s | 0.000000 s |
| prove4 | 7.409432 s | 5.062486 s | 0.444578 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.014160 s | A_free=128x1 |
| build | O_mid_core | 0.016581 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.229709 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010176 s | O_pub_free=128x1 |
| build | a_free_X | 0.000336 s | a_free_X=128x1 |
| build | bXY | 0.027646 s | bXY=4096x256 |
| build | s0_s1 | 0.057173 s | s0/s1=4096x256 |
| build | t_mi | 0.000048 s | t_mi=8192x1 |
| build | t_n | 0.000075 s | t_n=8192x1 |
| build | t_smax | 0.000015 s | t_smax=1x512 |
| build | uvwXY | 0.297708 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000098 s | file_bytes=10284 |
| load | permutation | 0.000871 s | file_bytes=251784 |
| load | placement_variables | 0.088823 s | file_bytes=18449792 |
| load | setup_params | 0.000019 s | file_bytes=140 |
| load | sigma | 0.000120 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000639 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 14.249268 s |
| encode | 1.264790 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.567460 s |
| combine | 9.620149 s |
| div_by_ruffini | 1.553265 s |
| div_by_vanishing_opt | 1.335131 s |
| eval | 0.282252 s |
| from_rou_evals | 0.014748 s |
| mul | 0.007038 s |
| recursion_eval | 0.142597 s |
| scale_coeffs | 0.646963 s |
| to_rou_evals | 0.079667 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.142792 s | R=4096x256 |
| add | prove4 | N_numerator | 0.135086 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000054 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.061183 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.064504 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.163512 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.000329 s | gXY=4096x256 |
| combine | prove0 | B | 0.125893 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.210242 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.154098 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.148679 s | U=4096x256 |
| combine | prove0 | V | 0.147208 s | V=4096x256 |
| combine | prove0 | W | 0.124189 s | W=4096x256 |
| combine | prove0 | p0XY | 0.594363 s | p0XY=4096x256 |
| combine | prove1 | R | 0.126108 s | R=4096x256 |
| combine | prove2 | Q_CX | 0.820791 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 0.938346 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 3.575910 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.153306 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 0.660182 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 0.915778 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.528364 s | uXY=4096x256 |
| combine | prove4 | V | 0.147744 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.041939 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.037912 s | bXY=4096x256 |
| combine | prove4 | pC | 0.147459 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009691 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.011948 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.313769 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.312849 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.326004 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.000762 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.599880 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.468820 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.866311 s | vanishing=4096x256 |
| eval | prove3 | R | 0.049681 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034343 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034347 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.041932 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.000210 s | K0=4096x1 |
| eval | prove4 | R | 0.015123 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015180 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015153 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015739 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015131 s | R=4096x256 |
| eval | prove4 | t_n | 0.006331 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.023984 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015100 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.009996 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001943 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000496 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000355 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.001957 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.004729 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000297 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.002012 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.142597 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.070213 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.047773 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.220236 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.194178 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.066438 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.048124 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.040741 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.038925 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| add_clone_operands | 0.002144 s |
| add_construct_result | 0.000000 s |
| add_icicle_add | 0.000142 s |
| add_same_stride_icicle_add | 0.053073 s |
| add_transpose_add_sub | 0.024429 s |
| add_transpose_inputs | 0.154825 s |
| add_transpose_output | 0.118725 s |
| add_transpose_same_stride_icicle_add | 0.024327 s |
| add_y_align_resize | 1.809963 s |
| add_y_align_same_stride_icicle_add | 0.052043 s |
| addassign_clone_operands | 0.051279 s |
| addassign_icicle_add | 0.001413 s |
| addassign_update_metadata | 0.000001 s |
| addition | 2.568083 s |
| mul_alloc_lhs_evals | 0.001642 s |
| mul_alloc_out_evals | 0.001512 s |
| mul_alloc_rhs_evals | 0.001358 s |
| mul_clone_resize_lhs | 0.711813 s |
| mul_clone_resize_rhs | 0.765279 s |
| mul_compute_target_size | 0.000002 s |
| mul_find_lhs_degree | 0.156397 s |
| mul_find_rhs_degree | 0.279728 s |
| mul_from_rou_evals | 0.325149 s |
| mul_icicle_eval_mul | 0.116829 s |
| mul_lhs_to_rou_evals | 0.993592 s |
| mul_optimize_size | 0.609985 s |
| mul_rhs_to_rou_evals | 1.004486 s |
| mul_setup_vec_ops | 0.000004 s |
| multiplication | 4.989654 s |
| scalar_add_alloc_host | 0.021570 s |
| scalar_add_clone_coeffs | 0.024708 s |
| scalar_add_copy_coeffs | 0.006998 s |
| scalar_add_from_coeffs | 0.005609 s |
| scalar_add_update_constant | 0.000001 s |
| scalar_mul_alloc_input | 0.034064 s |
| scalar_mul_alloc_output | 0.037095 s |
| scalar_mul_copy_coeffs | 0.456550 s |
| scalar_mul_from_coeffs | 0.051566 s |
| scalar_mul_icicle_scalar_mul | 0.229679 s |
| scalar_mul_one_clone | 0.022974 s |
| scalar_mul_setup | 0.000030 s |
| scalar_sub_alloc_host | 0.056356 s |
| scalar_sub_clone_coeffs | 0.064062 s |
| scalar_sub_copy_coeffs | 0.024623 s |
| scalar_sub_from_coeffs | 0.015401 s |
| scalar_sub_update_constant | 0.000002 s |
| scaling | 0.832363 s |
| sub_clone_operands | 0.009613 s |
| sub_construct_result | 0.000000 s |
| sub_icicle_sub | 0.000317 s |
| sub_same_stride_icicle_sub | 0.009503 s |
| sub_y_align_resize | 0.058254 s |
| sub_y_align_same_stride_icicle_sub | 0.001768 s |

## Poly Combine Detail By Target

| module | variable | add_clone_operands | add_construct_result | add_icicle_add | add_same_stride_icicle_add | add_transpose_add_sub | add_transpose_inputs | add_transpose_output | add_transpose_same_stride_icicle_add | add_y_align_resize | add_y_align_same_stride_icicle_add | addassign_clone_operands | addassign_icicle_add | addassign_update_metadata | addition | mul_alloc_lhs_evals | mul_alloc_out_evals | mul_alloc_rhs_evals | mul_clone_resize_lhs | mul_clone_resize_rhs | mul_compute_target_size | mul_find_lhs_degree | mul_find_rhs_degree | mul_from_rou_evals | mul_icicle_eval_mul | mul_lhs_to_rou_evals | mul_optimize_size | mul_rhs_to_rou_evals | mul_setup_vec_ops | multiplication | scalar_add_alloc_host | scalar_add_clone_coeffs | scalar_add_copy_coeffs | scalar_add_from_coeffs | scalar_add_update_constant | scalar_mul_alloc_input | scalar_mul_alloc_output | scalar_mul_copy_coeffs | scalar_mul_from_coeffs | scalar_mul_icicle_scalar_mul | scalar_mul_one_clone | scalar_mul_setup | scalar_sub_alloc_host | scalar_sub_clone_coeffs | scalar_sub_copy_coeffs | scalar_sub_from_coeffs | scalar_sub_update_constant | scaling | sub_clone_operands | sub_construct_result | sub_icicle_sub | sub_same_stride_icicle_sub | sub_y_align_resize | sub_y_align_same_stride_icicle_sub | total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| prove0 | B | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.115575 s | 0.003173 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.118794 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.237542 s |
| prove0 | Q_AX | 0.000000 s | 0.000000 s | 0.000000 s | 0.000845 s | 0.003225 s | 0.013717 s | 0.016646 s | 0.003216 s | 0.107846 s | 0.004316 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.146687 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001302 s | 0.001094 s | 0.053217 s | 0.000417 s | 0.001117 s | 0.000605 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.057776 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.412027 s |
| prove0 | Q_AY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000852 s | 0.002926 s | 0.025068 s | 0.016653 s | 0.002906 s | 0.063366 s | 0.002288 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.111241 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003105 s | 0.001134 s | 0.030019 s | 0.000412 s | 0.001067 s | 0.001307 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.037077 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.299420 s |
| prove0 | U | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.140605 s | 0.002559 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.143217 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000252 s | 0.000008 s | 0.003884 s | 0.000044 s | 0.000099 s | 0.000280 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004580 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.295527 s |
| prove0 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.135600 s | 0.002432 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.138078 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001010 s | 0.000008 s | 0.004926 s | 0.000046 s | 0.000066 s | 0.002177 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008243 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.292586 s |
| prove0 | W | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.114676 s | 0.003241 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.117960 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.235877 s |
| prove0 | p0XY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.060046 s | 0.000185 s | 0.000126 s | 0.000160 s | 0.085907 s | 0.087345 s | 0.000001 s | 0.016497 s | 0.016508 s | 0.035085 s | 0.013010 s | 0.105556 s | 0.063404 s | 0.108214 s | 0.000000 s | 0.534315 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.058254 s | 0.001768 s | 1.186380 s |
| prove1 | R | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.121701 s | 0.003258 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.125005 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000877 s | 0.000007 s | 0.000033 s | 0.000038 s | 0.000054 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001019 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.251991 s |
| prove2 | Q_CX | 0.000000 s | 0.000000 s | 0.000000 s | 0.006591 s | 0.006670 s | 0.048260 s | 0.035056 s | 0.006658 s | 0.169439 s | 0.005220 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.273151 s | 0.000169 s | 0.000097 s | 0.000106 s | 0.030332 s | 0.000315 s | 0.000000 s | 0.032039 s | 0.033526 s | 0.016269 s | 0.003913 s | 0.051542 s | 0.031385 s | 0.051001 s | 0.000000 s | 0.252892 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003357 s | 0.004046 s | 0.032932 s | 0.005672 s | 0.018880 s | 0.002114 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.067054 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001782 s | 0.000000 s | 0.000000 s | 1.190474 s |
| prove2 | Q_CY | 0.000000 s | 0.000000 s | 0.000000 s | 0.005264 s | 0.008368 s | 0.053185 s | 0.035481 s | 0.008316 s | 0.000000 s | 0.000000 s | 0.005121 s | 0.000174 s | 0.000000 s | 0.109536 s | 0.000183 s | 0.000128 s | 0.000158 s | 0.061932 s | 0.106600 s | 0.000000 s | 0.009198 s | 0.033318 s | 0.032876 s | 0.010346 s | 0.102013 s | 0.066240 s | 0.104341 s | 0.000000 s | 0.529658 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008136 s | 0.005271 s | 0.021640 s | 0.006007 s | 0.024537 s | 0.006471 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.072113 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001830 s | 0.000000 s | 0.000000 s | 1.428442 s |
| prove2 | p_comb | 0.000000 s | 0.000000 s | 0.000000 s | 0.012629 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012365 s | 0.000294 s | 0.000000 s | 0.068472 s | 0.000913 s | 0.001035 s | 0.000806 s | 0.471434 s | 0.570421 s | 0.000001 s | 0.085191 s | 0.129128 s | 0.208024 s | 0.078106 s | 0.630194 s | 0.383215 s | 0.635967 s | 0.000002 s | 3.207133 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002183 s | 0.002886 s | 0.022364 s | 0.004110 s | 0.031227 s | 0.004209 s | 0.000001 s | 0.011223 s | 0.012553 s | 0.003534 s | 0.002985 s | 0.000001 s | 0.066991 s | 0.009613 s | 0.000000 s | 0.000317 s | 0.002915 s | 0.000000 s | 0.000000 s | 6.672441 s |
| prove4 | LHS_for_copy | 0.000000 s | 0.000000 s | 0.000000 s | 0.013245 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012369 s | 0.000298 s | 0.000000 s | 0.025941 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002364 s | 0.003696 s | 0.051546 s | 0.007027 s | 0.053460 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.118119 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.288066 s |
| prove4 | LHS_zk1 | 0.000000 s | 0.000000 s | 0.000000 s | 0.004432 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.237237 s | 0.006449 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.251206 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001346 s | 0.002173 s | 0.036295 s | 0.004049 s | 0.014878 s | 0.005649 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.064424 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002977 s | 0.000000 s | 0.000000 s | 0.631117 s |
| prove4 | LHS_zk2 | 0.000000 s | 0.000000 s | 0.000000 s | 0.002114 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.231578 s | 0.005520 s | 0.005468 s | 0.000160 s | 0.000000 s | 0.244924 s | 0.000192 s | 0.000125 s | 0.000129 s | 0.062209 s | 0.000597 s | 0.000000 s | 0.013472 s | 0.067249 s | 0.032895 s | 0.011453 s | 0.104287 s | 0.065740 s | 0.104963 s | 0.000000 s | 0.465657 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003602 s | 0.004502 s | 0.050705 s | 0.005507 s | 0.024294 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.088648 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.595991 s |
| prove4 | Pi_A | 0.000000 s | 0.000000 s | 0.000000 s | 0.003613 s | 0.003241 s | 0.014595 s | 0.014890 s | 0.003232 s | 0.166537 s | 0.007456 s | 0.011284 s | 0.000295 s | 0.000000 s | 0.352222 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002781 s | 0.006508 s | 0.107299 s | 0.006074 s | 0.028240 s | 0.000000 s | 0.000005 s | 0.045134 s | 0.051508 s | 0.021089 s | 0.012417 s | 0.000001 s | 0.150952 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.009371 s |
| prove4 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.140363 s | 0.002859 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.143275 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000283 s | 0.000008 s | 0.003045 s | 0.000039 s | 0.000059 s | 0.000163 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003608 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.293702 s |
| prove4 | fXY | 0.002144 s | 0.000000 s | 0.000142 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.031812 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010687 s | 0.012500 s | 0.003487 s | 0.002841 s | 0.000001 s | 0.000157 s | 0.001056 s | 0.000527 s | 0.001971 s | 0.002186 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.005909 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.075422 s |
| prove4 | gXY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000697 s | 0.000645 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.030745 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010883 s | 0.012207 s | 0.003511 s | 0.002768 s | 0.000001 s | 0.000322 s | 0.000023 s | 0.002724 s | 0.000041 s | 0.000059 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003177 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.067804 s |
| prove4 | pC | 0.000000 s | 0.000000 s | 0.000000 s | 0.003488 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.064743 s | 0.002626 s | 0.002335 s | 0.000095 s | 0.000000 s | 0.073332 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001150 s | 0.003444 s | 0.032826 s | 0.006174 s | 0.023576 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.067194 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.280985 s |
| prove4 | term5 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001194 s | 0.000026 s | 0.000000 s | 0.001222 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000934 s | 0.000318 s | 0.000306 s | 0.001969 s | 0.003069 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006607 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.015645 s |
| prove4 | term6 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001143 s | 0.000072 s | 0.000000 s | 0.001218 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000907 s | 0.000913 s | 0.002260 s | 0.001971 s | 0.002813 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008872 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.020169 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.013047 s | msm=128x1 |
| prove0 | B | 0.066192 s | msm=4825x258 |
| prove0 | Q_AX | 0.095685 s | msm=4097x511 |
| prove0 | Q_AY | 0.064932 s | msm=4097x257 |
| prove0 | U | 0.063058 s | msm=4097x257 |
| prove0 | V | 0.061604 s | msm=4097x257 |
| prove0 | W | 0.063898 s | msm=4099x259 |
| prove1 | R | 0.065228 s | msm=4097x257 |
| prove2 | Q_CX | 0.193259 s | msm=8192x511 |
| prove2 | Q_CY | 0.133310 s | msm=8191x257 |
| prove4 | M_X | 0.045648 s | msm=4096x256 |
| prove4 | M_Y | 0.011847 s | msm=1x256 |
| prove4 | N_X | 0.046622 s | msm=4096x256 |
| prove4 | N_Y | 0.012188 s | msm=1x256 |
| prove4 | Pi_AX | 0.095673 s | msm=4098x511 |
| prove4 | Pi_AY | 0.011840 s | msm=1x510 |
| prove4 | Pi_B | 0.010604 s | msm=127x1 |
| prove4 | Pi_CX | 0.199002 s | msm=8191x511 |
| prove4 | Pi_CY | 0.011152 s | msm=1x510 |
