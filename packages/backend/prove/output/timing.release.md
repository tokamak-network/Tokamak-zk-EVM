# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 78.461586 s |

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

## Module Times (prove0~prove4)

| module | total | poly | encode |
| --- | --- | --- | --- |
| prove0 | 9.514175 s | 5.396420 s | 3.966612 s |
| prove1 | 1.166358 s | 0.581442 s | 0.555136 s |
| prove2 | 35.794646 s | 26.219518 s | 3.193603 s |
| prove3 | 1.271011 s | 0.936604 s | 0.000000 s |
| prove4 | 13.186393 s | 0.875922 s | 4.348244 s |

## Init Time

| item | value |
| --- | --- |
| init.total | 17.526485 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A | 0.003271 s | A=512x1 |
| build | O_inst | 0.001148 s | O_inst=512x1 |
| build | O_mid_core | 0.003841 s | O_mid_core=2560x1 |
| build | O_prv_core | 0.294352 s | O_prv_core=2560x1 |
| build | a_pub_X | 0.001445 s | a_pub_X=512x1 |
| build | bXY | 0.132973 s | bXY=2048x256 |
| build | s0_s1 | 0.417029 s | s0/s1=2048x256 |
| build | t_mi | 0.000014 s | t_mi=4096x1 |
| build | t_n | 0.000019 s | t_n=4096x1 |
| build | t_smax | 0.000016 s | t_smax=1x512 |
| build | uvwXY | 9.471257 s | uXY/vXY/wXY=2048x256 |
| load | instance | 0.000184 s | file_bytes=7691 |
| load | permutation | 0.002371 s | file_bytes=356448 |
| load | placement_variables | 0.032455 s | file_bytes=10398067 |
| load | setup_params | 0.000323 s | file_bytes=139 |
| load | sigma | 7.127143 s | file_bytes=1501003868 |
| load | subcircuit_infos | 0.000989 s | file_bytes=109494 |

## Category Totals

| category | total |
| --- | --- |
| poly | 34.009906 s |
| encode | 12.063594 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| div_by_ruffini | 0.875922 s |
| div_by_vanishing | 31.601697 s |
| eval | 0.915877 s |
| from_rou_evals | 0.087217 s |
| recursion_eval | 0.342676 s |
| scale_coeffs | 0.028293 s |
| to_rou_evals | 0.158224 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| div_by_ruffini | prove4 | M | 0.280409 s | R=2048x256 |
| div_by_ruffini | prove4 | N | 0.278172 s | R=2048x256 |
| div_by_ruffini | prove4 | Pi_C | 0.317341 s | LHS_for_copy=2048x256 |
| div_by_vanishing | prove0 | q0q1 | 5.396420 s | p0XY=2048x256, vanishing=2048x256 |
| div_by_vanishing | prove2 | q2q7 | 26.205277 s | p1/p2/p3=2048x256, vanishing=2048x256 |
| eval | prove3 | R | 0.303820 s | R=2048x256 |
| eval | prove3 | R_omegaX | 0.307488 s | R_omegaX=2048x256 |
| eval | prove3 | R_omegaX_omegaY | 0.304569 s | R_omegaX_omegaY=2048x256 |
| from_rou_evals | prove1 | rXY | 0.080542 s | rXY_evals=524288, grid=2048x256 |
| from_rou_evals | prove2 | K | 0.002467 s | k_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | K0 | 0.002414 s | k0_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | L | 0.001794 s | l_evals=256, grid=1x256 |
| recursion_eval | prove1 | rXY | 0.342676 s | fXY_evals=524288, gXY_evals=524288, grid=2048x256 |
| scale_coeffs | prove2 | r_omegaX | 0.003725 s | rXY=2048x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.003841 s | r_omegaX=2048x256 |
| scale_coeffs | prove3 | R_omegaX | 0.008681 s | R=2048x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.012046 s | R_omegaX=2048x256 |
| to_rou_evals | prove1 | fXY | 0.077762 s | fXY=2048x256 |
| to_rou_evals | prove1 | gXY | 0.080462 s | gXY=2048x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.552622 s | B=2048x256 |
| prove0 | Q_AX | 1.102267 s | Q_AX=4096x512 |
| prove0 | Q_AY | 0.625065 s | Q_AY=2048x512 |
| prove0 | U | 0.564522 s | U=2048x256 |
| prove0 | V | 0.565028 s | V=2048x256 |
| prove0 | W | 0.557108 s | W=2048x256 |
| prove1 | R | 0.555136 s | R=2048x256 |
| prove2 | Q_CX | 2.125559 s | Q_CX=4096x512 |
| prove2 | Q_CY | 1.068044 s | Q_CY=2048x512 |
| prove4 | M_X | 0.551429 s | M_X=2048x256 |
| prove4 | M_Y | 0.002163 s | M_Y=2048x256 |
| prove4 | N_X | 0.589816 s | N_X=2048x256 |
| prove4 | N_Y | 0.001925 s | N_Y=2048x256 |
| prove4 | Pi_AX | 1.061060 s | Pi_AX=2048x256 |
| prove4 | Pi_AY | 0.002256 s | Pi_AY=2048x256 |
| prove4 | Pi_B | 0.002177 s | a_pub_X=512x1 |
| prove4 | Pi_CX | 2.134595 s | Pi_CX=2048x256 |
| prove4 | Pi_CY | 0.002823 s | Pi_CY=2048x256 |
