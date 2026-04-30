# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 32.072216 s |

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
| init | 0.736439 s | - | - |
| prove0 | 6.078120 s | 2.149032 s | 2.094606 s |
| prove1 | 0.906521 s | 0.240548 s | 0.331107 s |
| prove2 | 12.821970 s | 7.290195 s | 1.689571 s |
| prove3 | 1.089463 s | 0.536571 s | 0.000000 s |
| prove4 | 10.430511 s | 8.058765 s | 2.366833 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013707 s | A_free=128x1 |
| build | O_mid_core | 0.016603 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.221805 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010177 s | O_pub_free=128x1 |
| build | a_free_X | 0.000324 s | a_free_X=128x1 |
| build | bXY | 0.027174 s | bXY=4096x256 |
| build | s0_s1 | 0.054418 s | s0/s1=4096x256 |
| build | t_mi | 0.000043 s | t_mi=8192x1 |
| build | t_n | 0.000073 s | t_n=8192x1 |
| build | t_smax | 0.000016 s | t_smax=1x512 |
| build | uvwXY | 0.288673 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000096 s | file_bytes=10284 |
| load | permutation | 0.000905 s | file_bytes=251784 |
| load | placement_variables | 0.087937 s | file_bytes=18449792 |
| load | setup_params | 0.000020 s | file_bytes=140 |
| load | sigma | 0.000121 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000610 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 18.275111 s |
| encode | 6.482118 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.367532 s |
| combine | 5.461452 s |
| div_by_ruffini | 1.872254 s |
| div_by_vanishing_opt | 9.319074 s |
| eval | 0.235899 s |
| from_rou_evals | 0.019111 s |
| mul | 0.122042 s |
| recursion_eval | 0.144375 s |
| scale_coeffs | 0.650206 s |
| to_rou_evals | 0.083167 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.093062 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.126500 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.145915 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.002055 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.746147 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.351338 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.226827 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.882957 s | uXY=4096x256 |
| combine | prove4 | V | 0.249069 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.042100 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.064057 s | bXY=4096x256 |
| combine | prove4 | pC | 0.737929 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.005296 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.005684 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000518 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.149530 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.455126 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.448973 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.324038 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.036867 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.607250 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.149032 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 7.170042 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045762 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034434 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034404 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000211 s | K0=4096x1 |
| eval | prove4 | R | 0.015174 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015123 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015113 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015993 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015137 s | R=4096x256 |
| eval | prove4 | t_n | 0.005468 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.023974 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015106 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.013006 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001940 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001076 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000339 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000335 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001981 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000434 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.110368 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003905 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000299 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.007471 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.144375 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.070241 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.046557 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.221706 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.200265 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.064760 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.046676 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.042357 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.040811 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.324014 s | B=4096x256 |
| prove0 | Q_AX | 0.473982 s | Q_AX=8192x512 |
| prove0 | Q_AY | 0.325846 s | Q_AY=4096x512 |
| prove0 | U | 0.326071 s | U=4096x256 |
| prove0 | V | 0.322827 s | V=4096x256 |
| prove0 | W | 0.321866 s | W=4096x256 |
| prove1 | R | 0.331107 s | R=4096x256 |
| prove2 | Q_CX | 1.147015 s | Q_CX=16384x512 |
| prove2 | Q_CY | 0.542556 s | Q_CY=4096x512 |
| prove4 | M_X | 0.352083 s | M_X=4096x256 |
| prove4 | M_Y | 0.012045 s | M_Y=4096x256 |
| prove4 | N_X | 0.352464 s | N_X=4096x256 |
| prove4 | N_Y | 0.012662 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.481149 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012128 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.010960 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.121911 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011431 s | Pi_CY=4096x256 |
