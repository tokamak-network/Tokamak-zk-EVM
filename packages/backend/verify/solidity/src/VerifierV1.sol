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
contract VerifierV1 is IVerifier {


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
    uint256 internal constant PROOF_POLY_OMID_Y_SLOT_PART1 = 0x200 + 0x120 + 0x0e0;
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
    // Π_{A,χ}
    uint256 internal constant PROOF_POLY_PI_A_CHI_X_SLOT_PART1 = 0x200 + 0x120 + 0x4a0;
    uint256 internal constant PROOF_POLY_PI_A_CHI_X_SLOT_PART2 = 0x200 + 0x120 + 0x4c0;
    uint256 internal constant PROOF_POLY_PI_A_CHI_Y_SLOT_PART1 = 0x200 + 0x120 + 0x4e0;
    uint256 internal constant PROOF_POLY_PI_A_CHI_Y_SLOT_PART2 = 0x200 + 0x120 + 0x500;
    // Π{A,ζ}
    uint256 internal constant PROOF_POLY_PI_A_ZETA_X_SLOT_PART1 = 0x200 + 0x120 + 0x520;
    uint256 internal constant PROOF_POLY_PI_A_ZETA_X_SLOT_PART2 = 0x200 + 0x120 + 0x540;
    uint256 internal constant PROOF_POLY_PI_A_ZETA_Y_SLOT_PART1 = 0x200 + 0x120 + 0x560;
    uint256 internal constant PROOF_POLY_PI_A_ZETA_Y_SLOT_PART2 = 0x200 + 0x120 + 0x580;
    // Π_{B,χ}
    uint256 internal constant PROOF_POLY_PI_B_CHI_X_SLOT_PART1 = 0x200 + 0x120 + 0x5a0;
    uint256 internal constant PROOF_POLY_PI_B_CHI_X_SLOT_PART2 = 0x200 + 0x120 + 0x5c0;
    uint256 internal constant PROOF_POLY_PI_B_CHI_Y_SLOT_PART1 = 0x200 + 0x120 + 0x5e0;
    uint256 internal constant PROOF_POLY_PI_B_CHI_Y_SLOT_PART2 = 0x200 + 0x120 + 0x600;
    // Π_{C,χ}  
    uint256 internal constant PROOF_POLY_PI_C_CHI_X_SLOT_PART1 = 0x200 + 0x120 + 0x620;
    uint256 internal constant PROOF_POLY_PI_C_CHI_X_SLOT_PART2 = 0x200 + 0x120 + 0x640;
    uint256 internal constant PROOF_POLY_PI_C_CHI_Y_SLOT_PART1 = 0x200 + 0x120 + 0x660;
    uint256 internal constant PROOF_POLY_PI_C_CHI_Y_SLOT_PART2 = 0x200 + 0x120 + 0x680;
    // Π{C,ζ}
    uint256 internal constant PROOF_POLY_PI_C_ZETA_X_SLOT_PART1 = 0x200 + 0x120 + 0x6a0;
    uint256 internal constant PROOF_POLY_PI_C_ZETA_X_SLOT_PART2 = 0x200 + 0x120 + 0x6c0;
    uint256 internal constant PROOF_POLY_PI_C_ZETA_Y_SLOT_PART1 = 0x200 + 0x120 + 0x6e0;
    uint256 internal constant PROOF_POLY_PI_C_ZETA_Y_SLOT_PART2 = 0x200 + 0x120 + 0x700;
    // B
    uint256 internal constant PROOF_POLY_B_X_SLOT_PART1 = 0x200 + 0x120 + 0x720;
    uint256 internal constant PROOF_POLY_B_X_SLOT_PART2 = 0x200 + 0x120 + 0x740;
    uint256 internal constant PROOF_POLY_B_Y_SLOT_PART1 = 0x200 + 0x120 + 0x760;
    uint256 internal constant PROOF_POLY_B_Y_SLOT_PART2 = 0x200 + 0x120 + 0x780;
    // R
    uint256 internal constant PROOF_POLY_R_X_SLOT_PART1 = 0x200 + 0x120 + 0x7a0;
    uint256 internal constant PROOF_POLY_R_X_SLOT_PART2 = 0x200 + 0x120 + 0x7c0;
    uint256 internal constant PROOF_POLY_R_Y_SLOT_PART1 = 0x200 + 0x120 + 0x7e0;
    uint256 internal constant PROOF_POLY_R_Y_SLOT_PART2 = 0x200 + 0x120 + 0x800;
    // M_ζ
    uint256 internal constant PROOF_POLY_M_ZETA_X_SLOT_PART1 = 0x200 + 0x120 + 0x820;
    uint256 internal constant PROOF_POLY_M_ZETA_X_SLOT_PART2 = 0x200 + 0x120 + 0x840;
    uint256 internal constant PROOF_POLY_M_ZETA_Y_SLOT_PART1 = 0x200 + 0x120 + 0x860;
    uint256 internal constant PROOF_POLY_M_ZETA_Y_SLOT_PART2 = 0x200 + 0x120 + 0x880;
    // M_χ
    uint256 internal constant PROOF_POLY_M_CHI_X_SLOT_PART1 = 0x200 + 0x120 + 0x8a0;
    uint256 internal constant PROOF_POLY_M_CHI_X_SLOT_PART2 = 0x200 + 0x120 + 0x8c0;
    uint256 internal constant PROOF_POLY_M_CHI_Y_SLOT_PART1 = 0x200 + 0x120 + 0x8e0;
    uint256 internal constant PROOF_POLY_M_CHI_Y_SLOT_PART2 = 0x200 + 0x120 + 0x900;
    // N_ζ
    uint256 internal constant PROOF_POLY_N_ZETA_X_SLOT_PART1 = 0x200 + 0x120 + 0x920;
    uint256 internal constant PROOF_POLY_N_ZETA_X_SLOT_PART2 = 0x200 + 0x120 + 0x940;
    uint256 internal constant PROOF_POLY_N_ZETA_Y_SLOT_PART1 = 0x200 + 0x120 + 0x960;
    uint256 internal constant PROOF_POLY_N_ZETA_Y_SLOT_PART2 = 0x200 + 0x120 + 0x980;
    // N_χ
    uint256 internal constant PROOF_POLY_N_CHI_X_SLOT_PART1 = 0x200 + 0x120 + 0x9a0;
    uint256 internal constant PROOF_POLY_N_CHI_X_SLOT_PART2 = 0x200 + 0x120 + 0x9c0;
    uint256 internal constant PROOF_POLY_N_CHI_Y_SLOT_PART1 = 0x200 + 0x120 + 0x9e0;
    uint256 internal constant PROOF_POLY_N_CHI_Y_SLOT_PART2 = 0x200 + 0x120 + 0xa00;
    // O_pub
    uint256 internal constant PROOF_POLY_OPUB_X_SLOT_PART1 = 0x200 + 0x120 + 0xa20;
    uint256 internal constant PROOF_POLY_OPUB_X_SLOT_PART2 = 0x200 + 0x120 + 0xa40;
    uint256 internal constant PROOF_POLY_OPUB_Y_SLOT_PART1 = 0x200 + 0x120 + 0xa60;
    uint256 internal constant PROOF_POLY_OPUB_Y_SLOT_PART2 = 0x200 + 0x120 + 0xa80;
    // A
    uint256 internal constant PROOF_POLY_A_X_SLOT_PART1 = 0x200 + 0x120 + 0xaa0;
    uint256 internal constant PROOF_POLY_A_X_SLOT_PART2 = 0x200 + 0x120 + 0xac0;
    uint256 internal constant PROOF_POLY_A_Y_SLOT_PART1 = 0x200 + 0x120 + 0xae0;
    uint256 internal constant PROOF_POLY_A_Y_SLOT_PART2 = 0x200 + 0x120 + 0xb00;
    // R_xy
    uint256 internal constant PROOF_R1XY_SLOT = 0x200 + 0x120 + 0xb20;
    // R'_xy
    uint256 internal constant PROOF_R2XY_SLOT = 0x200 + 0x120 + 0xb40;
    // R''_xy
    uint256 internal constant PROOF_R3XY_SLOT = 0x200 + 0x120 + 0xb60;
    // V_xy
    uint256 internal constant PROOF_VXY_SLOT = 0x200 + 0x120 + 0xb80;


    /*//////////////////////////////////////////////////////////////
            transcript slot (used for challenge computation)
    //////////////////////////////////////////////////////////////*/

    uint256 internal constant TRANSCRIPT_BEGIN_SLOT = 0x200 + 0x120 + 0xb80 + 0x00;
    uint256 internal constant TRANSCRIPT_DST_BYTE_SLOT = 0x200 + 0x120 + 0xb80 + 0x03; 
    uint256 internal constant TRANSCRIPT_STATE_0_SLOT = 0x200 + 0x120 + 0xb80 + 0x04;
    uint256 internal constant TRANSCRIPT_STATE_1_SLOT = 0x200 + 0x120 + 0xb80 + 0x24;
    uint256 internal constant TRANSCRIPT_CHALLENGE_SLOT = 0x200 + 0x120 + 0xb80 + 0x44;

    /*//////////////////////////////////////////////////////////////
                             Challenges
    //////////////////////////////////////////////////////////////*/

    uint256 internal constant CHALLENGE_THETA_0_SLOT = 0x200 + 0x120 + 0xb80 + 0x80 + 0x000;
    uint256 internal constant CHALLENGE_THETA_1_SLOT = 0x200 + 0x120 + 0xb80 + 0x80 + 0x020;
    uint256 internal constant CHALLENGE_THETA_2_SLOT = 0x200 + 0x120 + 0xb80 + 0x80 +0x040;
    uint256 internal constant CHALLENGE_KAPPA_0_SLOT = 0x200 + 0x120 + 0xb80 + 0x80 +0x060;
    uint256 internal constant CHALLENGE_KAPPA_1_SLOT = 0x200 + 0x120 + 0xb80 + 0x80 +0x080;
    uint256 internal constant CHALLENGE_KAPPA_2_SLOT = 0x200 + 0x120 + 0xb80 + 0x80 +0x0a0;
    uint256 internal constant CHALLENGE_ZETA_SLOT = 0x200 + 0x120 + 0xb80 + 0x80 +0x0c0;
    uint256 internal constant CHALLENGE_XI_SLOT = 0x200 + 0x120 + 0xb80 + 0x80 +0x0e0;
    uint256 internal constant CHALLENGE_CHI_SLOT = 0x200 + 0x120 + 0xb80 +0x80 + 0x100;

    /*//////////////////////////////////////////////////////////////
                       Intermediary verifier state
    //////////////////////////////////////////////////////////////*/

    // [F]_1
    uint256 internal constant INTERMERDIARY_POLY_F_X_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 +0x100 + 0x020;
    uint256 internal constant INTERMERDIARY_POLY_F_X_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 +0x100 + 0x040;
    uint256 internal constant INTERMERDIARY_POLY_F_Y_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 +0x100 + 0x060;
    uint256 internal constant INTERMERDIARY_POLY_F_Y_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 +0x100 + 0x080;

    // [G]_1
    uint256 internal constant INTERMERDIARY_POLY_G_X_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 +0x100 + 0x0a0;
    uint256 internal constant INTERMERDIARY_POLY_G_X_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x0c0;
    uint256 internal constant INTERMERDIARY_POLY_G_Y_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x0e0;
    uint256 internal constant INTERMERDIARY_POLY_G_Y_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x100;

    // [Π_{χ}]_1
    uint256 internal constant INTERMERDIARY_POLY_PI_CHI_X_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x120;
    uint256 internal constant INTERMERDIARY_POLY_PI_CHI_X_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x140;
    uint256 internal constant INTERMERDIARY_POLY_PI_CHI_Y_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x160;
    uint256 internal constant INTERMERDIARY_POLY_PI_CHI_Y_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x180;

    // [Π_{ζ}]_1
    uint256 internal constant INTERMERDIARY_POLY_PI_ZETA_X_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x1a;
    uint256 internal constant INTERMERDIARY_POLY_PI_ZETA_X_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x1c0;
    uint256 internal constant INTERMERDIARY_POLY_PI_ZETA_Y_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x1e0;
    uint256 internal constant INTERMERDIARY_POLY_PI_ZETA_Y_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x200;

    // t_n(χ)
    uint256 internal constant INTERMERDIARY_SCALAR_T_N_CHI_SLOT = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x220;
    // t_smax(ζ)
    uint256 internal constant INTERMERDIARY_SCALAR_T_SMAX_ZETA_SLOT = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x240;
    // t_ml(χ)
    uint256 internal constant INTERMERDIARY_SCALAR_T_MI_CHI_SLOT = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x260;
    // K_0(χ)
    uint256 internal constant INTERMEDIARY_SCALAR_KO_SLOT = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x280;
    // A_pub
    uint256 internal constant INTERMEDIARY_SCALAR_APUB_SLOT = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0;

    /*//////////////////////////////////////////////////////////////
                             Aggregated commitment
    //////////////////////////////////////////////////////////////*/

    uint256 internal constant AGG_LHS_A_X_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x020;
    uint256 internal constant AGG_LHS_A_X_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x040;
    uint256 internal constant AGG_LHS_A_Y_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x060;
    uint256 internal constant AGG_LHS_A_Y_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x080; 

    uint256 internal constant AGG_LHS_B_X_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x0a0;
    uint256 internal constant AGG_LHS_B_X_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x0c0;
    uint256 internal constant AGG_LHS_B_Y_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x0e0;
    uint256 internal constant AGG_LHS_B_Y_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x100;

    uint256 internal constant AGG_LHS_C_X_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x120;
    uint256 internal constant AGG_LHS_C_X_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x140;
    uint256 internal constant AGG_LHS_C_Y_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x160;
    uint256 internal constant AGG_LHS_C_Y_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x180;

    uint256 internal constant PAIRING_AGG_LHS_X_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x1a0;
    uint256 internal constant PAIRING_AGG_LHS_X_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x1c0;
    uint256 internal constant PAIRING_AGG_LHS_Y_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x1e0;
    uint256 internal constant PAIRING_AGG_LHS_Y_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x200;

    uint256 internal constant PAIRING_AGG_AUX_X_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x220;
    uint256 internal constant PAIRING_AGG_AUX_X_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x240;
    uint256 internal constant PAIRING_AGG_AUX_Y_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x260;
    uint256 internal constant PAIRING_AGG_AUX_Y_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x280;

    uint256 internal constant PAIRING_AGG_LHS_AUX_X_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x2a0;
    uint256 internal constant PAIRING_AGG_LHS_AUX_X_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x2c0;
    uint256 internal constant PAIRING_AGG_LHS_AUX_Y_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x2e0;
    uint256 internal constant PAIRING_AGG_LHS_AUX_Y_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x300;

    uint256 internal constant PAIRING_AGG_RHS_1_X_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x320;
    uint256 internal constant PAIRING_AGG_RHS_1_X_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x340;
    uint256 internal constant PAIRING_AGG_RHS_1_Y_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x360;
    uint256 internal constant PAIRING_AGG_RHS_1_Y_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x380;

    uint256 internal constant PAIRING_AGG_RHS_2_X_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x3a0;
    uint256 internal constant PAIRING_AGG_RHS_2_X_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x3c0;
    uint256 internal constant PAIRING_AGG_RHS_2_Y_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x3e0;
    uint256 internal constant PAIRING_AGG_RHS_2_Y_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x400;

    /*//////////////////////////////////////////////////////////////
                             Pairing data
    //////////////////////////////////////////////////////////////*/

    uint256 internal constant BUFFER_AGGREGATED_POLY_X_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x420;
    uint256 internal constant BUFFER_AGGREGATED_POLY_X_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x440;
    uint256 internal constant BUFFER_AGGREGATED_POLY_Y_SLOT_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x460;
    uint256 internal constant BUFFER_AGGREGATED_POLY_Y_SLOT_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480;

    /*//////////////////////////////////////////////////////////////
                        Verification keys
    //////////////////////////////////////////////////////////////*/

    // [K^_1(X)L^-1(X)]_1
    uint256 internal constant VK_POLY_KXLX_X_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x020;
    uint256 internal constant VK_POLY_KXLX_X_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x040;
    uint256 internal constant VK_POLY_KXLX_Y_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x060;
    uint256 internal constant VK_POLY_KXLX_Y_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x080;

    // [x]_1
    uint256 internal constant VK_POLY_X_X_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x0a0;
    uint256 internal constant VK_POLY_X_X_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x0c0;
    uint256 internal constant VK_POLY_X_Y_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x0e0;
    uint256 internal constant VK_POLY_X_Y_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x100;

    // [y]_1
    uint256 internal constant VK_POLY_Y_X_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x120;
    uint256 internal constant VK_POLY_Y_X_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x140;
    uint256 internal constant VK_POLY_Y_Y_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x160;
    uint256 internal constant VK_POLY_Y_Y_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x180;

    // [1]_1
    uint256 internal constant VK_IDENTITY_X_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x1a0;
    uint256 internal constant VK_IDENTITY_X_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x1c0;
    uint256 internal constant VK_IDENTITY_Y_PART1 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x1e0;
    uint256 internal constant VK_IDENTITY_Y_PART2 = 0x200 + 0x120 + 0xb80 + 0x80 + 0x100 + 0x2a0 + 0x480 + 0x200;

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
    uint256 internal constant CONSTANT_OMEGA_N = 3;
    // s_max
    uint256 internal constant CONSTANT_SMAX = 64;
    // m_i
    uint256 internal constant CONSTANT_MI = 512;
    // l
    uint256 internal constant CONSTANT_L = 32;

    // ω_{m_i}^{-1}
    uint256 internal constant OMEGA_MI_MINUS_1 = 0x1907a56e80f82b2df675522e37ad4eca1c510ebfb4543a3efb350dbef02a116e;

    // ω_smax^{-1}
    uint256 internal constant OMEGA_SMAX_MINUS_1 = 0x199cdaee7b3c79d6566009b5882952d6a41e85011d426b52b891fa3f982b68c5;


    /*//////////////////////////////////////////////////////////////
                        G2 elements
    //////////////////////////////////////////////////////////////*/

    // [1]_2
    uint256 internal constant IDENTITY2_X0_PART1 = 0x0000000000000000000000000000000013eba9c557ad7803b7c03e479ab63f19;
    uint256 internal constant IDENTITY2_X0_PART2 = 0x6c5f5d7f161431a0c4c33fa60834a7fc2322cabc3cdb863ce9ee3301870c79f7;
    uint256 internal constant IDENTITY2_X1_PART1 = 0x000000000000000000000000000000000d6524604a1d6da9ede18ffb6bac7ab5;
    uint256 internal constant IDENTITY2_X1_PART2 = 0x4c0fbe030bbe5ae0aa84b3fa621c1b777c4d45b2331c091c9d322ea7007a2371;
    uint256 internal constant IDENTITY2_Y0_PART1 = 0x000000000000000000000000000000000f90838eecb1d8115fc6e11deec85581;
    uint256 internal constant IDENTITY2_Y0_PART2 = 0xa5117a88df18b03bb846b3d0470aadb2e2cb3c89fde70b6cc27d87c8d6c2964a;
    uint256 internal constant IDENTITY2_Y1_PART1 = 0x00000000000000000000000000000000112cfe400d562e498a8c9b666e7b9468;
    uint256 internal constant IDENTITY2_Y1_PART2 = 0x74af4ff499f44511585e82b975bbaea6de861ead1cdd37a42f5e248b96c99a35;

    // [α]_2
    uint256 internal constant ALPHA_X0_PART1 = 0x0000000000000000000000000000000019b893f15164da6a16a1fb4f88a9e62f;
    uint256 internal constant ALPHA_X0_PART2 = 0x6447c87c55d60b2106ac52ca0c1f15abff36eb7e990e8a8fd297bb53e8bee633;
    uint256 internal constant ALPHA_X1_PART1 = 0x000000000000000000000000000000001718f7b6f1031a0b541d15fbcd20f04e;
    uint256 internal constant ALPHA_X1_PART2 = 0x42310156a2b3f0a374460522a651fe7baee4b873f8132a92635590ca6238add6;
    uint256 internal constant ALPHA_Y0_PART1 = 0x000000000000000000000000000000000787b36fca4ee710ed94e55bb5a944f4;
    uint256 internal constant ALPHA_Y0_PART2 = 0x08413a7fb944aa01171a1d274c4d8159dcae5e5489cffa1f3dea529d77084ec9;
    uint256 internal constant ALPHA_Y1_PART1 = 0x00000000000000000000000000000000147fce5c8a3d210313984fba044d70e9;
    uint256 internal constant ALPHA_Y1_PART2 = 0x5718938c1e82f23e2e1abd765e01b1ffafbd84c35291ad473ed3f51f305fcd56;

    // [α^2]_2
    uint256 internal constant ALPHA_POWER2_X0_PART1 = 0x000000000000000000000000000000000dbe63f5e26463ec94818b34301815d6;
    uint256 internal constant ALPHA_POWER2_X0_PART2 = 0x2df5132c46709ef587eafae1f40e416489706c84488f6daa7bbe6a836a51b584;
    uint256 internal constant ALPHA_POWER2_X1_PART1 = 0x0000000000000000000000000000000008422e66a8dbab026df39ed1e4994097;
    uint256 internal constant ALPHA_POWER2_X1_PART2 = 0xc8a46d6e3fed57b9a09bbb5f724f0a0a31a79aeb76d3aaf7e4a0f4966eef5917;
    uint256 internal constant ALPHA_POWER2_Y0_PART1 = 0x0000000000000000000000000000000006c6534253649dbd66e91a1ae3c962ac; 
    uint256 internal constant ALPHA_POWER2_Y0_PART2 = 0xff5e4784f40b379e030f046f17829518e39198ba9c61fb811d621ee24686e161;
    uint256 internal constant ALPHA_POWER2_Y1_PART1 = 0x0000000000000000000000000000000002052e3a062426772a58e659333a8dc2;
    uint256 internal constant ALPHA_POWER2_Y1_PART2 = 0xafc4f51e5c20afe497adf128414e3ed637fe08f30c7d8c7e865437ae21d1a436;

    // [α^3]_2
    uint256 internal constant ALPHA_POWER3_X0_PART1 = 0x000000000000000000000000000000000e74451880f03c8cc24a01ba1a7d3b2d;
    uint256 internal constant ALPHA_POWER3_X0_PART2 = 0x9c6a04b979a76bf53757478699e360e639c72e3bd60f4ecee41d85ac6f3793f1;
    uint256 internal constant ALPHA_POWER3_X1_PART1 = 0x0000000000000000000000000000000014344ebe164a6add36f6be2d89f83da2;
    uint256 internal constant ALPHA_POWER3_X1_PART2 = 0x349619dbed88685aa3c78c83247357a784d9248f0b295012507144d57ebfe578;
    uint256 internal constant ALPHA_POWER3_Y0_PART1 = 0x00000000000000000000000000000000074686a8a57574bb51049bad20cfede2;
    uint256 internal constant ALPHA_POWER3_Y0_PART2 = 0x761863bd963a026c0c5cc5ce3d45981d94b325345e22ecb4a30f046681543076;
    uint256 internal constant ALPHA_POWER3_Y1_PART1 = 0x000000000000000000000000000000000a72744aa033de609b077bbb78041b8b;
    uint256 internal constant ALPHA_POWER3_Y1_PART2 = 0xcea6446e06e7a9497c8923a30b8529f30bf7ddafe6da542a2c70f3d88bcb400c;

    //[α^4]_2
    uint256 internal constant ALPHA_POWER4_X0_PART1 = 0x0000000000000000000000000000000001b563601490368cd612a4e85921fe69;
    uint256 internal constant ALPHA_POWER4_X0_PART2 = 0x50a0c83cdbfe1456388c005bfed9b0b0dd452ece52e55d744a1f8543098055b0;
    uint256 internal constant ALPHA_POWER4_X1_PART1 = 0x00000000000000000000000000000000119b407d6c48fb24c06d618a8a1df7af;
    uint256 internal constant ALPHA_POWER4_X1_PART2 = 0x31d656b3dd1415bf7a4b25231f9b6ad70c249e2d36232339c91a3c45b7b3de37;
    uint256 internal constant ALPHA_POWER4_Y0_PART1 = 0x00000000000000000000000000000000189f14b5279c1f6eba5f4beb8d0d25b3;
    uint256 internal constant ALPHA_POWER4_Y0_PART2 = 0x6635b8418a1aa177c1b8ea5fdbe5954945de02d8d0f4251e79a62a019c4c0d36;
    uint256 internal constant ALPHA_POWER4_Y1_PART1 = 0x000000000000000000000000000000000001c2b90a8787fbdc5d9499df455748;
    uint256 internal constant ALPHA_POWER4_Y1_PART2 = 0xa875d7dc788bd285078422d85606aedbfe142c9c266f2b7efd50542527955c53;

    // -[γ]_2
    uint256 internal constant GAMMA_X0_PART1 = 0x00000000000000000000000000000000169d1cf9e84829991100c868a076602e;
    uint256 internal constant GAMMA_X0_PART2 = 0x9b2f3982ba69b0452611869a60eb6a223c02244d307faad1b5df3c623d6d800b;
    uint256 internal constant GAMMA_X1_PART1 = 0x0000000000000000000000000000000009190c611011f527c9bf41d149c2879c;
    uint256 internal constant GAMMA_X1_PART2 = 0x33490aabe6ad12bb1fec6d58285c7739a0c82e9d853c7028f1e8dc2ca488f4fe;
    uint256 internal constant GAMMA_MINUS_Y0_PART1 = 0x0000000000000000000000000000000041d09bf4f80399b5ac4385b410ecfc33;
    uint256 internal constant GAMMA_MINUS_Y0_PART2 = 0x8f3b32d58deeed034801fbd422a29eae90e3103cce14364686867f24bf1e10b4;
    uint256 internal constant GAMMA_MINUS_Y1_PART1 = 0x00000000000000000000000000000000003940bf5163cbb6a0b91b1d7d667d0f;
    uint256 internal constant GAMMA_MINUS_Y1_PART2 = 0x0312b0b6a1a2b9cd741c8c4c4a29e658db60358f9b9b58b13dea50509b99b988;

    // -[η]_2
    uint256 internal constant ETA_X0_PART1 = 0x000000000000000000000000000000001948eb1ab96b922d1ca4cf011c444828;
    uint256 internal constant ETA_X0_PART2 = 0x53c670db6898dbb10a14454b6cf68b4ff61a49eb6b34216f1b2a2f7d6f096059;
    uint256 internal constant ETA_X1_PART1 = 0x00000000000000000000000000000000090e26c2a773f619f360bc19ac320cbb;
    uint256 internal constant ETA_X1_PART2 = 0x64eeef9dd44c99a00c818acf88fc65895ce511a120f66bc084ac0ac8b6262e72;
    uint256 internal constant ETA_MINUS_Y0_PART1 = 0x000000000000000000000000000000000f576a8b0a4b2db7dda7e845e31750a2;
    uint256 internal constant ETA_MINUS_Y0_PART2 = 0x2962738f855ed3e5c63399a25efc0755c5368fa2f8027a5cf46f13fc0c1c56d6;
    uint256 internal constant ETA_MINUS_Y1_PART1 = 0x0000000000000000000000000000000019daf6de0a026c1d3bc941d0ceacd39f;
    uint256 internal constant ETA_MINUS_Y1_PART2 = 0x6b07b36b9ab4033b4c7b9a92d87f5f2b0fbcf9638c0fd9ca11ce0c8e635be1f5;

    // -[δ]_2
    uint256 internal constant DELTA_X0_PART1 = 0x000000000000000000000000000000001057fb2130234c9b3713e5d355ea8b16;
    uint256 internal constant DELTA_X0_PART2 = 0xe0f8f3cbf4db75d67e91fcbc1539cc5463a222270fcd64bfd2b2eddf5f6fc9dc;
    uint256 internal constant DELTA_X1_PART1 = 0x00000000000000000000000000000000041cb90fc16bb74f283feae04c3f829d;
    uint256 internal constant DELTA_X1_PART2 = 0xcedf077d14166998966e24d245d04e7b8ba1869bf941f0b324027752d6b25092;
    uint256 internal constant DELTA_MINUS_Y0_PART1 = 0x00000000000000000000000000000000fabd7c919c3aafc982277025c21d5d78;
    uint256 internal constant DELTA_MINUS_Y0_PART2 = 0xe0adf7af5ad6e5d9e0f634dc06390d61eb06a3926ac3cb6a7e1d8c5c259ca6fa;
    uint256 internal constant DELTA_MINUS_Y1_PART1 = 0x000000000000000000000000000000000015547ca95608bf1fee4d41d0e1a168;
    uint256 internal constant DELTA_MINUS_Y1_PART2 = 0xe1b7f4fc4d14a4d4e9a161b33c925de61d7b39a768ee3f095b982c28763ddcfd;

    // -[x]_2
    uint256 internal constant X_X0_PART1 = 0x000000000000000000000000000000001926df137c4c3f8ac02ccc0fe801bf78;
    uint256 internal constant X_X0_PART2 = 0xdd658ad468db31ebf1d19f3d6482ce2b3e0ab0e1081e417bc0d8b3015d33b658;
    uint256 internal constant X_X1_PART1 = 0x000000000000000000000000000000000bae82374bd502659e9bfe653ad97ef6;
    uint256 internal constant X_X1_PART2 = 0x3ab69d9044b87693f76f589a9f05f181276b9603fe9e2d1c5070a1a196550734;
    uint256 internal constant X_MINUS_Y0_PART1 = 0x000000000000000000000000000000000b295deb9d01b5a0525f8daa50a9c6b5;
    uint256 internal constant X_MINUS_Y0_PART2 = 0xe2af643ba954a0c0648632b6096d7dfc638f77c2ef74845c657e829ea47c493c;
    uint256 internal constant X_MINUS_Y1_PART1 = 0x000000000000000000000000000000001b44b69934d02e1781f2b02a1fb77485;
    uint256 internal constant X_MINUS_Y1_PART2 = 0x18c3999aab226b072a0a09b0faaaa633f65c4e5b316666dcbc47618618102125;

    //-[y]_2
    uint256 internal constant Y_X0_PART1 = 0x0000000000000000000000000000000001e22998a07522d568e5975c81f1b3d2;
    uint256 internal constant Y_X0_PART2 = 0x57867dd6c576ebca58bc03705ed207ff0dfc1ba535d4596147e6d51727d02b14;
    uint256 internal constant Y_X1_PART1 = 0x000000000000000000000000000000000f0dde9eac97cc66c1db076b3428b58f;
    uint256 internal constant Y_X1_PART2 = 0x027b155e36fa282871706780825522909021b98c1b623b6ee02b4d1587c08254;
    uint256 internal constant Y_MINUS_Y0_PART1 = 0x0000000000000000000000000000000003e1698bd7b51264f742309d6884d4fd;
    uint256 internal constant Y_MINUS_Y0_PART2 = 0x93c9f31705236704dabdd27cd21acaa02cbfd4fecef53858479c0421bd5d5daa;
    uint256 internal constant Y_MINUS_Y1_PART1 = 0x0000000000000000000000000000000018e2a93a6089636101d00664bbb09566;
    uint256 internal constant Y_MINUS_Y1_PART2 = 0x24e5998dc4547af7af5e60acfb9310abecceb6eeb367085d4a4d0e37b6a1bef0;


    /// @notice Load verification keys to memory in runtime.
    /// @dev The constants are loaded into memory in a specific layout declared in the constants starting from
    /// `VK_` prefix.
    /// NOTE: Function may corrupt the memory state if some memory was used before this function was called.
    function _loadVerificationKey() internal pure virtual {
        assembly {
            // preproccessed KL commitment vk         
            mstore(VK_POLY_KXLX_X_PART1, 0x00000000000000000000000000000000063099278fcb7d55becb383a9345832c)
            mstore(VK_POLY_KXLX_X_PART2, 0xb43219eee77ed6e247ee5922a1f19aa4bdc8f5940dc9240b20a04c4e1a897086)
            mstore(VK_POLY_KXLX_Y_PART1, 0x000000000000000000000000000000001176a6fe4c4db835d9099a0bfb8a9159)
            mstore(VK_POLY_KXLX_Y_PART2, 0x887624ca328cf813eb4038c22237e5121220946a136308ba3555100ee2a7be59)

            // [x]_1 vk
            mstore(VK_POLY_X_X_PART1, 0x00000000000000000000000000000000097b16a0adf5f112a3aea1fadd03c33c)
            mstore(VK_POLY_X_X_PART2, 0x1df8944f0db2a6d2bcf77aad2199f61c87d2abb6296f56f3c761aaa3e49c9b64)
            mstore(VK_POLY_X_Y_PART1, 0x000000000000000000000000000000000ff5f37c65588889739b20d4f383792b)
            mstore(VK_POLY_X_Y_PART2, 0xfef7b0d38d0143f1919fc0417a1f2d689b3fc3dac384e5a90a4c4270b200bf8c)

            // [y]_1 vk
            mstore(VK_POLY_Y_X_PART1, 0x000000000000000000000000000000000766f19c78578fdf77d09bb08ec940ad)
            mstore(VK_POLY_Y_X_PART2, 0xc98f956efe605aa52519ecdbdd2258763760787f3234533fa4dde15f5b94a99b)
            mstore(VK_POLY_Y_Y_PART1, 0x000000000000000000000000000000000fbb9932fc437ad799b2f07360e1dddb)
            mstore(VK_POLY_Y_Y_PART2, 0x2a9d76a4c6019403f5379ec18a6b8b5f38533ae2dce1e557ab59b025a343223b)

            // [1]_1 vk
            mstore(VK_IDENTITY_X_PART1, 0x0000000000000000000000000000000012b72b8a5a5d7613f69175b6d9cbdfe2)
            mstore(VK_IDENTITY_X_PART2, 0xccbad6739d6ab455a7ad91a807b66a8d907e4cc936250fe2a79038d2bc072772)
            mstore(VK_IDENTITY_Y_PART1, 0x000000000000000000000000000000000f0b72ad561acc45a5d55046986dbb6b)
            mstore(VK_IDENTITY_Y_PART2, 0x2a3daad1efd75da947a919edd9b5bd10f38cd1e5317d49a46cc41a8527711687)
        }
    }

    function verify(
        uint128[] calldata, //_proof part1 (16 bytes)
        uint256[] calldata // _proof part2 (32 bytes)
    ) public view virtual returns (bytes32 result) {
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

            function coordinatesNeg(y0, y1) -> negY0, negY1 {
                // Check if both y0 and y1 are zero
                if and(iszero(y0), iszero(y1)) {
                    negY0 := 0
                    negY1 := 0
                    leave
                }

                // Calculate Q_MOD - y
                if lt(Q_MOD_PART2, y1) {
                    // If Q_MOD_PART2 < y1, we need to borrow from the high part
                    // Calculate (2^256 + Q_MOD_PART2) - y1
                    negY1 := add(not(y1), 1) // 2^256 - y1 = complement(y1) + 1
                    negY1 := add(negY1, Q_MOD_PART2)
                    // Subtract 1 from the high part (borrow)
                    negY0 := sub(Q_MOD_PART1, 1)
                    // Subtract y0 from the high part
                    negY0 := sub(negY0, y0)
                } 
                if gt(Q_MOD_PART2, y1) {
                    negY1 := sub(Q_MOD_PART2, y1)
                    negY0 := sub(Q_MOD_PART1, y0)
                }

                // If the result is exactly Q, we return 0
                if and(eq(negY0, Q_MOD_PART1), eq(negY1, Q_MOD_PART2)) {
                    negY0 := 0
                    negY1 := 0
                }
            }

            /// @dev Performs a point subtraction operation and updates the first point with the result.
            function g1pointSubAssign(p1, p2) {
                mstore(0x00, mload(p1))             // x1
                mstore(0x20, mload(add(p1, 0x20)))  // x1
                mstore(0x40, mload(add(p1, 0x40)))  // y1
                mstore(0x60, mload(add(p1, 0x60)))  // y1

                // computes -y2 and -y2' coordinates 
                let minus_y2_part1
                let minus_y2_part2 
                minus_y2_part1, minus_y2_part2 := coordinatesNeg(mload(add(p2, 0x40)), mload(add(p2, 0x60)))

                mstore(0x80, mload(p2))             // x2
                mstore(0xa0, mload(add(p2, 0x20)))  // x2
                mstore(0xc0, minus_y2_part1)        // -y2
                mstore(0xe0, minus_y2_part2)        // -y2

                if iszero(staticcall(gas(), 0x0b, 0x00, 0x100, p1, 0x80)) {
                    revertWithMessage(28, "pointSubAssign: G1ADD failed")
                }
            }

            /// @dev Performs a point subtraction operation and stores the result in a given memory destination.
            function g1pointSubIntoDest(p1, p2, dest) {
                mstore(0x00, mload(p1))             // x1
                mstore(0x20, mload(add(p1, 0x20)))  // x1
                mstore(0x40, mload(add(p1, 0x40)))  // y1
                mstore(0x60, mload(add(p1, 0x60)))  // y1

                // computes -y2 and -y2' coordinates 
                let minus_y2_part1
                let minus_y2_part2 
                minus_y2_part1, minus_y2_part2 := coordinatesNeg(mload(add(p2, 0x40)), mload(add(p2, 0x60)))

                mstore(0x80, mload(p2))             // x2
                mstore(0xa0, mload(add(p2, 0x20)))  // x2
                mstore(0xc0, minus_y2_part1)        // -y2
                mstore(0xe0, minus_y2_part2)        // -y2

                if iszero(staticcall(gas(), 0x0b, 0x00, 0x100, dest, 0x80)) {
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
                let isValid := eq(part1LengthInWords, 48) 
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
                // PROOF Π_{A,χ}, Π_{A,ζ}, Π_{B,χ}, Π_{C,χ}, Π_{C,ζ}
                {
                    let x0 := calldataload(add(offset, 0x2e4))
                    let y0 := calldataload(add(offset, 0x304))
                    let x1 := calldataload(add(offset, 0x324))
                    let y1 := calldataload(add(offset, 0x344))
                    let x2 := calldataload(add(offset, 0x364))
                    let y2 := calldataload(add(offset, 0x384))
                    let x3 := calldataload(add(offset, 0x3a4))
                    let y3 := calldataload(add(offset, 0x3c4))
                    let x4 := calldataload(add(offset, 0x3e4))
                    let y4 := calldataload(add(offset, 0x404))
                    mstore(PROOF_POLY_PI_A_CHI_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_PI_A_CHI_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_PI_A_ZETA_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_PI_A_ZETA_Y_SLOT_PART1, y1)
                    mstore(PROOF_POLY_PI_B_CHI_X_SLOT_PART1, x2)
                    mstore(PROOF_POLY_PI_B_CHI_Y_SLOT_PART1, y2)
                    mstore(PROOF_POLY_PI_C_CHI_X_SLOT_PART1, x3)
                    mstore(PROOF_POLY_PI_C_CHI_Y_SLOT_PART1, y3)
                    mstore(PROOF_POLY_PI_C_ZETA_X_SLOT_PART1, x4)
                    mstore(PROOF_POLY_PI_C_ZETA_Y_SLOT_PART1, y4)
                    x0 := calldataload(add(offset2, 0x2e4))
                    y0 := calldataload(add(offset2, 0x304))
                    x1 := calldataload(add(offset2, 0x324))
                    y1 := calldataload(add(offset2, 0x344))
                    x2 := calldataload(add(offset2, 0x364))
                    y2 := calldataload(add(offset2, 0x384))
                    x3 := calldataload(add(offset2, 0x3a4))
                    y3 := calldataload(add(offset2, 0x3c4))
                    x4 := calldataload(add(offset2, 0x3e4))
                    y4 := calldataload(add(offset2, 0x404))
                    mstore(PROOF_POLY_PI_A_CHI_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_PI_A_CHI_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_PI_A_ZETA_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_PI_A_ZETA_Y_SLOT_PART2, y1)
                    mstore(PROOF_POLY_PI_B_CHI_X_SLOT_PART2, x2)
                    mstore(PROOF_POLY_PI_B_CHI_Y_SLOT_PART2, y2)
                    mstore(PROOF_POLY_PI_C_CHI_X_SLOT_PART2, x3)
                    mstore(PROOF_POLY_PI_C_CHI_Y_SLOT_PART2, y3)
                    mstore(PROOF_POLY_PI_C_ZETA_X_SLOT_PART2, x4)
                    mstore(PROOF_POLY_PI_C_ZETA_Y_SLOT_PART2, y4)
                }
                // PROOF B & R 
                {
                    let x0 := calldataload(add(offset, 0x424))
                    let y0 := calldataload(add(offset, 0x444))
                    let x1 := calldataload(add(offset, 0x464))
                    let y1 := calldataload(add(offset, 0x484))
                    mstore(PROOF_POLY_B_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_B_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_R_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_R_Y_SLOT_PART1, y1)
                    x0 := calldataload(add(offset2, 0x424))
                    y0 := calldataload(add(offset2, 0x444))
                    x1 := calldataload(add(offset2, 0x464))
                    y1 := calldataload(add(offset2, 0x484))
                    mstore(PROOF_POLY_B_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_B_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_R_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_R_Y_SLOT_PART2, y1)
                }
                // PROOF M_ζ, M_χ, N_ζ & N_χ
                {
                    let x0 := calldataload(add(offset, 0x4a4))
                    let y0 := calldataload(add(offset, 0x4c4))
                    let x1 := calldataload(add(offset, 0x4e4))
                    let y1 := calldataload(add(offset, 0x504))
                    let x2 := calldataload(add(offset, 0x524))
                    let y2 := calldataload(add(offset, 0x544))
                    let x3 := calldataload(add(offset, 0x564))
                    let y3 := calldataload(add(offset, 0x584))
                    mstore(PROOF_POLY_M_ZETA_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_M_ZETA_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_M_CHI_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_M_CHI_Y_SLOT_PART1, y1)
                    mstore(PROOF_POLY_N_ZETA_X_SLOT_PART1, x2)
                    mstore(PROOF_POLY_N_ZETA_Y_SLOT_PART1, y2)
                    mstore(PROOF_POLY_N_CHI_X_SLOT_PART1, x3)
                    mstore(PROOF_POLY_N_CHI_Y_SLOT_PART1, y3)
                    x0 := calldataload(add(offset2, 0x4a4))
                    y0 := calldataload(add(offset2, 0x4c4))
                    x1 := calldataload(add(offset2, 0x4e4))
                    y1 := calldataload(add(offset2, 0x504))
                    x2 := calldataload(add(offset2, 0x524))
                    y2 := calldataload(add(offset2, 0x544))
                    x3 := calldataload(add(offset2, 0x564))
                    y3 := calldataload(add(offset2, 0x584))
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
                    let x0 := calldataload(add(offset, 0x5a4))
                    let y0 := calldataload(add(offset, 0x5c4))
                    let x1 := calldataload(add(offset, 0x5e4))
                    let y1 := calldataload(add(offset, 0x604))
                    mstore(PROOF_POLY_OPUB_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_OPUB_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_A_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_A_Y_SLOT_PART1, y1)
                    x0 := calldataload(add(offset2, 0x5a4))
                    y0 := calldataload(add(offset2, 0x5c4))
                    x1 := calldataload(add(offset2, 0x5e4))
                    y1 := calldataload(add(offset2, 0x604))
                    mstore(PROOF_POLY_OPUB_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_OPUB_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_A_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_A_Y_SLOT_PART2, y1)
                }

                mstore(PROOF_R1XY_SLOT, mod(calldataload(add(offset2, 0x624)), R_MOD))
                mstore(PROOF_R2XY_SLOT, mod(calldataload(add(offset2, 0x644)), R_MOD))
                mstore(PROOF_R3XY_SLOT, mod(calldataload(add(offset2, 0x664)), R_MOD))
                mstore(PROOF_VXY_SLOT, mod(calldataload(add(offset2, 0x684)), R_MOD))

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
            /// Commit:   [U], [V], [W], [O_mid], [O_prv], [Q_AX], [Q_AY], [B]
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
                updateTranscript(mload(PROOF_POLY_OMID_X_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_OMID_X_SLOT_PART2))
                updateTranscript(mload(PROOF_POLY_OMID_Y_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_OMID_Y_SLOT_PART2))
                updateTranscript(mload(PROOF_POLY_OPRV_X_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_OPRV_X_SLOT_PART2))
                updateTranscript(mload(PROOF_POLY_OPRV_Y_SLOT_PART1))
                updateTranscript(mload(PROOF_POLY_OPRV_Y_SLOT_PART2))
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
            ///
            /// K_0(χ) := (χ^{ml}-1) / (m_I(χ-1))

            function prepareQueries() {
                // calculate [F]_1
                {
                    let theta0 := mload(CHALLENGE_THETA_0_SLOT)
                    let theta1 := mload(CHALLENGE_THETA_0_SLOT)
                    let theta2 := mload(CHALLENGE_THETA_0_SLOT)


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
                    let theta1 := mload(CHALLENGE_THETA_0_SLOT)
                    let theta2 := mload(CHALLENGE_THETA_0_SLOT)

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

                // calculate K_0(χ)
                {
                    let chi := mload(CHALLENGE_CHI_SLOT)
                    
                    // 1. Safety checks
                    if iszero(chi) {
                        // χ cannot be 0
                        revert(0, 0)
                    }
                    
                    // 2. Compute χ^mI using modexp 
                    let chi_mI := modexp(chi, CONSTANT_MI)
                    
                    // 3. Compute numerator (χ^mI - 1)
                    let chi_mI_minus_1 := sub(chi_mI, 1)
                    
                    // 4. Compute denominator components
                    let chi_minus_1 := sub(chi, 1)
                    
                    // Critical check: denominator cannot be zero
                    if iszero(chi_minus_1) {
                        revert(0, 0)
                    }
                    
                    // 5. Compute mI*(χ-1)
                    let mI_chi_minus_1 := mulmod(CONSTANT_MI, chi_minus_1, R_MOD)
                    
                    // 6. Final division - critical check denominator != 0
                    if iszero(mI_chi_minus_1) {
                        revert(0, 0)
                    }
                    
                    let K0 := div(chi_mI_minus_1, mI_chi_minus_1)
                    
                    // 7. Store result
                    mstore(INTERMEDIARY_SCALAR_KO_SLOT, K0)
                }            
            }
        
            /// A_pub := A(χ) := ∑ (a_jM_j(χ))
            function computeAPUB() {
                let res := 0
                let l := CONSTANT_L
                let l_minus_1 := sub(l, 1)
                let offset := calldataload(0x04)
                let chi := mload(CHALLENGE_CHI_SLOT)
                let omega_n := CONSTANT_OMEGA_N
                

                for {let j := 0} lt(j, l_minus_1) {j := add(j, 1)} {
                    // Load coefficient a_j (mod R_MOD)
                    let a_j := mod(calldataload(add(offset, add(0x6e4, mul(j, 0x20)))), R_MOD)
                    
                    // Initialize M_j = 1
                    let M_j := 1
                    let omega_j := modexp(omega_n, j)
                    
                    for {let m := 0} lt(m, l_minus_1) {m := add(m, 1)} {
                        // Skip when m == j
                        if eq(m, j) { continue }
                        
                        let omega_m := modexp(omega_n, m)
                        
                        // Compute numerator (χ - ω_n^m) mod R_MOD
                        let numerator := mod(add(sub(chi, omega_m), R_MOD), R_MOD)
                        
                        // Compute denominator (ω_n^j - ω_n^m) mod R_MOD
                        let denominator := mod(add(sub(omega_j, omega_m), R_MOD), R_MOD)
                        
                        // Check for division by zero
                        if iszero(denominator) {
                            revert(0, 0)
                        }
                                  
                        let term := div(numerator, denominator)
                        
                        // Update M_j = M_j * term mod R_MOD
                        M_j := mulmod(M_j, term, R_MOD)
                    }
                    
                    // Compute a_j * M_j mod R_MOD
                    let a_times_M := mulmod(a_j, M_j, R_MOD)
                    
                    // Accumulate result
                    res := addmod(res, a_times_M, R_MOD)
                }
                
                mstore(INTERMEDIARY_SCALAR_APUB_SLOT, res)
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
                // Π_{χ}]_1 := Π_{A,χ}]_1 + Π_{B,χ}]_1 + Π_{C,χ}]_1
                g1pointAddIntoDest(PROOF_POLY_PI_A_CHI_X_SLOT_PART1, PROOF_POLY_PI_B_CHI_X_SLOT_PART1, PAIRING_AGG_RHS_1_X_SLOT_PART1)
                g1pointAddIntoDest(PAIRING_AGG_RHS_1_X_SLOT_PART1, PROOF_POLY_PI_C_CHI_X_SLOT_PART1, PAIRING_AGG_RHS_1_X_SLOT_PART1)

                g1pointMulIntoDest(PAIRING_AGG_RHS_1_X_SLOT_PART1, kappa2, PAIRING_AGG_RHS_1_X_SLOT_PART1)
                g1pointMulAndAddIntoDest(PROOF_POLY_M_CHI_X_SLOT_PART1, kappa2_pow2, PAIRING_AGG_RHS_1_X_SLOT_PART1)
                g1pointMulAndAddIntoDest(PROOF_POLY_N_CHI_X_SLOT_PART1, kappa2_pow3, PAIRING_AGG_RHS_1_X_SLOT_PART1)
            }

            /// @dev [RHS_2]_1 := κ2[Π_{ζ}]_1 + κ2^2[M_{ζ}]_1 + κ2^3[N_{ζ}]_1
            function prepareRHS2() {
                let kappa2 := mload(CHALLENGE_KAPPA_2_SLOT)
                let kappa2_pow2 := mulmod(kappa2, kappa2, R_MOD)
                let kappa2_pow3 := mulmod(kappa2_pow2, kappa2, R_MOD)

                // Π_{ζ}]_1 := Π_{A,ζ}]_1 + Π_{C,ζ}]_1
                g1pointAddIntoDest(PROOF_POLY_PI_A_ZETA_X_SLOT_PART1, PROOF_POLY_PI_C_ZETA_X_SLOT_PART1, PAIRING_AGG_RHS_2_X_SLOT_PART1)

                g1pointMulIntoDest(PAIRING_AGG_RHS_2_X_SLOT_PART1, kappa2, PAIRING_AGG_RHS_2_X_SLOT_PART1)
                g1pointMulAndAddIntoDest(PROOF_POLY_M_ZETA_X_SLOT_PART1, kappa2_pow2, PAIRING_AGG_RHS_2_X_SLOT_PART1)
                g1pointMulAndAddIntoDest(PROOF_POLY_N_ZETA_X_SLOT_PART1, kappa2_pow3, PAIRING_AGG_RHS_2_X_SLOT_PART1)
            }

            /// @dev [LHS]_1 := [LHS_B]_1 + κ2([LHS_A]_1 + [LHS_C]_1)
            /// @dev [AUX]_1 := κ2 * χ * [Π_{χ}]_1 + κ2 * ζ *[Π_ζ]_1 + 
            ///                 κ2^2 * ω_{m_l}^{-1} * χ *[M_{χ}]_1 + κ2^2 * ζ * [M_ζ]_1 + κ2^3 * ω_{m_l}^{-1} * χ * [N_{χ}]_1 + κ_2^3 * ω_smax^{-1} * ζ * [N_{ζ}]            
            function prepareAggregatedCommitment() {
                // calculate [LHS]_1
                {
                    let kappa2 := mload(CHALLENGE_KAPPA_2_SLOT)
                    g1pointAddIntoDest(AGG_LHS_A_X_SLOT_PART1, AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    g1pointMulIntoDest(BUFFER_AGGREGATED_POLY_X_SLOT_PART1, kappa2, PAIRING_AGG_LHS_X_SLOT_PART1)
                    g1pointAddIntoDest(AGG_LHS_B_X_SLOT_PART1, PAIRING_AGG_LHS_X_SLOT_PART1, PAIRING_AGG_LHS_X_SLOT_PART1)
                }

                // calculate [AUX]_1
                {
                    let kappa2 := mload(CHALLENGE_KAPPA_2_SLOT)
                    let chi := mload(CHALLENGE_CHI_SLOT)
                    let zeta := mload(CHALLENGE_ZETA_SLOT)
                    let omega_ml := mload(OMEGA_MI_MINUS_1)
                    let omega_smax := mload(OMEGA_SMAX_MINUS_1)

                    let kappa2_chi := mulmod(kappa2, chi, R_MOD)
                    let kappa2_zeta := mulmod(kappa2, zeta, R_MOD)
                    let kappa2_pow2_omega_ml_chi := mulmod(mulmod(mulmod(kappa2, kappa2, R_MOD), omega_ml, R_MOD), chi, R_MOD)
                    let kappa2_pow2_zeta := mulmod(mulmod(kappa2, kappa2, R_MOD), zeta, R_MOD)
                    let kappa2_pow3_omega_ml_chi := mulmod(mulmod(mulmod(mulmod(kappa2, kappa2, R_MOD), kappa2, R_MOD), omega_ml, R_MOD), chi, R_MOD)
                    let kappa2_pow3_omega_smax_zeta := mulmod(mulmod(mulmod(mulmod(kappa2, kappa2, R_MOD), kappa2, R_MOD), omega_smax, R_MOD), zeta, R_MOD)

                    // [Π_{χ}]_1 := [Π_{A,χ}]_1 + [Π_{B,χ}]_1 + [Π_{C,χ}]_1
                    g1pointAddIntoDest(PROOF_POLY_PI_A_CHI_X_SLOT_PART1, PROOF_POLY_PI_B_CHI_X_SLOT_PART1, INTERMERDIARY_POLY_PI_CHI_X_SLOT_PART1)
                    g1pointAddIntoDest(INTERMERDIARY_POLY_PI_CHI_X_SLOT_PART1, PROOF_POLY_PI_C_CHI_X_SLOT_PART1, INTERMERDIARY_POLY_PI_CHI_X_SLOT_PART1)
                    // [Π_{ζ}]_1 := [Π_{A,ζ}]_1 + [Π_{C,ζ}]_1
                    g1pointAddIntoDest(PROOF_POLY_PI_A_ZETA_X_SLOT_PART1, PROOF_POLY_PI_C_ZETA_X_SLOT_PART1, INTERMERDIARY_POLY_PI_ZETA_X_SLOT_PART1)

                    // [AUX]_1 accumulation
                    // κ2 * χ * [Π_{χ}]_1
                    g1pointMulIntoDest(INTERMERDIARY_POLY_PI_CHI_X_SLOT_PART1, kappa2_chi, PAIRING_AGG_AUX_X_SLOT_PART1)
                    // += κ2 * ζ *[Π_ζ]_1
                    g1pointMulAndAddIntoDest(INTERMERDIARY_POLY_PI_ZETA_X_SLOT_PART1,kappa2_zeta, PAIRING_AGG_AUX_X_SLOT_PART1)
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
            computeAPUB()


            // Step4: computation of the final polynomial commitments
            prepareLHSA()
            //prepareLHSB()
            //prepareLHSC()
            //prepareRHS1()
            //prepareRHS2()
            //prepareAggregatedCommitment()

            // Step5: final pairing
            //finalPairing()
            
            result := mload(INTERMEDIARY_SCALAR_APUB_SLOT)
        }
    }
}