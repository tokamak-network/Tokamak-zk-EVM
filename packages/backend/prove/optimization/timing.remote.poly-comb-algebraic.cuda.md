# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 27.490122 s |

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
| init | 0.734930 s | - | - |
| prove0 | 4.943971 s | 2.842127 s | 0.415760 s |
| prove1 | 0.886969 s | 0.443080 s | 0.065371 s |
| prove2 | 10.312476 s | 8.419317 s | 0.331421 s |
| prove3 | 1.061019 s | 0.522469 s | 0.000000 s |
| prove4 | 9.541593 s | 7.217631 s | 0.434717 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013758 s | A_free=128x1 |
| build | O_mid_core | 0.016449 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.221299 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010164 s | O_pub_free=128x1 |
| build | a_free_X | 0.000318 s | a_free_X=128x1 |
| build | bXY | 0.028093 s | bXY=4096x256 |
| build | s0_s1 | 0.055128 s | s0/s1=4096x256 |
| build | t_mi | 0.000050 s | t_mi=8192x1 |
| build | t_n | 0.000079 s | t_n=8192x1 |
| build | t_smax | 0.000015 s | t_smax=1x512 |
| build | uvwXY | 0.286616 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000094 s | file_bytes=10284 |
| load | permutation | 0.000862 s | file_bytes=251784 |
| load | placement_variables | 0.087210 s | file_bytes=18449792 |
| load | setup_params | 0.000018 s | file_bytes=140 |
| load | sigma | 0.000122 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000634 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 19.444623 s |
| encode | 1.260407 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.627137 s |
| combine | 14.863306 s |
| div_by_ruffini | 1.496796 s |
| div_by_vanishing_opt | 1.310085 s |
| eval | 0.274035 s |
| from_rou_evals | 0.013824 s |
| mul | 0.008618 s |
| recursion_eval | 0.140861 s |
| scale_coeffs | 0.631092 s |
| to_rou_evals | 0.078869 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.134176 s | R=4096x256 |
| add | prove4 | N_numerator | 0.129129 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000048 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.089591 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.120657 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.153115 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.000422 s | gXY=4096x256 |
| combine | prove0 | B | 0.218162 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.409851 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.407795 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.254063 s | U=4096x256 |
| combine | prove0 | V | 0.257495 s | V=4096x256 |
| combine | prove0 | W | 0.221488 s | W=4096x256 |
| combine | prove0 | p0XY | 0.612246 s | p0XY=4096x256 |
| combine | prove1 | R | 0.213308 s | R=4096x256 |
| combine | prove2 | Q_CX | 1.620061 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 1.888867 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 3.943680 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.767167 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.150340 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.194040 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.917377 s | uXY=4096x256 |
| combine | prove4 | V | 0.260906 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.038138 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.064469 s | bXY=4096x256 |
| combine | prove4 | pC | 0.401987 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009492 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.011929 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000446 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.287272 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.285671 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.306131 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.001157 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.616565 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.461026 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.849058 s | vanishing=4096x256 |
| eval | prove3 | R | 0.046147 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034342 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034335 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.037238 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.000219 s | K0=4096x1 |
| eval | prove4 | R | 0.015149 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015181 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015166 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015796 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015144 s | R=4096x256 |
| eval | prove4 | t_n | 0.006341 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.023967 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015010 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.010043 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001944 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000403 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000334 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.001101 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.004830 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000239 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.003549 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.140861 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.067252 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.047719 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.216652 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.190993 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.063923 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.044554 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.039532 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.039337 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.013139 s | msm=128x1 |
| prove0 | B | 0.066037 s | msm=4098x258 |
| prove0 | Q_AX | 0.095457 s | msm=4097x511 |
| prove0 | Q_AY | 0.062236 s | msm=4097x257 |
| prove0 | U | 0.064312 s | msm=4097x257 |
| prove0 | V | 0.063415 s | msm=4097x257 |
| prove0 | W | 0.064304 s | msm=4099x259 |
| prove1 | R | 0.065371 s | msm=4097x257 |
| prove2 | Q_CX | 0.194977 s | msm=8192x511 |
| prove2 | Q_CY | 0.136444 s | msm=8191x257 |
| prove4 | M_X | 0.044772 s | msm=4096x256 |
| prove4 | M_Y | 0.011249 s | msm=1x256 |
| prove4 | N_X | 0.044338 s | msm=4096x256 |
| prove4 | N_Y | 0.011811 s | msm=1x256 |
| prove4 | Pi_AX | 0.093537 s | msm=4098x511 |
| prove4 | Pi_AY | 0.012969 s | msm=1x510 |
| prove4 | Pi_B | 0.010608 s | msm=127x1 |
| prove4 | Pi_CX | 0.194090 s | msm=8191x511 |
| prove4 | Pi_CY | 0.011343 s | msm=1x510 |
