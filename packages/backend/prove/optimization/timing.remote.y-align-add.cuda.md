# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 22.598682 s |

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
| init | 0.745924 s | - | - |
| prove0 | 4.167320 s | 2.055871 s | 0.410775 s |
| prove1 | 0.776137 s | 0.357255 s | 0.064921 s |
| prove2 | 8.536624 s | 6.665628 s | 0.326795 s |
| prove3 | 0.878904 s | 0.538895 s | 0.000000 s |
| prove4 | 7.484501 s | 5.126324 s | 0.444088 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013869 s | A_free=128x1 |
| build | O_mid_core | 0.016474 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.229373 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010168 s | O_pub_free=128x1 |
| build | a_free_X | 0.000328 s | a_free_X=128x1 |
| build | bXY | 0.027924 s | bXY=4096x256 |
| build | s0_s1 | 0.055599 s | s0/s1=4096x256 |
| build | t_mi | 0.000048 s | t_mi=8192x1 |
| build | t_n | 0.000076 s | t_n=8192x1 |
| build | t_smax | 0.000015 s | t_smax=1x512 |
| build | uvwXY | 0.287162 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000097 s | file_bytes=10284 |
| load | permutation | 0.000880 s | file_bytes=251784 |
| load | placement_variables | 0.088679 s | file_bytes=18449792 |
| load | setup_params | 0.000016 s | file_bytes=140 |
| load | sigma | 0.000125 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000649 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 14.743973 s |
| encode | 1.259694 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.569602 s |
| combine | 10.098663 s |
| div_by_ruffini | 1.570464 s |
| div_by_vanishing_opt | 1.325876 s |
| eval | 0.282744 s |
| from_rou_evals | 0.015016 s |
| mul | 0.007153 s |
| recursion_eval | 0.141702 s |
| scale_coeffs | 0.653662 s |
| to_rou_evals | 0.079092 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.142623 s | R=4096x256 |
| add | prove4 | N_numerator | 0.135291 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000054 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.060629 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.063739 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.166934 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.000331 s | gXY=4096x256 |
| combine | prove0 | B | 0.126578 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.242492 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.219804 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.144063 s | U=4096x256 |
| combine | prove0 | V | 0.145913 s | V=4096x256 |
| combine | prove0 | W | 0.122916 s | W=4096x256 |
| combine | prove0 | p0XY | 0.590901 s | p0XY=4096x256 |
| combine | prove1 | R | 0.126225 s | R=4096x256 |
| combine | prove2 | Q_CX | 0.964531 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 1.130849 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 3.586681 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.153526 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 0.660194 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 0.919668 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.566866 s | uXY=4096x256 |
| combine | prove4 | V | 0.146894 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.041849 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.038603 s | bXY=4096x256 |
| combine | prove4 | pC | 0.148411 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009730 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.011969 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.292354 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.293631 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.311049 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.000838 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.672592 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.463205 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.862671 s | vanishing=4096x256 |
| eval | prove3 | R | 0.049714 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034344 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034342 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.041664 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.000214 s | K0=4096x1 |
| eval | prove4 | R | 0.015204 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015101 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015146 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.016207 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015436 s | R=4096x256 |
| eval | prove4 | t_n | 0.006348 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.023989 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015035 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.010236 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001954 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000439 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000402 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.001985 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.004836 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000290 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.002028 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.141702 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.070207 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.047893 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.221130 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.199365 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.066634 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.048433 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.040388 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.038704 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| add_clone_operands | 0.002150 s |
| add_construct_result | 0.000000 s |
| add_icicle_add | 0.000144 s |
| add_same_stride_icicle_add | 0.052782 s |
| add_y_align_resize | 2.528471 s |
| add_y_align_same_stride_icicle_add | 0.069923 s |
| addassign_clone_operands | 0.051654 s |
| addassign_icicle_add | 0.001408 s |
| addassign_update_metadata | 0.000001 s |
| addition | 3.007125 s |
| mul_alloc_lhs_evals | 0.001618 s |
| mul_alloc_out_evals | 0.001563 s |
| mul_alloc_rhs_evals | 0.001396 s |
| mul_clone_resize_lhs | 0.711734 s |
| mul_clone_resize_rhs | 0.758964 s |
| mul_compute_target_size | 0.000002 s |
| mul_find_lhs_degree | 0.164678 s |
| mul_find_rhs_degree | 0.277574 s |
| mul_from_rou_evals | 0.325978 s |
| mul_icicle_eval_mul | 0.118774 s |
| mul_lhs_to_rou_evals | 1.007574 s |
| mul_optimize_size | 0.610639 s |
| mul_rhs_to_rou_evals | 1.000213 s |
| mul_setup_vec_ops | 0.000003 s |
| multiplication | 5.008915 s |
| scalar_add_alloc_host | 0.021404 s |
| scalar_add_clone_coeffs | 0.024799 s |
| scalar_add_copy_coeffs | 0.007106 s |
| scalar_add_from_coeffs | 0.005988 s |
| scalar_add_update_constant | 0.000001 s |
| scalar_mul_alloc_input | 0.028735 s |
| scalar_mul_alloc_output | 0.036949 s |
| scalar_mul_copy_coeffs | 0.480288 s |
| scalar_mul_from_coeffs | 0.051621 s |
| scalar_mul_icicle_scalar_mul | 0.229853 s |
| scalar_mul_one_clone | 0.023026 s |
| scalar_mul_setup | 0.000035 s |
| scalar_sub_alloc_host | 0.056154 s |
| scalar_sub_clone_coeffs | 0.064111 s |
| scalar_sub_copy_coeffs | 0.024589 s |
| scalar_sub_from_coeffs | 0.015854 s |
| scalar_sub_update_constant | 0.000001 s |
| scaling | 0.850920 s |
| sub_clone_operands | 0.009527 s |
| sub_construct_result | 0.000000 s |
| sub_icicle_sub | 0.000321 s |
| sub_same_stride_icicle_sub | 0.009383 s |
| sub_y_align_resize | 0.058249 s |
| sub_y_align_same_stride_icicle_sub | 0.001749 s |

## Poly Combine Detail By Target

| module | variable | add_clone_operands | add_construct_result | add_icicle_add | add_same_stride_icicle_add | add_y_align_resize | add_y_align_same_stride_icicle_add | addassign_clone_operands | addassign_icicle_add | addassign_update_metadata | addition | mul_alloc_lhs_evals | mul_alloc_out_evals | mul_alloc_rhs_evals | mul_clone_resize_lhs | mul_clone_resize_rhs | mul_compute_target_size | mul_find_lhs_degree | mul_find_rhs_degree | mul_from_rou_evals | mul_icicle_eval_mul | mul_lhs_to_rou_evals | mul_optimize_size | mul_rhs_to_rou_evals | mul_setup_vec_ops | multiplication | scalar_add_alloc_host | scalar_add_clone_coeffs | scalar_add_copy_coeffs | scalar_add_from_coeffs | scalar_add_update_constant | scalar_mul_alloc_input | scalar_mul_alloc_output | scalar_mul_copy_coeffs | scalar_mul_from_coeffs | scalar_mul_icicle_scalar_mul | scalar_mul_one_clone | scalar_mul_setup | scalar_sub_alloc_host | scalar_sub_clone_coeffs | scalar_sub_copy_coeffs | scalar_sub_from_coeffs | scalar_sub_update_constant | scaling | sub_clone_operands | sub_construct_result | sub_icicle_sub | sub_same_stride_icicle_sub | sub_y_align_resize | sub_y_align_same_stride_icicle_sub | total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| prove0 | B | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.116127 s | 0.003421 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.119602 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.239150 s |
| prove0 | Q_AX | 0.000000 s | 0.000000 s | 0.000000 s | 0.000845 s | 0.168691 s | 0.006342 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.175978 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000442 s | 0.001097 s | 0.057009 s | 0.000424 s | 0.001120 s | 0.000605 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.060720 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.473275 s |
| prove0 | Q_AY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000857 s | 0.171738 s | 0.004936 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.177636 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001368 s | 0.001056 s | 0.031070 s | 0.000431 s | 0.001133 s | 0.001372 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.036465 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.428063 s |
| prove0 | U | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.136187 s | 0.002320 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.138557 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000286 s | 0.000008 s | 0.003887 s | 0.000043 s | 0.000104 s | 0.000282 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004626 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.286303 s |
| prove0 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.134396 s | 0.002359 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.136804 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000999 s | 0.000015 s | 0.004914 s | 0.000056 s | 0.000074 s | 0.002161 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008231 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.290012 s |
| prove0 | W | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.113368 s | 0.003267 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.116679 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.233314 s |
| prove0 | p0XY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.060021 s | 0.000177 s | 0.000140 s | 0.000153 s | 0.086289 s | 0.086132 s | 0.000001 s | 0.016161 s | 0.016125 s | 0.034965 s | 0.013017 s | 0.106321 s | 0.062813 s | 0.105230 s | 0.000000 s | 0.530877 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.058249 s | 0.001749 s | 1.178422 s |
| prove1 | R | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.121820 s | 0.003244 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.125108 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000885 s | 0.000006 s | 0.000035 s | 0.000040 s | 0.000052 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001028 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.252218 s |
| prove2 | Q_CX | 0.000000 s | 0.000000 s | 0.000000 s | 0.006571 s | 0.388531 s | 0.008702 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.405611 s | 0.000175 s | 0.000101 s | 0.000109 s | 0.030455 s | 0.000315 s | 0.000000 s | 0.038931 s | 0.033370 s | 0.016300 s | 0.004910 s | 0.053429 s | 0.031232 s | 0.052972 s | 0.000000 s | 0.264497 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003413 s | 0.004067 s | 0.032881 s | 0.005673 s | 0.019765 s | 0.002110 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.067961 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001667 s | 0.000000 s | 0.000000 s | 1.473756 s |
| prove2 | Q_CY | 0.000000 s | 0.000000 s | 0.000000 s | 0.004938 s | 0.270289 s | 0.007615 s | 0.005495 s | 0.000156 s | 0.000000 s | 0.290434 s | 0.000179 s | 0.000138 s | 0.000151 s | 0.061142 s | 0.104965 s | 0.000000 s | 0.008223 s | 0.032803 s | 0.032739 s | 0.011217 s | 0.104234 s | 0.066138 s | 0.104333 s | 0.000000 s | 0.529649 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003850 s | 0.005312 s | 0.035672 s | 0.006002 s | 0.024503 s | 0.006472 s | 0.000005 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.081875 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001786 s | 0.000000 s | 0.000000 s | 1.800317 s |
| prove2 | p_comb | 0.000000 s | 0.000000 s | 0.000000 s | 0.012642 s | 0.000000 s | 0.000000 s | 0.012367 s | 0.000297 s | 0.000000 s | 0.068704 s | 0.000889 s | 0.001038 s | 0.000848 s | 0.471837 s | 0.566956 s | 0.000001 s | 0.087817 s | 0.128877 s | 0.209198 s | 0.078197 s | 0.638226 s | 0.384609 s | 0.633485 s | 0.000002 s | 3.217867 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002183 s | 0.002890 s | 0.022338 s | 0.004121 s | 0.031197 s | 0.004207 s | 0.000001 s | 0.011271 s | 0.012599 s | 0.003513 s | 0.003171 s | 0.000001 s | 0.066948 s | 0.009527 s | 0.000000 s | 0.000321 s | 0.002947 s | 0.000000 s | 0.000000 s | 6.691089 s |
| prove4 | LHS_for_copy | 0.000000 s | 0.000000 s | 0.000000 s | 0.013260 s | 0.000000 s | 0.000000 s | 0.012368 s | 0.000306 s | 0.000000 s | 0.025964 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002375 s | 0.003826 s | 0.051573 s | 0.007034 s | 0.053481 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.118318 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.288507 s |
| prove4 | LHS_zk1 | 0.000000 s | 0.000000 s | 0.000000 s | 0.004441 s | 0.237994 s | 0.006588 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.252119 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001355 s | 0.002139 s | 0.036260 s | 0.004052 s | 0.014795 s | 0.005651 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.064285 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002983 s | 0.000000 s | 0.000000 s | 0.632664 s |
| prove4 | LHS_zk2 | 0.000000 s | 0.000000 s | 0.000000 s | 0.002100 s | 0.233072 s | 0.005465 s | 0.005467 s | 0.000162 s | 0.000000 s | 0.246352 s | 0.000196 s | 0.000146 s | 0.000135 s | 0.062010 s | 0.000596 s | 0.000000 s | 0.013545 s | 0.066400 s | 0.032776 s | 0.011434 s | 0.105365 s | 0.065847 s | 0.104193 s | 0.000000 s | 0.466025 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.004717 s | 0.004619 s | 0.050503 s | 0.005501 s | 0.023594 s | 0.000000 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.088974 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.599199 s |
| prove4 | Pi_A | 0.000000 s | 0.000000 s | 0.000000 s | 0.003633 s | 0.229971 s | 0.009645 s | 0.011288 s | 0.000290 s | 0.000000 s | 0.385156 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.002938 s | 0.006184 s | 0.112631 s | 0.006075 s | 0.028351 s | 0.000000 s | 0.000005 s | 0.044883 s | 0.051512 s | 0.021076 s | 0.012683 s | 0.000001 s | 0.156230 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.082554 s |
| prove4 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.139662 s | 0.002729 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.142443 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000271 s | 0.000009 s | 0.003037 s | 0.000039 s | 0.000059 s | 0.000165 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003592 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.292008 s |
| prove4 | fXY | 0.002150 s | 0.000000 s | 0.000144 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.031780 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010457 s | 0.012512 s | 0.003569 s | 0.002937 s | 0.000001 s | 0.000198 s | 0.001027 s | 0.000513 s | 0.001970 s | 0.002147 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.005868 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.075273 s |
| prove4 | gXY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000881 s | 0.000663 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.031398 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.010947 s | 0.012287 s | 0.003536 s | 0.003051 s | 0.000001 s | 0.000325 s | 0.000011 s | 0.002725 s | 0.000042 s | 0.000059 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.003170 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.069097 s |
| prove4 | pC | 0.000000 s | 0.000000 s | 0.000000 s | 0.003495 s | 0.065743 s | 0.002627 s | 0.002330 s | 0.000095 s | 0.000000 s | 0.074334 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001234 s | 0.003441 s | 0.032695 s | 0.006174 s | 0.023558 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.067124 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.282853 s |
| prove4 | term5 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001197 s | 0.000028 s | 0.000000 s | 0.001228 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000958 s | 0.000327 s | 0.000309 s | 0.001972 s | 0.003045 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006622 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.015686 s |
| prove4 | term6 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001142 s | 0.000073 s | 0.000000 s | 0.001217 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000937 s | 0.000913 s | 0.002235 s | 0.001971 s | 0.002816 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.008882 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.020187 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.013116 s | msm=128x1 |
| prove0 | B | 0.065396 s | msm=4825x258 |
| prove0 | Q_AX | 0.094898 s | msm=4097x511 |
| prove0 | Q_AY | 0.064081 s | msm=4097x257 |
| prove0 | U | 0.061542 s | msm=4097x257 |
| prove0 | V | 0.060944 s | msm=4097x257 |
| prove0 | W | 0.063914 s | msm=4099x259 |
| prove1 | R | 0.064921 s | msm=4097x257 |
| prove2 | Q_CX | 0.193514 s | msm=8192x511 |
| prove2 | Q_CY | 0.133281 s | msm=8191x257 |
| prove4 | M_X | 0.047134 s | msm=4096x256 |
| prove4 | M_Y | 0.011347 s | msm=1x256 |
| prove4 | N_X | 0.046072 s | msm=4096x256 |
| prove4 | N_Y | 0.011235 s | msm=1x256 |
| prove4 | Pi_AX | 0.094909 s | msm=4098x511 |
| prove4 | Pi_AY | 0.011725 s | msm=1x510 |
| prove4 | Pi_B | 0.010636 s | msm=127x1 |
| prove4 | Pi_CX | 0.199959 s | msm=8191x511 |
| prove4 | Pi_CY | 0.011071 s | msm=1x510 |
