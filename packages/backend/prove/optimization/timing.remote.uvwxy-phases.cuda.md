# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 39.401807 s |

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
| init | 8.638872 s | - | - |
| prove0 | 6.013893 s | 2.092685 s | 2.088616 s |
| prove1 | 0.901860 s | 0.241470 s | 0.324176 s |
| prove2 | 12.640294 s | 7.219432 s | 1.650964 s |
| prove3 | 1.065842 s | 0.526035 s | 0.000000 s |
| prove4 | 10.131624 s | 7.784370 s | 2.322464 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.014012 s | A_free=128x1 |
| build | O_mid_core | 0.016516 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.221600 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010165 s | O_pub_free=128x1 |
| build | a_free_X | 0.000486 s | a_free_X=128x1 |
| build | bXY | 0.027103 s | bXY=4096x256 |
| build | s0_s1 | 1.203305 s | s0/s1=4096x256 |
| build | t_mi | 0.000038 s | t_mi=8192x1 |
| build | t_n | 0.000070 s | t_n=8192x1 |
| build | t_smax | 0.000017 s | t_smax=1x512 |
| build | uvwXY | 7.042534 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000109 s | file_bytes=10284 |
| load | permutation | 0.000886 s | file_bytes=251784 |
| load | placement_variables | 0.087261 s | file_bytes=18449792 |
| load | setup_params | 0.000014 s | file_bytes=140 |
| load | sigma | 0.000134 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000623 s | file_bytes=146449 |

## uvwXY Phase Breakdown

This run used `TOKAMAK_UVWXY_PHASE_PROFILE=1` on the CUDA host. The top-level
`init.build.witness.uvwXY` timing event was `7.042533877 s`; the explicit
function-level phase timer measured `7.042530659 s`, leaving only `0.000003218 s`
outside the instrumented function phases.

| uvwXY phase | time | share of function |
| --- | ---: | ---: |
| alloc_eval_buffers | 0.032880809 s | 0.47% |
| usage_scan | 0.000012750 s | 0.00% |
| r1cs_preload_json_compact | 6.596908019 s | 93.67% |
| gpu_check_log | 0.000002408 s | 0.00% |
| sparse_eval_cpu_rayon | 0.126869271 s | 1.80% |
| usage_report_stdout | 0.000021549 s | 0.00% |
| transpose_cpu | 0.065818675 s | 0.93% |
| from_rou_evals_gpu_icicle | 0.039413306 s | 0.56% |
| cleanup_local_buffers | 0.180513704 s | 2.56% |
| uvwxy_total_function | 7.042530659 s | 100.00% |

The previously isolated execution phases requested for comparison remain small:

| requested group | time |
| --- | ---: |
| CPU/Rayon sparse evaluation | 0.126869271 s |
| CPU transpose | 0.065818675 s |
| GPU/ICICLE `from_rou_evals` for U/V/W | 0.039413306 s |
| requested group total | 0.232101252 s |
| uvwXY residual outside requested group | 6.810429407 s |

The residual is dominated by `r1cs_preload_json_compact` at `6.596908019 s`.
This means the current uvwXY bottleneck is not sparse row evaluation, transpose,
or ICICLE inverse biNTT conversion. It is the R1CS preload and compact R1CS
construction path before sparse evaluation begins.

## R1CS Preload Breakdown

This breakdown instruments `SubcircuitR1CS::from_path_with_mode` across the
13 unique subcircuits used in this run. The outer `r1cs_preload_json_compact`
phase measured `6.596908019 s`; the sum of per-subcircuit `total` rows measured
`6.592061085 s`.

| R1CS preload phase | total time | share of outer preload |
| --- | ---: | ---: |
| read_from_json | 0.022028089 s | 0.33% |
| convert_values_to_hex | 0.020732468 s | 0.31% |
| active_wire_scan | 0.003741038 s | 0.06% |
| active_wire_sort | 0.000840663 s | 0.01% |
| compact_index_maps | 0.000081459 s | 0.00% |
| alloc_compact_sparse | 1.869133011 s | 28.33% |
| fill_compact_sparse | 0.973896956 s | 14.76% |
| transpose_compact | 3.700983068 s | 56.10% |
| per-subcircuit total sum | 6.592061085 s | 99.93% |

`Constraints::read_from_json` and `Constraints::convert_values_to_hex` are not
the bottleneck: together they took `0.042760557 s`, less than 0.65% of the outer
preload phase. The dominant costs are allocating dense compact matrices and
transposing them after fill. This matters because the current sparse uvwXY
evaluation path uses `*_active_wires` and `*_sparse_rows`; the dense
`*_compact_col_mat` construction and transpose are mostly legacy/QAP structure
work for this path.

| subcircuit | total | read_json | convert_hex | alloc | fill | transpose |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 13 | 1.064154726 s | 0.004296440 s | 0.004450677 s | 0.280157692 s | 0.215415524 s | 0.558795464 s |
| 10 | 1.040917513 s | 0.004887970 s | 0.004474314 s | 0.274668553 s | 0.208879149 s | 0.547228939 s |
| 11 | 1.016433365 s | 0.003397986 s | 0.003238426 s | 0.264878186 s | 0.217044965 s | 0.526977993 s |
| 6 | 0.986427767 s | 0.002653950 s | 0.002630685 s | 0.286614597 s | 0.127520757 s | 0.566290292 s |
| 4 | 0.919153040 s | 0.002353325 s | 0.001744674 s | 0.281802992 s | 0.080624262 s | 0.552056324 s |
| 5 | 0.755594678 s | 0.002410688 s | 0.002401644 s | 0.220402785 s | 0.092971744 s | 0.436844791 s |
| 3 | 0.500266718 s | 0.000953264 s | 0.000943799 s | 0.157533467 s | 0.026303755 s | 0.314229904 s |

## Category Totals

| category | total |
| --- | --- |
| poly | 17.863991 s |
| encode | 6.386221 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.369277 s |
| combine | 5.191906 s |
| div_by_ruffini | 1.870729 s |
| div_by_vanishing_opt | 9.191875 s |
| eval | 0.236009 s |
| from_rou_evals | 0.019182 s |
| mul | 0.117302 s |
| recursion_eval | 0.144780 s |
| scale_coeffs | 0.639398 s |
| to_rou_evals | 0.083533 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.091630 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.124035 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.147793 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005818 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.785175 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.351239 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.216576 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.913154 s | uXY=4096x256 |
| combine | prove4 | V | 0.266241 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.042203 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.064443 s | bXY=4096x256 |
| combine | prove4 | pC | 0.404775 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009382 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009977 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000467 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.128274 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.447289 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.441817 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.313280 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.039772 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.628571 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.092685 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 7.099190 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045513 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034367 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034580 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000216 s | K0=4096x1 |
| eval | prove4 | R | 0.015208 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015166 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015108 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015784 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015218 s | R=4096x256 |
| eval | prove4 | t_n | 0.005484 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.024240 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015125 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.013156 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001929 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001074 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000328 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000330 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001985 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000380 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.109130 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003897 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000268 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.004006 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.144780 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.070682 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.046229 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.218811 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.192763 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.064640 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.046272 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.042327 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.041206 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.324619 s | B=4096x256 |
| prove0 | Q_AX | 0.473679 s | Q_AX=8192x512 |
| prove0 | Q_AY | 0.324251 s | Q_AY=4096x512 |
| prove0 | U | 0.322471 s | U=4096x256 |
| prove0 | V | 0.324070 s | V=4096x256 |
| prove0 | W | 0.319527 s | W=4096x256 |
| prove1 | R | 0.324176 s | R=4096x256 |
| prove2 | Q_CX | 1.123351 s | Q_CX=16384x512 |
| prove2 | Q_CY | 0.527613 s | Q_CY=4096x512 |
| prove4 | M_X | 0.348296 s | M_X=4096x256 |
| prove4 | M_Y | 0.012598 s | M_Y=4096x256 |
| prove4 | N_X | 0.351874 s | N_X=4096x256 |
| prove4 | N_Y | 0.012899 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.471580 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012154 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.010875 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.090450 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011737 s | Pi_CY=4096x256 |
