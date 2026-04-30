# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 39.811035 s |

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
| init | 8.908786 s | - | - |
| prove0 | 6.047955 s | 2.106893 s | 2.104958 s |
| prove1 | 0.912839 s | 0.245977 s | 0.326384 s |
| prove2 | 12.686749 s | 7.231817 s | 1.659831 s |
| prove3 | 1.080194 s | 0.533803 s | 0.000000 s |
| prove4 | 10.165279 s | 7.796513 s | 2.344083 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.014229 s | A_free=128x1 |
| build | O_mid_core | 0.016508 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.233548 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010170 s | O_pub_free=128x1 |
| build | a_free_X | 0.000461 s | a_free_X=128x1 |
| build | bXY | 0.028138 s | bXY=4096x256 |
| build | s0_s1 | 1.203952 s | s0/s1=4096x256 |
| build | t_mi | 0.000039 s | t_mi=8192x1 |
| build | t_n | 0.000073 s | t_n=8192x1 |
| build | t_smax | 0.000017 s | t_smax=1x512 |
| build | uvwXY | 7.297586 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000112 s | file_bytes=10284 |
| load | permutation | 0.000976 s | file_bytes=251784 |
| load | placement_variables | 0.088292 s | file_bytes=18449792 |
| load | setup_params | 0.000014 s | file_bytes=140 |
| load | sigma | 0.000128 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000618 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 17.915002 s |
| encode | 6.435256 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.372553 s |
| combine | 5.226919 s |
| div_by_ruffini | 1.836815 s |
| div_by_vanishing_opt | 9.220424 s |
| eval | 0.238096 s |
| from_rou_evals | 0.019346 s |
| mul | 0.119050 s |
| recursion_eval | 0.149421 s |
| scale_coeffs | 0.649030 s |
| to_rou_evals | 0.083348 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.093190 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.124491 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.149048 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005824 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.791619 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.357695 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.226205 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.917631 s | uXY=4096x256 |
| combine | prove4 | V | 0.266493 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.043131 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.067244 s | bXY=4096x256 |
| combine | prove4 | pC | 0.407242 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009364 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009983 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000477 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.129834 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.432647 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.429651 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.307716 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.039758 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.627043 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.106893 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 7.113532 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045794 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034674 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034681 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000213 s | K0=4096x1 |
| eval | prove4 | R | 0.016205 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015427 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015192 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015848 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015239 s | R=4096x256 |
| eval | prove4 | t_n | 0.005475 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.024153 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015195 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.013208 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001939 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001083 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000319 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000352 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.002014 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000429 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.110986 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003815 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000246 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.004003 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.149421 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.069311 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.045632 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.222963 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.195692 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.065974 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.049458 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.042688 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.040660 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.324598 s | B=4096x256 |
| prove0 | Q_AX | 0.480750 s | Q_AX=8192x512 |
| prove0 | Q_AY | 0.328103 s | Q_AY=4096x512 |
| prove0 | U | 0.325906 s | U=4096x256 |
| prove0 | V | 0.321792 s | V=4096x256 |
| prove0 | W | 0.323810 s | W=4096x256 |
| prove1 | R | 0.326384 s | R=4096x256 |
| prove2 | Q_CX | 1.124010 s | Q_CX=16384x512 |
| prove2 | Q_CY | 0.535821 s | Q_CY=4096x512 |
| prove4 | M_X | 0.349440 s | M_X=4096x256 |
| prove4 | M_Y | 0.011915 s | M_Y=4096x256 |
| prove4 | N_X | 0.348310 s | N_X=4096x256 |
| prove4 | N_Y | 0.012792 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.478032 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012133 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.010842 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.109025 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011593 s | Pi_CY=4096x256 |
