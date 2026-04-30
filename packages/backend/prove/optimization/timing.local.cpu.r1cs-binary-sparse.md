# Prove Timing Report

## Total Time

| item | value |
| --- | --- |
| total_wall | 56.905538 s |

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
| init | 6.011812 s | - | - |
| prove0 | 11.840273 s | 2.931377 s | 8.650321 s |
| prove1 | 2.110526 s | 0.845754 s | 1.200994 s |
| prove2 | 19.377712 s | 8.725083 s | 6.993758 s |
| prove3 | 1.623925 s | 1.167631 s | 0.000000 s |
| prove4 | 15.929082 s | 6.477023 s | 9.446759 s |

## Init Details (load/build)

| phase | variable | time | dims |
| --- | --- | --- | --- |
| build | A_free | 0.009925 s | A_free=128x1 |
| build | O_mid_core | 0.113768 s | O_mid_core=4824x1 |
| build | O_prv_core | 1.035289 s | O_prv_core=4824x1 |
| build | O_pub_free | 0.001580 s | O_pub_free=128x1 |
| build | a_free_X | 0.001150 s | a_free_X=128x1 |
| build | bXY | 0.088975 s | bXY=4096x256 |
| build | s0_s1 | 0.629767 s | s0/s1=4096x256 |
| build | t_mi | 0.000010 s | t_mi=8192x1 |
| build | t_n | 0.000010 s | t_n=8192x1 |
| build | t_smax | 0.000025 s | t_smax=1x512 |
| build | uvwXY | 0.259326 s | uXY/vXY/wXY=4096x256 |
| load | instance | 0.000259 s | file_bytes=10284 |
| load | permutation | 0.001244 s | file_bytes=251784 |
| load | placement_variables | 0.057190 s | file_bytes=18449792 |
| load | setup_params | 0.000126 s | file_bytes=140 |
| load | sigma | 0.002818 s | file_bytes=1038543880 |
| load | subcircuit_infos | 0.001119 s | file_bytes=146449 |

## r1cs Binary Sparse CPU Result

This run confirms that the r1cs binary sparse loader is on the common uvwXY
path, not a GPU-only branch.

| comparison | previous local CPU | r1cs binary sparse CPU | delta |
| --- | ---: | ---: | ---: |
| total_wall | 65.271813000 s | 56.905538167 s | -8.366274833 s |
| init | 8.266230417 s | 6.011812041 s | -2.254418376 s |
| init.build.witness.uvwXY | 2.186954958 s | 0.259325667 s | -1.927629291 s |

## Category Totals

| category | total |
| --- | --- |
| poly | 20.146868 s |
| encode | 26.291832 s |

## Poly Operation Totals

| operation | total |
| --- | --- |
| add | 0.034617 s |
| combine | 3.496979 s |
| div_by_ruffini | 1.588709 s |
| div_by_vanishing_opt | 11.636624 s |
| eval | 2.315757 s |
| from_rou_evals | 0.058356 s |
| mul | 0.150505 s |
| recursion_eval | 0.689516 s |
| scale_coeffs | 0.067712 s |
| to_rou_evals | 0.108094 s |

## Poly Operation Details (by variable)

| operation | module | variable | time | dims |
| --- | --- | --- | --- | --- |
| add | prove4 | RXY | 0.013351 s | R=4096x256 |
| add | prove4 | RXY_terms | 0.011100 s | m_i_s_max=4096x256 |
| add | prove4 | R_minus_eval | 0.007721 s | R=4096x256 |
| add | prove4 | g_minus_f | 0.002445 s | gXY=4096x256 |
| combine | prove4 | LHS_for_copy | 0.135588 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk1 | 1.727422 s | m_i_s_max=4096x256 |
| combine | prove4 | LHS_zk2 | 1.277832 s | m_i_s_max=4096x256 |
| combine | prove4 | Pi_A | 0.174114 s | uXY=4096x256 |
| combine | prove4 | V | 0.026995 s | vXY=4096x256 |
| combine | prove4 | fXY | 0.014550 s | bXY=4096x256 |
| combine | prove4 | gXY | 0.008970 s | bXY=4096x256 |
| combine | prove4 | pC | 0.090173 s | m_i_s_max=4096x256 |
| combine | prove4 | term5 | 0.009092 s | gXY=4096x256 |
| combine | prove4 | term6 | 0.009379 s | gXY=4096x256 |
| combine | prove4 | term9 | 0.001414 s | rB=4096x256 |
| combine | prove4 | term_B_zk | 0.021451 s | rB=4096x256 |
| div_by_ruffini | prove4 | M | 0.316986 s | R=4096x256 |
| div_by_ruffini | prove4 | N | 0.311128 s | R=4096x256 |
| div_by_ruffini | prove4 | Pi_A | 0.484335 s | pA_XY=4096x256 |
| div_by_ruffini | prove4 | Pi_B | 0.002066 s | a_free_X=128x1 |
| div_by_ruffini | prove4 | Pi_C | 0.474194 s | LHS_for_copy=4096x256 |
| div_by_vanishing_opt | prove0 | q0q1 | 2.931377 s | p0XY=4096x256, vanishing=4096x256 |
| div_by_vanishing_opt | prove2 | qCXqCY | 8.705246 s | p_comb=4096x256, vanishing=4096x256 |
| eval | prove3 | R | 0.374586 s | R=4096x256 |
| eval | prove3 | R_omegaX | 0.374329 s | R_omegaX=4096x256 |
| eval | prove3 | R_omegaX_omegaY | 0.377811 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | K0 | 0.000990 s | K0=4096x1 |
| eval | prove4 | R | 0.153947 s | R=4096x256 |
| eval | prove4 | R_omegaX | 0.153350 s | R_omegaX=4096x256 |
| eval | prove4 | R_omegaX_omegaY | 0.162671 s | R_omegaX_omegaY=4096x256 |
| eval | prove4 | r_D1 | 0.157806 s | R=4096x256 |
| eval | prove4 | r_D2 | 0.155170 s | R=4096x256 |
| eval | prove4 | t_n | 0.001198 s | t_n=8192x1 |
| eval | prove4 | t_smax | 0.243969 s | t_smax=1x512 |
| eval | prove4 | vXY | 0.159929 s | vXY=4096x256 |
| from_rou_evals | prove1 | rXY | 0.048145 s | rXY_evals=1048576, grid=4096x256 |
| from_rou_evals | prove2 | K | 0.002121 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | K0 | 0.002143 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove2 | L | 0.001091 s | l_evals=256, grid=1x256 |
| from_rou_evals | prove4 | K | 0.001976 s | k_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | K0 | 0.001923 s | k0_evals=4096, grid=4096x1 |
| from_rou_evals | prove4 | L | 0.000957 s | l_evals=256, grid=1x256 |
| mul | prove4 | KL | 0.145680 s | K=4096x1, L=1x256 |
| mul | prove4 | RXY_t_mi | 0.000725 s | t_mi=8192x1 |
| mul | prove4 | RXY_t_smax | 0.000623 s | t_smax=1x512 |
| mul | prove4 | term10 | 0.003477 s | gXY=4096x256 |
| recursion_eval | prove1 | rXY | 0.689516 s | fXY_evals=1048576, gXY_evals=1048576, grid=4096x256 |
| scale_coeffs | prove2 | r_omegaX | 0.007311 s | rXY=4096x256 |
| scale_coeffs | prove2 | r_omegaX_omegaY | 0.007172 s | r_omegaX=4096x256 |
| scale_coeffs | prove3 | R_omegaX | 0.017422 s | R=4096x256 |
| scale_coeffs | prove3 | R_omegaX_omegaY | 0.023483 s | R_omegaX=4096x256 |
| scale_coeffs | prove4 | r_omegaX | 0.005520 s | R=4096x256 |
| scale_coeffs | prove4 | r_omegaX_omegaY | 0.006804 s | R_omegaX=4096x256 |
| to_rou_evals | prove1 | fXY | 0.045166 s | fXY=4096x256 |
| to_rou_evals | prove1 | gXY | 0.062928 s | gXY=4096x256 |

## Encode Details (by variable)

| module | variable | time | dims |
| --- | --- | --- | --- |
| prove0 | B | 1.174320 s | B=4096x256 |
| prove0 | Q_AX | 2.373462 s | Q_AX=8192x512 |
| prove0 | Q_AY | 1.226051 s | Q_AY=4096x512 |
| prove0 | U | 1.511568 s | U=4096x256 |
| prove0 | V | 1.173038 s | V=4096x256 |
| prove0 | W | 1.191883 s | W=4096x256 |
| prove1 | R | 1.200994 s | R=4096x256 |
| prove2 | Q_CX | 4.599052 s | Q_CX=16384x512 |
| prove2 | Q_CY | 2.394707 s | Q_CY=4096x512 |
| prove4 | M_X | 1.227352 s | M_X=4096x256 |
| prove4 | M_Y | 0.002004 s | M_Y=4096x256 |
| prove4 | N_X | 1.159373 s | N_X=4096x256 |
| prove4 | N_Y | 0.001879 s | N_Y=4096x256 |
| prove4 | Pi_AX | 2.576843 s | Pi_AX=4096x256 |
| prove4 | Pi_AY | 0.002186 s | Pi_AY=4096x256 |
| prove4 | Pi_B | 0.002062 s | a_free_X=128x1 |
| prove4 | Pi_CX | 4.472806 s | Pi_CX=4096x256 |
| prove4 | Pi_CY | 0.002253 s | Pi_CY=4096x256 |
