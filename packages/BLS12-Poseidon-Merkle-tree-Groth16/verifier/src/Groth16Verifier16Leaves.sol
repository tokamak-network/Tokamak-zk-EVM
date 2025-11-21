// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16Verifier16Leaves {
    // BLS12-381 Scalar field modulus (r)
    uint256 constant R_MOD = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001;
    // BLS12-381 Base field modulus (q) - split into two parts for 48-byte representation
    uint256 constant Q_MOD_PART1 = 0x000000000000000000000000000000001a0111ea397fe69a4b1ba7b6434bacd7;
    uint256 constant Q_MOD_PART2 = 0x64774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab;

    // Verification Key data - split into PART1/PART2 for BLS12-381 format
    uint256 constant alphax_PART1 = 0x0000000000000000000000000000000019df117428d6209b35175c2f17efafe4;
    uint256 constant alphax_PART2 = 0xe450152a225c773f71256fd0b6cb00b6361afac3ca588df0ca43d1c523062d63;
    uint256 constant alphay_PART1 = 0x00000000000000000000000000000000014abb7d34799248932222e650bfa336;
    uint256 constant alphay_PART2 = 0xee7524a6cbf0e52efbd93a779c4374d80a6339c6f97c4d2c0bda733daa549838;
    uint256 constant betax1_PART1 = 0x00000000000000000000000000000000061eef3f522852aa16a76287334ac1b7;
    uint256 constant betax1_PART2 = 0xb692587a5f5e0077e861626084a351f7ec76e25f330cbf53d8c6cfef10dacd0c;
    uint256 constant betax2_PART1 = 0x0000000000000000000000000000000012646561fabc56a886f1d90cef4038d1;
    uint256 constant betax2_PART2 = 0x30051a9549614a0b507f7669679658ce59ef2ebbf1bcb348f63205ad7f3aaf0e;
    uint256 constant betay1_PART1 = 0x000000000000000000000000000000000a767683c4e1592eaa00783291289fa4;
    uint256 constant betay1_PART2 = 0x3371ea0d895d18364a737c5559a7a82734a1913c12f9d92295dd246976996818;
    uint256 constant betay2_PART1 = 0x0000000000000000000000000000000018724e57498c87b761e361e5df060703;
    uint256 constant betay2_PART2 = 0xe4147c3cba9fd694a29c8ffe02712eb9db274fd1d847c867cd5e071a8e36c6a3;
    uint256 constant gammax1_PART1 = 0x0000000000000000000000000000000013e02b6052719f607dacd3a088274f65;
    uint256 constant gammax1_PART2 = 0x596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e;
    uint256 constant gammax2_PART1 = 0x00000000000000000000000000000000024aa2b2f08f0a91260805272dc51051;
    uint256 constant gammax2_PART2 = 0xc6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb8;
    uint256 constant gammay1_PART1 = 0x000000000000000000000000000000000606c4a02ea734cc32acd2b02bc28b99;
    uint256 constant gammay1_PART2 = 0xcb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79be;
    uint256 constant gammay2_PART1 = 0x000000000000000000000000000000000ce5d527727d6e118cc9cdc6da2e351a;
    uint256 constant gammay2_PART2 = 0xadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801;
    uint256 constant deltax1_PART1 = 0x000000000000000000000000000000000b5e6b67cd9f5f42abd57ceee15c40b1;
    uint256 constant deltax1_PART2 = 0xffee8f5bf4b9f6f160898f58051714a09df5584597dfca3e161fa41a7bef9c28;
    uint256 constant deltax2_PART1 = 0x000000000000000000000000000000000abea2df24f898535f6d6e269d3fdcb2;
    uint256 constant deltax2_PART2 = 0x718ed0185ed2d331b99350d568f6258a6bad88fbfb27d490ea26453410a858ff;
    uint256 constant deltay1_PART1 = 0x000000000000000000000000000000000e4d017680d9ad536e11e1c567829466;
    uint256 constant deltay1_PART2 = 0x45b931b899f71ee66439362014ffd1d3e1138b4d6597b5c3dbd36a36412b7678;
    uint256 constant deltay2_PART1 = 0x0000000000000000000000000000000014f3f53486365d593d08b00a941be676;
    uint256 constant deltay2_PART2 = 0x5155d2807de24deb28267fb69b4451ce03e3c5806de2222fcc78296c7dc3eeb2;

    // IC Points - split into PART1/PART2 for BLS12-381 format

    uint256 constant IC0x_PART1 = 0x00000000000000000000000000000000024f14f48fa89f229bd3367f505156a3;
    uint256 constant IC0x_PART2 = 0x04f35db9df3896733ff80ccf72809469a5774a3a03290bfbbfb6f4cae23c0a4d;
    uint256 constant IC0y_PART1 = 0x0000000000000000000000000000000014e269ad92909ade7e1daac203a68947;
    uint256 constant IC0y_PART2 = 0x2381f860c7dd47516a159f8873ef9500f176b09ee8982fdaacb60e4d034c2396;
//
    uint256 constant IC1x_PART1 = 0x0000000000000000000000000000000014313a5c6ce6824bd383b2c11a5d5787;
    uint256 constant IC1x_PART2 = 0xd2909a7e9f487df14afe620e84384dbf4008ad1569182fe0697aff238aa209aa;
    uint256 constant IC1y_PART1 = 0x0000000000000000000000000000000017caa2e3b8680e37c71bf9622ae7f77a;
    uint256 constant IC1y_PART2 = 0x384aa4ea7cb3d91cdb07f1cdae3318f7f4de6c668efbf2ffea3b5172297ee544;

    uint256 constant IC2x_PART1 = 0x0000000000000000000000000000000019c3a49118b328f157187ec8b04b65e6;
    uint256 constant IC2x_PART2 = 0xda0495756b218d5db22bf89961fae2f95e68eba0647a4d79ae36c35a7d61f637;
    uint256 constant IC2y_PART1 = 0x00000000000000000000000000000000157ed427f9866575a2d8c82316d82898;
    uint256 constant IC2y_PART2 = 0x5fd8b02f66f08ca30872095c77f7ce85627d28912632bd915eecf6421b8642af;

    uint256 constant IC3x_PART1 = 0x000000000000000000000000000000000538669a5f32b6c504b0507573ac3313;
    uint256 constant IC3x_PART2 = 0x998e0d7c42b83697bb1361eba03c3f2988a0261384dd0984960bdf952a1e79f3;
    uint256 constant IC3y_PART1 = 0x000000000000000000000000000000000f8de2c532f88e2dbc5036bc6265ce66;
    uint256 constant IC3y_PART2 = 0x7fe7713e827d82fc3292a16c4f772e0caf635640dd57823369d990ab6080c6fb;

    uint256 constant IC4x_PART1 = 0x000000000000000000000000000000000563236f49275428cc7656de42ce0aa9;
    uint256 constant IC4x_PART2 = 0x94ed9d2b8df17490593a1080d43668df4b8cc5e7a9da1ae9fb9339dc348039b5;
    uint256 constant IC4y_PART1 = 0x00000000000000000000000000000000055c17dff9cacb39455bbba953d2338f;
    uint256 constant IC4y_PART2 = 0x0b03983b77275f3a9f79f8e9671816ed69125489911429dd2b0e0ceb3abb59e9;

    uint256 constant IC5x_PART1 = 0x0000000000000000000000000000000010cdcb938e13f4caedc73336e7210106;
    uint256 constant IC5x_PART2 = 0x89e02e47c9cde91914d8a0c04150c030c7a0bfa565ae4981c5e24a95ffb276ff;
    uint256 constant IC5y_PART1 = 0x00000000000000000000000000000000017c82764203bbb533b6ca9faa6ba551;
    uint256 constant IC5y_PART2 = 0x95e2cf30f9664aec4d73f181716828bb1d5c3459ed75ae7b82c67ee231784359;

    uint256 constant IC6x_PART1 = 0x00000000000000000000000000000000054dd76e2fba0c49c6b2df37827d2fbb;
    uint256 constant IC6x_PART2 = 0xddcd78798b8ec0831718be5aa709c01423cf11edce4eef733db0936d841defe4;
    uint256 constant IC6y_PART1 = 0x00000000000000000000000000000000155b3380d4fe5503220d2de6cca86c3b;
    uint256 constant IC6y_PART2 = 0x1cce5752c137f95f3440be960641abfafe11c91c82b84e1bece60bcfd7696e4c;

    uint256 constant IC7x_PART1 = 0x000000000000000000000000000000000f1fd9ff7e2f90a296fde9985864ccf1;
    uint256 constant IC7x_PART2 = 0xa6d6477c7698c15c41a807c56481843da422b0f8860aef0737071fecdb13fab9;
    uint256 constant IC7y_PART1 = 0x0000000000000000000000000000000017c2ebf05f78d3ef47e4abcc4f5614fd;
    uint256 constant IC7y_PART2 = 0x431a4b11c15e8b84ff16e734e46cbf81657290f7d26d8e7fb096230a1281c50c;

    uint256 constant IC8x_PART1 = 0x0000000000000000000000000000000013652b79af51b630ef867b1c7aef6a79;
    uint256 constant IC8x_PART2 = 0x9052f7d83d75996e6a89d936a3dcbfbcd56c80826ef3587269b3443270f7fbc9;
    uint256 constant IC8y_PART1 = 0x00000000000000000000000000000000174935e5a39bcb66928454abe49a8d53;
    uint256 constant IC8y_PART2 = 0x5793d5fd7707913a71dc70f8f878deb904dba13effc1ca65952f5f9dad6eb3ba;

    uint256 constant IC9x_PART1 = 0x000000000000000000000000000000001952afe67c7774e3ddb06c018342c9d3;
    uint256 constant IC9x_PART2 = 0x3753a2d736e6f2be4350d0f28220d6138e2fb268a4c19cceca488e6f28b8f357;
    uint256 constant IC9y_PART1 = 0x00000000000000000000000000000000027f81f7bac89d0b5f26aa4d4183526a;
    uint256 constant IC9y_PART2 = 0x1ad56dde825f6504c377f1f3e8bdf05ab501a3a06963dfa3dca20b7ce7f502d4;

    uint256 constant IC10x_PART1 = 0x00000000000000000000000000000000064150e2ba5b56cad89f127f071264c1;
    uint256 constant IC10x_PART2 = 0xa001733abe1b618c8de0bb8c7c8320038352aae7c817c4204742eb11237b45fd;
    uint256 constant IC10y_PART1 = 0x0000000000000000000000000000000012c4111f0e8e30529ab07a3037f83b21;
    uint256 constant IC10y_PART2 = 0x50dfd408a0e51adb098f6f02546e1d42807f91acb573d8601326d9b7504cc2f7;

    uint256 constant IC11x_PART1 = 0x0000000000000000000000000000000016c26ada9a22689d3ff149615884c7a9;
    uint256 constant IC11x_PART2 = 0x6356ed83935c30b5047f506dc1c76c39188e0140341ab7db68f3b381f6ea9341;
    uint256 constant IC11y_PART1 = 0x000000000000000000000000000000000362d96c974b38e28703351973c00440;
    uint256 constant IC11y_PART2 = 0x3c498fb38fa23a66b7bfe92706d8731f54049933107e41ecaae9eaf14378abf8;

    uint256 constant IC12x_PART1 = 0x000000000000000000000000000000000cfa7c2d12c7069051be9202b9550f40;
    uint256 constant IC12x_PART2 = 0xda267e74d80a146366ba98fa57586d7f8334811c5ab4cadaf1d2f0b83c76dbe0;
    uint256 constant IC12y_PART1 = 0x0000000000000000000000000000000016125545fc5bdc6c20384f33fbc934cd;
    uint256 constant IC12y_PART2 = 0x21b290230f900de1dcb62b158fb865d0044fb23be28ef0cbb2468fc7562a35ca;

    uint256 constant IC13x_PART1 = 0x000000000000000000000000000000000ae416ab9a30953033f1ed4e4baa1d70;
    uint256 constant IC13x_PART2 = 0xda4641c8c5554a390a35a38e29941b77367fca3325ab6422208bb25bcdc5b425;
    uint256 constant IC13y_PART1 = 0x0000000000000000000000000000000007f0572e30c457b5d1ee5cbe195def99;
    uint256 constant IC13y_PART2 = 0x7376c8ca308229316c93ce9bb0ce4f8642a48a942146134fc6c7c8283e7d76fe;

    uint256 constant IC14x_PART1 = 0x000000000000000000000000000000001679e225e04bc7a6f2167f3b8655889c;
    uint256 constant IC14x_PART2 = 0xcf9211be3c650783cb30d7bce8c08e20009bbe0487f61bfe38b13422b29b8b02;
    uint256 constant IC14y_PART1 = 0x000000000000000000000000000000000e907c0829d0c70c24a10b73db46f7fa;
    uint256 constant IC14y_PART2 = 0x6916eac87b2d0c459fc4af926aadb7f083d587a382e7ccfb6c93d8a0caefe6bb;

    uint256 constant IC15x_PART1 = 0x000000000000000000000000000000000342eb71091bc7ad93404abc34f861fd;
    uint256 constant IC15x_PART2 = 0x3da109b35140a6d101d730c8cb5127e889234baeff59bc23a1ea19f232003ae6;
    uint256 constant IC15y_PART1 = 0x0000000000000000000000000000000001d73812880340295fb0870723c45d5a;
    uint256 constant IC15y_PART2 = 0xdd1fc3768f2b5beb72ebc0d99340adda161793fd0711344b40d268e6835c21cd;

    uint256 constant IC16x_PART1 = 0x000000000000000000000000000000000157d9a307cfc045dcc031f5495d6425;
    uint256 constant IC16x_PART2 = 0x0c24752c5afbab51893e0bd9ee8762ea59aa479483718e345c2fcbb31da12301;
    uint256 constant IC16y_PART1 = 0x0000000000000000000000000000000018b8846660c295f3665fddc628ffd5b2;
    uint256 constant IC16y_PART2 = 0x2271075f928c31452ca5cf13774e32d42b463d4be62179828a8f6419aba11432;

    uint256 constant IC17x_PART1 = 0x00000000000000000000000000000000168dcc73726b9659eca91813cb0d18a4;
    uint256 constant IC17x_PART2 = 0xdb2b6be6d182551084c4b79813648ada67da56382be1006f0bf9433714b81025;
    uint256 constant IC17y_PART1 = 0x0000000000000000000000000000000008ad24eca43e587e8350ef5d5ffea445;
    uint256 constant IC17y_PART2 = 0xacbd32db670f3a2d8c59fb88c2bfb882eb15d031ddb8400f7d7f24efd235d75b;

    uint256 constant IC18x_PART1 = 0x000000000000000000000000000000000b51944f04112933687a53edd23b44c2;
    uint256 constant IC18x_PART2 = 0x6897bcae8073dc81d8132cb9a95b44fa3eb94406823f6ec93b399d9539718d4c;
    uint256 constant IC18y_PART1 = 0x0000000000000000000000000000000019abcec91fdb77a1ba7af32d98910b2f;
    uint256 constant IC18y_PART2 = 0xbe933ec0bc15ea3adf3ad2484a67406700ef45e860b511b0f21feb763878a894;

    uint256 constant IC19x_PART1 = 0x0000000000000000000000000000000011b1988beed226dceb22b4a4c4aec02b;
    uint256 constant IC19x_PART2 = 0x4b1e0630437a16c6390c26cd6432a08be86cedc698d873d1f2b3e3cc99fe4c28;
    uint256 constant IC19y_PART1 = 0x0000000000000000000000000000000008e70e33eb84c08e950df83229175fac;
    uint256 constant IC19y_PART2 = 0x0a33deb8be2201869db95d45c75fcc3a0b1dbe423d8f9c6553c5890da4fd881f;

    uint256 constant IC20x_PART1 = 0x000000000000000000000000000000001911f17ca04784029c1c89d9e31c2584;
    uint256 constant IC20x_PART2 = 0xc14951d86d32f3fb03db0be1c3d2092a78d78820db9c20da232205befef43f44;
    uint256 constant IC20y_PART1 = 0x000000000000000000000000000000000e935e86a81303c262c79ea1c2d68f88;
    uint256 constant IC20y_PART2 = 0x2f8f0194cf064d4bf6433aa1d7207b3d75114baf99b871b515fbd3c85a67b0dc;

    uint256 constant IC21x_PART1 = 0x0000000000000000000000000000000006a517c6460016fc47f10dce5f3faf73;
    uint256 constant IC21x_PART2 = 0x44d863559c258ebdf55efd0a8797b98a7ad388d243237a4d6d9887b7638f7356;
    uint256 constant IC21y_PART1 = 0x00000000000000000000000000000000047d6bc591e9dbf10f7ce189cd9a2799;
    uint256 constant IC21y_PART2 = 0x56ee67af4eacb89d70ce29a4162bf3587234e40e03e81a996527b88f7f240518;

    uint256 constant IC22x_PART1 = 0x0000000000000000000000000000000012c44ccdee38d4e44141efd8ff02f3c6;
    uint256 constant IC22x_PART2 = 0x8ba22039e09e0a8e4a9ed615cc2458adace94feed1785484710d33900007ff22;
    uint256 constant IC22y_PART1 = 0x00000000000000000000000000000000170294dd3c57c242183e5efaa76f9468;
    uint256 constant IC22y_PART2 = 0x0cfa6e997a62a489344b76681dd04fe0d8d8a5d040366915ad09d404d6894303;

    uint256 constant IC23x_PART1 = 0x000000000000000000000000000000000f0cfa068d571edcc32d4c5cac71e6e1;
    uint256 constant IC23x_PART2 = 0x14edd255f7ab3f17b237014e2e2758025ab3be1cd5bf11aeafdc56ee35a9d22d;
    uint256 constant IC23y_PART1 = 0x0000000000000000000000000000000002af8dc83d507e10e187eaf3c6f28c56;
    uint256 constant IC23y_PART2 = 0x67fe281e0a3ca79863426625a5235fb45be4fb56f8ff34fbed4cc132e404a78f;

    uint256 constant IC24x_PART1 = 0x0000000000000000000000000000000017d65a6a6015e6d79078c3e87230b5b5;
    uint256 constant IC24x_PART2 = 0x0fb051c8296e7f2255f333621b5832a6ce20700ca84b3770abff2ca60897bc86;
    uint256 constant IC24y_PART1 = 0x000000000000000000000000000000000497bcd02a3258bc4b1fb5abe925a694;
    uint256 constant IC24y_PART2 = 0x775b0c77f0d351feba0661a84a6f984e9085ddaedcc8897d92457b05a802cd34;

    uint256 constant IC25x_PART1 = 0x000000000000000000000000000000000d2c105a8eac5536bf5668c167ddacf2;
    uint256 constant IC25x_PART2 = 0xf4bcf9a79fd1b6bc502dc53bc8fd61df698017cb7114e536cb01e8727b2d2471;
    uint256 constant IC25y_PART1 = 0x000000000000000000000000000000000f153a564fd797ad1d177dafd09e5bd0;
    uint256 constant IC25y_PART2 = 0xcec250b79b29d33f75273b141d555e490391c683ad878aa00304111278f79143;

    uint256 constant IC26x_PART1 = 0x00000000000000000000000000000000006800261cab257632f66b60397acef1;
    uint256 constant IC26x_PART2 = 0x1b36084e4ef6a5bf591715df1e136b0c6b348a2f30aece2c90580d299a452a85;
    uint256 constant IC26y_PART1 = 0x0000000000000000000000000000000008454bcaa706ce6e9537a2f5c3d01884;
    uint256 constant IC26y_PART2 = 0xfbba9e111c123faf2eef14bcf06da87cf0bdb04b69077318d18bee2694eed985;

    uint256 constant IC27x_PART1 = 0x0000000000000000000000000000000003af8c8c7813941f5741b4881cc7bf71;
    uint256 constant IC27x_PART2 = 0xe78cd0e76d8fe2dae1c5fe8161b7fdf5f60f32247985aa7ba0ea9adf209edc36;
    uint256 constant IC27y_PART1 = 0x0000000000000000000000000000000002194098d3286ef73ce52b79502df9c7;
    uint256 constant IC27y_PART2 = 0x2a9315de72a03a0dc9d00adf26495354d6ea6135798b1073247df61a404d670b;

    uint256 constant IC28x_PART1 = 0x000000000000000000000000000000000ab31d6b4745997fc9bea28fa0aab105;
    uint256 constant IC28x_PART2 = 0x0e7da8d5a52c7acc46a34419b2a071fd4960eb46a9bd29b3ecae615dca0262eb;
    uint256 constant IC28y_PART1 = 0x00000000000000000000000000000000081699ef7202d86ab3852e865861133a;
    uint256 constant IC28y_PART2 = 0xa7a03882bd58853cf4c427a681933975ec90489d31839748f3fa489db4c54e53;

    uint256 constant IC29x_PART1 = 0x0000000000000000000000000000000001159b8389e0800f598b03139e7402c8;
    uint256 constant IC29x_PART2 = 0x506b5ed2c0fb987b711ed827008bcaad1176e0360e888c8b6ee049fc2f7277e3;
    uint256 constant IC29y_PART1 = 0x000000000000000000000000000000000e4ce7ce48d62a7f8925d4a148725941;
    uint256 constant IC29y_PART2 = 0x6b3b1b5ef61a92f1a713c9591b0e7b1880cf35ef14eb2168cf539371411bc822;

    uint256 constant IC30x_PART1 = 0x000000000000000000000000000000000426132da38cfae8bedeb02545738dee;
    uint256 constant IC30x_PART2 = 0x5f7dcba696dc59797e6fe44fe0e5a24543ba4eba886ca1327e98cc866b45b610;
    uint256 constant IC30y_PART1 = 0x0000000000000000000000000000000011a246596e246607dca2903423c39ecc;
    uint256 constant IC30y_PART2 = 0x8709412bcb300f4e02119279fcb847721aa27557df1cd233af6c2c1b718ff436;

    uint256 constant IC31x_PART1 = 0x000000000000000000000000000000000f29281eb5d7df7e11e0fdab3d90b762;
    uint256 constant IC31x_PART2 = 0xcb5c473b554b1cc8f32c0976bc571438d39f2afedc2a89bec69db0636e686ce1;
    uint256 constant IC31y_PART1 = 0x000000000000000000000000000000000b220acc7ba6b744e42ed958a4e478eb;
    uint256 constant IC31y_PART2 = 0x13ee2e3063c626a3994d188cc22642fe0bbb3c62cdb48a5759e3fcd3c148aab3;

    uint256 constant IC32x_PART1 = 0x0000000000000000000000000000000005146c19527ad1ad66bca4bf32b5f24f;
    uint256 constant IC32x_PART2 = 0x1a181cb8bdc6e84eef2e281a883ef8358396c9378acb29a9b37a15571aa2814e;
    uint256 constant IC32y_PART1 = 0x000000000000000000000000000000000450d4c04811b67318d2e20e66d3714a;
    uint256 constant IC32y_PART2 = 0x2f3120718e89a2693a31973140e78de93ce8585ad0073368a0a2d3612f5e1f49;

    uint256 constant IC33x_PART1 = 0x0000000000000000000000000000000008254f9deee9880c816c855d080335b6;
    uint256 constant IC33x_PART2 = 0xf708348ed5fa78340d0d6f409bb2644cb1fe5c74b9c55bd86a9845a8c58e4194;
    uint256 constant IC33y_PART1 = 0x0000000000000000000000000000000011c1da2d6513a8e71b8b12aecaf728e1;
    uint256 constant IC33y_PART2 = 0xbf02cf2b521d1f64751ca4156f238d4b77c94ec1a4e83aae15b860a259ffd304;

    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 1664;

    function verifyProof(
        uint256[4] calldata _pA,
        uint256[8] calldata _pB,
        uint256[4] calldata _pC,
        uint256[33] calldata _pubSignals
    ) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, R_MOD)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

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

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                // Initialize vk_x with IC0 (the constant term)
                mstore(_pVk, IC0x_PART1)
                mstore(add(_pVk, 32), IC0x_PART2)
                mstore(add(_pVk, 64), IC0y_PART1)
                mstore(add(_pVk, 96), IC0y_PART2)

                // Compute the linear combination vk_x = IC0 + IC1*pubSignals[0] + IC2*pubSignals[1] + ...

                g1_mulAccC(_pVk, IC1x_PART1, IC1x_PART2, IC1y_PART1, IC1y_PART2, calldataload(add(pubSignals, 0)))

                g1_mulAccC(_pVk, IC2x_PART1, IC2x_PART2, IC2y_PART1, IC2y_PART2, calldataload(add(pubSignals, 32)))

                g1_mulAccC(_pVk, IC3x_PART1, IC3x_PART2, IC3y_PART1, IC3y_PART2, calldataload(add(pubSignals, 64)))

                g1_mulAccC(_pVk, IC4x_PART1, IC4x_PART2, IC4y_PART1, IC4y_PART2, calldataload(add(pubSignals, 96)))

                g1_mulAccC(_pVk, IC5x_PART1, IC5x_PART2, IC5y_PART1, IC5y_PART2, calldataload(add(pubSignals, 128)))

                g1_mulAccC(_pVk, IC6x_PART1, IC6x_PART2, IC6y_PART1, IC6y_PART2, calldataload(add(pubSignals, 160)))

                g1_mulAccC(_pVk, IC7x_PART1, IC7x_PART2, IC7y_PART1, IC7y_PART2, calldataload(add(pubSignals, 192)))

                g1_mulAccC(_pVk, IC8x_PART1, IC8x_PART2, IC8y_PART1, IC8y_PART2, calldataload(add(pubSignals, 224)))

                g1_mulAccC(_pVk, IC9x_PART1, IC9x_PART2, IC9y_PART1, IC9y_PART2, calldataload(add(pubSignals, 256)))

                g1_mulAccC(_pVk, IC10x_PART1, IC10x_PART2, IC10y_PART1, IC10y_PART2, calldataload(add(pubSignals, 288)))

                g1_mulAccC(_pVk, IC11x_PART1, IC11x_PART2, IC11y_PART1, IC11y_PART2, calldataload(add(pubSignals, 320)))

                g1_mulAccC(_pVk, IC12x_PART1, IC12x_PART2, IC12y_PART1, IC12y_PART2, calldataload(add(pubSignals, 352)))

                g1_mulAccC(_pVk, IC13x_PART1, IC13x_PART2, IC13y_PART1, IC13y_PART2, calldataload(add(pubSignals, 384)))

                g1_mulAccC(_pVk, IC14x_PART1, IC14x_PART2, IC14y_PART1, IC14y_PART2, calldataload(add(pubSignals, 416)))

                g1_mulAccC(_pVk, IC15x_PART1, IC15x_PART2, IC15y_PART1, IC15y_PART2, calldataload(add(pubSignals, 448)))

                g1_mulAccC(_pVk, IC16x_PART1, IC16x_PART2, IC16y_PART1, IC16y_PART2, calldataload(add(pubSignals, 480)))

                g1_mulAccC(_pVk, IC17x_PART1, IC17x_PART2, IC17y_PART1, IC17y_PART2, calldataload(add(pubSignals, 512)))

                g1_mulAccC(_pVk, IC18x_PART1, IC18x_PART2, IC18y_PART1, IC18y_PART2, calldataload(add(pubSignals, 544)))

                g1_mulAccC(_pVk, IC19x_PART1, IC19x_PART2, IC19y_PART1, IC19y_PART2, calldataload(add(pubSignals, 576)))

                g1_mulAccC(_pVk, IC20x_PART1, IC20x_PART2, IC20y_PART1, IC20y_PART2, calldataload(add(pubSignals, 608)))

                g1_mulAccC(_pVk, IC21x_PART1, IC21x_PART2, IC21y_PART1, IC21y_PART2, calldataload(add(pubSignals, 640)))

                g1_mulAccC(_pVk, IC22x_PART1, IC22x_PART2, IC22y_PART1, IC22y_PART2, calldataload(add(pubSignals, 672)))

                g1_mulAccC(_pVk, IC23x_PART1, IC23x_PART2, IC23y_PART1, IC23y_PART2, calldataload(add(pubSignals, 704)))

                g1_mulAccC(_pVk, IC24x_PART1, IC24x_PART2, IC24y_PART1, IC24y_PART2, calldataload(add(pubSignals, 736)))

                g1_mulAccC(_pVk, IC25x_PART1, IC25x_PART2, IC25y_PART1, IC25y_PART2, calldataload(add(pubSignals, 768)))

                g1_mulAccC(_pVk, IC26x_PART1, IC26x_PART2, IC26y_PART1, IC26y_PART2, calldataload(add(pubSignals, 800)))

                g1_mulAccC(_pVk, IC27x_PART1, IC27x_PART2, IC27y_PART1, IC27y_PART2, calldataload(add(pubSignals, 832)))

                g1_mulAccC(_pVk, IC28x_PART1, IC28x_PART2, IC28y_PART1, IC28y_PART2, calldataload(add(pubSignals, 864)))

                g1_mulAccC(_pVk, IC29x_PART1, IC29x_PART2, IC29y_PART1, IC29y_PART2, calldataload(add(pubSignals, 896)))

                g1_mulAccC(_pVk, IC30x_PART1, IC30x_PART2, IC30y_PART1, IC30y_PART2, calldataload(add(pubSignals, 928)))

                g1_mulAccC(_pVk, IC31x_PART1, IC31x_PART2, IC31y_PART1, IC31y_PART2, calldataload(add(pubSignals, 960)))

                g1_mulAccC(_pVk, IC32x_PART1, IC32x_PART2, IC32y_PART1, IC32y_PART2, calldataload(add(pubSignals, 992)))

                g1_mulAccC(
                    _pVk, IC33x_PART1, IC33x_PART2, IC33y_PART1, IC33y_PART2, calldataload(add(pubSignals, 1024))
                )

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
                    borrow := 0
                }

                // Subtract high part with borrow
                neg_y_high := sub(sub(Q_MOD_PART1, y_high), borrow)

                mstore(add(_pPairing, 64), neg_y_high) // _pA[1][0] (-y_PART1)
                mstore(add(_pPairing, 96), neg_y_low) // _pA[1][1] (-y_PART2)

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

                // alpha1 (48-byte format) - PAIR 4 G1
                mstore(add(_pPairing, 384), alphax_PART1)
                mstore(add(_pPairing, 416), alphax_PART2)
                mstore(add(_pPairing, 448), alphay_PART1)
                mstore(add(_pPairing, 480), alphay_PART2)

                // beta2 G2 point order: x1, x0, y1, y0
                mstore(add(_pPairing, 512), betax2_PART1) // x1_PART1
                mstore(add(_pPairing, 544), betax2_PART2) // x1_PART2
                mstore(add(_pPairing, 576), betax1_PART1) // x0_PART1
                mstore(add(_pPairing, 608), betax1_PART2) // x0_PART2
                mstore(add(_pPairing, 640), betay2_PART1) // y1_PART1
                mstore(add(_pPairing, 672), betay2_PART2) // y1_PART2
                mstore(add(_pPairing, 704), betay1_PART1) // y0_PART1
                mstore(add(_pPairing, 736), betay1_PART2) // y0_PART2

                // vk_x (48-byte format from G1 point) - PAIR 2 G1
                mstore(add(_pPairing, 768), mload(add(pMem, pVk))) // x_PART1
                mstore(add(_pPairing, 800), mload(add(pMem, add(pVk, 32)))) // x_PART2
                mstore(add(_pPairing, 832), mload(add(pMem, add(pVk, 64)))) // y_PART1
                mstore(add(_pPairing, 864), mload(add(pMem, add(pVk, 96)))) // y_PART2

                // gamma2 G2 point order: x1, x0, y1, y0
                mstore(add(_pPairing, 896), gammax2_PART1) // x1_PART1
                mstore(add(_pPairing, 928), gammax2_PART2) // x1_PART2
                mstore(add(_pPairing, 960), gammax1_PART1) // x0_PART1
                mstore(add(_pPairing, 992), gammax1_PART2) // x0_PART2
                mstore(add(_pPairing, 1024), gammay2_PART1) // y1_PART1
                mstore(add(_pPairing, 1056), gammay2_PART2) // y1_PART2
                mstore(add(_pPairing, 1088), gammay1_PART1) // y0_PART1
                mstore(add(_pPairing, 1120), gammay1_PART2) // y0_PART2
                

                // C (48-byte BLS12-381 format) - PAIR 3 G1
                mstore(add(_pPairing, 1152), calldataload(pC)) // _pC[0][0] (x_PART1)
                mstore(add(_pPairing, 1184), calldataload(add(pC, 32))) // _pC[0][1] (x_PART2)
                mstore(add(_pPairing, 1216), calldataload(add(pC, 64))) // _pC[1][0] (y_PART1)
                mstore(add(_pPairing, 1248), calldataload(add(pC, 96))) // _pC[1][1] (y_PART2)

                // delta2 G2 point order: x1, x0, y1, y0
                mstore(add(_pPairing, 1280), deltax2_PART1) // x1_PART1
                mstore(add(_pPairing, 1312), deltax2_PART2) // x1_PART2
                mstore(add(_pPairing, 1344), deltax1_PART1) // x0_PART1
                mstore(add(_pPairing, 1376), deltax1_PART2) // x0_PART2
                mstore(add(_pPairing, 1408), deltay2_PART1) // y1_PART1
                mstore(add(_pPairing, 1440), deltay2_PART2) // y1_PART2
                mstore(add(_pPairing, 1472), deltay1_PART1) // y0_PART1
                mstore(add(_pPairing, 1504), deltay1_PART2) // y0_PART2

                let success := staticcall(sub(gas(), 2000), 0x0f, _pPairing, 1536, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F

            checkField(calldataload(add(_pubSignals, 0)))

            checkField(calldataload(add(_pubSignals, 32)))

            checkField(calldataload(add(_pubSignals, 64)))

            checkField(calldataload(add(_pubSignals, 96)))

            checkField(calldataload(add(_pubSignals, 128)))

            checkField(calldataload(add(_pubSignals, 160)))

            checkField(calldataload(add(_pubSignals, 192)))

            checkField(calldataload(add(_pubSignals, 224)))

            checkField(calldataload(add(_pubSignals, 256)))

            checkField(calldataload(add(_pubSignals, 288)))

            checkField(calldataload(add(_pubSignals, 320)))

            checkField(calldataload(add(_pubSignals, 352)))

            checkField(calldataload(add(_pubSignals, 384)))

            checkField(calldataload(add(_pubSignals, 416)))

            checkField(calldataload(add(_pubSignals, 448)))

            checkField(calldataload(add(_pubSignals, 480)))

            checkField(calldataload(add(_pubSignals, 512)))

            checkField(calldataload(add(_pubSignals, 544)))

            checkField(calldataload(add(_pubSignals, 576)))

            checkField(calldataload(add(_pubSignals, 608)))

            checkField(calldataload(add(_pubSignals, 640)))

            checkField(calldataload(add(_pubSignals, 672)))

            checkField(calldataload(add(_pubSignals, 704)))

            checkField(calldataload(add(_pubSignals, 736)))

            checkField(calldataload(add(_pubSignals, 768)))

            checkField(calldataload(add(_pubSignals, 800)))

            checkField(calldataload(add(_pubSignals, 832)))

            checkField(calldataload(add(_pubSignals, 864)))

            checkField(calldataload(add(_pubSignals, 896)))

            checkField(calldataload(add(_pubSignals, 928)))

            checkField(calldataload(add(_pubSignals, 960)))

            checkField(calldataload(add(_pubSignals, 992)))

            checkField(calldataload(add(_pubSignals, 1024)))

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
            return(0, 0x20)
        }
    }
}