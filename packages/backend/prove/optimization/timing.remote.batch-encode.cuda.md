# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 31.744249 s |

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
| init | 0.736217 s | - | - |
| prove0 | 5.796275 s | 2.104509 s | 1.874242 s |
| prove1 | 0.891497 s | 0.229635 s | 0.322356 s |
| prove2 | 12.548639 s | 7.112141 s | 1.643627 s |
| prove3 | 1.040621 s | 0.515950 s | 0.000000 s |
| prove4 | 10.721734 s | 7.777660 s | 2.918992 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013551 s | A_free=128x1 |
| build | O_mid_core | 0.016379 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.220376 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010178 s | O_pub_free=128x1 |
| build | a_free_X | 0.000314 s | a_free_X=128x1 |
| build | bXY | 0.027336 s | bXY=4096x256 |
| build | s0_s1 | 0.055206 s | s0/s1=4096x256 |
| build | t_mi | 0.000049 s | t_mi=8192x1 |
| build | t_n | 0.000065 s | t_n=8192x1 |
| build | t_smax | 0.000015 s | t_smax=1x512 |
| build | uvwXY | 0.288986 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000095 s | file_bytes=10284 |
| load | permutation | 0.000884 s | file_bytes=251784 |
| load | placement_variables | 0.088129 s | file_bytes=18449792 |
| load | setup_params | 0.000019 s | file_bytes=140 |
| load | sigma | 0.000126 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000622 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 17.739895 s |
| encode | 6.759217 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.371204 s |
| combine | 5.157224 s |
| div_by_ruffini | 1.897436 s |
| div_by_vanishing_opt | 9.098864 s |
| eval | 0.237176 s |
| from_rou_evals | 0.017038 s |
| mul | 0.114361 s |
| recursion_eval | 0.140351 s |
| scale_coeffs | 0.627162 s |
| to_rou_evals | 0.079078 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.090481 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.124728 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.149366 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.006629 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.785897 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.342564 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.208323 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.902866 s | uXY=4096x256 |
| combine | prove4 | V | 0.253269 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.041837 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.065825 s | bXY=4096x256 |
| combine | prove4 | pC | 0.405713 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.010383 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.012749 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000437 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.127361 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.442511 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.439448 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.321657 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.037544 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.656277 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.104509 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 6.994355 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045723 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034510 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034515 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000204 s | K0=4096x1 |
| eval | prove4 | R | 0.015240 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015165 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015234 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015671 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015161 s | R=4096x256 |
| eval | prove4 | t_n | 0.006376 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.024186 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015189 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.010206 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.002796 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001073 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000313 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000311 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001958 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000379 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.106853 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003668 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000316 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.003524 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.140351 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.068422 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.045181 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.212226 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.188976 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.064334 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.048023 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.040394 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.038684 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | batch | 1.874242 s | U/V/W/Q_AX/Q_AY/B=6x4096x256 |
| prove1 | R | 0.322356 s | R=4096x256 |
| prove2 | Q_C_batch | 1.643627 s | Q_CX/Q_CY=2x4096x256 |
| prove4 | M_batch | 0.429671 s | M_X/M_Y=2x4096x256 |
| prove4 | N_batch | 0.430901 s | N_X/N_Y=2x4096x256 |
| prove4 | Pi_A_batch | 0.630145 s | Pi_AX/Pi_AY=2x4096x256 |
| prove4 | Pi_B | 0.011122 s | a_free_X=128x1 |
| prove4 | Pi_C_batch | 1.417153 s | Pi_CX/Pi_CY=2x4096x256 |
