    // SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IVerifier} from "./interface/IVerifier.sol";

/* solhint-disable max-line-length */
/// @author Project Ooo team
/// @dev It uses a custom memory layout inside the inline assembly block. Each reserved memory cell is declared in the
/// constants below.
/// @dev For a better understanding of the verifier algorithm please refer to the following papers:
/// *
/// * Original Tokamak zkSNARK Paper: https://eprint.iacr.org/2024/507.pdf
/// The notation used in the code is the same as in the papers.
/* solhint-enable max-line-length */
contract Verifier is IVerifier {
    /*//////////////////////////////////////////////////////////////
                                    Proof
    //////////////////////////////////////////////////////////////*/

    /// The encoding order of the `proof` (part1) is
    /// ```
    /// |                  672 bytes                 |
    /// | Polynomial commitments (16th first bytes)  |
    /// ```

    /// The encoding order of the `proof` (part2) is
    /// ```
    /// |               1344 bytes                |   32 bytes  |   32 bytes   |   32 bytes  |   32 bytes  |
    /// | Polynomial commitments (last 32 bytes)  |   R_{x,y}   |   R'_{x,y}   |   R''_{x,y} |   V_{x,y}   |
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
    uint256 internal constant CHALLENGE_THETA_2_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x040;
    uint256 internal constant CHALLENGE_KAPPA_0_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x060;
    uint256 internal constant CHALLENGE_KAPPA_1_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x080;
    uint256 internal constant CHALLENGE_KAPPA_2_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x0a0;
    uint256 internal constant CHALLENGE_ZETA_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x0c0;
    uint256 internal constant CHALLENGE_XI_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x0e0;
    uint256 internal constant CHALLENGE_CHI_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100;

    /*//////////////////////////////////////////////////////////////
                        Intermediary verifier state
    //////////////////////////////////////////////////////////////*/

    // [F]_1
    uint256 internal constant INTERMERDIARY_POLY_F_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x020;
    uint256 internal constant INTERMERDIARY_POLY_F_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x040;
    uint256 internal constant INTERMERDIARY_POLY_F_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x060;
    uint256 internal constant INTERMERDIARY_POLY_F_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x080;

    // [G]_1
    uint256 internal constant INTERMERDIARY_POLY_G_X_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x0a0;
    uint256 internal constant INTERMERDIARY_POLY_G_X_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x0c0;
    uint256 internal constant INTERMERDIARY_POLY_G_Y_SLOT_PART1 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x0e0;
    uint256 internal constant INTERMERDIARY_POLY_G_Y_SLOT_PART2 = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x100;

    // t_n(χ)
    uint256 internal constant INTERMERDIARY_SCALAR_T_N_CHI_SLOT = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x120;
    // t_smax(ζ)
    uint256 internal constant INTERMERDIARY_SCALAR_T_SMAX_ZETA_SLOT =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x140;
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

    uint256 internal constant PAIRING_AGG_LHS_X_SLOT_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x1a0;
    uint256 internal constant PAIRING_AGG_LHS_X_SLOT_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x1c0;
    uint256 internal constant PAIRING_AGG_LHS_Y_SLOT_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x1e0;
    uint256 internal constant PAIRING_AGG_LHS_Y_SLOT_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x200;

    uint256 internal constant PAIRING_AGG_AUX_X_SLOT_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x220;
    uint256 internal constant PAIRING_AGG_AUX_X_SLOT_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x240;
    uint256 internal constant PAIRING_AGG_AUX_Y_SLOT_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x260;
    uint256 internal constant PAIRING_AGG_AUX_Y_SLOT_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x280;

    uint256 internal constant PAIRING_AGG_LHS_AUX_X_SLOT_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x2a0;
    uint256 internal constant PAIRING_AGG_LHS_AUX_X_SLOT_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x2c0;
    uint256 internal constant PAIRING_AGG_LHS_AUX_Y_SLOT_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x2e0;
    uint256 internal constant PAIRING_AGG_LHS_AUX_Y_SLOT_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x300;

    uint256 internal constant PAIRING_AGG_RHS_1_X_SLOT_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x320;
    uint256 internal constant PAIRING_AGG_RHS_1_X_SLOT_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x340;
    uint256 internal constant PAIRING_AGG_RHS_1_Y_SLOT_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x360;
    uint256 internal constant PAIRING_AGG_RHS_1_Y_SLOT_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x380;

    uint256 internal constant PAIRING_AGG_RHS_2_X_SLOT_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x3a0;
    uint256 internal constant PAIRING_AGG_RHS_2_X_SLOT_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x3c0;
    uint256 internal constant PAIRING_AGG_RHS_2_Y_SLOT_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x3e0;
    uint256 internal constant PAIRING_AGG_RHS_2_Y_SLOT_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x400;

    /*//////////////////////////////////////////////////////////////
                                Pairing data
    //////////////////////////////////////////////////////////////*/

    uint256 internal constant BUFFER_AGGREGATED_POLY_X_SLOT_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x420;
    uint256 internal constant BUFFER_AGGREGATED_POLY_X_SLOT_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x440;
    uint256 internal constant BUFFER_AGGREGATED_POLY_Y_SLOT_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x460;
    uint256 internal constant BUFFER_AGGREGATED_POLY_Y_SLOT_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480;

    /*//////////////////////////////////////////////////////////////
                            Verification keys
    //////////////////////////////////////////////////////////////*/

    // [K^_1(X)L^-1(X)]_1
    uint256 internal constant VK_POLY_KXLX_X_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x020;
    uint256 internal constant VK_POLY_KXLX_X_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x040;
    uint256 internal constant VK_POLY_KXLX_Y_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x060;
    uint256 internal constant VK_POLY_KXLX_Y_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x080;

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
    uint256 internal constant VK_IDENTITY_X_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x1a0;
    uint256 internal constant VK_IDENTITY_X_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x1c0;
    uint256 internal constant VK_IDENTITY_Y_PART1 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x1e0;
    uint256 internal constant VK_IDENTITY_Y_PART2 =
        0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x200;

    /*//////////////////////////////////////////////////////////////
                                trusted-setup param
    //////////////////////////////////////////////////////////////*/

    // smax
    uint256 internal constant PARAM_SMAX = 0x8000 + 0x200 + 0x120 + 0xa20 + 0x80 + 0x100 + 0x1a0 + 0x480 + 0x200 + 0x020;

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
    // ω_64
    uint256 internal constant OMEGA_64 = 0x0e4840ac57f86f5e293b1d67bc8de5d9a12a70a615d0b8e4d2fc5e69ac5db47f;
    // m_i
    uint256 internal constant CONSTANT_MI = 1024;

    // ω_{m_i}^{-1}
    uint256 internal constant OMEGA_MI_1 = 0x2bcd9508a3dad316105f067219141f4450a32c41aa67e0beb0ad80034eb71aa6;

    // ω_smax_64^{-1}
    uint256 internal constant OMEGA_SMAX_64_MINUS_1 = 0x199cdaee7b3c79d6566009b5882952d6a41e85011d426b52b891fa3f982b68c5;
    // ω_smax_128^{-1}
    uint256 internal constant OMEGA_SMAX_128_MINUS_1 =
        0x1996fa8d52f970ba51420be43501370b166fb582ac74db12571ba2fccf28601b;
    // ω_smax_256^{-1}
    uint256 internal constant OMEGA_SMAX_256_MINUS_1 =
        0x6d64ed25272e58ee91b000235a5bfd4fc03cae032393991be9561c176a2f777a;
    // ω_smax_512^{-1}
    uint256 internal constant OMEGA_SMAX_512_MINUS_1 =
        0x1907a56e80f82b2df675522e37ad4eca1c510ebfb4543a3efb350dbef02a116e;
    // ω_smax_1024^{-1}
    uint256 internal constant OMEGA_SMAX_1024_MINUS_1 =
        0x2bcd9508a3dad316105f067219141f4450a32c41aa67e0beb0ad80034eb71aa6;
    // ω_smax_2048^{-1}
    uint256 internal constant OMEGA_SMAX_2048_MINUS_1 =
        0x394fda0d65ba213edeae67bc36f376e13cc5bb329aa58ff53dc9e5600f6fb2ac;

    /*//////////////////////////////////////////////////////////////
                            G2 elements
        //////////////////////////////////////////////////////////////*/

    // G2 Points for zkEVM Verifier (BLS12-381) - Standard Naming Convention
    // Each point uses 8 uint256 slots (256 bytes total)
    // Format: X0_PART1, X0_PART2, X1_PART1, X1_PART2, Y0_PART1, Y0_PART2, Y1_PART1, Y1_PART2

    //H: G2serde(Affine { x: 0x0ebd6f4ef306fcda87ef2bee22be04444dcc4f561b26680192dd1d52248be8ebd8668b0402c2bb11ebef5b29236b3df618e99900440bf5c55fff0a4fc7dcd38b39bac47ef1c165cca4dbbc08422dff76ade6abc48d625866bb0d3fd0b60c297e, y: 0x158afd59d53811c63bd0ab61e61fdaa2dd6e34aade8d67b149a28ed43aafaa2919129ee085cbe08ce8492f52a8ebbfae10674b5316f6c08e79cc75aab46b4d6c2a701dfcde2a46ca0204c3f9e39741fb15732a8c419da857d29dec927648a99e })
    // [1]_2 (Identity/Generator point H)
    uint256 internal constant IDENTITY2_X0_PART1 = 0x000000000000000000000000000000000ebd6f4ef306fcda87ef2bee22be0444;
    uint256 internal constant IDENTITY2_X0_PART2 = 0x4dcc4f561b26680192dd1d52248be8ebd8668b0402c2bb11ebef5b29236b3df6;
    uint256 internal constant IDENTITY2_X1_PART1 = 0x0000000000000000000000000000000018e99900440bf5c55fff0a4fc7dcd38b;
    uint256 internal constant IDENTITY2_X1_PART2 = 0x39bac47ef1c165cca4dbbc08422dff76ade6abc48d625866bb0d3fd0b60c297e;
    uint256 internal constant IDENTITY2_Y0_PART1 = 0x00000000000000000000000000000000158afd59d53811c63bd0ab61e61fdaa2;
    uint256 internal constant IDENTITY2_Y0_PART2 = 0xdd6e34aade8d67b149a28ed43aafaa2919129ee085cbe08ce8492f52a8ebbfae;
    uint256 internal constant IDENTITY2_Y1_PART1 = 0x0000000000000000000000000000000010674b5316f6c08e79cc75aab46b4d6c;
    uint256 internal constant IDENTITY2_Y1_PART2 = 0x2a701dfcde2a46ca0204c3f9e39741fb15732a8c419da857d29dec927648a99e;

    //alpha: G2serde(Affine { x: 0x13be37b0d3120587e0ea3a415ba8932a7973015d69da881661e712c41c8154f27b50c7a4aa6b88f7ea1b0c6d61e339360745eb9f361eb7e56b6853618a7919ecb8b74018ab98f00d498a9e4fa058b2520c6ed587ce2c96eec826f1dd41aa668c, y: 0x12b3500ce7f7b2b50a7a84b4fb0811f7d59d351e08815fd68d1c5cd1a5cf2cf5cd1ef00b970b170fd49098b2b8a297ff0754077cedcdeab5a321c93993ecc2522227150031e13e16386f99fc5d9fa010df3261749509deee846fb9acdf1f31a0 })
    // [α]_2
    uint256 internal constant ALPHA_X0_PART1 = 0x0000000000000000000000000000000013be37b0d3120587e0ea3a415ba8932a;
    uint256 internal constant ALPHA_X0_PART2 = 0x7973015d69da881661e712c41c8154f27b50c7a4aa6b88f7ea1b0c6d61e33936;
    uint256 internal constant ALPHA_X1_PART1 = 0x000000000000000000000000000000000745eb9f361eb7e56b6853618a7919ec;
    uint256 internal constant ALPHA_X1_PART2 = 0xb8b74018ab98f00d498a9e4fa058b2520c6ed587ce2c96eec826f1dd41aa668c;
    uint256 internal constant ALPHA_Y0_PART1 = 0x0000000000000000000000000000000012b3500ce7f7b2b50a7a84b4fb0811f7;
    uint256 internal constant ALPHA_Y0_PART2 = 0xd59d351e08815fd68d1c5cd1a5cf2cf5cd1ef00b970b170fd49098b2b8a297ff;
    uint256 internal constant ALPHA_Y1_PART1 = 0x000000000000000000000000000000000754077cedcdeab5a321c93993ecc252;
    uint256 internal constant ALPHA_Y1_PART2 = 0x2227150031e13e16386f99fc5d9fa010df3261749509deee846fb9acdf1f31a0;



    //alpha2: G2serde(Affine { x: 0x04963020eb92f0b65c9ceaf9ab2e411103117178b8a11f9da6987b60f8cc693d8626202926927bd32f44de0eb28a92cf03e7633616ac2c91b7527b01e962466315abe86f2f99fba2a2b7a437cf6db2b7e5078fb39a8f184f2c2bd00798518317, y: 0x1004bc7121e29247d8702d1d33dd585a64d9d938f819b739cde470cf77a12b3e84df44eb5138728f9d8b417c212c4633130270d8e59e71458d5216a3107f3c48dcbc1d1de90631660d63207cd143c540ac7d3661787c13e393fbb1d5c45f2001 })
    // [α^2]_2
    uint256 internal constant ALPHA_POWER2_X0_PART1 = 0x0000000000000000000000000000000004963020eb92f0b65c9ceaf9ab2e4111;
    uint256 internal constant ALPHA_POWER2_X0_PART2 = 0x03117178b8a11f9da6987b60f8cc693d8626202926927bd32f44de0eb28a92cf;
    uint256 internal constant ALPHA_POWER2_X1_PART1 = 0x0000000000000000000000000000000003e7633616ac2c91b7527b01e9624663;
    uint256 internal constant ALPHA_POWER2_X1_PART2 = 0x15abe86f2f99fba2a2b7a437cf6db2b7e5078fb39a8f184f2c2bd00798518317;
    uint256 internal constant ALPHA_POWER2_Y0_PART1 = 0x000000000000000000000000000000001004bc7121e29247d8702d1d33dd585a;
    uint256 internal constant ALPHA_POWER2_Y0_PART2 = 0x64d9d938f819b739cde470cf77a12b3e84df44eb5138728f9d8b417c212c4633;
    uint256 internal constant ALPHA_POWER2_Y1_PART1 = 0x00000000000000000000000000000000130270d8e59e71458d5216a3107f3c48;
    uint256 internal constant ALPHA_POWER2_Y1_PART2 = 0xdcbc1d1de90631660d63207cd143c540ac7d3661787c13e393fbb1d5c45f2001;

    //alpha3: G2serde(Affine { x: 0x04ad74c24fa7ae084e3f6baff982fcfdda88021e2c23d66ee515e928a623961d0ca53637153ae5dac70ef9cf4c5af13304febe79772a2ce774da4ec75a8200c7f42d6d312bcc388eadccd17b5cbcddcd9c3af3a9d91c58c3903472d7f375093f, y: 0x12e1c9d595e916879460d91511144d77fb3d937cb8659c9af1166aacd17a464cc639e725cd6ada4010eee603d8a334160fd5de7e910efff48c263d5a15e8b80dd5e5eb5d33e11c46d51ee27b5789b83fb472344f6ec8c1a1cd7da4206355ee2c })
    // [α^3]_2
    uint256 internal constant ALPHA_POWER3_X0_PART1 = 0x0000000000000000000000000000000004ad74c24fa7ae084e3f6baff982fcfd;
    uint256 internal constant ALPHA_POWER3_X0_PART2 = 0xda88021e2c23d66ee515e928a623961d0ca53637153ae5dac70ef9cf4c5af133;
    uint256 internal constant ALPHA_POWER3_X1_PART1 = 0x0000000000000000000000000000000004febe79772a2ce774da4ec75a8200c7;
    uint256 internal constant ALPHA_POWER3_X1_PART2 = 0xf42d6d312bcc388eadccd17b5cbcddcd9c3af3a9d91c58c3903472d7f375093f;
    uint256 internal constant ALPHA_POWER3_Y0_PART1 = 0x0000000000000000000000000000000012e1c9d595e916879460d91511144d77;
    uint256 internal constant ALPHA_POWER3_Y0_PART2 = 0xfb3d937cb8659c9af1166aacd17a464cc639e725cd6ada4010eee603d8a33416;
    uint256 internal constant ALPHA_POWER3_Y1_PART1 = 0x000000000000000000000000000000000fd5de7e910efff48c263d5a15e8b80d;
    uint256 internal constant ALPHA_POWER3_Y1_PART2 = 0xd5e5eb5d33e11c46d51ee27b5789b83fb472344f6ec8c1a1cd7da4206355ee2c;

    //alpha4: G2serde(Affine { x: 0x15c78d1376869dff46751649e1ff542e787e2a33bcd670f1934a4b108cba6eb30c24aab6fd30aa881a438fa079dee4ad0c2bea345504f4f0432101efc805986c9b37d5ceacc254aacb1633f9ebd4ce738f3ee913b739d7f8c50185ce88516325, y: 0x12ce400907520a4e837fd8f4caf47654a7b43bdb96f09160fa6570dbe7c0e495a5526b5f631c10696d2846bbc622b53b0e9d3ded66b87f8803fe2d474d18d6310c80c0f600de136ff295ec94720abd2dcd173cb870afbffddf4b797347d682c3 })
    // [α^4]_2
    uint256 internal constant ALPHA_POWER4_X0_PART1 = 0x0000000000000000000000000000000015c78d1376869dff46751649e1ff542e;
    uint256 internal constant ALPHA_POWER4_X0_PART2 = 0x787e2a33bcd670f1934a4b108cba6eb30c24aab6fd30aa881a438fa079dee4ad;
    uint256 internal constant ALPHA_POWER4_X1_PART1 = 0x000000000000000000000000000000000c2bea345504f4f0432101efc805986c;
    uint256 internal constant ALPHA_POWER4_X1_PART2 = 0x9b37d5ceacc254aacb1633f9ebd4ce738f3ee913b739d7f8c50185ce88516325;
    uint256 internal constant ALPHA_POWER4_Y0_PART1 = 0x0000000000000000000000000000000012ce400907520a4e837fd8f4caf47654;
    uint256 internal constant ALPHA_POWER4_Y0_PART2 = 0xa7b43bdb96f09160fa6570dbe7c0e495a5526b5f631c10696d2846bbc622b53b;
    uint256 internal constant ALPHA_POWER4_Y1_PART1 = 0x000000000000000000000000000000000e9d3ded66b87f8803fe2d474d18d631;
    uint256 internal constant ALPHA_POWER4_Y1_PART2 = 0x0c80c0f600de136ff295ec94720abd2dcd173cb870afbffddf4b797347d682c3;

    //-γ: G2serde(Affine { x: 0x07096db3def0f79181e9158abd519288a1778ead6981f415cdcbb16cd1ee05623c7a039eb207fc3c0852be3d17e3966d0e49e51619f20c24db58848c4df7ee8cc6cbfbb10be3822342815908dc82e68b3a965e295980772d1dedc3f0a3706ee8, y: 0x05b45be412d083cc5777ed65a72a8872977bc8f68308abcbeeee2a8436ac25499ed831d9d0de4f26b90d283a9bd99e3907f69e1e80f708cb985652ac4e4ebb0502a826e55601f5e62bd1959df20ba54461dc96070f7ba31870fbc901bc67014d })
    // -[γ]_2 (negated for pairing)
    uint256 internal constant GAMMA_X0_PART1 = 0x0000000000000000000000000000000007096db3def0f79181e9158abd519288;
    uint256 internal constant GAMMA_X0_PART2 = 0xa1778ead6981f415cdcbb16cd1ee05623c7a039eb207fc3c0852be3d17e3966d;
    uint256 internal constant GAMMA_X1_PART1 = 0x000000000000000000000000000000000e49e51619f20c24db58848c4df7ee8c;
    uint256 internal constant GAMMA_X1_PART2 = 0xc6cbfbb10be3822342815908dc82e68b3a965e295980772d1dedc3f0a3706ee8;
    uint256 internal constant GAMMA_Y0_PART1 = 0x0000000000000000000000000000000005b45be412d083cc5777ed65a72a8872;
    uint256 internal constant GAMMA_Y0_PART2 = 0x977bc8f68308abcbeeee2a8436ac25499ed831d9d0de4f26b90d283a9bd99e39;
    uint256 internal constant GAMMA_Y1_PART1 = 0x0000000000000000000000000000000007f69e1e80f708cb985652ac4e4ebb05;
    uint256 internal constant GAMMA_Y1_PART2 = 0x02a826e55601f5e62bd1959df20ba54461dc96070f7ba31870fbc901bc67014d;

    //-η: G2serde(Affine { x: 0x0b807a006fc6e027e137ccbc336107d9456823fe958c93483c217c10d4eaeacb591b9279bd76371643795da0dd0653b917bef7541a7e3ff19d34572b53dda5d4d6ee2f33b6330468b287dcf203c6f8aa37aac68c97c6a0856ab9bb7a898c994f, y: 0x16e02f4df24cf3cde7d5e065b84e512c0e554f887dc9782edb1c1078ea4c170485c630eecec33929e8e58c58182d0bc0085856174af605a951e32e9c278d634f939270a91676d4435ca92ceca4a1621b60609e1525ccafa2e18adfab2ec8cc89 })
    // -[η]_2 (negated for pairing)
    uint256 internal constant ETA_X0_PART1 = 0x000000000000000000000000000000000b807a006fc6e027e137ccbc336107d9;
    uint256 internal constant ETA_X0_PART2 = 0x456823fe958c93483c217c10d4eaeacb591b9279bd76371643795da0dd0653b9;
    uint256 internal constant ETA_X1_PART1 = 0x0000000000000000000000000000000017bef7541a7e3ff19d34572b53dda5d4;
    uint256 internal constant ETA_X1_PART2 = 0xd6ee2f33b6330468b287dcf203c6f8aa37aac68c97c6a0856ab9bb7a898c994f;
    uint256 internal constant ETA_Y0_PART1 = 0x0000000000000000000000000000000016e02f4df24cf3cde7d5e065b84e512c;
    uint256 internal constant ETA_Y0_PART2 = 0x0e554f887dc9782edb1c1078ea4c170485c630eecec33929e8e58c58182d0bc0;
    uint256 internal constant ETA_Y1_PART1 = 0x00000000000000000000000000000000085856174af605a951e32e9c278d634f;
    uint256 internal constant ETA_Y1_PART2 = 0x939270a91676d4435ca92ceca4a1621b60609e1525ccafa2e18adfab2ec8cc89;

    //-δ: G2serde(Affine { x: 0x0a3498dcd378d26363b751ff71f1f58a9d9dd025fa977a634510d19acc61f55816fefece39902b606ff8014af4d2e3870194c5e9ef224b979cf5a605776dc16576f92dd0b61666d12d3c6429089dd0780ecefe64f6069ce5d30b3f8963affc32, y: 0x109f105c11fda7392c890e14a39b21e3bd47b8a20b358b96459f02a14ccd8e62de4cefdfd773772d60ff9636fe0dfbc3095a6688e4ba51aa4c2b5aa10e789c3c80fa53a93f81fa668a1df7313c969b6d90d0027397bc1d1f9cb660c15fc9dc4c })
    // -[δ]_2 (negated for pairing)
    uint256 internal constant DELTA_X0_PART1 = 0x000000000000000000000000000000000a3498dcd378d26363b751ff71f1f58a;
    uint256 internal constant DELTA_X0_PART2 = 0x9d9dd025fa977a634510d19acc61f55816fefece39902b606ff8014af4d2e387;
    uint256 internal constant DELTA_X1_PART1 = 0x000000000000000000000000000000000194c5e9ef224b979cf5a605776dc165;
    uint256 internal constant DELTA_X1_PART2 = 0x76f92dd0b61666d12d3c6429089dd0780ecefe64f6069ce5d30b3f8963affc32;
    uint256 internal constant DELTA_Y0_PART1 = 0x00000000000000000000000000000000109f105c11fda7392c890e14a39b21e3;
    uint256 internal constant DELTA_Y0_PART2 = 0xbd47b8a20b358b96459f02a14ccd8e62de4cefdfd773772d60ff9636fe0dfbc3;
    uint256 internal constant DELTA_Y1_PART1 = 0x00000000000000000000000000000000095a6688e4ba51aa4c2b5aa10e789c3c;
    uint256 internal constant DELTA_Y1_PART2 = 0x80fa53a93f81fa668a1df7313c969b6d90d0027397bc1d1f9cb660c15fc9dc4c;

    //-x: G2serde(Affine { x: 0x17732d828fdb5fa9bb7054347a59e152aa77e64cb3c5de0d66a48eb2b640870dd0c4dc3e4ad0403bf981c5e847291d08165027557b65b14245e41cfb21a12361cf8f53eae0fc357ecf8a88bfef16cc425e7e8d31083143ee0974445659ebb697, y: 0x0603ad615c84be8302fa9ddee34b781f8109d381bb73eefa8ae2dc639649bdab671dac1a0a77110a99cf00521147d4a50a08340d7810455c3d5281ff00965999c28f95734739cf434acc09443e699ba2f7c65ac31373085ca5006eb28dca886c })
    // -[x]_2 (negated for pairing)
    uint256 internal constant X_X0_PART1 = 0x0000000000000000000000000000000017732d828fdb5fa9bb7054347a59e152;
    uint256 internal constant X_X0_PART2 = 0xaa77e64cb3c5de0d66a48eb2b640870dd0c4dc3e4ad0403bf981c5e847291d08;
    uint256 internal constant X_X1_PART1 = 0x00000000000000000000000000000000165027557b65b14245e41cfb21a12361;
    uint256 internal constant X_X1_PART2 = 0xcf8f53eae0fc357ecf8a88bfef16cc425e7e8d31083143ee0974445659ebb697;
    uint256 internal constant X_Y0_PART1 = 0x000000000000000000000000000000000603ad615c84be8302fa9ddee34b781f;
    uint256 internal constant X_Y0_PART2 = 0x8109d381bb73eefa8ae2dc639649bdab671dac1a0a77110a99cf00521147d4a5;
    uint256 internal constant X_Y1_PART1 = 0x000000000000000000000000000000000a08340d7810455c3d5281ff00965999;
    uint256 internal constant X_Y1_PART2 = 0xc28f95734739cf434acc09443e699ba2f7c65ac31373085ca5006eb28dca886c;

    //-y: G2serde(Affine { x: 0x079784b6b1a87c108a740b944ea3d92a34202f52a1de2fe3ea4d1541af9491bb23fed3c8711314a96e07005f311e4e6a08cb2c812bace1cdf283376f882e9f91f4bfea537b23587c44ac32de2f2d8a891da9f8830d3e689241b0aa1fc6329058, y: 0x0c8f5038c96d3d4a06e5e476bce0f9484ed9f0011c5b3f8f0cc319cb86baf026b995c4f33f294754798a437cc608cc4001ce32568d11e0d4f87d7a85a844295e8ac68f7d22c80195e9cd66b8e19c43cb781e2592515198bad1f7a1eecaeef57d })
    // -[y]_2 (negated for pairing)
    uint256 internal constant Y_X0_PART1 = 0x00000000000000000000000000000000079784b6b1a87c108a740b944ea3d92a;
    uint256 internal constant Y_X0_PART2 = 0x34202f52a1de2fe3ea4d1541af9491bb23fed3c8711314a96e07005f311e4e6a;
    uint256 internal constant Y_X1_PART1 = 0x0000000000000000000000000000000008cb2c812bace1cdf283376f882e9f91;
    uint256 internal constant Y_X1_PART2 = 0xf4bfea537b23587c44ac32de2f2d8a891da9f8830d3e689241b0aa1fc6329058;
    uint256 internal constant Y_Y0_PART1 = 0x000000000000000000000000000000000c8f5038c96d3d4a06e5e476bce0f948;
    uint256 internal constant Y_Y0_PART2 = 0x4ed9f0011c5b3f8f0cc319cb86baf026b995c4f33f294754798a437cc608cc40;
    uint256 internal constant Y_Y1_PART1 = 0x0000000000000000000000000000000001ce32568d11e0d4f87d7a85a844295e;
    uint256 internal constant Y_Y1_PART2 = 0x8ac68f7d22c80195e9cd66b8e19c43cb781e2592515198bad1f7a1eecaeef57d;

    /// @notice Load verification keys to memory in runtime.
    /// @dev The constants are loaded into memory in a specific layout declared in the constants starting from
    /// `VK_` prefix.
    /// NOTE: Function may corrupt the memory state if some memory was used before this function was called.
    function _loadVerificationKey() internal pure virtual {
        assembly {
            /*
            "lagrange_KL": {
                "x": "0x11018a9b67e60290cb9fe932b998651f1203fcdedf861280abcac156f2ffd1366b392a08934c2b9b049ca3ddf6b44358",
                "y": "0x0f0d92fa6d759b9600258018ae7763e08b66edba1ab33fd567828789a3d9a764c836db47e893545149229fa333ea485b"
            }
            */
            // preproccessed KL commitment vk
            mstore(VK_POLY_KXLX_X_PART1, 0x0000000000000000000000000000000011018a9b67e60290cb9fe932b998651f)
            mstore(VK_POLY_KXLX_X_PART2, 0x1203fcdedf861280abcac156f2ffd1366b392a08934c2b9b049ca3ddf6b44358)
            mstore(VK_POLY_KXLX_Y_PART1, 0x000000000000000000000000000000000f0d92fa6d759b9600258018ae7763e0)
            mstore(VK_POLY_KXLX_Y_PART2, 0x8b66edba1ab33fd567828789a3d9a764c836db47e893545149229fa333ea485b)

            /*
            "G": {
                "x": "0x1007876202a43775254ed802a9ebed25ea1aab54fd30a20504e9ee8742fa40046bbae8cdc0c52aea3e1424ad5a349d9a",
                "y": "0x15691a58a3323804f644e7aac6e641c9f7a12bbe04de03450e9fb19441147e38c30d8f2ca1f0c175d7f18b4665809749"
            }
            */
            // [1]_1 (Generator/Identity point)
            mstore(VK_IDENTITY_X_PART1, 0x000000000000000000000000000000001007876202a43775254ed802a9ebed25)
            mstore(VK_IDENTITY_X_PART2, 0xea1aab54fd30a20504e9ee8742fa40046bbae8cdc0c52aea3e1424ad5a349d9a)
            mstore(VK_IDENTITY_Y_PART1, 0x0000000000000000000000000000000015691a58a3323804f644e7aac6e641c9)
            mstore(VK_IDENTITY_Y_PART2, 0xf7a12bbe04de03450e9fb19441147e38c30d8f2ca1f0c175d7f18b4665809749)

            /*
            "x": {
                "x": "0x0b5eee9e5578a8d8ab2af3e083bb817ef6f0b490ba44184c80dc24109b69266f69befb70ee6f91009c5b283a0a6d801c",
                "y": "0x064ac370da0b6beb2bbe69080918d19a283e721b166e402b071be1ef6662adf274d47aa5f4e58852fde3492b80f7f670"
            },
            */
            // [x]_1 (Polynomial evaluation point)
            mstore(VK_POLY_X_X_PART1, 0x000000000000000000000000000000000b5eee9e5578a8d8ab2af3e083bb817e)
            mstore(VK_POLY_X_X_PART2, 0xf6f0b490ba44184c80dc24109b69266f69befb70ee6f91009c5b283a0a6d801c)
            mstore(VK_POLY_X_Y_PART1, 0x00000000000000000000000000000000064ac370da0b6beb2bbe69080918d19a)
            mstore(VK_POLY_X_Y_PART2, 0x283e721b166e402b071be1ef6662adf274d47aa5f4e58852fde3492b80f7f670)

            /*
            "y": {
                "x": "0x05c875c0b8d3534624ee5bb6e9ecab3d62a3c960033d6ae5a4b78d673cec996c26f81564c79d3e16a4c4791c155d9f39",
                "y": "0x19484450d4bb901517dbecdfc09eef7216ad83df49df0ad0690d6a70607842521e8c9daa6e7896dfd822982ea0b36edb"
            }
            */
            // [y]_1 (Polynomial evaluation point)
            mstore(VK_POLY_Y_X_PART1, 0x0000000000000000000000000000000005c875c0b8d3534624ee5bb6e9ecab3d)
            mstore(VK_POLY_Y_X_PART2, 0x62a3c960033d6ae5a4b78d673cec996c26f81564c79d3e16a4c4791c155d9f39)
            mstore(VK_POLY_Y_Y_PART1, 0x0000000000000000000000000000000019484450d4bb901517dbecdfc09eef72)
            mstore(VK_POLY_Y_Y_PART2, 0x16ad83df49df0ad0690d6a70607842521e8c9daa6e7896dfd822982ea0b36edb)
        }
    }

    function verify(
        uint128[] calldata, //_proof part1 (16 bytes)
        uint256[] calldata, // _proof part2 (32 bytes)
        uint128[] calldata, // _preprocessedPart1 (16 bytes)
        uint256[] calldata, // _preprocessedPart2 (32 bytes)
        uint256[] calldata, // publicInputs (used for computing A_pub)
        uint256 // smax
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

                if iszero(success) { revertWithMessage(22, "g1pointMulAndAddIntoDest") }
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
                default { neg_y_low := sub(Q_MOD_PART2, y_low) }

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
                default { neg_y_low := sub(Q_MOD_PART2, y_low) }

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
                let offset3 := calldataload(0x44)
                let offset4 := calldataload(0x64)
                let part1LengthInWords := calldataload(add(offset, 0x04))
                let part2LengthInWords := calldataload(add(offset2, 0x04))
                let isValid := and(eq(part1LengthInWords, 38), eq(part2LengthInWords, 42))

                // revert if the length of the proof is not valid
                if iszero(isValid) { revertWithMessage(27, "loadProof: Proof is invalid") }

                // S PERMUTATION POLYNOMIALS
                {
                    let x0 := calldataload(add(offset3, 0x024))
                    let y0 := calldataload(add(offset3, 0x044))
                    let x1 := calldataload(add(offset3, 0x064))
                    let y1 := calldataload(add(offset3, 0x084))
                    mstore(PUBLIC_INPUTS_S_0_X_SLOT_PART1, x0)
                    mstore(PUBLIC_INPUTS_S_0_Y_SLOT_PART1, y0)
                    mstore(PUBLIC_INPUTS_S_1_X_SLOT_PART1, x1)
                    mstore(PUBLIC_INPUTS_S_1_Y_SLOT_PART1, y1)
                    x0 := calldataload(add(offset4, 0x024))
                    y0 := calldataload(add(offset4, 0x044))
                    x1 := calldataload(add(offset4, 0x064))
                    y1 := calldataload(add(offset4, 0x084))
                    mstore(PUBLIC_INPUTS_S_0_X_SLOT_PART2, x0)
                    mstore(PUBLIC_INPUTS_S_0_Y_SLOT_PART2, y0)
                    mstore(PUBLIC_INPUTS_S_1_X_SLOT_PART2, x1)
                    mstore(PUBLIC_INPUTS_S_1_Y_SLOT_PART2, y1)
                }
                // PROOF U, V & W
                {
                    let x0 := calldataload(add(offset, 0x024))
                    let y0 := calldataload(add(offset, 0x044))
                    let x1 := calldataload(add(offset, 0x064))
                    let y1 := calldataload(add(offset, 0x084))
                    let x2 := calldataload(add(offset, 0x0a4))
                    let y2 := calldataload(add(offset, 0x0c4))
                    mstore(PROOF_POLY_U_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_U_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_V_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_V_Y_SLOT_PART1, y1)
                    mstore(PROOF_POLY_W_X_SLOT_PART1, x2)
                    mstore(PROOF_POLY_W_Y_SLOT_PART1, y2)
                    x0 := calldataload(add(offset2, 0x024))
                    y0 := calldataload(add(offset2, 0x044))
                    x1 := calldataload(add(offset2, 0x064))
                    y1 := calldataload(add(offset2, 0x084))
                    x2 := calldataload(add(offset2, 0x0a4))
                    y2 := calldataload(add(offset2, 0x0c4))
                    mstore(PROOF_POLY_U_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_U_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_V_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_V_Y_SLOT_PART2, y1)
                    mstore(PROOF_POLY_W_X_SLOT_PART2, x2)
                    mstore(PROOF_POLY_W_Y_SLOT_PART2, y2)
                }
                // PROOF O_MID & O_PRV
                {
                    let x0 := calldataload(add(offset, 0x0e4))
                    let y0 := calldataload(add(offset, 0x104))
                    let x1 := calldataload(add(offset, 0x124))
                    let y1 := calldataload(add(offset, 0x144))
                    mstore(PROOF_POLY_OMID_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_OMID_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_OPRV_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_OPRV_Y_SLOT_PART1, y1)
                    x0 := calldataload(add(offset2, 0x0e4))
                    y0 := calldataload(add(offset2, 0x104))
                    x1 := calldataload(add(offset2, 0x124))
                    y1 := calldataload(add(offset2, 0x144))
                    mstore(PROOF_POLY_OMID_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_OMID_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_OPRV_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_OPRV_Y_SLOT_PART2, y1)
                }
                // PROOF Q_AX, Q_AY, Q_CX & Q_CY
                {
                    let x0 := calldataload(add(offset, 0x164))
                    let y0 := calldataload(add(offset, 0x184))
                    let x1 := calldataload(add(offset, 0x1a4))
                    let y1 := calldataload(add(offset, 0x1c4))
                    let x2 := calldataload(add(offset, 0x1e4))
                    let y2 := calldataload(add(offset, 0x204))
                    let x3 := calldataload(add(offset, 0x224))
                    let y3 := calldataload(add(offset, 0x244))
                    mstore(PROOF_POLY_QAX_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_QAX_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_QAY_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_QAY_Y_SLOT_PART1, y1)
                    mstore(PROOF_POLY_QCX_X_SLOT_PART1, x2)
                    mstore(PROOF_POLY_QCX_Y_SLOT_PART1, y2)
                    mstore(PROOF_POLY_QCY_X_SLOT_PART1, x3)
                    mstore(PROOF_POLY_QCY_Y_SLOT_PART1, y3)
                    x0 := calldataload(add(offset2, 0x164))
                    y0 := calldataload(add(offset2, 0x184))
                    x1 := calldataload(add(offset2, 0x1a4))
                    y1 := calldataload(add(offset2, 0x1c4))
                    x2 := calldataload(add(offset2, 0x1e4))
                    y2 := calldataload(add(offset2, 0x204))
                    x3 := calldataload(add(offset2, 0x224))
                    y3 := calldataload(add(offset2, 0x244))
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
                    let x0 := calldataload(add(offset, 0x264))
                    let y0 := calldataload(add(offset, 0x284))
                    let x1 := calldataload(add(offset, 0x2a4))
                    let y1 := calldataload(add(offset, 0x2c4))
                    mstore(PROOF_POLY_PI_CHI_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_PI_CHI_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_PI_ZETA_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_PI_ZETA_Y_SLOT_PART1, y1)
                    x0 := calldataload(add(offset2, 0x264))
                    y0 := calldataload(add(offset2, 0x284))
                    x1 := calldataload(add(offset2, 0x2a4))
                    y1 := calldataload(add(offset2, 0x2c4))
                    mstore(PROOF_POLY_PI_CHI_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_PI_CHI_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_PI_ZETA_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_PI_ZETA_Y_SLOT_PART2, y1)
                }
                // PROOF B & R
                {
                    let x0 := calldataload(add(offset, 0x2e4))
                    let y0 := calldataload(add(offset, 0x304))
                    let x1 := calldataload(add(offset, 0x324))
                    let y1 := calldataload(add(offset, 0x344))
                    mstore(PROOF_POLY_B_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_B_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_R_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_R_Y_SLOT_PART1, y1)
                    x0 := calldataload(add(offset2, 0x2e4))
                    y0 := calldataload(add(offset2, 0x304))
                    x1 := calldataload(add(offset2, 0x324))
                    y1 := calldataload(add(offset2, 0x344))
                    mstore(PROOF_POLY_B_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_B_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_R_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_R_Y_SLOT_PART2, y1)
                }
                // PROOF M_ζ, M_χ, N_ζ & N_χ
                {
                    let x0 := calldataload(add(offset, 0x364))
                    let y0 := calldataload(add(offset, 0x384))
                    let x1 := calldataload(add(offset, 0x3a4))
                    let y1 := calldataload(add(offset, 0x3c4))
                    let x2 := calldataload(add(offset, 0x3e4))
                    let y2 := calldataload(add(offset, 0x404))
                    let x3 := calldataload(add(offset, 0x424))
                    let y3 := calldataload(add(offset, 0x444))
                    mstore(PROOF_POLY_M_ZETA_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_M_ZETA_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_M_CHI_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_M_CHI_Y_SLOT_PART1, y1)
                    mstore(PROOF_POLY_N_ZETA_X_SLOT_PART1, x2)
                    mstore(PROOF_POLY_N_ZETA_Y_SLOT_PART1, y2)
                    mstore(PROOF_POLY_N_CHI_X_SLOT_PART1, x3)
                    mstore(PROOF_POLY_N_CHI_Y_SLOT_PART1, y3)
                    x0 := calldataload(add(offset2, 0x364))
                    y0 := calldataload(add(offset2, 0x384))
                    x1 := calldataload(add(offset2, 0x3a4))
                    y1 := calldataload(add(offset2, 0x3c4))
                    x2 := calldataload(add(offset2, 0x3e4))
                    y2 := calldataload(add(offset2, 0x404))
                    x3 := calldataload(add(offset2, 0x424))
                    y3 := calldataload(add(offset2, 0x444))
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
                    let x0 := calldataload(add(offset, 0x464))
                    let y0 := calldataload(add(offset, 0x484))
                    let x1 := calldataload(add(offset, 0x4a4))
                    let y1 := calldataload(add(offset, 0x4c4))
                    mstore(PROOF_POLY_OPUB_X_SLOT_PART1, x0)
                    mstore(PROOF_POLY_OPUB_Y_SLOT_PART1, y0)
                    mstore(PROOF_POLY_A_X_SLOT_PART1, x1)
                    mstore(PROOF_POLY_A_Y_SLOT_PART1, y1)
                    x0 := calldataload(add(offset2, 0x464))
                    y0 := calldataload(add(offset2, 0x484))
                    x1 := calldataload(add(offset2, 0x4a4))
                    y1 := calldataload(add(offset2, 0x4c4))
                    mstore(PROOF_POLY_OPUB_X_SLOT_PART2, x0)
                    mstore(PROOF_POLY_OPUB_Y_SLOT_PART2, y0)
                    mstore(PROOF_POLY_A_X_SLOT_PART2, x1)
                    mstore(PROOF_POLY_A_Y_SLOT_PART2, y1)
                }

                mstore(PROOF_R1XY_SLOT, mod(calldataload(add(offset2, 0x4e4)), R_MOD))
                mstore(PROOF_R2XY_SLOT, mod(calldataload(add(offset2, 0x504)), R_MOD))
                mstore(PROOF_R3XY_SLOT, mod(calldataload(add(offset2, 0x524)), R_MOD))
                mstore(PROOF_VXY_SLOT, mod(calldataload(add(offset2, 0x544)), R_MOD))

                // load smax
                let smax := calldataload(0xa4)
                let isValidSmax
                {
                    isValidSmax :=
                        or(
                            or(or(eq(smax, 64), eq(smax, 128)), or(eq(smax, 256), eq(smax, 512))),
                            or(eq(smax, 1024), eq(smax, 2048))
                        )
                    mstore(PARAM_SMAX, smax)
                }

                // Revert if smax is not valid
                if iszero(isValidSmax) { revertWithMessage(27, "loadProof: smax is invalid") }
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

                    g1pointMulAndAddIntoDest(PUBLIC_INPUTS_S_0_X_SLOT_PART1, theta0, INTERMERDIARY_POLY_F_X_SLOT_PART1)
                    g1pointMulAndAddIntoDest(PUBLIC_INPUTS_S_1_X_SLOT_PART1, theta1, INTERMERDIARY_POLY_F_X_SLOT_PART1)
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

                    g1pointMulAndAddIntoDest(VK_POLY_X_X_PART1, theta0, INTERMERDIARY_POLY_G_X_SLOT_PART1)
                    g1pointMulAndAddIntoDest(VK_POLY_Y_X_PART1, theta1, INTERMERDIARY_POLY_G_X_SLOT_PART1)
                    g1pointMulAndAddIntoDest(VK_IDENTITY_X_PART1, theta2, INTERMERDIARY_POLY_G_X_SLOT_PART1)
                }
                // calculate t_n(χ)
                {
                    let chi := mload(CHALLENGE_CHI_SLOT)
                    let t := sub(modexp(chi, CONSTANT_N), 1)
                    mstore(INTERMERDIARY_SCALAR_T_N_CHI_SLOT, t)
                }

                // calculate t_smax(ζ)
                {
                    let zeta := mload(CHALLENGE_ZETA_SLOT)
                    let t := sub(modexp(zeta, mload(PARAM_SMAX)), 1)
                    mstore(INTERMERDIARY_SCALAR_T_SMAX_ZETA_SLOT, t)
                }

                // calculate t_mI(χ)
                {
                    let chi := mload(CHALLENGE_CHI_SLOT)
                    let t := sub(modexp(chi, CONSTANT_MI), 1)
                    mstore(INTERMERDIARY_SCALAR_T_MI_CHI_SLOT, t)
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
                if eq(chi, 1) { revert(0, 0) }

                // Compute χ^m_i mod R_MOD
                let chi_mi := modexp(chi, m_i)

                // Compute numerator (χ^m_i - 1) mod R_MOD
                let numerator := addmod(chi_mi, sub(R_MOD, 1), R_MOD)

                // Compute denominator m_i*(χ-1) mod R_MOD
                let chi_1 := addmod(chi, sub(R_MOD, 1), R_MOD)
                let denominator := mulmod(m_i, chi_1, R_MOD)

                // Check denominator is not zero
                if iszero(denominator) { revert(0, 0) }

                // Compute modular inverse using Fermat's little theorem
                let inv_denominator := modexp(denominator, sub(R_MOD, 2))

                // Final result: numerator * inv_denominator mod R_MOD
                let r := mulmod(numerator, inv_denominator, R_MOD)

                mstore(INTERMEDIARY_SCALAR_KO_SLOT, r)
            }

            function computeAPUB() {
                let chi := mload(CHALLENGE_CHI_SLOT)
                let offset := calldataload(0x84)

                let n := 64
                let omega := OMEGA_64

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
                        for { let k := 0 } lt(k, i) { k := add(k, 1) } { omega_i := mulmod(omega_i, omega, R_MOD) }
                    }
                    // For larger i, use modexp
                    if iszero(lt(i, 16)) { omega_i := modexp(omega, i) }

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

            /// @dev calculate [LHS_A]_1 = V_{x,y}[U]_1 - [W]_1 + κ1[V]_1 - t_n(χ)[Q_{A,X}]_1 - t_{s_{max}}(ζ)[Q_{A,Y}]_1
            function prepareLHSA() {
                g1pointMulIntoDest(PROOF_POLY_U_X_SLOT_PART1, mload(PROOF_VXY_SLOT), AGG_LHS_A_X_SLOT_PART1)
                g1pointSubAssign(AGG_LHS_A_X_SLOT_PART1, PROOF_POLY_W_X_SLOT_PART1)

                //κ1[V]_1
                g1pointMulIntoDest(
                    PROOF_POLY_V_X_SLOT_PART1, mload(CHALLENGE_KAPPA_1_SLOT), BUFFER_AGGREGATED_POLY_X_SLOT_PART1
                )

                // (V_{x,y}[U]_1 - [W]_1) + κ1[V]_1
                g1pointAddIntoDest(AGG_LHS_A_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1, AGG_LHS_A_X_SLOT_PART1)

                // t_n(χ)[Q_{A,X}]_1
                g1pointMulIntoDest(
                    PROOF_POLY_QAX_X_SLOT_PART1,
                    mload(INTERMERDIARY_SCALAR_T_N_CHI_SLOT),
                    BUFFER_AGGREGATED_POLY_X_SLOT_PART1
                )

                // (V_{x,y}[U]_1 - [W]_1) + (κ1 * ([V]_1 - V_{x,y}[1]_1)) - t_n(χ)[Q_{A,X}]_1
                g1pointSubAssign(AGG_LHS_A_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                // t_{s_{max}}(ζ)[Q_{A,Y}]_1
                g1pointMulIntoDest(
                    PROOF_POLY_QAY_X_SLOT_PART1,
                    mload(INTERMERDIARY_SCALAR_T_SMAX_ZETA_SLOT),
                    BUFFER_AGGREGATED_POLY_X_SLOT_PART1
                )
                // V_{x,y}[U]_1 - [W]_1 + κ1 * ([V]_1 - V_{x,y}[1]_1) - t_n(χ)[Q_{A,X}]_1 - t_{s_{max}}(ζ)[Q_{A,Y}]_1
                g1pointSubAssign(AGG_LHS_A_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)
            }

            /// @dev [LHS_B]_1 := (1+κ2κ1^4)[A]_1
            function prepareLHSB() {
                let kappa2 := mload(CHALLENGE_KAPPA_2_SLOT)
                let kappa1 := mload(CHALLENGE_KAPPA_1_SLOT)
                let A_pub := mload(INTERMEDIARY_SCALAR_APUB_SLOT)

                // 1+κ2κ1^4
                let coeff1 := addmod(1, mulmod(kappa2, modexp(kappa1, 4), R_MOD), R_MOD)

                // (1+κ2κ1^4)[A]_1
                g1pointMulIntoDest(PROOF_POLY_A_X_SLOT_PART1, coeff1, AGG_LHS_B_X_SLOT_PART1)
            }

            ///  @dev [LHS_C]_1 := κ1^2(R_{x,y} - 1) * [K_{-1}(X)L_{-1}(X)]_1 + a[G]_1
            ///                    - b[F]_1 - κ1^2 * t_{m_i}(χ) * [Q_{C,X}]_1 - κ1^2 * t_{s_{max}}(ζ) * [Q_{C,Y}]_1) + c[R]_1 + d[1]_1
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
                let a :=
                    mulmod(
                        mulmod(mulmod(mulmod(kappa1, kappa1, R_MOD), kappa0, R_MOD), r1, R_MOD),
                        addmod(chi_minus_1, mulmod(kappa0, k0, R_MOD), R_MOD),
                        R_MOD
                    )
                // b := κ1^2 * κ0 * ((χ-1) R’_{x,y} + κ0K_0(χ)R’’_{x,y})
                let b :=
                    mulmod(
                        mulmod(kappa1_pow2, kappa0, R_MOD),
                        addmod(mulmod(chi_minus_1, r2, R_MOD), mulmod(mulmod(kappa0, k0, R_MOD), r3, R_MOD), R_MOD),
                        R_MOD
                    )
                // c := κ1^3 + κ2 + κ2^2
                let c := addmod(kappa1_pow3, addmod(kappa2, kappa2_pow2, R_MOD), R_MOD)
                //    d := -κ1^3R_{x,y} - κ2R’_{x,y} - κ2^2R’’_{x,y} - κ1V_{x,y} - κ1^4A_{pub}
                // => d := - (κ1^3R_{x,y} + κ2R’_{x,y} + κ2^2R’’_{x,y} + κ1V_{x,y} + κ1^4A_{pub})
                let d :=
                    sub(
                        R_MOD,
                        addmod(
                            addmod(
                                addmod(mulmod(kappa1_pow3, r1, R_MOD), mulmod(kappa2, r2, R_MOD), R_MOD),
                                mulmod(kappa2_pow2, r3, R_MOD),
                                R_MOD
                            ),
                            addmod(
                                mulmod(kappa1, V_xy, R_MOD), mulmod(mulmod(kappa1, kappa1_pow3, R_MOD), A_pub, R_MOD), R_MOD
                            ),
                            R_MOD
                        )
                    )
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

            // @dev Function to get the correct omega_smax^{-1} value based on smax parameter
            function getOmegaSmaxInverse(smax) -> omega_smax_inv {
                switch smax
                case 64 { omega_smax_inv := OMEGA_SMAX_64_MINUS_1 }
                case 128 { omega_smax_inv := OMEGA_SMAX_128_MINUS_1 }
                case 256 { omega_smax_inv := OMEGA_SMAX_256_MINUS_1 }
                case 512 { omega_smax_inv := OMEGA_SMAX_512_MINUS_1 }
                case 1024 { omega_smax_inv := OMEGA_SMAX_1024_MINUS_1 }
                case 2048 { omega_smax_inv := OMEGA_SMAX_2048_MINUS_1 }
                default {
                    // This should never happen if loadProof validation is correct
                    revertWithMessage(25, "Invalid smax for omega")
                }
            }

            /// @dev [LHS]_1 := [LHS_B]_1 + κ2([LHS_A]_1 + [LHS_C]_1)
            /// @dev [AUX]_1 := κ2 * χ * [Π_{χ}]_1 + κ2 * ζ *[Π_ζ]_1 +
            ///                 κ2^2 * ω_{m_l}^{-1} * χ *[M_{χ}]_1 + κ2^2 * ζ * [M_ζ]_1 + κ2^3 * ω_{m_l}^{-1} * χ * [N_{χ}]_1 + κ_2^3 * ω_smax^{-1} * ζ * [N_{ζ}]
            function prepareAggregatedCommitment() {
                // calculate [LHS]_1 = [LHS_B]_1 + κ2([LHS_A]_1 + [LHS_C]_1)
                {
                    let kappa2 := mload(CHALLENGE_KAPPA_2_SLOT)

                    // First add [LHS_A]_1 + [LHS_C]_1
                    g1pointAddIntoDest(
                        AGG_LHS_A_X_SLOT_PART1, AGG_LHS_C_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1
                    )

                    // Multiply by κ2: κ2([LHS_A]_1 + [LHS_C]_1)
                    g1pointMulIntoDest(BUFFER_AGGREGATED_POLY_X_SLOT_PART1, kappa2, BUFFER_AGGREGATED_POLY_X_SLOT_PART1)

                    // Add [LHS_B]_1: [LHS_B]_1 + κ2([LHS_A]_1 + [LHS_C]_1)
                    g1pointAddIntoDest(
                        AGG_LHS_B_X_SLOT_PART1, BUFFER_AGGREGATED_POLY_X_SLOT_PART1, PAIRING_AGG_LHS_X_SLOT_PART1
                    )
                }

                // calculate [AUX]_1
                {
                    let kappa2 := mload(CHALLENGE_KAPPA_2_SLOT)
                    let chi := mload(CHALLENGE_CHI_SLOT)
                    let zeta := mload(CHALLENGE_ZETA_SLOT)
                    let omega_ml := OMEGA_MI_1
                    let omega_smax := getOmegaSmaxInverse(mload(PARAM_SMAX))

                    let kappa2_chi := mulmod(kappa2, chi, R_MOD)
                    let kappa2_zeta := mulmod(kappa2, zeta, R_MOD)
                    let kappa2_pow2_omega_ml_chi :=
                        mulmod(mulmod(mulmod(kappa2, kappa2, R_MOD), omega_ml, R_MOD), chi, R_MOD)
                    let kappa2_pow2_zeta := mulmod(mulmod(kappa2, kappa2, R_MOD), zeta, R_MOD)
                    let kappa2_pow3_omega_ml_chi :=
                        mulmod(mulmod(mulmod(mulmod(kappa2, kappa2, R_MOD), kappa2, R_MOD), omega_ml, R_MOD), chi, R_MOD)
                    let kappa2_pow3_omega_smax_zeta :=
                        mulmod(mulmod(mulmod(mulmod(kappa2, kappa2, R_MOD), kappa2, R_MOD), omega_smax, R_MOD), zeta, R_MOD)
                    // [AUX]_1 accumulation
                    // κ2 * χ * [Π_{χ}]_1
                    g1pointMulIntoDest(PROOF_POLY_PI_CHI_X_SLOT_PART1, kappa2_chi, PAIRING_AGG_AUX_X_SLOT_PART1)
                    // += κ2 * ζ *[Π_ζ]_1
                    g1pointMulAndAddIntoDest(PROOF_POLY_PI_ZETA_X_SLOT_PART1, kappa2_zeta, PAIRING_AGG_AUX_X_SLOT_PART1)
                    // += κ2^2 * ω_{m_l}^{-1} * χ *[M_{χ}]_1
                    g1pointMulAndAddIntoDest(
                        PROOF_POLY_M_CHI_X_SLOT_PART1, kappa2_pow2_omega_ml_chi, PAIRING_AGG_AUX_X_SLOT_PART1
                    )
                    // += κ2^2 * ζ * [M_ζ]_1
                    g1pointMulAndAddIntoDest(
                        PROOF_POLY_M_ZETA_X_SLOT_PART1, kappa2_pow2_zeta, PAIRING_AGG_AUX_X_SLOT_PART1
                    )
                    // κ2^3 * ω_{m_l}^{-1} * χ * [N_{χ}]_1
                    g1pointMulAndAddIntoDest(
                        PROOF_POLY_N_CHI_X_SLOT_PART1, kappa2_pow3_omega_ml_chi, PAIRING_AGG_AUX_X_SLOT_PART1
                    )
                    // κ2^3 * ω_smax^{-1} * ζ * [N_{ζ}]
                    g1pointMulAndAddIntoDest(
                        PROOF_POLY_N_ZETA_X_SLOT_PART1, kappa2_pow3_omega_smax_zeta, PAIRING_AGG_AUX_X_SLOT_PART1
                    )
                }

                // calculate [LHS]_1 + [AUX]_1
                {
                    g1pointAddIntoDest(
                        PAIRING_AGG_LHS_X_SLOT_PART1, PAIRING_AGG_AUX_X_SLOT_PART1, PAIRING_AGG_LHS_AUX_X_SLOT_PART1
                    )
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

            function finalPairing() {
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
                let success := staticcall(gas(), 0x0f, 0, 0xf00, 0x00, 0x20)
                if iszero(success) { revertWithMessage(32, "finalPairing: precompile failure") }
                if iszero(mload(0)) { revertWithMessage(29, "finalPairing: pairing failure") }
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
            finalPairing()
            final_result := true
            mstore(0x00, final_result)
            return(0x00, 0x20)
        }
    }
}
