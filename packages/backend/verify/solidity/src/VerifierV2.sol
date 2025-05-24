// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IVerifier} from "./interface/IVerifier.sol";

/* solhint-disable max-line-length */
/// @author Project Ooo team
/// @dev It uses a custom memory layout inside the inline assembly block. Each reserved memory cell is declared in the
/// constants below.
/// @dev For a better understanding of the verifier algorithm please refer to the following paper:
/// * Original Tokamak zkEVM Paper: https://eprint.iacr.org/2024/507.pdf
/// The notation used in the code is the same as in the papers.
/* solhint-enable max-line-length */
contract VerifierV2 is IVerifier {


    /*//////////////////////////////////////////////////////////////
                                  Proof
    //////////////////////////////////////////////////////////////*/

    /// The encoding order of the `proof` (part1) is
    /// ```
    /// |        704 bytes        |   
    /// | Polynomial commitments  |  
    /// ```  

    /// The encoding order of the `proof` (part2) is
    /// ```
    /// |        1408 bytes       |   32 bytes  |   32 bytes   |   32 bytes  |   32 bytes  |   X bytes   |  
    /// | Polynomial commitments  |   R_{x,y}   |   R'_{x,y}   |   R''_{x,y} |   V_{x,y}   |      a      |
    /// ```  

    // [s^{(0)}(x,y)]_1
    uint256 internal constant PUBLIC_INPUTS_S_0_X_SLOT_PART1 = 0x200 + 0x040;
    uint256 internal constant PUBLIC_INPUTS_S_0_X_SLOT_PART2 = 0x200 + 0x060;
    uint256 internal constant PUBLIC_INPUTS_S_0_Y_SLOT_PART1 = 0x200 + 0x080;
    uint256 internal constant PUBLIC_INPUTS_S_0_Y_SLOT_PART2 = 0x200 + 0x0a0;

    // [s^{(1)}(x,y)]_1
    uint256 internal constant PUBLIC_INPUTS_S_1_X_SLOT_PART1 = 0x200 + 0x0c0;
    uint256 internal constant PUBLIC_INPUTS_S_1_X_SLOT_PART2 = 0x200 + 0x0e0;
    uint256 internal constant PUBLIC_INPUTS_S_1_Y_SLOT_PART1 = 0x200 + 0x100;
    uint256 internal constant PUBLIC_INPUTS_S_1_Y_SLOT_PART2 = 0x200 + 0x120;

    // U
    uint256 internal constant PROOF_POLY_U_X_SLOT_PART1 = 0x200 + 0x120 + 0x020;
    uint256 internal constant PROOF_POLY_U_X_SLOT_PART2 = 0x200 + 0x120 + 0x040;
    uint256 internal constant PROOF_POLY_U_Y_SLOT_PART1 = 0x200 + 0x120 + 0x060;
    uint256 internal constant PROOF_POLY_U_Y_SLOT_PART2 = 0x200 + 0x120 + 0x080;
    // V
    uint256 internal constant PROOF_POLY_V_X_SLOT_PART1 = 0x200 + 0x120 + 0x0a0;
    uint256 internal constant PROOF_POLY_V_X_SLOT_PART2 = 0x200 + 0x120 + 0x0c0;
    uint256 internal constant PROOF_POLY_V_Y_SLOT_PART1 = 0x200 + 0x120 + 0x0e0;
    uint256 internal constant PROOF_POLY_V_Y_SLOT_PART2 = 0x200 + 0x120 + 0x100;
    // W
    uint256 internal constant PROOF_POLY_W_X_SLOT_PART1 = 0x200 + 0x120 + 0x120;
    uint256 internal constant PROOF_POLY_W_X_SLOT_PART2 = 0x200 + 0x120 + 0x140;
    uint256 internal constant PROOF_POLY_W_Y_SLOT_PART1 = 0x200 + 0x120 + 0x160;
    uint256 internal constant PROOF_POLY_W_Y_SLOT_PART2 = 0x200 + 0x120 + 0x180;
    // O_mid
    uint256 internal constant PROOF_POLY_OMID_X_SLOT_PART1 = 0x200 + 0x120 + 0x1a0;
    uint256 internal constant PROOF_POLY_OMID_X_SLOT_PART2 = 0x200 + 0x120 + 0x1c0;
    uint256 internal constant PROOF_POLY_OMID_Y_SLOT_PART1 = 0x200 + 0x120 + 0x1e0;
    uint256 internal constant PROOF_POLY_OMID_Y_SLOT_PART2 = 0x200 + 0x120 + 0x200;
    // O_prv
    uint256 internal constant PROOF_POLY_OPRV_X_SLOT_PART1 = 0x200 + 0x120 + 0x220;
    uint256 internal constant PROOF_POLY_OPRV_X_SLOT_PART2 = 0x200 + 0x120 + 0x240;
    uint256 internal constant PROOF_POLY_OPRV_Y_SLOT_PART1 = 0x200 + 0x120 + 0x260;
    uint256 internal constant PROOF_POLY_OPRV_Y_SLOT_PART2 = 0x200 + 0x120 + 0x280;
    // Q_{AX}
    uint256 internal constant PROOF_POLY_QAX_X_SLOT_PART1 = 0x200 + 0x120 + 0x2a0;
    uint256 internal constant PROOF_POLY_QAX_X_SLOT_PART2 = 0x200 + 0x120 + 0x2c0;
    uint256 internal constant PROOF_POLY_QAX_Y_SLOT_PART1 = 0x200 + 0x120 + 0x2e0;
    uint256 internal constant PROOF_POLY_QAX_Y_SLOT_PART2 = 0x200 + 0x120 + 0x300;
    // Q_{AY}
    uint256 internal constant PROOF_POLY_QAY_X_SLOT_PART1 = 0x200 + 0x120 + 0x320;
    uint256 internal constant PROOF_POLY_QAY_X_SLOT_PART2 = 0x200 + 0x120 + 0x340;
    uint256 internal constant PROOF_POLY_QAY_Y_SLOT_PART1 = 0x200 + 0x120 + 0x360;
    uint256 internal constant PROOF_POLY_QAY_Y_SLOT_PART2 = 0x200 + 0x120 + 0x380;
    // Q_{CX}
    uint256 internal constant PROOF_POLY_QCX_X_SLOT_PART1 = 0x200 + 0x120 + 0x3a0;
    uint256 internal constant PROOF_POLY_QCX_X_SLOT_PART2 = 0x200 + 0x120 + 0x3c0;
    uint256 internal constant PROOF_POLY_QCX_Y_SLOT_PART1 = 0x200 + 0x120 + 0x3e0;
    uint256 internal constant PROOF_POLY_QCX_Y_SLOT_PART2 = 0x200 + 0x120 + 0x400;
    // Q_{CY}
    uint256 internal constant PROOF_POLY_QCY_X_SLOT_PART1 = 0x200 + 0x120 + 0x420;
    uint256 internal constant PROOF_POLY_QCY_X_SLOT_PART2 = 0x200 + 0x120 + 0x440;
    uint256 internal constant PROOF_POLY_QCY_Y_SLOT_PART1 = 0x200 + 0x120 + 0x460;
    uint256 internal constant PROOF_POLY_QCY_Y_SLOT_PART2 = 0x200 + 0x120 + 0x480;
    // Π_{χ}
    uint256 internal constant PROOF_POLY_PI_CHI_X_SLOT_PART1 = 0x200 + 0x120 + 0x4a0;
    uint256 internal constant PROOF_POLY_PI_CHI_X_SLOT_PART2 = 0x200 + 0x120 + 0x4c0;
    uint256 internal constant PROOF_POLY_PI_CHI_Y_SLOT_PART1 = 0x200 + 0x120 + 0x4e0;
    uint256 internal constant PROOF_POLY_PI_CHI_Y_SLOT_PART2 = 0x200 + 0x120 + 0x500;
    // Π{ζ}
    uint256 internal constant PROOF_POLY_PI_ZETA_X_SLOT_PART1 = 0x200 + 0x120 + 0x520;
    uint256 internal constant PROOF_POLY_PI_ZETA_X_SLOT_PART2 = 0x200 + 0x120 + 0x540;
    uint256 internal constant PROOF_POLY_PI_ZETA_Y_SLOT_PART1 = 0x200 + 0x120 + 0x560;
    uint256 internal constant PROOF_POLY_PI_ZETA_Y_SLOT_PART2 = 0x200 + 0x120 + 0x580;
    // B
    uint256 internal constant PROOF_POLY_B_X_SLOT_PART1 = 0x200 + 0x120 + 0x5a0;
    uint256 internal constant PROOF_POLY_B_X_SLOT_PART2 = 0x200 + 0x120 + 0x5c0;
    uint256 internal constant PROOF_POLY_B_Y_SLOT_PART1 = 0x200 + 0x120 + 0x5e0;
    uint256 internal constant PROOF_POLY_B_Y_SLOT_PART2 = 0x200 + 0x120 + 0x600;
    // R
    uint256 internal constant PROOF_POLY_R_X_SLOT_PART1 = 0x200 + 0x120 + 0x620;
    uint256 internal constant PROOF_POLY_R_X_SLOT_PART2 = 0x200 + 0x120 + 0x640;
    uint256 internal constant PROOF_POLY_R_Y_SLOT_PART1 = 0x200 + 0x120 + 0x660;
    uint256 internal constant PROOF_POLY_R_Y_SLOT_PART2 = 0x200 + 0x120 + 0x680;
    // M_ζ
    uint256 internal constant PROOF_POLY_M_ZETA_X_SLOT_PART1 = 0x200 + 0x120 + 0x6a0;
    uint256 internal constant PROOF_POLY_M_ZETA_X_SLOT_PART2 = 0x200 + 0x120 + 0x6c0;
    uint256 internal constant PROOF_POLY_M_ZETA_Y_SLOT_PART1 = 0x200 + 0x120 + 0x6e0;
    uint256 internal constant PROOF_POLY_M_ZETA_Y_SLOT_PART2 = 0x200 + 0x120 + 0x700;
    // M_χ
    uint256 internal constant PROOF_POLY_M_CHI_X_SLOT_PART1 = 0x200 + 0x120 + 0x720;
    uint256 internal constant PROOF_POLY_M_CHI_X_SLOT_PART2 = 0x200 + 0x120 + 0x740;
    uint256 internal constant PROOF_POLY_M_CHI_Y_SLOT_PART1 = 0x200 + 0x120 + 0x760;
    uint256 internal constant PROOF_POLY_M_CHI_Y_SLOT_PART2 = 0x200 + 0x120 + 0x780;
    // N_ζ
    uint256 internal constant PROOF_POLY_N_ZETA_X_SLOT_PART1 = 0x200 + 0x120 + 0x7a0;
    uint256 internal constant PROOF_POLY_N_ZETA_X_SLOT_PART2 = 0x200 + 0x120 + 0x7c0;
    uint256 internal constant PROOF_POLY_N_ZETA_Y_SLOT_PART1 = 0x200 + 0x120 + 0x7e0;
    uint256 internal constant PROOF_POLY_N_ZETA_Y_SLOT_PART2 = 0x200 + 0x120 + 0x800;
    // N_χ
    uint256 internal constant PROOF_POLY_N_CHI_X_SLOT_PART1 = 0x200 + 0x120 + 0x820;
    uint256 internal constant PROOF_POLY_N_CHI_X_SLOT_PART2 = 0x200 + 0x120 + 0x840;
    uint256 internal constant PROOF_POLY_N_CHI_Y_SLOT_PART1 = 0x200 + 0x120 + 0x860;
    uint256 internal constant PROOF_POLY_N_CHI_Y_SLOT_PART2 = 0x200 + 0x120 + 0x880;
    // O_pub
    uint256 internal constant PROOF_POLY_OPUB_X_SLOT_PART1 = 0x200 + 0x120 + 0x8a0;
    uint256 internal constant PROOF_POLY_OPUB_X_SLOT_PART2 = 0x200 + 0x120 + 0x8c0;
    uint256 internal constant PROOF_POLY_OPUB_Y_SLOT_PART1 = 0x200 + 0x120 + 0x8e0;
    uint256 internal constant PROOF_POLY_OPUB_Y_SLOT_PART2 = 0x200 + 0x120 + 0x900;
    // A
    uint256 internal constant PROOF_POLY_A_X_SLOT_PART1 = 0x200 + 0x120 + 0x920;
    uint256 internal constant PROOF_POLY_A_X_SLOT_PART2 = 0x200 + 0x120 + 0x940;
    uint256 internal constant PROOF_POLY_A_Y_SLOT_PART1 = 0x200 + 0x120 + 0x960;
    uint256 internal constant PROOF_POLY_A_Y_SLOT_PART2 = 0x200 + 0x120 + 0x980;
    // R_xy
    uint256 internal constant PROOF_R1XY_SLOT = 0x200 + 0x120 + 0x9a0;
    // R'_xy
    uint256 internal constant PROOF_R2XY_SLOT = 0x200 + 0x120 + 0x9c0;
    // R''_xy
    uint256 internal constant PROOF_R3XY_SLOT = 0x200 + 0x120 + 0x9e0;
    // V_xy
    uint256 internal constant PROOF_VXY_SLOT = 0x200 + 0x120 + 0xa00;


    /*//////////////////////////////////////////////////////////////
            transcript slot (used for challenge computation)
    //////////////////////////////////////////////////////////////*/

    uint256 internal constant TRANSCRIPT_BEGIN_SLOT = 0x200 + 0x120 + 0xa20 + 0x00;
    uint256 internal constant TRANSCRIPT_DST_BYTE_SLOT = 0x200 + 0x120 + 0xa20 + 0x03; 
    uint256 internal constant TRANSCRIPT_STATE_0_SLOT = 0x200 + 0x120 + 0xa20 + 0x04;
    uint256 internal constant TRANSCRIPT_STATE_1_SLOT = 0x200 + 0x120 + 0xa20 + 0x24;
    uint256 internal constant TRANSCRIPT_CHALLENGE_SLOT = 0x200 + 0x120 + 0xa20 + 0x44;

    /*//////////////////////////////////////////////////////////////
                             Challenges
    //////////////////////////////////////////////////////////////*/

    uint256 internal constant CHALLENGE_THETA_0_SLOT = 0x200 + 0x120 + 0xa20 + 0x80 + 0x000;
    uint256 internal constant CHALLENGE_THETA_1_SLOT = 0x200 + 0x120 + 0xa20 + 0x80 + 0x020;
    uint256 internal constant CHALLENGE_THETA_2_SLOT = 0x200 + 0x120 + 0xa20 + 0x80 +0x040;
    uint256 internal constant CHALLENGE_KAPPA_0_SLOT = 0x200 + 0x120 + 0xa20 + 0x80 +0x060;
    uint256 internal constant CHALLENGE_KAPPA_1_SLOT = 0x200 + 0x120 + 0xa20 + 0x80 +0x080;
    uint256 internal constant CHALLENGE_KAPPA_2_SLOT = 0x200 + 0x120 + 0xa20 + 0x80 +0x0a0;
    uint256 internal constant CHALLENGE_ZETA_SLOT = 0x200 + 0x120 + 0xa20 + 0x80 +0x0c0;
    uint256 internal constant CHALLENGE_XI_SLOT = 0x200 + 0x120 + 0xa20 + 0x80 +0x0e0;
    uint256 internal constant CHALLENGE_CHI_SLOT = 0x200 + 0x120 + 0xa20 +0x80 + 0x100;

    /*//////////////////////////////////////////////////////////////
                       Intermediary verifier state
    //////////////////////////////////////////////////////////////*/

    // [F]_1
    uint256 internal constant INTERMERDIARY_POLY_F_X_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 +0x100 + 0x020;
    uint256 internal constant INTERMERDIARY_POLY_F_X_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 +0x100 + 0x040;
    uint256 internal constant INTERMERDIARY_POLY_F_Y_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 +0x100 + 0x060;
    uint256 internal constant INTERMERDIARY_POLY_F_Y_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 +0x100 + 0x080;

    // [G]_1
    uint256 internal constant INTERMERDIARY_POLY_G_X_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 +0x100 + 0x0a0;
    uint256 internal constant INTERMERDIARY_POLY_G_X_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x0c0;
    uint256 internal constant INTERMERDIARY_POLY_G_Y_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x0e0;
    uint256 internal constant INTERMERDIARY_POLY_G_Y_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x100;

    // t_n(χ)
    uint256 internal constant INTERMERDIARY_SCALAR_T_N_CHI_SLOT = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x120;
    // t_smax(ζ)
    uint256 internal constant INTERMERDIARY_SCALAR_T_SMAX_ZETA_SLOT = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x140;
    // t_ml(χ)
    uint256 internal constant INTERMERDIARY_SCALAR_T_MI_CHI_SLOT = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x160;
    // K_0(χ)
    uint256 internal constant INTERMEDIARY_SCALAR_KO_SLOT = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x180;
    // A_pub
    uint256 internal constant INTERMEDIARY_SCALAR_APUB_SLOT = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0;

    /*//////////////////////////////////////////////////////////////
                             Aggregated commitment
    //////////////////////////////////////////////////////////////*/

    uint256 internal constant AGG_LHS_A_X_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x020;
    uint256 internal constant AGG_LHS_A_X_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x040;
    uint256 internal constant AGG_LHS_A_Y_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x060;
    uint256 internal constant AGG_LHS_A_Y_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x080; 

    uint256 internal constant AGG_LHS_B_X_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x0a0;
    uint256 internal constant AGG_LHS_B_X_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x0c0;
    uint256 internal constant AGG_LHS_B_Y_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x0e0;
    uint256 internal constant AGG_LHS_B_Y_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x100;

    uint256 internal constant AGG_LHS_C_X_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x120;
    uint256 internal constant AGG_LHS_C_X_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x140;
    uint256 internal constant AGG_LHS_C_Y_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x160;
    uint256 internal constant AGG_LHS_C_Y_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x180;

    uint256 internal constant PAIRING_AGG_LHS_X_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x1a0;
    uint256 internal constant PAIRING_AGG_LHS_X_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x1c0;
    uint256 internal constant PAIRING_AGG_LHS_Y_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x1e0;
    uint256 internal constant PAIRING_AGG_LHS_Y_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x200;

    uint256 internal constant PAIRING_AGG_AUX_X_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x220;
    uint256 internal constant PAIRING_AGG_AUX_X_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x240;
    uint256 internal constant PAIRING_AGG_AUX_Y_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x260;
    uint256 internal constant PAIRING_AGG_AUX_Y_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x280;

    uint256 internal constant PAIRING_AGG_LHS_AUX_X_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x2a0;
    uint256 internal constant PAIRING_AGG_LHS_AUX_X_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x2c0;
    uint256 internal constant PAIRING_AGG_LHS_AUX_Y_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x2e0;
    uint256 internal constant PAIRING_AGG_LHS_AUX_Y_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x300;

    uint256 internal constant PAIRING_AGG_RHS_1_X_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x320;
    uint256 internal constant PAIRING_AGG_RHS_1_X_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x340;
    uint256 internal constant PAIRING_AGG_RHS_1_Y_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x360;
    uint256 internal constant PAIRING_AGG_RHS_1_Y_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x380;

    uint256 internal constant PAIRING_AGG_RHS_2_X_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x3a0;
    uint256 internal constant PAIRING_AGG_RHS_2_X_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x3c0;
    uint256 internal constant PAIRING_AGG_RHS_2_Y_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x3e0;
    uint256 internal constant PAIRING_AGG_RHS_2_Y_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x400;

    /*//////////////////////////////////////////////////////////////
                             Pairing data
    //////////////////////////////////////////////////////////////*/

    uint256 internal constant BUFFER_AGGREGATED_POLY_X_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x420;
    uint256 internal constant BUFFER_AGGREGATED_POLY_X_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x440;
    uint256 internal constant BUFFER_AGGREGATED_POLY_Y_SLOT_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x460;
    uint256 internal constant BUFFER_AGGREGATED_POLY_Y_SLOT_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480;

    /*//////////////////////////////////////////////////////////////
                        Verification keys
    //////////////////////////////////////////////////////////////*/

    // [K^_1(X)L^-1(X)]_1
    uint256 internal constant VK_POLY_KXLX_X_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x020;
    uint256 internal constant VK_POLY_KXLX_X_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x040;
    uint256 internal constant VK_POLY_KXLX_Y_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x060;
    uint256 internal constant VK_POLY_KXLX_Y_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x080;

    // [x]_1
    uint256 internal constant VK_POLY_X_X_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x0a0;
    uint256 internal constant VK_POLY_X_X_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x0c0;
    uint256 internal constant VK_POLY_X_Y_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x0e0;
    uint256 internal constant VK_POLY_X_Y_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x100;

    // [y]_1
    uint256 internal constant VK_POLY_Y_X_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x120;
    uint256 internal constant VK_POLY_Y_X_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x140;
    uint256 internal constant VK_POLY_Y_Y_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x160;
    uint256 internal constant VK_POLY_Y_Y_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x180;

    // [1]_1
    uint256 internal constant VK_IDENTITY_X_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x1a0;
    uint256 internal constant VK_IDENTITY_X_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x1c0;
    uint256 internal constant VK_IDENTITY_Y_PART1 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x1e0;
    uint256 internal constant VK_IDENTITY_Y_PART2 = 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x200;

    /*//////////////////////////////////////////////////////////////
                             Constants
    //////////////////////////////////////////////////////////////*/

    // Scalar field size
    // Q_MOD is the base field modulus (48 bytes long). To fit with the EVM, we sliced it into two 32bytes variables => 16 first bytes are zeros        
    uint256 internal constant Q_MOD_PART1 = 0x000000000000000000000000000000001a0111ea397fe69a4b1ba7b6434bacd7;
    uint256 internal constant Q_MOD_PART2 = 0x64774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab;
    // R_MOD is the main subgroup order 
    uint256 internal constant R_MOD = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001;

    /// @dev flip of 0xe000000000000000000000000000000000000000000000000000000000000000;
    uint256 internal constant FR_MASK = 0x1fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    // n 
    uint256 internal constant CONSTANT_N = 2048;
    // ω_n
    uint256 internal constant CONSTANT_OMEGA_N = 0x43527a8bca252472eb674a1a620890d7a534af14b61e0abe74a1f6718c130477;
    // ω_32
    uint256 internal constant OMEGA_32 = 0x476fa2fb6162ffabd84f8612c8b6cc00bd7fdf9c77487ae79733f3a6ba60eaa6;
    // s_max
    uint256 internal constant CONSTANT_SMAX = 64;
    // m_i
    uint256 internal constant CONSTANT_MI = 256;
    // l
    uint256 internal constant CONSTANT_L = 288;


    // ω_{m_i}^{-1}
    uint256 internal constant OMEGA_MI_MINUS_1 = 0x2e95da59a33dcbf232a732ae1a3b0aef752c84f3154125602cabadec2fe322b8;

    // ω_smax^{-1}
    uint256 internal constant OMEGA_SMAX_MINUS_1 = 0x0e4840ac57f86f5e293b1d67bc8de5d9a12a70a615d0b8e4d2fc5e69ac5db47f;


    /*//////////////////////////////////////////////////////////////
                        G2 elements
    //////////////////////////////////////////////////////////////*/

    // G2 Points for zkEVM Verifier (BLS12-381) - Standard Naming Convention
    // Each point uses 8 uint256 slots (256 bytes total)
    // Format: X0_PART1, X0_PART2, X1_PART1, X1_PART2, Y0_PART1, Y0_PART2, Y1_PART1, Y1_PART2

    // [1]_2 (Identity/Generator point H)
    uint256 internal constant IDENTITY2_X0_PART1 = 0x00000000000000000000000000000000186ccda76f1249a02d72fbd64e9b5de9;
    uint256 internal constant IDENTITY2_X0_PART2 = 0x77042778e751ad03535cde4725e063319b30708b1ba330733bf329e866887a7d;
    uint256 internal constant IDENTITY2_X1_PART1 = 0x00000000000000000000000000000000063896896dd55e36386d4dc7361df734;
    uint256 internal constant IDENTITY2_X1_PART2 = 0xdfb5a481c12841e8210929394983fb6f0925e82eca41f20d135911d362edcdac;
    uint256 internal constant IDENTITY2_Y0_PART1 = 0x0000000000000000000000000000000012926a2378e6ae41e5e975eecc61018a;
    uint256 internal constant IDENTITY2_Y0_PART2 = 0x884c8baf629a1bd9d62a0e4b1c88a0c3ee9dbb3859610b34a72b5298d46fb58d;
    uint256 internal constant IDENTITY2_Y1_PART1 = 0x00000000000000000000000000000000072d8b55b3e44f545069550d3af27bbb;
    uint256 internal constant IDENTITY2_Y1_PART2 = 0x81ace903f37d58f6489a8015659804bcc1a0bceb476815b2a1a4ab68297e3bc3;

    // [α]_2
    uint256 internal constant ALPHA_X0_PART1 = 0x000000000000000000000000000000000eb6438f9c17fcc815bb06d0580fc565;
    uint256 internal constant ALPHA_X0_PART2 = 0x63b8ffcd0a291a03d0588b9f9304870a8cecad6ce4cf6520df0aa2ec28cfef59;
    uint256 internal constant ALPHA_X1_PART1 = 0x000000000000000000000000000000000f73b280ae0c875d29c1052979ea5fb8;
    uint256 internal constant ALPHA_X1_PART2 = 0xb944c52a4cad23506861822f0382db1e1ecdf18fcb6f825837714508736a9c50;
    uint256 internal constant ALPHA_Y0_PART1 = 0x00000000000000000000000000000000084bc446f32d46fc9a79b286f3d0b64d;
    uint256 internal constant ALPHA_Y0_PART2 = 0xb2728798119ed13e08526e22f6b8a0b342c5a24b89c68ebd3c54a97e1007e5db;
    uint256 internal constant ALPHA_Y1_PART1 = 0x000000000000000000000000000000000bb876c872d806c3585da18d2d62c1bd;
    uint256 internal constant ALPHA_Y1_PART2 = 0xf52b272348c57b1cb84cc5f134b606ec5eb94f2997683969bab9d440b364dced;

    // [α^2]_2
    uint256 internal constant ALPHA_POWER2_X0_PART1 = 0x00000000000000000000000000000000039cf61db4a3ca2d28eb14589170d865;
    uint256 internal constant ALPHA_POWER2_X0_PART2 = 0x98814d6d6206d295c4f2ae0864fea3d7bdfb694fcdd23ef60774a02e372b1d9e;
    uint256 internal constant ALPHA_POWER2_X1_PART1 = 0x00000000000000000000000000000000153d7b93fa701207c119d878e299d40e;
    uint256 internal constant ALPHA_POWER2_X1_PART2 = 0x686803a2f7afe386615974b842cbe1d0b270310c4dffb540e3c4336d9d6aaf2b;
    uint256 internal constant ALPHA_POWER2_Y0_PART1 = 0x0000000000000000000000000000000013a5dd2d215e683e963e533b157e780d;
    uint256 internal constant ALPHA_POWER2_Y0_PART2 = 0xab50d7a83edd41201b95f2218907cf10a93ad128bd78bb3cd1ee7be87349b2d4;
    uint256 internal constant ALPHA_POWER2_Y1_PART1 = 0x000000000000000000000000000000000844969243d290285d5ded5b70d5e98b;
    uint256 internal constant ALPHA_POWER2_Y1_PART2 = 0x15d3a1133b59faf76656ac9fde0e6167f150b44d481fae7c06473ed7258d5620;

    // [α^3]_2
    uint256 internal constant ALPHA_POWER3_X0_PART1 = 0x0000000000000000000000000000000019c0b9f04e922de759faeee7a7ceafd2;
    uint256 internal constant ALPHA_POWER3_X0_PART2 = 0x3a0487525a40730e41c693d4c1cbc256534e77bf4b4c826145ed88c68adca7c1;
    uint256 internal constant ALPHA_POWER3_X1_PART1 = 0x00000000000000000000000000000000152bacf1a299e3bc4adfaeaa803b9b2a;
    uint256 internal constant ALPHA_POWER3_X1_PART2 = 0x1dba5be9f6a098bf1c4d83efedbaa6cd058942cda6d82b096f4f689a932e6774;
    uint256 internal constant ALPHA_POWER3_Y0_PART1 = 0x0000000000000000000000000000000010300103c92adc1deac0f0003ada2f53;
    uint256 internal constant ALPHA_POWER3_Y0_PART2 = 0x92f75f99f9f879416f9acfb407f97174d96a58568df638c5765dc1ee290df484;
    uint256 internal constant ALPHA_POWER3_Y1_PART1 = 0x0000000000000000000000000000000015aaa2131a34a5b78b7590c983bd2cd1;
    uint256 internal constant ALPHA_POWER3_Y1_PART2 = 0xc81da070ab24c80c36ea05c8cbf46f324d7ca9eeda0b5d8cde1d219a73052d2f;

    // [α^4]_2
    uint256 internal constant ALPHA_POWER4_X0_PART1 = 0x00000000000000000000000000000000103059743a9f143b32a4e266211c3818;
    uint256 internal constant ALPHA_POWER4_X0_PART2 = 0xa80441b4dc2ec8ac79b118323b7d687b336b69365f1410528592d7312d561858;
    uint256 internal constant ALPHA_POWER4_X1_PART1 = 0x000000000000000000000000000000000ed1177a0deac59ebb6c5a85141e56e0;
    uint256 internal constant ALPHA_POWER4_X1_PART2 = 0x15b4fdf5cb6b2f4dbfa97371aa5e2b9d6ed06e6ee0c4cf4d71386401a02e88ee;
    uint256 internal constant ALPHA_POWER4_Y0_PART1 = 0x000000000000000000000000000000000f93d2de735689a98a8aae5b6d7caa8a;
    uint256 internal constant ALPHA_POWER4_Y0_PART2 = 0x2bd79fd47ecb05d731f4ce234b55ff61fbdfae3c5b2dbb04474b076a4c46c922;
    uint256 internal constant ALPHA_POWER4_Y1_PART1 = 0x0000000000000000000000000000000008e86c0c319cb2368bf691d1b0f0f565;
    uint256 internal constant ALPHA_POWER4_Y1_PART2 = 0x42de7d390928a284e5ff35c390bed00ab6cb0197de1bacbf30dfb7b0a0774cd5;

    // -[γ]_2
    uint256 internal constant GAMMA_X0_PART1 = 0x0000000000000000000000000000000005f9073082025f423e1e7185f68ecd58;
    uint256 internal constant GAMMA_X0_PART2 = 0x71a4a7aaa8c23c96b330f62974a7fe2313fae5371734b473352ef7514703b9c6;
    uint256 internal constant GAMMA_X1_PART1 = 0x0000000000000000000000000000000000cba5ea303e6dd9f117839358d3c0fb;
    uint256 internal constant GAMMA_X1_PART2 = 0x4d2e4593f3ab2af10c2f8c0460b3a8fbb91ca1d237b64aafe67e80560c9e6029;
    uint256 internal constant GAMMA_MINUS_Y0_PART1 = 0x000000000000000000000000000000000f94aa0ea533159a4ee98f05e114c32d;
    uint256 internal constant GAMMA_MINUS_Y0_PART2 = 0x23f5bb3af98cd95c3f437300749859e27c433037ac8c8506adf7f2d603d884b7;
    uint256 internal constant GAMMA_MINUS_Y1_PART1 = 0x0000000000000000000000000000000015a8ccba6d8b42fcdec1ea25fd0bb289;
    uint256 internal constant GAMMA_MINUS_Y1_PART2 = 0x4f4ac7b63e0adec31854450f8a50577e996f95958a20f3cec59609c58c6a01f1;

    // -[δ]_2
    uint256 internal constant DELTA_X0_PART1 = 0x000000000000000000000000000000000076963b9cfdab74a641e20be964d46f;
    uint256 internal constant DELTA_X0_PART2 = 0xfc568b5b230f524a47d71049fd8d2e8284201bb8e63b41458bf91c2d966cb38b;
    uint256 internal constant DELTA_X1_PART1 = 0x000000000000000000000000000000000198caf7adddde564d071befa0effa30;
    uint256 internal constant DELTA_X1_PART2 = 0x214ef8d48d822b4237bcb25ce8b3a1a5671e0e3bf054229ac9831e3e7f9b0ba6;
    uint256 internal constant DELTA_MINUS_Y0_PART1 = 0x0000000000000000000000000000000017fe5e3b56aea2ccba6b99e4877b5f3f;
    uint256 internal constant DELTA_MINUS_Y0_PART2 = 0x56ce4875158b360a4e7bd2794fd3d0f3fa774c466ef59a9233a9e30c37bdbec4;
    uint256 internal constant DELTA_MINUS_Y1_PART1 = 0x0000000000000000000000000000000016e3839e16a03ccb9be1c09436d7ff3b;
    uint256 internal constant DELTA_MINUS_Y1_PART2 = 0xa65b2a89e9c1d0ac0f77cce6ddf4a4d702ac0e9241a708208bdccbd7b9e31124;

    // -[η]_2
    uint256 internal constant ETA_X0_PART1 = 0x000000000000000000000000000000000c1d2609b92b1e8df721d24696130b7b;
    uint256 internal constant ETA_X0_PART2 = 0x85d2ef196bc3a71d29e8faf55f45f7f87e35c74fd5459ca2d6481fcdb8fe34e7;
    uint256 internal constant ETA_X1_PART1 = 0x000000000000000000000000000000000ae3edcfae523cdebc05f459e8212da5;
    uint256 internal constant ETA_X1_PART2 = 0xa90a0e0032014e00e3ebd660b911ec342ac0a8552cfa6dcc6fd1d02951449554;
    uint256 internal constant ETA_MINUS_Y0_PART1 = 0x00000000000000000000000000000000103bb1f4dffe0c0819dc75412beef12e;
    uint256 internal constant ETA_MINUS_Y0_PART2 = 0x68d53c78b76da4464d1513ebe01773baea584c851a55f5d1603cf2aec73307eb;
    uint256 internal constant ETA_MINUS_Y1_PART1 = 0x000000000000000000000000000000000bbf54800f1d02972cc5eb6115172a6f;
    uint256 internal constant ETA_MINUS_Y1_PART2 = 0x68386efa959a78f769c1c56f7b0049ce4acf2099fcfa3083bc38b67407fd95fc;

    // -[x]_2
    uint256 internal constant X_X0_PART1 = 0x0000000000000000000000000000000004c452a00c7ecfa2f9f1d596e92c07f5;
    uint256 internal constant X_X0_PART2 = 0x6442456bdb818f998cc5a42df667c362ac0b1dd3bdcbd656ac0f483dbca5a3fc;
    uint256 internal constant X_X1_PART1 = 0x0000000000000000000000000000000018e7a4f67cd2d9838b30d28aecf7cafd;
    uint256 internal constant X_X1_PART2 = 0x0ec31d7befc7d1e5b5ab284255f7063ef46328b179b403fa3d926e773072263f;
    uint256 internal constant X_MINUS_Y0_PART1 = 0x0000000000000000000000000000000001b018f44c88e74cff55da4f5e7bcb07;
    uint256 internal constant X_MINUS_Y0_PART2 = 0x0ebdba2a94bfa60534a629bd3af9a5a07333511daff12a667fb59c6f99f8154a;
    uint256 internal constant X_MINUS_Y1_PART1 = 0x000000000000000000000000000000000dc83a457d396d146f766e420c9e9f0c;
    uint256 internal constant X_MINUS_Y1_PART2 = 0xbcdd169510d0bba2baa6f93fe305730fd634eade0bd4699dd9d6e121ae5bb9c7;

    // -[y]_2
    uint256 internal constant Y_X0_PART1 = 0x0000000000000000000000000000000009c03e9d6f7293be598fe2bf531b7e41;
    uint256 internal constant Y_X0_PART2 = 0xda2cd4280a5b3cd27fd2459026deafba34fd4214f455c52462aa393d553831c6;
    uint256 internal constant Y_X1_PART1 = 0x0000000000000000000000000000000012d76d6b06ebea8eae71e843c4cdcc8e;
    uint256 internal constant Y_X1_PART2 = 0x2d3db3d1cf4cc4c226ecba9f4190e65ff1e98ae86cd079d50c6b0d66744cdac0;
    uint256 internal constant Y_MINUS_Y0_PART1 = 0x00000000000000000000000000000000058cd64f7f8cc800ab1c5c2a1545410a;
    uint256 internal constant Y_MINUS_Y0_PART2 = 0x0fa34ed15c8fd2d058ee463b197ec28803f805021a25af838c94f29b9bb0f3d6;
    uint256 internal constant Y_MINUS_Y1_PART1 = 0x0000000000000000000000000000000000e1fec1655bfe406f1a92f2be9c17eb;
    uint256 internal constant Y_MINUS_Y1_PART2 = 0x48d3c10278c6c0f81a841b82a9a4c3a492dd2b3827d788cefeeff042d7b501a2;


    /// @notice Load verification keys to memory in runtime.
    /// @dev The constants are loaded into memory in a specific layout declared in the constants starting from
    /// `VK_` prefix.
    /// NOTE: Function may corrupt the memory state if some memory was used before this function was called.
    function _loadVerificationKey() internal pure virtual {
        assembly {
            // preproccessed KL commitment vk         
            mstore(VK_POLY_KXLX_X_PART1, 0x00000000000000000000000000000000189b894a1f85f9873aaab35caa668bdd)
            mstore(VK_POLY_KXLX_X_PART2, 0x89322fe6129835076e76ff196f8f9099acf4431a1614af80f7102fa7d82df894)
            mstore(VK_POLY_KXLX_Y_PART1, 0x0000000000000000000000000000000016dddae1189e9482b202b6f2a80bfe73)
            mstore(VK_POLY_KXLX_Y_PART2, 0x4e68ac0e9db460e6e76daa92d9e1fc5e9876a24d74c6fb749867cd93813b0732)

            // [1]_1 (Generator/Identity point)
            mstore(VK_IDENTITY_X_PART1, 0x000000000000000000000000000000000037ab1f8d39058011b226cb7a60d6a7)
            mstore(VK_IDENTITY_X_PART2, 0x2f1d8a1a2c259fff099953479165488ccfacd45c6988c00f3981853e116af536)
            mstore(VK_IDENTITY_Y_PART1, 0x000000000000000000000000000000001958c0164780dbab949dead073ba57c9)
            mstore(VK_IDENTITY_Y_PART2, 0xcb4e29001562a019fcf224ea64b05cf8219d80a62fcd5083c36a3f64aa562b79)

            // [x]_1 (Polynomial evaluation point)
            mstore(VK_POLY_X_X_PART1, 0x00000000000000000000000000000000134e443b601946d3decf942ef8e25ec5)
            mstore(VK_POLY_X_X_PART2, 0x80979eba4aaa6790cab1988b9ce4dc7d1feed9644187e718cdb3e24490be1482)
            mstore(VK_POLY_X_Y_PART1, 0x0000000000000000000000000000000003fab6eec90bfb32f8d6d4990af3a720)
            mstore(VK_POLY_X_Y_PART2, 0xf96b08bc3c4e5718cec072675d97ec631005f96eb5a2eb820c1e29c98240a31c)

            // [y]_1 (Polynomial evaluation point)
            mstore(VK_POLY_Y_X_PART1, 0x000000000000000000000000000000001324f00c38ca12b35cb9a0d80ca2d319)
            mstore(VK_POLY_Y_X_PART2, 0x53c65107d4a9591f6d7df3f13660901d4f01a364013354ad4df0c6c75329c1b0)
            mstore(VK_POLY_Y_Y_PART1, 0x00000000000000000000000000000000083d2d9d63a7c380303333a1e4e9e945)
            mstore(VK_POLY_Y_Y_PART2, 0x11d455c4bfe4b1db2ff3efc988f10132e0757ae479da6b137435e20a400c77fc)
        }
    }

    function verify(
        uint128[] calldata, //_proof part1 (16 bytes)
        uint256[] calldata, // _proof part2 (32 bytes)
        uint256[] calldata // publicInputs (used for computing A_pub)
    ) public view virtual returns (bytes32 final_result) {
        // No memory was accessed yet, so keys can be loaded into the right place and not corrupt any other memory.
        _loadVerificationKey();

        // Beginning of the big inline assembly block that makes all the verification work.
        // Note: We use the custom memory layout, so the return value should be returned from the assembly, not
        // Solidity code.
        assembly {

            /*//////////////////////////////////////////////////////////////
                                    Utils
            //////////////////////////////////////////////////////////////*/

            /// @dev Reverts execution with a provided revert reason.
            /// @param len The byte length of the error message string, which is expected to be no more than 32.
            /// @param reason The 1-word revert reason string, encoded in ASCII.
            function revertWithMessage(len, reason) {
                // "Error(string)" signature: bytes32(bytes4(keccak256("Error(string)")))
                mstore(0x00, 0x08c379a000000000000000000000000000000000000000000000000000000000)
                // Data offset
                mstore(0x04, 0x0000000000000000000000000000000000000000000000000000000000000020)
                // Length of revert string
                mstore(0x24, len)
                // Revert reason
                mstore(0x44, reason)
                // Revert
                revert(0x00, 0x64)
            }

            /// @dev Performs modular exponentiation using the formula (value ^ power) mod R_MOD.
            function modexp(value, power) -> res {
                mstore(0x00, 0x20)
                mstore(0x20, 0x20)
                mstore(0x40, 0x20)
                mstore(0x60, value)
                mstore(0x80, power)
                mstore(0xa0, R_MOD)
                if iszero(staticcall(gas(), 5, 0, 0xc0, 0x00, 0x20)) {
                    revertWithMessage(24, "modexp precompile failed")
                }
                res := mload(0x00)
            }

            /// @dev Performs a G1 point multiplication operation and stores the result in a given memory destination.
            function g1pointMulIntoDest(point, s, dest) {
                mstore(0x00, mload(point))
                mstore(0x20, mload(add(point, 0x20)))
                mstore(0x40, mload(add(point, 0x40)))
                mstore(0x60, mload(add(point, 0x60)))
                mstore(0x80, s)  
                // BLS12-381 G1MSM at address 0x0c
                if iszero(staticcall(gas(), 0x0c, 0, 0xa0, dest, 0x80)) {
                    revertWithMessage(30, "g1pointMulIntoDest: G1MSM failed")
                }
            }

            /// @dev Performs a G1 point addition operation and stores the result in a given memory destination.
            function g1pointAddIntoDest(p1, p2, dest) {
                mstore(0x00, mload(p1))
                mstore(0x20, mload(add(p1, 0x20)))
                mstore(0x40, mload(add(p1, 0x40)))
                mstore(0x60, mload(add(p1, 0x60)))
                mstore(0x80, mload(p2))
                mstore(0xa0, mload(add(p2, 0x20)))
                mstore(0xc0, mload(add(p2, 0x40)))
                mstore(0xe0, mload(add(p2, 0x60)))
                //  BLS12-381 G1ADDat address 0x0b
                if iszero(staticcall(gas(), 0x0b, 0x00, 0x100, dest, 0x80)) {
                    revertWithMessage(30, "g1pointAddIntoDest: G1ADD failed")
                }
            }

            /// @dev Performs a G1 point multiplication and addition operations and stores the result in a given memory destination.
            function g1pointMulAndAddIntoDest(point, s, dest) {
                mstore(0x00, mload(point))
                mstore(0x20, mload(add(point, 0x20)))
                mstore(0x40, mload(add(point, 0x40)))
                mstore(0x60, mload(add(point, 0x60)))
                mstore(0x80, s) 
                let success := staticcall(gas(), 0x0c, 0, 0xa0, 0, 0x80)

                mstore(0x80, mload(dest))
                mstore(0xa0, mload(add(dest, 0x20)))
                mstore(0xc0, mload(add(dest, 0x40)))
                mstore(0xe0, mload(add(dest, 0x60)))
                success := and(success, staticcall(gas(), 0x0b, 0x00, 0x100, dest, 0x80))

                if iszero(success) {
                    revertWithMessage(22, "g1pointMulAndAddIntoDest")
                }
            }

            /// @dev Performs a point subtraction operation and updates the first point with the result.
            function g1pointSubAssign(p1, p2) {
                // We'll use the fact that for BLS12-381 with 48-byte coordinates,
                // the precompile expects the full 384-bit representation
                
                // Copy p1 to memory
                mstore(0x00, mload(p1))
                mstore(0x20, mload(add(p1, 0x20)))
                mstore(0x40, mload(add(p1, 0x40)))
                mstore(0x60, mload(add(p1, 0x60)))
                
                // Copy p2's x-coordinate
                mstore(0x80, mload(p2))
                mstore(0xa0, mload(add(p2, 0x20)))
                
                // For the y-coordinate, we need to negate it
                // In BLS12-381, -y = q - y where q is the field modulus
                let y_low := mload(add(p2, 0x60))
                let y_high := mload(add(p2, 0x40))
                
                // Perform q - y
                let neg_y_low, neg_y_high
                
                // Since we're working with 384-bit numbers split into two 256-bit parts,
                // and the high 128 bits of the high part are always zero for valid field elements
                let borrow := 0
                
                // Subtract low part
                switch lt(Q_MOD_PART2, y_low)
                case 1 {
                    // Need to borrow from high part
                    neg_y_low := sub(Q_MOD_PART2, y_low)
                    neg_y_low := add(neg_y_low, not(0)) // Add 2^256
                    neg_y_low := add(neg_y_low, 1)
                    borrow := 1
                }
                default {
                    neg_y_low := sub(Q_MOD_PART2, y_low)
                }
                
                // Subtract high part with borrow
                neg_y_high := sub(sub(Q_MOD_PART1, y_high), borrow)
            
                
                mstore(0xc0, neg_y_high)
                mstore(0xe0, neg_y_low)
                
                // Perform the addition
                if iszero(staticcall(gas(), 0x0b, 0x00, 0x100, p1, 0x80)) {
                    revertWithMessage(28, "pointSubAssign: G1ADD failed")
                }
            }

            /*//////////////////////////////////////////////////////////////
                                    Transcript helpers
            //////////////////////////////////////////////////////////////*/

            /// @dev Updates the transcript state with a new challenge value.
            function updateTranscript(value) { 
                mstore8(TRANSCRIPT_DST_BYTE_SLOT, 0x00)
                mstore(TRANSCRIPT_CHALLENGE_SLOT, value)
                let newState0 := keccak256(TRANSCRIPT_BEGIN_SLOT, 0x64)
                mstore8(TRANSCRIPT_DST_BYTE_SLOT, 0x01)
                let newState1 := keccak256(TRANSCRIPT_BEGIN_SLOT, 0x64)
                mstore(TRANSCRIPT_STATE_1_SLOT, newState1)
                mstore(TRANSCRIPT_STATE_0_SLOT, newState0)
            }

            /// @dev Retrieves a transcript challenge.
            function getTranscriptChallenge(numberOfChallenge) -> challenge {
                mstore8(TRANSCRIPT_DST_BYTE_SLOT, 0x02)
                mstore(TRANSCRIPT_CHALLENGE_SLOT, shl(224, numberOfChallenge))
                challenge := and(keccak256(TRANSCRIPT_BEGIN_SLOT, 0x48), FR_MASK)
            }


            /*//////////////////////////////////////////////////////////////
                                    1. Load Proof
            //////////////////////////////////////////////////////////////*/

            function loadProof() {
                let offset := calldataload(0x04)
                let offset2 := calldataload(0x24)
                let part1LengthInWords := calldataload(add(offset, 0x04))
                let isValid := eq(part1LengthInWords, 42) 
                // S PERMUTATION POLYNOMIALS
                {
                    let x0 := calldataload(add(offset, 0x024))
                    let y0 := calldataload(add(offset, 0x044))
                    let x1 := calldataload(add(offset, 0x064))
                    let y1 := calldataload(add(offset, 0x084))
                    mstore(PUBLIC_INPUTS_S_0_X_SLOT_PART1, x0)
                    mstore(PUBLIC_INPUTS_S_0_Y_SLOT_PART1, y0)
                    mstore(PUBLIC_INPUTS_S_1_X_SLOT_PART1, x1)
                    mstore(PUBLIC_INPUTS_S_1_Y_SLOT_PART1, y1)
                    x0 := calldataload(add(offset2, 0x024))
                    y0 := calldataload(add(offset2, 0x044))
                    x1 := calldataload(add(offset2, 0x064))
                    y1 := calldataload(add(offset2, 0x084))
                    mstore(PUBLIC_INPUTS_S_0_X_SLOT_PART2, x0)
                    mstore(PUBLIC_INPUTS_S_0_Y_SLOT_PART2, y0)
                    mstore(PUBLIC_INPUTS_S_1_X_SLOT_PART2, x1)
                    mstore(PUBLIC_INPUTS_S_1_Y_SLOT_PART2, y1)
                }
                // PROOF U, V & W 
                {
                    let x0 := calldataload(add(offset, 0x0a4))
                    let y0 := calldataload(add(offset, 0x0c4))
                    let x1 := calldataload(add(offset, 0x0e4))
                    let y1 := calldataload(add(offset, 0x104))
                    let x2 := calldataload(add(offset, 0x124))
                    let y2 := calldataload(add(offset, 0x144))
                    mstore(PROOF_POLY_U_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_U_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_V_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_V_Y_SLOT_PART1, y1)
                    mstore(PROOF_POLY_W_X_SLOT_PART1, x2)
                    mstore(PROOF_POLY_W_Y_SLOT_PART1, y2)
                    x0 := calldataload(add(offset2, 0x0a4))
                    y0 := calldataload(add(offset2, 0x0c4))
                    x1 := calldataload(add(offset2, 0x0e4))
                    y1 := calldataload(add(offset2, 0x104))
                    x2 := calldataload(add(offset2, 0x124))
                    y2 := calldataload(add(offset2, 0x144))
                    mstore(PROOF_POLY_U_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_U_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_V_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_V_Y_SLOT_PART2, y1)
                    mstore(PROOF_POLY_W_X_SLOT_PART2, x2)
                    mstore(PROOF_POLY_W_Y_SLOT_PART2, y2)
                }
                // PROOF O_MID & O_PRV
                {
                    let x0 := calldataload(add(offset, 0x164))
                    let y0 := calldataload(add(offset, 0x184))
                    let x1 := calldataload(add(offset, 0x1a4))
                    let y1 := calldataload(add(offset, 0x1c4))
                    mstore(PROOF_POLY_OMID_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_OMID_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_OPRV_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_OPRV_Y_SLOT_PART1, y1)
                    x0 := calldataload(add(offset2, 0x164))
                    y0 := calldataload(add(offset2, 0x184))
                    x1 := calldataload(add(offset2, 0x1a4))
                    y1 := calldataload(add(offset2, 0x1c4))
                    mstore(PROOF_POLY_OMID_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_OMID_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_OPRV_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_OPRV_Y_SLOT_PART2, y1)
                }
                // PROOF Q_AX, Q_AY, Q_CX & Q_CY 
                {
                    let x0 := calldataload(add(offset, 0x1e4))
                    let y0 := calldataload(add(offset, 0x204))
                    let x1 := calldataload(add(offset, 0x224))
                    let y1 := calldataload(add(offset, 0x244))
                    let x2 := calldataload(add(offset, 0x264))
                    let y2 := calldataload(add(offset, 0x284))
                    let x3 := calldataload(add(offset, 0x2a4))
                    let y3 := calldataload(add(offset, 0x2c4))
                    mstore(PROOF_POLY_QAX_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_QAX_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_QAY_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_QAY_Y_SLOT_PART1, y1)
                    mstore(PROOF_POLY_QCX_X_SLOT_PART1, x2)
                    mstore(PROOF_POLY_QCX_Y_SLOT_PART1, y2)
                    mstore(PROOF_POLY_QCY_X_SLOT_PART1, x3)
                    mstore(PROOF_POLY_QCY_Y_SLOT_PART1, y3)
                    x0 := calldataload(add(offset2, 0x1e4))
                    y0 := calldataload(add(offset2, 0x204))
                    x1 := calldataload(add(offset2, 0x224))
                    y1 := calldataload(add(offset2, 0x244))
                    x2 := calldataload(add(offset2, 0x264))
                    y2 := calldataload(add(offset2, 0x284))
                    x3 := calldataload(add(offset2, 0x2a4))
                    y3 := calldataload(add(offset2, 0x2c4))
                    mstore(PROOF_POLY_QAX_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_QAX_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_QAY_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_QAY_Y_SLOT_PART2, y1)
                    mstore(PROOF_POLY_QCX_X_SLOT_PART2, x2)
                    mstore(PROOF_POLY_QCX_Y_SLOT_PART2, y2)
                    mstore(PROOF_POLY_QCY_X_SLOT_PART2, x3)
                    mstore(PROOF_POLY_QCY_Y_SLOT_PART2, y3)
                }
                // PROOF Π_{χ}, Π_{ζ}
                {
                    let x0 := calldataload(add(offset, 0x2e4))
                    let y0 := calldataload(add(offset, 0x304))
                    let x1 := calldataload(add(offset, 0x324))
                    let y1 := calldataload(add(offset, 0x344))
                    mstore(PROOF_POLY_PI_CHI_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_PI_CHI_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_PI_ZETA_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_PI_ZETA_Y_SLOT_PART1, y1)
                    x0 := calldataload(add(offset2, 0x2e4))
                    y0 := calldataload(add(offset2, 0x304))
                    x1 := calldataload(add(offset2, 0x324))
                    y1 := calldataload(add(offset2, 0x344))
                    mstore(PROOF_POLY_PI_CHI_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_PI_CHI_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_PI_ZETA_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_PI_ZETA_Y_SLOT_PART2, y1)
                }
                // PROOF B & R 
                {
                    let x0 := calldataload(add(offset, 0x364))
                    let y0 := calldataload(add(offset, 0x384))
                    let x1 := calldataload(add(offset, 0x3a4))
                    let y1 := calldataload(add(offset, 0x3c4))
                    mstore(PROOF_POLY_B_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_B_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_R_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_R_Y_SLOT_PART1, y1)
                    x0 := calldataload(add(offset2, 0x364))
                    y0 := calldataload(add(offset2, 0x384))
                    x1 := calldataload(add(offset2, 0x3a4))
                    y1 := calldataload(add(offset2, 0x3c4))
                    mstore(PROOF_POLY_B_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_B_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_R_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_R_Y_SLOT_PART2, y1)
                }
                // PROOF M_ζ, M_χ, N_ζ & N_χ
                {
                    let x0 := calldataload(add(offset, 0x3e4))
                    let y0 := calldataload(add(offset, 0x404))
                    let x1 := calldataload(add(offset, 0x424))
                    let y1 := calldataload(add(offset, 0x444))
                    let x2 := calldataload(add(offset, 0x464))
                    let y2 := calldataload(add(offset, 0x484))
                    let x3 := calldataload(add(offset, 0x4a4))
                    let y3 := calldataload(add(offset, 0x4c4))
                    mstore(PROOF_POLY_M_ZETA_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_M_ZETA_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_M_CHI_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_M_CHI_Y_SLOT_PART1, y1)
                    mstore(PROOF_POLY_N_ZETA_X_SLOT_PART1, x2)
                    mstore(PROOF_POLY_N_ZETA_Y_SLOT_PART1, y2)
                    mstore(PROOF_POLY_N_CHI_X_SLOT_PART1, x3)
                    mstore(PROOF_POLY_N_CHI_Y_SLOT_PART1, y3)
                    x0 := calldataload(add(offset2, 0x3e4))
                    y0 := calldataload(add(offset2, 0x404))
                    x1 := calldataload(add(offset2, 0x424))
                    y1 := calldataload(add(offset2, 0x444))
                    x2 := calldataload(add(offset2, 0x464))
                    y2 := calldataload(add(offset2, 0x484))
                    x3 := calldataload(add(offset2, 0x4a4))
                    y3 := calldataload(add(offset2, 0x4c4))
                    mstore(PROOF_POLY_M_ZETA_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_M_ZETA_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_M_CHI_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_M_CHI_Y_SLOT_PART2, y1)
                    mstore(PROOF_POLY_N_ZETA_X_SLOT_PART2, x2)
                    mstore(PROOF_POLY_N_ZETA_Y_SLOT_PART2, y2)
                    mstore(PROOF_POLY_N_CHI_X_SLOT_PART2, x3)
                    mstore(PROOF_POLY_N_CHI_Y_SLOT_PART2, y3)
                }
                // PROOF O_PUB & A 
                {
                    let x0 := calldataload(add(offset, 0x4e4))
                    let y0 := calldataload(add(offset, 0x504))
                    let x1 := calldataload(add(offset, 0x524))
                    let y1 := calldataload(add(offset, 0x544))
                    mstore(PROOF_POLY_OPUB_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_OPUB_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_A_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_A_Y_SLOT_PART1, y1)
                    x0 := calldataload(add(offset2, 0x4e4))
                    y0 := calldataload(add(offset2, 0x504))
                    x1 := calldataload(add(offset2, 0x524))
                    y1 := calldataload(add(offset2, 0x544))
                    mstore(PROOF_POLY_OPUB_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_OPUB_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_A_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_A_Y_SLOT_PART2, y1)
                }

                mstore(PROOF_R1XY_SLOT, mod(calldataload(add(offset2, 0x564)), R_MOD))
                mstore(PROOF_R2XY_SLOT, mod(calldataload(add(offset2, 0x584)), R_MOD))
                mstore(PROOF_R3XY_SLOT, mod(calldataload(add(offset2, 0x5a4)), R_MOD))
                mstore(PROOF_VXY_SLOT, mod(calldataload(add(offset2, 0x5c4)), R_MOD))

                // Revert if the length of the proof is not valid
                if iszero(isValid) {
                    revertWithMessage(27, "loadProof: Proof is invalid")
                }
            }

            /*//////////////////////////////////////////////////////////////
                                2. Transcript initialization
            //////////////////////////////////////////////////////////////*/

            /// @notice Recomputes all challenges
            /// @dev The process is the following:
            /// Commit:   [U], [V], [W], [Q_AX], [Q_AY], [B]
            /// Get:      θ_0, θ_1, θ_2
            /// Commit:   [R]
            /// Get:      κ0
            /// Commit:   [Q_CX], [Q_CY]
            /// Get:      χ, ζ
            /// Commit    V_xy, R1, R2, R3
            /// Get:      κ1, κ2

            function initializeTranscript() {
                // Round 1
                updateTranscript(mload(PROOF_POLY_U_X_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_U_X_SLOT_PART2))
                updateTranscript(mload(PROOF_POLY_U_Y_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_U_Y_SLOT_PART2))
                
                updateTranscript(mload(PROOF_POLY_V_X_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_V_X_SLOT_PART2))
                updateTranscript(mload(PROOF_POLY_V_Y_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_V_Y_SLOT_PART2))
                
                updateTranscript(mload(PROOF_POLY_W_X_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_W_X_SLOT_PART2))
                updateTranscript(mload(PROOF_POLY_W_Y_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_W_Y_SLOT_PART2))

                updateTranscript(mload(PROOF_POLY_QAX_X_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_QAX_X_SLOT_PART2))
                updateTranscript(mload(PROOF_POLY_QAX_Y_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_QAX_Y_SLOT_PART2))

                updateTranscript(mload(PROOF_POLY_QAY_X_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_QAY_X_SLOT_PART2))
                updateTranscript(mload(PROOF_POLY_QAY_Y_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_QAY_Y_SLOT_PART2))

                updateTranscript(mload(PROOF_POLY_B_X_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_B_X_SLOT_PART2))
                updateTranscript(mload(PROOF_POLY_B_Y_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_B_Y_SLOT_PART2))
                
                // compute thetas
                mstore(CHALLENGE_THETA_0_SLOT, getTranscriptChallenge(0))
                mstore(CHALLENGE_THETA_1_SLOT, getTranscriptChallenge(1))
                mstore(CHALLENGE_THETA_2_SLOT, getTranscriptChallenge(2))
                
                // Round 2
                updateTranscript(mload(PROOF_POLY_R_X_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_R_X_SLOT_PART2))
                updateTranscript(mload(PROOF_POLY_R_Y_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_R_Y_SLOT_PART2))
                
                // compute κ0
                mstore(CHALLENGE_KAPPA_0_SLOT, getTranscriptChallenge(3))

                // Round 3
                updateTranscript(mload(PROOF_POLY_QCX_X_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_QCX_X_SLOT_PART2))
                updateTranscript(mload(PROOF_POLY_QCX_Y_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_QCX_Y_SLOT_PART2))
                updateTranscript(mload(PROOF_POLY_QCY_X_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_QCY_X_SLOT_PART2))
                updateTranscript(mload(PROOF_POLY_QCY_Y_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_QCY_Y_SLOT_PART2))

                // compute χ
                mstore(CHALLENGE_CHI_SLOT, getTranscriptChallenge(4))
                // compute ζ
                mstore(CHALLENGE_ZETA_SLOT, getTranscriptChallenge(5))

                // Round 4
                updateTranscript(mload(PROOF_VXY_SLOT))
                updateTranscript(mload(PROOF_R1XY_SLOT))
                updateTranscript(mload(PROOF_R2XY_SLOT))
                updateTranscript(mload(PROOF_R3XY_SLOT))
                
                // compute κ1
                mstore(CHALLENGE_KAPPA_1_SLOT, getTranscriptChallenge(6))
                // compute κ2
                mstore(CHALLENGE_KAPPA_2_SLOT, getTranscriptChallenge(7))
            
            }

            /*//////////////////////////////////////////////////////////////
                                    3. Prepare Queries
            //////////////////////////////////////////////////////////////*/

            /// @dev Here we compute some queries for the final pairing
            /// We use the formulas:
            /// [F]_1:=[B]_1+θ_0[s^{(0)}(x,y)]_1+θ_1[s^{(1)}(x,y)]_1+θ_2[1]_1
            /// 
            /// [G]_1:= [B]_1+θ_0[s^{(2)}(x,y)]_1+θ_1[y]_1+θ_2[1]_1
            ///
            /// t_n(χ):=χ^{n}-1
            ///
            /// t_{smax}(ζ) := ζ^{smax}-1
            ///
            /// t_{m_I}(χ) := χ^{m_I}-1

            function prepareQueries() {
                // calculate [F]_1
                {
                    let theta0 := mload(CHALLENGE_THETA_0_SLOT)
                    let theta1 := mload(CHALLENGE_THETA_1_SLOT)
                    let theta2 := mload(CHALLENGE_THETA_2_SLOT)


                    mstore(INTERMERDIARY_POLY_F_X_SLOT_PART1, mload(PROOF_POLY_B_X_SLOT_PART1))
                    mstore(INTERMERDIARY_POLY_F_X_SLOT_PART2, mload(PROOF_POLY_B_X_SLOT_PART2))
                    mstore(INTERMERDIARY_POLY_F_Y_SLOT_PART1, mload(PROOF_POLY_B_Y_SLOT_PART1))
                    mstore(INTERMERDIARY_POLY_F_Y_SLOT_PART2, mload(PROOF_POLY_B_Y_SLOT_PART2))

                    g1pointMulAndAddIntoDest(PUBLIC_INPUTS_S_0_X_SLOT_PART1,theta0,INTERMERDIARY_POLY_F_X_SLOT_PART1)
                    g1pointMulAndAddIntoDest(PUBLIC_INPUTS_S_1_X_SLOT_PART1,theta1,INTERMERDIARY_POLY_F_X_SLOT_PART1)
                    g1pointMulAndAddIntoDest(VK_IDENTITY_X_PART1, theta2, INTERMERDIARY_POLY_F_X_SLOT_PART1)
                }
                // calculate [G]_1
                {
                    let theta0 := mload(CHALLENGE_THETA_0_SLOT)
                    let theta1 := mload(CHALLENGE_THETA_1_SLOT)
                    let theta2 := mload(CHALLENGE_THETA_2_SLOT)

                    mstore(INTERMERDIARY_POLY_G_X_SLOT_PART1, mload(PROOF_POLY_B_X_SLOT_PART1))
                    mstore(INTERMERDIARY_POLY_G_X_SLOT_PART2, mload(PROOF_POLY_B_X_SLOT_PART2))
                    mstore(INTERMERDIARY_POLY_G_Y_SLOT_PART1, mload(PROOF_POLY_B_Y_SLOT_PART1))
                    mstore(INTERMERDIARY_POLY_G_Y_SLOT_PART2, mload(PROOF_POLY_B_Y_SLOT_PART2))

                    g1pointMulAndAddIntoDest(VK_POLY_X_X_PART1,theta0,INTERMERDIARY_POLY_G_X_SLOT_PART1)
                    g1pointMulAndAddIntoDest(VK_POLY_Y_X_PART1,theta1,INTERMERDIARY_POLY_G_X_SLOT_PART1)
                    g1pointMulAndAddIntoDest(VK_IDENTITY_X_PART1,theta2,INTERMERDIARY_POLY_G_X_SLOT_PART1)
                }
                // calculate t_n(χ)
                {
                    let chi := mload(CHALLENGE_CHI_SLOT)
                    let t := sub(modexp(chi,CONSTANT_N),1)
                    mstore(INTERMERDIARY_SCALAR_T_N_CHI_SLOT,t)
                }

                // calculate t_smax(ζ)
                {
                    let zeta := mload(CHALLENGE_ZETA_SLOT)
                    let t := sub(modexp(zeta,CONSTANT_SMAX),1)
                    mstore(INTERMERDIARY_SCALAR_T_SMAX_ZETA_SLOT,t)
                }

                // calculate t_mI(χ)
                {
                    let chi := mload(CHALLENGE_CHI_SLOT)
                    let t := sub(modexp(chi,CONSTANT_MI),1)
                    mstore(INTERMERDIARY_SCALAR_T_MI_CHI_SLOT,t)
                }       
            }

            // lagrange_K0_eval computation
            function computeLagrangeK0Eval() {
                let chi := mload(CHALLENGE_CHI_SLOT)
                let m_i := CONSTANT_MI // 256
                
                // For k0_evals = [1, 0, 0, ..., 0], the polynomial evaluation becomes:
                // lagrange_K0_eval = L_0(chi) where L_0 is the 0th Lagrange basis polynomial
                // L_0(chi) = ∏_{k=1}^{m_i-1} (chi - ω^k) / (1 - ω^k)
                // This is mathematically equivalent to: (chi^m_i - 1) / (m_i * (chi - 1))
                
                // Safety check: χ cannot be 1
                if eq(chi, 1) {
                    revert(0, 0)
                }
                
                // Compute χ^m_i mod R_MOD
                let chi_mi := modexp(chi, m_i)
                
                // Compute numerator (χ^m_i - 1) mod R_MOD
                let numerator := addmod(chi_mi, sub(R_MOD, 1), R_MOD)
                
                // Compute denominator m_i*(χ-1) mod R_MOD
                let chi_minus_1 := addmod(chi, sub(R_MOD, 1), R_MOD)
                let denominator := mulmod(m_i, chi_minus_1, R_MOD)
                
                // Check denominator is not zero
                if iszero(denominator) {
                    revert(0, 0)
                }
                
                // Compute modular inverse using Fermat's little theorem
                let inv_denominator := modexp(denominator, sub(R_MOD, 2))
                
                // Final result: numerator * inv_denominator mod R_MOD
                let r := mulmod(numerator, inv_denominator, R_MOD)
                
                mstore(INTERMEDIARY_SCALAR_KO_SLOT, r)
            }

            function computeAPUB() {
                let offset := calldataload(0x44)
                let publicInputsLength := calldataload(add(offset, 0x04))
                
                if iszero(eq(publicInputsLength, 128)) {
                    revertWithMessage(26, "Invalid public inputs length")
                }
                
                let chi := mload(CHALLENGE_CHI_SLOT)
                let omega := OMEGA_32
                let l := 32
                
                // First check if chi is a root of unity
                let chi_power_l := chi
                for { let i := 0 } lt(i, 5) { i := add(i, 1) } {
                    chi_power_l := mulmod(chi_power_l, chi_power_l, R_MOD)
                }
                
                if eq(chi_power_l, 1) {
                    let omega_j := 1
                    for { let j := 0 } lt(j, l) { j := add(j, 1) } {
                        if eq(chi, omega_j) {
                            let a_j := calldataload(add(offset, add(0x24, mul(j, 0x20))))
                            mstore(INTERMEDIARY_SCALAR_APUB_SLOT, mod(a_j, R_MOD))
                            leave
                        }
                        omega_j := mulmod(omega_j, omega, R_MOD)
                    }
                }
                
                // Precompute all omega^j values using the constants
                let omegaPtr := 0x3000
                mstore(omegaPtr, 1) // omega^0 = 1
                mstore(add(omegaPtr, 0x20), omega) // omega^1
                let omega_power := omega
                for { let j := 2 } lt(j, 32) { j := add(j, 1) } {
                    omega_power := mulmod(omega_power, omega, R_MOD)
                    mstore(add(omegaPtr, mul(j, 0x20)), omega_power)
                }
                
                // Standard case: Compute using Lagrange formula with precomputed omega values
                let result := 0
                
                for { let j := 0 } lt(j, l) { j := add(j, 1) } {
                    // Get a_j
                    let a_j := calldataload(add(offset, add(0x24, mul(j, 0x20))))
                    a_j := mod(a_j, R_MOD)
                    
                    // Get precomputed omega^j
                    let omega_j := mload(add(omegaPtr, mul(j, 0x20)))
                    
                    // Compute M_j(chi) = Π(m≠j) (chi - omega^m) / (omega^j - omega^m)
                    let M_j := 1
                    
                    for { let m := 0 } lt(m, l) { m := add(m, 1) } {
                        if iszero(eq(m, j)) {
                            // Get precomputed omega^m
                            let omega_m := mload(add(omegaPtr, mul(m, 0x20)))
                            
                            // Numerator: chi - omega^m
                            let num := addmod(chi, sub(R_MOD, omega_m), R_MOD)
                            
                            // Denominator: omega^j - omega^m
                            let denom := addmod(omega_j, sub(R_MOD, omega_m), R_MOD)
                            let denom_inv := modexp(denom, sub(R_MOD, 2))
                            
                            M_j := mulmod(M_j, mulmod(num, denom_inv, R_MOD), R_MOD)
                        }
                    }
                    
                    // Add a_j * M_j(chi) to result
                    result := addmod(result, mulmod(a_j, M_j, R_MOD), R_MOD)
                }
                
                mstore(INTERMEDIARY_SCALAR_APUB_SLOT, result)
            }

            /*//////////////////////////////////////////////////////////////
                                    4. Compute LHS and AUX
            //////////////////////////////////////////////////////////////*/

            /// @dev Here we compute [LHS]_1 + [AUX]_1 aggregated commitment for the final pairing
            /// We use the formulas:
            /// [LHS]_1 := [LHS_B]_1 + κ2([LHS_A]_1 + [LHS_C]_1)
            ///
            /// where
            ///
            /// [LHS_A]_1 :=  V_{x,y}[U]_1 - [W]_1 + κ1[V]_1 
            ///               - t_n(χ)[Q_{A,X}]_1 - t_{s_{max}}(ζ)[Q_{A,Y}]_1
            ///
            /// and where
            ///
            /// [LHS_C]_1 := κ1^2(R_{x,y} - 1) * [K_{-1}(X)L_{-1}(X)]_1 + a[G]_1 
            ///              - b[F]_1 - κ1^2 * t_{m_l}(χ) * [Q_{C,X}]_1 - κ1^2 * t_{s_{max}}(ζ) * [Q_{C,Y}]_1) + c[R]_1 + d[1 ]_1
            ///              
            ///         with a := κ1^2κ0R_{x,y}((χ-1)  + κ0K_0(χ))
            ///              b := κ1^2κ0((χ-1) R’_{x,y} + κ0K_0(χ)R’’_{x,y})
            ///              c := κ1^3 + κ2 + κ2^2
            ///              d := -κ1^3R_{x,y} - κ2R’_{x,y} - κ2^2R’’_{x,y} - κ1V_{x,y} - κ1^4A_{pub}    
            ///
            ///  and where
            /// 
            ///  [LHS_B]_1 := (1+κ2κ1^4)[A]_1
            ///
            ///  and 
            ///
            ///  [AUX]_1 := κ2 * χ * [Π_{χ}]_1 + κ2 * ζ *[Π_ζ]_1 + 
            ///             κ2^2 * ω_{m_i}^{-1} * χ *[M_{χ}]_1 + κ2^2 * ζ * [M_{ζ}]_1 + κ2^3 * ω_{m_i}^{-1} * χ * [N_{χ}]_1 + κ_2^3 ω_smax^{-1} * ζ * [N_{ζ}]
            /// 

            /// @dev calculate [LHS_A]_1 = V_{x,y}[U]_1 - [W]_1 + κ1[V]_1 - t_n(χ)[Q_{A,X}]_1 - t_{s_{max}}(ζ)[Q_{A,Y}]_1            
            function prepareLHSA() {
                g1pointMulIntoDest(PROOF_POLY_U_X_SLOT_PART1, mload(PROOF_VXY_SLOT), AGG_LHS_A_X_SLOT_PART1)
                g1pointSubAssign(AGG_LHS_A_X_SLOT_PART1, PROOF_POLY_W_X_SLOT_PART1)

                //κ1[V]_1
                g1pointMulIntoDest(PROOF_POLY_V_X_SLOT_PART1, mload(CHALLENGE_KAPPA_1_SLOT), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)


                // (V_{x,y}[U]_1 - [W]_1) + κ1[V]_1
                g1pointAddIntoDest(AGG_LHS_A_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1, AGG_LHS_A_X_SLOT_PART1)

                // t_n(χ)[Q_{A,X}]_1
                g1pointMulIntoDest(PROOF_POLY_QAX_X_SLOT_PART1, mload(INTERMERDIARY_SCALAR_T_N_CHI_SLOT), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                
                // (V_{x,y}[U]_1 - [W]_1) + (κ1 * ([V]_1 - V_{x,y}[1]_1)) - t_n(χ)[Q_{A,X}]_1
                g1pointSubAssign(AGG_LHS_A_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                // t_{s_{max}}(ζ)[Q_{A,Y}]_1
                g1pointMulIntoDest(PROOF_POLY_QAY_X_SLOT_PART1, mload(INTERMERDIARY_SCALAR_T_SMAX_ZETA_SLOT), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                // V_{x,y}[U]_1 - [W]_1 + κ1 * ([V]_1 - V_{x,y}[1]_1) - t_n(χ)[Q_{A,X}]_1 - t_{s_{max}}(ζ)[Q_{A,Y}]_1
                g1pointSubAssign(AGG_LHS_A_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
            }

            /// @dev [LHS_B]_1 := (1+κ2κ1^4)[A]_1
            function prepareLHSB() {
                let kappa2 := mload(CHALLENGE_KAPPA_2_SLOT)
                let kappa1 := mload(CHALLENGE_KAPPA_1_SLOT)
                let A_pub := mload(INTERMEDIARY_SCALAR_APUB_SLOT)

                // κ2κ1^4
                let coeff1 := addmod(1, mulmod(kappa2, modexp(kappa1, 4), R_MOD), R_MOD)

                // (1+κ2κ1^4) * A_{pub}
                let coeff2 := mulmod(mulmod(kappa2, modexp(kappa1, 4), R_MOD), A_pub, R_MOD)

                // (1+κ2κ1^4)[A]_1
                g1pointMulIntoDest(PROOF_POLY_A_X_SLOT_PART1, coeff1, AGG_LHS_B_X_SLOT_PART1)
            }

            ///  @dev [LHS_C]_1 := κ1^2(R_{x,y} - 1) * [K_{-1}(X)L_{-1}(X)]_1 + a[G]_1 
            ///                    - b[F]_1 - κ1^2 * t_{m_l}(χ) * [Q_{C,X}]_1 - κ1^2 * t_{s_{max}}(ζ) * [Q_{C,Y}]_1) + c[R]_1 + d[1]_1
            function prepareLHSC() {
                let kappa0 := mload(CHALLENGE_KAPPA_0_SLOT)
                let kappa1 := mload(CHALLENGE_KAPPA_1_SLOT)
                let kappa1_pow2 := mulmod(kappa1, kappa1, R_MOD)
                let kappa1_pow3 := mulmod(kappa1, kappa1_pow2, R_MOD)
                let kappa2 := mload(CHALLENGE_KAPPA_2_SLOT)
                let kappa2_pow2 := mulmod(kappa2, kappa2, R_MOD)
                let chi := mload(CHALLENGE_CHI_SLOT)
                let chi_minus_1 := addmod(chi, sub(R_MOD, 1), R_MOD)
                let r1 := mload(PROOF_R1XY_SLOT)
                let r2 := mload(PROOF_R2XY_SLOT)
                let r3 := mload(PROOF_R3XY_SLOT)
                let k0 := mload(INTERMEDIARY_SCALAR_KO_SLOT)
                let V_xy := mload(PROOF_VXY_SLOT)
                let A_pub := mload(INTERMEDIARY_SCALAR_APUB_SLOT)
                let t_ml := mload(INTERMERDIARY_SCALAR_T_MI_CHI_SLOT)
                let t_smax := mload(INTERMERDIARY_SCALAR_T_SMAX_ZETA_SLOT)

                // a := κ1^2 * κ0 * R_{x,y} * ((χ-1) + κ0 * K_0(χ))
                let a := mulmod(mulmod(mulmod(mulmod(kappa1, kappa1, R_MOD), kappa0, R_MOD),r1, R_MOD), addmod(chi_minus_1, mulmod(kappa0, k0, R_MOD), R_MOD), R_MOD)
                // b := κ1^2 * κ0 * ((χ-1) R’_{x,y} + κ0K_0(χ)R’’_{x,y})
                let b := mulmod(mulmod(kappa1_pow2, kappa0, R_MOD), addmod(mulmod(chi_minus_1, r2, R_MOD), mulmod(mulmod(kappa0, k0, R_MOD), r3, R_MOD), R_MOD), R_MOD)
                // c := κ1^3 + κ2 + κ2^2
                let c := addmod(kappa1_pow3, addmod(kappa2, kappa2_pow2, R_MOD), R_MOD)
                //    d := -κ1^3R_{x,y} - κ2R’_{x,y} - κ2^2R’’_{x,y} - κ1V_{x,y} - κ1^4A_{pub} 
                // => d := - (κ1^3R_{x,y} + κ2R’_{x,y} + κ2^2R’’_{x,y} + κ1V_{x,y} + κ1^4A_{pub})
                let d := sub(R_MOD,addmod(addmod(addmod(mulmod(kappa1_pow3, r1, R_MOD),mulmod(kappa2, r2, R_MOD), R_MOD), mulmod(kappa2_pow2, r3, R_MOD), R_MOD), addmod(mulmod(kappa1, V_xy, R_MOD),mulmod(mulmod(kappa1, kappa1_pow3, R_MOD), A_pub, R_MOD),R_MOD),R_MOD))                
                // κ1^2(R_x,y - 1)
                let kappa1_r_minus_1 := mulmod(mulmod(kappa1, kappa1, R_MOD), sub(r1, 1), R_MOD)
                // κ1^2 * t_{m_l}(χ)
                let kappa1_tml := mulmod(kappa1_pow2, t_ml, R_MOD)
                // κ1^2 * t_{s_{max}}(ζ)
                let kappa1_tsmax := mulmod(kappa1_pow2, t_smax, R_MOD)
                
                g1pointMulIntoDest(VK_POLY_KXLX_X_PART1, kappa1_r_minus_1, AGG_LHS_C_X_SLOT_PART1)
                g1pointMulAndAddIntoDest(INTERMERDIARY_POLY_G_X_SLOT_PART1, a, AGG_LHS_C_X_SLOT_PART1)

                g1pointMulIntoDest(INTERMERDIARY_POLY_F_X_SLOT_PART1, b, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                g1pointSubAssign(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                g1pointMulIntoDest(PROOF_POLY_QCX_X_SLOT_PART1, kappa1_tml, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                g1pointSubAssign(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                g1pointMulIntoDest(PROOF_POLY_QCY_X_SLOT_PART1, kappa1_tsmax, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                g1pointSubAssign(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                g1pointMulAndAddIntoDest(PROOF_POLY_R_X_SLOT_PART1, c, AGG_LHS_C_X_SLOT_PART1)
                g1pointMulAndAddIntoDest(VK_IDENTITY_X_PART1, d, AGG_LHS_C_X_SLOT_PART1)

            }

            /// @dev [RHS_1]_1 := κ2[Π_{χ}]_1 + κ2^2[M_{χ}]_1 + κ2^3[N_{χ}]_1
            function prepareRHS1() {
                let kappa2 := mload(CHALLENGE_KAPPA_2_SLOT)
                let kappa2_pow2 := mulmod(kappa2, kappa2, R_MOD)
                let kappa2_pow3 := mulmod(kappa2_pow2, kappa2, R_MOD)

                g1pointMulIntoDest(PROOF_POLY_PI_CHI_X_SLOT_PART1, kappa2, PAIRING_AGG_RHS_1_X_SLOT_PART1)
                g1pointMulAndAddIntoDest(PROOF_POLY_M_CHI_X_SLOT_PART1, kappa2_pow2, PAIRING_AGG_RHS_1_X_SLOT_PART1)
                g1pointMulAndAddIntoDest(PROOF_POLY_N_CHI_X_SLOT_PART1, kappa2_pow3, PAIRING_AGG_RHS_1_X_SLOT_PART1)
            }

            /// @dev [RHS_2]_1 := κ2[Π_{ζ}]_1 + κ2^2[M_{ζ}]_1 + κ2^3[N_{ζ}]_1
            function prepareRHS2() {
                let kappa2 := mload(CHALLENGE_KAPPA_2_SLOT)
                let kappa2_pow2 := mulmod(kappa2, kappa2, R_MOD)
                let kappa2_pow3 := mulmod(kappa2_pow2, kappa2, R_MOD)

                g1pointMulIntoDest(PROOF_POLY_PI_ZETA_X_SLOT_PART1, kappa2, PAIRING_AGG_RHS_2_X_SLOT_PART1)
                g1pointMulAndAddIntoDest(PROOF_POLY_M_ZETA_X_SLOT_PART1, kappa2_pow2, PAIRING_AGG_RHS_2_X_SLOT_PART1)
                g1pointMulAndAddIntoDest(PROOF_POLY_N_ZETA_X_SLOT_PART1, kappa2_pow3, PAIRING_AGG_RHS_2_X_SLOT_PART1)
            }

            /// @dev [LHS]_1 := [LHS_B]_1 + κ2([LHS_A]_1 + [LHS_C]_1)
            /// @dev [AUX]_1 := κ2 * χ * [Π_{χ}]_1 + κ2 * ζ *[Π_ζ]_1 + 
            ///                 κ2^2 * ω_{m_l}^{-1} * χ *[M_{χ}]_1 + κ2^2 * ζ * [M_ζ]_1 + κ2^3 * ω_{m_l}^{-1} * χ * [N_{χ}]_1 + κ_2^3 * ω_smax^{-1} * ζ * [N_{ζ}]            
            function prepareAggregatedCommitment() {
                // calculate [LHS]_1 = [LHS_B]_1 + κ2([LHS_A]_1 + [LHS_C]_1)
                {
                    let kappa2 := mload(CHALLENGE_KAPPA_2_SLOT)
                    
                    // First add [LHS_A]_1 + [LHS_C]_1
                    g1pointAddIntoDest(AGG_LHS_A_X_SLOT_PART1, AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    
                    // Multiply by κ2: κ2([LHS_A]_1 + [LHS_C]_1)
                    g1pointMulIntoDest(BUFFER_AGGREGATED_POLY_X_SLOT_PART1, kappa2, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    
                    // Add [LHS_B]_1: [LHS_B]_1 + κ2([LHS_A]_1 + [LHS_C]_1)
                    g1pointAddIntoDest(AGG_LHS_B_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1, PAIRING_AGG_LHS_X_SLOT_PART1)
                }

                // calculate [AUX]_1
                {
                    let kappa2 := mload(CHALLENGE_KAPPA_2_SLOT)
                    let chi := mload(CHALLENGE_CHI_SLOT)
                    let zeta := mload(CHALLENGE_ZETA_SLOT)
                    let omega_ml := OMEGA_MI_MINUS_1
                    let omega_smax := OMEGA_SMAX_MINUS_1

                    let kappa2_chi := mulmod(kappa2, chi, R_MOD)
                    let kappa2_zeta := mulmod(kappa2, zeta, R_MOD)
                    let kappa2_pow2_omega_ml_chi := mulmod(mulmod(mulmod(kappa2, kappa2, R_MOD), omega_ml, R_MOD), chi, R_MOD)
                    let kappa2_pow2_zeta := mulmod(mulmod(kappa2, kappa2, R_MOD), zeta, R_MOD)
                    let kappa2_pow3_omega_ml_chi := mulmod(mulmod(mulmod(mulmod(kappa2, kappa2, R_MOD), kappa2, R_MOD), omega_ml, R_MOD), chi, R_MOD)
                    let kappa2_pow3_omega_smax_zeta := mulmod(mulmod(mulmod(mulmod(kappa2, kappa2, R_MOD), kappa2, R_MOD), omega_smax, R_MOD), zeta, R_MOD)


                    // [AUX]_1 accumulation
                    // κ2 * χ * [Π_{χ}]_1
                    g1pointMulIntoDest(PROOF_POLY_PI_CHI_X_SLOT_PART1, kappa2_chi, PAIRING_AGG_AUX_X_SLOT_PART1)
                    // += κ2 * ζ *[Π_ζ]_1
                    g1pointMulAndAddIntoDest(PROOF_POLY_PI_ZETA_X_SLOT_PART1,kappa2_zeta, PAIRING_AGG_AUX_X_SLOT_PART1)
                    // += κ2^2 * ω_{m_l}^{-1} * χ *[M_{χ}]_1
                    g1pointMulAndAddIntoDest(PROOF_POLY_M_CHI_X_SLOT_PART1, kappa2_pow2_omega_ml_chi, PAIRING_AGG_AUX_X_SLOT_PART1)
                    // += κ2^2 * ζ * [M_ζ]_1
                    g1pointMulAndAddIntoDest(PROOF_POLY_M_ZETA_X_SLOT_PART1,kappa2_pow2_zeta,PAIRING_AGG_AUX_X_SLOT_PART1)
                    // κ2^3 * ω_{m_l}^{-1} * χ * [N_{χ}]_1
                    g1pointMulAndAddIntoDest(PROOF_POLY_N_CHI_X_SLOT_PART1, kappa2_pow3_omega_ml_chi, PAIRING_AGG_AUX_X_SLOT_PART1)
                    // κ2^3 * ω_smax^{-1} * ζ * [N_{ζ}]
                    g1pointMulAndAddIntoDest(PROOF_POLY_N_ZETA_X_SLOT_PART1,kappa2_pow3_omega_smax_zeta, PAIRING_AGG_AUX_X_SLOT_PART1)

                }

                // calculate [LHS]_1 + [AUX]_1
                {
                    g1pointAddIntoDest(PAIRING_AGG_LHS_X_SLOT_PART1, PAIRING_AGG_AUX_X_SLOT_PART1, PAIRING_AGG_LHS_AUX_X_SLOT_PART1)
                }

            }


            /*////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                        5. Pairing
            ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

            /// @notice Checks the final pairing
            /// @dev We should check the equation:
            ///
            ///    /                                                  \           /                                                          \  
            ///   | e([LHS]_1 + [AUX]_1, [1]_2)e([B]_1, [α^4]_2)       |         |  e([O_pub], [γ]_2])e([O_mid]_1, [η]_2)e([O_prv]_1, [δ]_2)  |
            ///   | e([U]_1, [α]_2)e([V]_1, [α^2]_2)e([W]_1, [α^3]_2)  |    =    |  . e(κ2[Π_{χ}]_1 + κ2^2[M_{χ}]_1 + κ2^3[N_{χ}]_1, [x]_2)   |
            ///    \                                                  /          |  . e(κ2[Π_{ζ}]_1 + κ2^2[M_{ζ}]_1 + κ2^3[N_{ζ}]_1, [y]_2)   |
            ///                                                                   \                                                          / 
            
            function finalPairing() {

                // load [LHS]_1 + [AUX]_1
                mstore(0x000, mload(PAIRING_AGG_LHS_AUX_X_SLOT_PART1))
                mstore(0x020, mload(PAIRING_AGG_LHS_AUX_X_SLOT_PART2))
                mstore(0x040, mload(PAIRING_AGG_LHS_AUX_Y_SLOT_PART1))
                mstore(0x060, mload(PAIRING_AGG_LHS_AUX_Y_SLOT_PART2))

                // load [1]_2 
                mstore(0x080, IDENTITY2_X0_PART1)
                mstore(0x0a0, IDENTITY2_X0_PART2)
                mstore(0x0c0, IDENTITY2_X1_PART1)
                mstore(0x0e0, IDENTITY2_X1_PART2)
                mstore(0x100, IDENTITY2_Y0_PART1)
                mstore(0x120, IDENTITY2_Y0_PART2)
                mstore(0x140, IDENTITY2_Y1_PART1)
                mstore(0x160, IDENTITY2_Y1_PART2)

                // load [B]_1 
                mstore(0x180, mload(PROOF_POLY_B_X_SLOT_PART1))
                mstore(0x1a0, mload(PROOF_POLY_B_X_SLOT_PART2))
                mstore(0x1c0, mload(PROOF_POLY_B_Y_SLOT_PART1))
                mstore(0x1e0, mload(PROOF_POLY_B_Y_SLOT_PART2))

                // load [α^4]_2 
                mstore(0x200, ALPHA_POWER4_X0_PART1)
                mstore(0x220, ALPHA_POWER4_X0_PART2)
                mstore(0x240, ALPHA_POWER4_X1_PART1)
                mstore(0x260, ALPHA_POWER4_X1_PART2)
                mstore(0x280, ALPHA_POWER4_Y0_PART1)
                mstore(0x2a0, ALPHA_POWER4_Y0_PART2)
                mstore(0x2c0, ALPHA_POWER4_Y1_PART1)
                mstore(0x2e0, ALPHA_POWER4_Y1_PART2)

                // load [U]_1 
                mstore(0x300, mload(PROOF_POLY_U_X_SLOT_PART1))
                mstore(0x320, mload(PROOF_POLY_U_X_SLOT_PART2))
                mstore(0x340, mload(PROOF_POLY_U_Y_SLOT_PART1))
                mstore(0x360, mload(PROOF_POLY_U_Y_SLOT_PART2))

                // load [α]_2 
                mstore(0x380, ALPHA_X0_PART1)
                mstore(0x3a0, ALPHA_X0_PART2)
                mstore(0x3c0, ALPHA_X1_PART1)
                mstore(0x3e0, ALPHA_X1_PART2)
                mstore(0x400, ALPHA_Y0_PART1)
                mstore(0x420, ALPHA_Y0_PART2)
                mstore(0x440, ALPHA_Y1_PART1)
                mstore(0x460, ALPHA_Y1_PART2)

                // load [V]_1 
                mstore(0x480, mload(PROOF_POLY_V_X_SLOT_PART1))
                mstore(0x4a0, mload(PROOF_POLY_V_X_SLOT_PART2))
                mstore(0x4c0, mload(PROOF_POLY_V_Y_SLOT_PART1))
                mstore(0x4e0, mload(PROOF_POLY_V_Y_SLOT_PART2))

                // load [α^2]_2 
                mstore(0x500, ALPHA_POWER2_X0_PART1)
                mstore(0x520, ALPHA_POWER2_X0_PART2)
                mstore(0x540, ALPHA_POWER2_X1_PART1)
                mstore(0x560, ALPHA_POWER2_X1_PART2)
                mstore(0x580, ALPHA_POWER2_Y0_PART1)
                mstore(0x5a0, ALPHA_POWER2_Y0_PART2)
                mstore(0x5c0, ALPHA_POWER2_Y1_PART1)
                mstore(0x5e0, ALPHA_POWER2_Y1_PART2)

                // load [W]_1 
                mstore(0x600, mload(PROOF_POLY_W_X_SLOT_PART1))
                mstore(0x620, mload(PROOF_POLY_W_X_SLOT_PART2))
                mstore(0x640, mload(PROOF_POLY_W_Y_SLOT_PART1))
                mstore(0x660, mload(PROOF_POLY_W_Y_SLOT_PART2))

                // load [α^3]_2 
                mstore(0x680, ALPHA_POWER3_X0_PART1)
                mstore(0x6a0, ALPHA_POWER3_X0_PART2)
                mstore(0x6c0, ALPHA_POWER3_X1_PART1)
                mstore(0x6e0, ALPHA_POWER3_X1_PART2)
                mstore(0x700, ALPHA_POWER3_Y0_PART1)
                mstore(0x720, ALPHA_POWER3_Y0_PART2)
                mstore(0x740, ALPHA_POWER3_Y1_PART1)
                mstore(0x760, ALPHA_POWER3_Y1_PART2)

                // load [O_pub]_1 
                mstore(0x780, mload(PROOF_POLY_OPUB_X_SLOT_PART1))
                mstore(0x7a0, mload(PROOF_POLY_OPUB_X_SLOT_PART2))
                mstore(0x7c0, mload(PROOF_POLY_OPUB_Y_SLOT_PART1))
                mstore(0x7e0, mload(PROOF_POLY_OPUB_Y_SLOT_PART2))

                // load -[γ]_2
                mstore(0x800, GAMMA_X0_PART1)
                mstore(0x820, GAMMA_X0_PART2)
                mstore(0x840, GAMMA_X1_PART1)
                mstore(0x860, GAMMA_X1_PART2)
                mstore(0x880, GAMMA_MINUS_Y0_PART1)
                mstore(0x8a0, GAMMA_MINUS_Y0_PART2)
                mstore(0x8c0, GAMMA_MINUS_Y1_PART1)
                mstore(0x8e0, GAMMA_MINUS_Y1_PART2)

                // load [O_mid]_1
                mstore(0x900, mload(PROOF_POLY_OMID_X_SLOT_PART1))
                mstore(0x920, mload(PROOF_POLY_OMID_X_SLOT_PART2))
                mstore(0x940, mload(PROOF_POLY_OMID_Y_SLOT_PART1))
                mstore(0x960, mload(PROOF_POLY_OMID_Y_SLOT_PART2))

                // load -[η]_2
                mstore(0x980, ETA_X0_PART1)
                mstore(0x9a0, ETA_X0_PART2)
                mstore(0x9c0, ETA_X1_PART1)
                mstore(0x9e0, ETA_X1_PART2)
                mstore(0xa00, ETA_MINUS_Y0_PART1)
                mstore(0xa20, ETA_MINUS_Y0_PART2)
                mstore(0xa40, ETA_MINUS_Y1_PART1)
                mstore(0xa60, ETA_MINUS_Y1_PART2)

                // load [O_prv]_1
                mstore(0xa80, mload(PROOF_POLY_OPRV_X_SLOT_PART1))
                mstore(0xaa0, mload(PROOF_POLY_OPRV_X_SLOT_PART2))
                mstore(0xac0, mload(PROOF_POLY_OPRV_Y_SLOT_PART1))
                mstore(0xae0, mload(PROOF_POLY_OPRV_Y_SLOT_PART2))

                // load -[δ]_2
                mstore(0xb00, DELTA_X0_PART1)
                mstore(0xb20, DELTA_X0_PART2)
                mstore(0xb40, DELTA_X1_PART1)
                mstore(0xb60, DELTA_X1_PART2)
                mstore(0xb80, DELTA_MINUS_Y0_PART1)
                mstore(0xb80, DELTA_MINUS_Y0_PART2)
                mstore(0xbc0, DELTA_MINUS_Y1_PART1)
                mstore(0xbe0, DELTA_MINUS_Y1_PART2)

                // load [RHS_1]_1 := κ2[Π_{χ}]_1 + κ2^2[M_{χ}]_1 + κ2^3[N_{χ}]_1
                mstore(0xc00, mload(PAIRING_AGG_RHS_1_X_SLOT_PART1))
                mstore(0xc20, mload(PAIRING_AGG_RHS_1_X_SLOT_PART2))
                mstore(0xc40, mload(PAIRING_AGG_RHS_1_Y_SLOT_PART1))
                mstore(0xc60, mload(PAIRING_AGG_RHS_1_Y_SLOT_PART2))

                // load -[x]_2
                mstore(0xc80, X_X0_PART1)
                mstore(0xca0, X_X0_PART2)
                mstore(0xcc0, X_X1_PART1)
                mstore(0xce0, X_X1_PART2)
                mstore(0xd00, X_MINUS_Y0_PART1)
                mstore(0xd20, X_MINUS_Y0_PART2)
                mstore(0xd40, X_MINUS_Y1_PART1)
                mstore(0xd60, X_MINUS_Y1_PART2)

                // load [RHS_1]_2 := κ2[Π_{ζ}]_1 + κ2^2[M_{ζ}]_1 + κ2^3[N_{ζ}]_1
                mstore(0xd80, mload(PAIRING_AGG_RHS_2_X_SLOT_PART1))
                mstore(0xda0, mload(PAIRING_AGG_RHS_2_X_SLOT_PART2))
                mstore(0xdc0, mload(PAIRING_AGG_RHS_2_Y_SLOT_PART1))
                mstore(0xde0, mload(PAIRING_AGG_RHS_2_Y_SLOT_PART2))

                // load -[y]_2
                mstore(0xe00, Y_X0_PART1)
                mstore(0xe20, Y_X0_PART2)
                mstore(0xe40, Y_X1_PART1)
                mstore(0xe60, Y_X1_PART2)
                mstore(0xe80, Y_MINUS_Y0_PART1)
                mstore(0xea0, Y_MINUS_Y0_PART2)
                mstore(0xec0, Y_MINUS_Y1_PART1)
                mstore(0xee0, Y_MINUS_Y1_PART2)

                // precompile call
                let success := staticcall(gas(), 0x0f, 0, 0xf00, 0x00, 0x20)
                if iszero(success) {
                    revertWithMessage(32, "finalPairing: precompile failure")
                }
                if iszero(mload(0)) {
                    revertWithMessage(29, "finalPairing: pairing failure")
                }
            }

            // Step1: Load the PI/proof
            loadProof()

            // Step2: Recompute all the challenges with the transcript
            initializeTranscript()

            // Step3: computation of [F]_1, [G]_1, t_n(χ), t_smax(ζ) and t_ml(χ), K0(χ) and A_pub
            prepareQueries()
            computeLagrangeK0Eval()
            computeAPUB()

        
            // Step4: computation of the final polynomial commitments
            //prepareLHSA()
            //prepareLHSB()
            //prepareLHSC()
            //prepareRHS1()
            //prepareRHS2()
            //prepareAggregatedCommitment()

            // Step5: final pairing
            //finalPairing()
        
            final_result := mload(INTERMEDIARY_SCALAR_APUB_SLOT)
            /*
            t_n_eval: 0x3aa592eea88e3a00037229b84b7df934d3e81cbcec2acddad1c7da845b88736c => same result
            t_mi_eval: 0x0883c82ebdc59dd811060a75f1310e02bb050fec3cf175c854a9678a89139d44 => same result 
            t_smax_eval: 0x0152cbc130b7d836b46839c49a1291ff735ed1d42e3d33683412fb9e1a7091df => same result
            A_eval: 0x11693fa845da02884057edaa7be23c75e3e0a9001f2b70e8e2506a25d22fe418 => same result (not optimized)
            lagrange_K0_eval: 0x38f43d88ce0f0e9eace5e3a7f3c85b4fcf288463b5897bb418eabc3ac76d7181 => same result
            LHS_A: G1serde(Affine { x: 0x05904540f92b2c98923df47d997523e08cca0dc6158dccad58111e1e5e39b065b272ce2841af8c0b561c77b23634992b, y: 0x1729dfb8307c8048f7be52e9c285761ba1be4a79f1dfd8c563566a5f7e738a794459b827e4b2c319895f396a039bd9c3 })
                => different result
            F: G1serde(Affine { x: 0x0a5358b3d72d562fb227613b150e064f5220dd25f8aa005367cff2daf2edef9d4d719661497d1ba2e7c2f89f4e85d94e, y: 0x15e586da79fc25b684bed8fb7945af89063ce22411f314f4e75070e71303ea3662e97ca03c125b8ddbc93394a9c3f032 }) 
                => same result
            */
        }

    }

}