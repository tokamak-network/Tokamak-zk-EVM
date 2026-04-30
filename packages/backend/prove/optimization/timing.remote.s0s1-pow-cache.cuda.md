# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 31.712050 s |

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
| init | 0.748165 s | - | - |
| prove0 | 6.109721 s | 2.149125 s | 2.100660 s |
| prove1 | 0.901154 s | 0.242700 s | 0.324546 s |
| prove2 | 12.713798 s | 7.232120 s | 1.668537 s |
| prove3 | 1.077485 s | 0.528901 s | 0.000000 s |
| prove4 | 10.152243 s | 7.805363 s | 2.322183 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013915 s | A_free=128x1 |
| build | O_mid_core | 0.016674 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.230877 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010173 s | O_pub_free=128x1 |
| build | a_free_X | 0.000320 s | a_free_X=128x1 |
| build | bXY | 0.027500 s | bXY=4096x256 |
| build | s0_s1 | 0.057586 s | s0/s1=4096x256 |
| build | t_mi | 0.000045 s | t_mi=8192x1 |
| build | t_n | 0.000080 s | t_n=8192x1 |
| build | t_smax | 0.000016 s | t_smax=1x512 |
| build | uvwXY | 0.286227 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000098 s | file_bytes=10284 |
| load | permutation | 0.000876 s | file_bytes=251784 |
| load | placement_variables | 0.089147 s | file_bytes=18449792 |
| load | setup_params | 0.000023 s | file_bytes=140 |
| load | sigma | 0.000127 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000631 s | file_bytes=146449 |

## s0_s1 Power Cache Result

This run precomputes `omega_m_i^row` and `omega_s_max^col` once, then reuses
those tables while filling the `s0` and `s1` evaluation grids. The change is in
the common `Permutation::to_poly` path and is not GPU-specific.

| comparison | previous r1cs binary sparse CUDA | s0_s1 power cache CUDA | delta |
| --- | ---: | ---: | ---: |
| total_wall | 32.728362953 s | 31.712050142 s | -1.016312811 s |
| init | 1.889288516 s | 0.748164523 s | -1.141123993 s |
| init.build.instance.s0_s1 | 1.206917014 s | 0.057585677 s | -1.149331337 s |

## Category Totals

| category | total |
| --- | --- |
| poly | 17.958210 s |
| encode | 6.415927 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.368112 s |
| combine | 5.170600 s |
| div_by_ruffini | 1.909696 s |
| div_by_vanishing_opt | 9.262347 s |
| eval | 0.238560 s |
| from_rou_evals | 0.019326 s |
| mul | 0.120568 s |
| recursion_eval | 0.145364 s |
| scale_coeffs | 0.639487 s |
| to_rou_evals | 0.084151 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.091318 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.123610 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.147363 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005821 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.783756 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.335036 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.214135 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.913962 s | uXY=4096x256 |
| combine | prove4 | V | 0.265933 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.041906 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.066149 s | bXY=4096x256 |
| combine | prove4 | pC | 0.403060 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009280 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.010236 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000479 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.126669 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.451505 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.448054 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.324403 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.039854 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.645880 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.149125 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 7.113222 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.046111 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034648 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034736 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000220 s | K0=4096x1 |
| eval | prove4 | R | 0.015607 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015533 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015574 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015844 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015251 s | R=4096x256 |
| eval | prove4 | t_n | 0.005473 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.024305 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015257 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.013185 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001930 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001079 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000302 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000362 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.002037 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000432 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.112412 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003928 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000261 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.003967 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.145364 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.069505 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.046083 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.220483 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.192923 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.064233 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.046259 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.042460 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.041691 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.322674 s | B=4096x256 |
| prove0 | Q_AX | 0.474396 s | Q_AX=8192x512 |
| prove0 | Q_AY | 0.325152 s | Q_AY=4096x512 |
| prove0 | U | 0.329394 s | U=4096x256 |
| prove0 | V | 0.322732 s | V=4096x256 |
| prove0 | W | 0.326313 s | W=4096x256 |
| prove1 | R | 0.324546 s | R=4096x256 |
| prove2 | Q_CX | 1.134033 s | Q_CX=16384x512 |
| prove2 | Q_CY | 0.534505 s | Q_CY=4096x512 |
| prove4 | M_X | 0.343526 s | M_X=4096x256 |
| prove4 | M_Y | 0.012974 s | M_Y=4096x256 |
| prove4 | N_X | 0.348772 s | N_X=4096x256 |
| prove4 | N_Y | 0.012437 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.473839 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012248 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.010920 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.095897 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011570 s | Pi_CY=4096x256 |
