# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 32.728363 s |

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
| init | 1.889289 s | - | - |
| prove0 | 6.062256 s | 2.119952 s | 2.103483 s |
| prove1 | 0.905457 s | 0.240104 s | 0.332707 s |
| prove2 | 12.666180 s | 7.190911 s | 1.680298 s |
| prove3 | 1.067534 s | 0.526292 s | 0.000000 s |
| prove4 | 10.128410 s | 7.777575 s | 2.326257 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013780 s | A_free=128x1 |
| build | O_mid_core | 0.016525 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.224569 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010183 s | O_pub_free=128x1 |
| build | a_free_X | 0.000325 s | a_free_X=128x1 |
| build | bXY | 0.028253 s | bXY=4096x256 |
| build | s0_s1 | 1.206917 s | s0/s1=4096x256 |
| build | t_mi | 0.000037 s | t_mi=8192x1 |
| build | t_n | 0.000064 s | t_n=8192x1 |
| build | t_smax | 0.000014 s | t_smax=1x512 |
| build | uvwXY | 0.282576 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000097 s | file_bytes=10284 |
| load | permutation | 0.000876 s | file_bytes=251784 |
| load | placement_variables | 0.089671 s | file_bytes=18449792 |
| load | setup_params | 0.000030 s | file_bytes=140 |
| load | sigma | 0.000120 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000645 s | file_bytes=146449 |

## r1cs Binary Sparse uvwXY Result

This run uses the common uvwXY path for both CPU and GPU execution: subcircuit
R1CS files are loaded from `r1cs/subcircuit*.r1cs` and converted directly into
the sparse rows needed by uvwXY. The dense compact matrices are not allocated,
filled, or transposed in this path.

| comparison | previous JSON/compact | r1cs binary sparse | delta |
| --- | ---: | ---: | ---: |
| total_wall | 39.401806972 s | 32.728362953 s | -6.673444019 s |
| init | 8.638871678 s | 1.889288516 s | -6.749583162 s |
| init.build.witness.uvwXY | 7.042533877 s | 0.282576011 s | -6.759957866 s |

| uvwXY phase | time |
| --- | ---: |
| alloc_eval_buffers | 0.033244447 s |
| usage_scan | 0.000013667 s |
| r1cs_preload_sparse | 0.013192856 s |
| sparse_eval_cpu_rayon | 0.126057491 s |
| usage_report_stdout | 0.000009712 s |
| transpose_cpu | 0.065689263 s |
| from_rou_evals_gpu_icicle | 0.039465439 s |
| cleanup_local_buffers | 0.004818010 s |
| uvwxy_total_function | 0.282572415 s |

| r1cs binary sparse preload phase | total |
| --- | ---: |
| read_binary | 0.001207138 s |
| active_wire_scan | 0.003591813 s |
| active_wire_sort | 0.000589376 s |
| compact_index_maps | 0.000145902 s |
| alloc_sparse_rows | 0.000973528 s |
| fill_sparse_rows | 0.006502033 s |
| per-subcircuit total sum | 0.013112462 s |

## Category Totals

| category | total |
| --- | --- |
| poly | 17.854834 s |
| encode | 6.442745 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.367563 s |
| combine | 5.142675 s |
| div_by_ruffini | 1.917854 s |
| div_by_vanishing_opt | 9.191665 s |
| eval | 0.235672 s |
| from_rou_evals | 0.019142 s |
| mul | 0.116907 s |
| recursion_eval | 0.143577 s |
| scale_coeffs | 0.636357 s |
| to_rou_evals | 0.083421 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.091336 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.123213 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.147191 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005823 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.776767 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.331475 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.202810 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.915363 s | uXY=4096x256 |
| combine | prove4 | V | 0.264801 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.041467 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.063070 s | bXY=4096x256 |
| combine | prove4 | pC | 0.400176 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009394 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009977 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000465 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.126911 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.452085 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.441658 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.326648 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.039693 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.657770 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.119952 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 7.071713 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045660 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034398 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034395 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000209 s | K0=4096x1 |
| eval | prove4 | R | 0.015184 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015020 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015072 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015788 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015166 s | R=4096x256 |
| eval | prove4 | t_n | 0.005467 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.024115 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015200 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.013105 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001939 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001071 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000319 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000327 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001960 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000421 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.108684 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003943 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000277 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.004003 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.143577 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.070020 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.045849 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.219638 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.192200 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.063150 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.045499 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.042309 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.041112 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.323861 s | B=4096x256 |
| prove0 | Q_AX | 0.477472 s | Q_AX=8192x512 |
| prove0 | Q_AY | 0.323938 s | Q_AY=4096x512 |
| prove0 | U | 0.328388 s | U=4096x256 |
| prove0 | V | 0.324245 s | V=4096x256 |
| prove0 | W | 0.325579 s | W=4096x256 |
| prove1 | R | 0.332707 s | R=4096x256 |
| prove2 | Q_CX | 1.138934 s | Q_CX=16384x512 |
| prove2 | Q_CY | 0.541364 s | Q_CY=4096x512 |
| prove4 | M_X | 0.344397 s | M_X=4096x256 |
| prove4 | M_Y | 0.012286 s | M_Y=4096x256 |
| prove4 | N_X | 0.347877 s | N_X=4096x256 |
| prove4 | N_Y | 0.012560 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.478851 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012103 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.010885 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.095771 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011527 s | Pi_CY=4096x256 |
