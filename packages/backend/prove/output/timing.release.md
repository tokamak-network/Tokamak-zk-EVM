# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 71.049089 s |

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
| prove0 | 8.995563 s | 4.999928 s | 3.848214 s |
| prove1 | 1.151224 s | 0.570837 s | 0.549950 s |
| prove2 | 33.943829 s | 24.666205 s | 3.137340 s |
| prove3 | 1.329268 s | 0.991215 s | 0.000000 s |
| prove4 | 12.462160 s | 0.891975 s | 4.238455 s |

## Category Totals

| category | total |
| --- | --- |
| poly | 32.120161 s |
| encode | 11.773960 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| div_by_ruffini | 0.891975 s |
| div_by_vanishing | 29.650872 s |
| eval | 0.970700 s |
| from_rou_evals | 0.082276 s |
| recursion_eval | 0.333373 s |
| scale_coeffs | 0.029031 s |
| to_rou_evals | 0.161934 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| div_by_ruffini | prove4 | M | 0.292459 s | R=2048x256 |
| div_by_ruffini | prove4 | N | 0.286173 s | R=2048x256 |
| div_by_ruffini | prove4 | Pi_C | 0.313342 s | LHS_for_copy=2048x256 |
| div_by_vanishing | prove0 | q0q1 | 4.999928 s | p0XY=2048x256, vanishing=2048x256 |
| div_by_vanishing | prove2 | q2q7 | 24.650944 s | p1/p2/p3=2048x256, vanishing=2048x256 |
| eval | prove3 | R | 0.331216 s | R=2048x256 |
| eval | prove3 | R_omegaX | 0.329017 s | R_omegaX=2048x256 |
| eval | prove3 | R_omegaX_omegaY | 0.310467 s | R_omegaX_omegaY=2048x256 |
| from_rou_evals | prove1 | rXY | 0.075531 s | rXY_evals=524288, grid=2048x256 |
| from_rou_evals | prove2 | K | 0.002513 s | k_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | K0 | 0.002494 s | k0_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | L | 0.001739 s | l_evals=256, grid=1x256 |
| recursion_eval | prove1 | rXY | 0.333373 s | fXY_evals=524288, gXY_evals=524288, grid=2048x256 |
| scale_coeffs | prove2 | r_omegaX | 0.004111 s | rXY=2048x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.004405 s | r_omegaX=2048x256 |
| scale_coeffs | prove3 | R_omegaX | 0.008655 s | R=2048x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.011860 s | R_omegaX=2048x256 |
| to_rou_evals | prove1 | fXY | 0.084627 s | fXY=2048x256 |
| to_rou_evals | prove1 | gXY | 0.077307 s | gXY=2048x256 |
