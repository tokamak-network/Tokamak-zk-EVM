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
    uint256 constant deltax1_PART1 = 0x0000000000000000000000000000000017a85bfb83fe9bf3cff6ce8c19653edb;
    uint256 constant deltax1_PART2 = 0x322446e20fe5a3af48bf351591114d8f6ed17e56cdc35a0661f690d23e90b8d3;
    uint256 constant deltax2_PART1 = 0x00000000000000000000000000000000085b0447a39337d4a51d966bfbc39308;
    uint256 constant deltax2_PART2 = 0x7a5421f608dcdc212a58b436556024d86f06eddcad488a6f52ff5502e0e2f387;
    uint256 constant deltay1_PART1 = 0x0000000000000000000000000000000003b6dc73accded73e877bd67f4740ef3;
    uint256 constant deltay1_PART2 = 0x8c11183770abb27cc2a986949af6d9f66aab08abb8a683184670dda54b9f6921;
    uint256 constant deltay2_PART1 = 0x00000000000000000000000000000000137d5810291c5a43f9178724fd65ad58;
    uint256 constant deltay2_PART2 = 0xc8cd9705837bc6a4e899fd0f08eb3bd9b7aa1c5b948303ed2213736c7592f307;

    // IC Points - split into PART1/PART2 for BLS12-381 format

    uint256 constant IC0x_PART1 = 0x0000000000000000000000000000000015c9d64ab81b0d8927b9912c08cfe0ae;
    uint256 constant IC0x_PART2 = 0xbf44c1dd4a894b5d59dc05138e35c16c66b1e38d0f4c9cd3fda1aa4fc3fc56aa;
    uint256 constant IC0y_PART1 = 0x00000000000000000000000000000000112b88d6162974495ed4dc9791c26cd1;
    uint256 constant IC0y_PART2 = 0x02ca4ec22a068040636e674157227af49703ef09379764cb0b00e472d6001003;
//
    uint256 constant IC1x_PART1 = 0x0000000000000000000000000000000004e8c88aec3a449f86e36538798a7e0b;
    uint256 constant IC1x_PART2 = 0x84e94b09011fb96173cd8017ee7cfe3c946890414004e174ea011b0c3bbbcc75;
    uint256 constant IC1y_PART1 = 0x00000000000000000000000000000000029d2e3f9acc1852c1fba2f51e36fea2;
    uint256 constant IC1y_PART2 = 0x8a5e7d00652ae502ca39543dd5acb7b22f188d50cb67df294a03758ecfad14b6;

    uint256 constant IC2x_PART1 = 0x000000000000000000000000000000000a50951719596dc46f00ec66e3d2e1cb;
    uint256 constant IC2x_PART2 = 0x59d84002303b84d4130e99fc688a1dc356acc6ff53eaeed4d7c806063d624a60;
    uint256 constant IC2y_PART1 = 0x00000000000000000000000000000000052fbe631ff0e19c885df3726b829a5a;
    uint256 constant IC2y_PART2 = 0x6b091feb759558357d9239ca71b3132dfa605b0ebf02875dd4333190ebcc8c9b;

    uint256 constant IC3x_PART1 = 0x00000000000000000000000000000000185840a58e5d48825b231792586ee987;
    uint256 constant IC3x_PART2 = 0x12b4cca9de0e2177baf0bd1f2e597e93033e709dad7311cff871a1e478b8aff7;
    uint256 constant IC3y_PART1 = 0x0000000000000000000000000000000007703d26213471370510e7cbb682d17f;
    uint256 constant IC3y_PART2 = 0x54de0eacc5d5b6f44c16765d7c59d862c289d9af6a34ddfb475ad4fd4e58dc1d;

    uint256 constant IC4x_PART1 = 0x00000000000000000000000000000000013099b20dd675fd82538cf32c07ebc6;
    uint256 constant IC4x_PART2 = 0xd8e0b7bb66cf5471072b2bd36795ccd98f5f8b7cb2ee7fb22f2eef55964f2628;
    uint256 constant IC4y_PART1 = 0x0000000000000000000000000000000002126f87c06bfc9ba8cceb7d3a917247;
    uint256 constant IC4y_PART2 = 0xdba821a43b55d9670e5748ffdb676a885163a1f5dea33fe420bb516e8bd997ee;

    uint256 constant IC5x_PART1 = 0x0000000000000000000000000000000009f7defc1eca4ebf55d05eb22c792ca5;
    uint256 constant IC5x_PART2 = 0x2aa7c025df410c248b1de91c74c1174ff83ed628bd1948765e723da4208e86a9;
    uint256 constant IC5y_PART1 = 0x000000000000000000000000000000000f9ff16b61e3a3a016bba10a8a86651c;
    uint256 constant IC5y_PART2 = 0xd322c2b5d90c838eca493328918096f97431d9d4bf21da467a9a6542adbd0abe;

    uint256 constant IC6x_PART1 = 0x000000000000000000000000000000001849b1a703811f31a456bccb77d07c74;
    uint256 constant IC6x_PART2 = 0x2d23431082bfdf214be812ed3d1b21c19a84550abac10689ee4a98779ce398d0;
    uint256 constant IC6y_PART1 = 0x000000000000000000000000000000000687ec5ecfae20e75ad2f9cad96937f1;
    uint256 constant IC6y_PART2 = 0xb22cb15cf5dfe75093bb800505dcd4c9f0210228b49bdffa90dc497222798592;

    uint256 constant IC7x_PART1 = 0x000000000000000000000000000000001246101ab3b3eea072410b18fbbc9370;
    uint256 constant IC7x_PART2 = 0xd63a5aaa5103eac0ea39594da30cf541f5424c3411d3f07b1d55ac55024bd24c;
    uint256 constant IC7y_PART1 = 0x000000000000000000000000000000000a935f8c94dba40fbc2d9d658141e966;
    uint256 constant IC7y_PART2 = 0x8e6294127c7a80c08a777a2b7c1799afab1f33da77168b42fe47979a52196a30;

    uint256 constant IC8x_PART1 = 0x00000000000000000000000000000000090c995ca749a012b0f441fc8a0581ad;
    uint256 constant IC8x_PART2 = 0x2c5a2401558e9c0e349368bef174dce3ad3db8e0b0443694f98a229d3601b6a1;
    uint256 constant IC8y_PART1 = 0x0000000000000000000000000000000007a74b0a8312aba0a653f7c715b6cf77;
    uint256 constant IC8y_PART2 = 0x41476ca62302729bdfbcabfde3d1dc9e952632f0a3e1b1377dc2529229a400d1;

    uint256 constant IC9x_PART1 = 0x0000000000000000000000000000000018c9e9bf650d5b046572169c328a752a;
    uint256 constant IC9x_PART2 = 0x30f904e1f72a7ac6460f405946c8cfa3febb2c1ea846058c6626fc7deae599cf;
    uint256 constant IC9y_PART1 = 0x000000000000000000000000000000000ab36fbdd8cae7acbf673b7053cc3b5a;
    uint256 constant IC9y_PART2 = 0x22f5cbcd86ae0c57174ace15f2affafea63e8179ce5949619516bd1b7fa7d199;

    uint256 constant IC10x_PART1 = 0x000000000000000000000000000000000f05c2d59333506c60cf090d7474c063;
    uint256 constant IC10x_PART2 = 0x1a7e8b03d73877e67418fec8e1e0a5f495f2666212370f73be13059d8e9c74ef;
    uint256 constant IC10y_PART1 = 0x00000000000000000000000000000000085c9ccd22131456d812fae4fa946229;
    uint256 constant IC10y_PART2 = 0x93c2a0f72fcc2a6901b519d5172b2bb2eb7e1feb9ff7301f4269247f544e7ff6;

    uint256 constant IC11x_PART1 = 0x00000000000000000000000000000000064774d6f8ea3655739fabb534507834;
    uint256 constant IC11x_PART2 = 0x9f601a61be372eaad9c552bcdb59a11e533a435c4119ca8087cf262a420380f2;
    uint256 constant IC11y_PART1 = 0x0000000000000000000000000000000018f94ce4f8148684333bd907285f93ac;
    uint256 constant IC11y_PART2 = 0x6623e6fea43df470f071584e58e9b275a2a63157c439e4e9021e8bc718cdd4a2;

    uint256 constant IC12x_PART1 = 0x0000000000000000000000000000000009e7b96097a6b95677ee1383d44efa2a;
    uint256 constant IC12x_PART2 = 0x0a83133b2bd0493e9c336541b47357fb2dae3cbe2c3242530532ebf045374df2;
    uint256 constant IC12y_PART1 = 0x000000000000000000000000000000000686c70023bdb1a0507b52d0fd491245;
    uint256 constant IC12y_PART2 = 0xca708e84736e87bf7f7def7a70ebe68bd7219715b996229bac1783072bde2f49;

    uint256 constant IC13x_PART1 = 0x00000000000000000000000000000000109691e67c293032fd5d60fecc04ef5c;
    uint256 constant IC13x_PART2 = 0x6da105c500b93034bfd0a16775d9c16b4e11c70781fd7ea9df202609bcbeff18;
    uint256 constant IC13y_PART1 = 0x000000000000000000000000000000000899d234fd7bf36a3f5c731576f651ec;
    uint256 constant IC13y_PART2 = 0x328ae0947b9bd0e1e0e1f88ea10cfd0274f1f39cbe6ccfbb5ec4eee8cc6399ef;

    uint256 constant IC14x_PART1 = 0x000000000000000000000000000000000603aa1e4c8bcfcb8fef8744387b2f30;
    uint256 constant IC14x_PART2 = 0x235b70796528f57424f1263d5b1b2fa149269afab082ba8b0d2d6045dfd54416;
    uint256 constant IC14y_PART1 = 0x000000000000000000000000000000000a5daf831be613ef1330918dd8003076;
    uint256 constant IC14y_PART2 = 0xa5eac3520f8533390b7d49f965125f9969c72583152ff7e9c6c72dd098251992;

    uint256 constant IC15x_PART1 = 0x0000000000000000000000000000000005f596b16bbb1f930978661427d17180;
    uint256 constant IC15x_PART2 = 0x624c4a2bffd9441989f395621b1f655ddb2f60f172e38f9d9477663cf7a308dd;
    uint256 constant IC15y_PART1 = 0x00000000000000000000000000000000073dfac5d16a4a187c7df73ab19650b5;
    uint256 constant IC15y_PART2 = 0x7e4706aafba5e32e9ed662c3c339852e616960fa70b46261e688066a7f69bbcd;

    uint256 constant IC16x_PART1 = 0x0000000000000000000000000000000002b72b6d0cf244510c5a884cd7b36bde;
    uint256 constant IC16x_PART2 = 0x4e2f83ca62dfc825c88e1ba811ef38f1dc69a2e5c0ba2faaa472e0fe1e37acce;
    uint256 constant IC16y_PART1 = 0x0000000000000000000000000000000006978c9e67f42b7242bfcd143a2286ce;
    uint256 constant IC16y_PART2 = 0x236b2d1851f656937e7584703c995f232f400bb005fc0a7ba4bf85d165adde11;

    uint256 constant IC17x_PART1 = 0x000000000000000000000000000000000b1c51493c866d50d4a415a229361daf;
    uint256 constant IC17x_PART2 = 0x716f0d78111578a0ff366c11c7c40000bc87777433bd6e5153d8e1196f120fbe;
    uint256 constant IC17y_PART1 = 0x00000000000000000000000000000000127e9222360fc878a3a2e1e525fc0bc3;
    uint256 constant IC17y_PART2 = 0xc802757c18efb3a0961ee58dd9f3af37485946f27bebcaaed0c9aa3ef5657fe6;

    uint256 constant IC18x_PART1 = 0x000000000000000000000000000000000e736c5450aa71c9c9cf94fbb78fc100;
    uint256 constant IC18x_PART2 = 0xfd3b3b22b745c15890d9de2ce61c76871903a36966f406ddfd8994470b098461;
    uint256 constant IC18y_PART1 = 0x00000000000000000000000000000000130ce7b98ce72b943a85b3a383ef25b6;
    uint256 constant IC18y_PART2 = 0xfc895c73ac2d2ea7f1bafc3e26d0674f5039ca717f863b342b7b6756f7d8d5a7;

    uint256 constant IC19x_PART1 = 0x000000000000000000000000000000000b1a6c5c4da385d8fc138351ca0f0477;
    uint256 constant IC19x_PART2 = 0xb5c344e4cc0ffd87ed9252da570d4e6c711f5a9ff0b418b576414e6f59fb58a9;
    uint256 constant IC19y_PART1 = 0x000000000000000000000000000000000ed2460ea097b19a2fcee0b78220fe95;
    uint256 constant IC19y_PART2 = 0x13326cc022f67666e36f2e5a584cbf30cc763d0088d3d6890f8054d048e20662;

    uint256 constant IC20x_PART1 = 0x000000000000000000000000000000000114e213dc85825e9e8b11bba5a8717e;
    uint256 constant IC20x_PART2 = 0x0d1c543f5095e28b6bcd3bdd4fbd6736ceace0e72a3a18d52f52e2c6248684f0;
    uint256 constant IC20y_PART1 = 0x0000000000000000000000000000000004cc4c0961ebb4e07ac4521969c7f276;
    uint256 constant IC20y_PART2 = 0x22795433007e1e819c014b9fe6481d78affe212b946cc70ac1158623534d44dc;

    uint256 constant IC21x_PART1 = 0x00000000000000000000000000000000021b6233f8b39f948cdabf6948d98e25;
    uint256 constant IC21x_PART2 = 0x4a22a2fce2568682024c784bdf86a6c18ab5ed299cf52e30990951eb8f846c46;
    uint256 constant IC21y_PART1 = 0x000000000000000000000000000000000f8c95562cd75117797e57d0d995e71e;
    uint256 constant IC21y_PART2 = 0x7b397a1c39e60d785dc9ca3b6f7a0aef572f2aef294e2ec1e4d827b9b62d6166;

    uint256 constant IC22x_PART1 = 0x00000000000000000000000000000000144300f293b29f8ab5ceb417d15a289c;
    uint256 constant IC22x_PART2 = 0xd399b863c9a78142df9b7add04de77eb243ca9a3f07d378738d8353d4f9d6616;
    uint256 constant IC22y_PART1 = 0x0000000000000000000000000000000018be0ff5174df1e5b06fb5015e625efc;
    uint256 constant IC22y_PART2 = 0x756dc31a10c804235140e3c25faea014ca806994164e63c18f43a2b6ce5115a5;

    uint256 constant IC23x_PART1 = 0x00000000000000000000000000000000151060d1b82d324c7b9266fef801f815;
    uint256 constant IC23x_PART2 = 0xb03eb07fe029878ae0c6c153ca04ee84357a88cd72fd4b445724919934eb0c4a;
    uint256 constant IC23y_PART1 = 0x000000000000000000000000000000000a04aa03e71a4c950b7bd02c8b255bf9;
    uint256 constant IC23y_PART2 = 0xfb219cbfa11b8cebc4acc4b12bf349a2a2fa3e7c7c3f554972180ae0642a8ca8;

    uint256 constant IC24x_PART1 = 0x000000000000000000000000000000001761ba0a650f20b877ba3f5478b4383b;
    uint256 constant IC24x_PART2 = 0xbbf67076075f821773f8e99959340a722887d66b24739122de4b0e39ddf846e6;
    uint256 constant IC24y_PART1 = 0x000000000000000000000000000000000ef04c738f68ade967b4d09d8f1bb22d;
    uint256 constant IC24y_PART2 = 0x6c31a05dc79105fac06e7001731db497f1dc333109f922ffa48646830139e32e;

    uint256 constant IC25x_PART1 = 0x000000000000000000000000000000000b68ca8ac01bdfee7089f568d711f533;
    uint256 constant IC25x_PART2 = 0x2d3fe3eea0dd5b8a75c22ed3e0d683e112c70cbc44010bff37e2d8acaaf3bb0e;
    uint256 constant IC25y_PART1 = 0x0000000000000000000000000000000001a73d31831b9cea0699679d7d6d9b26;
    uint256 constant IC25y_PART2 = 0x20f048cd9e8b043c9d2e522c31d853c8ba6f4f90eacd9674835631f507cb8084;

    uint256 constant IC26x_PART1 = 0x000000000000000000000000000000000a8904dc1da155f57819095f5799fad8;
    uint256 constant IC26x_PART2 = 0xbeb9df3d2a63d4c43d4fc161c63be91f31a8ec0c83f9b2490f0eb51b4ea50b0a;
    uint256 constant IC26y_PART1 = 0x000000000000000000000000000000000d8f0ba59d0447e40ebeed31d25e8813;
    uint256 constant IC26y_PART2 = 0xe604df6dc49954e9e3b357faab6f2c0fda227d8f96352fcddf33798d8b8a4155;

    uint256 constant IC27x_PART1 = 0x0000000000000000000000000000000003ecf9daf508b8c949e8df06ad18faa6;
    uint256 constant IC27x_PART2 = 0x52074be4ae67c584fcc9b2f016123493e3212c7453af4902308015fbbd98707c;
    uint256 constant IC27y_PART1 = 0x0000000000000000000000000000000011fcc1f6882d6414de0d1baacc23a6d4;
    uint256 constant IC27y_PART2 = 0x6c22b350b1d95939934ee5e09404e7809ce2ac39c9e9a7ecdd3f18264c6821e1;

    uint256 constant IC28x_PART1 = 0x000000000000000000000000000000000a865a08af35a87fcca1ecb18b814eb5;
    uint256 constant IC28x_PART2 = 0x10b2f463e101dcc84973108bc7f135ae948498b4a3c8d320abd841ff3094b4e6;
    uint256 constant IC28y_PART1 = 0x0000000000000000000000000000000017f24faa663be02b7760c76fffa28acc;
    uint256 constant IC28y_PART2 = 0x4cb32cbd6e2ef44104c03a805705bebb6aa751cc96029e4f8c93d8e0e8e2eec1;

    uint256 constant IC29x_PART1 = 0x0000000000000000000000000000000002f47803124e0b290580e5eb1376820f;
    uint256 constant IC29x_PART2 = 0xf0c8d0fe147ce408f7b3c2baebfcdb6a9defae68749d7cc3e2194d23851501ed;
    uint256 constant IC29y_PART1 = 0x00000000000000000000000000000000056a3f314c5e16937b561b82e00249d4;
    uint256 constant IC29y_PART2 = 0x780f4f561ad5542f0ba7d6f1ce9b0539bdb99d3c745786982dd6fc7058b11a2e;

    uint256 constant IC30x_PART1 = 0x00000000000000000000000000000000004ca53e53f35084802a7c80c6c8534e;
    uint256 constant IC30x_PART2 = 0x3eb2f7509961bbf6a30d80b22687d78b82f888ccf2027f50d40886e176b69284;
    uint256 constant IC30y_PART1 = 0x0000000000000000000000000000000019e055cb93142e34b60cfcd7d44f4584;
    uint256 constant IC30y_PART2 = 0x97b6da361d7a8e9332289cf054cc472a99117d84e4719b62bcce773d978aa578;

    uint256 constant IC31x_PART1 = 0x0000000000000000000000000000000010db59d44d0e588911127bb44b22a621;
    uint256 constant IC31x_PART2 = 0xab26f4964f381bb51f4bc85e45ae9e1b79a42ff63f7ec6cdbb6471f37ac3ba9f;
    uint256 constant IC31y_PART1 = 0x000000000000000000000000000000000ca4fa89fb064a8cb75d1bac2b4bfcdd;
    uint256 constant IC31y_PART2 = 0x4488aab1cce00385c555bda5376739601f678ebabc3955eb5a9709cf2e9f066b;

    uint256 constant IC32x_PART1 = 0x0000000000000000000000000000000010965464d1579b7d174e8731bdafbead;
    uint256 constant IC32x_PART2 = 0x39f9f9da20566ca53bfd83118e66eef841f47c24f7929be66e22c113bb6e8891;
    uint256 constant IC32y_PART1 = 0x0000000000000000000000000000000008bcb14126a6a578480d9b3570e128db;
    uint256 constant IC32y_PART2 = 0xddfa0642d14fe1b1e4da18c72b49f97c8d39dc8e32eae80bb4e12219a3b78e2b;

    uint256 constant IC33x_PART1 = 0x0000000000000000000000000000000014552a910f1ddd36b95f9989de54e929;
    uint256 constant IC33x_PART2 = 0x984943be34eae5d90d96d09f086a3456464c972bd4ec2a2a81c11e7a82c21785;
    uint256 constant IC33y_PART1 = 0x0000000000000000000000000000000016ccd3da96cd50f927fe0462a2725379;
    uint256 constant IC33y_PART2 = 0x312ba188ddea56721c54d31fca5632db837f97de14a4422a1632b17248a28ff8;

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