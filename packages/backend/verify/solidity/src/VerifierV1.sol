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
        uint256 internal constant PUBLIC_INPUTS_S_0_X_SLOT_PART1 = 0x8000 + 0x200 + 0x040;
        uint256 internal constant PUBLIC_INPUTS_S_0_X_SLOT_PART2 = 0x8000 + 0x200 + 0x060;
        uint256 internal constant PUBLIC_INPUTS_S_0_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x080;
        uint256 internal constant PUBLIC_INPUTS_S_0_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x0a0;

        // [s^{(1)}(x,y)]_1
        uint256 internal constant PUBLIC_INPUTS_S_1_X_SLOT_PART1 = 0x8000 + 0x200 + 0x0c0;
        uint256 internal constant PUBLIC_INPUTS_S_1_X_SLOT_PART2 = 0x8000 + 0x200 + 0x0e0;
        uint256 internal constant PUBLIC_INPUTS_S_1_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x100;
        uint256 internal constant PUBLIC_INPUTS_S_1_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120;

        // U
        uint256 internal constant PROOF_POLY_U_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x020;
        uint256 internal constant PROOF_POLY_U_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x040;
        uint256 internal constant PROOF_POLY_U_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x060;
        uint256 internal constant PROOF_POLY_U_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x080;
        // V
        uint256 internal constant PROOF_POLY_V_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x0a0;
        uint256 internal constant PROOF_POLY_V_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x0c0;
        uint256 internal constant PROOF_POLY_V_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x0e0;
        uint256 internal constant PROOF_POLY_V_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x100;
        // W
        uint256 internal constant PROOF_POLY_W_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x120;
        uint256 internal constant PROOF_POLY_W_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x140;
        uint256 internal constant PROOF_POLY_W_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x160;
        uint256 internal constant PROOF_POLY_W_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x180;
        // O_mid
        uint256 internal constant PROOF_POLY_OMID_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x1a0;
        uint256 internal constant PROOF_POLY_OMID_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x1c0;
        uint256 internal constant PROOF_POLY_OMID_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x1e0;
        uint256 internal constant PROOF_POLY_OMID_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x200;
        // O_prv
        uint256 internal constant PROOF_POLY_OPRV_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x220;
        uint256 internal constant PROOF_POLY_OPRV_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x240;
        uint256 internal constant PROOF_POLY_OPRV_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x260;
        uint256 internal constant PROOF_POLY_OPRV_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x280;
        // Q_{AX}
        uint256 internal constant PROOF_POLY_QAX_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x2a0;
        uint256 internal constant PROOF_POLY_QAX_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x2c0;
        uint256 internal constant PROOF_POLY_QAX_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x2e0;
        uint256 internal constant PROOF_POLY_QAX_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x300;
        // Q_{AY}
        uint256 internal constant PROOF_POLY_QAY_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x320;
        uint256 internal constant PROOF_POLY_QAY_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x340;
        uint256 internal constant PROOF_POLY_QAY_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x360;
        uint256 internal constant PROOF_POLY_QAY_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x380;
        // Q_{CX}
        uint256 internal constant PROOF_POLY_QCX_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x3a0;
        uint256 internal constant PROOF_POLY_QCX_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x3c0;
        uint256 internal constant PROOF_POLY_QCX_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x3e0;
        uint256 internal constant PROOF_POLY_QCX_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x400;
        // Q_{CY}
        uint256 internal constant PROOF_POLY_QCY_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x420;
        uint256 internal constant PROOF_POLY_QCY_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x440;
        uint256 internal constant PROOF_POLY_QCY_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x460;
        uint256 internal constant PROOF_POLY_QCY_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x480;
        // Π_{χ}
        uint256 internal constant PROOF_POLY_PI_CHI_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x4a0;
        uint256 internal constant PROOF_POLY_PI_CHI_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x4c0;
        uint256 internal constant PROOF_POLY_PI_CHI_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x4e0;
        uint256 internal constant PROOF_POLY_PI_CHI_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x500;
        // Π{ζ}
        uint256 internal constant PROOF_POLY_PI_ZETA_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x520;
        uint256 internal constant PROOF_POLY_PI_ZETA_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x540;
        uint256 internal constant PROOF_POLY_PI_ZETA_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x560;
        uint256 internal constant PROOF_POLY_PI_ZETA_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x580;
        // B
        uint256 internal constant PROOF_POLY_B_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x5a0;
        uint256 internal constant PROOF_POLY_B_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x5c0;
        uint256 internal constant PROOF_POLY_B_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x5e0;
        uint256 internal constant PROOF_POLY_B_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x600;
        // R
        uint256 internal constant PROOF_POLY_R_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x620;
        uint256 internal constant PROOF_POLY_R_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x640;
        uint256 internal constant PROOF_POLY_R_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x660;
        uint256 internal constant PROOF_POLY_R_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x680;
        // M_ζ
        uint256 internal constant PROOF_POLY_M_ZETA_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x6a0;
        uint256 internal constant PROOF_POLY_M_ZETA_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x6c0;
        uint256 internal constant PROOF_POLY_M_ZETA_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x6e0;
        uint256 internal constant PROOF_POLY_M_ZETA_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x700;
        // M_χ
        uint256 internal constant PROOF_POLY_M_CHI_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x720;
        uint256 internal constant PROOF_POLY_M_CHI_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x740;
        uint256 internal constant PROOF_POLY_M_CHI_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x760;
        uint256 internal constant PROOF_POLY_M_CHI_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x780;
        // N_ζ
        uint256 internal constant PROOF_POLY_N_ZETA_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x7a0;
        uint256 internal constant PROOF_POLY_N_ZETA_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x7c0;
        uint256 internal constant PROOF_POLY_N_ZETA_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x7e0;
        uint256 internal constant PROOF_POLY_N_ZETA_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x800;
        // N_χ
        uint256 internal constant PROOF_POLY_N_CHI_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x820;
        uint256 internal constant PROOF_POLY_N_CHI_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x840;
        uint256 internal constant PROOF_POLY_N_CHI_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x860;
        uint256 internal constant PROOF_POLY_N_CHI_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x880;
        // O_pub
        uint256 internal constant PROOF_POLY_OPUB_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x8a0;
        uint256 internal constant PROOF_POLY_OPUB_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x8c0;
        uint256 internal constant PROOF_POLY_OPUB_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x8e0;
        uint256 internal constant PROOF_POLY_OPUB_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x900;
        // A
        uint256 internal constant PROOF_POLY_A_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x920;
        uint256 internal constant PROOF_POLY_A_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x940;
        uint256 internal constant PROOF_POLY_A_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0x960;
        uint256 internal constant PROOF_POLY_A_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0x980;
        // R_xy
        uint256 internal constant PROOF_R1XY_SLOT = 0x8000 + 0x200 + 0x120 + 0x9a0;
        // R'_xy
        uint256 internal constant PROOF_R2XY_SLOT = 0x8000 + 0x200 + 0x120 + 0x9c0;
        // R''_xy
        uint256 internal constant PROOF_R3XY_SLOT = 0x8000 + 0x200 + 0x120 + 0x9e0;
        // V_xy
        uint256 internal constant PROOF_VXY_SLOT = 0x8000 + 0x200 + 0x120 + 0xa00;


        /*//////////////////////////////////////////////////////////////
                transcript slot (used for challenge computation)
        //////////////////////////////////////////////////////////////*/

        uint256 internal constant TRANSCRIPT_BEGIN_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x00;
        uint256 internal constant TRANSCRIPT_DST_BYTE_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x03; 
        uint256 internal constant TRANSCRIPT_STATE_0_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x04;
        uint256 internal constant TRANSCRIPT_STATE_1_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x24;
        uint256 internal constant TRANSCRIPT_CHALLENGE_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x44;

        /*//////////////////////////////////////////////////////////////
                                Challenges
        //////////////////////////////////////////////////////////////*/

        uint256 internal constant CHALLENGE_THETA_0_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x000;
        uint256 internal constant CHALLENGE_THETA_1_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x020;
        uint256 internal constant CHALLENGE_THETA_2_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 +0x040;
        uint256 internal constant CHALLENGE_KAPPA_0_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 +0x060;
        uint256 internal constant CHALLENGE_KAPPA_1_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 +0x080;
        uint256 internal constant CHALLENGE_KAPPA_2_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 +0x0a0;
        uint256 internal constant CHALLENGE_ZETA_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 +0x0c0;
        uint256 internal constant CHALLENGE_XI_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 +0x0e0;
        uint256 internal constant CHALLENGE_CHI_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 +0x80 + 0x100;

        /*//////////////////////////////////////////////////////////////
                        Intermediary verifier state
        //////////////////////////////////////////////////////////////*/

        // [F]_1
        uint256 internal constant INTERMERDIARY_POLY_F_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 +0x100 + 0x020;
        uint256 internal constant INTERMERDIARY_POLY_F_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 +0x100 + 0x040;
        uint256 internal constant INTERMERDIARY_POLY_F_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 +0x100 + 0x060;
        uint256 internal constant INTERMERDIARY_POLY_F_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 +0x100 + 0x080;

        // [G]_1
        uint256 internal constant INTERMERDIARY_POLY_G_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 +0x100 + 0x0a0;
        uint256 internal constant INTERMERDIARY_POLY_G_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x0c0;
        uint256 internal constant INTERMERDIARY_POLY_G_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x0e0;
        uint256 internal constant INTERMERDIARY_POLY_G_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x100;

        // t_n(χ)
        uint256 internal constant INTERMERDIARY_SCALAR_T_N_CHI_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x120;
        // t_smax(ζ)
        uint256 internal constant INTERMERDIARY_SCALAR_T_SMAX_ZETA_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x140;
        // t_ml(χ)
        uint256 internal constant INTERMERDIARY_SCALAR_T_MI_CHI_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x160;
        // K_0(χ)
        uint256 internal constant INTERMEDIARY_SCALAR_KO_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x180;
        // A_pub
        uint256 internal constant INTERMEDIARY_SCALAR_APUB_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0;

        /*//////////////////////////////////////////////////////////////
                                Aggregated commitment
        //////////////////////////////////////////////////////////////*/

        uint256 internal constant AGG_LHS_A_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x020;
        uint256 internal constant AGG_LHS_A_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x040;
        uint256 internal constant AGG_LHS_A_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x060;
        uint256 internal constant AGG_LHS_A_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x080; 

        uint256 internal constant AGG_LHS_B_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x0a0;
        uint256 internal constant AGG_LHS_B_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x0c0;
        uint256 internal constant AGG_LHS_B_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x0e0;
        uint256 internal constant AGG_LHS_B_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x100;

        uint256 internal constant AGG_LHS_C_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x120;
        uint256 internal constant AGG_LHS_C_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x140;
        uint256 internal constant AGG_LHS_C_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x160;
        uint256 internal constant AGG_LHS_C_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x180;

        uint256 internal constant PAIRING_AGG_LHS_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x1a0;
        uint256 internal constant PAIRING_AGG_LHS_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x1c0;
        uint256 internal constant PAIRING_AGG_LHS_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x1e0;
        uint256 internal constant PAIRING_AGG_LHS_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x200;

        uint256 internal constant PAIRING_AGG_AUX_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x220;
        uint256 internal constant PAIRING_AGG_AUX_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x240;
        uint256 internal constant PAIRING_AGG_AUX_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x260;
        uint256 internal constant PAIRING_AGG_AUX_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x280;

        uint256 internal constant PAIRING_AGG_LHS_AUX_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x2a0;
        uint256 internal constant PAIRING_AGG_LHS_AUX_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x2c0;
        uint256 internal constant PAIRING_AGG_LHS_AUX_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x2e0;
        uint256 internal constant PAIRING_AGG_LHS_AUX_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x300;

        uint256 internal constant PAIRING_AGG_RHS_1_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x320;
        uint256 internal constant PAIRING_AGG_RHS_1_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x340;
        uint256 internal constant PAIRING_AGG_RHS_1_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x360;
        uint256 internal constant PAIRING_AGG_RHS_1_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x380;

        uint256 internal constant PAIRING_AGG_RHS_2_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x3a0;
        uint256 internal constant PAIRING_AGG_RHS_2_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x3c0;
        uint256 internal constant PAIRING_AGG_RHS_2_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x3e0;
        uint256 internal constant PAIRING_AGG_RHS_2_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x400;

        /*//////////////////////////////////////////////////////////////
                                Pairing data
        //////////////////////////////////////////////////////////////*/

        uint256 internal constant BUFFER_AGGREGATED_POLY_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x420;
        uint256 internal constant BUFFER_AGGREGATED_POLY_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x440;
        uint256 internal constant BUFFER_AGGREGATED_POLY_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x460;
        uint256 internal constant BUFFER_AGGREGATED_POLY_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480;

        /*//////////////////////////////////////////////////////////////
                            Verification keys
        //////////////////////////////////////////////////////////////*/

        // [K^_1(X)L^-1(X)]_1
        uint256 internal constant VK_POLY_KXLX_X_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x020;
        uint256 internal constant VK_POLY_KXLX_X_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x040;
        uint256 internal constant VK_POLY_KXLX_Y_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x060;
        uint256 internal constant VK_POLY_KXLX_Y_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x080;

        // [x]_1
        uint256 internal constant VK_POLY_X_X_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x0a0;
        uint256 internal constant VK_POLY_X_X_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x0c0;
        uint256 internal constant VK_POLY_X_Y_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x0e0;
        uint256 internal constant VK_POLY_X_Y_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x100;

        // [y]_1
        uint256 internal constant VK_POLY_Y_X_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x120;
        uint256 internal constant VK_POLY_Y_X_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x140;
        uint256 internal constant VK_POLY_Y_Y_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x160;
        uint256 internal constant VK_POLY_Y_Y_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x180;

        // [1]_1
        uint256 internal constant VK_IDENTITY_X_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x1a0;
        uint256 internal constant VK_IDENTITY_X_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x1c0;
        uint256 internal constant VK_IDENTITY_Y_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x1e0;
        uint256 internal constant VK_IDENTITY_Y_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x200;

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
        uint256 internal constant CONSTANT_N = 1024;
        // ω_32
        uint256 internal constant OMEGA_128 = 0x07d0c802a94a946e8cbe2437f0b4b276501dff643be95635b750da4cab28e208;
        // s_max
        uint256 internal constant CONSTANT_SMAX = 64;
        // m_i
        uint256 internal constant CONSTANT_MI = 1024;

        // ω_{m_i}^{-1}
        uint256 internal constant OMEGA_MI_1 = 0x2bcd9508a3dad316105f067219141f4450a32c41aa67e0beb0ad80034eb71aa6;

        // ω_smax^{-1}
        uint256 internal constant OMEGA_SMAX_1 = 0x199cdaee7b3c79d6566009b5882952d6a41e85011d426b52b891fa3f982b68c5;


        /*//////////////////////////////////////////////////////////////
                            G2 elements
        //////////////////////////////////////////////////////////////*/

        // G2 Points for zkEVM Verifier (BLS12-381) - Standard Naming Convention
        // Each point uses 8 uint256 slots (256 bytes total)
        // Format: X0_PART1, X0_PART2, X1_PART1, X1_PART2, Y0_PART1, Y0_PART2, Y1_PART1, Y1_PART2

        // [1]_2 (Identity/Generator point H)
        uint256 internal constant IDENTITY2_X0_PART1 = 0x000000000000000000000000000000001062cb3c7e229c00647fdc4cdf7090f7;
        uint256 internal constant IDENTITY2_X0_PART2 = 0x74a21b82d44d94698289654631255c5edcd1c2e67af02485c565c52fed895fc2;
        uint256 internal constant IDENTITY2_X1_PART1 = 0x000000000000000000000000000000000890855e3092cc1da5063db0da3f1f6d;
        uint256 internal constant IDENTITY2_X1_PART2 = 0xa30581ac6941b60f6a40d1c3295374f6399acd44d9f433265d13ee57462d11dc;
        uint256 internal constant IDENTITY2_Y0_PART1 = 0x000000000000000000000000000000000bb5f9f0a02692690977e7ac5097cc72;
        uint256 internal constant IDENTITY2_Y0_PART2 = 0xc17765756c7ee736d3e1a522834769114fbe20611a48ff5a8afb6c4f1c5d0834;
        uint256 internal constant IDENTITY2_Y1_PART1 = 0x00000000000000000000000000000000118bf75ff2a1376d019f4fee31545717;
        uint256 internal constant IDENTITY2_Y1_PART2 = 0xdfb119fb2317c7dbb08c59e874c8c2fe82235812eb3417567767b895af32efe7;

        // [α]_2
        uint256 internal constant ALPHA_X0_PART1 = 0x0000000000000000000000000000000009c1432fa1ffe138ea14345e30822c3b;
        uint256 internal constant ALPHA_X0_PART2 = 0x78c007af61980943cac47c3f71088d12699101973e381f9d9a5ca7e09d7792a2;
        uint256 internal constant ALPHA_X1_PART1 = 0x000000000000000000000000000000001742e817a24f46a2a9e017803313def9;
        uint256 internal constant ALPHA_X1_PART2 = 0xfe6fd69373e64160954beca1fafd1d5b884583fe377488a541176932db6b066d;
        uint256 internal constant ALPHA_Y0_PART1 = 0x00000000000000000000000000000000123a8d899dc3a23fe967bff3a3605c2d;
        uint256 internal constant ALPHA_Y0_PART2 = 0x23c361089384f251b97640cc0367c1246fdbfffda0b0f135bc19ec3d0ede94b0;
        uint256 internal constant ALPHA_Y1_PART1 = 0x0000000000000000000000000000000003dd485b1205942b2ea6b25d66cdeff4;
        uint256 internal constant ALPHA_Y1_PART2 = 0xbc7aca4fc57970c5f0cf952e0ee664c5fe890b51e69baf67244accc119a822c2;

        // [α^2]_2
        uint256 internal constant ALPHA_POWER2_X0_PART1 = 0x000000000000000000000000000000000e02f0bcd8f1d36763193c0b43872b8f;
        uint256 internal constant ALPHA_POWER2_X0_PART2 = 0x73b0c3793343bc3ed13d97fc39224a56865b0803d0e07ce00eddb8b7c3f94168;
        uint256 internal constant ALPHA_POWER2_X1_PART1 = 0x00000000000000000000000000000000059411cecf4a60426f1dabdfdcbc631b;
        uint256 internal constant ALPHA_POWER2_X1_PART2 = 0x1f64afed1557f752be4988c10080881f72ef76fb32d9836faa64817efd0c94c2;
        uint256 internal constant ALPHA_POWER2_Y0_PART1 = 0x000000000000000000000000000000000cccc9d09758396316b87bc7dc3ce8d5;
        uint256 internal constant ALPHA_POWER2_Y0_PART2 = 0xafcdf22917ee9c7e905c53b6aa9ad6797beb7c247fa386766344721e89f58236;
        uint256 internal constant ALPHA_POWER2_Y1_PART1 = 0x000000000000000000000000000000000611327e8964356147dd8238ebaeedb6;
        uint256 internal constant ALPHA_POWER2_Y1_PART2 = 0xd53e73d6bf93f1769be7713a654c5173fd9eea9be2da4e186dc23430e0f67d49;

        // [α^3]_2
        uint256 internal constant ALPHA_POWER3_X0_PART1 = 0x0000000000000000000000000000000001ec505466dc0a042c23dbb296f1f84f;
        uint256 internal constant ALPHA_POWER3_X0_PART2 = 0x965c6172377199b7a68a9c322f31ef24884842bc2da64f87c5e9d504fde810f3;
        uint256 internal constant ALPHA_POWER3_X1_PART1 = 0x0000000000000000000000000000000009b3f2eee1513661deff0c695618f222;
        uint256 internal constant ALPHA_POWER3_X1_PART2 = 0xe6354148b77b18c067e7471ff4d7db05db4124bd383125d4deda6657c6982457;
        uint256 internal constant ALPHA_POWER3_Y0_PART1 = 0x000000000000000000000000000000001972902b5e6e9d30cb91157a57ffd3ca;
        uint256 internal constant ALPHA_POWER3_Y0_PART2 = 0x95d52bc82491f9be8750597581a0d6e60759dabfbaf673c987b2649f18a645d6;
        uint256 internal constant ALPHA_POWER3_Y1_PART1 = 0x0000000000000000000000000000000018dc22912739c4604fc8f78ff809dcee;
        uint256 internal constant ALPHA_POWER3_Y1_PART2 = 0xc99ecc106779c5e7951100e8a6eb4625347c1a06f596d3c9eff8a6a36a297e9c;

        // [α^4]_2
        uint256 internal constant ALPHA_POWER4_X0_PART1 = 0x000000000000000000000000000000001039465945ab682a5fda213751b71cba;
        uint256 internal constant ALPHA_POWER4_X0_PART2 = 0x2454f29ed9a6b89e23cd44acbaf4171ec37383c2ec42facc3b022146dec8e274;
        uint256 internal constant ALPHA_POWER4_X1_PART1 = 0x00000000000000000000000000000000156ab62d7896eccef5cecede0a9fe64f;
        uint256 internal constant ALPHA_POWER4_X1_PART2 = 0xda7a0f8926ecf78915dedc7b7538c7096f53424dd4da29a02bdf616a17da3ed2;
        uint256 internal constant ALPHA_POWER4_Y0_PART1 = 0x000000000000000000000000000000001924476b91cfdadb80c94b85af60bc24;
        uint256 internal constant ALPHA_POWER4_Y0_PART2 = 0x720ba968c299e6d58db163a9caac27d185737f35ab29449fec9a7f09f7a5ca88;
        uint256 internal constant ALPHA_POWER4_Y1_PART1 = 0x00000000000000000000000000000000166f92caf62181b9b0babcb44b18c96f;
        uint256 internal constant ALPHA_POWER4_Y1_PART2 = 0xbc06f0fd6061fb9e4173cabf0ceaa811efe5b0ad70f5ca213940da5e84af3d45;

        // -[γ]_2 (negated for pairing)
        uint256 internal constant GAMMA_X0_PART1 = 0x000000000000000000000000000000000de2e1e1c8cee742b061bc5967e7dd07;
        uint256 internal constant GAMMA_X0_PART2 = 0x923d5d56f1721cbde5a4729fe3f7c79fd76cc3fbdd1dcff176cb0a8727bd3334;
        uint256 internal constant GAMMA_X1_PART1 = 0x000000000000000000000000000000001971fb45ba2052c3fa2909d7c243f31b;
        uint256 internal constant GAMMA_X1_PART2 = 0x0cc39b1b00b455d7dd149972e30ca15e39eda43db06be877d31d36f7576fcead;
        uint256 internal constant GAMMA_Y0_PART1 = 0x000000000000000000000000000000000d23af41f9532a91c986aec729d996bd;
        uint256 internal constant GAMMA_Y0_PART2 = 0x9f206fd8fdb66e5eb72411ddb3af3a628ee78555ffafb8d4f670fbb12eb13183;
        uint256 internal constant GAMMA_Y1_PART1 = 0x00000000000000000000000000000000091a47c6445008e031a1287c5b473092;
        uint256 internal constant GAMMA_Y1_PART2 = 0xffd575bc8f693425318d72f3f071aa602ea76c75029231309633689420c35133;

        // -[η]_2 (negated for pairing)
        uint256 internal constant ETA_X0_PART1 = 0x0000000000000000000000000000000018c088d70cd70c0765b2e2ae6f467127;
        uint256 internal constant ETA_X0_PART2 = 0x98883bb35959203dfc5a0c4b051b44ac0eac62062262f23e3469dd9aaa33ad1a;
        uint256 internal constant ETA_X1_PART1 = 0x000000000000000000000000000000000434d7a5b5b90ecf4251f64b6f2e6870;
        uint256 internal constant ETA_X1_PART2 = 0x94ca41e3d894fcf2122f031a2ecb15273f3bf96401f224b7c88a55a7bf4429ab;
        uint256 internal constant ETA_Y0_PART1 = 0x00000000000000000000000000000000170d592138767d9b0914668154d93dc5;
        uint256 internal constant ETA_Y0_PART2 = 0xcf3f6d9a11ae7a2a640a30ec7c280ecb9faa7afb81583aa45acd72065ebb3b08;
        uint256 internal constant ETA_Y1_PART1 = 0x000000000000000000000000000000000a5d27148877cac0c3da5a3d6db6d742;
        uint256 internal constant ETA_Y1_PART2 = 0x3c02c4b80e55ddcd9f1f0f6f3ad6efacf470049dc702d95934b944b4ffe434b1;

        // -[δ]_2 (negated for pairing)
        uint256 internal constant DELTA_X0_PART1 = 0x0000000000000000000000000000000002dafaf366fe4efbfa3ae62f2628107a;
        uint256 internal constant DELTA_X0_PART2 = 0xb2964d57017e76286440a248bfd9c5280692f91b8a0b4a208682869a09ea961a;
        uint256 internal constant DELTA_X1_PART1 = 0x00000000000000000000000000000000085abf7fb1783276d6391983b14552d9;
        uint256 internal constant DELTA_X1_PART2 = 0xfbf41c2fdcaeb410a3479a160b5625135a0cdc22c3f8dde5d832afc8e18ef48f;
        uint256 internal constant DELTA_Y0_PART1 = 0x0000000000000000000000000000000015546f9df8fcbdd8c8ff00eef8f39a0b;
        uint256 internal constant DELTA_Y0_PART2 = 0x6f373addfac73d84c1b2e25e46db314b15e1fab23c7233c631a96b39a9e65cd6;
        uint256 internal constant DELTA_Y1_PART1 = 0x00000000000000000000000000000000140e8fc4f79c587b729aaac3993a6a2a;
        uint256 internal constant DELTA_Y1_PART2 = 0xdadcfd8fd5f1dbbec5ec9c6d22fa93a87f22b91b81d1ac93653b641462a8f76e;

        // -[x]_2 (negated for pairing)
        uint256 internal constant X_X0_PART1 = 0x0000000000000000000000000000000014fa34c2e9eaec2194553203d61eb265;
        uint256 internal constant X_X0_PART2 = 0x51bdde2c2189ececf9ed8d04582f73b704be8dd8735d2881edc77ba51c755d02;
        uint256 internal constant X_X1_PART1 = 0x000000000000000000000000000000000b7480ac2a19a906d2e0a8b3f3d211ae;
        uint256 internal constant X_X1_PART2 = 0x2d2e35e522f57d7f050e61311e189d4b2808593c2ab50305cd7e920b5dd91280;
        uint256 internal constant X_Y0_PART1 = 0x0000000000000000000000000000000018fb2883ed8ef151c425dba2f2bd804a;
        uint256 internal constant X_Y0_PART2 = 0x7c4d535f208047eceaac25b4b0b61f4665bf5273cd418f96a4bbe6f981490ed9;
        uint256 internal constant X_Y1_PART1 = 0x00000000000000000000000000000000028b91a0839a4d74a42548a470a8a5c4;
        uint256 internal constant X_Y1_PART2 = 0xcdbf743dd63d939c2f9c5e666da50a636cbd6acda2b68cc5cbf7d582386f6376;

        // -[y]_2 (negated for pairing)
        uint256 internal constant Y_X0_PART1 = 0x0000000000000000000000000000000011f6c6b43b6b6ca21f9b1378fbf25f28;
        uint256 internal constant Y_X0_PART2 = 0x21ba93c2c28bc7373f707497c005764d9959591e631ff60443388d8e367ca990;
        uint256 internal constant Y_X1_PART1 = 0x0000000000000000000000000000000001aedff7d3eec751b593ba1d20efec12;
        uint256 internal constant Y_X1_PART2 = 0x2c57a9f6aa16bc05b13769f94fa299cc336446bfad690ca17bde00bb7ec28f58;
        uint256 internal constant Y_Y0_PART1 = 0x0000000000000000000000000000000005c4dedbad98d18a48661c6c48a334eb;
        uint256 internal constant Y_Y0_PART2 = 0xf7451a68b148f3362e6d6b5b5d9bf656f5e1f26bb43a80f4878fb8b72957b519;
        uint256 internal constant Y_Y1_PART1 = 0x0000000000000000000000000000000019701d0f9998a1a2d75448f850a3c380;
        uint256 internal constant Y_Y1_PART2 = 0x3b2bc410f121c5a683fb36593ec1b18747380eeb44f4406c1770f82b3a5fd51a;

        /// @notice Load verification keys to memory in runtime.
        /// @dev The constants are loaded into memory in a specific layout declared in the constants starting from
        /// `VK_` prefix.
        /// NOTE: Function may corrupt the memory state if some memory was used before this function was called.
        function _loadVerificationKey() internal pure virtual {
            assembly {
                // preproccessed KL commitment vk         
                mstore(VK_POLY_KXLX_X_PART1, 0x0000000000000000000000000000000013d25bb3f810de6e1dcf435f7561fdb1)
                mstore(VK_POLY_KXLX_X_PART2, 0x627678dae6390a7b01155b74c45a42573788dd405ee72d93ca771aac3125197f)
                mstore(VK_POLY_KXLX_Y_PART1, 0x0000000000000000000000000000000000de773cd3e222498dc98712a3fa6a60)
                mstore(VK_POLY_KXLX_Y_PART2, 0xef5559e0ee1fc5ad82792cf4671c7a20acb8150725fbf9f6bda2bba017e1fd66)

                // [1]_1 (Generator/Identity point)
                mstore(VK_IDENTITY_X_PART1, 0x00000000000000000000000000000000028f8a44ae00ff0e6660d2cee552f153)
                mstore(VK_IDENTITY_X_PART2, 0x745dbd5d8239a8b21eb337a0344fdf5fd9fe1dfaa6a8248c5a4d44b2ba3e0fe0)
                mstore(VK_IDENTITY_Y_PART1, 0x000000000000000000000000000000000dfd148cd714beb02387ccaa7f37dad6)
                mstore(VK_IDENTITY_Y_PART2, 0xad58e6704246d96d642b0764c104967e8914c8822ecc689a90bfeb47db5a114e)

                // [x]_1 (Polynomial evaluation point)
                mstore(VK_POLY_X_X_PART1, 0x0000000000000000000000000000000017f979d9641d6c78c2b2f276567c9aa9)
                mstore(VK_POLY_X_X_PART2, 0x373f99a477cee235ed39228d7c7a478038eba172ec9f30f05b341f8659e2f717)
                mstore(VK_POLY_X_Y_PART1, 0x000000000000000000000000000000000d62461a124444f79d00ea8ee1c4a04d)
                mstore(VK_POLY_X_Y_PART2, 0x2329a34bbfd42609292ffdd40d46efc2e5507d50c6e1dda06d2c11938aae6a82)

                // [y]_1 (Polynomial evaluation point)
                mstore(VK_POLY_Y_X_PART1, 0x00000000000000000000000000000000006490a3bc4eff19e3d5866686a5a611)
                mstore(VK_POLY_Y_X_PART2, 0xa311af5dadf553088a95cb809ae08d66f4c63a230f7e2471b6df2ee036cc7b96)
                mstore(VK_POLY_Y_Y_PART1, 0x00000000000000000000000000000000196f181f0cbf214e203c0fcb6cd574fb)
                mstore(VK_POLY_Y_Y_PART2, 0x42625bd95f626ea8629a0dcc327fda7d6dbf8218d78a510891d095b266344af3)
            }
        }

        function verify(
            uint128[] calldata, //_proof part1 (16 bytes)
            uint256[] calldata, // _proof part2 (32 bytes)
            uint256[] calldata // publicInputs (used for computing A_pub)
        ) public view virtual returns (bool final_result) {
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

            /// @dev Performs a point subtraction operation and updates dest with the result.
            function g1pointSubIntoDest(p1, p2, dest) {
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
                    let chi_1 := addmod(chi, sub(R_MOD, 1), R_MOD)
                    let denominator := mulmod(m_i, chi_1, R_MOD)
                    
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
                    let chi := mload(CHALLENGE_CHI_SLOT)
                    let offset := calldataload(0x44)
                    
                    let n := 128
                    let omega := OMEGA_128
                    
                    // Compute chi^128 - 1
                    let chi_n := modexp(chi, n)
                    let chi_n_1 := addmod(chi_n, sub(R_MOD, 1), R_MOD)
                    
                    // Check if chi is a 128th root of unity
                    if iszero(chi_n_1) {
                        // Special case: find and return the corresponding value
                        let omega_power := 1
                        for { let i := 0 } lt(i, n) { i := add(i, 1) } {
                            if eq(chi, omega_power) {
                                let val := calldataload(add(add(offset, 0x24), mul(i, 0x20)))
                                mstore(INTERMEDIARY_SCALAR_APUB_SLOT, val)
                                leave
                            }
                            omega_power := mulmod(omega_power, omega, R_MOD)
                        }
                    }
                    
                    // Normal case: compute weighted sum
                    let weightedSum := 0
                    let inv_n := modexp(n, sub(R_MOD, 2))
                    
                    // First pass: count non-zero values and store their indices
                    let nonZeroCount := 0
                    let tempOffset := 0x2000 // Temporary storage location
                    
                    for { let i := 0 } lt(i, n) { i := add(i, 1) } {
                        let val := calldataload(add(add(offset, 0x24), mul(i, 0x20)))
                        if val {
                            // Store index and value
                            mstore(add(tempOffset, mul(nonZeroCount, 0x40)), i)
                            mstore(add(tempOffset, add(mul(nonZeroCount, 0x40), 0x20)), val)
                            nonZeroCount := add(nonZeroCount, 1)
                        }
                    }
                    
                    // Second pass: process only non-zero values
                    for { let j := 0 } lt(j, nonZeroCount) { j := add(j, 1) } {
                        let i := mload(add(tempOffset, mul(j, 0x40)))
                        let val := mload(add(tempOffset, add(mul(j, 0x40), 0x20)))
                        
                        // Compute omega^i using efficient method based on i
                        let omega_i := 1
                        
                        // For small i, use repeated multiplication
                        if lt(i, 16) {
                            for { let k := 0 } lt(k, i) { k := add(k, 1) } {
                                omega_i := mulmod(omega_i, omega, R_MOD)
                            }
                        }
                        // For larger i, use modexp
                        if iszero(lt(i, 16)) {
                            omega_i := modexp(omega, i)
                        }
                        
                        // Compute contribution
                        let denominator := addmod(chi, sub(R_MOD, omega_i), R_MOD)
                        
                        if iszero(denominator) {
                            mstore(INTERMEDIARY_SCALAR_APUB_SLOT, val)
                            leave
                        }
                        
                        let inv_denominator := modexp(denominator, sub(R_MOD, 2))
                        let numerator := mulmod(val, omega_i, R_MOD)
                        let contribution := mulmod(numerator, inv_denominator, R_MOD)
                        weightedSum := addmod(weightedSum, contribution, R_MOD)
                    }
                    
                    // Final result: (chi^n - 1) * weightedSum / n
                    let result := mulmod(chi_n_1, weightedSum, R_MOD)
                    result := mulmod(result, inv_n, R_MOD)
                    
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
                /// [LHS_A]_1 := V_{x,y}[U]_1 - [W]_1 + κ1([V]_1 - V_{x,y}[G]_1) - t_n(χ)[Q_{A,X}]_1 - t_{s_{max}}(ζ)[Q_{A,Y}]_1 
                ///               
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

                /// @dev calculate [LHS_A]_1 = V_{x,y}[U]_1 - [W]_1 + κ1([V]_1 - V_{x,y}[G]_1) - t_n(χ)[Q_{A,X}]_1 - t_{s_{max}}(ζ)[Q_{A,Y}]_1            
                function prepareLHSA() {
                    // V_{x,y}[U]_1
                    g1pointMulIntoDest(PROOF_POLY_U_X_SLOT_PART1, mload(PROOF_VXY_SLOT), AGG_LHS_A_X_SLOT_PART1)
                    
                    // V_{x,y}[U]_1 - [W]_1
                    g1pointSubAssign(AGG_LHS_A_X_SLOT_PART1, PROOF_POLY_W_X_SLOT_PART1)

                    // V_{x,y}[G]_1 (where G is the generator/identity point)
                    g1pointMulIntoDest(VK_IDENTITY_X_PART1, mload(PROOF_VXY_SLOT), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    
                    // [V]_1 - V_{x,y}[G]_1
                    g1pointSubIntoDest(PROOF_POLY_V_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    
                    // κ1([V]_1 - V_{x,y}[G]_1)
                    g1pointMulIntoDest(BUFFER_AGGREGATED_POLY_X_SLOT_PART1, mload(CHALLENGE_KAPPA_1_SLOT), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                    // (V_{x,y}[U]_1 - [W]_1) + κ1([V]_1 - V_{x,y}[G]_1)
                    g1pointAddIntoDest(AGG_LHS_A_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1, AGG_LHS_A_X_SLOT_PART1)

                    // t_n(χ)[Q_{A,X}]_1
                    g1pointMulIntoDest(PROOF_POLY_QAX_X_SLOT_PART1, mload(INTERMERDIARY_SCALAR_T_N_CHI_SLOT), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    
                    // ... - t_n(χ)[Q_{A,X}]_1
                    g1pointSubAssign(AGG_LHS_A_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                    // t_{s_{max}}(ζ)[Q_{A,Y}]_1
                    g1pointMulIntoDest(PROOF_POLY_QAY_X_SLOT_PART1, mload(INTERMERDIARY_SCALAR_T_SMAX_ZETA_SLOT), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    
                    // ... - t_{s_{max}}(ζ)[Q_{A,Y}]_1
                    g1pointSubAssign(AGG_LHS_A_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                }

                /// @dev [LHS_B]_1 := (1+κ2κ1^4)[A]_1 - κ2κ1^4A_pub[1]_1
                function prepareLHSB() {
                    let kappa2 := mload(CHALLENGE_KAPPA_2_SLOT)
                    let kappa1 := mload(CHALLENGE_KAPPA_1_SLOT)
                    let A_pub := mload(INTERMEDIARY_SCALAR_APUB_SLOT)

                    // (1+κ2κ1^4)
                    let coeff1 := addmod(1, mulmod(kappa2, modexp(kappa1, 4), R_MOD), R_MOD)

                    // κ2κ1^4A_pub
                    let coeff2 := mulmod(mulmod(kappa2, modexp(kappa1, 4), R_MOD), A_pub, R_MOD)

                    // (1+κ2κ1^4)[A]_1
                    g1pointMulIntoDest(PROOF_POLY_A_X_SLOT_PART1, coeff1, AGG_LHS_B_X_SLOT_PART1)

                    // κ2κ1^4A_pub[1]_1
                    g1pointMulIntoDest(VK_IDENTITY_X_PART1, coeff2, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                    // (1+κ2κ1^4)[A]_1 - κ2κ1^4A_pub[1]_1
                    g1pointSubAssign(AGG_LHS_B_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                }

                ///  @dev [LHS_C]_1 := κ1^2((R_{x,y}-1)[K_{-1}(x)L_{-1}(y)]_1 + κ0(\chi-1)(R_{x,y}[G]_1-R'_{x,y}[F]_1) 
                ///                     +κ0^2K_0(\chi)(R_{x,y}[G]_1-R''_{x,y}[F]_1) - t_{m_l}(\chi)[Q_{C,X}]_1 - t_{s_{max}}(\zeta)[Q_{C,Y}]_1) 
                ///                     + κ1^3([R]_1-R_{x,y}[1]_1) + κ2([R]_1-R'_{x,y}[1]_1) + κ2^2([R]_1-R''_{x,y}[1]_1)
                function prepareLHSC() {
                    let kappa0 := mload(CHALLENGE_KAPPA_0_SLOT)
                    let kappa1 := mload(CHALLENGE_KAPPA_1_SLOT)
                    let kappa1_pow2 := mulmod(kappa1, kappa1, R_MOD)
                    let kappa1_pow3 := mulmod(kappa1, kappa1_pow2, R_MOD)
                    let kappa2 := mload(CHALLENGE_KAPPA_2_SLOT)
                    let kappa2_pow2 := mulmod(kappa2, kappa2, R_MOD)
                    let chi := mload(CHALLENGE_CHI_SLOT)
                    let chi_1 := addmod(chi, sub(R_MOD, 1), R_MOD)
                    let r1 := mload(PROOF_R1XY_SLOT)
                    let r2 := mload(PROOF_R2XY_SLOT)
                    let r3 := mload(PROOF_R3XY_SLOT)
                    let k0 := mload(INTERMEDIARY_SCALAR_KO_SLOT)
                    let t_ml := mload(INTERMERDIARY_SCALAR_T_MI_CHI_SLOT)
                    let t_smax := mload(INTERMERDIARY_SCALAR_T_SMAX_ZETA_SLOT)

                    // Start with κ1^2(R_{x,y}-1)[K_{-1}(x)L_{-1}(y)]_1
                    let kappa1_pow2_r_1 := mulmod(kappa1_pow2, addmod(r1, sub(R_MOD, 1), R_MOD), R_MOD)
                    g1pointMulIntoDest(VK_POLY_KXLX_X_PART1, kappa1_pow2_r_1, AGG_LHS_C_X_SLOT_PART1)

                    // Add κ1^2 * κ0 * (χ-1) * (R_{x,y}[G]_1 - R'_{x,y}[F]_1)
                    let kappa1_pow2_kappa0_chi_1 := mulmod(mulmod(kappa1_pow2, kappa0, R_MOD), chi_1, R_MOD)
                    
                    // R_{x,y}[G]_1
                    g1pointMulIntoDest(INTERMERDIARY_POLY_G_X_SLOT_PART1, mulmod(kappa1_pow2_kappa0_chi_1, r1, R_MOD), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    g1pointAddIntoDest(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1, AGG_LHS_C_X_SLOT_PART1)
                    
                    // -R'_{x,y}[F]_1
                    g1pointMulIntoDest(INTERMERDIARY_POLY_F_X_SLOT_PART1, mulmod(kappa1_pow2_kappa0_chi_1, r2, R_MOD), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    g1pointSubAssign(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                    // Add κ1^2 * κ0^2 * K_0(χ) * (R_{x,y}[G]_1 - R''_{x,y}[F]_1)
                    let kappa1_pow2_kappa0_pow2_k0 := mulmod(mulmod(kappa1_pow2, mulmod(kappa0, kappa0, R_MOD), R_MOD), k0, R_MOD)
                    
                    // R_{x,y}[G]_1
                    g1pointMulIntoDest(INTERMERDIARY_POLY_G_X_SLOT_PART1, mulmod(kappa1_pow2_kappa0_pow2_k0, r1, R_MOD), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    g1pointAddIntoDest(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1, AGG_LHS_C_X_SLOT_PART1)
                    
                    // -R''_{x,y}[F]_1
                    g1pointMulIntoDest(INTERMERDIARY_POLY_F_X_SLOT_PART1, mulmod(kappa1_pow2_kappa0_pow2_k0, r3, R_MOD), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    g1pointSubAssign(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                    // Subtract κ1^2 * t_{m_l}(χ) * [Q_{C,X}]_1
                    g1pointMulIntoDest(PROOF_POLY_QCX_X_SLOT_PART1, mulmod(kappa1_pow2, t_ml, R_MOD), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    g1pointSubAssign(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                    // Subtract κ1^2 * t_{s_{max}}(ζ) * [Q_{C,Y}]_1
                    g1pointMulIntoDest(PROOF_POLY_QCY_X_SLOT_PART1, mulmod(kappa1_pow2, t_smax, R_MOD), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    g1pointSubAssign(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                    // Add κ1^3([R]_1 - R_{x,y}[1]_1)
                    g1pointMulIntoDest(PROOF_POLY_R_X_SLOT_PART1, kappa1_pow3, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    g1pointAddIntoDest(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1, AGG_LHS_C_X_SLOT_PART1)
                    
                    g1pointMulIntoDest(VK_IDENTITY_X_PART1, mulmod(kappa1_pow3, r1, R_MOD), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    g1pointSubAssign(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                    // Add κ2([R]_1 - R'_{x,y}[1]_1)
                    g1pointMulIntoDest(PROOF_POLY_R_X_SLOT_PART1, kappa2, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    g1pointAddIntoDest(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1, AGG_LHS_C_X_SLOT_PART1)
                    
                    g1pointMulIntoDest(VK_IDENTITY_X_PART1, mulmod(kappa2, r2, R_MOD), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    g1pointSubAssign(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                    // Add κ2^2([R]_1 - R''_{x,y}[1]_1)
                    g1pointMulIntoDest(PROOF_POLY_R_X_SLOT_PART1, kappa2_pow2, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    g1pointAddIntoDest(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1, AGG_LHS_C_X_SLOT_PART1)
                    
                    g1pointMulIntoDest(VK_IDENTITY_X_PART1, mulmod(kappa2_pow2, r3, R_MOD), BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
                    g1pointSubAssign(AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
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
                        let omega_ml := OMEGA_MI_1
                        let omega_smax := OMEGA_SMAX_1

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
                        g1pointMulAndAddIntoDest(PROOF_POLY_PI_ZETA_X_SLOT_PART1, kappa2_zeta, PAIRING_AGG_AUX_X_SLOT_PART1)
                        // += κ2^2 * ω_{m_I}^{-1} * χ *[M_{χ}]_1
                        g1pointMulAndAddIntoDest(PROOF_POLY_M_CHI_X_SLOT_PART1, kappa2_pow2_omega_ml_chi, PAIRING_AGG_AUX_X_SLOT_PART1)
                        // += κ2^2 * ζ * [M_ζ]_1
                        g1pointMulAndAddIntoDest(PROOF_POLY_M_ZETA_X_SLOT_PART1, kappa2_pow2_zeta, PAIRING_AGG_AUX_X_SLOT_PART1)
                        // += κ2^3 * ω_{m_I}^{-1} * χ * [N_{χ}]_1
                        g1pointMulAndAddIntoDest(PROOF_POLY_N_CHI_X_SLOT_PART1, kappa2_pow3_omega_ml_chi, PAIRING_AGG_AUX_X_SLOT_PART1)
                        // += κ2^3 * ω_smax^{-1} * ζ * [N_{ζ}]_1
                        g1pointMulAndAddIntoDest(PROOF_POLY_N_ZETA_X_SLOT_PART1, kappa2_pow3_omega_smax_zeta, PAIRING_AGG_AUX_X_SLOT_PART1)
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
                // e(P1, P2) = e(G1, G2)
                // e(P1, P2)*e(G1, -G2) = 1


                function finalPairing() -> success {
                    // load [LHS]_1 + [AUX]_1
                    mstore(0x000, mload(PAIRING_AGG_LHS_AUX_X_SLOT_PART1))
                    mstore(0x020, mload(PAIRING_AGG_LHS_AUX_X_SLOT_PART2))
                    mstore(0x040, mload(PAIRING_AGG_LHS_AUX_Y_SLOT_PART1))
                    mstore(0x060, mload(PAIRING_AGG_LHS_AUX_Y_SLOT_PART2))

                    // load [1]_2 
                    mstore(0x080, IDENTITY2_X1_PART1)
                    mstore(0x0a0, IDENTITY2_X1_PART2)
                    mstore(0x0c0, IDENTITY2_X0_PART1)
                    mstore(0x0e0, IDENTITY2_X0_PART2)
                    mstore(0x100, IDENTITY2_Y1_PART1)
                    mstore(0x120, IDENTITY2_Y1_PART2)
                    mstore(0x140, IDENTITY2_Y0_PART1)
                    mstore(0x160, IDENTITY2_Y0_PART2)

                    // load [B]_1 
                    mstore(0x180, mload(PROOF_POLY_B_X_SLOT_PART1))
                    mstore(0x1a0, mload(PROOF_POLY_B_X_SLOT_PART2))
                    mstore(0x1c0, mload(PROOF_POLY_B_Y_SLOT_PART1))
                    mstore(0x1e0, mload(PROOF_POLY_B_Y_SLOT_PART2))

                    // load [α^4]_2 
                    mstore(0x200, ALPHA_POWER4_X1_PART1)
                    mstore(0x220, ALPHA_POWER4_X1_PART2)
                    mstore(0x240, ALPHA_POWER4_X0_PART1)
                    mstore(0x260, ALPHA_POWER4_X0_PART2)
                    mstore(0x280, ALPHA_POWER4_Y1_PART1)
                    mstore(0x2a0, ALPHA_POWER4_Y1_PART2)
                    mstore(0x2c0, ALPHA_POWER4_Y0_PART1)
                    mstore(0x2e0, ALPHA_POWER4_Y0_PART2)

                    // load [U]_1 
                    mstore(0x300, mload(PROOF_POLY_U_X_SLOT_PART1))
                    mstore(0x320, mload(PROOF_POLY_U_X_SLOT_PART2))
                    mstore(0x340, mload(PROOF_POLY_U_Y_SLOT_PART1))
                    mstore(0x360, mload(PROOF_POLY_U_Y_SLOT_PART2))

                    // load [α]_2 
                    mstore(0x380, ALPHA_X1_PART1)
                    mstore(0x3a0, ALPHA_X1_PART2)
                    mstore(0x3c0, ALPHA_X0_PART1)
                    mstore(0x3e0, ALPHA_X0_PART2)
                    mstore(0x400, ALPHA_Y1_PART1)
                    mstore(0x420, ALPHA_Y1_PART2)
                    mstore(0x440, ALPHA_Y0_PART1)
                    mstore(0x460, ALPHA_Y0_PART2)

                    // load [V]_1 
                    mstore(0x480, mload(PROOF_POLY_V_X_SLOT_PART1))
                    mstore(0x4a0, mload(PROOF_POLY_V_X_SLOT_PART2))
                    mstore(0x4c0, mload(PROOF_POLY_V_Y_SLOT_PART1))
                    mstore(0x4e0, mload(PROOF_POLY_V_Y_SLOT_PART2))

                    // load [α^2]_2 
                    mstore(0x500, ALPHA_POWER2_X1_PART1)
                    mstore(0x520, ALPHA_POWER2_X1_PART2)
                    mstore(0x540, ALPHA_POWER2_X0_PART1)
                    mstore(0x560, ALPHA_POWER2_X0_PART2)
                    mstore(0x580, ALPHA_POWER2_Y1_PART1)
                    mstore(0x5a0, ALPHA_POWER2_Y1_PART2)
                    mstore(0x5c0, ALPHA_POWER2_Y0_PART1)
                    mstore(0x5e0, ALPHA_POWER2_Y0_PART2)

                    // load [W]_1 
                    mstore(0x600, mload(PROOF_POLY_W_X_SLOT_PART1))
                    mstore(0x620, mload(PROOF_POLY_W_X_SLOT_PART2))
                    mstore(0x640, mload(PROOF_POLY_W_Y_SLOT_PART1))
                    mstore(0x660, mload(PROOF_POLY_W_Y_SLOT_PART2))

                    // load [α^3]_2 
                    mstore(0x680, ALPHA_POWER3_X1_PART1)
                    mstore(0x6a0, ALPHA_POWER3_X1_PART2)
                    mstore(0x6c0, ALPHA_POWER3_X0_PART1)
                    mstore(0x6e0, ALPHA_POWER3_X0_PART2)
                    mstore(0x700, ALPHA_POWER3_Y1_PART1)
                    mstore(0x720, ALPHA_POWER3_Y1_PART2)
                    mstore(0x740, ALPHA_POWER3_Y0_PART1)
                    mstore(0x760, ALPHA_POWER3_Y0_PART2)

                    // load [O_pub]_1 
                    mstore(0x780, mload(PROOF_POLY_OPUB_X_SLOT_PART1))
                    mstore(0x7a0, mload(PROOF_POLY_OPUB_X_SLOT_PART2))
                    mstore(0x7c0, mload(PROOF_POLY_OPUB_Y_SLOT_PART1))
                    mstore(0x7e0, mload(PROOF_POLY_OPUB_Y_SLOT_PART2))

                    // load -[γ]_2
                    mstore(0x800, GAMMA_X1_PART1)
                    mstore(0x820, GAMMA_X1_PART2)
                    mstore(0x840, GAMMA_X0_PART1)
                    mstore(0x860, GAMMA_X0_PART2)
                    mstore(0x880, GAMMA_Y1_PART1)
                    mstore(0x8a0, GAMMA_Y1_PART2)
                    mstore(0x8c0, GAMMA_Y0_PART1)
                    mstore(0x8e0, GAMMA_Y0_PART2)

                    // load [O_mid]_1
                    mstore(0x900, mload(PROOF_POLY_OMID_X_SLOT_PART1))
                    mstore(0x920, mload(PROOF_POLY_OMID_X_SLOT_PART2))
                    mstore(0x940, mload(PROOF_POLY_OMID_Y_SLOT_PART1))
                    mstore(0x960, mload(PROOF_POLY_OMID_Y_SLOT_PART2))

                    // load -[η]_2
                    mstore(0x980, ETA_X1_PART1)
                    mstore(0x9a0, ETA_X1_PART2)
                    mstore(0x9c0, ETA_X0_PART1)
                    mstore(0x9e0, ETA_X0_PART2)
                    mstore(0xa00, ETA_Y1_PART1)
                    mstore(0xa20, ETA_Y1_PART2)
                    mstore(0xa40, ETA_Y0_PART1)
                    mstore(0xa60, ETA_Y0_PART2)

                    // load [O_prv]_1
                    mstore(0xa80, mload(PROOF_POLY_OPRV_X_SLOT_PART1))
                    mstore(0xaa0, mload(PROOF_POLY_OPRV_X_SLOT_PART2))
                    mstore(0xac0, mload(PROOF_POLY_OPRV_Y_SLOT_PART1))
                    mstore(0xae0, mload(PROOF_POLY_OPRV_Y_SLOT_PART2))

                    // load -[δ]_2
                    mstore(0xb00, DELTA_X1_PART1)
                    mstore(0xb20, DELTA_X1_PART2)
                    mstore(0xb40, DELTA_X0_PART1)
                    mstore(0xb60, DELTA_X0_PART2)
                    mstore(0xb80, DELTA_Y1_PART1)
                    mstore(0xba0, DELTA_Y1_PART2)
                    mstore(0xbc0, DELTA_Y0_PART1)
                    mstore(0xbe0, DELTA_Y0_PART2)

                    // load [RHS_1]_1 := κ2[Π_{χ}]_1 + κ2^2[M_{χ}]_1 + κ2^3[N_{χ}]_1
                    mstore(0xc00, mload(PAIRING_AGG_RHS_1_X_SLOT_PART1))
                    mstore(0xc20, mload(PAIRING_AGG_RHS_1_X_SLOT_PART2))
                    mstore(0xc40, mload(PAIRING_AGG_RHS_1_Y_SLOT_PART1))
                    mstore(0xc60, mload(PAIRING_AGG_RHS_1_Y_SLOT_PART2))

                    // load -[x]_2
                    mstore(0xc80, X_X1_PART1)
                    mstore(0xca0, X_X1_PART2)
                    mstore(0xcc0, X_X0_PART1)
                    mstore(0xce0, X_X0_PART2)
                    mstore(0xd00, X_Y1_PART1)
                    mstore(0xd20, X_Y1_PART2)
                    mstore(0xd40, X_Y0_PART1)
                    mstore(0xd60, X_Y0_PART2)

                    // load [RHS_2]_2 := κ2[Π_{ζ}]_1 + κ2^2[M_{ζ}]_1 + κ2^3[N_{ζ}]_1
                    mstore(0xd80, mload(PAIRING_AGG_RHS_2_X_SLOT_PART1))
                    mstore(0xda0, mload(PAIRING_AGG_RHS_2_X_SLOT_PART2))
                    mstore(0xdc0, mload(PAIRING_AGG_RHS_2_Y_SLOT_PART1))
                    mstore(0xde0, mload(PAIRING_AGG_RHS_2_Y_SLOT_PART2))

                    // load -[y]_2
                    mstore(0xe00, Y_X1_PART1)
                    mstore(0xe20, Y_X1_PART2)
                    mstore(0xe40, Y_X0_PART1)
                    mstore(0xe60, Y_X0_PART2)
                    mstore(0xe80, Y_Y1_PART1)
                    mstore(0xea0, Y_Y1_PART2)
                    mstore(0xec0, Y_Y0_PART1)
                    mstore(0xee0, Y_Y0_PART2)

                    // precompile call
                    success := staticcall(gas(), 0x0f, 0, 0xf00, 0x00, 0x20)
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
                prepareLHSA()
                prepareLHSB()
                prepareLHSC()
                prepareRHS1()
                prepareRHS2()
                prepareAggregatedCommitment()
            
                // Step5: final pairing
                final_result := finalPairing()
                mstore(0x00, final_result)
                return(0x00, 0x20)
            }

        }

    }