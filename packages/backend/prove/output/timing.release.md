# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 52.947312 s |

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
| init | 1.449287 s | - | - |
| prove0 | 8.502204 s | 4.340251 s | 4.013344 s |
| prove1 | 1.230726 s | 0.570570 s | 0.630683 s |
| prove2 | 27.788595 s | 18.394613 s | 3.263457 s |
| prove3 | 1.290428 s | 0.952794 s | 0.000000 s |
| prove4 | 12.684245 s | 0.924450 s | 4.371652 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A | 0.004498 s | A=512x1 |
| build | O_inst | 0.001128 s | O_inst=512x1 |
| build | O_mid_core | 0.004037 s | O_mid_core=2560x1 |
| build | O_prv_core | 0.210602 s | O_prv_core=2560x1 |
| build | a_pub_X | 0.001358 s | a_pub_X=512x1 |
| build | bXY | 0.155197 s | bXY=2048x256 |
| build | s0_s1 | 0.362714 s | s0/s1=2048x256 |
| build | t_mi | 0.000007 s | t_mi=4096x1 |
| build | t_n | 0.000004 s | t_n=4096x1 |
| build | t_smax | 0.000004 s | t_smax=1x512 |
| build | uvwXY | 0.681309 s | uXY/vXY/wXY=2048x256 |
| load | instance | 0.000053 s | file_bytes=7412 |
| load | permutation | 0.000559 s | file_bytes=240270 |
| load | placement_variables | 0.024908 s | file_bytes=8675793 |
| load | setup_params | 0.000094 s | file_bytes=139 |
| load | sigma | 0.000062 s | file_bytes=679785200 |
| load | subcircuit_infos | 0.000345 s | file_bytes=109494 |

## Category Totals

| category | total |
| --- | --- |
| poly | 25.182678 s |
| encode | 12.279135 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| div_by_ruffini | 0.924450 s |
| div_by_vanishing | 22.719636 s |
| eval | 0.932363 s |
| from_rou_evals | 0.078648 s |
| recursion_eval | 0.332040 s |
| scale_coeffs | 0.028980 s |
| to_rou_evals | 0.166562 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| div_by_ruffini | prove4 | M | 0.285728 s | R=2048x256 |
| div_by_ruffini | prove4 | N | 0.285766 s | R=2048x256 |
| div_by_ruffini | prove4 | Pi_C | 0.352955 s | LHS_for_copy=2048x256 |
| div_by_vanishing | prove0 | q0q1 | 4.340251 s | p0XY=2048x256, vanishing=2048x256 |
| div_by_vanishing | prove2 | q2q7 | 18.379385 s | p1/p2/p3=2048x256, vanishing=2048x256 |
| eval | prove3 | R | 0.311641 s | R=2048x256 |
| eval | prove3 | R_omegaX | 0.312020 s | R_omegaX=2048x256 |
| eval | prove3 | R_omegaX_omegaY | 0.308703 s | R_omegaX_omegaY=2048x256 |
| from_rou_evals | prove1 | rXY | 0.071968 s | rXY_evals=524288, grid=2048x256 |
| from_rou_evals | prove2 | K | 0.002508 s | k_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | K0 | 0.002403 s | k0_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | L | 0.001769 s | l_evals=256, grid=1x256 |
| recursion_eval | prove1 | rXY | 0.332040 s | fXY_evals=524288, gXY_evals=524288, grid=2048x256 |
| scale_coeffs | prove2 | r_omegaX | 0.004121 s | rXY=2048x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.004428 s | r_omegaX=2048x256 |
| scale_coeffs | prove3 | R_omegaX | 0.008477 s | R=2048x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.011954 s | R_omegaX=2048x256 |
| to_rou_evals | prove1 | fXY | 0.082792 s | fXY=2048x256 |
| to_rou_evals | prove1 | gXY | 0.083770 s | gXY=2048x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.587168 s | B=2048x256 |
| prove0 | Q_AX | 1.119487 s | Q_AX=4096x512 |
| prove0 | Q_AY | 0.615663 s | Q_AY=2048x512 |
| prove0 | U | 0.559764 s | U=2048x256 |
| prove0 | V | 0.557628 s | V=2048x256 |
| prove0 | W | 0.573635 s | W=2048x256 |
| prove1 | R | 0.630683 s | R=2048x256 |
| prove2 | Q_CX | 2.181204 s | Q_CX=4096x512 |
| prove2 | Q_CY | 1.082252 s | Q_CY=2048x512 |
| prove4 | M_X | 0.563644 s | M_X=2048x256 |
| prove4 | M_Y | 0.002048 s | M_Y=2048x256 |
| prove4 | N_X | 0.556218 s | N_X=2048x256 |
| prove4 | N_Y | 0.001726 s | N_Y=2048x256 |
| prove4 | Pi_AX | 1.099691 s | Pi_AX=2048x256 |
| prove4 | Pi_AY | 0.002073 s | Pi_AY=2048x256 |
| prove4 | Pi_B | 0.002217 s | a_pub_X=512x1 |
| prove4 | Pi_CX | 2.141883 s | Pi_CX=2048x256 |
| prove4 | Pi_CY | 0.002150 s | Pi_CY=2048x256 |
