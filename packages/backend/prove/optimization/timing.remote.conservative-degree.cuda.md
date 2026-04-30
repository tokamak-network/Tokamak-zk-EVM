# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 26.825371 s |

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
| init | 0.745473 s | - | - |
| prove0 | 4.988320 s | 2.846545 s | 0.419177 s |
| prove1 | 0.884996 s | 0.443502 s | 0.063019 s |
| prove2 | 9.592687 s | 7.684336 s | 0.329396 s |
| prove3 | 1.065140 s | 0.528294 s | 0.000000 s |
| prove4 | 9.539583 s | 7.195784 s | 0.438196 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.014103 s | A_free=128x1 |
| build | O_mid_core | 0.016468 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.228022 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010173 s | O_pub_free=128x1 |
| build | a_free_X | 0.000306 s | a_free_X=128x1 |
| build | bXY | 0.027573 s | bXY=4096x256 |
| build | s0_s1 | 0.055577 s | s0/s1=4096x256 |
| build | t_mi | 0.000063 s | t_mi=8192x1 |
| build | t_n | 0.000077 s | t_n=8192x1 |
| build | t_smax | 0.000016 s | t_smax=1x512 |
| build | uvwXY | 0.287664 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000097 s | file_bytes=10284 |
| load | permutation | 0.000873 s | file_bytes=251784 |
| load | placement_variables | 0.089598 s | file_bytes=18449792 |
| load | setup_params | 0.000015 s | file_bytes=140 |
| load | sigma | 0.000125 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000638 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 18.698461 s |
| encode | 1.262955 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.632490 s |
| combine | 14.024681 s |
| div_by_ruffini | 1.576574 s |
| div_by_vanishing_opt | 1.316781 s |
| eval | 0.267543 s |
| from_rou_evals | 0.016246 s |
| mul | 0.007922 s |
| recursion_eval | 0.140878 s |
| scale_coeffs | 0.635873 s |
| to_rou_evals | 0.079474 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.134289 s | R=4096x256 |
| add | prove4 | N_numerator | 0.130040 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000050 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.089249 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.120174 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.158249 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.000439 s | gXY=4096x256 |
| combine | prove0 | B | 0.216155 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.409240 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.405672 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.262413 s | U=4096x256 |
| combine | prove0 | V | 0.260618 s | V=4096x256 |
| combine | prove0 | W | 0.216678 s | W=4096x256 |
| combine | prove0 | p0XY | 0.617564 s | p0XY=4096x256 |
| combine | prove1 | R | 0.213027 s | R=4096x256 |
| combine | prove2 | Q_CX | 1.409398 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 1.310386 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 3.989586 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.580034 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.332795 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.091842 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.922842 s | uXY=4096x256 |
| combine | prove4 | V | 0.257859 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.041606 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.064092 s | bXY=4096x256 |
| combine | prove4 | pC | 0.401205 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009718 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.011950 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.304043 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.304301 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.319774 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.000877 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.647580 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.458205 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.858576 s | vanishing=4096x256 |
| eval | prove3 | R | 0.046166 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034585 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034269 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.042691 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.000210 s | K0=4096x1 |
| eval | prove4 | R | 0.015146 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015076 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015165 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015788 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015151 s | R=4096x256 |
| eval | prove4 | t_n | 0.006345 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.012007 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.014944 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.010123 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001980 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000948 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000363 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.002833 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.004835 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000239 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.002848 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.140878 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.067063 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.046036 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.220207 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.193067 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.064048 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.045452 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.040138 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.039336 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| addition | 7.077973 s |
| multiplication | 4.933451 s |
| scaling | 0.808720 s |

## Poly Combine Detail By Target

| module | variable | addition | multiplication | scaling | total |
| --- | --- | ---: | ---: | ---: | ---: |
| prove0 | B | 0.209602 s | 0.000000 s | 0.000000 s | 0.209602 s |
| prove0 | Q_AX | 0.358221 s | 0.000000 s | 0.046613 s | 0.404834 s |
| prove0 | Q_AY | 0.369785 s | 0.000000 s | 0.031355 s | 0.401141 s |
| prove0 | U | 0.256821 s | 0.000000 s | 0.004687 s | 0.261507 s |
| prove0 | V | 0.250734 s | 0.000000 s | 0.009006 s | 0.259740 s |
| prove0 | W | 0.210221 s | 0.000000 s | 0.000000 s | 0.210221 s |
| prove0 | p0XY | 0.089399 s | 0.528144 s | 0.000000 s | 0.617543 s |
| prove1 | R | 0.211812 s | 0.000000 s | 0.001092 s | 0.212904 s |
| prove2 | Q_CX | 0.866242 s | 0.242911 s | 0.072236 s | 1.181389 s |
| prove2 | Q_CY | 0.492407 s | 0.523904 s | 0.066125 s | 1.082436 s |
| prove2 | p_comb | 0.494598 s | 3.194500 s | 0.072346 s | 3.761444 s |
| prove4 | LHS_for_copy | 0.448689 s | 0.000000 s | 0.122065 s | 0.570754 s |
| prove4 | LHS_zk1 | 0.931235 s | 0.000000 s | 0.072612 s | 1.003847 s |
| prove4 | LHS_zk2 | 0.452672 s | 0.443994 s | 0.079830 s | 0.976495 s |
| prove4 | Pi_A | 0.759376 s | 0.000000 s | 0.139629 s | 0.899005 s |
| prove4 | V | 0.254203 s | 0.000000 s | 0.002775 s | 0.256978 s |
| prove4 | fXY | 0.031380 s | 0.000000 s | 0.005651 s | 0.037030 s |
| prove4 | gXY | 0.058847 s | 0.000000 s | 0.002272 s | 0.061120 s |
| prove4 | pC | 0.329299 s | 0.000000 s | 0.064936 s | 0.394235 s |
| prove4 | term5 | 0.001217 s | 0.000000 s | 0.006626 s | 0.007843 s |
| prove4 | term6 | 0.001214 s | 0.000000 s | 0.008864 s | 0.010078 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.013168 s | msm=128x1 |
| prove0 | B | 0.065969 s | msm=4825x258 |
| prove0 | Q_AX | 0.095346 s | msm=4097x511 |
| prove0 | Q_AY | 0.065727 s | msm=4097x257 |
| prove0 | U | 0.064650 s | msm=4097x257 |
| prove0 | V | 0.062996 s | msm=4097x257 |
| prove0 | W | 0.064490 s | msm=4099x259 |
| prove1 | R | 0.063019 s | msm=4097x257 |
| prove2 | Q_CX | 0.194116 s | msm=8192x511 |
| prove2 | Q_CY | 0.135279 s | msm=8191x257 |
| prove4 | M_X | 0.046873 s | msm=4096x256 |
| prove4 | M_Y | 0.011210 s | msm=1x256 |
| prove4 | N_X | 0.047897 s | msm=4096x256 |
| prove4 | N_Y | 0.012245 s | msm=1x256 |
| prove4 | Pi_AX | 0.093762 s | msm=4098x511 |
| prove4 | Pi_AY | 0.011923 s | msm=1x510 |
| prove4 | Pi_B | 0.010565 s | msm=127x1 |
| prove4 | Pi_CX | 0.192588 s | msm=8191x511 |
| prove4 | Pi_CY | 0.011132 s | msm=1x510 |
