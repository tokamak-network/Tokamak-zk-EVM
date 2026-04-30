# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 31.387785 s |

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
| init | 0.743366 s | - | - |
| prove0 | 5.876162 s | 2.150968 s | 1.883973 s |
| prove1 | 0.898986 s | 0.232176 s | 0.320831 s |
| prove2 | 12.692670 s | 7.181532 s | 1.662291 s |
| prove3 | 1.071060 s | 0.529180 s | 0.000000 s |
| prove4 | 10.096364 s | 7.758276 s | 2.313270 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.014107 s | A_free=128x1 |
| build | O_mid_core | 0.016457 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.224364 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010175 s | O_pub_free=128x1 |
| build | a_free_X | 0.000317 s | a_free_X=128x1 |
| build | bXY | 0.027663 s | bXY=4096x256 |
| build | s0_s1 | 0.055855 s | s0/s1=4096x256 |
| build | t_mi | 0.000044 s | t_mi=8192x1 |
| build | t_n | 0.000075 s | t_n=8192x1 |
| build | t_smax | 0.000015 s | t_smax=1x512 |
| build | uvwXY | 0.289947 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000095 s | file_bytes=10284 |
| load | permutation | 0.000872 s | file_bytes=251784 |
| load | placement_variables | 0.088804 s | file_bytes=18449792 |
| load | setup_params | 0.000028 s | file_bytes=140 |
| load | sigma | 0.000122 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000619 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 17.852131 s |
| encode | 6.180366 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.372861 s |
| combine | 5.218662 s |
| div_by_ruffini | 1.813645 s |
| div_by_vanishing_opt | 9.212606 s |
| eval | 0.238409 s |
| from_rou_evals | 0.017087 s |
| mul | 0.115300 s |
| recursion_eval | 0.141472 s |
| scale_coeffs | 0.641611 s |
| to_rou_evals | 0.080477 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.091916 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.125384 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.148932 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.006629 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.797204 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.355372 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.220652 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.921923 s | uXY=4096x256 |
| combine | prove4 | V | 0.261370 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.041167 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.065832 s | bXY=4096x256 |
| combine | prove4 | pC | 0.401417 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.010259 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.012801 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000438 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.130227 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.437965 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.423100 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.310030 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.038355 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.604196 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.150968 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 7.061638 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045710 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.035043 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034744 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000212 s | K0=4096x1 |
| eval | prove4 | R | 0.015364 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015172 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015181 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015780 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015202 s | R=4096x256 |
| eval | prove4 | t_n | 0.006366 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.024371 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015264 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.010226 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.002815 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001077 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000316 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000316 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001967 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000369 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.107585 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003882 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000284 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.003548 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.141472 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.069690 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.045995 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.219908 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.193775 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.064308 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.047935 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.041186 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.039291 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | batch | 1.883973 s | U/V/W/Q_AX/Q_AY/B=6x4096x256 |
| prove1 | R | 0.320831 s | R=4096x256 |
| prove2 | Q_C_batch | 1.662291 s | Q_CX/Q_CY=2x4096x256 |
| prove4 | M_X | 0.346959 s | M_X=4096x256 |
| prove4 | M_Y | 0.012899 s | M_Y=4096x256 |
| prove4 | N_X | 0.339932 s | N_X=4096x256 |
| prove4 | N_Y | 0.012875 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.470705 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012299 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.011218 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.094809 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011574 s | Pi_CY=4096x256 |
