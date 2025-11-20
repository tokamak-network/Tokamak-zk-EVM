// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

import "./Groth16Verifier128LeavesIC1.sol";
import "./Groth16Verifier128LeavesIC2.sol";

contract Groth16Verifier128LeavesOptimized {
    // BLS12-381 Scalar field modulus (r)
    uint256 constant R_MOD = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001;
    // BLS12-381 Base field modulus (q) - split into two parts for 48-byte representation
    uint256 constant Q_MOD_PART1 = 0x000000000000000000000000000000001a0111ea397fe69a4b1ba7b6434bacd7;
    uint256 constant Q_MOD_PART2 = 0x64774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab;

    // Verification Key constants for 128 leaves
    uint256 internal constant alphax_PART1 = 0x000000000000000000000000000000000b64c080c737ba7a22eb10bdd910a8dd;
    uint256 internal constant alphax_PART2 = 0xeaf6fee44136b7f01137411d704ce9834d1206f96c1e5b0d85331112474e00fd;
    uint256 internal constant alphay_PART1 = 0x0000000000000000000000000000000009b199d1d14d750ab035b0f175586479;
    uint256 internal constant alphay_PART2 = 0x6f17a9a71f42a94e5bc1cb31785503a35a264c9170aa22170403ace2330d9b46;

    uint256 constant betax1_PART1 = 0x0000000000000000000000000000000007708cfcadb0c0530028dcd0e1f21c08;
    uint256 constant betax1_PART2 = 0x7b7e3f36d98ff6be8ca8eb662fe3d824790d3570616010f104e99848f87d0c83;
    uint256 constant betax2_PART1 = 0x000000000000000000000000000000000048ff455eaf220d0cfa22014ef3aaf2;
    uint256 constant betax2_PART2 = 0xc5209615cf3a98e2545004b3d43a3591c1acbeefe16e3cf81155bc3aad5e3fe9;
    uint256 constant betay1_PART1 = 0x000000000000000000000000000000000349bdb043c0d6f663b59fb2ac8f80e1;
    uint256 constant betay1_PART2 = 0xb90ec6fcb9b51c11e201999fd2948b90db942941ee71a7ce24fac1a6b233da26;
    uint256 constant betay2_PART1 = 0x000000000000000000000000000000000adb0437246524e1737815ce833f795f;
    uint256 constant betay2_PART2 = 0x910b4c67537881a1a9901e5c9b2b3f43fbe23043e117d11be4b69f03e24f2a20;

    uint256 constant gammax1_PART1 = 0x00000000000000000000000000000000024aa2b2f08f0a91260805272dc51051;
    uint256 constant gammax1_PART2 = 0xc6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb8;
    uint256 constant gammax2_PART1 = 0x0000000000000000000000000000000013e02b6052719f607dacd3a088274f65;
    uint256 constant gammax2_PART2 = 0x596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e;
    uint256 constant gammay1_PART1 = 0x000000000000000000000000000000000ce5d527727d6e118cc9cdc6da2e351a;
    uint256 constant gammay1_PART2 = 0xadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801;
    uint256 constant gammay2_PART1 = 0x000000000000000000000000000000000606c4a02ea734cc32acd2b02bc28b99;
    uint256 constant gammay2_PART2 = 0xcb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79be;

    uint256 constant deltax1_PART1 = 0x0000000000000000000000000000000013050b3285c66c8f497615385adc5768;
    uint256 constant deltax1_PART2 = 0xced23aadc067103cc4f3b64756da70798782b5724ea5c47f1e16cc6221bb8ab8;
    uint256 constant deltax2_PART1 = 0x00000000000000000000000000000000130c513fe69286b5af813425020f8fd6;
    uint256 constant deltax2_PART2 = 0xcc38314d8adbab980acb5c0dcac40fe380949dbc1157d836e0f8039a8f205d63;
    uint256 constant deltay1_PART1 = 0x000000000000000000000000000000000f44469cd5169bb372ed871e49995a1d;
    uint256 constant deltay1_PART2 = 0x696ea6525f9b14e10ef6aeaa3675ee6b80952412c3f26da6c378c76161f05013;
    uint256 constant deltay2_PART1 = 0x00000000000000000000000000000000047c36e0f2612a960fa3d199dec78241;
    uint256 constant deltay2_PART2 = 0x0f1475fd53b59ee860cca26cfeded69370d498d6fd8847db8002e07ce87caff5;

    // References to the IC constants contracts
    Groth16Verifier128LeavesIC1 public icContract1;
    Groth16Verifier128LeavesIC2 public icContract2;

    // Memory layout for pairing check
    uint16 constant pPairing = 1408;
    uint16 constant pVk = 0; 
    uint16 constant pLastMem = 1664;

    constructor(address _icContract1, address _icContract2) {
        icContract1 = Groth16Verifier128LeavesIC1(_icContract1);
        icContract2 = Groth16Verifier128LeavesIC2(_icContract2);
    }

    function verifyProof(
        uint256[4] calldata _pA,
        uint256[8] calldata _pB, 
        uint256[4] calldata _pC,
        uint256[257] calldata _pubSignals
    ) public view returns (bool) {
        assembly {
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x0, x1, y0, y1, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x0)
                mstore(add(mIn, 32), x1)
                mstore(add(mIn, 64), y0)
                mstore(add(mIn, 96), y1)
                mstore(add(mIn, 128), s)

                success := staticcall(sub(gas(), 2000), 0x0c, mIn, 160, mIn, 128)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 128), mload(pR))
                mstore(add(mIn, 160), mload(add(pR, 32)))
                mstore(add(mIn, 192), mload(add(pR, 64)))
                mstore(add(mIn, 224), mload(add(pR, 96)))

                success := staticcall(sub(gas(), 2000), 0x0b, mIn, 256, pR, 128)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function getICValues1(index, ic_contract_addr) -> x0, x1, y0, y1 {
                let mIn := mload(0x40)
                
                // Prepare call data for getIC1(index)
                mstore(mIn, 0xf231279100000000000000000000000000000000000000000000000000000000) // getIC1 function selector
                mstore(add(mIn, 4), index)
                
                let success := staticcall(gas(), ic_contract_addr, mIn, 36, mIn, 128)
                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
                
                x0 := mload(mIn)
                x1 := mload(add(mIn, 32))
                y0 := mload(add(mIn, 64))
                y1 := mload(add(mIn, 96))
            }

            function getICValues2(index, ic_contract_addr) -> x0, x1, y0, y1 {
                let mIn := mload(0x40)
                
                // Prepare call data for getIC2(index)
                mstore(mIn, 0x49d837fe00000000000000000000000000000000000000000000000000000000) // getIC2 function selector
                mstore(add(mIn, 4), index)
                
                let success := staticcall(gas(), ic_contract_addr, mIn, 36, mIn, 128)
                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
                
                x0 := mload(mIn)
                x1 := mload(add(mIn, 32))
                y0 := mload(add(mIn, 64))
                y1 := mload(add(mIn, 96))
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem, ic_contract_addr1, ic_contract_addr2) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                // Get IC0 values and store (always from contract 1)
                let ic0_x0, ic0_x1, ic0_y0, ic0_y1 := getICValues1(0, ic_contract_addr1)
                mstore(_pVk, ic0_x0)
                mstore(add(_pVk, 32), ic0_x1)
                mstore(add(_pVk, 64), ic0_y0)
                mstore(add(_pVk, 96), ic0_y1)

                // Compute the linear combination vk_x using external IC values
                // Process first 128 signals (indices 1-128) from IC1
                for { let i := 1 } lt(i, 129) { i := add(i, 1) } {
                    let ic_x0, ic_x1, ic_y0, ic_y1 := getICValues1(i, ic_contract_addr1)
                    let pubSignalOffset := mul(sub(i, 1), 32)
                    g1_mulAccC(_pVk, ic_x0, ic_x1, ic_y0, ic_y1, calldataload(add(pubSignals, pubSignalOffset)))
                }

                // Process remaining 129 signals (indices 129-257) from IC2
                for { let i := 129 } lt(i, 258) { i := add(i, 1) } {
                    let ic_x0, ic_x1, ic_y0, ic_y1 := getICValues2(sub(i, 129), ic_contract_addr2)
                    let pubSignalOffset := mul(sub(i, 1), 32)
                    g1_mulAccC(_pVk, ic_x0, ic_x1, ic_y0, ic_y1, calldataload(add(pubSignals, pubSignalOffset)))
                }

                // -A (48-byte BLS12-381 format with proper base field negation)
                mstore(_pPairing, calldataload(pA)) // _pA[0][0] (x_PART1)
                mstore(add(_pPairing, 32), calldataload(add(pA, 32))) // _pA[0][1] (x_PART2)
                
                // Negate y-coordinate using proper BLS12-381 base field arithmetic: q - y
                let y_high := calldataload(add(pA, 64)) // y_PART1 (high part)
                let y_low := calldataload(add(pA, 96)) // y_PART2 (low part)

                let neg_y_high, neg_y_low
                let borrow := 0

                // Correct BLS12-381 field negation: q - y where q = Q_MOD_PART1 || Q_MOD_PART2
                // Handle the subtraction properly with borrowing
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
                
                neg_y_high := sub(sub(Q_MOD_PART1, y_high), borrow)

                mstore(add(_pPairing, 64), neg_y_high) // -y_PART1
                mstore(add(_pPairing, 96), neg_y_low) // -y_PART2

                // B (48-byte BLS12-381 format)
                // B G2 point order: x1, x0, y1, y0
                mstore(add(_pPairing, 128), calldataload(add(pB, 64))) // x1_PART1
                mstore(add(_pPairing, 160), calldataload(add(pB, 96))) // x1_PART2
                mstore(add(_pPairing, 192), calldataload(pB)) // x0_PART1
                mstore(add(_pPairing, 224), calldataload(add(pB, 32))) // x0_PART2
                mstore(add(_pPairing, 256), calldataload(add(pB, 192))) // y1_PART1
                mstore(add(_pPairing, 288), calldataload(add(pB, 224))) // y1_PART2
                mstore(add(_pPairing, 320), calldataload(add(pB, 128))) // y0_PART1
                mstore(add(_pPairing, 352), calldataload(add(pB, 160))) // y0_PART2

                // alpha1 (48-byte format) - PAIR 2 G1
                mstore(add(_pPairing, 384), alphax_PART1)
                mstore(add(_pPairing, 416), alphax_PART2)
                mstore(add(_pPairing, 448), alphay_PART1)
                mstore(add(_pPairing, 480), alphay_PART2)
                
                // beta2 G2 point order: x1, x0, y1, y0
                mstore(add(_pPairing, 512), betax1_PART1) // x1_PART1
                mstore(add(_pPairing, 544), betax1_PART2) // x1_PART2
                mstore(add(_pPairing, 576), betax2_PART1) // x0_PART1
                mstore(add(_pPairing, 608), betax2_PART2) // x0_PART2
                mstore(add(_pPairing, 640), betay1_PART1) // y1_PART1
                mstore(add(_pPairing, 672), betay1_PART2) // y1_PART2
                mstore(add(_pPairing, 704), betay2_PART1) // y0_PART1
                mstore(add(_pPairing, 736), betay2_PART2) // y0_PART2

                // vk_x (48-byte format from G1 point) - PAIR 3 G1
                mstore(add(_pPairing, 768), mload(_pVk)) // x_PART1
                mstore(add(_pPairing, 800), mload(add(_pVk, 32))) // x_PART2
                mstore(add(_pPairing, 832), mload(add(_pVk, 64))) // y_PART1
                mstore(add(_pPairing, 864), mload(add(_pVk, 96))) // y_PART2

                // gamma2 G2 point order: x1, x0, y1, y0
                mstore(add(_pPairing, 896), gammax1_PART1) // x1_PART1
                mstore(add(_pPairing, 928), gammax1_PART2) // x1_PART2
                mstore(add(_pPairing, 960), gammax2_PART1) // x0_PART1
                mstore(add(_pPairing, 992), gammax2_PART2) // x0_PART2
                mstore(add(_pPairing, 1024), gammay1_PART1) // y1_PART1
                mstore(add(_pPairing, 1056), gammay1_PART2) // y1_PART2
                mstore(add(_pPairing, 1088), gammay2_PART1) // y0_PART1
                mstore(add(_pPairing, 1120), gammay2_PART2) // y0_PART2

                // C (48-byte BLS12-381 format) - PAIR 4 G1
                mstore(add(_pPairing, 1152), calldataload(pC)) // _pC[0][0] (x_PART1)
                mstore(add(_pPairing, 1184), calldataload(add(pC, 32))) // _pC[0][1] (x_PART2)
                mstore(add(_pPairing, 1216), calldataload(add(pC, 64))) // _pC[1][0] (y_PART1)
                mstore(add(_pPairing, 1248), calldataload(add(pC, 96))) // _pC[1][1] (y_PART2)

                // delta2 G2 point order: x1, x0, y1, y0
                mstore(add(_pPairing, 1280), deltax1_PART1) // x1_PART1
                mstore(add(_pPairing, 1312), deltax1_PART2) // x1_PART2
                mstore(add(_pPairing, 1344), deltax2_PART1) // x0_PART1
                mstore(add(_pPairing, 1376), deltax2_PART2) // x0_PART2
                mstore(add(_pPairing, 1408), deltay1_PART1) // y1_PART1
                mstore(add(_pPairing, 1440), deltay1_PART2) // y1_PART2
                mstore(add(_pPairing, 1472), deltay2_PART1) // y0_PART1
                mstore(add(_pPairing, 1504), deltay2_PART2) // y0_PART2

                // Call pairing check
                let success := staticcall(sub(gas(), 2000), 0x0f, _pPairing, 1536, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Check the pairing
            let ic1_addr := sload(icContract1.slot)
            let ic2_addr := sload(icContract2.slot)
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem, ic1_addr, ic2_addr)
            
            mstore(0, isValid)
            return(0, 0x20)
        }
    }
}
