# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 59.835278 s |

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
| init | 7.254481 s | - | - |
| prove0 | 8.587046 s | 4.407929 s | 4.029055 s |
| prove1 | 1.165946 s | 0.570980 s | 0.566020 s |
| prove2 | 28.300791 s | 18.819636 s | 3.229385 s |
| prove3 | 1.296270 s | 0.949404 s | 0.000000 s |
| prove4 | 13.229068 s | 0.873397 s | 4.564054 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A | 0.003147 s | A=512x1 |
| build | O_inst | 0.001602 s | O_inst=512x1 |
| build | O_mid_core | 0.004081 s | O_mid_core=2560x1 |
| build | O_prv_core | 0.213382 s | O_prv_core=2560x1 |
| build | a_pub_X | 0.001491 s | a_pub_X=512x1 |
| build | bXY | 0.141280 s | bXY=2048x256 |
| build | s0_s1 | 0.386338 s | s0/s1=2048x256 |
| build | t_mi | 0.000011 s | t_mi=4096x1 |
| build | t_n | 0.000016 s | t_n=4096x1 |
| build | t_smax | 0.000004 s | t_smax=1x512 |
| build | uvwXY | 6.474084 s | uXY/vXY/wXY=2048x256 |
| load | instance | 0.000074 s | file_bytes=7412 |
| load | permutation | 0.000566 s | file_bytes=240270 |
| load | placement_variables | 0.025411 s | file_bytes=8675793 |
| load | setup_params | 0.000067 s | file_bytes=139 |
| load | sigma | 0.000068 s | file_bytes=679785200 |
| load | subcircuit_infos | 0.000367 s | file_bytes=109494 |

## Category Totals

| category | total |
| --- | --- |
| poly | 25.621346 s |
| encode | 12.388513 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| div_by_ruffini | 0.873397 s |
| div_by_vanishing | 23.213634 s |
| eval | 0.928553 s |
| from_rou_evals | 0.083540 s |
| recursion_eval | 0.339467 s |
| scale_coeffs | 0.027907 s |
| to_rou_evals | 0.154847 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| div_by_ruffini | prove4 | M | 0.281904 s | R=2048x256 |
| div_by_ruffini | prove4 | N | 0.281887 s | R=2048x256 |
| div_by_ruffini | prove4 | Pi_C | 0.309606 s | LHS_for_copy=2048x256 |
| div_by_vanishing | prove0 | q0q1 | 4.407929 s | p0XY=2048x256, vanishing=2048x256 |
| div_by_vanishing | prove2 | q2q7 | 18.805705 s | p1/p2/p3=2048x256, vanishing=2048x256 |
| eval | prove3 | R | 0.308058 s | R=2048x256 |
| eval | prove3 | R_omegaX | 0.309555 s | R_omegaX=2048x256 |
| eval | prove3 | R_omegaX_omegaY | 0.310940 s | R_omegaX_omegaY=2048x256 |
| from_rou_evals | prove1 | rXY | 0.076666 s | rXY_evals=524288, grid=2048x256 |
| from_rou_evals | prove2 | K | 0.002599 s | k_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | K0 | 0.002410 s | k0_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | L | 0.001865 s | l_evals=256, grid=1x256 |
| recursion_eval | prove1 | rXY | 0.339467 s | fXY_evals=524288, gXY_evals=524288, grid=2048x256 |
| scale_coeffs | prove2 | r_omegaX | 0.003308 s | rXY=2048x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.003749 s | r_omegaX=2048x256 |
| scale_coeffs | prove3 | R_omegaX | 0.008609 s | R=2048x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.012241 s | R_omegaX=2048x256 |
| to_rou_evals | prove1 | fXY | 0.073871 s | fXY=2048x256 |
| to_rou_evals | prove1 | gXY | 0.080976 s | gXY=2048x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.559988 s | B=2048x256 |
| prove0 | Q_AX | 1.138195 s | Q_AX=4096x512 |
| prove0 | Q_AY | 0.567842 s | Q_AY=2048x512 |
| prove0 | U | 0.578684 s | U=2048x256 |
| prove0 | V | 0.570623 s | V=2048x256 |
| prove0 | W | 0.613723 s | W=2048x256 |
| prove1 | R | 0.566020 s | R=2048x256 |
| prove2 | Q_CX | 2.145446 s | Q_CX=4096x512 |
| prove2 | Q_CY | 1.083939 s | Q_CY=2048x512 |
| prove4 | M_X | 0.570005 s | M_X=2048x256 |
| prove4 | M_Y | 0.001715 s | M_Y=2048x256 |
| prove4 | N_X | 0.595033 s | N_X=2048x256 |
| prove4 | N_Y | 0.001782 s | N_Y=2048x256 |
| prove4 | Pi_AX | 1.182939 s | Pi_AX=2048x256 |
| prove4 | Pi_AY | 0.002529 s | Pi_AY=2048x256 |
| prove4 | Pi_B | 0.002460 s | a_pub_X=512x1 |
| prove4 | Pi_CX | 2.205366 s | Pi_CX=2048x256 |
| prove4 | Pi_CY | 0.002225 s | Pi_CY=2048x256 |
