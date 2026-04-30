# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 26.920904 s |

## Timing Boundaries

- `encode` includes only the MSM call inside polynomial encoding.
- Polynomial work needed before encoding is reported under `poly`, usually as `combine`, `add`, `mul`, or `eval`.
- `div_by_vanishing_opt` and `div_by_ruffini` include only the division calls; numerator construction is reported separately under `poly`.
- Raw JSON may contain `encode_call` spans for outer diagnostics, but they are excluded from the encode summary tables.
- `poly_detail` breaks down operations executed inside `poly.combine.*` spans and is excluded from `poly` totals to avoid double-counting.

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
| init | 0.733636 s | - | - |
| prove0 | 4.943990 s | 2.824864 s | 0.419908 s |
| prove1 | 0.887479 s | 0.446311 s | 0.064201 s |
| prove2 | 9.652942 s | 7.746149 s | 0.334033 s |
| prove3 | 1.070436 s | 0.526316 s | 0.000000 s |
| prove4 | 9.623267 s | 7.246873 s | 0.448179 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013806 s | A_free=128x1 |
| build | O_mid_core | 0.016394 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.224772 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010180 s | O_pub_free=128x1 |
| build | a_free_X | 0.000316 s | a_free_X=128x1 |
| build | bXY | 0.027310 s | bXY=4096x256 |
| build | s0_s1 | 0.054232 s | s0/s1=4096x256 |
| build | t_mi | 0.000047 s | t_mi=8192x1 |
| build | t_n | 0.000074 s | t_n=8192x1 |
| build | t_smax | 0.000015 s | t_smax=1x512 |
| build | uvwXY | 0.284274 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000095 s | file_bytes=10284 |
| load | permutation | 0.000867 s | file_bytes=251784 |
| load | placement_variables | 0.086459 s | file_bytes=18449792 |
| load | setup_params | 0.000018 s | file_bytes=140 |
| load | sigma | 0.000127 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000635 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 18.790512 s |
| encode | 1.279361 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.641637 s |
| combine | 14.066674 s |
| div_by_ruffini | 1.599572 s |
| div_by_vanishing_opt | 1.302483 s |
| eval | 0.300908 s |
| from_rou_evals | 0.013899 s |
| mul | 0.007766 s |
| recursion_eval | 0.142855 s |
| scale_coeffs | 0.635805 s |
| to_rou_evals | 0.078913 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.137511 s | R=4096x256 |
| add | prove4 | N_numerator | 0.135522 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000048 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.090628 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.121359 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.156547 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.000022 s | gXY=4096x256 |
| combine | prove0 | B | 0.215992 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.409506 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.407313 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.251723 s | U=4096x256 |
| combine | prove0 | V | 0.261204 s | V=4096x256 |
| combine | prove0 | W | 0.212572 s | W=4096x256 |
| combine | prove0 | p0XY | 0.610890 s | p0XY=4096x256 |
| combine | prove1 | R | 0.214288 s | R=4096x256 |
| combine | prove2 | Q_CX | 1.418679 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 1.369961 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 3.993505 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.561184 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.348383 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.104660 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.922419 s | uXY=4096x256 |
| combine | prove4 | V | 0.260827 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.040188 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.062537 s | bXY=4096x256 |
| combine | prove4 | pC | 0.388285 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.006407 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.006151 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.307546 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.314331 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.325613 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.000664 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.651418 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.455664 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.846819 s | vanishing=4096x256 |
| eval | prove3 | R | 0.046439 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034386 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034502 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.041614 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.000204 s | K0=4096x1 |
| eval | prove4 | R | 0.015258 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015235 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015180 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.037560 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015185 s | R=4096x256 |
| eval | prove4 | t_n | 0.006347 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.023939 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015060 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.010255 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001963 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000954 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000333 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.000394 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.004784 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000251 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.002731 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.142855 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.067811 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.046124 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.217766 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.193223 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.064435 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.046447 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.039490 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.039423 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| addition | 7.094381 s |
| multiplication | 4.973365 s |
| scaling | 0.789332 s |

## Poly Combine Detail By Target

| module | variable | addition | multiplication | scaling | total |
| --- | --- | ---: | ---: | ---: | ---: |
| prove0 | B | 0.209481 s | 0.000000 s | 0.000000 s | 0.209481 s |
| prove0 | Q_AX | 0.358594 s | 0.000000 s | 0.046535 s | 0.405129 s |
| prove0 | Q_AY | 0.371758 s | 0.000000 s | 0.031070 s | 0.402828 s |
| prove0 | U | 0.246134 s | 0.000000 s | 0.004695 s | 0.250829 s |
| prove0 | V | 0.251318 s | 0.000000 s | 0.009013 s | 0.260331 s |
| prove0 | W | 0.206033 s | 0.000000 s | 0.000000 s | 0.206033 s |
| prove0 | p0XY | 0.088127 s | 0.522741 s | 0.000000 s | 0.610868 s |
| prove1 | R | 0.213063 s | 0.000000 s | 0.001102 s | 0.214165 s |
| prove2 | Q_CX | 0.870321 s | 0.238648 s | 0.081499 s | 1.190467 s |
| prove2 | Q_CY | 0.508086 s | 0.551550 s | 0.079330 s | 1.138966 s |
| prove2 | p_comb | 0.490170 s | 3.205060 s | 0.072506 s | 3.767737 s |
| prove4 | LHS_for_copy | 0.446305 s | 0.000000 s | 0.105598 s | 0.551903 s |
| prove4 | LHS_zk1 | 0.939999 s | 0.000000 s | 0.078134 s | 1.018133 s |
| prove4 | LHS_zk2 | 0.451115 s | 0.455365 s | 0.082963 s | 0.989443 s |
| prove4 | Pi_A | 0.765689 s | 0.000000 s | 0.132031 s | 0.897720 s |
| prove4 | V | 0.257117 s | 0.000000 s | 0.002825 s | 0.259942 s |
| prove4 | fXY | 0.031368 s | 0.000000 s | 0.004054 s | 0.035423 s |
| prove4 | gXY | 0.058077 s | 0.000000 s | 0.001408 s | 0.059485 s |
| prove4 | pC | 0.329921 s | 0.000000 s | 0.050752 s | 0.380673 s |
| prove4 | term5 | 0.000854 s | 0.000000 s | 0.003029 s | 0.003883 s |
| prove4 | term6 | 0.000852 s | 0.000000 s | 0.002788 s | 0.003640 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.013040 s | msm=128x1 |
| prove0 | B | 0.065188 s | msm=4825x258 |
| prove0 | Q_AX | 0.097328 s | msm=4097x511 |
| prove0 | Q_AY | 0.065140 s | msm=4097x257 |
| prove0 | U | 0.063525 s | msm=4097x257 |
| prove0 | V | 0.063383 s | msm=4097x257 |
| prove0 | W | 0.065342 s | msm=4099x259 |
| prove1 | R | 0.064201 s | msm=4097x257 |
| prove2 | Q_CX | 0.196395 s | msm=8192x511 |
| prove2 | Q_CY | 0.137638 s | msm=8191x257 |
| prove4 | M_X | 0.046979 s | msm=4096x256 |
| prove4 | M_Y | 0.011374 s | msm=1x256 |
| prove4 | N_X | 0.047667 s | msm=4096x256 |
| prove4 | N_Y | 0.011380 s | msm=1x256 |
| prove4 | Pi_AX | 0.093446 s | msm=4098x511 |
| prove4 | Pi_AY | 0.011784 s | msm=1x510 |
| prove4 | Pi_B | 0.010558 s | msm=127x1 |
| prove4 | Pi_CX | 0.203908 s | msm=8191x511 |
| prove4 | Pi_CY | 0.011082 s | msm=1x510 |
