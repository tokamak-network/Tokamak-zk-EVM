# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 26.796370 s |

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
| init | 0.731610 s | - | - |
| prove0 | 4.929846 s | 2.826508 s | 0.419593 s |
| prove1 | 0.879098 s | 0.441113 s | 0.062862 s |
| prove2 | 9.625996 s | 7.721760 s | 0.328355 s |
| prove3 | 1.067734 s | 0.526728 s | 0.000000 s |
| prove4 | 9.552926 s | 7.209313 s | 0.439514 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.014086 s | A_free=128x1 |
| build | O_mid_core | 0.016475 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.225502 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010188 s | O_pub_free=128x1 |
| build | a_free_X | 0.000337 s | a_free_X=128x1 |
| build | bXY | 0.026904 s | bXY=4096x256 |
| build | s0_s1 | 0.055353 s | s0/s1=4096x256 |
| build | t_mi | 0.000044 s | t_mi=8192x1 |
| build | t_n | 0.000073 s | t_n=8192x1 |
| build | t_smax | 0.000014 s | t_smax=1x512 |
| build | uvwXY | 0.277229 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000103 s | file_bytes=10284 |
| load | permutation | 0.000879 s | file_bytes=251784 |
| load | placement_variables | 0.089752 s | file_bytes=18449792 |
| load | setup_params | 0.000016 s | file_bytes=140 |
| load | sigma | 0.000121 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000620 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 18.725420 s |
| encode | 1.263827 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.648933 s |
| combine | 14.078520 s |
| div_by_ruffini | 1.530474 s |
| div_by_vanishing_opt | 1.320323 s |
| eval | 0.266261 s |
| from_rou_evals | 0.015976 s |
| mul | 0.007947 s |
| recursion_eval | 0.140952 s |
| scale_coeffs | 0.637811 s |
| to_rou_evals | 0.078223 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.136526 s | R=4096x256 |
| add | prove4 | N_numerator | 0.139183 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000055 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.090535 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.122516 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.159693 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.000424 s | gXY=4096x256 |
| combine | prove0 | B | 0.216840 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.403190 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.401768 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.260717 s | U=4096x256 |
| combine | prove0 | V | 0.259071 s | V=4096x256 |
| combine | prove0 | W | 0.211490 s | W=4096x256 |
| combine | prove0 | p0XY | 0.614518 s | p0XY=4096x256 |
| combine | prove1 | R | 0.212034 s | R=4096x256 |
| combine | prove2 | Q_CX | 1.409819 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 1.313661 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 4.018584 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.582893 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.352546 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.099627 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.929250 s | uXY=4096x256 |
| combine | prove4 | V | 0.259420 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.042442 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.063993 s | bXY=4096x256 |
| combine | prove4 | pC | 0.405019 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009665 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.011973 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.307589 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.307812 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.323382 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.000720 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.590971 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.458914 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.861409 s | vanishing=4096x256 |
| eval | prove3 | R | 0.046013 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034104 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034168 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.042694 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.000205 s | K0=4096x1 |
| eval | prove4 | R | 0.015160 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015049 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015059 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015702 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.014995 s | R=4096x256 |
| eval | prove4 | t_n | 0.006372 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.011872 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.014869 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.009904 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001951 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000967 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000332 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.002823 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.004836 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000250 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.002861 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.140952 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.068451 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.046586 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.218634 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.193808 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.064326 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.046006 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.039383 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.038840 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| add_clone_operands | 0.061107 s |
| add_construct_result | 0.000004 s |
| add_icicle_add | 0.008253 s |
| add_resize_operands | 1.750222 s |
| addassign_clone_operands | 0.137240 s |
| addassign_icicle_add | 0.020485 s |
| addassign_resize_operands | 4.154828 s |
| addassign_update_metadata | 0.000006 s |
| addition | 7.102349 s |
| mul_alloc_lhs_evals | 0.001653 s |
| mul_alloc_out_evals | 0.002518 s |
| mul_alloc_rhs_evals | 0.001371 s |
| mul_clone_resize_lhs | 0.707461 s |
| mul_clone_resize_rhs | 0.759121 s |
| mul_compute_target_size | 0.000002 s |
| mul_find_lhs_degree | 0.152890 s |
| mul_find_rhs_degree | 0.279823 s |
| mul_from_rou_evals | 0.320329 s |
| mul_icicle_eval_mul | 0.113471 s |
| mul_lhs_to_rou_evals | 0.991095 s |
| mul_optimize_size | 0.607036 s |
| mul_rhs_to_rou_evals | 0.989168 s |
| mul_setup_vec_ops | 0.000004 s |
| multiplication | 4.954231 s |
| scalar_add_alloc_host | 0.021036 s |
| scalar_add_clone_coeffs | 0.024802 s |
| scalar_add_copy_coeffs | 0.007061 s |
| scalar_add_from_coeffs | 0.005507 s |
| scalar_add_update_constant | 0.000002 s |
| scalar_mul_alloc_input | 0.031187 s |
| scalar_mul_alloc_output | 0.037745 s |
| scalar_mul_copy_coeffs | 0.432185 s |
| scalar_mul_from_coeffs | 0.054522 s |
| scalar_mul_icicle_scalar_mul | 0.228732 s |
| scalar_mul_one_clone | 0.024800 s |
| scalar_mul_setup | 0.000037 s |
| scalar_sub_alloc_host | 0.055853 s |
| scalar_sub_clone_coeffs | 0.064137 s |
| scalar_sub_copy_coeffs | 0.023964 s |
| scalar_sub_from_coeffs | 0.015328 s |
| scalar_sub_update_constant | 0.000002 s |
| scaling | 0.809682 s |
| sub_clone_operands | 0.021419 s |
| sub_construct_result | 0.000001 s |
| sub_icicle_sub | 0.002967 s |
| sub_resize_operands | 0.727609 s |

## Poly Combine Detail By Target

| module | variable | add_clone_operands | add_construct_result | add_icicle_add | add_resize_operands | addassign_clone_operands | addassign_icicle_add | addassign_resize_operands | addassign_update_metadata | addition | mul_alloc_lhs_evals | mul_alloc_out_evals | mul_alloc_rhs_evals | mul_clone_resize_lhs | mul_clone_resize_rhs | mul_compute_target_size | mul_find_lhs_degree | mul_find_rhs_degree | mul_from_rou_evals | mul_icicle_eval_mul | mul_lhs_to_rou_evals | mul_optimize_size | mul_rhs_to_rou_evals | mul_setup_vec_ops | multiplication | scalar_add_alloc_host | scalar_add_clone_coeffs | scalar_add_copy_coeffs | scalar_add_from_coeffs | scalar_add_update_constant | scalar_mul_alloc_input | scalar_mul_alloc_output | scalar_mul_copy_coeffs | scalar_mul_from_coeffs | scalar_mul_icicle_scalar_mul | scalar_mul_one_clone | scalar_mul_setup | scalar_sub_alloc_host | scalar_sub_clone_coeffs | scalar_sub_copy_coeffs | scalar_sub_from_coeffs | scalar_sub_update_constant | scaling | sub_clone_operands | sub_construct_result | sub_icicle_sub | sub_resize_operands | total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| prove0 | B | 0.001691 s | 0.000000 s | 0.001037 s | 0.207687 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.210432 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.420847 s |
| prove0 | Q_AX | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.005569 s | 0.002116 s | 0.344574 s | 0.000001 s | 0.352292 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000704 s | 0.001013 s | 0.040727 s | 0.002195 s | 0.001266 s | 0.000602 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.046537 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.797598 s |
| prove0 | Q_AY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004336 s | 0.001747 s | 0.360351 s | 0.000001 s | 0.366466 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001608 s | 0.000937 s | 0.023507 s | 0.002113 s | 0.001351 s | 0.001390 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.030931 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.794739 s |
| prove0 | U | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000741 s | 0.000763 s | 0.253619 s | 0.000000 s | 0.255139 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000336 s | 0.000010 s | 0.003885 s | 0.000046 s | 0.000107 s | 0.000286 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004684 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.519619 s |
| prove0 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000749 s | 0.000730 s | 0.247736 s | 0.000000 s | 0.249227 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001046 s | 0.000009 s | 0.005683 s | 0.000049 s | 0.000072 s | 0.002111 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008985 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.516399 s |
| prove0 | W | 0.001761 s | 0.000000 s | 0.000875 s | 0.202308 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.204960 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.409905 s |
| prove0 | p0XY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.088247 s | 0.000194 s | 0.000674 s | 0.000152 s | 0.084290 s | 0.085351 s | 0.000001 s | 0.016310 s | 0.016656 s | 0.035007 s | 0.012956 s | 0.104527 s | 0.062697 s | 0.104087 s | 0.000000 s | 0.526254 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004214 s | 0.000000 s | 0.000477 s | 0.083547 s | 1.225641 s |
| prove1 | R | 0.007178 s | 0.000000 s | 0.000990 s | 0.202641 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.210823 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000882 s | 0.000006 s | 0.000032 s | 0.000066 s | 0.000104 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001098 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.423820 s |
| prove2 | Q_CX | 0.006649 s | 0.000001 s | 0.001053 s | 0.207009 s | 0.011919 s | 0.002070 s | 0.529883 s | 0.000000 s | 0.866652 s | 0.000177 s | 0.000106 s | 0.000109 s | 0.030056 s | 0.000316 s | 0.000000 s | 0.025138 s | 0.033547 s | 0.014578 s | 0.003923 s | 0.051219 s | 0.031793 s | 0.050285 s | 0.000000 s | 0.243433 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003706 s | 0.004928 s | 0.034270 s | 0.005728 s | 0.019685 s | 0.003980 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.072353 s | 0.001328 s | 0.000000 s | 0.000461 s | 0.106215 s | 2.362575 s |
| prove2 | Q_CY | 0.006653 s | 0.000001 s | 0.001180 s | 0.207491 s | 0.011551 s | 0.000809 s | 0.159565 s | 0.000001 s | 0.493988 s | 0.000187 s | 0.000123 s | 0.000158 s | 0.060420 s | 0.105077 s | 0.000000 s | 0.011038 s | 0.033098 s | 0.030986 s | 0.010343 s | 0.101529 s | 0.065124 s | 0.104343 s | 0.000000 s | 0.525826 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004197 s | 0.005588 s | 0.018140 s | 0.006148 s | 0.025129 s | 0.007478 s | 0.000005 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.066755 s | 0.001453 s | 0.000000 s | 0.000514 s | 0.104715 s | 2.169611 s |
| prove2 | p_comb | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.024651 s | 0.000963 s | 0.214872 s | 0.000000 s | 0.500956 s | 0.000904 s | 0.001469 s | 0.000828 s | 0.471304 s | 0.567779 s | 0.000001 s | 0.091896 s | 0.130027 s | 0.208724 s | 0.076773 s | 0.632540 s | 0.382574 s | 0.630077 s | 0.000002 s | 3.210850 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002203 s | 0.002785 s | 0.026949 s | 0.004138 s | 0.033179 s | 0.003146 s | 0.000001 s | 0.011436 s | 0.012689 s | 0.003663 s | 0.003087 s | 0.000001 s | 0.072417 s | 0.012003 s | 0.000000 s | 0.000923 s | 0.216634 s | 7.552446 s |
| prove4 | LHS_for_copy | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.025114 s | 0.001756 s | 0.424686 s | 0.000000 s | 0.451576 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002387 s | 0.003836 s | 0.056248 s | 0.007046 s | 0.052495 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.122044 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.147190 s |
| prove4 | LHS_zk1 | 0.017179 s | 0.000000 s | 0.001449 s | 0.347993 s | 0.004338 s | 0.001393 s | 0.356754 s | 0.000000 s | 0.948662 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001402 s | 0.002095 s | 0.044675 s | 0.004065 s | 0.014804 s | 0.005644 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.072725 s | 0.002421 s | 0.000000 s | 0.000592 s | 0.216498 s | 2.042693 s |
| prove4 | LHS_zk2 | 0.017174 s | 0.000000 s | 0.001310 s | 0.345922 s | 0.006772 s | 0.000684 s | 0.083945 s | 0.000000 s | 0.455838 s | 0.000191 s | 0.000147 s | 0.000124 s | 0.061392 s | 0.000599 s | 0.000000 s | 0.008509 s | 0.066495 s | 0.031033 s | 0.009476 s | 0.101280 s | 0.064848 s | 0.100376 s | 0.000000 s | 0.447868 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004758 s | 0.004568 s | 0.043261 s | 0.005512 s | 0.021568 s | 0.000000 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.079722 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.963377 s |
| prove4 | Pi_A | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.021226 s | 0.004877 s | 0.610949 s | 0.000001 s | 0.765530 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003861 s | 0.006323 s | 0.097143 s | 0.006047 s | 0.026430 s | 0.000000 s | 0.000005 s | 0.044418 s | 0.051448 s | 0.020301 s | 0.012241 s | 0.000001 s | 0.139857 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.810658 s |
| prove4 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000695 s | 0.000965 s | 0.254094 s | 0.000000 s | 0.255767 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000327 s | 0.000008 s | 0.002169 s | 0.000043 s | 0.000062 s | 0.000163 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002784 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.517078 s |
| prove4 | fXY | 0.002481 s | 0.000000 s | 0.000136 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.032049 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010568 s | 0.012469 s | 0.003563 s | 0.002822 s | 0.000001 s | 0.000191 s | 0.001002 s | 0.001373 s | 0.001162 s | 0.001941 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.005679 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.075436 s |
| prove4 | gXY | 0.000340 s | 0.000000 s | 0.000223 s | 0.029172 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.058731 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010468 s | 0.012333 s | 0.003498 s | 0.002685 s | 0.000001 s | 0.000278 s | 0.000011 s | 0.001891 s | 0.000041 s | 0.000059 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002289 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.122021 s |
| prove4 | pC | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.017289 s | 0.001464 s | 0.313799 s | 0.000001 s | 0.332572 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001281 s | 0.003449 s | 0.029696 s | 0.006181 s | 0.024720 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.065367 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.795820 s |
| prove4 | term5 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001143 s | 0.000074 s | 0.000000 s | 0.000000 s | 0.001219 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001077 s | 0.000263 s | 0.000310 s | 0.001971 s | 0.002944 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006575 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.015575 s |
| prove4 | term6 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001146 s | 0.000075 s | 0.000000 s | 0.000000 s | 0.001224 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000945 s | 0.000912 s | 0.002226 s | 0.001972 s | 0.002816 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008880 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.020196 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.013504 s | msm=128x1 |
| prove0 | B | 0.064920 s | msm=4825x258 |
| prove0 | Q_AX | 0.097075 s | msm=4097x511 |
| prove0 | Q_AY | 0.063717 s | msm=4097x257 |
| prove0 | U | 0.064459 s | msm=4097x257 |
| prove0 | V | 0.064787 s | msm=4097x257 |
| prove0 | W | 0.064635 s | msm=4099x259 |
| prove1 | R | 0.062862 s | msm=4097x257 |
| prove2 | Q_CX | 0.192517 s | msm=8192x511 |
| prove2 | Q_CY | 0.135837 s | msm=8191x257 |
| prove4 | M_X | 0.047812 s | msm=4096x256 |
| prove4 | M_Y | 0.011806 s | msm=1x256 |
| prove4 | N_X | 0.047930 s | msm=4096x256 |
| prove4 | N_Y | 0.011430 s | msm=1x256 |
| prove4 | Pi_AX | 0.093937 s | msm=4098x511 |
| prove4 | Pi_AY | 0.011790 s | msm=1x510 |
| prove4 | Pi_B | 0.010625 s | msm=127x1 |
| prove4 | Pi_CX | 0.192982 s | msm=8191x511 |
| prove4 | Pi_CY | 0.011201 s | msm=1x510 |
