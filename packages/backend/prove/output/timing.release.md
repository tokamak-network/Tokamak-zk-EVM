# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 59.274345 s |

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
| init | 5.497034 s | - | - |
| prove0 | 9.124470 s | 4.908541 s | 4.066441 s |
| prove1 | 1.193716 s | 0.574230 s | 0.591067 s |
| prove2 | 29.156904 s | 19.319815 s | 3.364018 s |
| prove3 | 1.267598 s | 0.935331 s | 0.000000 s |
| prove4 | 13.032839 s | 0.869829 s | 4.548437 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A | 0.003077 s | A=512x1 |
| build | O_inst | 0.001520 s | O_inst=512x1 |
| build | O_mid_core | 0.003837 s | O_mid_core=2560x1 |
| build | O_prv_core | 0.217058 s | O_prv_core=2560x1 |
| build | a_pub_X | 0.001343 s | a_pub_X=512x1 |
| build | bXY | 0.140887 s | bXY=2048x256 |
| build | s0_s1 | 0.394284 s | s0/s1=2048x256 |
| build | t_mi | 0.000005 s | t_mi=4096x1 |
| build | t_n | 0.000004 s | t_n=4096x1 |
| build | t_smax | 0.000001 s | t_smax=1x512 |
| build | uvwXY | 4.706440 s | uXY/vXY/wXY=2048x256 |
| load | instance | 0.000058 s | file_bytes=7412 |
| load | permutation | 0.000559 s | file_bytes=240270 |
| load | placement_variables | 0.024961 s | file_bytes=8675793 |
| load | setup_params | 0.000068 s | file_bytes=139 |
| load | sigma | 0.000078 s | file_bytes=679785200 |
| load | subcircuit_infos | 0.000360 s | file_bytes=109494 |

## Category Totals

| category | total |
| --- | --- |
| poly | 26.607747 s |
| encode | 12.569962 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| div_by_ruffini | 0.869829 s |
| div_by_vanishing | 24.214625 s |
| eval | 0.914712 s |
| from_rou_evals | 0.083382 s |
| recursion_eval | 0.344853 s |
| scale_coeffs | 0.027499 s |
| to_rou_evals | 0.152847 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| div_by_ruffini | prove4 | M | 0.281888 s | R=2048x256 |
| div_by_ruffini | prove4 | N | 0.277223 s | R=2048x256 |
| div_by_ruffini | prove4 | Pi_C | 0.310718 s | LHS_for_copy=2048x256 |
| div_by_vanishing | prove0 | q0q1 | 4.908541 s | p0XY=2048x256, vanishing=2048x256 |
| div_by_vanishing | prove2 | q2q7 | 19.306084 s | p1/p2/p3=2048x256, vanishing=2048x256 |
| eval | prove3 | R | 0.308400 s | R=2048x256 |
| eval | prove3 | R_omegaX | 0.302797 s | R_omegaX=2048x256 |
| eval | prove3 | R_omegaX_omegaY | 0.303514 s | R_omegaX_omegaY=2048x256 |
| from_rou_evals | prove1 | rXY | 0.076530 s | rXY_evals=524288, grid=2048x256 |
| from_rou_evals | prove2 | K | 0.002584 s | k_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | K0 | 0.002366 s | k0_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | L | 0.001902 s | l_evals=256, grid=1x256 |
| recursion_eval | prove1 | rXY | 0.344853 s | fXY_evals=524288, gXY_evals=524288, grid=2048x256 |
| scale_coeffs | prove2 | r_omegaX | 0.003031 s | rXY=2048x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.003849 s | r_omegaX=2048x256 |
| scale_coeffs | prove3 | R_omegaX | 0.008690 s | R=2048x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.011929 s | R_omegaX=2048x256 |
| to_rou_evals | prove1 | fXY | 0.075634 s | fXY=2048x256 |
| to_rou_evals | prove1 | gXY | 0.077213 s | gXY=2048x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.580154 s | B=2048x256 |
| prove0 | Q_AX | 1.139259 s | Q_AX=4096x512 |
| prove0 | Q_AY | 0.595423 s | Q_AY=2048x512 |
| prove0 | U | 0.577224 s | U=2048x256 |
| prove0 | V | 0.583518 s | V=2048x256 |
| prove0 | W | 0.590864 s | W=2048x256 |
| prove1 | R | 0.591067 s | R=2048x256 |
| prove2 | Q_CX | 2.211522 s | Q_CX=4096x512 |
| prove2 | Q_CY | 1.152497 s | Q_CY=2048x512 |
| prove4 | M_X | 0.581617 s | M_X=2048x256 |
| prove4 | M_Y | 0.001795 s | M_Y=2048x256 |
| prove4 | N_X | 0.584708 s | N_X=2048x256 |
| prove4 | N_Y | 0.001795 s | N_Y=2048x256 |
| prove4 | Pi_AX | 1.148998 s | Pi_AX=2048x256 |
| prove4 | Pi_AY | 0.002414 s | Pi_AY=2048x256 |
| prove4 | Pi_B | 0.002573 s | a_pub_X=512x1 |
| prove4 | Pi_CX | 2.222215 s | Pi_CX=2048x256 |
| prove4 | Pi_CY | 0.002321 s | Pi_CY=2048x256 |
