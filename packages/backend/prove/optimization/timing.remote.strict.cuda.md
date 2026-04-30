# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 28.598577 s |

## Timing Boundaries

- `encode` includes only the MSM call inside polynomial encoding.
- Polynomial work needed before encoding is reported under `poly`, usually as `combine`, `add`, `mul`, or `eval`.
- `div_by_vanishing_opt` and `div_by_ruffini` include only the division calls; numerator construction is reported separately under `poly`.
- Raw JSON may contain `encode_call` spans for outer diagnostics, but they are excluded from the encode summary tables.

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
| init | 0.739194 s | - | - |
| prove0 | 4.993314 s | 2.899442 s | 0.421469 s |
| prove1 | 0.889580 s | 0.447650 s | 0.064972 s |
| prove2 | 10.908775 s | 9.028718 s | 0.328801 s |
| prove3 | 1.072753 s | 0.526970 s | 0.000000 s |
| prove4 | 9.985713 s | 7.665481 s | 0.433740 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013718 s | A_free=128x1 |
| build | O_mid_core | 0.016479 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.228167 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010185 s | O_pub_free=128x1 |
| build | a_free_X | 0.000320 s | a_free_X=128x1 |
| build | bXY | 0.028458 s | bXY=4096x256 |
| build | s0_s1 | 0.055986 s | s0/s1=4096x256 |
| build | t_mi | 0.000039 s | t_mi=8192x1 |
| build | t_n | 0.000065 s | t_n=8192x1 |
| build | t_smax | 0.000016 s | t_smax=1x512 |
| build | uvwXY | 0.281175 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000100 s | file_bytes=10284 |
| load | permutation | 0.000863 s | file_bytes=251784 |
| load | placement_variables | 0.088528 s | file_bytes=18449792 |
| load | setup_params | 0.000021 s | file_bytes=140 |
| load | sigma | 0.000125 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000636 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 20.568262 s |
| encode | 1.262047 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.634981 s |
| combine | 15.840093 s |
| div_by_ruffini | 1.510268 s |
| div_by_vanishing_opt | 1.310417 s |
| eval | 0.276973 s |
| from_rou_evals | 0.016545 s |
| mul | 0.117172 s |
| recursion_eval | 0.143193 s |
| scale_coeffs | 0.639357 s |
| to_rou_evals | 0.079264 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.135862 s | R=4096x256 |
| add | prove4 | N_numerator | 0.133249 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000048 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.090773 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.121832 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.147376 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005841 s | gXY=4096x256 |
| combine | prove0 | B | 0.218594 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.411293 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.409291 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.256901 s | U=4096x256 |
| combine | prove0 | V | 0.261563 s | V=4096x256 |
| combine | prove0 | W | 0.262053 s | W=4096x256 |
| combine | prove0 | p0XY | 0.617999 s | p0XY=4096x256 |
| combine | prove1 | R | 0.213805 s | R=4096x256 |
| combine | prove2 | Q_CX | 1.616636 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 1.943383 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 4.500720 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.775926 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.326547 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.204088 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.912939 s | uXY=4096x256 |
| combine | prove4 | V | 0.260019 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.040161 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.063169 s | bXY=4096x256 |
| combine | prove4 | pC | 0.398870 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009275 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009979 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000461 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.126422 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.294582 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.314923 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.305861 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.000885 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.594017 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.461748 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.848669 s | vanishing=4096x256 |
| eval | prove3 | R | 0.046408 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034731 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034868 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.038008 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.000211 s | K0=4096x1 |
| eval | prove4 | R | 0.015345 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015215 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015169 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.016062 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015357 s | R=4096x256 |
| eval | prove4 | t_n | 0.006328 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.024076 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015194 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.011389 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001096 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001077 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000319 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000318 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001957 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000390 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.108116 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.004845 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000243 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.003968 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.143193 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.069749 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.047070 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.218097 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.192866 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.065590 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.045985 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.039568 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.039695 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.013064 s | msm=128x1 |
| prove0 | B | 0.064429 s | msm=4098x258 |
| prove0 | Q_AX | 0.096635 s | msm=4097x511 |
| prove0 | Q_AY | 0.064889 s | msm=4097x257 |
| prove0 | U | 0.066339 s | msm=4097x257 |
| prove0 | V | 0.064637 s | msm=4097x257 |
| prove0 | W | 0.064541 s | msm=4099x259 |
| prove1 | R | 0.064972 s | msm=4097x257 |
| prove2 | Q_CX | 0.192639 s | msm=8192x511 |
| prove2 | Q_CY | 0.136162 s | msm=8191x257 |
| prove4 | M_X | 0.046269 s | msm=4096x256 |
| prove4 | M_Y | 0.011414 s | msm=1x256 |
| prove4 | N_X | 0.046025 s | msm=4096x256 |
| prove4 | N_Y | 0.011533 s | msm=1x256 |
| prove4 | Pi_AX | 0.090564 s | msm=4098x511 |
| prove4 | Pi_AY | 0.011894 s | msm=1x510 |
| prove4 | Pi_B | 0.010599 s | msm=127x1 |
| prove4 | Pi_CX | 0.194330 s | msm=8191x511 |
| prove4 | Pi_CY | 0.011112 s | msm=1x510 |
