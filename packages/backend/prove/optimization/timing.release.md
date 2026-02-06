# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 53.854699 s |

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
| init | 1.447371 s | - | - |
| prove0 | 8.551942 s | 4.397035 s | 4.006130 s |
| prove1 | 1.148171 s | 0.545543 s | 0.574148 s |
| prove2 | 28.499441 s | 18.960912 s | 3.279891 s |
| prove3 | 1.301022 s | 0.962119 s | 0.000000 s |
| prove4 | 12.905083 s | 0.888537 s | 4.470004 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A | 0.002851 s | A=512x1 |
| build | O_inst | 0.001429 s | O_inst=512x1 |
| build | O_mid_core | 0.003887 s | O_mid_core=2560x1 |
| build | O_prv_core | 0.212713 s | O_prv_core=2560x1 |
| build | a_pub_X | 0.001553 s | a_pub_X=512x1 |
| build | bXY | 0.142801 s | bXY=2048x256 |
| build | s0_s1 | 0.377437 s | s0/s1=2048x256 |
| build | t_mi | 0.000013 s | t_mi=4096x1 |
| build | t_n | 0.000008 s | t_n=4096x1 |
| build | t_smax | 0.000005 s | t_smax=1x512 |
| build | uvwXY | 0.676549 s | uXY/vXY/wXY=2048x256 |
| load | instance | 0.000053 s | file_bytes=7412 |
| load | permutation | 0.000576 s | file_bytes=240270 |
| load | placement_variables | 0.024766 s | file_bytes=8675793 |
| load | setup_params | 0.000039 s | file_bytes=139 |
| load | sigma | 0.000058 s | file_bytes=679785200 |
| load | subcircuit_infos | 0.000314 s | file_bytes=109494 |

## Category Totals

| category | total |
| --- | --- |
| poly | 25.754147 s |
| encode | 12.330173 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| div_by_ruffini | 0.888537 s |
| div_by_vanishing | 23.343328 s |
| eval | 0.941612 s |
| from_rou_evals | 0.082630 s |
| recursion_eval | 0.325358 s |
| scale_coeffs | 0.028045 s |
| to_rou_evals | 0.144638 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| div_by_ruffini | prove4 | M | 0.284834 s | R=2048x256 |
| div_by_ruffini | prove4 | N | 0.285755 s | R=2048x256 |
| div_by_ruffini | prove4 | Pi_C | 0.317947 s | LHS_for_copy=2048x256 |
| div_by_vanishing | prove0 | q0q1 | 4.397035 s | p0XY=2048x256, vanishing=2048x256 |
| div_by_vanishing | prove2 | q2q7 | 18.946293 s | p1/p2/p3=2048x256, vanishing=2048x256 |
| eval | prove3 | R | 0.312447 s | R=2048x256 |
| eval | prove3 | R_omegaX | 0.317113 s | R_omegaX=2048x256 |
| eval | prove3 | R_omegaX_omegaY | 0.312052 s | R_omegaX_omegaY=2048x256 |
| from_rou_evals | prove1 | rXY | 0.075548 s | rXY_evals=524288, grid=2048x256 |
| from_rou_evals | prove2 | K | 0.002705 s | k_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | K0 | 0.002404 s | k0_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | L | 0.001974 s | l_evals=256, grid=1x256 |
| recursion_eval | prove1 | rXY | 0.325358 s | fXY_evals=524288, gXY_evals=524288, grid=2048x256 |
| scale_coeffs | prove2 | r_omegaX | 0.003758 s | rXY=2048x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.003779 s | r_omegaX=2048x256 |
| scale_coeffs | prove3 | R_omegaX | 0.008595 s | R=2048x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.011913 s | R_omegaX=2048x256 |
| to_rou_evals | prove1 | fXY | 0.071501 s | fXY=2048x256 |
| to_rou_evals | prove1 | gXY | 0.073137 s | gXY=2048x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.568496 s | B=2048x256 |
| prove0 | Q_AX | 1.111822 s | Q_AX=4096x512 |
| prove0 | Q_AY | 0.590487 s | Q_AY=2048x512 |
| prove0 | U | 0.574386 s | U=2048x256 |
| prove0 | V | 0.597447 s | V=2048x256 |
| prove0 | W | 0.563492 s | W=2048x256 |
| prove1 | R | 0.574148 s | R=2048x256 |
| prove2 | Q_CX | 2.184716 s | Q_CX=4096x512 |
| prove2 | Q_CY | 1.095175 s | Q_CY=2048x512 |
| prove4 | M_X | 0.562071 s | M_X=2048x256 |
| prove4 | M_Y | 0.001767 s | M_Y=2048x256 |
| prove4 | N_X | 0.573839 s | N_X=2048x256 |
| prove4 | N_Y | 0.001715 s | N_Y=2048x256 |
| prove4 | Pi_AX | 1.134365 s | Pi_AX=2048x256 |
| prove4 | Pi_AY | 0.002196 s | Pi_AY=2048x256 |
| prove4 | Pi_B | 0.002246 s | a_pub_X=512x1 |
| prove4 | Pi_CX | 2.189464 s | Pi_CX=2048x256 |
| prove4 | Pi_CY | 0.002341 s | Pi_CY=2048x256 |
