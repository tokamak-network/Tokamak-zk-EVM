# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 31.237394 s |

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
| init | 0.737941 s | - | - |
| prove0 | 6.001999 s | 2.103204 s | 2.082962 s |
| prove1 | 0.895896 s | 0.238915 s | 0.325664 s |
| prove2 | 12.589832 s | 7.164376 s | 1.654160 s |
| prove3 | 1.062784 s | 0.524387 s | 0.000000 s |
| prove4 | 9.939695 s | 7.596426 s | 2.318677 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013706 s | A_free=128x1 |
| build | O_mid_core | 0.016452 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.221730 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010165 s | O_pub_free=128x1 |
| build | a_free_X | 0.000315 s | a_free_X=128x1 |
| build | bXY | 0.027579 s | bXY=4096x256 |
| build | s0_s1 | 0.053828 s | s0/s1=4096x256 |
| build | t_mi | 0.000048 s | t_mi=8192x1 |
| build | t_n | 0.000065 s | t_n=8192x1 |
| build | t_smax | 0.000016 s | t_smax=1x512 |
| build | uvwXY | 0.289162 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000094 s | file_bytes=10284 |
| load | permutation | 0.000858 s | file_bytes=251784 |
| load | placement_variables | 0.089057 s | file_bytes=18449792 |
| load | setup_params | 0.000019 s | file_bytes=140 |
| load | sigma | 0.000127 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000615 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 17.627308 s |
| encode | 6.381464 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.364873 s |
| combine | 5.032895 s |
| div_by_ruffini | 1.847688 s |
| div_by_vanishing_opt | 9.150074 s |
| eval | 0.235976 s |
| from_rou_evals | 0.019193 s |
| mul | 0.117570 s |
| recursion_eval | 0.143446 s |
| scale_coeffs | 0.633138 s |
| to_rou_evals | 0.082456 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.090433 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.121304 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.147310 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005826 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.582091 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.406641 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.232757 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.900134 s | uXY=4096x256 |
| combine | prove4 | V | 0.260576 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.041102 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.064571 s | bXY=4096x256 |
| combine | prove4 | pC | 0.399984 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009238 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009996 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000455 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.125349 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.428286 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.426081 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.306144 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.044634 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.642543 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.103204 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 7.046870 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045947 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034366 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034385 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000213 s | K0=4096x1 |
| eval | prove4 | R | 0.015420 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015083 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015098 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015750 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015163 s | R=4096x256 |
| eval | prove4 | t_n | 0.005462 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.023942 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015146 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.013014 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001936 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001072 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000330 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000368 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.002033 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000440 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.109458 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003868 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000240 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.004004 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.143446 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.068618 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.045550 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.217817 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.191872 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.063459 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.045822 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.041669 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.040787 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.320803 s | B=4096x256 |
| prove0 | Q_AX | 0.475544 s | Q_AX=8192x512 |
| prove0 | Q_AY | 0.322798 s | Q_AY=4096x512 |
| prove0 | U | 0.322729 s | U=4096x256 |
| prove0 | V | 0.320767 s | V=4096x256 |
| prove0 | W | 0.320321 s | W=4096x256 |
| prove1 | R | 0.325664 s | R=4096x256 |
| prove2 | Q_CX | 1.122792 s | Q_CX=16384x512 |
| prove2 | Q_CY | 0.531368 s | Q_CY=4096x512 |
| prove4 | M_X | 0.343962 s | M_X=4096x256 |
| prove4 | M_Y | 0.012268 s | M_Y=4096x256 |
| prove4 | N_X | 0.344904 s | N_X=4096x256 |
| prove4 | N_Y | 0.012593 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.472376 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012117 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.010928 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.098066 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011462 s | Pi_CY=4096x256 |
