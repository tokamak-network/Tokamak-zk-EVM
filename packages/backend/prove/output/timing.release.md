# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 66.383591 s |

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
| init | 14.298070 s | - | - |
| prove0 | 8.541777 s | 4.473813 s | 3.922704 s |
| prove1 | 1.108317 s | 0.548702 s | 0.531545 s |
| prove2 | 28.289676 s | 18.165061 s | 3.434794 s |
| prove3 | 1.267295 s | 0.935794 s | 0.000000 s |
| prove4 | 12.876870 s | 0.879714 s | 4.364853 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A | 0.002956 s | A=512x1 |
| build | O_inst | 0.001446 s | O_inst=512x1 |
| build | O_mid_core | 0.003082 s | O_mid_core=2560x1 |
| build | O_prv_core | 0.194547 s | O_prv_core=2560x1 |
| build | a_pub_X | 0.001460 s | a_pub_X=512x1 |
| build | bXY | 0.143953 s | bXY=2048x256 |
| build | s0_s1 | 0.401171 s | s0/s1=2048x256 |
| build | t_mi | 0.000027 s | t_mi=4096x1 |
| build | t_n | 0.000021 s | t_n=4096x1 |
| build | t_smax | 0.000005 s | t_smax=1x512 |
| build | uvwXY | 6.540414 s | uXY/vXY/wXY=2048x256 |
| load | instance | 0.000054 s | file_bytes=7412 |
| load | permutation | 0.000543 s | file_bytes=240270 |
| load | placement_variables | 0.022429 s | file_bytes=8675793 |
| load | setup_params | 0.000090 s | file_bytes=139 |
| load | sigma | 6.961561 s | file_bytes=1501003868 |
| load | subcircuit_infos | 0.000303 s | file_bytes=109494 |

## Category Totals

| category | total |
| --- | --- |
| poly | 25.003083 s |
| encode | 12.253896 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| div_by_ruffini | 0.879714 s |
| div_by_vanishing | 22.625735 s |
| eval | 0.915330 s |
| from_rou_evals | 0.077000 s |
| recursion_eval | 0.334764 s |
| scale_coeffs | 0.027242 s |
| to_rou_evals | 0.143298 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| div_by_ruffini | prove4 | M | 0.277484 s | R=2048x256 |
| div_by_ruffini | prove4 | N | 0.281857 s | R=2048x256 |
| div_by_ruffini | prove4 | Pi_C | 0.320373 s | LHS_for_copy=2048x256 |
| div_by_vanishing | prove0 | q0q1 | 4.473813 s | p0XY=2048x256, vanishing=2048x256 |
| div_by_vanishing | prove2 | q2q7 | 18.151922 s | p1/p2/p3=2048x256, vanishing=2048x256 |
| eval | prove3 | R | 0.302542 s | R=2048x256 |
| eval | prove3 | R_omegaX | 0.302775 s | R_omegaX=2048x256 |
| eval | prove3 | R_omegaX_omegaY | 0.310013 s | R_omegaX_omegaY=2048x256 |
| from_rou_evals | prove1 | rXY | 0.070639 s | rXY_evals=524288, grid=2048x256 |
| from_rou_evals | prove2 | K | 0.002306 s | k_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | K0 | 0.002289 s | k0_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | L | 0.001767 s | l_evals=256, grid=1x256 |
| recursion_eval | prove1 | rXY | 0.334764 s | fXY_evals=524288, gXY_evals=524288, grid=2048x256 |
| scale_coeffs | prove2 | r_omegaX | 0.003032 s | rXY=2048x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.003745 s | r_omegaX=2048x256 |
| scale_coeffs | prove3 | R_omegaX | 0.008552 s | R=2048x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.011912 s | R_omegaX=2048x256 |
| to_rou_evals | prove1 | fXY | 0.070508 s | fXY=2048x256 |
| to_rou_evals | prove1 | gXY | 0.072791 s | gXY=2048x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.550094 s | B=2048x256 |
| prove0 | Q_AX | 1.160059 s | Q_AX=4096x512 |
| prove0 | Q_AY | 0.533344 s | Q_AY=2048x512 |
| prove0 | U | 0.556592 s | U=2048x256 |
| prove0 | V | 0.574873 s | V=2048x256 |
| prove0 | W | 0.547743 s | W=2048x256 |
| prove1 | R | 0.531545 s | R=2048x256 |
| prove2 | Q_CX | 2.386660 s | Q_CX=4096x512 |
| prove2 | Q_CY | 1.048134 s | Q_CY=2048x512 |
| prove4 | M_X | 0.579999 s | M_X=2048x256 |
| prove4 | M_Y | 0.001794 s | M_Y=2048x256 |
| prove4 | N_X | 0.593064 s | N_X=2048x256 |
| prove4 | N_Y | 0.001657 s | N_Y=2048x256 |
| prove4 | Pi_AX | 1.105300 s | Pi_AX=2048x256 |
| prove4 | Pi_AY | 0.002126 s | Pi_AY=2048x256 |
| prove4 | Pi_B | 0.002111 s | a_pub_X=512x1 |
| prove4 | Pi_CX | 2.076499 s | Pi_CX=2048x256 |
| prove4 | Pi_CY | 0.002303 s | Pi_CY=2048x256 |
