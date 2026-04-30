# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 39.731573 s |

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
| init | 8.815259 s | - | - |
| prove0 | 6.110072 s | 2.138988 s | 2.112660 s |
| prove1 | 0.910063 s | 0.242429 s | 0.325272 s |
| prove2 | 12.714640 s | 7.247081 s | 1.666773 s |
| prove3 | 1.065452 s | 0.526204 s | 0.000000 s |
| prove4 | 10.106856 s | 7.749710 s | 2.332532 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013881 s | A_free=128x1 |
| build | O_mid_core | 0.016513 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.224219 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010168 s | O_pub_free=128x1 |
| build | a_free_X | 0.000461 s | a_free_X=128x1 |
| build | bXY | 0.028347 s | bXY=4096x256 |
| build | s0_s1 | 1.204926 s | s0/s1=4096x256 |
| build | t_mi | 0.000056 s | t_mi=8192x1 |
| build | t_n | 0.000079 s | t_n=8192x1 |
| build | t_smax | 0.000018 s | t_smax=1x512 |
| build | uvwXY | 7.209468 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000112 s | file_bytes=10284 |
| load | permutation | 0.000997 s | file_bytes=251784 |
| load | placement_variables | 0.090708 s | file_bytes=18449792 |
| load | setup_params | 0.000016 s | file_bytes=140 |
| load | sigma | 0.000124 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000648 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 17.904412 s |
| encode | 6.437238 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.372169 s |
| combine | 5.178810 s |
| div_by_ruffini | 1.845955 s |
| div_by_vanishing_opt | 9.266871 s |
| eval | 0.236139 s |
| from_rou_evals | 0.019172 s |
| mul | 0.118465 s |
| recursion_eval | 0.144555 s |
| scale_coeffs | 0.637576 s |
| to_rou_evals | 0.084698 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.094252 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.124858 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.147228 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005831 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.778867 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.348770 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.220913 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.910624 s | uXY=4096x256 |
| combine | prove4 | V | 0.264799 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.041746 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.063654 s | bXY=4096x256 |
| combine | prove4 | pC | 0.402276 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009344 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009995 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000485 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.127335 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.444388 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.439349 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.318554 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.039752 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.603912 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.138988 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 7.127883 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045680 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034395 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034552 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000214 s | K0=4096x1 |
| eval | prove4 | R | 0.015276 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015156 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015171 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015793 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015157 s | R=4096x256 |
| eval | prove4 | t_n | 0.005461 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.024130 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015154 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.013176 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001929 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001075 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000330 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000331 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001971 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000361 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.110294 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003906 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000283 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.003981 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.144555 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.069635 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.046228 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.219343 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.192234 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.064199 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.045936 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.042915 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.041783 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.328423 s | B=4096x256 |
| prove0 | Q_AX | 0.478702 s | Q_AX=8192x512 |
| prove0 | Q_AY | 0.328687 s | Q_AY=4096x512 |
| prove0 | U | 0.327774 s | U=4096x256 |
| prove0 | V | 0.321534 s | V=4096x256 |
| prove0 | W | 0.327540 s | W=4096x256 |
| prove1 | R | 0.325272 s | R=4096x256 |
| prove2 | Q_CX | 1.135485 s | Q_CX=16384x512 |
| prove2 | Q_CY | 0.531288 s | Q_CY=4096x512 |
| prove4 | M_X | 0.352941 s | M_X=4096x256 |
| prove4 | M_Y | 0.012803 s | M_Y=4096x256 |
| prove4 | N_X | 0.343747 s | N_X=4096x256 |
| prove4 | N_Y | 0.013293 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.475304 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012120 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.010941 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.099787 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011597 s | Pi_CY=4096x256 |
