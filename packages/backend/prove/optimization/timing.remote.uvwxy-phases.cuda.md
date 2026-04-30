# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 39.875182 s |

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
| init | 8.668618 s | - | - |
| prove0 | 6.140551 s | 2.159726 s | 2.114742 s |
| prove1 | 0.919837 s | 0.245427 s | 0.329776 s |
| prove2 | 12.850785 s | 7.337649 s | 1.678306 s |
| prove3 | 1.078181 s | 0.532025 s | 0.000000 s |
| prove4 | 10.207959 s | 7.844621 s | 2.338705 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.014034 s | A_free=128x1 |
| build | O_mid_core | 0.016471 s | O_mid_core=4824x1 |
| build | O_prv_core | 0.224750 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.010178 s | O_pub_free=128x1 |
| build | a_free_X | 0.000464 s | a_free_X=128x1 |
| build | bXY | 0.027287 s | bXY=4096x256 |
| build | s0_s1 | 1.204856 s | s0/s1=4096x256 |
| build | t_mi | 0.000038 s | t_mi=8192x1 |
| build | t_n | 0.000070 s | t_n=8192x1 |
| build | t_smax | 0.000017 s | t_smax=1x512 |
| build | uvwXY | 7.065987 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000201 s | file_bytes=10284 |
| load | permutation | 0.000862 s | file_bytes=251784 |
| load | placement_variables | 0.088708 s | file_bytes=18449792 |
| load | setup_params | 0.000016 s | file_bytes=140 |
| load | sigma | 0.000130 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.000643 s | file_bytes=146449 |

## uvwXY Phase Breakdown

This run used `TOKAMAK_UVWXY_PHASE_PROFILE=1` on the CUDA host. The top-level
`init.build.witness.uvwXY` timing event was `7.065986924 s`; the explicit
function-level phase timer measured `7.065982784 s`, leaving only `0.000004140 s`
outside the instrumented function phases.

| uvwXY phase | time | share of function |
| --- | ---: | ---: |
| alloc_eval_buffers | 0.033435690 s | 0.47% |
| usage_scan | 0.000013205 s | 0.00% |
| r1cs_preload_json_compact | 6.699539603 s | 94.81% |
| gpu_check_log | 0.000003122 s | 0.00% |
| sparse_eval_cpu_rayon | 0.046125507 s | 0.65% |
| usage_report_stdout | 0.000017058 s | 0.00% |
| transpose_cpu | 0.065756295 s | 0.93% |
| from_rou_evals_gpu_icicle | 0.039745214 s | 0.56% |
| cleanup_local_buffers | 0.181218947 s | 2.57% |
| uvwxy_total_function | 7.065982784 s | 100.00% |

The previously isolated execution phases requested for comparison are small:

| requested group | time |
| --- | ---: |
| CPU/Rayon sparse evaluation | 0.046125507 s |
| CPU transpose | 0.065756295 s |
| GPU/ICICLE `from_rou_evals` for U/V/W | 0.039745214 s |
| requested group total | 0.151627016 s |
| uvwXY residual outside requested group | 6.914355768 s |

The residual is dominated by `r1cs_preload_json_compact` at `6.699539603 s`.
This means the current uvwXY bottleneck is not sparse row evaluation, transpose,
or ICICLE inverse biNTT conversion. It is the JSON R1CS preload and compact
R1CS construction path before sparse evaluation begins.

## Category Totals

| category | total |
| --- | --- |
| poly | 18.119448 s |
| encode | 6.461529 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.375214 s |
| combine | 5.269951 s |
| div_by_ruffini | 1.844396 s |
| div_by_vanishing_opt | 9.376405 s |
| eval | 0.236398 s |
| from_rou_evals | 0.019293 s |
| mul | 0.119449 s |
| recursion_eval | 0.147078 s |
| scale_coeffs | 0.646179 s |
| to_rou_evals | 0.085085 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.093647 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.126274 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.149459 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.005834 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.800876 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.374198 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.229769 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.924716 s | uXY=4096x256 |
| combine | prove4 | V | 0.271024 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.042792 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.065538 s | bXY=4096x256 |
| combine | prove4 | pC | 0.410076 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009407 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.010024 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.000475 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.131056 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.434018 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.429309 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.303832 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.039972 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.637266 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.159726 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 7.216679 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.045634 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.035169 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.034410 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000214 s | K0=4096x1 |
| eval | prove4 | R | 0.015279 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.015195 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.015137 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.015846 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.015177 s | R=4096x256 |
| eval | prove4 | t_n | 0.005469 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.023846 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.015022 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.013264 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001931 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.001076 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.000339 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.000331 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001978 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000374 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.111359 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.003806 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000274 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.004010 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.147078 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.070974 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.046650 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.221613 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.195199 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.064818 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.046925 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.043230 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.041855 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 0.331607 s | B=4096x256 |
| prove0 | Q_AX | 0.479017 s | Q_AX=8192x512 |
| prove0 | Q_AY | 0.330051 s | Q_AY=4096x512 |
| prove0 | U | 0.327695 s | U=4096x256 |
| prove0 | V | 0.322795 s | V=4096x256 |
| prove0 | W | 0.323576 s | W=4096x256 |
| prove1 | R | 0.329776 s | R=4096x256 |
| prove2 | Q_CX | 1.143334 s | Q_CX=16384x512 |
| prove2 | Q_CY | 0.534973 s | Q_CY=4096x512 |
| prove4 | M_X | 0.350094 s | M_X=4096x256 |
| prove4 | M_Y | 0.013305 s | M_Y=4096x256 |
| prove4 | N_X | 0.347180 s | N_X=4096x256 |
| prove4 | N_Y | 0.012320 s | N_Y=4096x256 |
| prove4 | Pi_AX | 0.477298 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.012053 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.010911 s | a_free_X=128x1 |
| prove4 | Pi_CX | 1.104165 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.011381 s | Pi_CY=4096x256 |
