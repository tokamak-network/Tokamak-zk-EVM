# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 20.911589 s |

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
| init | 0.717426 s | - | - |
| prove0 | 4.010397 s | 1.863180 s | 0.415738 s |
| prove1 | 0.778529 s | 0.353878 s | 0.063853 s |
| prove2 | 7.241461 s | 5.381748 s | 0.333321 s |
| prove3 | 0.874040 s | 0.534164 s | 0.000000 s |
| prove4 | 7.280403 s | 4.924048 s | 0.440955 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013910 s | A_free=128x1 |
| build | O_mid_core | 0.016522 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.229062 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010172 s | O_pub_free=128x1 |
| build | a_free_X | 0.000247 s | a_free_X=128x1 |
| build | bXY | 0.021380 s | bXY=4096x256 |
| build | s0_s1 | 0.042705 s | s0/s1=4096x256 |
| build | t_mi | 0.000048 s | t_mi=8192x1 |
| build | t_n | 0.000089 s | t_n=8192x1 |
| build | t_smax | 0.000014 s | t_smax=1x512 |
| build | uvwXY | 0.277400 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000095 s | file_bytes=10284 |
| load | permutation | 0.000872 s | file_bytes=251784 |
| load | placement_variables | 0.089889 s | file_bytes=18449792 |
| load | setup_params | 0.000018 s | file_bytes=140 |
| load | sigma | 0.000122 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000640 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 13.057018 s |
| encode | 1.266938 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.572200 s |
| combine | 8.465146 s |
| div_by_ruffini | 1.512296 s |
| div_by_vanishing_opt | 1.338748 s |
| eval | 0.282216 s |
| from_rou_evals | 0.010290 s |
| mul | 0.007091 s |
| recursion_eval | 0.144955 s |
| scale_coeffs | 0.652064 s |
| to_rou_evals | 0.072013 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.143704 s | R=4096x256 |
| add | prove4 | N_numerator | 0.136659 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000054 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.063230 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.065659 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.162563 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.000331 s | gXY=4096x256 |
| combine | prove0 | B | 0.129971 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.213426 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.155895 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.148956 s | U=4096x256 |
| combine | prove0 | V | 0.151983 s | V=4096x256 |
| combine | prove0 | W | 0.127455 s | W=4096x256 |
| combine | prove0 | p0XY | 0.465261 s | p0XY=4096x256 |
| combine | prove1 | R | 0.131160 s | R=4096x256 |
| combine | prove2 | Q_CX | 0.757865 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 0.814934 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 2.817884 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.153266 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 0.671898 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 0.794494 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.531641 s | uXY=4096x256 |
| combine | prove4 | V | 0.147149 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.042353 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.038663 s | bXY=4096x256 |
| combine | prove4 | pC | 0.149214 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009705 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.011971 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.297345 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.300199 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.314200 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.000531 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.600022 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.470233 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.868514 s | vanishing=4096x256 |
| eval | prove3 | R | 0.049763 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034319 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034373 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.041767 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.000224 s | K0=4096x1 |
| eval | prove4 | R | 0.015149 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015133 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015102 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015811 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015195 s | R=4096x256 |
| eval | prove4 | t_n | 0.006326 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.023979 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015077 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.005750 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001994 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000232 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000283 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.002031 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.004788 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000281 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.002023 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.144955 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.071384 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.048657 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.220616 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.195095 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.067552 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.048760 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.036907 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.035106 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| add_clone_operands | 0.002150 s |
| add_construct_result | 0.000000 s |
| add_icicle_add | 0.000146 s |
| add_same_stride_icicle_add | 0.053095 s |
| add_transpose_add_sub | 0.024416 s |
| add_transpose_inputs | 0.154039 s |
| add_transpose_output | 0.118715 s |
| add_transpose_same_stride_icicle_add | 0.024310 s |
| add_y_align_resize | 1.845195 s |
| add_y_align_same_stride_icicle_add | 0.053517 s |
| addassign_clone_operands | 0.051308 s |
| addassign_icicle_add | 0.001438 s |
| addassign_update_metadata | 0.000001 s |
| addition | 2.608616 s |
| mul_alloc_lhs_evals | 0.001708 s |
| mul_alloc_out_evals | 0.001309 s |
| mul_alloc_rhs_evals | 0.001407 s |
| mul_clone_resize_lhs | 0.721486 s |
| mul_clone_resize_rhs | 0.773370 s |
| mul_compute_target_size | 0.000002 s |
| mul_find_lhs_degree | 0.155982 s |
| mul_find_rhs_degree | 0.281284 s |
| mul_from_rou_evals | 0.104952 s |
| mul_icicle_eval_mul | 0.117095 s |
| mul_lhs_to_rou_evals | 0.779281 s |
| mul_rhs_to_rou_evals | 0.791722 s |
| mul_setup_vec_ops | 0.000004 s |
| multiplication | 3.768690 s |
| scalar_add_alloc_host | 0.021389 s |
| scalar_add_clone_coeffs | 0.025030 s |
| scalar_add_copy_coeffs | 0.007261 s |
| scalar_add_from_coeffs | 0.006083 s |
| scalar_add_update_constant | 0.000002 s |
| scalar_mul_alloc_input | 0.034126 s |
| scalar_mul_alloc_output | 0.034556 s |
| scalar_mul_copy_coeffs | 0.456299 s |
| scalar_mul_from_coeffs | 0.051824 s |
| scalar_mul_icicle_scalar_mul | 0.237542 s |
| scalar_mul_one_clone | 0.022951 s |
| scalar_mul_setup | 0.000033 s |
| scalar_sub_alloc_host | 0.056094 s |
| scalar_sub_clone_coeffs | 0.065202 s |
| scalar_sub_copy_coeffs | 0.024791 s |
| scalar_sub_from_coeffs | 0.016134 s |
| scalar_sub_update_constant | 0.000002 s |
| scaling | 0.837743 s |
| sub_clone_operands | 0.010608 s |
| sub_construct_result | 0.000000 s |
| sub_icicle_sub | 0.000318 s |
| sub_same_stride_icicle_sub | 0.009583 s |
| sub_y_align_resize | 0.058848 s |
| sub_y_align_same_stride_icicle_sub | 0.001914 s |

## Poly Combine Detail By Target

| module | variable | add_clone_operands | add_construct_result | add_icicle_add | add_same_stride_icicle_add | add_transpose_add_sub | add_transpose_inputs | add_transpose_output | add_transpose_same_stride_icicle_add | add_y_align_resize | add_y_align_same_stride_icicle_add | addassign_clone_operands | addassign_icicle_add | addassign_update_metadata | addition | mul_alloc_lhs_evals | mul_alloc_out_evals | mul_alloc_rhs_evals | mul_clone_resize_lhs | mul_clone_resize_rhs | mul_compute_target_size | mul_find_lhs_degree | mul_find_rhs_degree | mul_from_rou_evals | mul_icicle_eval_mul | mul_lhs_to_rou_evals | mul_rhs_to_rou_evals | mul_setup_vec_ops | multiplication | scalar_add_alloc_host | scalar_add_clone_coeffs | scalar_add_copy_coeffs | scalar_add_from_coeffs | scalar_add_update_constant | scalar_mul_alloc_input | scalar_mul_alloc_output | scalar_mul_copy_coeffs | scalar_mul_from_coeffs | scalar_mul_icicle_scalar_mul | scalar_mul_one_clone | scalar_mul_setup | scalar_sub_alloc_host | scalar_sub_clone_coeffs | scalar_sub_copy_coeffs | scalar_sub_from_coeffs | scalar_sub_update_constant | scaling | sub_clone_operands | sub_construct_result | sub_icicle_sub | sub_same_stride_icicle_sub | sub_y_align_resize | sub_y_align_same_stride_icicle_sub | total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| prove0 | B | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.119483 s | 0.003324 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.122854 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.245660 s |
| prove0 | Q_AX | 0.000000 s | 0.000000 s | 0.000000 s | 0.000850 s | 0.003234 s | 0.013732 s | 0.016672 s | 0.003224 s | 0.111099 s | 0.004414 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.150097 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001318 s | 0.001087 s | 0.053058 s | 0.000428 s | 0.001134 s | 0.000625 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.057676 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.418653 s |
| prove0 | Q_AY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000855 s | 0.002898 s | 0.025064 s | 0.016579 s | 0.002876 s | 0.065255 s | 0.002263 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.113004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003114 s | 0.001002 s | 0.030157 s | 0.000421 s | 0.001082 s | 0.001325 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.037136 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.303032 s |
| prove0 | U | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.140774 s | 0.002677 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.143507 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000252 s | 0.000009 s | 0.003857 s | 0.000048 s | 0.000101 s | 0.000285 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004566 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.296076 s |
| prove0 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.140153 s | 0.002597 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.142802 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001021 s | 0.000009 s | 0.004919 s | 0.000052 s | 0.000070 s | 0.002206 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008289 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.302119 s |
| prove0 | W | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.117674 s | 0.003487 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.121209 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.242370 s |
| prove0 | p0XY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.060785 s | 0.000189 s | 0.000148 s | 0.000162 s | 0.087968 s | 0.087814 s | 0.000001 s | 0.016414 s | 0.016271 s | 0.011200 s | 0.013125 s | 0.082904 s | 0.084009 s | 0.000000 s | 0.404474 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.058848 s | 0.001914 s | 0.926227 s |
| prove1 | R | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.126445 s | 0.003426 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.129917 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000990 s | 0.000007 s | 0.000035 s | 0.000042 s | 0.000058 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001144 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.262065 s |
| prove2 | Q_CX | 0.000000 s | 0.000000 s | 0.000000 s | 0.006568 s | 0.006666 s | 0.047423 s | 0.035050 s | 0.006654 s | 0.168465 s | 0.005206 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.271266 s | 0.000170 s | 0.000112 s | 0.000113 s | 0.030162 s | 0.000318 s | 0.000000 s | 0.031931 s | 0.033882 s | 0.006254 s | 0.003929 s | 0.040761 s | 0.040421 s | 0.000000 s | 0.191807 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003313 s | 0.004016 s | 0.032967 s | 0.005670 s | 0.018717 s | 0.002097 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.066832 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001747 s | 0.000000 s | 0.000000 s | 1.062524 s |
| prove2 | Q_CY | 0.000000 s | 0.000000 s | 0.000000 s | 0.005276 s | 0.008369 s | 0.053182 s | 0.035514 s | 0.008316 s | 0.000000 s | 0.000000 s | 0.005133 s | 0.000179 s | 0.000000 s | 0.109624 s | 0.000204 s | 0.000159 s | 0.000174 s | 0.062502 s | 0.106796 s | 0.000000 s | 0.009334 s | 0.033574 s | 0.010877 s | 0.010393 s | 0.080713 s | 0.084131 s | 0.000000 s | 0.403137 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008064 s | 0.005246 s | 0.021624 s | 0.006029 s | 0.025400 s | 0.006473 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.072889 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001855 s | 0.000000 s | 0.000000 s | 1.175170 s |
| prove2 | p_comb | 0.000000 s | 0.000000 s | 0.000000 s | 0.012625 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012378 s | 0.000314 s | 0.000000 s | 0.069815 s | 0.000937 s | 0.000754 s | 0.000816 s | 0.478828 s | 0.577829 s | 0.000001 s | 0.084767 s | 0.130323 s | 0.065736 s | 0.078250 s | 0.494739 s | 0.502125 s | 0.000002 s | 2.437631 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002176 s | 0.001713 s | 0.022363 s | 0.004110 s | 0.036558 s | 0.004122 s | 0.000001 s | 0.011003 s | 0.012702 s | 0.003550 s | 0.003247 s | 0.000001 s | 0.071057 s | 0.010608 s | 0.000000 s | 0.000318 s | 0.003022 s | 0.000000 s | 0.000000 s | 5.134421 s |
| prove4 | LHS_for_copy | 0.000000 s | 0.000000 s | 0.000000 s | 0.013248 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012365 s | 0.000294 s | 0.000000 s | 0.025937 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002369 s | 0.002622 s | 0.051559 s | 0.007028 s | 0.054496 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.118102 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.288021 s |
| prove4 | LHS_zk1 | 0.000000 s | 0.000000 s | 0.000000 s | 0.004431 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.242475 s | 0.007022 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.257011 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001328 s | 0.002161 s | 0.036288 s | 0.004050 s | 0.014844 s | 0.005656 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.064361 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002959 s | 0.000000 s | 0.000000 s | 0.642587 s |
| prove4 | LHS_zk2 | 0.000000 s | 0.000000 s | 0.000000 s | 0.002117 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.238216 s | 0.005547 s | 0.005472 s | 0.000157 s | 0.000000 s | 0.251595 s | 0.000208 s | 0.000136 s | 0.000141 s | 0.062026 s | 0.000613 s | 0.000000 s | 0.013536 s | 0.067234 s | 0.010884 s | 0.011398 s | 0.080164 s | 0.081036 s | 0.000000 s | 0.331642 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003581 s | 0.004480 s | 0.050524 s | 0.005502 s | 0.025180 s | 0.000000 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.089307 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.340698 s |
| prove4 | Pi_A | 0.000000 s | 0.000000 s | 0.000000 s | 0.003631 s | 0.003250 s | 0.014639 s | 0.014900 s | 0.003239 s | 0.167777 s | 0.007581 s | 0.011287 s | 0.000295 s | 0.000000 s | 0.355262 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002755 s | 0.006488 s | 0.107344 s | 0.006084 s | 0.028227 s | 0.000000 s | 0.000005 s | 0.045091 s | 0.052500 s | 0.021241 s | 0.012887 s | 0.000001 s | 0.150950 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.015431 s |
| prove4 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.139951 s | 0.002658 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.142665 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000309 s | 0.000009 s | 0.003026 s | 0.000039 s | 0.000059 s | 0.000161 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003614 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.292492 s |
| prove4 | fXY | 0.002150 s | 0.000000 s | 0.000146 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.032171 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010543 s | 0.012621 s | 0.003654 s | 0.003046 s | 0.000001 s | 0.000164 s | 0.001025 s | 0.000523 s | 0.002139 s | 0.002137 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.076321 s |
| prove4 | gXY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000893 s | 0.000667 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.031494 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010846 s | 0.012409 s | 0.003608 s | 0.003037 s | 0.000001 s | 0.000336 s | 0.000012 s | 0.002723 s | 0.000061 s | 0.000060 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003200 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.069348 s |
| prove4 | pC | 0.000000 s | 0.000000 s | 0.000000 s | 0.003495 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.066535 s | 0.002649 s | 0.002336 s | 0.000095 s | 0.000000 s | 0.075157 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001170 s | 0.003431 s | 0.032767 s | 0.006178 s | 0.023548 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.067117 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.284481 s |
| prove4 | term5 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001193 s | 0.000028 s | 0.000000 s | 0.001223 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000957 s | 0.000321 s | 0.000307 s | 0.001970 s | 0.003050 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006616 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.015666 s |
| prove4 | term6 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001143 s | 0.000076 s | 0.000000 s | 0.001222 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000909 s | 0.000918 s | 0.002256 s | 0.001971 s | 0.002822 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008886 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.020204 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.013071 s | msm=128x1 |
| prove0 | B | 0.064932 s | msm=4825x258 |
| prove0 | Q_AX | 0.096718 s | msm=4097x511 |
| prove0 | Q_AY | 0.066125 s | msm=4097x257 |
| prove0 | U | 0.063517 s | msm=4097x257 |
| prove0 | V | 0.061852 s | msm=4097x257 |
| prove0 | W | 0.062594 s | msm=4099x259 |
| prove1 | R | 0.063853 s | msm=4097x257 |
| prove2 | Q_CX | 0.199789 s | msm=8192x511 |
| prove2 | Q_CY | 0.133532 s | msm=8191x257 |
| prove4 | M_X | 0.045948 s | msm=4096x256 |
| prove4 | M_Y | 0.011790 s | msm=1x256 |
| prove4 | N_X | 0.046300 s | msm=4096x256 |
| prove4 | N_Y | 0.011218 s | msm=1x256 |
| prove4 | Pi_AX | 0.094811 s | msm=4098x511 |
| prove4 | Pi_AY | 0.011747 s | msm=1x510 |
| prove4 | Pi_B | 0.010605 s | msm=127x1 |
| prove4 | Pi_CX | 0.197452 s | msm=8191x511 |
| prove4 | Pi_CY | 0.011084 s | msm=1x510 |
