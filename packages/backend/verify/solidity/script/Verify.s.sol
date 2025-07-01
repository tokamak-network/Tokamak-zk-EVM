// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {VerifierV3} from "../src/VerifierV3.sol";

contract VerifyScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address verifierAddress = vm.envAddress("VERIFIER_ADDRESS");

        VerifierV3 verifier = VerifierV3(verifierAddress);

        // Prepare proof data
        uint128[] memory serializedProofPart1 = new uint128[](42);
        uint256[] memory serializedProofPart2 = new uint256[](46);
        uint256[] memory publicInputs = new uint256[](128);
        uint256 smax;

        // SERIALIZED PROOF PART 1 (First 16 bytes - 32 hex chars)
        serializedProofPart1[0] = 0x0d8838cc826baa7ccd8cfe0692e8a13d; // s^{(0)}(x,y)_X
        serializedProofPart1[1] = 0x103aeb959c53fdd5f13b70a350363881; // s^{(0)}(x,y)_Y
        serializedProofPart1[2] = 0x09f0f94fd2dc8976bfeab5da30e1fa04; // s^{(1)}(x,y)_X
        serializedProofPart1[3] = 0x17cb62f5e698fe087b0f334e2fb2439c; // s^{(1)}(x,y)_Y
        serializedProofPart1[4] = 0x07be8e1a551012b701722c13889c649b; // U_X
        serializedProofPart1[5] = 0x0bdc6b8a4be68fb371fa4633afad2e93; // U_Y
        serializedProofPart1[6] = 0x0cf3e4f4ddb78781cd5740f3f2a1a3db; // V_X
        serializedProofPart1[7] = 0x0f4b46798d566e5f6653c4fe4df20e83; // V_Y
        serializedProofPart1[8] = 0x05ecf1d1f0e418d463fb000216fcc5cf; // W_X
        serializedProofPart1[9] = 0x040de0d20cae206f450f5924fdc1ed66; // W_Y
        serializedProofPart1[10] = 0x0d553694a909ee5e9f3995cf19aba69d; // O_mid_X
        serializedProofPart1[11] = 0x07a5608c528f6a6d64cfbc45d59c4ef0; // O_mid_Y
        serializedProofPart1[12] = 0x160c379d635cef2e6ab1c812d653dbbb; // O_prv_X
        serializedProofPart1[13] = 0x04533f945b5ed1a3fd870f5e3393856e; // O_prv_Y
        serializedProofPart1[14] = 0x12dbdc50f14c7d5f518913d7306cd9ba; // Q_{AX}_X
        serializedProofPart1[15] = 0x09e5bf0fcabb6f5f23395f9aa66f4dcf; // Q_{AX}_Y
        serializedProofPart1[16] = 0x03712e78aa9feb469f95030b0d0db407; // Q_{AY}_X
        serializedProofPart1[17] = 0x0bc20f18f993c7f5d840251dfb681f95; // Q_{AY}_Y
        serializedProofPart1[18] = 0x09425c00e69be170921c5c644f808b2f; // Q_{CX}_X
        serializedProofPart1[19] = 0x0732ae2d40b088f9b999a2e586579f0f; // Q_{CX}_Y
        serializedProofPart1[20] = 0x10263f40213c831b0a1d567f5cd3d959; // Q_{CY}_X
        serializedProofPart1[21] = 0x0c9eac42b0747eec1851b135fa0fa335; // Q_{CY}_Y
        serializedProofPart1[22] = 0x185e7e0f4b001a53ecdd9184d95e3f89; // Π_{χ}_X
        serializedProofPart1[23] = 0x0a94341611a2e279a588e1efac586568; // Π_{χ}_Y
        serializedProofPart1[24] = 0x05af40405eea010ce0847f7e1392a580; // Π_{ζ}_X
        serializedProofPart1[25] = 0x1933d39dfac2a86c918ccd0e451fffd9; // Π_{ζ}_Y
        serializedProofPart1[26] = 0x0e8142abf240b6b8adaae2e2b0280188; // B_X
        serializedProofPart1[27] = 0x0b67e1b400c4d8cafce07fd4a3092336; // B_Y
        serializedProofPart1[28] = 0x17d7e8e84587b347b0fc870b56579666; // R_X
        serializedProofPart1[29] = 0x1504e135d8d92faec7b55dbf8933e0d6; // R_Y
        serializedProofPart1[30] = 0x0cdd08105800de156a4377510dc3dea3; // M_ζ_X (M_Y_X)
        serializedProofPart1[31] = 0x09b80f41fc5ef9789ef81e42ff66534a; // M_ζ_Y (M_Y_Y)
        serializedProofPart1[32] = 0x19561b90817c39e7731f860064df30f5; // M_χ_X (M_X_X)
        serializedProofPart1[33] = 0x0db0d8bca26eaa06959b4670905bf13c; // M_χ_Y (M_X_Y)
        serializedProofPart1[34] = 0x0d23aa8257f29f44fa08284a84ad1369; // N_ζ_X (N_Y_X)
        serializedProofPart1[35] = 0x14e4284c4967d35696b543d05da9ef56; // N_ζ_Y (N_Y_Y)
        serializedProofPart1[36] = 0x19561b90817c39e7731f860064df30f5; // N_χ_X (N_X_X)
        serializedProofPart1[37] = 0x0db0d8bca26eaa06959b4670905bf13c; // N_χ_Y (N_X_Y)
        serializedProofPart1[38] = 0x0883ed3c97b3e674ebfc683481742daa; // O_pub_X
        serializedProofPart1[39] = 0x0f697de543d92f067e8ff95912513e49; // O_pub_Y
        serializedProofPart1[40] = 0x097d7a0fe6430f3dfe4e10c2db6ec878; // A_X
        serializedProofPart1[41] = 0x104de32201c5ba649cc17df4cf759a1f; // A_Y

        // SERIALIZED PROOF PART 2 (Last 32 bytes - 64 hex chars)
        serializedProofPart2[0] = 0xbbae56c781b300594dac0753e75154a00b83cc4e6849ef3f07bb56610a02c828; // s^{(0)}(x,y)_X
        serializedProofPart2[1] = 0xf3447285889202e7e24cd08a058a758a76ee4c8440131be202ad8bc0cc91ee70; // s^{(0)}(x,y)_Y
        serializedProofPart2[2] = 0x76e577ad778dc4476b10709945e71e289be5ca05c412ca04c133c485ae8bc757; // s^{(1)}(x,y)_X
        serializedProofPart2[3] = 0x7ada41cb993109dc7c194693dbcc461f8512755054966319bcbdea3a1da86938; // s^{(1)}(x,y)_Y
        serializedProofPart2[4] = 0x9edeb17d8280b6477fee7f034dd01f5af930d2e2712c1e0d7d699e4a06305cb3; // U_X
        serializedProofPart2[5] = 0x18c3dcf9d39177c0279a710093830f6bf5368fa5090e5b12dee85a4858706cd6; // U_Y
        serializedProofPart2[6] = 0xd3e45812526acc1d689ce05e186d3a8b9e921ad3a4701013336f3f00c654c908; // V_X
        serializedProofPart2[7] = 0x76983b4b6af2d6a17be232aeeb9fdd374990fdcbd9b1a4654bfbbc5f4bba7e13; // V_Y
        serializedProofPart2[8] = 0x74d917514a9dd3e6f116a8b4752ad44db8fc96cbc772e3e9e3c0164e5a123567; // W_X
        serializedProofPart2[9] = 0x905603ff601a61f28aeb0f60fdb78c36db1802d6f04b06a456c0ea8ed9d2f82b; // W_Y
        serializedProofPart2[10] = 0xe537cd0d08e9730fc764dc8b8b4e2ddcf32367e83c66d4a7db0547be5c88a290; // O_mid_X
        serializedProofPart2[11] = 0x66b49b624da84b0d2e62a47446744f63f260a9d0bb72f5949210feb2746b53b0; // O_mid_Y
        serializedProofPart2[12] = 0x1ba613714db2513c2501908825189503afc8c7318913638ff3f4d4a5656bec10; // O_prv_X
        serializedProofPart2[13] = 0xa496ef65633f9bf053f230db3baf78742514001f69556e276d5c3060bf1e1167; // O_prv_Y
        serializedProofPart2[14] = 0xe86d83b514c7a3bb2985ae7b5cb4eaaf115fe0358e833da4697161abf51a996f; // Q_{AX}_X
        serializedProofPart2[15] = 0x8da5569ab4c1070898b61553dcbcb46b9eb844ce2bcedaaee175e1a3f663ff8a; // Q_{AX}_Y
        serializedProofPart2[16] = 0x90be9a439848e3a75c43a644f2f06d5d9cd4681e93a945d15981a951bf74d951; // Q_{AY}_X
        serializedProofPart2[17] = 0x4f7c15c37480e98955ac518d2c9bec86a548249a4464ad30d58ea84ea371a44a; // Q_{AY}_Y
        serializedProofPart2[18] = 0xeed958228ed5152ab7ed01fb39edc1890b0563aa8f00bb8079c0574d795089e8; // Q_{CX}_X
        serializedProofPart2[19] = 0xb60b0d793e1efcade6a6e4e2477e482866a12f082d88095184ef0419c1c7f375; // Q_{CX}_Y
        serializedProofPart2[20] = 0x8fe5d5ae68b314952017ec9b38a4b2d87954f9d837626a6cfc28ad84fe3b9b4e; // Q_{CY}_X
        serializedProofPart2[21] = 0xc9fd377b2407228bff26cd9c333e2250f4cfb64d9e609f807b050d6dda76a2f9; // Q_{CY}_Y
        serializedProofPart2[22] = 0x57cc84295124fa34e17f325fdd5af13caea896d366e6191a4c41f30b0c014bd0; // Π_{χ}_X
        serializedProofPart2[23] = 0xf4c963a10ed90c02f99ab4b618e8b0b894ae86dfb091939cd1117a0385bcf889; // Π_{χ}_Y
        serializedProofPart2[24] = 0xaec2097e1ab5b06d41c1b9ee45a2e5ddfca43c44721000bd4176482d38f7e906; // Π_{ζ}_X
        serializedProofPart2[25] = 0xc9c2aaa53f49bac0a1075ed039e55ef9f7e5559cf4ea3fad3cdc4511b4b0d682; // Π_{ζ}_Y
        serializedProofPart2[26] = 0x562c0bb2804518c6f6e13987354108ffe24ce5e67b4a6755f7ff887d7d9eb9fa; // B_X
        serializedProofPart2[27] = 0x2d9a8285799c20f7eca1612674a8f8b8ab97a070706a3fd419907aaca417aaa1; // B_Y
        serializedProofPart2[28] = 0x2c39aea497deb8f9d2f54f17c11125648f479a44f2434f4b257027e1398b5e24; // R_X
        serializedProofPart2[29] = 0x17fd42d81cccf58cbb6a3062399773369eebd07e48b793c969119aa08eee9a0b; // R_Y
        serializedProofPart2[30] = 0xd9057ea049abbd430d005497b48d7cb7f00b67cd7088cdf6e34d61c086d67d86; // M_ζ_X
        serializedProofPart2[31] = 0x0f6792836a03fc8d08104812452863d3610043888de457cadc9ae30c1035ec5a; // M_ζ_Y
        serializedProofPart2[32] = 0xdcbc91ffa5ec76b03a78d6addf99557c1b6457ff44d23215d5e0b99dcc8d70ce; // M_χ_X
        serializedProofPart2[33] = 0x3b2752a469a489851b3211d1782da55b840ea4cacd35c2a787604b94d847fde1; // M_χ_Y
        serializedProofPart2[34] = 0x34a6507f2334f47b61536477b4487c7ba595b079669bdb6926a004df355b27f4; // N_ζ_X
        serializedProofPart2[35] = 0x052afacbc8f5e75bba4c8bc3b2be2e1e502fe1700c31bbfc86951a78a44c0032; // N_ζ_Y
        serializedProofPart2[36] = 0xdcbc91ffa5ec76b03a78d6addf99557c1b6457ff44d23215d5e0b99dcc8d70ce; // N_χ_X
        serializedProofPart2[37] = 0x3b2752a469a489851b3211d1782da55b840ea4cacd35c2a787604b94d847fde1; // N_χ_Y
        serializedProofPart2[38] = 0xda9079a92f7bfe749313cd11fd1faf480cbd6829a27de4e182a9c699a459af59; // O_pub_X
        serializedProofPart2[39] = 0x9c500eac60a728c7e61f88269a1ed9317e763608e3917f78a9697bda457c9955; // O_pub_Y
        serializedProofPart2[40] = 0x4d66b638321b58bbfdf6b0a17a44a9d9cda67b1a74eea5d0846a99769f18bb17; // A_X
        serializedProofPart2[41] = 0x4109049c345548f5d1c05fc481a4594d4764dc966bb22dd42a45cc10cd38a7e2; // A_Y
        serializedProofPart2[42] = 0x348b5f3bc87d29ea5e72d93c53b693cd5ef0b7e7af0f1f12cc0c48c23962cf6a; // R_eval
        serializedProofPart2[43] = 0x089a1a15af704787c629415ac86767993eb41dcaf85698570c7a42fe70e794a1; // R_omegaX_eval
        serializedProofPart2[44] = 0x0877ff319922ffed9bb7d64983da74126b2f31108ac4fc290ef3ea87f5053a66; // R_omegaX_omegaY_eval
        serializedProofPart2[45] = 0x73217f78c593b99fafef45085119bc4f43d578f607da8ce9726d4d14cd8b76a1; // V_eval

        // Fill publicInputs - only non-zero values
        publicInputs[0] = 0x00000000000000000000000000000000392a2d1a05288b172f205541a56fc20d;
        publicInputs[1] = 0x00000000000000000000000000000000000000000000000000000000c2c30e79;
        publicInputs[4] = 0x00000000000000000000000000000000392a2d1a05288b172f205541a56fc20d;
        publicInputs[5] = 0x00000000000000000000000000000000000000000000000000000000c2c30e79;
        publicInputs[8] = 0x00000000000000000000000000000000d4ad12e56e54018313761487d2d1fee9;
        publicInputs[9] = 0x000000000000000000000000000000000000000000000000000000000ce8f6c9;
        publicInputs[12] = 0x00000000000000000000000000000000d4ad12e56e54018313761487d2d1fee9;
        publicInputs[13] = 0x000000000000000000000000000000000000000000000000000000000ce8f6c9;
        publicInputs[64] = 0x0000000000000000000000000000000020af07748adbb0932a59cfb9ad012354;
        publicInputs[65] = 0x00000000000000000000000000000000f903343320db59a6e85d0dbb1bc7d722;
        publicInputs[66] = 0x0000000000000000000000000000000020af07748adbb0932a59cfb9ad012354;
        publicInputs[67] = 0x00000000000000000000000000000000f903343320db59a6e85d0dbb1bc7d722;
        publicInputs[68] = 0x000000000000000000000000000000001f924fe321c5cf7ad7a47b57891fbcb0;
        publicInputs[69] = 0x0000000000000000000000000000000081f4f96b68c216b824fb32a8c09bd5a8;
        publicInputs[70] = 0x000000000000000000000000000000001f924fe321c5cf7ad7a47b57891fbcb0;
        publicInputs[71] = 0x0000000000000000000000000000000081f4f96b68c216b824fb32a8c09bd5a8;

        smax = 64;

        // All other indices are zero by default in Solidity

        vm.startBroadcast(deployerPrivateKey);

        bool result = verifier.verify(serializedProofPart1, serializedProofPart2, publicInputs, smax);
        vm.stopBroadcast();
    }
}
