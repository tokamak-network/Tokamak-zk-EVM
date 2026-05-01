# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 45.698497 s |

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
| init | 5.206907 s | - | - |
| prove0 | 10.091608 s | 1.296007 s | 8.063311 s |
| prove1 | 2.128802 s | 0.871713 s | 1.155657 s |
| prove2 | 13.371695 s | 6.246832 s | 6.357677 s |
| prove3 | 1.560155 s | 1.143323 s | 0.000000 s |
| prove4 | 13.330191 s | 3.990722 s | 8.751719 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.017288 s | A_free=128x1 |
| build | O_mid_core | 0.087758 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.915107 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.001663 s | O_pub_free=128x1 |
| build | a_free_X | 0.000043 s | a_free_X=128x1 |
| build | bXY | 0.056756 s | bXY=4096x256 |
| build | s0_s1 | 0.102817 s | s0/s1=4096x256 |
| build | t_mi | 0.000007 s | t_mi=8192x1 |
| build | t_n | 0.000007 s | t_n=8192x1 |
| build | t_smax | 0.000003 s | t_smax=1x512 |
| build | uvwXY | 0.208540 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000279 s | file_bytes=10284 |
| load | permutation | 0.001450 s | file_bytes=251784 |
| load | placement_variables | 0.053531 s | file_bytes=18449792 |
| load | setup_params | 0.000252 s | file_bytes=140 |
| load | sigma | 0.008152 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.001657 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 13.548598 s |
| encode | 24.330398 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.050968 s |
| combine | 8.787940 s |
| div_by_ruffini | 1.317354 s |
| div_by_vanishing_opt | 0.230184 s |
| eval | 2.242487 s |
| from_rou_evals | 0.053966 s |
| mul | 0.006265 s |
| recursion_eval | 0.690172 s |
| scale_coeffs | 0.066015 s |
| to_rou_evals | 0.103247 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.007974 s | R=4096x256 |
| add | prove4 | N_numerator | 0.007711 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000016 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.014702 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.009493 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.008201 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.002871 s | gXY=4096x256 |
| combine | prove0 | B | 0.029035 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.177105 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.127320 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.028262 s | U=4096x256 |
| combine | prove0 | V | 0.029310 s | V=4096x256 |
| combine | prove0 | W | 0.028941 s | W=4096x256 |
| combine | prove0 | p0XY | 0.794035 s | p0XY=4096x256 |
| combine | prove1 | R | 0.026206 s | R=4096x256 |
| combine | prove2 | Q_CX | 0.532219 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 0.898707 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 4.653961 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.125615 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 0.143830 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 0.860953 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.184722 s | uXY=4096x256 |
| combine | prove4 | V | 0.024303 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.014430 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.007800 s | bXY=4096x256 |
| combine | prove4 | pC | 0.081259 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009185 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.010742 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.298035 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.307244 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.300287 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.001233 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.410556 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.082000 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.148184 s | vanishing=4096x256 |
| eval | prove3 | R | 0.366892 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.367317 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.367757 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.001202 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.001017 s | K0=4096x1 |
| eval | prove4 | R | 0.152562 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.152688 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.150000 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.150930 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.152030 s | R=4096x256 |
| eval | prove4 | t_n | 0.001307 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.228285 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.150499 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.052088 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.000618 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000706 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000038 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.000516 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.000592 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000639 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.005034 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.690172 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.005861 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.006538 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.017411 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.023947 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.005794 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.006465 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.052661 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.050586 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| add_clone_operands | 0.002305 s |
| add_construct_result | 0.000000 s |
| add_icicle_add | 0.002999 s |
| add_same_stride_icicle_add | 0.128780 s |
| add_transpose_add_sub | 0.054971 s |
| add_transpose_inputs | 0.100395 s |
| add_transpose_output | 0.231002 s |
| add_transpose_same_stride_icicle_add | 0.054887 s |
| add_y_align_resize | 0.220508 s |
| add_y_align_same_stride_icicle_add | 0.241931 s |
| addassign_clone_operands | 0.041147 s |
| addassign_icicle_add | 0.054104 s |
| addassign_update_metadata | 0.000000 s |
| addition | 1.190452 s |
| mul_alloc_lhs_evals | 0.000032 s |
| mul_alloc_out_evals | 0.000044 s |
| mul_alloc_rhs_evals | 0.000030 s |
| mul_clone_resize_lhs | 0.064698 s |
| mul_clone_resize_rhs | 0.057626 s |
| mul_compute_target_size | 0.000000 s |
| mul_find_lhs_degree | 0.008903 s |
| mul_find_rhs_degree | 0.022508 s |
| mul_from_rou_evals | 2.312926 s |
| mul_icicle_eval_mul | 0.068825 s |
| mul_lhs_to_rou_evals | 2.258511 s |
| mul_rhs_to_rou_evals | 2.242542 s |
| mul_setup_vec_ops | 0.000002 s |
| multiplication | 7.036993 s |
| scalar_add_alloc_host | 0.000580 s |
| scalar_add_clone_coeffs | 0.001044 s |
| scalar_add_copy_coeffs | 0.001076 s |
| scalar_add_from_coeffs | 0.001070 s |
| scalar_add_update_constant | 0.000001 s |
| scalar_mul_alloc_input | 0.000285 s |
| scalar_mul_alloc_output | 0.000185 s |
| scalar_mul_copy_coeffs | 0.086992 s |
| scalar_mul_from_coeffs | 0.079942 s |
| scalar_mul_icicle_scalar_mul | 0.276206 s |
| scalar_mul_one_clone | 0.022042 s |
| scalar_mul_setup | 0.000044 s |
| scalar_sub_alloc_host | 0.001371 s |
| scalar_sub_clone_coeffs | 0.003227 s |
| scalar_sub_copy_coeffs | 0.002961 s |
| scalar_sub_from_coeffs | 0.002913 s |
| scalar_sub_update_constant | 0.000001 s |
| scaling | 0.466128 s |
| sub_clone_operands | 0.009673 s |
| sub_construct_result | 0.000000 s |
| sub_icicle_sub | 0.007707 s |
| sub_same_stride_icicle_sub | 0.057750 s |
| sub_y_align_resize | 0.014256 s |
| sub_y_align_same_stride_icicle_sub | 0.007892 s |

## Poly Combine Detail By Target

| module | variable | add_clone_operands | add_construct_result | add_icicle_add | add_same_stride_icicle_add | add_transpose_add_sub | add_transpose_inputs | add_transpose_output | add_transpose_same_stride_icicle_add | add_y_align_resize | add_y_align_same_stride_icicle_add | addassign_clone_operands | addassign_icicle_add | addassign_update_metadata | addition | mul_alloc_lhs_evals | mul_alloc_out_evals | mul_alloc_rhs_evals | mul_clone_resize_lhs | mul_clone_resize_rhs | mul_compute_target_size | mul_find_lhs_degree | mul_find_rhs_degree | mul_from_rou_evals | mul_icicle_eval_mul | mul_lhs_to_rou_evals | mul_rhs_to_rou_evals | mul_setup_vec_ops | multiplication | scalar_add_alloc_host | scalar_add_clone_coeffs | scalar_add_copy_coeffs | scalar_add_from_coeffs | scalar_add_update_constant | scalar_mul_alloc_input | scalar_mul_alloc_output | scalar_mul_copy_coeffs | scalar_mul_from_coeffs | scalar_mul_icicle_scalar_mul | scalar_mul_one_clone | scalar_mul_setup | scalar_sub_alloc_host | scalar_sub_clone_coeffs | scalar_sub_copy_coeffs | scalar_sub_from_coeffs | scalar_sub_update_constant | scaling | sub_clone_operands | sub_construct_result | sub_icicle_sub | sub_same_stride_icicle_sub | sub_y_align_resize | sub_y_align_same_stride_icicle_sub | total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| prove0 | B | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.013614 s | 0.012991 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.026637 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.053242 s |
| prove0 | Q_AX | 0.000000 s | 0.000000 s | 0.000000 s | 0.007650 s | 0.005994 s | 0.009532 s | 0.105217 s | 0.005987 s | 0.016715 s | 0.020917 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.166081 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000014 s | 0.000004 s | 0.001118 s | 0.001079 s | 0.006464 s | 0.002311 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.011011 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.360094 s |
| prove0 | Q_AY | 0.000000 s | 0.000000 s | 0.000000 s | 0.005860 s | 0.009709 s | 0.019484 s | 0.059887 s | 0.009684 s | 0.007525 s | 0.010466 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.112976 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000014 s | 0.000003 s | 0.001146 s | 0.001278 s | 0.006544 s | 0.005317 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.014328 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.264223 s |
| prove0 | U | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.012422 s | 0.014113 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.026562 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000003 s | 0.000005 s | 0.000024 s | 0.000013 s | 0.001096 s | 0.000540 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001693 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.056474 s |
| prove0 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.015997 s | 0.011533 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.027556 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000005 s | 0.000000 s | 0.000007 s | 0.000021 s | 0.001164 s | 0.000543 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001749 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.058576 s |
| prove0 | W | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.011172 s | 0.015085 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.026283 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.052540 s |
| prove0 | p0XY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.022163 s | 0.000003 s | 0.000003 s | 0.000001 s | 0.020744 s | 0.006769 s | 0.000000 s | 0.004528 s | 0.002572 s | 0.242622 s | 0.007042 s | 0.255416 s | 0.232129 s | 0.000000 s | 0.771870 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.014256 s | 0.007892 s | 1.588010 s |
| prove1 | R | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.011592 s | 0.013142 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.024754 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000025 s | 0.000010 s | 0.001405 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001449 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.052379 s |
| prove2 | Q_CX | 0.000000 s | 0.000000 s | 0.000000 s | 0.016529 s | 0.013782 s | 0.025223 s | 0.027162 s | 0.013773 s | 0.026825 s | 0.027581 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.144227 s | 0.000001 s | 0.000006 s | 0.000002 s | 0.001725 s | 0.001076 s | 0.000000 s | 0.000114 s | 0.002224 s | 0.104790 s | 0.003988 s | 0.108470 s | 0.101583 s | 0.000000 s | 0.324011 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000050 s | 0.000020 s | 0.008564 s | 0.008420 s | 0.030497 s | 0.004651 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.052255 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.007051 s | 0.000000 s | 0.000000 s | 1.054606 s |
| prove2 | Q_CY | 0.000000 s | 0.000000 s | 0.000000 s | 0.007361 s | 0.020087 s | 0.036591 s | 0.027157 s | 0.020049 s | 0.000000 s | 0.000000 s | 0.004263 s | 0.004642 s | 0.000000 s | 0.107307 s | 0.000005 s | 0.000006 s | 0.000011 s | 0.003633 s | 0.006510 s | 0.000000 s | 0.000091 s | 0.002755 s | 0.244529 s | 0.007383 s | 0.225555 s | 0.230757 s | 0.000000 s | 0.721264 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000027 s | 0.000027 s | 0.010074 s | 0.009646 s | 0.034324 s | 0.001063 s | 0.000007 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.055220 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.007144 s | 0.000000 s | 0.000000 s | 1.787486 s |
| prove2 | p_comb | 0.000000 s | 0.000000 s | 0.000000 s | 0.014491 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.009269 s | 0.008656 s | 0.000000 s | 0.082371 s | 0.000019 s | 0.000024 s | 0.000014 s | 0.035305 s | 0.041144 s | 0.000000 s | 0.004077 s | 0.008628 s | 1.484714 s | 0.043134 s | 1.422669 s | 1.437931 s | 0.000001 s | 4.477876 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000017 s | 0.000021 s | 0.017828 s | 0.009381 s | 0.027446 s | 0.002429 s | 0.000002 s | 0.000272 s | 0.000639 s | 0.000520 s | 0.000778 s | 0.000000 s | 0.057151 s | 0.009673 s | 0.000000 s | 0.007707 s | 0.030325 s | 0.000000 s | 0.000000 s | 9.234513 s |
| prove4 | LHS_for_copy | 0.000000 s | 0.000000 s | 0.000000 s | 0.028587 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.009221 s | 0.018751 s | 0.000000 s | 0.056591 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000024 s | 0.000027 s | 0.014163 s | 0.013495 s | 0.041251 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.069002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.251114 s |
| prove4 | LHS_zk1 | 0.000000 s | 0.000000 s | 0.000000 s | 0.018601 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.027875 s | 0.027017 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.086791 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000018 s | 0.000012 s | 0.005814 s | 0.007023 s | 0.020653 s | 0.004638 s | 0.000003 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.038194 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.013230 s | 0.000000 s | 0.000000 s | 0.249868 s |
| prove4 | LHS_zk2 | 0.000000 s | 0.000000 s | 0.000000 s | 0.004152 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.025684 s | 0.028596 s | 0.004717 s | 0.004489 s | 0.000000 s | 0.067705 s | 0.000002 s | 0.000005 s | 0.000002 s | 0.003291 s | 0.002128 s | 0.000000 s | 0.000093 s | 0.006331 s | 0.236271 s | 0.007278 s | 0.246402 s | 0.240141 s | 0.000000 s | 0.741973 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000017 s | 0.000009 s | 0.007656 s | 0.008255 s | 0.028233 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.044210 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 1.707642 s |
| prove4 | Pi_A | 0.000000 s | 0.000000 s | 0.000000 s | 0.012884 s | 0.005400 s | 0.009564 s | 0.011579 s | 0.005394 s | 0.027309 s | 0.034463 s | 0.009232 s | 0.008665 s | 0.000000 s | 0.127472 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000049 s | 0.000027 s | 0.009674 s | 0.010487 s | 0.036886 s | 0.000000 s | 0.000005 s | 0.001099 s | 0.002587 s | 0.002441 s | 0.002135 s | 0.000001 s | 0.057184 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.374539 s |
| prove4 | V | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.013014 s | 0.009709 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.022745 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000003 s | 0.000001 s | 0.000006 s | 0.000008 s | 0.000968 s | 0.000549 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001552 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.048557 s |
| prove4 | fXY | 0.002305 s | 0.000000 s | 0.002999 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.007215 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000295 s | 0.000538 s | 0.000534 s | 0.000534 s | 0.000000 s | 0.000007 s | 0.000002 s | 0.001048 s | 0.001177 s | 0.004953 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.007199 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.028806 s |
| prove4 | gXY | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001166 s | 0.003727 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006775 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000285 s | 0.000506 s | 0.000543 s | 0.000537 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000001 s | 0.000005 s | 0.001007 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001021 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.015576 s |
| prove4 | pC | 0.000000 s | 0.000000 s | 0.000000 s | 0.012665 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.009599 s | 0.012589 s | 0.002201 s | 0.004705 s | 0.000000 s | 0.041793 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000024 s | 0.000021 s | 0.007731 s | 0.007441 s | 0.024202 s | 0.000000 s | 0.000002 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.039443 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.162417 s |
| prove4 | term5 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001177 s | 0.001417 s | 0.000000 s | 0.002597 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000004 s | 0.000002 s | 0.001052 s | 0.001065 s | 0.004443 s | 0.000000 s | 0.000004 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006582 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.018343 s |
| prove4 | term6 | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.001067 s | 0.002780 s | 0.000000 s | 0.003850 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000006 s | 0.000002 s | 0.001061 s | 0.001137 s | 0.004671 s | 0.000000 s | 0.000001 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.006886 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.000000 s | 0.021461 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.002034 s | msm=128x1 |
| prove0 | B | 1.165820 s | msm=4825x258 |
| prove0 | Q_AX | 2.268799 s | msm=4097x511 |
| prove0 | Q_AY | 1.153628 s | msm=4097x257 |
| prove0 | U | 1.137232 s | msm=4097x257 |
| prove0 | V | 1.205146 s | msm=4097x257 |
| prove0 | W | 1.132686 s | msm=4099x259 |
| prove1 | R | 1.155657 s | msm=4097x257 |
| prove2 | Q_CX | 4.137464 s | msm=8192x511 |
| prove2 | Q_CY | 2.220213 s | msm=8191x257 |
| prove4 | M_X | 1.177998 s | msm=4096x256 |
| prove4 | M_Y | 0.001567 s | msm=1x256 |
| prove4 | N_X | 1.196595 s | msm=4096x256 |
| prove4 | N_Y | 0.001751 s | msm=1x256 |
| prove4 | Pi_AX | 2.325365 s | msm=4098x511 |
| prove4 | Pi_AY | 0.002207 s | msm=1x510 |
| prove4 | Pi_B | 0.001601 s | msm=127x1 |
| prove4 | Pi_CX | 4.041920 s | msm=8191x511 |
| prove4 | Pi_CY | 0.002714 s | msm=1x510 |
