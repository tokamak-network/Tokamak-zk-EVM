// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {VerifierV1} from "../src/VerifierV1.sol";

contract VerifyScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address verifierAddress = vm.envAddress("VERIFIER_ADDRESS");
        
        VerifierV1 verifier = VerifierV1(verifierAddress);
        
        // Prepare proof data
        uint128[] memory serializedProofPart1 = new uint128[](42);
        uint256[] memory serializedProofPart2 = new uint256[](46);
        uint256[] memory publicInputs = new uint256[](128);
        
        // Fill serializedProofPart1
        serializedProofPart1[0] = 0x077c80356d88deb5ebe84fb95a81abe9;
        serializedProofPart1[1] = 0x13813c6ee01fd65e40c264448804ca5c;
        serializedProofPart1[2] = 0x09fab082bd8ea9ad40d86ae3d136fb29;
        serializedProofPart1[3] = 0x15e2520871889bdb334f70ee1e911d3a;
        serializedProofPart1[4] = 0x0390a1fc2751ddba4d4a312efe6b3f27;
        serializedProofPart1[5] = 0x111e07280ab0d318dd92d59562fd14ff;
        serializedProofPart1[6] = 0x135926d87d79dbff068243125ae93573;
        serializedProofPart1[7] = 0x1382b8fffe7e841a27247a168b64931e;
        serializedProofPart1[8] = 0x1870053ca5509160d73191431358dafa;
        serializedProofPart1[9] = 0x191552c7705ef59f52b90ff03d2c53f7;
        serializedProofPart1[10] = 0x0bd5b6caea13491f31b90a0abe02b796;
        serializedProofPart1[11] = 0x0778be8eb4de8c0083190fce602b1ea5;
        serializedProofPart1[12] = 0x0041d56a3ddc6a8a58290dac5ebf7f16;
        serializedProofPart1[13] = 0x1976d107b27d1a0b4e633907c37cbea9;
        serializedProofPart1[14] = 0x02db0a30f99d2a2a476e56c701ebf493;
        serializedProofPart1[15] = 0x07dbee3f1022a59fa066c41cb7c63f3b;
        serializedProofPart1[16] = 0x07a93d7a2a8f7eddaba53f7058ec7e6b;
        serializedProofPart1[17] = 0x023806dd920eb142d8c7dbd01deddd30;
        serializedProofPart1[18] = 0x1996c0881cf1c89cec49f9b87545e8c0;
        serializedProofPart1[19] = 0x0185320d21e78722d0c1989758ebffa8;
        serializedProofPart1[20] = 0x032d03a45e7660e25dc8791302ba2d0a;
        serializedProofPart1[21] = 0x037517d765f39d24cb621e0c884f5625;
        serializedProofPart1[22] = 0x0651267aa2dfc2cf245e54537f20c028;
        serializedProofPart1[23] = 0x0350257ef37b189ccdf64e777bdfe4e8;
        serializedProofPart1[24] = 0x15be07817e12b9ae4b393e838b173d94;
        serializedProofPart1[25] = 0x090c4b6bcfa819cfbfe61db9559fb182;
        serializedProofPart1[26] = 0x02d2e4a95854e0bba41f8be17c908323;
        serializedProofPart1[27] = 0x123ca84bbd0440ad4d246abcb4143c4a;
        serializedProofPart1[28] = 0x140f65da72be0aa05d8f1971a8363832;
        serializedProofPart1[29] = 0x081d4169cf849bf0836ce01dfe528fb3;
        serializedProofPart1[30] = 0x16e4948cfe232b8be317627831386272;
        serializedProofPart1[31] = 0x11c12b8dd0d836ac0da3e193e5daff53;
        serializedProofPart1[32] = 0x112a41fa55af07699e3e5fb24555deac;
        serializedProofPart1[33] = 0x05b61bc9a7dc918646b502cb701eadeb;
        serializedProofPart1[34] = 0x02309178a605d68e91305c5d000d8f85;
        serializedProofPart1[35] = 0x11e3361adcc15ffe5b19a527e8be6f53;
        serializedProofPart1[36] = 0x112a41fa55af07699e3e5fb24555deac;
        serializedProofPart1[37] = 0x05b61bc9a7dc918646b502cb701eadeb;
        serializedProofPart1[38] = 0x10f60eed2752ae69f770f10c41c879d0;
        serializedProofPart1[39] = 0x13a8e662cac04b1e7daf5faf8d769b64;
        serializedProofPart1[40] = 0x037faccf42e7fcef469f22db2f44ef10;
        serializedProofPart1[41] = 0x06e6ff0a5f92e820189a13e1dd43c2eb;
        
        // Fill serializedProofPart2
        serializedProofPart2[0] = 0xcf0f85b57b3b8d79b7f3de8c9751710285f679970092e49a4eea303ca2bcb002;
        serializedProofPart2[1] = 0xcd519447b8b7399f99b51dc18c47abae7a4bb20dfcec2ecc50a03aa620d1f4c0;
        serializedProofPart2[2] = 0x6e571fd2aa48989a845e2803827d32c2115a885c9d5b41c94493ae42393306e5;
        serializedProofPart2[3] = 0xc637f91a0288f7453557dccb4b083650f0cc90452cfe372a50dc4c500e4c3252;
        serializedProofPart2[4] = 0x2751350045c792dbd03b2f0f712d5d56db451d3637e2be8a3016b9bbae351e58;
        serializedProofPart2[5] = 0x6a0ec8b3c2bed6ca73007d4092f77ed4b5feffb85b218483bb954f266f4edbb8;
        serializedProofPart2[6] = 0xd0356416e4ee5e6358895dcbeb600ca088bc11dbed27d4f1689ebdfe54668fe8;
        serializedProofPart2[7] = 0xe826ff08eb490b675c839d6b0e8c6eaf0ffc99031cfc07ba9ea7f170565d0216;
        serializedProofPart2[8] = 0x197cc251eb3b14112e8f3b1da635f49a81c4dbef53bbd66c5ba4fd00209c2a89;
        serializedProofPart2[9] = 0x148ffda5915af04cc219611c14c978307425f37c44966a035eb27cbf22dfc5b3;
        serializedProofPart2[10] = 0xa76091483b6027d02da753be3244280e1762834de867461c4af8549625e622a1;
        serializedProofPart2[11] = 0x968e8f27c53534229f6fe7a45d558844174e031c7799a1cfa42bf74d512944e4;
        serializedProofPart2[12] = 0xa92454b13f231247c3d48f48e007b66a9686efc7fe7134c121d88de4da0e8771;
        serializedProofPart2[13] = 0x11a0380996c4e947e34f58fd01dc6b9437a24144063058bf41366968988c5aeb;
        serializedProofPart2[14] = 0x991eacc990d2138301284737ec10f7b050245f92d0063c6c151c1405ddc2b2b3;
        serializedProofPart2[15] = 0x5ce432125c6c27399d11f0ee345c2b3fdecbe68ee8d3d5fee422d3d7bf268d7f;
        serializedProofPart2[16] = 0x3538f8b064bc50f1b0fa8c0b9cf3d4d0a8a5a89b36205c2c092630c20cb1fa72;
        serializedProofPart2[17] = 0xa175b9a622e195340f9274c209e411e855a76e4d882af292ab508ce8c894a428;
        serializedProofPart2[18] = 0x7641ae7e7548a7da8887d063e925276902635a74433dfc8f0b6b9f75faab4c03;
        serializedProofPart2[19] = 0xddc87446c7ea7e661ab47ffb3747e1a783bc8b730a7945f540191dadc72f5873;
        serializedProofPart2[20] = 0xe23f72c0febe2f96b2c9774de1d6d83d448e64d6eebbbb8d6b6c34bd4d91a7b2;
        serializedProofPart2[21] = 0x99ad127dd35a5e74ad10584a8cbfb77f23958cd9cae3c2924f49d41bb97148a9;
        serializedProofPart2[22] = 0x224be1baef8c5d1613b4d84176e06f43dc030c9e238cc3ff554a38a5b4b683ff;
        serializedProofPart2[23] = 0x274fb775f0f095b7a6d87af22bdcbaa0645fb57f70979c7515ed32acc00d364f;
        serializedProofPart2[24] = 0xefab506979b8f03f7fccbc5e74d1a081d56061bd9d1319dd48560f2b191b9b9c;
        serializedProofPart2[25] = 0x4fb92a8bd1a7cd22e242e315c645e0f7c2338aec1b86da5efab7b1805f4003ec;
        serializedProofPart2[26] = 0xf14136568274d294c09b0f4efd62730559fee1efa5309bb1d64c55cd590135c4;
        serializedProofPart2[27] = 0x092e6f9218c5953f0a0eeeca7a7df336c28809f44c8db725de9f300297d9ed56;
        serializedProofPart2[28] = 0x955743bb57bf6f5ac082a24c9f7951106d99883363c9bcd96ac83b6c709ed277;
        serializedProofPart2[29] = 0x8c58fe30a4249102ed761572338afbd1a8169da814a9343ec7a6221cc4ffdab8;
        serializedProofPart2[30] = 0xd0a281775d883e236bd14fd34a72100d7785f2afc475e2a2b2f5c8809fd591bc;
        serializedProofPart2[31] = 0x8459de420453ed62170e6e13580882bfd8c27e56722c079e318c80639ca22d5e;
        serializedProofPart2[32] = 0xa6dfba90dac2a966b5d8bd164092451b15236dd2e73651a2a1bbee07a9c219ae;
        serializedProofPart2[33] = 0x72fda77ee321d9fc31ed7c39f9ec1522613277d5ad7676155386064897820a71;
        serializedProofPart2[34] = 0x01e3b0ba7fe4f66509200714daa9483dd156b08c800bbcfcf922f7504102ad54;
        serializedProofPart2[35] = 0xffd44d55fa21569200f070e17f4c76b59b4410c26c1f3abe5bf03874d3c6e433;
        serializedProofPart2[36] = 0xa6dfba90dac2a966b5d8bd164092451b15236dd2e73651a2a1bbee07a9c219ae;
        serializedProofPart2[37] = 0x72fda77ee321d9fc31ed7c39f9ec1522613277d5ad7676155386064897820a71;
        serializedProofPart2[38] = 0x0690b9da80233ee82fe221f9c7a0251c9fc193c97dff55bcebe77a34e78a257d;
        serializedProofPart2[39] = 0xc3e9a673161be659d97fa4efedbaa00a6c307b089cadede89ce9145e282b56ca;
        serializedProofPart2[40] = 0x7893621690e58fc1bdf84ab8befbcad4ff5f6d4f1aecec3a169a4c7820c55a7c;
        serializedProofPart2[41] = 0xc091ebad6e8d5e3a590ae8153490ebc1135eb38a2d6e6b296324c7be1641eb5d;
        serializedProofPart2[42] = 0x1e82ea8dd3e27616ad00d5ba984411c80178dfa7d67312d7a5b4e41cf740739b;
        serializedProofPart2[43] = 0x4c08d01c225f4a335316e76c70cca30c0e3dc3c819bc11cc549aa48b74ad690e;
        serializedProofPart2[44] = 0x30c54d986b78274933d3cbe26ab5b92b4556283358eb6414d70ff2e0a99b9dd8;
        serializedProofPart2[45] = 0x675e8d9efabde223e32f97f2cc54d311855a9e24ef3f24a7108344556c57efc6;
        
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
        
        // All other indices are zero by default in Solidity
        
        vm.startBroadcast(deployerPrivateKey);
        
        bool result = verifier.verify(serializedProofPart1, serializedProofPart2, publicInputs);
        
        vm.stopBroadcast();
    }
}