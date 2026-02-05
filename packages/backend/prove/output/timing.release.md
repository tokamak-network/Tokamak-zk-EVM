# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 65.550416 s |

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
| prove0 | 8.210208 s | 4.257441 s | 3.804651 s |
| prove1 | 1.113737 s | 0.555115 s | 0.529209 s |
| prove2 | 27.574265 s | 18.422794 s | 3.105342 s |
| prove3 | 1.303315 s | 0.955676 s | 0.000000 s |
| prove4 | 12.604572 s | 0.895258 s | 4.232417 s |

## Category Totals

| category | total |
| --- | --- |
| poly | 25.086284 s |
| encode | 11.671620 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| div_by_ruffini | 0.895258 s |
| div_by_vanishing | 22.666681 s |
| eval | 0.935201 s |
| from_rou_evals | 0.081237 s |
| recursion_eval | 0.334005 s |
| scale_coeffs | 0.027275 s |
| to_rou_evals | 0.146627 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| div_by_ruffini | prove4 | M | 0.291286 s | R=2048x256 |
| div_by_ruffini | prove4 | N | 0.284775 s | R=2048x256 |
| div_by_ruffini | prove4 | Pi_C | 0.319197 s | LHS_for_copy=2048x256 |
| div_by_vanishing | prove0 | q0q1 | 4.257441 s | p0XY=2048x256, vanishing=2048x256 |
| div_by_vanishing | prove2 | q2q7 | 18.409239 s | p1/p2/p3=2048x256, vanishing=2048x256 |
| eval | prove3 | R | 0.312631 s | R=2048x256 |
| eval | prove3 | R_omegaX | 0.311277 s | R_omegaX=2048x256 |
| eval | prove3 | R_omegaX_omegaY | 0.311292 s | R_omegaX_omegaY=2048x256 |
| from_rou_evals | prove1 | rXY | 0.074482 s | rXY_evals=524288, grid=2048x256 |
| from_rou_evals | prove2 | K | 0.002543 s | k_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | K0 | 0.002391 s | k0_evals=2048, grid=2048x1 |
| from_rou_evals | prove2 | L | 0.001820 s | l_evals=256, grid=1x256 |
| recursion_eval | prove1 | rXY | 0.334005 s | fXY_evals=524288, gXY_evals=524288, grid=2048x256 |
| scale_coeffs | prove2 | r_omegaX | 0.003031 s | rXY=2048x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.003769 s | r_omegaX=2048x256 |
| scale_coeffs | prove3 | R_omegaX | 0.008537 s | R=2048x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.011938 s | R_omegaX=2048x256 |
| to_rou_evals | prove1 | fXY | 0.071831 s | fXY=2048x256 |
| to_rou_evals | prove1 | gXY | 0.074797 s | gXY=2048x256 |
