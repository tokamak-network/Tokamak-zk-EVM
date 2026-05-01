# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 21.081848 s |

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
| init | 0.723311 s | - | - |
| prove0 | 4.029981 s | 1.879608 s | 0.416805 s |
| prove1 | 0.777897 s | 0.352290 s | 0.065766 s |
| prove2 | 7.269874 s | 5.406155 s | 0.329666 s |
| prove3 | 0.899457 s | 0.539973 s | 0.000000 s |
| prove4 | 7.371985 s | 5.010326 s | 0.443145 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013870 s | A_free=128x1 |
| build | O_mid_core | 0.016535 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.232481 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010170 s | O_pub_free=128x1 |
| build | a_free_X | 0.000247 s | a_free_X=128x1 |
| build | bXY | 0.021331 s | bXY=4096x256 |
| build | s0_s1 | 0.044246 s | s0/s1=4096x256 |
| build | t_mi | 0.000048 s | t_mi=8192x1 |
| build | t_n | 0.000075 s | t_n=8192x1 |
| build | t_smax | 0.000016 s | t_smax=1x512 |
| build | uvwXY | 0.279123 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000095 s | file_bytes=10284 |
| load | permutation | 0.000891 s | file_bytes=251784 |
| load | placement_variables | 0.089097 s | file_bytes=18449792 |
| load | setup_params | 0.000015 s | file_bytes=140 |
| load | sigma | 0.000130 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000648 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 13.188352 s |
| encode | 1.268546 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.581312 s |
| combine | 8.482803 s |
| div_by_ruffini | 1.597579 s |
| div_by_vanishing_opt | 1.351466 s |
| eval | 0.282857 s |
| from_rou_evals | 0.010193 s |
| mul | 0.007047 s |
| recursion_eval | 0.143780 s |
| scale_coeffs | 0.657525 s |
| to_rou_evals | 0.073791 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.152410 s | R=4096x256 |
| add | prove4 | N_numerator | 0.138556 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000046 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.061795 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.064542 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.163634 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.000329 s | gXY=4096x256 |
| combine | prove0 | B | 0.130638 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.214091 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.155555 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.149461 s | U=4096x256 |
| combine | prove0 | V | 0.151293 s | V=4096x256 |
| combine | prove0 | W | 0.128600 s | W=4096x256 |
| combine | prove0 | p0XY | 0.472018 s | p0XY=4096x256 |
| combine | prove1 | R | 0.129101 s | R=4096x256 |
| combine | prove2 | Q_CX | 0.761559 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 0.822101 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 2.825848 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.153413 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 0.665772 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 0.791110 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.533818 s | uXY=4096x256 |
| combine | prove4 | V | 0.149368 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.042031 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.038088 s | bXY=4096x256 |
| combine | prove4 | pC | 0.147347 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009635 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.011958 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.317519 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.317311 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.332193 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.000653 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.629904 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.477952 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.873514 s | vanishing=4096x256 |
| eval | prove3 | R | 0.049836 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034494 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034525 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.041697 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.000224 s | K0=4096x1 |
| eval | prove4 | R | 0.015113 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015164 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015078 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015856 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015196 s | R=4096x256 |
| eval | prove4 | t_n | 0.006359 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.024161 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015154 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.005619 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001997 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000226 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000331 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.002021 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.004729 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000289 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.002029 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.143780 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.071710 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.048870 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.224025 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.197092 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.067387 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.048440 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.037718 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.036073 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| add_clone_operands | 0.002145 s |
| add_construct_result | 0.000000 s |
| add_icicle_add | 0.000151 s |
| add_same_stride_icicle_add | 0.053053 s |
| add_transpose_add_sub | 0.024447 s |
| add_transpose_inputs | 0.155049 s |
| add_transpose_output | 0.118771 s |
| add_transpose_same_stride_icicle_add | 0.024342 s |
| add_y_align_resize | 1.842921 s |
| add_y_align_same_stride_icicle_add | 0.053030 s |
| addassign_clone_operands | 0.051266 s |
| addassign_icicle_add | 0.001434 s |
| addassign_update_metadata | 0.000001 s |
| addition | 2.609731 s |
| mul_alloc_lhs_evals | 0.001661 s |
| mul_alloc_out_evals | 0.001985 s |
| mul_alloc_rhs_evals | 0.001436 s |
| mul_clone_resize_lhs | 0.726298 s |
| mul_clone_resize_rhs | 0.773997 s |
| mul_compute_target_size | 0.000002 s |
| mul_find_lhs_degree | 0.156177 s |
| mul_find_rhs_degree | 0.280209 s |
| mul_from_rou_evals | 0.106007 s |
| mul_icicle_eval_mul | 0.117156 s |
| mul_lhs_to_rou_evals | 0.790885 s |
| mul_rhs_to_rou_evals | 0.796329 s |
| mul_setup_vec_ops | 0.000004 s |
| multiplication | 3.791241 s |
| scalar_add_alloc_host | 0.021482 s |
| scalar_add_clone_coeffs | 0.024803 s |
| scalar_add_copy_coeffs | 0.007231 s |
| scalar_add_from_coeffs | 0.005715 s |
| scalar_add_update_constant | 0.000002 s |
| scalar_mul_alloc_input | 0.034075 s |
| scalar_mul_alloc_output | 0.036664 s |
| scalar_mul_copy_coeffs | 0.456136 s |
| scalar_mul_from_coeffs | 0.051769 s |
| scalar_mul_icicle_scalar_mul | 0.235277 s |
| scalar_mul_one_clone | 0.022865 s |
| scalar_mul_setup | 0.000030 s |
| scalar_sub_alloc_host | 0.057056 s |
| scalar_sub_clone_coeffs | 0.064954 s |
| scalar_sub_copy_coeffs | 0.024829 s |
| scalar_sub_from_coeffs | 0.016329 s |
| scalar_sub_update_constant | 0.000001 s |
| scaling | 0.837235 s |
| sub_clone_operands | 0.010610 s |
| sub_construct_result | 0.000000 s |
| sub_icicle_sub | 0.000323 s |
| sub_same_stride_icicle_sub | 0.009531 s |
| sub_y_align_resize | 0.061350 s |
| sub_y_align_same_stride_icicle_sub | 0.001932 s |

## Poly Combine Detail By Target

| module | variable | add_clone_operands | add_construct_result | add_icicle_add | add_same_stride_icicle_add | add_transpose_add_sub | add_transpose_inputs | add_transpose_output | add_transpose_same_stride_icicle_add | add_y_align_resize | add_y_align_same_stride_icicle_add | addassign_clone_operands | addassign_icicle_add | addassign_update_metadata | addition | mul_alloc_lhs_evals | mul_alloc_out_evals | mul_alloc_rhs_evals | mul_clone_resize_lhs | mul_clone_resize_rhs | mul_compute_target_size | mul_find_lhs_degree | mul_find_rhs_degree | mul_from_rou_evals | mul_icicle_eval_mul | mul_lhs_to_rou_evals | mul_rhs_to_rou_evals | mul_setup_vec_ops | multiplication | scalar_add_alloc_host | scalar_add_clone_coeffs | scalar_add_copy_coeffs | scalar_add_from_coeffs | scalar_add_update_constant | scalar_mul_alloc_input | scalar_mul_alloc_output | scalar_mul_copy_coeffs | scalar_mul_from_coeffs | scalar_mul_icicle_scalar_mul | scalar_mul_one_clone | scalar_mul_setup | scalar_sub_alloc_host | scalar_sub_clone_coeffs | scalar_sub_copy_coeffs | scalar_sub_from_coeffs | scalar_sub_update_constant | scaling | sub_clone_operands | sub_construct_result | sub_icicle_sub | sub_same_stride_icicle_sub | sub_y_align_resize | sub_y_align_same_stride_icicle_sub | total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| prove0 | B | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.120020 s | 0.003402 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.123470 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.246892 s |
| prove0 | Q_AX | 0.000000 s | 0.000000 s | 0.000000 s | 0.000841 s | 0.003244 s | 0.013715 s | 0.016684 s | 0.003234 s | 0.111507 s | 0.004547 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.150635 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001315 s | 0.001088 s | 0.053070 s | 0.000425 s | 0.001180 s | 0.000605 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.057709 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.419803 s |
| prove0 | Q_AY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000861 s | 0.002896 s | 0.025143 s | 0.016607 s | 0.002875 s | 0.064781 s | 0.002367 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.112749 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003125 s | 0.001057 s | 0.030009 s | 0.000420 s | 0.001064 s | 0.001332 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.037042 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.302329 s |
| prove0 | U | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.141356 s | 0.002577 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.143986 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000223 s | 0.000009 s | 0.003909 s | 0.000046 s | 0.000105 s | 0.000296 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004604 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.297113 s |
| prove0 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.139529 s | 0.002684 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.142261 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000992 s | 0.000010 s | 0.004865 s | 0.000048 s | 0.000076 s | 0.002138 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008142 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.300745 s |
| prove0 | W | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.118779 s | 0.003555 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.122382 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.244716 s |
| prove0 | p0XY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.063306 s | 0.000185 s | 0.000189 s | 0.000158 s | 0.090162 s | 0.088324 s | 0.000001 s | 0.016440 s | 0.016414 s | 0.011214 s | 0.013223 s | 0.083609 s | 0.084510 s | 0.000001 s | 0.408709 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.061350 s | 0.001932 s | 0.939725 s |
| prove1 | R | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.124428 s | 0.003392 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.127867 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000993 s | 0.000006 s | 0.000036 s | 0.000039 s | 0.000056 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001141 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.257959 s |
| prove2 | Q_CX | 0.000000 s | 0.000000 s | 0.000000 s | 0.006574 s | 0.006664 s | 0.048317 s | 0.035037 s | 0.006653 s | 0.168405 s | 0.005453 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.272332 s | 0.000177 s | 0.000113 s | 0.000118 s | 0.030556 s | 0.000321 s | 0.000000 s | 0.031926 s | 0.033171 s | 0.006260 s | 0.003981 s | 0.040906 s | 0.040649 s | 0.000000 s | 0.191932 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003377 s | 0.003934 s | 0.032910 s | 0.005670 s | 0.018770 s | 0.002096 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.066811 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001736 s | 0.000000 s | 0.000000 s | 1.064853 s |
| prove2 | Q_CY | 0.000000 s | 0.000000 s | 0.000000 s | 0.005274 s | 0.008392 s | 0.053237 s | 0.035532 s | 0.008338 s | 0.000000 s | 0.000000 s | 0.005119 s | 0.000176 s | 0.000000 s | 0.109724 s | 0.000191 s | 0.000149 s | 0.000168 s | 0.062814 s | 0.108087 s | 0.000000 s | 0.009299 s | 0.033793 s | 0.010895 s | 0.010442 s | 0.082135 s | 0.085095 s | 0.000000 s | 0.407343 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008082 s | 0.005184 s | 0.021622 s | 0.006021 s | 0.025318 s | 0.006465 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.072744 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001872 s | 0.000000 s | 0.000000 s | 1.183513 s |
| prove2 | p_comb | 0.000000 s | 0.000000 s | 0.000000 s | 0.012615 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012355 s | 0.000306 s | 0.000000 s | 0.070443 s | 0.000909 s | 0.001370 s | 0.000850 s | 0.479596 s | 0.576662 s | 0.000001 s | 0.085030 s | 0.130284 s | 0.066740 s | 0.078166 s | 0.501532 s | 0.503298 s | 0.000002 s | 2.446957 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002177 s | 0.002783 s | 0.022350 s | 0.004112 s | 0.035509 s | 0.004121 s | 0.000001 s | 0.011481 s | 0.012926 s | 0.003598 s | 0.003256 s | 0.000001 s | 0.071065 s | 0.010610 s | 0.000000 s | 0.000323 s | 0.002929 s | 0.000000 s | 0.000000 s | 5.154354 s |
| prove4 | LHS_for_copy | 0.000000 s | 0.000000 s | 0.000000 s | 0.013252 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012364 s | 0.000303 s | 0.000000 s | 0.025949 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002362 s | 0.003808 s | 0.051563 s | 0.007042 s | 0.053414 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.118216 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.288275 s |
| prove4 | LHS_zk1 | 0.000000 s | 0.000000 s | 0.000000 s | 0.004416 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.242452 s | 0.006461 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.256439 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001342 s | 0.002101 s | 0.036284 s | 0.004050 s | 0.014789 s | 0.005651 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.064250 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002994 s | 0.000000 s | 0.000000 s | 0.641232 s |
| prove4 | LHS_zk2 | 0.000000 s | 0.000000 s | 0.000000 s | 0.002109 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.233895 s | 0.005404 s | 0.005467 s | 0.000156 s | 0.000000 s | 0.247111 s | 0.000198 s | 0.000164 s | 0.000142 s | 0.063169 s | 0.000604 s | 0.000000 s | 0.013482 s | 0.066547 s | 0.010897 s | 0.011345 s | 0.082704 s | 0.082779 s | 0.000001 s | 0.336301 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003574 s | 0.004418 s | 0.050575 s | 0.005502 s | 0.025021 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.089128 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.340695 s |
| prove4 | Pi_A | 0.000000 s | 0.000000 s | 0.000000 s | 0.003619 s | 0.003252 s | 0.014636 s | 0.014910 s | 0.003242 s | 0.169977 s | 0.007325 s | 0.011287 s | 0.000293 s | 0.000000 s | 0.357378 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002753 s | 0.006546 s | 0.107324 s | 0.006081 s | 0.028341 s | 0.000000 s | 0.000004 s | 0.045575 s | 0.052029 s | 0.021232 s | 0.013073 s | 0.000001 s | 0.151097 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.019975 s |
| prove4 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.142140 s | 0.002722 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.144917 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000277 s | 0.000008 s | 0.003035 s | 0.000039 s | 0.000060 s | 0.000161 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003591 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.296950 s |
| prove4 | fXY | 0.002145 s | 0.000000 s | 0.000151 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.031986 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010598 s | 0.012554 s | 0.003625 s | 0.002901 s | 0.000001 s | 0.000161 s | 0.001042 s | 0.000519 s | 0.002117 s | 0.002124 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.005976 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.075900 s |
| prove4 | gXY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000831 s | 0.000683 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.031102 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010884 s | 0.012250 s | 0.003606 s | 0.002814 s | 0.000001 s | 0.000298 s | 0.000012 s | 0.002722 s | 0.000042 s | 0.000060 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003143 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.068448 s |
| prove4 | pC | 0.000000 s | 0.000000 s | 0.000000 s | 0.003491 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.064820 s | 0.002457 s | 0.002337 s | 0.000097 s | 0.000000 s | 0.073248 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001167 s | 0.003445 s | 0.032780 s | 0.006174 s | 0.023571 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.067160 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.280748 s |
| prove4 | term5 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001194 s | 0.000027 s | 0.000000 s | 0.001224 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000950 s | 0.000300 s | 0.000307 s | 0.001970 s | 0.003001 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006541 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.015515 s |
| prove4 | term6 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001143 s | 0.000076 s | 0.000000 s | 0.001221 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000908 s | 0.000914 s | 0.002256 s | 0.001972 s | 0.002818 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008877 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.020186 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.013164 s | msm=128x1 |
| prove0 | B | 0.066112 s | msm=4825x258 |
| prove0 | Q_AX | 0.097259 s | msm=4097x511 |
| prove0 | Q_AY | 0.065824 s | msm=4097x257 |
| prove0 | U | 0.061662 s | msm=4097x257 |
| prove0 | V | 0.062138 s | msm=4097x257 |
| prove0 | W | 0.063810 s | msm=4099x259 |
| prove1 | R | 0.065766 s | msm=4097x257 |
| prove2 | Q_CX | 0.196500 s | msm=8192x511 |
| prove2 | Q_CY | 0.133167 s | msm=8191x257 |
| prove4 | M_X | 0.045427 s | msm=4096x256 |
| prove4 | M_Y | 0.011449 s | msm=1x256 |
| prove4 | N_X | 0.046901 s | msm=4096x256 |
| prove4 | N_Y | 0.011374 s | msm=1x256 |
| prove4 | Pi_AX | 0.095735 s | msm=4098x511 |
| prove4 | Pi_AY | 0.011795 s | msm=1x510 |
| prove4 | Pi_B | 0.010626 s | msm=127x1 |
| prove4 | Pi_CX | 0.198653 s | msm=8191x511 |
| prove4 | Pi_CY | 0.011184 s | msm=1x510 |
