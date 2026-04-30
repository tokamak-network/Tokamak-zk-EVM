# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 39.084502 s |

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
| init | 8.656456 s | - | - |
| prove0 | 6.041788 s | 2.126606 s | 2.089404 s |
| prove1 | 0.896529 s | 0.241480 s | 0.322205 s |
| prove2 | 12.561875 s | 7.148574 s | 1.649072 s |
| prove3 | 1.053491 s | 0.522927 s | 0.000000 s |
| prove4 | 9.865193 s | 7.557109 s | 2.283477 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013852 s | A_free=128x1 |
| build | O_mid_core | 0.016473 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.225074 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010165 s | O_pub_free=128x1 |
| build | a_free_X | 0.000456 s | a_free_X=128x1 |
| build | bXY | 0.027962 s | bXY=4096x256 |
| build | s0_s1 | 1.210257 s | s0/s1=4096x256 |
| build | t_mi | 0.000060 s | t_mi=8192x1 |
| build | t_n | 0.000095 s | t_n=8192x1 |
| build | t_smax | 0.000017 s | t_smax=1x512 |
| build | uvwXY | 7.046536 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000115 s | file_bytes=10284 |
| load | permutation | 0.000896 s | file_bytes=251784 |
| load | placement_variables | 0.089550 s | file_bytes=18449792 |
| load | setup_params | 0.000015 s | file_bytes=140 |
| load | sigma | 0.000126 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000611 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 17.596696 s |
| encode | 6.344158 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.356215 s |
| combine | 5.062847 s |
| div_by_ruffini | 1.791921 s |
| div_by_vanishing_opt | 9.156103 s |
| eval | 0.236133 s |
| from_rou_evals | 0.019047 s |
| mul | 0.114230 s |
| recursion_eval | 0.145407 s |
| scale_coeffs | 0.631775 s |
| to_rou_evals | 0.083020 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.088550 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.118868 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.142975 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005822 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.762683 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.324126 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.184622 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.894104 s | uXY=4096x256 |
| combine | prove4 | V | 0.258278 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.040593 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.062565 s | bXY=4096x256 |
| combine | prove4 | pC | 0.391753 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009236 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009979 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000467 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.124440 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.419159 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.416887 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.305365 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.039748 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.610762 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.126606 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 7.029497 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045546 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034690 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034379 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000216 s | K0=4096x1 |
| eval | prove4 | R | 0.015326 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015177 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015159 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015823 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015229 s | R=4096x256 |
| eval | prove4 | t_n | 0.005480 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.023965 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015141 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.013054 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001926 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001072 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000320 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000377 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001975 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000323 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.106195 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003804 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000233 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.003998 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.145407 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.069831 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.045929 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.215617 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.192695 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.062753 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.044951 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.042376 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.040643 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.322513 s | B=4096x256 |
| prove0 | Q_AX | 0.469057 s | Q_AX=8192x512 |
| prove0 | Q_AY | 0.328395 s | Q_AY=4096x512 |
| prove0 | U | 0.328591 s | U=4096x256 |
| prove0 | V | 0.320143 s | V=4096x256 |
| prove0 | W | 0.320705 s | W=4096x256 |
| prove1 | R | 0.322205 s | R=4096x256 |
| prove2 | Q_CX | 1.121987 s | Q_CX=16384x512 |
| prove2 | Q_CY | 0.527085 s | Q_CY=4096x512 |
| prove4 | M_X | 0.338301 s | M_X=4096x256 |
| prove4 | M_Y | 0.013382 s | M_Y=4096x256 |
| prove4 | N_X | 0.339779 s | N_X=4096x256 |
| prove4 | N_Y | 0.012015 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.465365 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012092 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.010849 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.080235 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011460 s | Pi_CY=4096x256 |
