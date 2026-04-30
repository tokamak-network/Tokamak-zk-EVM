# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 39.006563 s |

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
| init | 8.654836 s | - | - |
| prove0 | 6.005966 s | 2.099665 s | 2.078283 s |
| prove1 | 0.904494 s | 0.241602 s | 0.324798 s |
| prove2 | 12.621363 s | 7.202310 s | 1.649140 s |
| prove3 | 1.065313 s | 0.526215 s | 0.000000 s |
| prove4 | 9.745383 s | 7.463338 s | 2.257373 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013833 s | A_free=128x1 |
| build | O_mid_core | 0.016678 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.226036 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010161 s | O_pub_free=128x1 |
| build | a_free_X | 0.000497 s | a_free_X=128x1 |
| build | bXY | 0.026864 s | bXY=4096x256 |
| build | s0_s1 | 1.212919 s | s0/s1=4096x256 |
| build | t_mi | 0.000038 s | t_mi=8192x1 |
| build | t_n | 0.000069 s | t_n=8192x1 |
| build | t_smax | 0.000018 s | t_smax=1x512 |
| build | uvwXY | 7.041774 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000113 s | file_bytes=10284 |
| load | permutation | 0.000870 s | file_bytes=251784 |
| load | placement_variables | 0.090372 s | file_bytes=18449792 |
| load | setup_params | 0.000014 s | file_bytes=140 |
| load | sigma | 0.000123 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000617 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 17.533130 s |
| encode | 6.309593 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.353709 s |
| combine | 5.052978 s |
| div_by_ruffini | 1.753813 s |
| div_by_vanishing_opt | 9.183311 s |
| eval | 0.235854 s |
| from_rou_evals | 0.019150 s |
| mul | 0.083127 s |
| recursion_eval | 0.145123 s |
| scale_coeffs | 0.622734 s |
| to_rou_evals | 0.083332 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.077245 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.122300 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.148331 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005832 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.786273 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.304884 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.172114 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.909855 s | uXY=4096x256 |
| combine | prove4 | V | 0.262929 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.035779 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.039378 s | bXY=4096x256 |
| combine | prove4 | pC | 0.392803 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009003 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.010055 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000470 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.129437 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.414375 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.409697 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.298570 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.040776 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.590394 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.099665 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 7.083646 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045565 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034340 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034319 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000221 s | K0=4096x1 |
| eval | prove4 | R | 0.015257 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015167 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015164 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015924 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015269 s | R=4096x256 |
| eval | prove4 | t_n | 0.005458 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.024037 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015131 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.013147 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001926 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001084 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000332 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000326 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001990 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000346 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.075009 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003855 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000260 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.004003 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.145123 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.069459 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.045864 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.219712 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.192279 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.056351 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.039069 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.042321 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.041011 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.321976 s | B=4096x256 |
| prove0 | Q_AX | 0.470432 s | Q_AX=8192x512 |
| prove0 | Q_AY | 0.326112 s | Q_AY=4096x512 |
| prove0 | U | 0.322824 s | U=4096x256 |
| prove0 | V | 0.317835 s | V=4096x256 |
| prove0 | W | 0.319104 s | W=4096x256 |
| prove1 | R | 0.324798 s | R=4096x256 |
| prove2 | Q_CX | 1.122071 s | Q_CX=16384x512 |
| prove2 | Q_CY | 0.527068 s | Q_CY=4096x512 |
| prove4 | M_X | 0.323117 s | M_X=4096x256 |
| prove4 | M_Y | 0.011953 s | M_Y=4096x256 |
| prove4 | N_X | 0.324543 s | N_X=4096x256 |
| prove4 | N_Y | 0.013103 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.467121 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012429 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.010986 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.082601 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011521 s | Pi_CY=4096x256 |
