# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 49.781555 s |

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
| init | 1.449825 s | - | - |
| prove0 | 8.400324 s | 4.337859 s | 3.915416 s |
| prove1 | 1.150477 s | 0.546965 s | 0.574411 s |
| prove2 | 24.982380 s | 15.757887 s | 3.191160 s |
| prove3 | 1.290786 s | 0.951980 s | 0.000000 s |
| prove4 | 12.506039 s | 8.148701 s | 4.354300 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A | 0.002901 s | A=512x1 |
| build | O_inst | 0.001064 s | O_inst=512x1 |
| build | O_mid_core | 0.004077 s | O_mid_core=2560x1 |
| build | O_prv_core | 0.213973 s | O_prv_core=2560x1 |
| build | a_pub_X | 0.001304 s | a_pub_X=512x1 |
| build | bXY | 0.145109 s | bXY=2048x256 |
| build | s0_s1 | 0.375229 s | s0/s1=2048x256 |
| build | t_mi | 0.000005 s | t_mi=4096x1 |
| build | t_n | 0.000005 s | t_n=4096x1 |
| build | t_smax | 0.000016 s | t_smax=1x512 |
| build | uvwXY | 0.677228 s | uXY/vXY/wXY=2048x256 |
| load | instance | 0.000053 s | file_bytes=7412 |
| load | permutation | 0.000553 s | file_bytes=240270 |
| load | placement_variables | 0.025358 s | file_bytes=8675793 |
| load | setup_params | 0.000080 s | file_bytes=139 |
| load | sigma | 0.000061 s | file_bytes=679785200 |
| load | subcircuit_infos | 0.000358 s | file_bytes=109494 |

## Category Totals

| category | total |
| --- | --- |
| poly | 29.743391 s |
| encode | 12.035287 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.017107 s |
| combine | 5.606685 s |
| div_by_ruffini | 1.168968 s |
| div_by_vanishing | 20.081801 s |
| eval | 2.012979 s |
| from_rou_evals | 0.087296 s |
| mul | 0.258506 s |
| recursion_eval | 0.330163 s |
| scale_coeffs | 0.034566 s |
| to_rou_evals | 0.145320 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.006570 s | R=2048x256 |
| add | prove4 | RXY_terms | 0.005375 s | m_i_s_max=2048x256 |
| add | prove4 | R_minus_eval | 0.003766 s | R=2048x256 |
| add | prove4 | g_minus_f | 0.001397 s | gXY=2048x256 |
| combine | prove4 | LHS_for_copy | 0.068092 s | m_i_s_max=2048x256 |
| combine | prove4 | LHS_zk1 | 3.044766 s | m_i_s_max=2048x256 |
| combine | prove4 | LHS_zk2 | 2.288874 s | m_i_s_max=2048x256 |
| combine | prove4 | Pi_A | 0.096573 s | uXY=2048x256 |
| combine | prove4 | V | 0.013339 s | vXY=2048x256 |
| combine | prove4 | fXY | 0.007762 s | bXY=2048x256 |
| combine | prove4 | gXY | 0.004895 s | bXY=2048x256 |
| combine | prove4 | pC | 0.044390 s | m_i_s_max=2048x256 |
| combine | prove4 | term5 | 0.005359 s | gXY=2048x256 |
| combine | prove4 | term6 | 0.005682 s | gXY=2048x256 |
| combine | prove4 | term9 | 0.001400 s | rB=2048x256 |
| combine | prove4 | term_B_zk | 0.025552 s | rB=2048x256 |
| div_by_ruffini | prove4 | M | 0.286231 s | R=2048x256 |
| div_by_ruffini | prove4 | N | 0.286581 s | R=2048x256 |
| div_by_ruffini | prove4 | Pi_A | 0.280045 s | pA_XY=2048x256 |
| div_by_ruffini | prove4 | Pi_B | 0.002163 s | a_pub_X=512x1 |
| div_by_ruffini | prove4 | Pi_C | 0.313947 s | LHS_for_copy=2048x256 |
| div_by_vanishing | prove0 | q0q1 | 4.337859 s | p0XY=2048x256, vanishing=2048x256 |
| div_by_vanishing | prove2 | qCXqCY | 15.743942 s | p_comb=2048x256, vanishing=2048x256 |
| eval | prove3 | R | 0.308852 s | R=2048x256 |
| eval | prove3 | R_omegaX | 0.310677 s | R_omegaX=2048x256 |
| eval | prove3 | R_omegaX_omegaY | 0.311777 s | R_omegaX_omegaY=2048x256 |
| eval | prove4 | K0 | 0.001003 s | K0=2048x1 |
| eval | prove4 | R | 0.141197 s | R=2048x256 |
| eval | prove4 | R_omegaX | 0.140632 s | R_omegaX=2048x256 |
| eval | prove4 | R_omegaX_omegaY | 0.139454 s | R_omegaX_omegaY=2048x256 |
| eval | prove4 | r_D1 | 0.141116 s | R=2048x256 |
| eval | prove4 | r_D2 | 0.140976 s | R=2048x256 |
| eval | prove4 | t_n | 0.001115 s | t_n=4096x1 |
| eval | prove4 | t_smax | 0.239526 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.136654 s | vXY=2048x256 |
| from_rou_evals | prove1 | rXY | 0.071482 s | rXY_evals=524288, grid=2048x256 |
| from_rou_evals | prove2 | K | 0.002675 s | k_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | K0 | 0.002354 s | k0_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | L | 0.001908 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.003080 s | k_evals=2048, grid=2048x1 |
| from_rou_evals | prove4 | K0 | 0.003264 s | k0_evals=2048, grid=2048x1 |
| from_rou_evals | prove4 | L | 0.002533 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.255358 s | K=2048x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.000588 s | t_mi=4096x1 |
| mul | prove4 | RXY_t_smax | 0.000539 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.002022 s | gXY=2048x256 |
| recursion_eval | prove1 | rXY | 0.330163 s | fXY_evals=524288, gXY_evals=524288, grid=2048x256 |
| scale_coeffs | prove2 | r_omegaX | 0.003211 s | rXY=2048x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.003796 s | r_omegaX=2048x256 |
| scale_coeffs | prove3 | R_omegaX | 0.008633 s | R=2048x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.012042 s | R_omegaX=2048x256 |
| scale_coeffs | prove4 | r_omegaX | 0.003120 s | R=2048x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.003764 s | R_omegaX=2048x256 |
| to_rou_evals | prove1 | fXY | 0.070448 s | fXY=2048x256 |
| to_rou_evals | prove1 | gXY | 0.074872 s | gXY=2048x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.555889 s | B=2048x256 |
| prove0 | Q_AX | 1.123235 s | Q_AX=4096x512 |
| prove0 | Q_AY | 0.557664 s | Q_AY=2048x512 |
| prove0 | U | 0.571373 s | U=2048x256 |
| prove0 | V | 0.552457 s | V=2048x256 |
| prove0 | W | 0.554799 s | W=2048x256 |
| prove1 | R | 0.574411 s | R=2048x256 |
| prove2 | Q_CX | 2.122333 s | Q_CX=8192x512 |
| prove2 | Q_CY | 1.068827 s | Q_CY=2048x512 |
| prove4 | M_X | 0.565892 s | M_X=2048x256 |
| prove4 | M_Y | 0.001743 s | M_Y=2048x256 |
| prove4 | N_X | 0.553772 s | N_X=2048x256 |
| prove4 | N_Y | 0.001722 s | N_Y=2048x256 |
| prove4 | Pi_AX | 1.097914 s | Pi_AX=2048x256 |
| prove4 | Pi_AY | 0.002193 s | Pi_AY=2048x256 |
| prove4 | Pi_B | 0.002510 s | a_pub_X=512x1 |
| prove4 | Pi_CX | 2.126453 s | Pi_CX=2048x256 |
| prove4 | Pi_CY | 0.002101 s | Pi_CY=2048x256 |
