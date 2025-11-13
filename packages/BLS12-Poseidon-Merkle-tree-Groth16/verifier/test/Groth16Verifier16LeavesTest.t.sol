// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.13;

import "../forge-std/src/Test.sol";
import "../forge-std/src/console.sol";
import "../src/Groth16Verifier16Leaves.sol";

contract Groth16Verifier16LeavesTest is Test {
    Groth16Verifier16Leaves public verifier;

    // BLS12-381 proof constants from test/proof.json - split into PART1/PART2
    uint256 constant pA_x_PART1 = 0x0000000000000000000000000000000014d8de264e7b9e5cfde789f3ca94f256;
    uint256 constant pA_x_PART2 = 0x143e0ffe796f4e34b936bacf398755e7667ae432eb95d42ebde25f00fd7f650e;
    uint256 constant pA_y_PART1 = 0x00000000000000000000000000000000161d4d31de7b3ddc92d44b9cb30d3004;
    uint256 constant pA_y_PART2 = 0x0f82dbb8c436ece2b99be25b68846bced2909ffcad48bc0ffa854f33efca13ae;

    uint256 constant pB_x0_PART1 = 0x0000000000000000000000000000000014612fac3de54874f258b1a82e2855d6;
    uint256 constant pB_x0_PART2 = 0x1bc056aef408467dd31e8aae6e37864bd84ad4b71d0a08107cd4dee4b217ca71;
    uint256 constant pB_x1_PART1 = 0x0000000000000000000000000000000008b21ff4281b079ea2b36bf99999d480;
    uint256 constant pB_x1_PART2 = 0xa72e1ccc1f38130c686899c43d452465a49f9fc6daa41a2a1142e9171ee6a617;
    uint256 constant pB_y0_PART1 = 0x000000000000000000000000000000001880c48857e7e6a2cb43bec3e93f5482;
    uint256 constant pB_y0_PART2 = 0xcd80fae83b5e8d450ef26b919beb326205d91639787485982d1530f0addc37f7;
    uint256 constant pB_y1_PART1 = 0x000000000000000000000000000000001004b79154de3210656b66c0ccb3382f;
    uint256 constant pB_y1_PART2 = 0xebd865141035fcfd8a1088d1b739c56cac9cae783d4dc413bc6666176e48a366;

    uint256 constant pC_x_PART1 = 0x0000000000000000000000000000000002c00d711de515b1f85d169bf5b47be8;
    uint256 constant pC_x_PART2 = 0x2d0d991cb33dabf128c7120f57fc5d6d6a183ed79f541ce21b5767a41a97f4e6;
    uint256 constant pC_y_PART1 = 0x00000000000000000000000000000000092458c03897c337f919f7a0e2e6afa4;
    uint256 constant pC_y_PART2 = 0x084b9f196e6aaaceb824fe03232d6b0dd1863cb1ca0fdb36ca77991d24f3db03;

    function setUp() public {
        verifier = new Groth16Verifier16Leaves();
    }

    function testValidProof() public {
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
            uint256(41510165075617313068276189002270872228282089971991373635231914671927802988622),
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

    function testGasConsumption() public {
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
            uint256(41510165075617313068276189002270872228282089971991373635231914671927802988622),
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
