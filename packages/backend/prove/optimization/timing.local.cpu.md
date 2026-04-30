# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 65.271813 s |

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
| init | 8.266230 s | - | - |
| prove0 | 12.467174 s | 2.767488 s | 9.430676 s |
| prove1 | 2.253650 s | 0.853951 s | 1.342084 s |
| prove2 | 23.854841 s | 8.720200 s | 10.997242 s |
| prove3 | 1.898353 s | 1.306813 s | 0.000000 s |
| prove4 | 16.429200 s | 7.053471 s | 9.370018 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.007661 s | A_free=128x1 |
| build | O_mid_core | 0.139834 s | O_mid_core=4824x1 |
| build | O_prv_core | 1.296996 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.001291 s | O_pub_free=128x1 |
| build | a_free_X | 0.000897 s | a_free_X=128x1 |
| build | bXY | 0.093962 s | bXY=4096x256 |
| build | s0_s1 | 0.621922 s | s0/s1=4096x256 |
| build | t_mi | 0.000025 s | t_mi=8192x1 |
| build | t_n | 0.000029 s | t_n=8192x1 |
| build | t_smax | 0.000008 s | t_smax=1x512 |
| build | uvwXY | 2.186955 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000263 s | file_bytes=10284 |
| load | permutation | 0.001221 s | file_bytes=251784 |
| load | placement_variables | 0.059258 s | file_bytes=18449792 |
| load | setup_params | 0.000805 s | file_bytes=140 |
| load | sigma | 0.001836 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.001701 s | file_bytes=146449 |

## Category Totals

| category | total |
| --- | --- |
| poly | 20.701923 s |
| encode | 31.140021 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.047857 s |
| combine | 4.171530 s |
| div_by_ruffini | 1.368127 s |
| div_by_vanishing_opt | 11.469148 s |
| eval | 2.411409 s |
| from_rou_evals | 0.058444 s |
| mul | 0.188694 s |
| recursion_eval | 0.697781 s |
| scale_coeffs | 0.181048 s |
| to_rou_evals | 0.107885 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.019207 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.017431 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.008059 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.003160 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.186762 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 2.013095 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.457248 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.207819 s | uXY=4096x256 |
| combine | prove4 | V | 0.027621 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.023913 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.009147 s | bXY=4096x256 |
| combine | prove4 | pC | 0.188279 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.012065 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.010013 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.001372 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.034197 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.322326 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.310576 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.317420 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.002255 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.415550 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.767488 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 8.701660 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.413189 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.380083 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.383035 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.001231 s | K0=4096x1 |
| eval | prove4 | R | 0.158319 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.156045 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.177452 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.160846 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.184247 s | R=4096x256 |
| eval | prove4 | t_n | 0.001246 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.238998 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.156717 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.048285 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.001794 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.002160 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.001047 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.002237 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001890 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.001032 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.182599 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.000538 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000452 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.005105 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.697781 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.006361 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.007178 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.022623 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.107883 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.006002 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.031002 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.045887 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.061997 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 1.297098 s | B=4096x256 |
| prove0 | Q_AX | 2.752873 s | Q_AX=8192x512 |
| prove0 | Q_AY | 1.317654 s | Q_AY=4096x512 |
| prove0 | U | 1.440422 s | U=4096x256 |
| prove0 | V | 1.302905 s | V=4096x256 |
| prove0 | W | 1.319724 s | W=4096x256 |
| prove1 | R | 1.342084 s | R=4096x256 |
| prove2 | Q_CX | 4.947545 s | Q_CX=16384x512 |
| prove2 | Q_CY | 6.049697 s | Q_CY=4096x512 |
| prove4 | M_X | 1.245879 s | M_X=4096x256 |
| prove4 | M_Y | 0.001968 s | M_Y=4096x256 |
| prove4 | N_X | 1.228137 s | N_X=4096x256 |
| prove4 | N_Y | 0.002562 s | N_Y=4096x256 |
| prove4 | Pi_AX | 2.428156 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.002748 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.001715 s | a_free_X=128x1 |
| prove4 | Pi_CX | 4.456080 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.002774 s | Pi_CY=4096x256 |
