# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 62.418158 s |

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
| init | 32.020607 s | - | - |
| prove0 | 6.044220 s | 2.131599 s | 2.080775 s |
| prove1 | 0.886012 s | 0.237748 s | 0.320556 s |
| prove2 | 12.493183 s | 7.109831 s | 1.637861 s |
| prove3 | 1.041690 s | 0.515745 s | 0.000000 s |
| prove4 | 9.923205 s | 7.611691 s | 2.286848 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013679 s | A_free=128x1 |
| build | O_mid_core | 0.016395 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.228371 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010176 s | O_pub_free=128x1 |
| build | a_free_X | 0.001700 s | a_free_X=128x1 |
| build | bXY | 0.027285 s | bXY=4096x256 |
| build | s0_s1 | 1.198673 s | s0/s1=4096x256 |
| build | t_mi | 0.000038 s | t_mi=8192x1 |
| build | t_n | 0.000073 s | t_n=8192x1 |
| build | t_smax | 0.000015 s | t_smax=1x512 |
| build | uvwXY | 30.420833 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000115 s | file_bytes=10284 |
| load | permutation | 0.000892 s | file_bytes=251784 |
| load | placement_variables | 0.087523 s | file_bytes=18449792 |
| load | setup_params | 0.000014 s | file_bytes=140 |
| load | sigma | 0.000122 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000642 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 17.606614 s |
| encode | 6.326039 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.357182 s |
| combine | 5.043702 s |
| div_by_ruffini | 1.862551 s |
| div_by_vanishing_opt | 9.124562 s |
| eval | 0.237097 s |
| from_rou_evals | 0.018908 s |
| mul | 0.115722 s |
| recursion_eval | 0.142149 s |
| scale_coeffs | 0.622050 s |
| to_rou_evals | 0.082691 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.088970 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.119624 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.142770 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005818 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.760049 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.310132 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.180906 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.886019 s | uXY=4096x256 |
| combine | prove4 | V | 0.259059 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.040389 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.061213 s | bXY=4096x256 |
| combine | prove4 | pC | 0.401956 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009267 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009973 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000494 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.124247 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.433280 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.484668 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.311503 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.040340 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.592761 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.131599 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 6.992963 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045856 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034401 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034438 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000218 s | K0=4096x1 |
| eval | prove4 | R | 0.015179 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015158 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015126 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.016123 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015731 s | R=4096x256 |
| eval | prove4 | t_n | 0.005489 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.024275 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015104 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.012908 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001934 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001084 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000313 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000332 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001963 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000375 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.107590 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003899 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000239 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.003993 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.142149 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.068289 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.045248 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.213562 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.187488 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.062617 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.044847 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.041899 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.040792 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.320704 s | B=4096x256 |
| prove0 | Q_AX | 0.467539 s | Q_AX=8192x512 |
| prove0 | Q_AY | 0.320426 s | Q_AY=4096x512 |
| prove0 | U | 0.326077 s | U=4096x256 |
| prove0 | V | 0.324705 s | V=4096x256 |
| prove0 | W | 0.321324 s | W=4096x256 |
| prove1 | R | 0.320556 s | R=4096x256 |
| prove2 | Q_CX | 1.113703 s | Q_CX=16384x512 |
| prove2 | Q_CY | 0.524158 s | Q_CY=4096x512 |
| prove4 | M_X | 0.338076 s | M_X=4096x256 |
| prove4 | M_Y | 0.012486 s | M_Y=4096x256 |
| prove4 | N_X | 0.338504 s | N_X=4096x256 |
| prove4 | N_Y | 0.013064 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.459951 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012293 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.010842 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.089927 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011704 s | Pi_CY=4096x256 |
