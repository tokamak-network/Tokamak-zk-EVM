# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 57.162002 s |

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
| init | 5.425999 s | - | - |
| prove0 | 12.109660 s | 2.901308 s | 8.950155 s |
| prove1 | 2.107772 s | 0.868004 s | 1.179340 s |
| prove2 | 19.893836 s | 8.742700 s | 7.173117 s |
| prove3 | 1.670954 s | 1.243884 s | 0.000000 s |
| prove4 | 15.942229 s | 6.850647 s | 9.086162 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.008552 s | A_free=128x1 |
| build | O_mid_core | 0.114213 s | O_mid_core=4824x1 |
| build | O_prv_core | 1.033474 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.001278 s | O_pub_free=128x1 |
| build | a_free_X | 0.001096 s | a_free_X=128x1 |
| build | bXY | 0.091647 s | bXY=4096x256 |
| build | s0_s1 | 0.115509 s | s0/s1=4096x256 |
| build | t_mi | 0.000008 s | t_mi=8192x1 |
| build | t_n | 0.000010 s | t_n=8192x1 |
| build | t_smax | 0.000016 s | t_smax=1x512 |
| build | uvwXY | 0.240349 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000245 s | file_bytes=10284 |
| load | permutation | 0.002102 s | file_bytes=251784 |
| load | placement_variables | 0.057890 s | file_bytes=18449792 |
| load | setup_params | 0.000467 s | file_bytes=140 |
| load | sigma | 0.002101 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.001862 s | file_bytes=146449 |

## s0_s1 Power Cache CPU Result

This run confirms the same power-cache change on the local CPU path.

| comparison | previous r1cs binary sparse CPU | s0_s1 power cache CPU | delta |
| --- | ---: | ---: | ---: |
| total_wall | 56.905538167 s | 57.162002083 s | +0.256463916 s |
| init | 6.011812041 s | 5.425999375 s | -0.585812666 s |
| init.build.instance.s0_s1 | 0.629766500 s | 0.115508875 s | -0.514257625 s |

The total CPU wall time is slightly higher in this single run despite the init
improvement, because later prove stages varied upward. The targeted `s0_s1`
stage improved on both CPU and CUDA.

## Category Totals

| category | total |
| --- | --- |
| poly | 20.606543 s |
| encode | 26.388774 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.036733 s |
| combine | 4.045277 s |
| div_by_ruffini | 1.350936 s |
| div_by_vanishing_opt | 11.624237 s |
| eval | 2.321193 s |
| from_rou_evals | 0.059272 s |
| mul | 0.176913 s |
| recursion_eval | 0.710033 s |
| scale_coeffs | 0.173516 s |
| to_rou_evals | 0.108431 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.012690 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.011030 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.007952 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005062 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.174297 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 2.007891 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.449055 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.172000 s | uXY=4096x256 |
| combine | prove4 | V | 0.029100 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.019779 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.009097 s | bXY=4096x256 |
| combine | prove4 | pC | 0.129974 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009678 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009534 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.001435 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.033438 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.308890 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.327292 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.308426 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.002023 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.404305 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.901308 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 8.722929 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.373459 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.376676 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.369314 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.001092 s | K0=4096x1 |
| eval | prove4 | R | 0.156414 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.173135 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.152222 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.165656 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.157031 s | R=4096x256 |
| eval | prove4 | t_n | 0.001164 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.243237 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.151792 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.049539 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001832 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.002046 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.001075 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.001808 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.002011 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000961 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.170510 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.000795 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000673 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.004937 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.710033 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.007534 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.007284 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.017431 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.107004 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.005505 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.028758 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.046993 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.061438 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 1.237558 s | B=4096x256 |
| prove0 | Q_AX | 2.335072 s | Q_AX=8192x512 |
| prove0 | Q_AY | 1.194304 s | Q_AY=4096x512 |
| prove0 | U | 1.722079 s | U=4096x256 |
| prove0 | V | 1.222274 s | V=4096x256 |
| prove0 | W | 1.238870 s | W=4096x256 |
| prove1 | R | 1.179340 s | R=4096x256 |
| prove2 | Q_CX | 4.774527 s | Q_CX=16384x512 |
| prove2 | Q_CY | 2.398591 s | Q_CY=4096x512 |
| prove4 | M_X | 1.194999 s | M_X=4096x256 |
| prove4 | M_Y | 0.002211 s | M_Y=4096x256 |
| prove4 | N_X | 1.172955 s | N_X=4096x256 |
| prove4 | N_Y | 0.002024 s | N_Y=4096x256 |
| prove4 | Pi_AX | 2.325722 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.002256 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.001762 s | a_free_X=128x1 |
| prove4 | Pi_CX | 4.381464 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.002770 s | Pi_CY=4096x256 |
