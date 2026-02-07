# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 46.743467 s |

## Setup Parameters

| param | value |
| --- | --- |
| l | 512 |
| l_user_out | 8 |
| l_user | 40 |
| l_block | 64 |
| l_D | 2560 |
| m_D | 19972 |
| n | 2048 |
| s_D | 23 |
| s_max | 256 |

## Module Times (init + prove0~prove4)

| module | total | poly | encode |
| --- | --- | --- | --- |
| init | 1.467863 s | - | - |
| prove0 | 7.079580 s | 2.994882 s | 3.933607 s |
| prove1 | 1.132110 s | 0.537669 s | 0.566097 s |
| prove2 | 23.211680 s | 13.913639 s | 3.231813 s |
| prove3 | 1.289731 s | 0.952270 s | 0.000000 s |
| prove4 | 12.560957 s | 8.203943 s | 4.353915 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A | 0.002847 s | A=512x1 |
| build | O_inst | 0.001126 s | O_inst=512x1 |
| build | O_mid_core | 0.004078 s | O_mid_core=2560x1 |
| build | O_prv_core | 0.212238 s | O_prv_core=2560x1 |
| build | a_pub_X | 0.001489 s | a_pub_X=512x1 |
| build | bXY | 0.139022 s | bXY=2048x256 |
| build | s0_s1 | 0.365062 s | s0/s1=2048x256 |
| build | t_mi | 0.000006 s | t_mi=4096x1 |
| build | t_n | 0.000005 s | t_n=4096x1 |
| build | t_smax | 0.000004 s | t_smax=1x512 |
| build | uvwXY | 0.711539 s | uXY/vXY/wXY=2048x256 |
| load | instance | 0.000046 s | file_bytes=7412 |
| load | permutation | 0.000505 s | file_bytes=240270 |
| load | placement_variables | 0.027215 s | file_bytes=8675793 |
| load | setup_params | 0.000031 s | file_bytes=139 |
| load | sigma | 0.000055 s | file_bytes=679785200 |
| load | subcircuit_infos | 0.000327 s | file_bytes=109494 |

## Category Totals

| category | total |
| --- | --- |
| poly | 26.602403 s |
| encode | 12.085432 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.017110 s |
| combine | 5.671101 s |
| div_by_ruffini | 1.165595 s |
| div_by_vanishing_opt | 16.895315 s |
| eval | 2.018448 s |
| from_rou_evals | 0.085817 s |
| mul | 0.248109 s |
| recursion_eval | 0.322333 s |
| scale_coeffs | 0.033957 s |
| to_rou_evals | 0.144617 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.006520 s | R=2048x256 |
| add | prove4 | RXY_terms | 0.005492 s | m_i_s_max=2048x256 |
| add | prove4 | R_minus_eval | 0.003619 s | R=2048x256 |
| add | prove4 | g_minus_f | 0.001479 s | gXY=2048x256 |
| combine | prove4 | LHS_for_copy | 0.065248 s | m_i_s_max=2048x256 |
| combine | prove4 | LHS_zk1 | 3.093559 s | m_i_s_max=2048x256 |
| combine | prove4 | LHS_zk2 | 2.304136 s | m_i_s_max=2048x256 |
| combine | prove4 | Pi_A | 0.095631 s | uXY=2048x256 |
| combine | prove4 | V | 0.013217 s | vXY=2048x256 |
| combine | prove4 | fXY | 0.007872 s | bXY=2048x256 |
| combine | prove4 | gXY | 0.004796 s | bXY=2048x256 |
| combine | prove4 | pC | 0.049229 s | m_i_s_max=2048x256 |
| combine | prove4 | term5 | 0.005309 s | gXY=2048x256 |
| combine | prove4 | term6 | 0.005407 s | gXY=2048x256 |
| combine | prove4 | term9 | 0.001433 s | rB=2048x256 |
| combine | prove4 | term_B_zk | 0.025263 s | rB=2048x256 |
| div_by_ruffini | prove4 | M | 0.285535 s | R=2048x256 |
| div_by_ruffini | prove4 | N | 0.282264 s | R=2048x256 |
| div_by_ruffini | prove4 | Pi_A | 0.281405 s | pA_XY=2048x256 |
| div_by_ruffini | prove4 | Pi_B | 0.002502 s | a_pub_X=512x1 |
| div_by_ruffini | prove4 | Pi_C | 0.313889 s | LHS_for_copy=2048x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.994882 s | p0XY=2048x256, vanishing=2048x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 13.900434 s | p_comb=2048x256, vanishing=2048x256 |
| eval | prove3 | R | 0.309623 s | R=2048x256 |
| eval | prove3 | R_omegaX | 0.310390 s | R_omegaX=2048x256 |
| eval | prove3 | R_omegaX_omegaY | 0.311914 s | R_omegaX_omegaY=2048x256 |
| eval | prove4 | K0 | 0.001055 s | K0=2048x1 |
| eval | prove4 | R | 0.141889 s | R=2048x256 |
| eval | prove4 | R_omegaX | 0.141745 s | R_omegaX=2048x256 |
| eval | prove4 | R_omegaX_omegaY | 0.141174 s | R_omegaX_omegaY=2048x256 |
| eval | prove4 | r_D1 | 0.141423 s | R=2048x256 |
| eval | prove4 | r_D2 | 0.142523 s | R=2048x256 |
| eval | prove4 | t_n | 0.001044 s | t_n=4096x1 |
| eval | prove4 | t_smax | 0.238182 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.137486 s | vXY=2048x256 |
| from_rou_evals | prove1 | rXY | 0.070719 s | rXY_evals=524288, grid=2048x256 |
| from_rou_evals | prove2 | K | 0.002411 s | k_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | K0 | 0.002338 s | k0_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | L | 0.001693 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.003019 s | k_evals=2048, grid=2048x1 |
| from_rou_evals | prove4 | K0 | 0.003219 s | k0_evals=2048, grid=2048x1 |
| from_rou_evals | prove4 | L | 0.002418 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.245154 s | K=2048x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.000529 s | t_mi=4096x1 |
| mul | prove4 | RXY_t_smax | 0.000457 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.001969 s | gXY=2048x256 |
| recursion_eval | prove1 | rXY | 0.322333 s | fXY_evals=524288, gXY_evals=524288, grid=2048x256 |
| scale_coeffs | prove2 | r_omegaX | 0.003001 s | rXY=2048x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.003762 s | r_omegaX=2048x256 |
| scale_coeffs | prove3 | R_omegaX | 0.008405 s | R=2048x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.011937 s | R_omegaX=2048x256 |
| scale_coeffs | prove4 | r_omegaX | 0.003049 s | R=2048x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.003802 s | R_omegaX=2048x256 |
| to_rou_evals | prove1 | fXY | 0.070040 s | fXY=2048x256 |
| to_rou_evals | prove1 | gXY | 0.074577 s | gXY=2048x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.562468 s | B=2048x256 |
| prove0 | Q_AX | 1.102406 s | Q_AX=4096x512 |
| prove0 | Q_AY | 0.567985 s | Q_AY=2048x512 |
| prove0 | U | 0.577786 s | U=2048x256 |
| prove0 | V | 0.562863 s | V=2048x256 |
| prove0 | W | 0.560098 s | W=2048x256 |
| prove1 | R | 0.566097 s | R=2048x256 |
| prove2 | Q_CX | 2.142312 s | Q_CX=8192x512 |
| prove2 | Q_CY | 1.089500 s | Q_CY=2048x512 |
| prove4 | M_X | 0.553279 s | M_X=2048x256 |
| prove4 | M_Y | 0.001675 s | M_Y=2048x256 |
| prove4 | N_X | 0.557629 s | N_X=2048x256 |
| prove4 | N_Y | 0.001801 s | N_Y=2048x256 |
| prove4 | Pi_AX | 1.108930 s | Pi_AX=2048x256 |
| prove4 | Pi_AY | 0.002180 s | Pi_AY=2048x256 |
| prove4 | Pi_B | 0.002197 s | a_pub_X=512x1 |
| prove4 | Pi_CX | 2.124042 s | Pi_CX=2048x256 |
| prove4 | Pi_CY | 0.002183 s | Pi_CY=2048x256 |
