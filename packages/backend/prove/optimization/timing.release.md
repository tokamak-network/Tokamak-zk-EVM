# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 45.110988 s |

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
| init | 4.689967 s | - | - |
| prove0 | 9.934153 s | 1.300481 s | 8.100843 s |
| prove1 | 2.082022 s | 0.860517 s | 1.122344 s |
| prove2 | 13.379030 s | 6.263759 s | 6.484433 s |
| prove3 | 1.589273 s | 1.162704 s | 0.000000 s |
| prove4 | 13.428931 s | 4.013756 s | 8.793675 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.001827 s | A_free=128x1 |
| build | O_mid_core | 0.006670 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.501286 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.001449 s | O_pub_free=128x1 |
| build | a_free_X | 0.000052 s | a_free_X=128x1 |
| build | bXY | 0.057337 s | bXY=4096x256 |
| build | s0_s1 | 0.102590 s | s0/s1=4096x256 |
| build | t_mi | 0.000015 s | t_mi=8192x1 |
| build | t_n | 0.000014 s | t_n=8192x1 |
| build | t_smax | 0.000001 s | t_smax=1x512 |
| build | uvwXY | 0.197290 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000088 s | file_bytes=10284 |
| load | permutation | 0.000636 s | file_bytes=251784 |
| load | placement_variables | 0.054149 s | file_bytes=18449792 |
| load | setup_params | 0.000028 s | file_bytes=140 |
| load | sigma | 0.000126 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000381 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 13.601216 s |
| encode | 24.502779 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.052675 s |
| combine | 8.804268 s |
| div_by_ruffini | 1.320358 s |
| div_by_vanishing_opt | 0.236688 s |
| eval | 2.277538 s |
| from_rou_evals | 0.051671 s |
| mul | 0.004572 s |
| recursion_eval | 0.680396 s |
| scale_coeffs | 0.068109 s |
| to_rou_evals | 0.104941 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.008372 s | R=4096x256 |
| add | prove4 | N_numerator | 0.008357 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000004 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.015426 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.009589 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.008110 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.002816 s | gXY=4096x256 |
| combine | prove0 | B | 0.027467 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.178374 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.117541 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.029743 s | U=4096x256 |
| combine | prove0 | V | 0.024610 s | V=4096x256 |
| combine | prove0 | W | 0.027025 s | W=4096x256 |
| combine | prove0 | p0XY | 0.806767 s | p0XY=4096x256 |
| combine | prove1 | R | 0.025500 s | R=4096x256 |
| combine | prove2 | Q_CX | 0.536734 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 0.905648 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 4.659295 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.115275 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 0.146226 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 0.866806 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.186519 s | uXY=4096x256 |
| combine | prove4 | V | 0.024935 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.015555 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.008076 s | bXY=4096x256 |
| combine | prove4 | pC | 0.082416 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009590 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.010167 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.292980 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.299701 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.310564 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.001509 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.415604 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.088953 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.147734 s | vanishing=4096x256 |
| eval | prove3 | R | 0.374025 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.376269 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.369897 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.001284 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.001023 s | K0=4096x1 |
| eval | prove4 | R | 0.156688 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.155227 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.155635 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.155916 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.152018 s | R=4096x256 |
| eval | prove4 | t_n | 0.001354 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.226346 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.151858 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.049679 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.000593 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000786 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000035 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.000578 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.000556 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000584 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.003432 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.680396 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.006085 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.006849 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.017720 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.024794 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.005831 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.006830 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.050725 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.054215 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| add_clone_operands | 0.002509 s |
| add_construct_result | 0.000000 s |
| add_icicle_add | 0.003665 s |
| add_same_stride_icicle_add | 0.126531 s |
| add_transpose_add_sub | 0.055041 s |
| add_transpose_inputs | 0.102657 s |
| add_transpose_output | 0.226187 s |
| add_transpose_same_stride_icicle_add | 0.054962 s |
| add_y_align_resize | 0.216300 s |
| add_y_align_same_stride_icicle_add | 0.239500 s |
| addassign_clone_operands | 0.042818 s |
| addassign_icicle_add | 0.041535 s |
| addassign_update_metadata | 0.000000 s |
| addition | 1.162878 s |
| mul_alloc_lhs_evals | 0.000032 s |
| mul_alloc_out_evals | 0.000048 s |
| mul_alloc_rhs_evals | 0.000041 s |
| mul_clone_resize_lhs | 0.061774 s |
| mul_clone_resize_rhs | 0.062529 s |
| mul_compute_target_size | 0.000000 s |
| mul_find_lhs_degree | 0.006976 s |
| mul_find_rhs_degree | 0.021623 s |
| mul_from_rou_evals | 2.312467 s |
| mul_icicle_eval_mul | 0.070652 s |
| mul_lhs_to_rou_evals | 2.287892 s |
| mul_rhs_to_rou_evals | 2.265726 s |
| mul_setup_vec_ops | 0.000003 s |
| multiplication | 7.090077 s |
| scalar_add_alloc_host | 0.000614 s |
| scalar_add_clone_coeffs | 0.001248 s |
| scalar_add_copy_coeffs | 0.001375 s |
| scalar_add_from_coeffs | 0.001077 s |
| scalar_add_update_constant | 0.000001 s |
| scalar_mul_alloc_input | 0.000289 s |
| scalar_mul_alloc_output | 0.000176 s |
| scalar_mul_copy_coeffs | 0.079391 s |
| scalar_mul_from_coeffs | 0.083029 s |
| scalar_mul_icicle_scalar_mul | 0.276762 s |
| scalar_mul_one_clone | 0.017683 s |
| scalar_mul_setup | 0.000048 s |
| scalar_sub_alloc_host | 0.001373 s |
| scalar_sub_clone_coeffs | 0.002918 s |
| scalar_sub_copy_coeffs | 0.003198 s |
| scalar_sub_from_coeffs | 0.002751 s |
| scalar_sub_update_constant | 0.000001 s |
| scaling | 0.457816 s |
| sub_clone_operands | 0.009773 s |
| sub_construct_result | 0.000000 s |
| sub_icicle_sub | 0.007273 s |
| sub_same_stride_icicle_sub | 0.053309 s |
| sub_y_align_resize | 0.012596 s |
| sub_y_align_same_stride_icicle_sub | 0.007842 s |

## Poly Combine Detail By Target

| module | variable | add_clone_operands | add_construct_result | add_icicle_add | add_same_stride_icicle_add | add_transpose_add_sub | add_transpose_inputs | add_transpose_output | add_transpose_same_stride_icicle_add | add_y_align_resize | add_y_align_same_stride_icicle_add | addassign_clone_operands | addassign_icicle_add | addassign_update_metadata | addition | mul_alloc_lhs_evals | mul_alloc_out_evals | mul_alloc_rhs_evals | mul_clone_resize_lhs | mul_clone_resize_rhs | mul_compute_target_size | mul_find_lhs_degree | mul_find_rhs_degree | mul_from_rou_evals | mul_icicle_eval_mul | mul_lhs_to_rou_evals | mul_rhs_to_rou_evals | mul_setup_vec_ops | multiplication | scalar_add_alloc_host | scalar_add_clone_coeffs | scalar_add_copy_coeffs | scalar_add_from_coeffs | scalar_add_update_constant | scalar_mul_alloc_input | scalar_mul_alloc_output | scalar_mul_copy_coeffs | scalar_mul_from_coeffs | scalar_mul_icicle_scalar_mul | scalar_mul_one_clone | scalar_mul_setup | scalar_sub_alloc_host | scalar_sub_clone_coeffs | scalar_sub_copy_coeffs | scalar_sub_from_coeffs | scalar_sub_update_constant | scaling | sub_clone_operands | sub_construct_result | sub_icicle_sub | sub_same_stride_icicle_sub | sub_y_align_resize | sub_y_align_same_stride_icicle_sub | total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| prove0 | B | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.011406 s | 0.013377 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.024806 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.049589 s |
| prove0 | Q_AX | 0.000000 s | 0.000000 s | 0.000000 s | 0.005638 s | 0.006134 s | 0.009513 s | 0.107267 s | 0.006127 s | 0.016742 s | 0.021282 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.166638 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000010 s | 0.000006 s | 0.001456 s | 0.001188 s | 0.006863 s | 0.002176 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.011722 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.362764 s |
| prove0 | Q_AY | 0.000000 s | 0.000000 s | 0.000000 s | 0.006004 s | 0.008002 s | 0.019162 s | 0.057624 s | 0.007987 s | 0.005877 s | 0.010796 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.107515 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000008 s | 0.000003 s | 0.001096 s | 0.001176 s | 0.006614 s | 0.001092 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010013 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.242970 s |
| prove0 | U | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.013171 s | 0.014718 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.027911 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000002 s | 0.000011 s | 0.000007 s | 0.000022 s | 0.001225 s | 0.000552 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001827 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.059445 s |
| prove0 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.013013 s | 0.009641 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.022679 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000003 s | 0.000001 s | 0.000017 s | 0.000024 s | 0.001323 s | 0.000550 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001926 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.049176 s |
| prove0 | W | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.011175 s | 0.013590 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.024793 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.049558 s |
| prove0 | p0XY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.020453 s | 0.000002 s | 0.000003 s | 0.000003 s | 0.018255 s | 0.007108 s | 0.000000 s | 0.002756 s | 0.001090 s | 0.241133 s | 0.007161 s | 0.259115 s | 0.249649 s | 0.000000 s | 0.786311 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012596 s | 0.007842 s | 1.613478 s |
| prove1 | R | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010702 s | 0.013644 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.024371 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000003 s | 0.000000 s | 0.000007 s | 0.000011 s | 0.001096 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001126 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.050961 s |
| prove2 | Q_CX | 0.000000 s | 0.000000 s | 0.000000 s | 0.015255 s | 0.014798 s | 0.026778 s | 0.021364 s | 0.014789 s | 0.027623 s | 0.028972 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.142178 s | 0.000001 s | 0.000007 s | 0.000008 s | 0.001726 s | 0.001467 s | 0.000000 s | 0.000064 s | 0.002190 s | 0.105459 s | 0.004245 s | 0.110061 s | 0.103346 s | 0.000000 s | 0.328607 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000036 s | 0.000017 s | 0.008333 s | 0.008922 s | 0.032436 s | 0.004498 s | 0.000005 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.054298 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.007311 s | 0.000000 s | 0.000000 s | 1.064794 s |
| prove2 | Q_CY | 0.000000 s | 0.000000 s | 0.000000 s | 0.007523 s | 0.020365 s | 0.037258 s | 0.028535 s | 0.020325 s | 0.000000 s | 0.000000 s | 0.004631 s | 0.004378 s | 0.000000 s | 0.110286 s | 0.000002 s | 0.000005 s | 0.000003 s | 0.003351 s | 0.007247 s | 0.000000 s | 0.000038 s | 0.003485 s | 0.237447 s | 0.007285 s | 0.227583 s | 0.237099 s | 0.000001 s | 0.723584 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000025 s | 0.000018 s | 0.009539 s | 0.010320 s | 0.035513 s | 0.001132 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.056608 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.007524 s | 0.000000 s | 0.000000 s | 1.801113 s |
| prove2 | p_comb | 0.000000 s | 0.000000 s | 0.000000 s | 0.014782 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.009840 s | 0.008312 s | 0.000000 s | 0.076361 s | 0.000024 s | 0.000026 s | 0.000019 s | 0.035142 s | 0.044105 s | 0.000000 s | 0.004032 s | 0.007978 s | 1.492319 s | 0.043226 s | 1.448127 s | 1.424465 s | 0.000002 s | 4.499640 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000011 s | 0.000014 s | 0.009427 s | 0.009720 s | 0.026902 s | 0.002169 s | 0.000002 s | 0.000275 s | 0.000500 s | 0.000535 s | 0.000563 s | 0.000000 s | 0.048265 s | 0.009773 s | 0.000000 s | 0.007273 s | 0.024465 s | 0.000000 s | 0.000000 s | 9.248294 s |
| prove4 | LHS_for_copy | 0.000000 s | 0.000000 s | 0.000000 s | 0.028241 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.009370 s | 0.008242 s | 0.000000 s | 0.045882 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000029 s | 0.000027 s | 0.014518 s | 0.014099 s | 0.040657 s | 0.000000 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.069364 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.230432 s |
| prove4 | LHS_zk1 | 0.000000 s | 0.000000 s | 0.000000 s | 0.018669 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.028067 s | 0.028079 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.088890 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000032 s | 0.000011 s | 0.005960 s | 0.007147 s | 0.020444 s | 0.004977 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.038615 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.014010 s | 0.000000 s | 0.000000 s | 0.254902 s |
| prove4 | LHS_zk2 | 0.000000 s | 0.000000 s | 0.000000 s | 0.004299 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.026566 s | 0.022958 s | 0.004709 s | 0.004930 s | 0.000000 s | 0.063510 s | 0.000002 s | 0.000006 s | 0.000007 s | 0.003300 s | 0.002602 s | 0.000000 s | 0.000087 s | 0.006880 s | 0.236109 s | 0.008735 s | 0.243007 s | 0.251168 s | 0.000000 s | 0.751936 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000022 s | 0.000018 s | 0.008150 s | 0.008585 s | 0.026690 s | 0.000000 s | 0.000010 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.043515 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.717800 s |
| prove4 | Pi_A | 0.000000 s | 0.000000 s | 0.000000 s | 0.013285 s | 0.005741 s | 0.009946 s | 0.011396 s | 0.005734 s | 0.027505 s | 0.035393 s | 0.009333 s | 0.009311 s | 0.000000 s | 0.130380 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000046 s | 0.000030 s | 0.009929 s | 0.011056 s | 0.034954 s | 0.000000 s | 0.000010 s | 0.001098 s | 0.002418 s | 0.002663 s | 0.002187 s | 0.000001 s | 0.056092 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.378509 s |
| prove4 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.013033 s | 0.010335 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.023391 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000002 s | 0.000001 s | 0.000006 s | 0.000009 s | 0.000975 s | 0.000538 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001539 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.049829 s |
| prove4 | fXY | 0.002509 s | 0.000000 s | 0.003665 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008275 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000305 s | 0.000555 s | 0.000699 s | 0.000531 s | 0.000000 s | 0.000023 s | 0.000003 s | 0.001151 s | 0.001255 s | 0.004818 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.007260 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.031048 s |
| prove4 | gXY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001090 s | 0.003817 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.007157 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000309 s | 0.000694 s | 0.000675 s | 0.000546 s | 0.000001 s | 0.000001 s | 0.000001 s | 0.000001 s | 0.000004 s | 0.000903 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000913 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.016113 s |
| prove4 | pC | 0.000000 s | 0.000000 s | 0.000000 s | 0.012836 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010330 s | 0.012898 s | 0.002613 s | 0.003297 s | 0.000000 s | 0.042009 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000028 s | 0.000011 s | 0.007391 s | 0.007207 s | 0.025727 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.040386 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.164734 s |
| prove4 | term5 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001074 s | 0.001417 s | 0.000000 s | 0.002495 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000004 s | 0.000003 s | 0.001189 s | 0.001221 s | 0.004658 s | 0.000000 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.007088 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.019152 s |
| prove4 | term6 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001248 s | 0.001648 s | 0.000000 s | 0.002900 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000005 s | 0.000003 s | 0.001214 s | 0.001063 s | 0.004965 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.007261 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.020308 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.001484 s | msm=128x1 |
| prove0 | B | 1.177057 s | msm=4825x258 |
| prove0 | Q_AX | 2.240551 s | msm=4097x511 |
| prove0 | Q_AY | 1.138998 s | msm=4097x257 |
| prove0 | U | 1.189843 s | msm=4097x257 |
| prove0 | V | 1.162361 s | msm=4097x257 |
| prove0 | W | 1.192033 s | msm=4099x259 |
| prove1 | R | 1.122344 s | msm=4097x257 |
| prove2 | Q_CX | 4.123660 s | msm=8192x511 |
| prove2 | Q_CY | 2.360773 s | msm=8191x257 |
| prove4 | M_X | 1.112310 s | msm=4096x256 |
| prove4 | M_Y | 0.001609 s | msm=1x256 |
| prove4 | N_X | 1.172828 s | msm=4096x256 |
| prove4 | N_Y | 0.001932 s | msm=1x256 |
| prove4 | Pi_AX | 2.280871 s | msm=4098x511 |
| prove4 | Pi_AY | 0.001953 s | msm=1x510 |
| prove4 | Pi_B | 0.001576 s | msm=127x1 |
| prove4 | Pi_CX | 4.218362 s | msm=8191x511 |
| prove4 | Pi_CY | 0.002234 s | msm=1x510 |
