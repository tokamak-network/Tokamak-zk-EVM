# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 21.487536 s |

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
| init | 0.715252 s | - | - |
| prove0 | 4.044442 s | 1.910271 s | 0.416827 s |
| prove1 | 0.772172 s | 0.348454 s | 0.063322 s |
| prove2 | 7.737301 s | 5.866074 s | 0.328776 s |
| prove3 | 0.880419 s | 0.538149 s | 0.000000 s |
| prove4 | 7.328582 s | 4.978947 s | 0.441887 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013849 s | A_free=128x1 |
| build | O_mid_core | 0.016415 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.230139 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010173 s | O_pub_free=128x1 |
| build | a_free_X | 0.000239 s | a_free_X=128x1 |
| build | bXY | 0.020541 s | bXY=4096x256 |
| build | s0_s1 | 0.043481 s | s0/s1=4096x256 |
| build | t_mi | 0.000046 s | t_mi=8192x1 |
| build | t_n | 0.000068 s | t_n=8192x1 |
| build | t_smax | 0.000015 s | t_smax=1x512 |
| build | uvwXY | 0.275076 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000095 s | file_bytes=10284 |
| load | permutation | 0.000869 s | file_bytes=251784 |
| load | placement_variables | 0.089556 s | file_bytes=18449792 |
| load | setup_params | 0.000019 s | file_bytes=140 |
| load | sigma | 0.000128 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000618 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 13.641895 s |
| encode | 1.264034 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.572248 s |
| combine | 9.033003 s |
| div_by_ruffini | 1.531538 s |
| div_by_vanishing_opt | 1.337674 s |
| eval | 0.282392 s |
| from_rou_evals | 0.010319 s |
| mul | 0.007065 s |
| recursion_eval | 0.143308 s |
| scale_coeffs | 0.653124 s |
| to_rou_evals | 0.071223 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.144483 s | R=4096x256 |
| add | prove4 | N_numerator | 0.135001 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000063 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.062876 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.066407 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.163086 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.000332 s | gXY=4096x256 |
| combine | prove0 | B | 0.128472 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.212743 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.154998 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.146281 s | U=4096x256 |
| combine | prove0 | V | 0.148912 s | V=4096x256 |
| combine | prove0 | W | 0.126674 s | W=4096x256 |
| combine | prove0 | p0XY | 0.524360 s | p0XY=4096x256 |
| combine | prove1 | R | 0.128315 s | R=4096x256 |
| combine | prove2 | Q_CX | 0.805457 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 0.888172 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 3.180849 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.153311 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 0.654951 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 0.849826 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.533025 s | uXY=4096x256 |
| combine | prove4 | V | 0.148380 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.041548 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.037891 s | bXY=4096x256 |
| combine | prove4 | pC | 0.147191 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009673 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.011975 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.299842 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.296537 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.315314 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.000985 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.618860 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.467830 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.869844 s | vanishing=4096x256 |
| eval | prove3 | R | 0.049728 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034510 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034393 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.041959 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.000210 s | K0=4096x1 |
| eval | prove4 | R | 0.015082 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015049 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015003 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015822 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015253 s | R=4096x256 |
| eval | prove4 | t_n | 0.006340 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.023938 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015107 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.005609 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001984 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000434 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000298 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.001994 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.004745 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000286 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.002035 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.143308 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.070767 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.048270 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.223449 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.196071 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.066314 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.048254 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.036392 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.034831 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| add_clone_operands | 0.002146 s |
| add_construct_result | 0.000000 s |
| add_icicle_add | 0.000143 s |
| add_same_stride_icicle_add | 0.053031 s |
| add_transpose_add_sub | 0.024437 s |
| add_transpose_inputs | 0.155418 s |
| add_transpose_output | 0.118718 s |
| add_transpose_same_stride_icicle_add | 0.024329 s |
| add_y_align_resize | 1.826987 s |
| add_y_align_same_stride_icicle_add | 0.052650 s |
| addassign_clone_operands | 0.051281 s |
| addassign_icicle_add | 0.001444 s |
| addassign_update_metadata | 0.000001 s |
| addition | 2.587236 s |
| mul_alloc_lhs_evals | 0.001660 s |
| mul_alloc_out_evals | 0.001852 s |
| mul_alloc_rhs_evals | 0.001411 s |
| mul_clone_resize_lhs | 0.718088 s |
| mul_clone_resize_rhs | 0.766965 s |
| mul_compute_target_size | 0.000002 s |
| mul_find_lhs_degree | 0.157392 s |
| mul_find_rhs_degree | 0.283058 s |
| mul_from_rou_evals | 0.112401 s |
| mul_icicle_eval_mul | 0.117164 s |
| mul_lhs_to_rou_evals | 0.785126 s |
| mul_optimize_size | 0.613358 s |
| mul_rhs_to_rou_evals | 0.790217 s |
| mul_setup_vec_ops | 0.000005 s |
| multiplication | 4.377008 s |
| scalar_add_alloc_host | 0.021113 s |
| scalar_add_clone_coeffs | 0.024448 s |
| scalar_add_copy_coeffs | 0.007089 s |
| scalar_add_from_coeffs | 0.005596 s |
| scalar_add_update_constant | 0.000001 s |
| scalar_mul_alloc_input | 0.039220 s |
| scalar_mul_alloc_output | 0.036779 s |
| scalar_mul_copy_coeffs | 0.454056 s |
| scalar_mul_from_coeffs | 0.051603 s |
| scalar_mul_icicle_scalar_mul | 0.229073 s |
| scalar_mul_one_clone | 0.022970 s |
| scalar_mul_setup | 0.000034 s |
| scalar_sub_alloc_host | 0.056666 s |
| scalar_sub_clone_coeffs | 0.064573 s |
| scalar_sub_copy_coeffs | 0.024806 s |
| scalar_sub_from_coeffs | 0.016179 s |
| scalar_sub_update_constant | 0.000001 s |
| scaling | 0.834143 s |
| sub_clone_operands | 0.009687 s |
| sub_construct_result | 0.000000 s |
| sub_icicle_sub | 0.000337 s |
| sub_same_stride_icicle_sub | 0.009375 s |
| sub_y_align_resize | 0.057973 s |
| sub_y_align_same_stride_icicle_sub | 0.001815 s |

## Poly Combine Detail By Target

| module | variable | add_clone_operands | add_construct_result | add_icicle_add | add_same_stride_icicle_add | add_transpose_add_sub | add_transpose_inputs | add_transpose_output | add_transpose_same_stride_icicle_add | add_y_align_resize | add_y_align_same_stride_icicle_add | addassign_clone_operands | addassign_icicle_add | addassign_update_metadata | addition | mul_alloc_lhs_evals | mul_alloc_out_evals | mul_alloc_rhs_evals | mul_clone_resize_lhs | mul_clone_resize_rhs | mul_compute_target_size | mul_find_lhs_degree | mul_find_rhs_degree | mul_from_rou_evals | mul_icicle_eval_mul | mul_lhs_to_rou_evals | mul_optimize_size | mul_rhs_to_rou_evals | mul_setup_vec_ops | multiplication | scalar_add_alloc_host | scalar_add_clone_coeffs | scalar_add_copy_coeffs | scalar_add_from_coeffs | scalar_add_update_constant | scalar_mul_alloc_input | scalar_mul_alloc_output | scalar_mul_copy_coeffs | scalar_mul_from_coeffs | scalar_mul_icicle_scalar_mul | scalar_mul_one_clone | scalar_mul_setup | scalar_sub_alloc_host | scalar_sub_clone_coeffs | scalar_sub_copy_coeffs | scalar_sub_from_coeffs | scalar_sub_update_constant | scaling | sub_clone_operands | sub_construct_result | sub_icicle_sub | sub_same_stride_icicle_sub | sub_y_align_resize | sub_y_align_same_stride_icicle_sub | total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| prove0 | B | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.117890 s | 0.003328 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.121267 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.242486 s |
| prove0 | Q_AX | 0.000000 s | 0.000000 s | 0.000000 s | 0.000845 s | 0.003239 s | 0.013713 s | 0.016659 s | 0.003229 s | 0.110357 s | 0.004443 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.149350 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001352 s | 0.001084 s | 0.053046 s | 0.000421 s | 0.001148 s | 0.000607 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.057683 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.417180 s |
| prove0 | Q_AY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000862 s | 0.002895 s | 0.025177 s | 0.016585 s | 0.002874 s | 0.064044 s | 0.002301 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.111953 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003801 s | 0.001095 s | 0.029503 s | 0.000416 s | 0.001120 s | 0.001320 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.037290 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.301238 s |
| prove0 | U | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.138239 s | 0.002522 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.140816 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000241 s | 0.000010 s | 0.003890 s | 0.000045 s | 0.000096 s | 0.000292 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004587 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.290737 s |
| prove0 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.137167 s | 0.002591 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.139808 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000996 s | 0.000009 s | 0.004932 s | 0.000047 s | 0.000068 s | 0.002157 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008221 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.295998 s |
| prove0 | W | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.116836 s | 0.003450 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.120332 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.240618 s |
| prove0 | p0XY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.059812 s | 0.000171 s | 0.000147 s | 0.000157 s | 0.087075 s | 0.086578 s | 0.000001 s | 0.016519 s | 0.016507 s | 0.012110 s | 0.013112 s | 0.082935 s | 0.062572 s | 0.083306 s | 0.000001 s | 0.464545 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.057973 s | 0.001815 s | 1.045336 s |
| prove1 | R | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.123674 s | 0.003363 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.127084 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000989 s | 0.000006 s | 0.000035 s | 0.000041 s | 0.000056 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001137 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.256386 s |
| prove2 | Q_CX | 0.000000 s | 0.000000 s | 0.000000 s | 0.006575 s | 0.006663 s | 0.048365 s | 0.035057 s | 0.006650 s | 0.176126 s | 0.005385 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.280057 s | 0.000180 s | 0.000113 s | 0.000138 s | 0.032320 s | 0.000320 s | 0.000000 s | 0.032033 s | 0.034542 s | 0.006259 s | 0.003978 s | 0.041726 s | 0.032455 s | 0.042350 s | 0.000000 s | 0.228603 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003437 s | 0.004017 s | 0.032882 s | 0.005681 s | 0.018928 s | 0.002108 s | 0.000005 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.067108 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001746 s | 0.000000 s | 0.000000 s | 1.155808 s |
| prove2 | Q_CY | 0.000000 s | 0.000000 s | 0.000000 s | 0.005266 s | 0.008398 s | 0.053548 s | 0.035526 s | 0.008343 s | 0.000000 s | 0.000000 s | 0.005131 s | 0.000180 s | 0.000000 s | 0.109966 s | 0.000187 s | 0.000149 s | 0.000167 s | 0.062837 s | 0.107642 s | 0.000000 s | 0.009222 s | 0.033475 s | 0.011791 s | 0.010365 s | 0.081634 s | 0.067114 s | 0.085224 s | 0.000000 s | 0.473215 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010021 s | 0.005349 s | 0.020290 s | 0.006017 s | 0.024550 s | 0.006468 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.072748 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001794 s | 0.000000 s | 0.000000 s | 1.316624 s |
| prove2 | p_comb | 0.000000 s | 0.000000 s | 0.000000 s | 0.012615 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012353 s | 0.000306 s | 0.000000 s | 0.069104 s | 0.000911 s | 0.001295 s | 0.000803 s | 0.473917 s | 0.571827 s | 0.000001 s | 0.086159 s | 0.132162 s | 0.070416 s | 0.078192 s | 0.497592 s | 0.384879 s | 0.496987 s | 0.000003 s | 2.811115 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002180 s | 0.002777 s | 0.022352 s | 0.004129 s | 0.031223 s | 0.004203 s | 0.000001 s | 0.011354 s | 0.012753 s | 0.003552 s | 0.003196 s | 0.000001 s | 0.066877 s | 0.009687 s | 0.000000 s | 0.000337 s | 0.002904 s | 0.000000 s | 0.000000 s | 5.878162 s |
| prove4 | LHS_for_copy | 0.000000 s | 0.000000 s | 0.000000 s | 0.013249 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012351 s | 0.000293 s | 0.000000 s | 0.025922 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002363 s | 0.003763 s | 0.051524 s | 0.007024 s | 0.053438 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.118139 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.288066 s |
| prove4 | LHS_zk1 | 0.000000 s | 0.000000 s | 0.000000 s | 0.004407 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.236174 s | 0.006433 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.250061 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001353 s | 0.002157 s | 0.036281 s | 0.004049 s | 0.014799 s | 0.005652 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.064324 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002930 s | 0.000000 s | 0.000000 s | 0.628622 s |
| prove4 | LHS_zk2 | 0.000000 s | 0.000000 s | 0.000000 s | 0.002112 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.230736 s | 0.005532 s | 0.005477 s | 0.000166 s | 0.000000 s | 0.244109 s | 0.000211 s | 0.000148 s | 0.000145 s | 0.061939 s | 0.000599 s | 0.000000 s | 0.013459 s | 0.066372 s | 0.011825 s | 0.011517 s | 0.081238 s | 0.066339 s | 0.082350 s | 0.000001 s | 0.399530 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004690 s | 0.004592 s | 0.050496 s | 0.005500 s | 0.023656 s | 0.000000 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.088973 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.461716 s |
| prove4 | Pi_A | 0.000000 s | 0.000000 s | 0.000000 s | 0.003623 s | 0.003243 s | 0.014614 s | 0.014890 s | 0.003233 s | 0.169131 s | 0.007396 s | 0.011292 s | 0.000304 s | 0.000000 s | 0.356034 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003877 s | 0.006184 s | 0.107283 s | 0.006064 s | 0.028314 s | 0.000000 s | 0.000004 s | 0.045312 s | 0.051820 s | 0.021254 s | 0.012983 s | 0.000001 s | 0.151772 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.018628 s |
| prove4 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.141102 s | 0.002748 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.143915 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000278 s | 0.000009 s | 0.003040 s | 0.000040 s | 0.000060 s | 0.000164 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003600 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.294956 s |
| prove4 | fXY | 0.002146 s | 0.000000 s | 0.000143 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.031450 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010415 s | 0.012342 s | 0.003552 s | 0.002841 s | 0.000001 s | 0.000191 s | 0.001050 s | 0.000505 s | 0.001971 s | 0.002158 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.005886 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.074650 s |
| prove4 | gXY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000878 s | 0.000663 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.030672 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010698 s | 0.012106 s | 0.003537 s | 0.002754 s | 0.000001 s | 0.000332 s | 0.000012 s | 0.002725 s | 0.000041 s | 0.000058 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003177 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.067656 s |
| prove4 | pC | 0.000000 s | 0.000000 s | 0.000000 s | 0.003477 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.064632 s | 0.002494 s | 0.002339 s | 0.000094 s | 0.000000 s | 0.073081 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001227 s | 0.003440 s | 0.032730 s | 0.006174 s | 0.023566 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.067160 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.280418 s |
| prove4 | term5 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001193 s | 0.000025 s | 0.000000 s | 0.001220 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000953 s | 0.000312 s | 0.000310 s | 0.001973 s | 0.003020 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006579 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.015585 s |
| prove4 | term6 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001146 s | 0.000075 s | 0.000000 s | 0.001224 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000940 s | 0.000914 s | 0.002233 s | 0.001970 s | 0.002814 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008881 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.020197 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.013222 s | msm=128x1 |
| prove0 | B | 0.067271 s | msm=4825x258 |
| prove0 | Q_AX | 0.096638 s | msm=4097x511 |
| prove0 | Q_AY | 0.066006 s | msm=4097x257 |
| prove0 | U | 0.061692 s | msm=4097x257 |
| prove0 | V | 0.063078 s | msm=4097x257 |
| prove0 | W | 0.062142 s | msm=4099x259 |
| prove1 | R | 0.063322 s | msm=4097x257 |
| prove2 | Q_CX | 0.195435 s | msm=8192x511 |
| prove2 | Q_CY | 0.133341 s | msm=8191x257 |
| prove4 | M_X | 0.046178 s | msm=4096x256 |
| prove4 | M_Y | 0.011131 s | msm=1x256 |
| prove4 | N_X | 0.045745 s | msm=4096x256 |
| prove4 | N_Y | 0.011887 s | msm=1x256 |
| prove4 | Pi_AX | 0.094839 s | msm=4098x511 |
| prove4 | Pi_AY | 0.011753 s | msm=1x510 |
| prove4 | Pi_B | 0.010579 s | msm=127x1 |
| prove4 | Pi_CX | 0.198646 s | msm=8191x511 |
| prove4 | Pi_CY | 0.011130 s | msm=1x510 |
