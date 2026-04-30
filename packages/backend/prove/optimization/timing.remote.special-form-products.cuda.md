# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 26.709146 s |

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
| init | 0.740477 s | - | - |
| prove0 | 4.950167 s | 2.831882 s | 0.426605 s |
| prove1 | 0.886728 s | 0.446647 s | 0.063842 s |
| prove2 | 9.540950 s | 7.654663 s | 0.329402 s |
| prove3 | 1.062417 s | 0.523961 s | 0.000000 s |
| prove4 | 9.519266 s | 7.196437 s | 0.437804 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.013837 s | A_free=128x1 |
| build | O_mid_core | 0.016577 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.229396 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010171 s | O_pub_free=128x1 |
| build | a_free_X | 0.000308 s | a_free_X=128x1 |
| build | bXY | 0.027251 s | bXY=4096x256 |
| build | s0_s1 | 0.054744 s | s0/s1=4096x256 |
| build | t_mi | 0.000047 s | t_mi=8192x1 |
| build | t_n | 0.000080 s | t_n=8192x1 |
| build | t_smax | 0.000014 s | t_smax=1x512 |
| build | uvwXY | 0.284122 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000096 s | file_bytes=10284 |
| load | permutation | 0.000875 s | file_bytes=251784 |
| load | placement_variables | 0.088279 s | file_bytes=18449792 |
| load | setup_params | 0.000018 s | file_bytes=140 |
| load | sigma | 0.000128 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000627 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 18.653591 s |
| encode | 1.270636 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.632622 s |
| combine | 14.007280 s |
| div_by_ruffini | 1.540679 s |
| div_by_vanishing_opt | 1.315135 s |
| eval | 0.279739 s |
| from_rou_evals | 0.016190 s |
| mul | 0.007924 s |
| recursion_eval | 0.142159 s |
| scale_coeffs | 0.632759 s |
| to_rou_evals | 0.079102 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | M_numerator | 0.134569 s | R=4096x256 |
| add | prove4 | N_numerator | 0.130204 s | R=4096x256 |
| add | prove4 | Pi_B_numerator | 0.000051 s | a_free_X=128x1 |
| add | prove4 | RXY | 0.089656 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.120385 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.157333 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.000424 s | gXY=4096x256 |
| combine | prove0 | B | 0.214953 s | B=4096x256 |
| combine | prove0 | Q_AX | 0.414515 s | Q_AX=8192x512 |
| combine | prove0 | Q_AY | 0.406475 s | Q_AY=4096x512 |
| combine | prove0 | U | 0.255117 s | U=4096x256 |
| combine | prove0 | V | 0.260318 s | V=4096x256 |
| combine | prove0 | W | 0.216097 s | W=4096x256 |
| combine | prove0 | p0XY | 0.608470 s | p0XY=4096x256 |
| combine | prove1 | R | 0.215327 s | R=4096x256 |
| combine | prove2 | Q_CX | 1.391533 s | Q_CX=16384x512 |
| combine | prove2 | Q_CY | 1.305335 s | Q_CY=4096x512 |
| combine | prove2 | p_comb | 3.981902 s | p_comb=4096x256 |
| combine | prove4 | LHS_for_copy | 0.579379 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.341537 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.100729 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.928586 s | uXY=4096x256 |
| combine | prove4 | V | 0.258753 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.041767 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.062307 s | bXY=4096x256 |
| combine | prove4 | pC | 0.402629 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009615 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.011937 s | gXY=4096x256 |
| div_by_ruffini | prove4 | M | 0.303385 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.309134 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.324701 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.000754 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.602705 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.455937 s | vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.859198 s | vanishing=4096x256 |
| eval | prove3 | R | 0.046236 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.034444 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034311 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | A_free | 0.042589 s | a_free_X=128x1 |
| eval | prove4 | K0 | 0.000207 s | K0=4096x1 |
| eval | prove4 | R | 0.015286 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015185 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015185 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015844 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015199 s | R=4096x256 |
| eval | prove4 | t_n | 0.006339 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.023847 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015066 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.010059 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001991 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.000957 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000354 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.002829 s | k0_evals=4096, grid=4096x1 |
| mul | prove4 | RXY_t_mi | 0.004834 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000243 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.002847 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.142159 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.067479 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.045915 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.216952 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.192019 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.064539 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.045856 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.039859 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.039244 s | gXY=4096x256 |

## Poly Combine Detail Totals

| detail operation | total |
| --- | --- |
| addition | 7.076283 s |
| multiplication | 4.914589 s |
| scaling | 0.807468 s |

## Poly Combine Detail By Target

| module | variable | addition | multiplication | scaling | total |
| --- | --- | ---: | ---: | ---: | ---: |
| prove0 | B | 0.208360 s | 0.000000 s | 0.000000 s | 0.208360 s |
| prove0 | Q_AX | 0.363434 s | 0.000000 s | 0.046671 s | 0.410105 s |
| prove0 | Q_AY | 0.371224 s | 0.000000 s | 0.030874 s | 0.402098 s |
| prove0 | U | 0.249562 s | 0.000000 s | 0.004652 s | 0.254214 s |
| prove0 | V | 0.249959 s | 0.000000 s | 0.009463 s | 0.259422 s |
| prove0 | W | 0.209491 s | 0.000000 s | 0.000000 s | 0.209491 s |
| prove0 | p0XY | 0.087523 s | 0.520926 s | 0.000000 s | 0.608449 s |
| prove1 | R | 0.214104 s | 0.000000 s | 0.001099 s | 0.215203 s |
| prove2 | Q_CX | 0.854628 s | 0.240634 s | 0.072131 s | 1.167393 s |
| prove2 | Q_CY | 0.489831 s | 0.522821 s | 0.065859 s | 1.078511 s |
| prove2 | p_comb | 0.489868 s | 3.186587 s | 0.072451 s | 3.748907 s |
| prove4 | LHS_for_copy | 0.447963 s | 0.000000 s | 0.122119 s | 0.570082 s |
| prove4 | LHS_zk1 | 0.937902 s | 0.000000 s | 0.072688 s | 1.010590 s |
| prove4 | LHS_zk2 | 0.459632 s | 0.443622 s | 0.079571 s | 0.982824 s |
| prove4 | Pi_A | 0.765728 s | 0.000000 s | 0.138938 s | 0.904665 s |
| prove4 | V | 0.255114 s | 0.000000 s | 0.002761 s | 0.257875 s |
| prove4 | fXY | 0.031599 s | 0.000000 s | 0.005636 s | 0.037235 s |
| prove4 | gXY | 0.057152 s | 0.000000 s | 0.002267 s | 0.059419 s |
| prove4 | pC | 0.330775 s | 0.000000 s | 0.064895 s | 0.395670 s |
| prove4 | term5 | 0.001219 s | 0.000000 s | 0.006528 s | 0.007748 s |
| prove4 | term6 | 0.001215 s | 0.000000 s | 0.008863 s | 0.010078 s |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.012983 s | msm=128x1 |
| prove0 | B | 0.066031 s | msm=4825x258 |
| prove0 | Q_AX | 0.097068 s | msm=4097x511 |
| prove0 | Q_AY | 0.066097 s | msm=4097x257 |
| prove0 | U | 0.066393 s | msm=4097x257 |
| prove0 | V | 0.065197 s | msm=4097x257 |
| prove0 | W | 0.065819 s | msm=4099x259 |
| prove1 | R | 0.063842 s | msm=4097x257 |
| prove2 | Q_CX | 0.193931 s | msm=8192x511 |
| prove2 | Q_CY | 0.135471 s | msm=8191x257 |
| prove4 | M_X | 0.047937 s | msm=4096x256 |
| prove4 | M_Y | 0.011504 s | msm=1x256 |
| prove4 | N_X | 0.048078 s | msm=4096x256 |
| prove4 | N_Y | 0.012073 s | msm=1x256 |
| prove4 | Pi_AX | 0.093803 s | msm=4098x511 |
| prove4 | Pi_AY | 0.012046 s | msm=1x510 |
| prove4 | Pi_B | 0.010558 s | msm=127x1 |
| prove4 | Pi_CX | 0.190649 s | msm=8191x511 |
| prove4 | Pi_CY | 0.011156 s | msm=1x510 |
