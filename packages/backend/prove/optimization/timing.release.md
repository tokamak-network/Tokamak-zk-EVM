# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 27.908515 s |

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
| init | 3.224159 s | - | - |
| prove0 | 5.321092 s | 1.211138 s | 3.974660 s |
| prove1 | 0.985492 s | 0.394027 s | 0.561930 s |
| prove2 | 8.712831 s | 3.723988 s | 3.386996 s |
| prove3 | 1.294259 s | 0.953736 s | 0.000000 s |
| prove4 | 8.341613 s | 3.948338 s | 4.390131 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A | 0.024050 s | A=512x1 |
| build | O_inst | 0.001285 s | O_inst=512x1 |
| build | O_mid_core | 0.059659 s | O_mid_core=2560x1 |
| build | O_prv_core | 0.754773 s | O_prv_core=2560x1 |
| build | a_pub_X | 0.001097 s | a_pub_X=512x1 |
| build | bXY | 0.032199 s | bXY=2048x256 |
| build | s0_s1 | 0.272274 s | s0/s1=2048x256 |
| build | t_mi | 0.000006 s | t_mi=4096x1 |
| build | t_n | 0.000006 s | t_n=4096x1 |
| build | t_smax | 0.000003 s | t_smax=1x512 |
| build | uvwXY | 0.526108 s | uXY/vXY/wXY=2048x256 |
| load | instance | 0.000191 s | file_bytes=7412 |
| load | permutation | 0.001181 s | file_bytes=240270 |
| load | placement_variables | 0.023337 s | file_bytes=8675793 |
| load | setup_params | 0.000094 s | file_bytes=139 |
| load | sigma | 0.000054 s | file_bytes=679785200 |
| load | subcircuit_infos | 0.000332 s | file_bytes=109494 |

## Category Totals

| category | total |
| --- | --- |
| poly | 10.231226 s |
| encode | 12.313717 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.017326 s |
| combine | 1.558858 s |
| div_by_ruffini | 1.211793 s |
| div_by_vanishing_opt | 4.923625 s |
| eval | 2.017922 s |
| from_rou_evals | 0.029411 s |
| mul | 0.065665 s |
| recursion_eval | 0.329497 s |
| scale_coeffs | 0.033901 s |
| to_rou_evals | 0.043230 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.006485 s | R=2048x256 |
| add | prove4 | RXY_terms | 0.005506 s | m_i_s_max=2048x256 |
| add | prove4 | R_minus_eval | 0.003575 s | R=2048x256 |
| add | prove4 | g_minus_f | 0.001760 s | gXY=2048x256 |
| combine | prove4 | LHS_for_copy | 0.065238 s | m_i_s_max=2048x256 |
| combine | prove4 | LHS_zk1 | 0.742524 s | m_i_s_max=2048x256 |
| combine | prove4 | LHS_zk2 | 0.559769 s | m_i_s_max=2048x256 |
| combine | prove4 | Pi_A | 0.088505 s | uXY=2048x256 |
| combine | prove4 | V | 0.012955 s | vXY=2048x256 |
| combine | prove4 | fXY | 0.007809 s | bXY=2048x256 |
| combine | prove4 | gXY | 0.004889 s | bXY=2048x256 |
| combine | prove4 | pC | 0.049318 s | m_i_s_max=2048x256 |
| combine | prove4 | term5 | 0.005371 s | gXY=2048x256 |
| combine | prove4 | term6 | 0.005393 s | gXY=2048x256 |
| combine | prove4 | term9 | 0.001436 s | rB=2048x256 |
| combine | prove4 | term_B_zk | 0.015650 s | rB=2048x256 |
| div_by_ruffini | prove4 | M | 0.285584 s | R=2048x256 |
| div_by_ruffini | prove4 | N | 0.286000 s | R=2048x256 |
| div_by_ruffini | prove4 | Pi_A | 0.295211 s | pA_XY=2048x256 |
| div_by_ruffini | prove4 | Pi_B | 0.002263 s | a_pub_X=512x1 |
| div_by_ruffini | prove4 | Pi_C | 0.342736 s | LHS_for_copy=2048x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 1.211138 s | p0XY=2048x256, vanishing=2048x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 3.712487 s | p_comb=2048x256, vanishing=2048x256 |
| eval | prove3 | R | 0.312612 s | R=2048x256 |
| eval | prove3 | R_omegaX | 0.311481 s | R_omegaX=2048x256 |
| eval | prove3 | R_omegaX_omegaY | 0.309710 s | R_omegaX_omegaY=2048x256 |
| eval | prove4 | K0 | 0.000977 s | K0=2048x1 |
| eval | prove4 | R | 0.141534 s | R=2048x256 |
| eval | prove4 | R_omegaX | 0.142329 s | R_omegaX=2048x256 |
| eval | prove4 | R_omegaX_omegaY | 0.140189 s | R_omegaX_omegaY=2048x256 |
| eval | prove4 | r_D1 | 0.141395 s | R=2048x256 |
| eval | prove4 | r_D2 | 0.139918 s | R=2048x256 |
| eval | prove4 | t_n | 0.000999 s | t_n=4096x1 |
| eval | prove4 | t_smax | 0.239801 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.136976 s | vXY=2048x256 |
| from_rou_evals | prove1 | rXY | 0.021300 s | rXY_evals=524288, grid=2048x256 |
| from_rou_evals | prove2 | K | 0.001532 s | k_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | K0 | 0.001634 s | k0_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | L | 0.001048 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.001351 s | k_evals=2048, grid=2048x1 |
| from_rou_evals | prove4 | K0 | 0.001491 s | k0_evals=2048, grid=2048x1 |
| from_rou_evals | prove4 | L | 0.001054 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.062468 s | K=2048x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.000571 s | t_mi=4096x1 |
| mul | prove4 | RXY_t_smax | 0.000494 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.002132 s | gXY=2048x256 |
| recursion_eval | prove1 | rXY | 0.329497 s | fXY_evals=524288, gXY_evals=524288, grid=2048x256 |
| scale_coeffs | prove2 | r_omegaX | 0.003401 s | rXY=2048x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.003885 s | r_omegaX=2048x256 |
| scale_coeffs | prove3 | R_omegaX | 0.008400 s | R=2048x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.011532 s | R_omegaX=2048x256 |
| scale_coeffs | prove4 | r_omegaX | 0.002955 s | R=2048x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.003727 s | R_omegaX=2048x256 |
| to_rou_evals | prove1 | fXY | 0.019801 s | fXY=2048x256 |
| to_rou_evals | prove1 | gXY | 0.023429 s | gXY=2048x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.554397 s | B=2048x256 |
| prove0 | Q_AX | 1.088462 s | Q_AX=4096x512 |
| prove0 | Q_AY | 0.556880 s | Q_AY=2048x512 |
| prove0 | U | 0.664324 s | U=2048x256 |
| prove0 | V | 0.558687 s | V=2048x256 |
| prove0 | W | 0.551911 s | W=2048x256 |
| prove1 | R | 0.561930 s | R=2048x256 |
| prove2 | Q_CX | 2.298264 s | Q_CX=8192x512 |
| prove2 | Q_CY | 1.088732 s | Q_CY=2048x512 |
| prove4 | M_X | 0.564501 s | M_X=2048x256 |
| prove4 | M_Y | 0.001731 s | M_Y=2048x256 |
| prove4 | N_X | 0.555722 s | N_X=2048x256 |
| prove4 | N_Y | 0.001821 s | N_Y=2048x256 |
| prove4 | Pi_AX | 1.104054 s | Pi_AX=2048x256 |
| prove4 | Pi_AY | 0.002192 s | Pi_AY=2048x256 |
| prove4 | Pi_B | 0.002121 s | a_pub_X=512x1 |
| prove4 | Pi_CX | 2.155887 s | Pi_CX=2048x256 |
| prove4 | Pi_CY | 0.002101 s | Pi_CY=2048x256 |
