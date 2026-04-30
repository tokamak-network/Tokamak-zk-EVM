# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 31.536390 s |

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
| init | 0.736913 s | - | - |
| prove0 | 6.081295 s | 2.141141 s | 2.094388 s |
| prove1 | 0.915542 s | 0.242249 s | 0.332318 s |
| prove2 | 12.686018 s | 7.235848 s | 1.654336 s |
| prove3 | 1.053352 s | 0.520800 s | 0.000000 s |
| prove4 | 10.054102 s | 7.728992 s | 2.300503 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013942 s | A_free=128x1 |
| build | O_mid_core | 0.016455 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.222549 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010176 s | O_pub_free=128x1 |
| build | a_free_X | 0.000323 s | a_free_X=128x1 |
| build | bXY | 0.027528 s | bXY=4096x256 |
| build | s0_s1 | 0.054550 s | s0/s1=4096x256 |
| build | t_mi | 0.000044 s | t_mi=8192x1 |
| build | t_n | 0.000073 s | t_n=8192x1 |
| build | t_smax | 0.000016 s | t_smax=1x512 |
| build | uvwXY | 0.286999 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000105 s | file_bytes=10284 |
| load | permutation | 0.000864 s | file_bytes=251784 |
| load | placement_variables | 0.088394 s | file_bytes=18449792 |
| load | setup_params | 0.000028 s | file_bytes=140 |
| load | sigma | 0.000133 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000635 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 17.869030 s |
| encode | 6.381546 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.385294 s |
| combine | 5.165693 s |
| div_by_ruffini | 1.827674 s |
| div_by_vanishing_opt | 9.257516 s |
| eval | 0.235455 s |
| from_rou_evals | 0.019255 s |
| mul | 0.116638 s |
| recursion_eval | 0.145237 s |
| scale_coeffs | 0.632438 s |
| to_rou_evals | 0.083831 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.090782 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.121667 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.167022 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005823 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.386109 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.235234 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.737784 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.895858 s | uXY=4096x256 |
| combine | prove4 | V | 0.259782 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.041567 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.063840 s | bXY=4096x256 |
| combine | prove4 | pC | 0.402552 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009224 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009985 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000485 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.123274 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.430547 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.427564 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.303069 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.047756 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.618737 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.141141 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 7.116375 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045565 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034332 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034379 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000216 s | K0=4096x1 |
| eval | prove4 | R | 0.015308 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015187 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015119 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015792 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015181 s | R=4096x256 |
| eval | prove4 | t_n | 0.005464 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.023909 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015003 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.013182 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001944 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001076 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000315 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000332 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001971 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000434 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.108531 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003858 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000255 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.003994 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.145237 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.069938 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.046199 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.216642 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.189883 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.063742 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.046034 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.042574 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.041257 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.321218 s | B=4096x256 |
| prove0 | Q_AX | 0.474939 s | Q_AX=8192x512 |
| prove0 | Q_AY | 0.324580 s | Q_AY=4096x512 |
| prove0 | U | 0.328497 s | U=4096x256 |
| prove0 | V | 0.322776 s | V=4096x256 |
| prove0 | W | 0.322378 s | W=4096x256 |
| prove1 | R | 0.332318 s | R=4096x256 |
| prove2 | Q_CX | 1.128583 s | Q_CX=16384x512 |
| prove2 | Q_CY | 0.525753 s | Q_CY=4096x512 |
| prove4 | M_X | 0.344218 s | M_X=4096x256 |
| prove4 | M_Y | 0.012130 s | M_Y=4096x256 |
| prove4 | N_X | 0.343811 s | N_X=4096x256 |
| prove4 | N_Y | 0.012104 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.470571 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012148 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.010920 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.082894 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011708 s | Pi_CY=4096x256 |
