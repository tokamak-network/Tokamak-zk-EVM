# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 28.113656 s |

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
| init | 0.762278 s | - | - |
| prove0 | 5.035262 s | 2.911567 s | 0.418813 s |
| prove1 | 0.900582 s | 0.451658 s | 0.065637 s |
| prove2 | 10.503130 s | 8.598256 s | 0.331356 s |
| prove3 | 1.093028 s | 0.537867 s | 0.000000 s |
| prove4 | 9.810091 s | 7.473306 s | 0.434826 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013632 s | A_free=128x1 |
| build | O_mid_core | 0.016515 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.228822 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010162 s | O_pub_free=128x1 |
| build | a_free_X | 0.000328 s | a_free_X=128x1 |
| build | bXY | 0.028775 s | bXY=4096x256 |
| build | s0_s1 | 0.056464 s | s0/s1=4096x256 |
| build | t_mi | 0.000038 s | t_mi=8192x1 |
| build | t_n | 0.000065 s | t_n=8192x1 |
| build | t_smax | 0.000016 s | t_smax=1x512 |
| build | uvwXY | 0.302524 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000095 s | file_bytes=10284 |
| load | permutation | 0.000860 s | file_bytes=251784 |
| load | placement_variables | 0.089026 s | file_bytes=18449792 |
| load | setup_params | 0.000019 s | file_bytes=140 |
| load | sigma | 0.000126 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000619 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 19.972654 s |
| encode | 1.263752 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.648154 s |
| combine | 15.239995 s |
| div_by_ruffini | 1.596477 s |
| div_by_vanishing_opt | 1.316342 s |
| eval | 0.274351 s |
| from_rou_evals | 0.014254 s |
| mul | 0.009040 s |
| recursion_eval | 0.143271 s |
| scale_coeffs | 0.651017 s |
| to_rou_evals | 0.079753 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.138853 s | R=4096x256 |
| add | prove4 | N_numerator | 0.133854 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000059 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.093102 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.125114 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.156747 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.000425 s | gXY=4096x256 |
| combine | prove0 | B | 0.225048 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.423071 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.418312 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.261893 s | U=4096x256 |
| combine | prove0 | V | 0.264735 s | V=4096x256 |
| combine | prove0 | W | 0.227205 s | W=4096x256 |
| combine | prove0 | p0XY | 0.629988 s | p0XY=4096x256 |
| combine | prove1 | R | 0.218259 s | R=4096x256 |
| combine | prove2 | Q_CX | 1.657213 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 1.937704 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 4.028674 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.793072 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.177282 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.216871 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.951886 s | uXY=4096x256 |
| combine | prove4 | V | 0.270973 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.039020 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.066566 s | bXY=4096x256 |
| combine | prove4 | pC | 0.410172 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009649 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.011940 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000463 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.313812 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.313023 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.340922 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.000572 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.628148 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.461314 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.855027 s | vanishing=4096x256 |
| eval | prove3 | R | 0.046167 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034382 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034391 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.037406 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.000209 s | K0=4096x1 |
| eval | prove4 | R | 0.015119 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015092 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015106 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015835 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015187 s | R=4096x256 |
| eval | prove4 | t_n | 0.006360 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.024048 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015050 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.010375 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001962 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000443 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000359 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.001114 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.005216 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000261 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.003563 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.143271 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.068314 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.048560 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.224469 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.198457 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.065419 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.045797 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.040115 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.039638 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| addition | 5.720295 s |
| multiplication | 8.791025 s |
| scaling | 0.625577 s |

## Poly Combine Detail By Target

| module | variable | addition | multiplication | scaling | total |
| --- | --- | ---: | ---: | ---: | ---: |
| prove0 | B | 0.216997 s | 0.003688 s | 0.000000 s | 0.220685 s |
| prove0 | Q_AX | 0.368244 s | 0.000000 s | 0.050395 s | 0.418639 s |
| prove0 | Q_AY | 0.381656 s | 0.000000 s | 0.032218 s | 0.413874 s |
| prove0 | U | 0.256351 s | 0.000000 s | 0.004638 s | 0.260989 s |
| prove0 | V | 0.254456 s | 0.000000 s | 0.009401 s | 0.263856 s |
| prove0 | W | 0.215162 s | 0.007688 s | 0.000000 s | 0.222851 s |
| prove0 | p0XY | 0.091361 s | 0.538603 s | 0.000000 s | 0.629965 s |
| prove1 | R | 0.217124 s | 0.000000 s | 0.001012 s | 0.218136 s |
| prove2 | Q_CX | 0.619124 s | 1.008238 s | 0.023295 s | 1.650657 s |
| prove2 | Q_CY | 0.284850 s | 1.609415 s | 0.035909 s | 1.930174 s |
| prove2 | p_comb | 0.281001 s | 3.689850 s | 0.050819 s | 4.021669 s |
| prove4 | LHS_for_copy | 0.674182 s | 0.000000 s | 0.109677 s | 0.783859 s |
| prove4 | LHS_zk1 | 0.180626 s | 0.949706 s | 0.043845 s | 1.174176 s |
| prove4 | LHS_zk2 | 0.187774 s | 0.983838 s | 0.039706 s | 1.211318 s |
| prove4 | Pi_A | 0.793005 s | 0.000000 s | 0.133940 s | 0.926945 s |
| prove4 | V | 0.266409 s | 0.000000 s | 0.003673 s | 0.270082 s |
| prove4 | fXY | 0.031631 s | 0.000000 s | 0.003264 s | 0.034896 s |
| prove4 | gXY | 0.059497 s | 0.000000 s | 0.003206 s | 0.062703 s |
| prove4 | pC | 0.338319 s | 0.000000 s | 0.064882 s | 0.403201 s |
| prove4 | term5 | 0.001219 s | 0.000000 s | 0.006558 s | 0.007778 s |
| prove4 | term6 | 0.001213 s | 0.000000 s | 0.008868 s | 0.010081 s |
| prove4 | term9 | 0.000092 s | 0.000000 s | 0.000271 s | 0.000364 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.013119 s | msm=128x1 |
| prove0 | B | 0.065178 s | msm=4098x258 |
| prove0 | Q_AX | 0.094673 s | msm=4097x511 |
| prove0 | Q_AY | 0.062867 s | msm=4097x257 |
| prove0 | U | 0.065568 s | msm=4097x257 |
| prove0 | V | 0.064036 s | msm=4097x257 |
| prove0 | W | 0.066491 s | msm=4099x259 |
| prove1 | R | 0.065637 s | msm=4097x257 |
| prove2 | Q_CX | 0.195297 s | msm=8192x511 |
| prove2 | Q_CY | 0.136059 s | msm=8191x257 |
| prove4 | M_X | 0.045613 s | msm=4096x256 |
| prove4 | M_Y | 0.011727 s | msm=1x256 |
| prove4 | N_X | 0.045977 s | msm=4096x256 |
| prove4 | N_Y | 0.011370 s | msm=1x256 |
| prove4 | Pi_AX | 0.093672 s | msm=4098x511 |
| prove4 | Pi_AY | 0.012584 s | msm=1x510 |
| prove4 | Pi_B | 0.010745 s | msm=127x1 |
| prove4 | Pi_CX | 0.191809 s | msm=8191x511 |
| prove4 | Pi_CY | 0.011329 s | msm=1x510 |
