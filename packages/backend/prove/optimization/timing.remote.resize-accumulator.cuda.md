# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 26.750981 s |

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
| init | 0.744200 s | - | - |
| prove0 | 4.884888 s | 2.790131 s | 0.429559 s |
| prove1 | 0.925037 s | 0.451799 s | 0.066213 s |
| prove2 | 9.449195 s | 7.574565 s | 0.336637 s |
| prove3 | 1.011897 s | 0.518326 s | 0.000000 s |
| prove4 | 9.726509 s | 7.403926 s | 0.442379 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013851 s | A_free=128x1 |
| build | O_mid_core | 0.016461 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.226399 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010170 s | O_pub_free=128x1 |
| build | a_free_X | 0.000317 s | a_free_X=128x1 |
| build | bXY | 0.027273 s | bXY=4096x256 |
| build | s0_s1 | 0.055582 s | s0/s1=4096x256 |
| build | t_mi | 0.000045 s | t_mi=8192x1 |
| build | t_n | 0.000072 s | t_n=8192x1 |
| build | t_smax | 0.000015 s | t_smax=1x512 |
| build | uvwXY | 0.290267 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000102 s | file_bytes=10284 |
| load | permutation | 0.000887 s | file_bytes=251784 |
| load | placement_variables | 0.088223 s | file_bytes=18449792 |
| load | setup_params | 0.000016 s | file_bytes=140 |
| load | sigma | 0.000127 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000658 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 18.738748 s |
| encode | 1.287827 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.633588 s |
| combine | 14.028294 s |
| div_by_ruffini | 1.589633 s |
| div_by_vanishing_opt | 1.308149 s |
| eval | 0.288094 s |
| from_rou_evals | 0.017348 s |
| mul | 0.006776 s |
| recursion_eval | 0.143855 s |
| scale_coeffs | 0.640746 s |
| to_rou_evals | 0.082266 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.131629 s | R=4096x256 |
| add | prove4 | N_numerator | 0.135636 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000052 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.088706 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.121878 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.155618 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.000070 s | gXY=4096x256 |
| combine | prove0 | B | 0.213248 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.379510 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.487239 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.214953 s | U=4096x256 |
| combine | prove0 | V | 0.213257 s | V=4096x256 |
| combine | prove0 | W | 0.209325 s | W=4096x256 |
| combine | prove0 | p0XY | 0.615928 s | p0XY=4096x256 |
| combine | prove1 | R | 0.212709 s | R=4096x256 |
| combine | prove2 | Q_CX | 1.360713 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 1.309897 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 3.932912 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.545956 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.332254 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.102738 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.856194 s | uXY=4096x256 |
| combine | prove4 | V | 0.216341 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.039765 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.063936 s | bXY=4096x256 |
| combine | prove4 | pC | 0.706185 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.007304 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.007929 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.306075 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.312328 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.320197 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.001120 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.649913 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.456671 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.851479 s | vanishing=4096x256 |
| eval | prove3 | R | 0.042206 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034337 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034554 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.041788 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.000210 s | K0=4096x1 |
| eval | prove4 | R | 0.015317 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015176 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015160 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.028851 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015224 s | R=4096x256 |
| eval | prove4 | t_n | 0.006353 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.023912 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015008 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.012969 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001095 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000954 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000335 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.001994 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.003804 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000238 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.002734 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.143855 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.069852 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.047328 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.216717 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.190513 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.067994 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.048342 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.041900 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.040366 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| addition | 2.750574 s |
| multiplication | 4.923092 s |
| scaling | 0.520132 s |

## Poly Combine Detail By Target

| module | variable | addition | multiplication | scaling | total |
| --- | --- | ---: | ---: | ---: | ---: |
| prove0 | B | 0.207616 s | 0.000000 s | 0.000000 s | 0.207616 s |
| prove0 | Q_AX | 0.002125 s | 0.000000 s | 0.008633 s | 0.010759 s |
| prove0 | Q_AY | 0.002326 s | 0.000000 s | 0.006531 s | 0.008856 s |
| prove0 | U | 0.000888 s | 0.000000 s | 0.000901 s | 0.001789 s |
| prove0 | V | 0.000806 s | 0.000000 s | 0.003301 s | 0.004107 s |
| prove0 | W | 0.202817 s | 0.000000 s | 0.000000 s | 0.202817 s |
| prove0 | p0XY | 0.086388 s | 0.529520 s | 0.000000 s | 0.615908 s |
| prove1 | R | 0.211497 s | 0.000000 s | 0.001094 s | 0.212591 s |
| prove2 | Q_CX | 0.306496 s | 0.221162 s | 0.054657 s | 0.582315 s |
| prove2 | Q_CY | 0.309054 s | 0.521995 s | 0.066665 s | 0.897713 s |
| prove2 | p_comb | 0.245856 s | 3.193223 s | 0.057750 s | 3.496829 s |
| prove4 | LHS_for_copy | 0.005736 s | 0.000000 s | 0.083890 s | 0.089625 s |
| prove4 | LHS_zk1 | 0.578887 s | 0.000000 s | 0.046523 s | 0.625410 s |
| prove4 | LHS_zk2 | 0.366110 s | 0.457193 s | 0.076317 s | 0.899620 s |
| prove4 | Pi_A | 0.129844 s | 0.000000 s | 0.054758 s | 0.184602 s |
| prove4 | V | 0.000996 s | 0.000000 s | 0.000571 s | 0.001567 s |
| prove4 | fXY | 0.030689 s | 0.000000 s | 0.005069 s | 0.035758 s |
| prove4 | gXY | 0.058674 s | 0.000000 s | 0.002271 s | 0.060945 s |
| prove4 | pC | 0.002064 s | 0.000000 s | 0.042707 s | 0.044771 s |
| prove4 | term5 | 0.000854 s | 0.000000 s | 0.003930 s | 0.004784 s |
| prove4 | term6 | 0.000853 s | 0.000000 s | 0.004563 s | 0.005416 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.013040 s | msm=128x1 |
| prove0 | B | 0.067926 s | msm=4825x258 |
| prove0 | Q_AX | 0.096900 s | msm=4097x511 |
| prove0 | Q_AY | 0.067271 s | msm=4097x257 |
| prove0 | U | 0.064706 s | msm=4097x257 |
| prove0 | V | 0.065756 s | msm=4097x257 |
| prove0 | W | 0.067000 s | msm=4099x259 |
| prove1 | R | 0.066213 s | msm=4097x257 |
| prove2 | Q_CX | 0.196292 s | msm=8192x511 |
| prove2 | Q_CY | 0.140345 s | msm=8191x257 |
| prove4 | M_X | 0.047964 s | msm=4096x256 |
| prove4 | M_Y | 0.011788 s | msm=1x256 |
| prove4 | N_X | 0.046893 s | msm=4096x256 |
| prove4 | N_Y | 0.011228 s | msm=1x256 |
| prove4 | Pi_AX | 0.095456 s | msm=4098x511 |
| prove4 | Pi_AY | 0.011888 s | msm=1x510 |
| prove4 | Pi_B | 0.010623 s | msm=127x1 |
| prove4 | Pi_CX | 0.195402 s | msm=8191x511 |
| prove4 | Pi_CY | 0.011137 s | msm=1x510 |
