// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.13;

import "../../forge-std/src/Test.sol";
import "../../forge-std/src/console.sol";
import "../../src/Groth16Verifier16Leaves.sol";

contract Groth16Verifier16LeavesTest is Test {
    Groth16Verifier16Leaves public verifier;

    // BLS12-381 proof constants from test/proof.json - split into PART1/PART2
    uint256 constant pA_x_PART1 = 0x00000000000000000000000000000000121cb016585482e9f1485f3e2c23336b;
    uint256 constant pA_x_PART2 = 0x0dbfa56d128d925564e918234aa9abefedd811d5acac74216502e1fd4767a8c0;
    uint256 constant pA_y_PART1 = 0x0000000000000000000000000000000008d33bbc572ecf86f070953882ddfe16;
    uint256 constant pA_y_PART2 = 0x1a566767cc29c3ee47384e32d9797610d05234cbac300326aedd8e47fdff2e2f;

    //x1
    uint256 constant pB_x0_PART1 = 0x000000000000000000000000000000000e6cc31d339e0da5ae822355bbf3a406;
    uint256 constant pB_x0_PART2 = 0xf47a35b2528c261806ca74fb00a2645589b5c45e8c4a9db9a5701bff917a4ac8;
    //x0
    uint256 constant pB_x1_PART1 = 0x0000000000000000000000000000000016d9499f79190da89e56831d085e287c;
    uint256 constant pB_x1_PART2 = 0x4f9e6dfc87ae18e3c3482c974eb07e4e092f905277f767027a90fef362eadee5;

    //x1
    uint256 constant pB_y0_PART1 = 0x00000000000000000000000000000000069c7522fa235f8cc590950f03b05d43;
    uint256 constant pB_y0_PART2 = 0xd6dcdad0e77fc6f1f74ddebe240dbebfcccc716bf7383359ad27588918b0b690;
    //x0
    uint256 constant pB_y1_PART1 = 0x00000000000000000000000000000000047ce4ee2f920991a8cb6847fa51d0e0;
    uint256 constant pB_y1_PART2 = 0xc7758b597900fb14243e06c6fe95ca70e9373d375bf4e3e3aeadf8c17c988346;

    uint256 constant pC_x_PART1 = 0x000000000000000000000000000000000d786e268ee881a9bcc530cb506f9bdc;
    uint256 constant pC_x_PART2 = 0x37a3986aa23605b9963acb0f8202224ff6f16d41d11a167b96c4081d79c4e3e1;
    uint256 constant pC_y_PART1 = 0x00000000000000000000000000000000141c8a1c9d28aca606db65f9d9a0389c;
    uint256 constant pC_y_PART2 = 0x4f22482ca289ba61350b0fa008efc91810ba3ce707f02e7dbd782f4a5bcadf70;

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
            uint256(15888963209391035683195134355897815755112356355472829871549137654343691034788),
            uint256(123456789012345678901234567890),
            uint256(987654321098765432109876543210),
            uint256(111111111111111111111111111111),
            uint256(222222222222222222222222222222),
            uint256(333333333333333333333333333333),
            uint256(444444444444444444444444444444),
            uint256(555555555555555555555555555555),
            uint256(666666666666666666666666666666),
            uint256(777777777777777777777777777777),
            uint256(888888888888888888888888888888),
            uint256(999999999999999999999999999999),
            uint256(101010101010101010101010101010),
            uint256(121212121212121212121212121212),
            uint256(131313131313131313131313131313),
            uint256(141414141414141414141414141414),
            uint256(151515151515151515151515151515),
            uint256(1000000000000000000000000000000),
            uint256(2000000000000000000000000000000),
            uint256(3000000000000000000000000000000),
            uint256(4000000000000000000000000000000),
            uint256(5000000000000000000000000000000),
            uint256(6000000000000000000000000000000),
            uint256(7000000000000000000000000000000),
            uint256(8000000000000000000000000000000),
            uint256(9000000000000000000000000000000),
            uint256(1100000000000000000000000000000),
            uint256(1200000000000000000000000000000),
            uint256(1300000000000000000000000000000),
            uint256(1400000000000000000000000000000),
            uint256(1500000000000000000000000000000),
            uint256(1600000000000000000000000000000),
            uint256(1700000000000000000000000000000)
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
            uint256(15888963209391035683195134355897815755112356355472829871549137654343691034788),
            uint256(123456789012345678901234567890),
            uint256(987654321098765432109876543210),
            uint256(111111111111111111111111111111),
            uint256(222222222222222222222222222222),
            uint256(333333333333333333333333333333),
            uint256(444444444444444444444444444444),
            uint256(555555555555555555555555555555),
            uint256(666666666666666666666666666666),
            uint256(777777777777777777777777777777),
            uint256(888888888888888888888888888888),
            uint256(999999999999999999999999999999),
            uint256(101010101010101010101010101010),
            uint256(121212121212121212121212121212),
            uint256(131313131313131313131313131313),
            uint256(141414141414141414141414141414),
            uint256(151515151515151515151515151515),
            uint256(1000000000000000000000000000000),
            uint256(2000000000000000000000000000000),
            uint256(3000000000000000000000000000000),
            uint256(4000000000000000000000000000000),
            uint256(5000000000000000000000000000000),
            uint256(6000000000000000000000000000000),
            uint256(7000000000000000000000000000000),
            uint256(8000000000000000000000000000000),
            uint256(9000000000000000000000000000000),
            uint256(1100000000000000000000000000000),
            uint256(1200000000000000000000000000000),
            uint256(1300000000000000000000000000000),
            uint256(1400000000000000000000000000000),
            uint256(1500000000000000000000000000000),
            uint256(1600000000000000000000000000000),
            uint256(1700000000000000000000000000000)
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