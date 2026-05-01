# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 44.565787 s |

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
| init | 4.563136 s | - | - |
| prove0 | 10.012564 s | 1.323822 s | 8.140548 s |
| prove1 | 2.043629 s | 0.848911 s | 1.091595 s |
| prove2 | 13.006840 s | 6.179069 s | 6.195197 s |
| prove3 | 1.527897 s | 1.121044 s | 0.000000 s |
| prove4 | 13.403065 s | 3.926353 s | 8.847659 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.002067 s | A_free=128x1 |
| build | O_mid_core | 0.006408 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.494434 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.001073 s | O_pub_free=128x1 |
| build | a_free_X | 0.000049 s | a_free_X=128x1 |
| build | bXY | 0.056127 s | bXY=4096x256 |
| build | s0_s1 | 0.102366 s | s0/s1=4096x256 |
| build | t_mi | 0.000011 s | t_mi=8192x1 |
| build | t_n | 0.000008 s | t_n=8192x1 |
| build | t_smax | 0.000002 s | t_smax=1x512 |
| build | uvwXY | 0.196473 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000072 s | file_bytes=10284 |
| load | permutation | 0.000604 s | file_bytes=251784 |
| load | placement_variables | 0.053798 s | file_bytes=18449792 |
| load | setup_params | 0.000090 s | file_bytes=140 |
| load | sigma | 0.000130 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000413 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 13.399200 s |
| encode | 24.276749 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.048872 s |
| combine | 8.754701 s |
| div_by_ruffini | 1.248815 s |
| div_by_vanishing_opt | 0.235873 s |
| eval | 2.214338 s |
| from_rou_evals | 0.051651 s |
| mul | 0.005637 s |
| recursion_eval | 0.672203 s |
| scale_coeffs | 0.065545 s |
| to_rou_evals | 0.101564 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.007697 s | R=4096x256 |
| add | prove4 | N_numerator | 0.007693 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000003 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.014472 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.008871 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.007639 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.002497 s | gXY=4096x256 |
| combine | prove0 | B | 0.026177 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.169865 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.123115 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.049297 s | U=4096x256 |
| combine | prove0 | V | 0.024986 s | V=4096x256 |
| combine | prove0 | W | 0.027525 s | W=4096x256 |
| combine | prove0 | p0XY | 0.814626 s | p0XY=4096x256 |
| combine | prove1 | R | 0.025424 s | R=4096x256 |
| combine | prove2 | Q_CX | 0.520051 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 0.873408 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 4.623316 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.127522 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 0.155485 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 0.881095 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.172609 s | uXY=4096x256 |
| combine | prove4 | V | 0.023223 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.013907 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.007432 s | bXY=4096x256 |
| combine | prove4 | pC | 0.076879 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009535 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009227 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.277881 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.284695 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.288523 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.001511 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.396205 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.088232 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.147641 s | vanishing=4096x256 |
| eval | prove3 | R | 0.359061 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.359626 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.361945 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.001055 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.001143 s | K0=4096x1 |
| eval | prove4 | R | 0.154673 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.152976 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.152683 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.156010 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.153976 s | R=4096x256 |
| eval | prove4 | t_n | 0.001238 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.215429 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.144525 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.049719 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.000624 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000656 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000041 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.000611 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.000526 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000515 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.004596 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.672203 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.006829 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.006504 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.016877 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.023536 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.005415 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.006384 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.048942 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.052622 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| add_clone_operands | 0.002150 s |
| add_construct_result | 0.000000 s |
| add_icicle_add | 0.002827 s |
| add_same_stride_icicle_add | 0.124614 s |
| add_transpose_add_sub | 0.053669 s |
| add_transpose_inputs | 0.098862 s |
| add_transpose_output | 0.220136 s |
| add_transpose_same_stride_icicle_add | 0.053600 s |
| add_y_align_resize | 0.217381 s |
| add_y_align_same_stride_icicle_add | 0.256676 s |
| addassign_clone_operands | 0.040890 s |
| addassign_icicle_add | 0.051360 s |
| addassign_update_metadata | 0.000000 s |
| addition | 1.175474 s |
| mul_alloc_lhs_evals | 0.000015 s |
| mul_alloc_out_evals | 0.000051 s |
| mul_alloc_rhs_evals | 0.000027 s |
| mul_clone_resize_lhs | 0.063576 s |
| mul_clone_resize_rhs | 0.059180 s |
| mul_compute_target_size | 0.000000 s |
| mul_find_lhs_degree | 0.007057 s |
| mul_find_rhs_degree | 0.019569 s |
| mul_from_rou_evals | 2.283323 s |
| mul_icicle_eval_mul | 0.065565 s |
| mul_lhs_to_rou_evals | 2.279179 s |
| mul_rhs_to_rou_evals | 2.242490 s |
| mul_setup_vec_ops | 0.000008 s |
| multiplication | 7.020320 s |
| scalar_add_alloc_host | 0.000568 s |
| scalar_add_clone_coeffs | 0.001045 s |
| scalar_add_copy_coeffs | 0.001034 s |
| scalar_add_from_coeffs | 0.001195 s |
| scalar_add_update_constant | 0.000001 s |
| scalar_mul_alloc_input | 0.000241 s |
| scalar_mul_alloc_output | 0.000143 s |
| scalar_mul_copy_coeffs | 0.087047 s |
| scalar_mul_from_coeffs | 0.076255 s |
| scalar_mul_icicle_scalar_mul | 0.277436 s |
| scalar_mul_one_clone | 0.018816 s |
| scalar_mul_setup | 0.000016 s |
| scalar_sub_alloc_host | 0.001385 s |
| scalar_sub_clone_coeffs | 0.002583 s |
| scalar_sub_copy_coeffs | 0.002640 s |
| scalar_sub_from_coeffs | 0.002966 s |
| scalar_sub_update_constant | 0.000001 s |
| scaling | 0.460315 s |
| sub_clone_operands | 0.008566 s |
| sub_construct_result | 0.000001 s |
| sub_icicle_sub | 0.007248 s |
| sub_same_stride_icicle_sub | 0.054983 s |
| sub_y_align_resize | 0.014182 s |
| sub_y_align_same_stride_icicle_sub | 0.007779 s |

## Poly Combine Detail By Target

| module | variable | add_clone_operands | add_construct_result | add_icicle_add | add_same_stride_icicle_add | add_transpose_add_sub | add_transpose_inputs | add_transpose_output | add_transpose_same_stride_icicle_add | add_y_align_resize | add_y_align_same_stride_icicle_add | addassign_clone_operands | addassign_icicle_add | addassign_update_metadata | addition | mul_alloc_lhs_evals | mul_alloc_out_evals | mul_alloc_rhs_evals | mul_clone_resize_lhs | mul_clone_resize_rhs | mul_compute_target_size | mul_find_lhs_degree | mul_find_rhs_degree | mul_from_rou_evals | mul_icicle_eval_mul | mul_lhs_to_rou_evals | mul_rhs_to_rou_evals | mul_setup_vec_ops | multiplication | scalar_add_alloc_host | scalar_add_clone_coeffs | scalar_add_copy_coeffs | scalar_add_from_coeffs | scalar_add_update_constant | scalar_mul_alloc_input | scalar_mul_alloc_output | scalar_mul_copy_coeffs | scalar_mul_from_coeffs | scalar_mul_icicle_scalar_mul | scalar_mul_one_clone | scalar_mul_setup | scalar_sub_alloc_host | scalar_sub_clone_coeffs | scalar_sub_copy_coeffs | scalar_sub_from_coeffs | scalar_sub_update_constant | scaling | sub_clone_operands | sub_construct_result | sub_icicle_sub | sub_same_stride_icicle_sub | sub_y_align_resize | sub_y_align_same_stride_icicle_sub | total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| prove0 | B | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.011206 s | 0.012743 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.023970 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.047919 s |
| prove0 | Q_AX | 0.000000 s | 0.000000 s | 0.000000 s | 0.007376 s | 0.005363 s | 0.008773 s | 0.101356 s | 0.005358 s | 0.016231 s | 0.019669 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.158822 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000011 s | 0.000003 s | 0.001157 s | 0.001154 s | 0.006484 s | 0.002204 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.011029 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.344990 s |
| prove0 | Q_AY | 0.000000 s | 0.000000 s | 0.000000 s | 0.005721 s | 0.010324 s | 0.021929 s | 0.057417 s | 0.010308 s | 0.006104 s | 0.010785 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.112333 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000013 s | 0.000004 s | 0.001156 s | 0.001102 s | 0.006264 s | 0.002210 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010767 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.256439 s |
| prove0 | U | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.017030 s | 0.027634 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.044696 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000003 s | 0.000001 s | 0.000015 s | 0.000029 s | 0.003917 s | 0.000617 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004593 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.098536 s |
| prove0 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.013649 s | 0.009491 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.023160 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000003 s | 0.000001 s | 0.000007 s | 0.000012 s | 0.001258 s | 0.000534 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001820 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.049934 s |
| prove0 | W | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.011019 s | 0.014268 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.025311 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.050598 s |
| prove0 | p0XY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.021977 s | 0.000002 s | 0.000003 s | 0.000003 s | 0.020826 s | 0.007043 s | 0.000000 s | 0.002788 s | 0.001101 s | 0.243143 s | 0.006956 s | 0.270525 s | 0.240214 s | 0.000000 s | 0.792647 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.014182 s | 0.007779 s | 1.629190 s |
| prove1 | R | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.011444 s | 0.012768 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.024239 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000002 s | 0.000001 s | 0.000006 s | 0.000009 s | 0.001156 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001181 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.050807 s |
| prove2 | Q_CX | 0.000000 s | 0.000000 s | 0.000000 s | 0.015443 s | 0.013832 s | 0.024255 s | 0.024854 s | 0.013824 s | 0.026491 s | 0.025404 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.137354 s | 0.000001 s | 0.000005 s | 0.000002 s | 0.001682 s | 0.001085 s | 0.000000 s | 0.000078 s | 0.002141 s | 0.103932 s | 0.003819 s | 0.106560 s | 0.098857 s | 0.000000 s | 0.318189 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000040 s | 0.000017 s | 0.008172 s | 0.008041 s | 0.031090 s | 0.004499 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.051904 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.007002 s | 0.000000 s | 0.000000 s | 1.028578 s |
| prove2 | Q_CY | 0.000000 s | 0.000000 s | 0.000000 s | 0.006855 s | 0.018787 s | 0.034926 s | 0.026343 s | 0.018752 s | 0.000000 s | 0.000000 s | 0.004444 s | 0.004168 s | 0.000000 s | 0.102266 s | 0.000001 s | 0.000008 s | 0.000003 s | 0.003227 s | 0.007118 s | 0.000000 s | 0.000107 s | 0.002881 s | 0.230821 s | 0.007059 s | 0.225031 s | 0.226530 s | 0.000000 s | 0.702814 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000020 s | 0.000019 s | 0.009074 s | 0.009112 s | 0.033589 s | 0.001100 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.052954 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006675 s | 0.000000 s | 0.000000 s | 1.734688 s |
| prove2 | p_comb | 0.000000 s | 0.000000 s | 0.000000 s | 0.015065 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.009074 s | 0.007976 s | 0.000000 s | 0.078040 s | 0.000008 s | 0.000028 s | 0.000015 s | 0.034384 s | 0.041659 s | 0.000000 s | 0.004002 s | 0.007282 s | 1.470606 s | 0.040364 s | 1.430783 s | 1.414889 s | 0.000007 s | 4.444188 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000014 s | 0.000017 s | 0.021130 s | 0.009175 s | 0.029504 s | 0.002622 s | 0.000001 s | 0.000278 s | 0.000495 s | 0.000520 s | 0.000624 s | 0.000000 s | 0.062491 s | 0.008566 s | 0.000001 s | 0.007248 s | 0.028160 s | 0.000000 s | 0.000000 s | 9.169219 s |
| prove4 | LHS_for_copy | 0.000000 s | 0.000000 s | 0.000000 s | 0.027459 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008875 s | 0.020213 s | 0.000000 s | 0.056576 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000022 s | 0.000020 s | 0.013853 s | 0.013604 s | 0.043385 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.070923 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.254929 s |
| prove4 | LHS_zk1 | 0.000000 s | 0.000000 s | 0.000000 s | 0.018336 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.028323 s | 0.039303 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.099169 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000016 s | 0.000007 s | 0.005246 s | 0.006687 s | 0.020074 s | 0.004494 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.036553 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.013147 s | 0.000000 s | 0.000000 s | 0.271355 s |
| prove4 | LHS_zk2 | 0.000000 s | 0.000000 s | 0.000000 s | 0.003688 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.026105 s | 0.028210 s | 0.005571 s | 0.004601 s | 0.000000 s | 0.068222 s | 0.000001 s | 0.000006 s | 0.000003 s | 0.003456 s | 0.002275 s | 0.000000 s | 0.000082 s | 0.006164 s | 0.234822 s | 0.007366 s | 0.246281 s | 0.261999 s | 0.000000 s | 0.762483 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000023 s | 0.000012 s | 0.007553 s | 0.007874 s | 0.027223 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.042721 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.746742 s |
| prove4 | Pi_A | 0.000000 s | 0.000000 s | 0.000000 s | 0.012552 s | 0.005362 s | 0.008979 s | 0.010166 s | 0.005357 s | 0.026466 s | 0.031721 s | 0.008721 s | 0.008580 s | 0.000000 s | 0.120298 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000033 s | 0.000018 s | 0.009435 s | 0.009333 s | 0.033411 s | 0.000000 s | 0.000002 s | 0.001106 s | 0.002088 s | 0.002120 s | 0.002342 s | 0.000000 s | 0.052269 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.350360 s |
| prove4 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012474 s | 0.009347 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.021842 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000002 s | 0.000001 s | 0.000006 s | 0.000008 s | 0.000815 s | 0.000535 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001376 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.046407 s |
| prove4 | fXY | 0.002150 s | 0.000000 s | 0.002827 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006980 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000293 s | 0.000556 s | 0.000525 s | 0.000618 s | 0.000000 s | 0.000009 s | 0.000003 s | 0.001060 s | 0.001022 s | 0.004804 s | 0.000000 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006911 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.027764 s |
| prove4 | gXY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001080 s | 0.003393 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006337 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000274 s | 0.000489 s | 0.000509 s | 0.000577 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000001 s | 0.000004 s | 0.001081 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001092 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.014840 s |
| prove4 | pC | 0.000000 s | 0.000000 s | 0.000000 s | 0.012118 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.009757 s | 0.011941 s | 0.002124 s | 0.002999 s | 0.000000 s | 0.038969 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000019 s | 0.000016 s | 0.007040 s | 0.006973 s | 0.023827 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.037891 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.153676 s |
| prove4 | term5 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001040 s | 0.001398 s | 0.000000 s | 0.002442 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000003 s | 0.000002 s | 0.001058 s | 0.001057 s | 0.004957 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.007087 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.019045 s |
| prove4 | term6 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001041 s | 0.001425 s | 0.000000 s | 0.002470 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000005 s | 0.000003 s | 0.001078 s | 0.001062 s | 0.004597 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006752 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.018432 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.001750 s | msm=128x1 |
| prove0 | B | 1.223593 s | msm=4825x258 |
| prove0 | Q_AX | 2.235389 s | msm=4097x511 |
| prove0 | Q_AY | 1.160607 s | msm=4097x257 |
| prove0 | U | 1.283091 s | msm=4097x257 |
| prove0 | V | 1.106644 s | msm=4097x257 |
| prove0 | W | 1.131223 s | msm=4099x259 |
| prove1 | R | 1.091595 s | msm=4097x257 |
| prove2 | Q_CX | 3.965035 s | msm=8192x511 |
| prove2 | Q_CY | 2.230162 s | msm=8191x257 |
| prove4 | M_X | 1.124929 s | msm=4096x256 |
| prove4 | M_Y | 0.001584 s | msm=1x256 |
| prove4 | N_X | 1.096535 s | msm=4096x256 |
| prove4 | N_Y | 0.001783 s | msm=1x256 |
| prove4 | Pi_AX | 2.178635 s | msm=4098x511 |
| prove4 | Pi_AY | 0.002158 s | msm=1x510 |
| prove4 | Pi_B | 0.001765 s | msm=127x1 |
| prove4 | Pi_CX | 4.437507 s | msm=8191x511 |
| prove4 | Pi_CY | 0.002764 s | msm=1x510 |
