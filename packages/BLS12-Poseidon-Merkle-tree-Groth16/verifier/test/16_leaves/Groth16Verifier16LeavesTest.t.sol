// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.13;

import "../../forge-std/src/Test.sol";
import "../../forge-std/src/console.sol";
import "../../src/Groth16Verifier16Leaves.sol";

contract Groth16Verifier16LeavesTest is Test {
    Groth16Verifier16Leaves public verifier;

    // BLS12-381 proof constants from test/proof.json - split into PART1/PART2
    uint256 constant pA_x_PART1 = 0x000000000000000000000000000000001704850f141027d38db82f9a156aee28;
    uint256 constant pA_x_PART2 = 0xb3f725613a9e9a5d2aa5d464e4e6c1bd0a9de4947b9a04967abf26d0b3e10f3a;
    uint256 constant pA_y_PART1 = 0x0000000000000000000000000000000006325a7118ee745184433e60cb84ccbf;
    uint256 constant pA_y_PART2 = 0x515433e324e6d78350910475b1f94a486214996b07ac363314dd0c5b8c3aaa29;

    uint256 constant pB_x0_PART1 = 0x000000000000000000000000000000001332d8875c37890b2a86f0a0015bb523;
    uint256 constant pB_x0_PART2 = 0x94b2cd85dd4dce83ff30862f4f8903f876d245f4988e3bd92aae71838a2a0ae7;
    uint256 constant pB_x1_PART1 = 0x000000000000000000000000000000000f97e07d90a2a9c2a823923f235c0f61;
    uint256 constant pB_x1_PART2 = 0xcb1185cbbd8191cf2122505bee2f94c1ce2eb60d19d44e42f7bcfd45bb2904a9;

    uint256 constant pB_y0_PART1 = 0x00000000000000000000000000000000151f0eb1cdd70dbf4bc7405232abab0a;
    uint256 constant pB_y0_PART2 = 0xbba50119f06b18d96a700a92a4baf1f4e921cabae97160f1856f145aca288d2f;
    uint256 constant pB_y1_PART1 = 0x0000000000000000000000000000000004c1ecd4035c3ebc0fa9591fca69f94c;
    uint256 constant pB_y1_PART2 = 0xbe72adaeaedf3e8ea5219f1f4ea72764c49eb845cebb9e681c0abfb03b53152a;

    uint256 constant pC_x_PART1 = 0x00000000000000000000000000000000100ce14e889866d9d134118098a1728b;
    uint256 constant pC_x_PART2 = 0x69dcd611c3c32af5c09952256b83fd2ad85b7d4b446f14dc9cef9f0a9a3fa970;
    uint256 constant pC_y_PART1 = 0x000000000000000000000000000000000acc5d3f42b695721aca04114462d719;
    uint256 constant pC_y_PART2 = 0x9bbc7a5f23d3dfff777aa61408144a047e7795e1571f60b40257dfc92173494f;

    function setUp() public {
        verifier = new Groth16Verifier16Leaves();
    }

    function testValidProof16() public view {
        // Test data from test/proof.json and ../prover/16_leaves/public.json
        // This proof is generated for BLS12-381 curve with 16-leaf Merkle tree

        // pi_a - G1 point (x_PART1, x_PART2, y_PART1, y_PART2)
        uint256[4] memory _pA = [pA_x_PART1, pA_x_PART2, pA_y_PART1, pA_y_PART2];

        // pi_b - G2 point (x0_PART1, x0_PART2, x1_PART1, x1_PART2, y0_PART1, y0_PART2, y1_PART1, y1_PART2)
        uint256[8] memory _pB =
            [pB_x0_PART1, pB_x0_PART2, pB_x1_PART1, pB_x1_PART2, pB_y0_PART1, pB_y0_PART2, pB_y1_PART1, pB_y1_PART2];

        // pi_c - G1 point (x_PART1, x_PART2, y_PART1, y_PART2)
        uint256[4] memory _pC = [pC_x_PART1, pC_x_PART2, pC_y_PART1, pC_y_PART2];

        // Public signals from public.json (33 values for 16-leaf Merkle tree proof)
        uint256[33] memory _pubSignals = [
            uint256(8717996803693071601560617594908257064884645203109477683134260534252752083859),
            uint256(6218676549690402052910318315276979534381485872621884367715834658603456243904),
            uint256(0),
            uint256(0),
            uint256(5708510646087729135889959965248975632956651064800454628727069218571497917126),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(2000000000000000000000000000),
            uint256(0),
            uint256(0),
            uint256(1000000),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0)
        ];

        // Verify the proof
        bool result = verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        assertTrue(result, "Valid proof should pass verification");
    }

    function testGasConsumption16() public view {
        // Test data from test/proof.json and ../prover/16_leaves/public.json
        // This test measures gas consumption for BLS12-381 Groth16 verification

        // pi_a - G1 point (x_PART1, x_PART2, y_PART1, y_PART2)
        uint256[4] memory _pA = [pA_x_PART1, pA_x_PART2, pA_y_PART1, pA_y_PART2];

        // pi_b - G2 point (x0_PART1, x0_PART2, x1_PART1, x1_PART2, y0_PART1, y0_PART2, y1_PART1, y1_PART2)
        uint256[8] memory _pB =
            [pB_x0_PART1, pB_x0_PART2, pB_x1_PART1, pB_x1_PART2, pB_y0_PART1, pB_y0_PART2, pB_y1_PART1, pB_y1_PART2];

        // pi_c - G1 point (x_PART1, x_PART2, y_PART1, y_PART2)
        uint256[4] memory _pC = [pC_x_PART1, pC_x_PART2, pC_y_PART1, pC_y_PART2];

        // Public signals from public.json (33 values for 16-leaf Merkle tree proof)
        uint256[33] memory _pubSignals = [
            uint256(8717996803693071601560617594908257064884645203109477683134260534252752083859),
            uint256(6218676549690402052910318315276979534381485872621884367715834658603456243904),
            uint256(0),
            uint256(0),
            uint256(5708510646087729135889959965248975632956651064800454628727069218571497917126),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(2000000000000000000000000000),
            uint256(0),
            uint256(0),
            uint256(1000000),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0)
        ];

        // Measure gas consumption
        uint256 gasStart = gasleft();
        bool result = verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        uint256 gasEnd = gasleft();

        uint256 gasUsed = gasStart - gasEnd;

        // Log the gas consumption
        console.log("=== BLS12-381 Groth16 Verification Gas Report ===");
        console.log("Gas used for proof verification:", gasUsed);
        console.log("Proof verification result:", result ? "PASSED" : "FAILED");
        console.log("Circuit: 16-leaf Merkle tree");
        console.log("Public signals: 33");
        console.log("Curve: BLS12-381");
        console.log("Protocol: Groth16");

        // Assert the proof is valid
        assertTrue(result, "Valid proof should pass verification");
    }
}
