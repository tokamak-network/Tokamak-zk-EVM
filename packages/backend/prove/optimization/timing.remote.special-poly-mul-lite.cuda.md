# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 31.318987 s |

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
| init | 0.732530 s | - | - |
| prove0 | 6.007024 s | 2.105749 s | 2.080291 s |
| prove1 | 0.899186 s | 0.240921 s | 0.325656 s |
| prove2 | 12.700641 s | 7.241290 s | 1.668423 s |
| prove3 | 1.068861 s | 0.528518 s | 0.000000 s |
| prove4 | 9.901451 s | 7.532867 s | 2.343866 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.014232 s | A_free=128x1 |
| build | O_mid_core | 0.016441 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.223561 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010176 s | O_pub_free=128x1 |
| build | a_free_X | 0.000311 s | a_free_X=128x1 |
| build | bXY | 0.026897 s | bXY=4096x256 |
| build | s0_s1 | 0.054247 s | s0/s1=4096x256 |
| build | t_mi | 0.000038 s | t_mi=8192x1 |
| build | t_n | 0.000065 s | t_n=8192x1 |
| build | t_smax | 0.000016 s | t_smax=1x512 |
| build | uvwXY | 0.283615 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000094 s | file_bytes=10284 |
| load | permutation | 0.000880 s | file_bytes=251784 |
| load | placement_variables | 0.087454 s | file_bytes=18449792 |
| load | setup_params | 0.000021 s | file_bytes=140 |
| load | sigma | 0.000120 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000620 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 17.649345 s |
| encode | 6.418236 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.372500 s |
| combine | 4.908526 s |
| div_by_ruffini | 1.897255 s |
| div_by_vanishing_opt | 9.229230 s |
| eval | 0.237243 s |
| from_rou_evals | 0.019123 s |
| mul | 0.118492 s |
| recursion_eval | 0.145030 s |
| scale_coeffs | 0.639139 s |
| to_rou_evals | 0.082808 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.092869 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.125225 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.148579 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005827 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.587478 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.249776 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.233239 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.906991 s | uXY=4096x256 |
| combine | prove4 | V | 0.264461 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.042340 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.064624 s | bXY=4096x256 |
| combine | prove4 | pC | 0.410311 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009282 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009992 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000479 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.129554 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.459664 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.448822 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.329886 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.044311 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.614571 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.105749 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 7.123481 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045851 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034530 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.035014 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000216 s | K0=4096x1 |
| eval | prove4 | R | 0.015214 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015154 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015179 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.016009 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015387 s | R=4096x256 |
| eval | prove4 | t_n | 0.005474 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.024114 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015101 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.013083 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001921 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001076 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000303 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000332 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001971 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000435 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.110308 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003900 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000283 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.004001 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.145030 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.068998 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.045510 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.219029 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.194094 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.064651 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.046856 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.041963 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.040845 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.319125 s | B=4096x256 |
| prove0 | Q_AX | 0.470425 s | Q_AX=8192x512 |
| prove0 | Q_AY | 0.323209 s | Q_AY=4096x512 |
| prove0 | U | 0.326001 s | U=4096x256 |
| prove0 | V | 0.321223 s | V=4096x256 |
| prove0 | W | 0.320308 s | W=4096x256 |
| prove1 | R | 0.325656 s | R=4096x256 |
| prove2 | Q_CX | 1.134472 s | Q_CX=16384x512 |
| prove2 | Q_CY | 0.533950 s | Q_CY=4096x512 |
| prove4 | M_X | 0.349022 s | M_X=4096x256 |
| prove4 | M_Y | 0.012059 s | M_Y=4096x256 |
| prove4 | N_X | 0.347060 s | N_X=4096x256 |
| prove4 | N_Y | 0.012865 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.477026 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012042 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.010862 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.111390 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011541 s | Pi_CY=4096x256 |
