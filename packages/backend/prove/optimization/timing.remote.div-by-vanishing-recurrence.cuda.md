# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 28.910223 s |

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
| init | 0.746520 s | - | - |
| prove0 | 5.032357 s | 1.087509 s | 2.095478 s |
| prove1 | 0.904795 s | 0.243556 s | 0.325004 s |
| prove2 | 11.073070 s | 5.517338 s | 1.679594 s |
| prove3 | 1.085849 s | 0.535472 s | 0.000000 s |
| prove4 | 10.058344 s | 7.723114 s | 2.311451 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013697 s | A_free=128x1 |
| build | O_mid_core | 0.016589 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.227955 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010174 s | O_pub_free=128x1 |
| build | a_free_X | 0.000325 s | a_free_X=128x1 |
| build | bXY | 0.028423 s | bXY=4096x256 |
| build | s0_s1 | 0.057240 s | s0/s1=4096x256 |
| build | t_mi | 0.000044 s | t_mi=8192x1 |
| build | t_n | 0.000074 s | t_n=8192x1 |
| build | t_smax | 0.000017 s | t_smax=1x512 |
| build | uvwXY | 0.287018 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000096 s | file_bytes=10284 |
| load | permutation | 0.000944 s | file_bytes=251784 |
| load | placement_variables | 0.089106 s | file_bytes=18449792 |
| load | setup_params | 0.000020 s | file_bytes=140 |
| load | sigma | 0.000124 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000634 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 15.106989 s |
| encode | 6.411527 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.368900 s |
| combine | 5.182378 s |
| div_by_ruffini | 1.820764 s |
| div_by_vanishing_opt | 6.485119 s |
| eval | 0.237272 s |
| from_rou_evals | 0.017607 s |
| mul | 0.113185 s |
| recursion_eval | 0.145996 s |
| scale_coeffs | 0.651455 s |
| to_rou_evals | 0.084313 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.092705 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.126193 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.144158 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005844 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.765867 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.355156 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.191548 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.933539 s | uXY=4096x256 |
| combine | prove4 | V | 0.270146 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.040180 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.067410 s | bXY=4096x256 |
| combine | prove4 | pC | 0.409427 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.008367 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009130 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000465 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.131144 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.439834 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.439132 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.322986 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.038066 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.580746 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 1.087509 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 5.397610 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045494 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034467 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034423 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000212 s | K0=4096x1 |
| eval | prove4 | R | 0.015271 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015153 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015236 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015921 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015221 s | R=4096x256 |
| eval | prove4 | t_n | 0.006334 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.024416 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015126 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.013247 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001080 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001076 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000353 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000334 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001098 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000419 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.105121 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003808 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000284 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.003971 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.145996 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.070569 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.046650 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.224052 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.197036 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.066083 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.047065 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.043003 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.041311 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.325229 s | B=4096x256 |
| prove0 | Q_AX | 0.470737 s | Q_AX=8192x512 |
| prove0 | Q_AY | 0.326628 s | Q_AY=4096x512 |
| prove0 | U | 0.326659 s | U=4096x256 |
| prove0 | V | 0.324801 s | V=4096x256 |
| prove0 | W | 0.321423 s | W=4096x256 |
| prove1 | R | 0.325004 s | R=4096x256 |
| prove2 | Q_CX | 1.145496 s | Q_CX=16384x512 |
| prove2 | Q_CY | 0.534098 s | Q_CY=4096x512 |
| prove4 | M_X | 0.350911 s | M_X=4096x256 |
| prove4 | M_Y | 0.012954 s | M_Y=4096x256 |
| prove4 | N_X | 0.349050 s | N_X=4096x256 |
| prove4 | N_Y | 0.014228 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.477317 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012217 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.010853 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.072183 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011738 s | Pi_CY=4096x256 |
