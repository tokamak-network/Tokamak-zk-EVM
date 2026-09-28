# Historical Pre-Normalized Prove Timing Report

> This record belongs to the superseded pre-normalized protocol. Its aggregate
> width labels are retained only to preserve the original timing evidence; they
> are not current protocol parameters.

## Total Time

| item | value |
| --- | --- |
| total_wall | 11.060470 s |

## Timing Boundaries

- `encode` includes only the MSM call inside polynomial encoding.
- Polynomial work needed before encoding is reported under `poly`, usually as `combine`, `add`, `mul`, or `eval`.
- `div_by_vanishing_opt` and `div_by_ruffini` include only the division calls; numerator construction is reported separately under `poly`.
- Raw JSON may contain `encode_call` spans for outer diagnostics, but they are excluded from the encode summary tables.

## Setup Parameters

| param | value |
| --- | --- |
| l_free | 256 |
| l | 396 |
| l_user_out | 130 |
| l_user | 134 |
| l_D | 1420 |
| m_D | 24079 |
| n | 1024 |
| s_D | 44 |
| s_max | 256 |

## Module Times (init + prove0~prove4)

| module | total | poly | encode |
| --- | --- | --- | --- |
| init | 1.113575 s | - | - |
| prove0 | 2.512524 s | 0.294121 s | 2.191120 s |
| prove1 | 0.560714 s | 0.232965 s | 0.315071 s |
| prove2 | 3.277040 s | 1.450804 s | 1.757443 s |
| prove3 | 0.340617 s | 0.060503 s | 0.000000 s |
| prove4 | 3.255217 s | 1.742986 s | 1.480206 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.002384 s | A_free=256x1 |
| build | O_mid_core | 0.002656 s | O_mid_core=1420x1 |
| build | O_prv_core | 0.103905 s | O_prv_core=1420x1 |
| build | O_pub_free | 0.001180 s | O_pub_free=256x1 |
| build | a_free_X | 0.000078 s | a_free_X=256x1 |
| build | bXY | 0.014123 s | bXY=1024x256 |
| build | s0_s1 | 0.024877 s | s0/s1=1024x256 |
| build | t_mi | 0.000002 s | t_mi=2048x1 |
| build | t_n | 0.000003 s | t_n=2048x1 |
| build | t_smax | 0.000001 s | t_smax=1x512 |
| build | uvwXY | 0.053672 s | uXY/vXY/wXY=1024x256 |
| load | instance | 0.000121 s | file_bytes=6924 |
| load | permutation | 0.000307 s | file_bytes=99828 |
| load | placement_variables | 0.032427 s | file_bytes=3505572 |
| load | setup_params | 0.000029 s | file_bytes=269 |
| load | sigma | 0.067795 s | file_bytes=682929000 |
| load | subcircuit_infos | 0.000446 s | file_bytes=155559 |

## Category Totals

| category | total |
| --- | --- |
| poly | 3.781379 s |
| encode | 5.745778 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.008909 s |
| combine | 2.154576 s |
| div_by_ruffini | 0.279030 s |
| div_by_ruffini_shared_x | 0.262600 s |
| div_by_vanishing_opt | 0.058481 s |
| eval | 0.714319 s |
| eval_derived | 0.000000 s |
| eval_three_batch | 0.060503 s |
| from_rou_evals | 0.012785 s |
| mul | 0.002831 s |
| recursion_eval | 0.189323 s |
| scale_coeffs | 0.014935 s |
| to_rou_evals | 0.023086 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.004257 s | R=1024x256 |
| add | prove4 | RXY_terms | 0.003425 s | m_i_s_max=1024x256 |
| add | prove4 | g_minus_f | 0.001227 s | gXY=1024x256 |
| combine | prove0 | B | 0.008272 s | B=1024x256 |
| combine | prove0 | Q_AX | 0.022284 s | Q_AX=2048x512 |
| combine | prove0 | Q_AY | 0.020814 s | Q_AY=1024x512 |
| combine | prove0 | U | 0.009094 s | U=1024x256 |
| combine | prove0 | V | 0.009717 s | V=1024x256 |
| combine | prove0 | W | 0.009013 s | W=1024x256 |
| combine | prove0 | p0XY | 0.192015 s | p0XY=1024x256 |
| combine | prove1 | R | 0.008443 s | R=1024x256 |
| combine | prove2 | Q_CX | 0.139971 s | Q_CX=4096x512 |
| combine | prove2 | Q_CY | 0.226813 s | Q_CY=1024x512 |
| combine | prove2 | p_comb | 1.043420 s | p_comb=1024x256 |
| combine | prove4 | LHS_for_copy | 0.043216 s | m_i_s_max=1024x256 |
| combine | prove4 | LHS_zk1 | 0.066872 s | m_i_s_max=1024x256 |
| combine | prove4 | LHS_zk2 | 0.215242 s | m_i_s_max=1024x256 |
| combine | prove4 | Pi_A | 0.053879 s | uXY=1024x256 |
| combine | prove4 | Pi_combined_numerator | 0.015253 s | m_i_s_max=1024x256 |
| combine | prove4 | V | 0.008697 s | vXY=1024x256 |
| combine | prove4 | fXY | 0.006636 s | bXY=1024x256 |
| combine | prove4 | gXY | 0.003432 s | bXY=1024x256 |
| combine | prove4 | pC | 0.041688 s | m_i_s_max=1024x256 |
| combine | prove4 | term5 | 0.005468 s | gXY=1024x256 |
| combine | prove4 | term6 | 0.004335 s | gXY=1024x256 |
| div_by_ruffini | prove4 | Pi_combined | 0.279030 s | m_i_s_max=1024x256 |
| div_by_ruffini_shared_x | prove4 | M_N | 0.262600 s | R=1024x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 0.022911 s | vanishing=1024x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 0.035570 s | vanishing=1024x256 |
| eval | prove4 | A_free | 0.001027 s | a_free_X=256x1 |
| eval | prove4 | K0 | 0.000849 s | K0=1024x1 |
| eval | prove4 | R | 0.122075 s | R=1024x256 |
| eval | prove4 | R_omegaX | 0.121857 s | R_omegaX=1024x256 |
| eval | prove4 | R_omegaX_omegaY | 0.121527 s | R_omegaX_omegaY=1024x256 |
| eval | prove4 | t_n | 0.001092 s | t_n=2048x1 |
| eval | prove4 | t_smax | 0.222911 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.122981 s | vXY=1024x256 |
| eval_derived | prove4 | r_D1_r_D2 | 0.000000 s | evaluations=2 |
| eval_three_batch | prove3 | R | 0.060503 s | R=2048x512 |
| from_rou_evals | prove1 | rXY | 0.012112 s | rXY_evals=262144, grid=1024x256 |
| from_rou_evals | prove2 | K | 0.000219 s | k_evals=1024, grid=1024x1 |
| from_rou_evals | prove2 | K0 | 0.000202 s | k0_evals=1024, grid=1024x1 |
| from_rou_evals | prove2 | L | 0.000029 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K0 | 0.000224 s | k0_evals=1024, grid=1024x1 |
| mul | prove4 | RXY_t_mi | 0.000520 s | t_mi=2048x1 |
| mul | prove4 | RXY_t_smax | 0.000481 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.001830 s | gXY=1024x256 |
| recursion_eval | prove1 | rXY | 0.189323 s | fXY_evals=262144, gXY_evals=262144, grid=1024x256 |
| scale_coeffs | prove2 | r_omegaX | 0.002134 s | rXY=1024x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.002446 s | r_omegaX=1024x256 |
| scale_coeffs | prove4 | r_omegaX | 0.002334 s | R=1024x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.008021 s | R_omegaX=1024x256 |
| to_rou_evals | prove1 | fXY | 0.011412 s | fXY=1024x256 |
| to_rou_evals | prove1 | gXY | 0.011675 s | gXY=1024x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| init | A_free | 0.001937 s | msm=256x1 |
| prove0 | B | 0.336202 s | msm=1026x258 |
| prove0 | Q_AX | 0.585127 s | msm=1025x511 |
| prove0 | Q_AY | 0.311478 s | msm=1025x257 |
| prove0 | U | 0.321767 s | msm=1025x257 |
| prove0 | V | 0.325149 s | msm=1025x257 |
| prove0 | W | 0.311397 s | msm=1027x259 |
| prove1 | R | 0.315071 s | msm=1025x257 |
| prove2 | Q_CX | 1.136153 s | msm=2048x511 |
| prove2 | Q_CY | 0.621290 s | msm=2047x257 |
| prove4 | M_N_X | 0.325744 s | msm=1024x256 |
| prove4 | M_Y | 0.002109 s | msm=1x256 |
| prove4 | N_Y | 0.001540 s | msm=1x256 |
| prove4 | Pi_X | 1.148275 s | msm=2047x511 |
| prove4 | Pi_Y | 0.002539 s | msm=1x510 |
