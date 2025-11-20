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

contract Groth16Verifier32Leaves {
    // BLS12-381 Scalar field modulus (r)
    uint256 constant R_MOD = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001;
    // BLS12-381 Base field modulus (q) - split into two parts for 48-byte representation
    uint256 constant Q_MOD_PART1 = 0x000000000000000000000000000000001a0111ea397fe69a4b1ba7b6434bacd7;
    uint256 constant Q_MOD_PART2 = 0x64774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab;

    // Verification Key data - split into PART1/PART2 for BLS12-381 format
    uint256 constant alphax_PART1 = 0x000000000000000000000000000000000041aec82900960a8f89d297b8361c46;
    uint256 constant alphax_PART2 = 0x965d3d9b8a5d0f58c2cf30e3e76777f7ecc18a58789ae4e61a959f9ce352f11b;
    uint256 constant alphay_PART1 = 0x0000000000000000000000000000000011b89c42e2c64df0886f20ef133a73b7;
    uint256 constant alphay_PART2 = 0xe7f1324a8309139ca841b5895b838f73ed2275d7661b68a75f58377551a8b913;
    uint256 constant betax1_PART1 = 0x00000000000000000000000000000000170d37a68234c1a86d9567dc33b985fe;
    uint256 constant betax1_PART2 = 0xd262eb743f24162f9d4c72058789589b6983bdf056ae1a083c16169432941283;
    uint256 constant betax2_PART1 = 0x00000000000000000000000000000000159077a549d9092da3d9085f0e86a6f7;
    uint256 constant betax2_PART2 = 0xdbeee4986e8428ca1d1455518651c51ee171af97852f6c4c43f22fb748fac3c2;
    uint256 constant betay1_PART1 = 0x000000000000000000000000000000001009966cbaef70dda75304685c942598;
    uint256 constant betay1_PART2 = 0x80f492b2b0b0dc28a137b6bf184456054053bb9bac889103d80858f764eccfde;
    uint256 constant betay2_PART1 = 0x000000000000000000000000000000000de4adbd44f0bfd56fb04dfd0cdcccb7;
    uint256 constant betay2_PART2 = 0x54fd77c317e4a78c742f2ef2773633b9072e8d00615d014f2b99fd8e7376a201;
    uint256 constant gammax1_PART1 = 0x0000000000000000000000000000000013e02b6052719f607dacd3a088274f65;
    uint256 constant gammax1_PART2 = 0x596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e;
    uint256 constant gammax2_PART1 = 0x00000000000000000000000000000000024aa2b2f08f0a91260805272dc51051;
    uint256 constant gammax2_PART2 = 0xc6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb8;
    uint256 constant gammay1_PART1 = 0x000000000000000000000000000000000606c4a02ea734cc32acd2b02bc28b99;
    uint256 constant gammay1_PART2 = 0xcb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79be;
    uint256 constant gammay2_PART1 = 0x000000000000000000000000000000000ce5d527727d6e118cc9cdc6da2e351a;
    uint256 constant gammay2_PART2 = 0xadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801;
    uint256 constant deltax1_PART1 = 0x000000000000000000000000000000000511f5a6791a477a939b2af36e835c5f;
    uint256 constant deltax1_PART2 = 0x74d20fc06d9a617e37a20dcdd4f2b60d2cafb169af6894705c359be21e0c2eb1;
    uint256 constant deltax2_PART1 = 0x00000000000000000000000000000000086b1680ff0205e4acacc7e03aa6451b;
    uint256 constant deltax2_PART2 = 0xa8a7f65aec3787d4bd55da657e32ed4708c0c9bb2f374d3d6639eb20187d7b42;
    uint256 constant deltay1_PART1 = 0x000000000000000000000000000000000b01e2196083be927ac8aaaaec0ca4f9;
    uint256 constant deltay1_PART2 = 0x97ea6939d0cddb54d83bae25755ce345f41b031901022ef6ab2650fbcf2564dd;
    uint256 constant deltay2_PART1 = 0x000000000000000000000000000000001903afc9d61bebbecb342ecd44bec844;
    uint256 constant deltay2_PART2 = 0x361dd7f89ce94a0b591f6b770814a24b02e9f9ef3d0402b00f9a0c9d88227e9e;

    // IC Points - split into PART1/PART2 for BLS12-381 format

    uint256 constant IC0x_PART1 = 0x000000000000000000000000000000000bd84410c1d1485e54dfcca454fb2f48;
    uint256 constant IC0x_PART2 = 0xb3050e51f52b5fd9354f51aeabc371ccaa2e890cce6ff0567bc744d8ea42cb7f;
    uint256 constant IC0y_PART1 = 0x00000000000000000000000000000000080510abea78ce71703ed5b4be7cfb5f;
    uint256 constant IC0y_PART2 = 0x59501c14091301622c0d990ca5b2e0fcd8bb2cf3c94c37f36e3ade6d359bde63;
    //
    uint256 constant IC1x_PART1 = 0x00000000000000000000000000000000075f28c68c7f422bc75f8521bb5b8659;
    uint256 constant IC1x_PART2 = 0x09a8e471684d564c65d8a1acbb6183b3b580833263b79b8c44dd2e3d8d6963b8;
    uint256 constant IC1y_PART1 = 0x000000000000000000000000000000000c58d97a360879c71000e2388a764e2c;
    uint256 constant IC1y_PART2 = 0x622450b6bf00480ff71a8ef756929ffb3c415bbe712b0e2f81e89735bb850682;
    uint256 constant IC2x_PART1 = 0x000000000000000000000000000000000aa6b99a5170df6106a974a8726ef8ae;
    uint256 constant IC2x_PART2 = 0x94f2b2b3ce27d95ab2a2dfdf8edf4d8df5dbb15edfbe498f19671747268abaa0;
    uint256 constant IC2y_PART1 = 0x000000000000000000000000000000000c07a973cf8ac1cfdd4372ab40998807;
    uint256 constant IC2y_PART2 = 0x81e9976a0a04171a1f19171f41a52c5b38aec518db8ddd0255ea7395b9e72f52;
    uint256 constant IC3x_PART1 = 0x000000000000000000000000000000000ff1d88461c7f3752e0d73d41224d5c9;
    uint256 constant IC3x_PART2 = 0xe8cdae0e2120d3c41f6d0119054bba015669480bc38fe5a759fe7b91d665981e;
    uint256 constant IC3y_PART1 = 0x0000000000000000000000000000000003df3112b643b38de506c9877c62c38d;
    uint256 constant IC3y_PART2 = 0x6ee98be0976d55810eb58e1a0ca32f56a73e155017245d66fe1bfa2bf27275a4;
    uint256 constant IC4x_PART1 = 0x0000000000000000000000000000000013b3b531f1b1a6c349e765e5d987afe4;
    uint256 constant IC4x_PART2 = 0x5e4f327c9ccfc1a90c13d301f90b0a6592c0c37767cb7a1bac26947019c10cc7;
    uint256 constant IC4y_PART1 = 0x000000000000000000000000000000000f3d0f4fee0bcc82dd7c3961748acaf4;
    uint256 constant IC4y_PART2 = 0x6c14f51bd8dda020dd36f6590fae4b3f029b6a0491d49c035b75f85bc2aab810;
    uint256 constant IC5x_PART1 = 0x00000000000000000000000000000000006ab4de26aa2a8d47c2e26c5d3bad49;
    uint256 constant IC5x_PART2 = 0x64674a907d5fbdf4b4dac63fe6072f083eaf6d5a5b428ffa229f7b455c2752fc;
    uint256 constant IC5y_PART1 = 0x000000000000000000000000000000000689c5b3807608e834b3e82e8897d74d;
    uint256 constant IC5y_PART2 = 0xb222c07df5036932de535744856c5407b352b820d60d673ecaddac53f891d189;
    uint256 constant IC6x_PART1 = 0x00000000000000000000000000000000013321abc572a8fc3993dae7f1547799;
    uint256 constant IC6x_PART2 = 0x64997e7ac569e48c4ef0f0e5d7a03f33d2cf2a150c86013721af0ac821af50f4;
    uint256 constant IC6y_PART1 = 0x000000000000000000000000000000000ee25dc0d1cbaf330d0daa9fc5c0f160;
    uint256 constant IC6y_PART2 = 0x0782237630b4af1e28b077b6195f8a91c3d3a52d6813edbe930df9155acf0b9d;
    uint256 constant IC7x_PART1 = 0x00000000000000000000000000000000110c112981ac6625b428c5175ae32930;
    uint256 constant IC7x_PART2 = 0x248c289cb375ae19af9fec8e57076283f55d31d37144cbefdd3592d43ed3d58d;
    uint256 constant IC7y_PART1 = 0x000000000000000000000000000000000e0d4a3e5cc7d4dc843878010c5f5944;
    uint256 constant IC7y_PART2 = 0x848ce3d3fd427796734d57653b853ed81678d1bc9b578d7d85f6135a7c9240db;
    uint256 constant IC8x_PART1 = 0x000000000000000000000000000000000eb1524f99abf6867d907ef62da6b978;
    uint256 constant IC8x_PART2 = 0x10a619901faf24ee872aa8c280fa8af876942e4cd34357b7fcc6732c9dd1963a;
    uint256 constant IC8y_PART1 = 0x0000000000000000000000000000000002926eeb748571f8ad6e9f459128e196;
    uint256 constant IC8y_PART2 = 0x60d7a76055118eb559aeb22c6cc2a5752e2f95606d0b0d1848ec32313ea52066;
    uint256 constant IC9x_PART1 = 0x000000000000000000000000000000000b53e4b3df17bc4677854a38cf96fd2c;
    uint256 constant IC9x_PART2 = 0x8b2627e933ce8bebfbf9a116b91c377399353f38a4fa827f377aa5b300a3dabd;
    uint256 constant IC9y_PART1 = 0x000000000000000000000000000000000c484a99c47103e7ff88edafde3adfb8;
    uint256 constant IC9y_PART2 = 0x5ca3f1bd847104db4bcc15724bccdc7b44b1a0c7197b6abc4c9b3b27aa43b107;
    uint256 constant IC10x_PART1 = 0x00000000000000000000000000000000129319c19eafaae9d439e0666bf1d3fd;
    uint256 constant IC10x_PART2 = 0xccefb7e241c5cf1a23dfada65deb708d0d80761ebcbf5a04f860aff0dadc4625;
    uint256 constant IC10y_PART1 = 0x0000000000000000000000000000000010d69a9debc87df726f42f3452ae8694;
    uint256 constant IC10y_PART2 = 0x8ccfa35ac4671cd21a5fe3761c9038b0386c5f5485983f028b79b83fd9149cb1;
    uint256 constant IC11x_PART1 = 0x00000000000000000000000000000000079168665edeb7bac558417545d19d0f;
    uint256 constant IC11x_PART2 = 0x5413678ede15e4573add95fab6b131d20a6ed5de02a0cbc2502136bc6e2cab4d;
    uint256 constant IC11y_PART1 = 0x000000000000000000000000000000000789507749c593e4ce2cf0e8d79f03e3;
    uint256 constant IC11y_PART2 = 0x6225a0b15cb9bccbabc71393a25e910f76663c824cb2d1c490d065ae312171db;
    uint256 constant IC12x_PART1 = 0x0000000000000000000000000000000013dda62cf1ee5ea03a47b953dbd852d8;
    uint256 constant IC12x_PART2 = 0x32bfefa6b32bab97ff6f50b9169077162d3bb31480722fa79d45aefd070a3d89;
    uint256 constant IC12y_PART1 = 0x0000000000000000000000000000000016c3b964adf4c372a54f076ee7d652d5;
    uint256 constant IC12y_PART2 = 0xe7adafc3b31ca71b2c905fd9c410941d89e7af93dff0d9227e6ebd53f97baf8c;
    uint256 constant IC13x_PART1 = 0x00000000000000000000000000000000178eb0eb2186b896cb2a4c4dd3603f61;
    uint256 constant IC13x_PART2 = 0x7fb4a581ac79a43aed0cd074c5f5053924e6bfc39335520236d6ecd8e5bd6c27;
    uint256 constant IC13y_PART1 = 0x00000000000000000000000000000000078b6c81048304a312058e88ab7d5d91;
    uint256 constant IC13y_PART2 = 0xf57b0e0464cc3d7591f8181d818e32e30d5606b5ef3cb9e3c481beb0d247d503;
    uint256 constant IC14x_PART1 = 0x000000000000000000000000000000000576ccb83c469370b97d241de66e6e19;
    uint256 constant IC14x_PART2 = 0xf0a1c4dc8ee6ecba574e7ecb23ea3454dc964ae36d9b232408023b8411791a10;
    uint256 constant IC14y_PART1 = 0x000000000000000000000000000000000f865c8c718ce2825b4fe348b26aca59;
    uint256 constant IC14y_PART2 = 0x2ccd6fa431619517cb5f6e9f3ff26a4f3c67ca05c335fcb76d82d3b765ab41da;
    uint256 constant IC15x_PART1 = 0x00000000000000000000000000000000021adf3466c49a5fb42209c4d50ac1ea;
    uint256 constant IC15x_PART2 = 0xd3bb6dc0cce40f18a55535bce540dd75044b2fd335f7661e4c926b629f682e28;
    uint256 constant IC15y_PART1 = 0x000000000000000000000000000000000e43b42be4d124b2050ef0f71efdccd0;
    uint256 constant IC15y_PART2 = 0xf6a6326467055ca0ca5f35cba5deb75fd8650ec58d36381fed9de8c86a00fc15;
    uint256 constant IC16x_PART1 = 0x000000000000000000000000000000000542bc13e9236b8b57ab044271e1a300;
    uint256 constant IC16x_PART2 = 0x7f8ac1c3e6747acc59b1f56c9352cb06df91803fdbc347cc5fe1a64b77625d29;
    uint256 constant IC16y_PART1 = 0x0000000000000000000000000000000008d91b4859336162577479ca26e01040;
    uint256 constant IC16y_PART2 = 0xcd8e49d2007bc5a5832fed6409e451c2adc95cb633e4fcc45a5427684ed0ad66;
    uint256 constant IC17x_PART1 = 0x0000000000000000000000000000000015cd7e227ce819a56cf66cdcf9c34bb6;
    uint256 constant IC17x_PART2 = 0xcff9720ffaa656909a7565e2bb6293dae4a422922d64e49a824f9488f820d045;
    uint256 constant IC17y_PART1 = 0x0000000000000000000000000000000013ce89ce8dddbc0e1f8dcf206f40bc21;
    uint256 constant IC17y_PART2 = 0x9e07977ad5b3ac56a18165c1b8f53ec6a8e1dff4443e941ec80bc4fdd3b65356;
    uint256 constant IC18x_PART1 = 0x000000000000000000000000000000000a9b0150f8e31e5cb2389b7e8edb1d7b;
    uint256 constant IC18x_PART2 = 0x0250f04a731b881f911cf3e0be752984178db6f37c681f786df780f7db9d0a69;
    uint256 constant IC18y_PART1 = 0x0000000000000000000000000000000011a50be4e7b1947071ac33565f0e482e;
    uint256 constant IC18y_PART2 = 0xfeb21211ebe044422ac837592c9e54caa7b444a8751e6f85627607fa52bb790a;
    uint256 constant IC19x_PART1 = 0x00000000000000000000000000000000085435df9e7d053897021ccc086b141f;
    uint256 constant IC19x_PART2 = 0xc0cc6aa84ffa4668ad8cdbe791e00a5d521336699a42000519ecce100c4b9931;
    uint256 constant IC19y_PART1 = 0x00000000000000000000000000000000091f082c9cf0d2c682828d7e888dad6f;
    uint256 constant IC19y_PART2 = 0xe9bc272d23f0ace69dfcf7c2c97010be6d37127c0abca0939687f943a2a61bbc;
    uint256 constant IC20x_PART1 = 0x0000000000000000000000000000000001f7032a834131ece135916451d27f1a;
    uint256 constant IC20x_PART2 = 0xea77b750a2c7fcfd6de7a8a23eb1d0bdcc5131ed8333731fa56289b404ab9c7c;
    uint256 constant IC20y_PART1 = 0x0000000000000000000000000000000000c1e82f7b5570d71ddefbe7be40b8b4;
    uint256 constant IC20y_PART2 = 0x7e7850e55c65407d55ffb88bfb542af26c0becd641419f3bd76a63391db707d8;
    uint256 constant IC21x_PART1 = 0x000000000000000000000000000000001452183e3a2d308c64b6b79676ba5893;
    uint256 constant IC21x_PART2 = 0x55567574e031b08fd57a95bda8b833f3eb4bd65bfd8ecb2ea1cbaa3dd058a61d;
    uint256 constant IC21y_PART1 = 0x0000000000000000000000000000000005dd75a192537058864595fa114b3840;
    uint256 constant IC21y_PART2 = 0x6bf2c7492df2c3cbc3f2105bc21aff62a8e6db70c4a18e3f7816af6d6de7eead;
    uint256 constant IC22x_PART1 = 0x0000000000000000000000000000000005f7e9fff8ad2715f0e01cefd44fa658;
    uint256 constant IC22x_PART2 = 0x29eaf19d4022b110cd60b833a79d632eb5041c69d20cda4ddbf6fdff73b12edb;
    uint256 constant IC22y_PART1 = 0x0000000000000000000000000000000007d72ca6673bab185d8bc9c26efe62a8;
    uint256 constant IC22y_PART2 = 0xc389e662bbe7266d339b44c88de1dae771e5c6aa17f4f3c64a03392c0fa0e3f7;
    uint256 constant IC23x_PART1 = 0x0000000000000000000000000000000011548bc9571ce240cb9861ccba072067;
    uint256 constant IC23x_PART2 = 0x27ba91c689156f6ffc8bae85a1b18ad50c9a1dfa6a10a83ee25f77d8a2cf8c4c;
    uint256 constant IC23y_PART1 = 0x00000000000000000000000000000000166bd420210e05f0064467e31c55fda7;
    uint256 constant IC23y_PART2 = 0xf06a7c92cb356866432ed4d36aa1030d8e788e2750e6da311e4bfb0b923cc297;
    uint256 constant IC24x_PART1 = 0x0000000000000000000000000000000004b4b6ee77a11a4cfa070d7bb7a2c9a7;
    uint256 constant IC24x_PART2 = 0x4e0064dead374eb89cb85f186dfb7c2f8de054ede15498a83d07b4884166a444;
    uint256 constant IC24y_PART1 = 0x0000000000000000000000000000000016a5d332ffc8e41868964a5a417148d3;
    uint256 constant IC24y_PART2 = 0xcc5c13b6a9c38c5822c2b1ff88b8d0db45bf81ef87114f5cedc9a31916e56b31;
    uint256 constant IC25x_PART1 = 0x000000000000000000000000000000000e6201a0896d41bf321a9e9a59bd6b30;
    uint256 constant IC25x_PART2 = 0xb462a3642667eb2fa1e53e5e821ac9ebe5010373a1b54ace3d6be617cdb44b38;
    uint256 constant IC25y_PART1 = 0x000000000000000000000000000000000867c8bc707ad6727acc88c217f71798;
    uint256 constant IC25y_PART2 = 0x7393374c6c6b2f529353128f47b1865c8f3220dfad206c0678ebe82ff5f5638d;
    uint256 constant IC26x_PART1 = 0x0000000000000000000000000000000003f672a894199fb6f11d2981718825d2;
    uint256 constant IC26x_PART2 = 0x86b1b22d68feba3426b25ed4518983f01bdfe6913700d67cfadd78bfbc985a71;
    uint256 constant IC26y_PART1 = 0x0000000000000000000000000000000007777b01b3f5e97a56f9043442967daa;
    uint256 constant IC26y_PART2 = 0xa71127d36b81e9681edd6fab470a787f1019a1137c115036e6f08ea24988b746;
    uint256 constant IC27x_PART1 = 0x00000000000000000000000000000000189d6728a5f4f8416893b154feb7d6d0;
    uint256 constant IC27x_PART2 = 0x27497aa33711472584f6378305a7b7be4468f2a9b0354a289c0feb40226607e4;
    uint256 constant IC27y_PART1 = 0x0000000000000000000000000000000010f2565193b439dfa43a8c98186d95ce;
    uint256 constant IC27y_PART2 = 0xaeb73ab119fd45618214e64d4a16ba72162d13ef27adfbfd026f077fd506897d;
    uint256 constant IC28x_PART1 = 0x000000000000000000000000000000000e4fc0d86f4f0a6d49c6e14711c8527f;
    uint256 constant IC28x_PART2 = 0x42287134f9c7daf26d2ca1fc780ea6225ca54b8b3f4510fe17ca802c3284c4a2;
    uint256 constant IC28y_PART1 = 0x000000000000000000000000000000000141a405a1ba31a2d68f7d28f3245d29;
    uint256 constant IC28y_PART2 = 0x05221b6c61d2bb720748be8412b5385f16ba062210904a202aabe89d440ced48;
    uint256 constant IC29x_PART1 = 0x00000000000000000000000000000000136b663968b9006504dc4c74f0fa29bf;
    uint256 constant IC29x_PART2 = 0x2bc791af0eac966016ae10dd9c2cf924dd2f09ff2b3498fede1e9085160252c6;
    uint256 constant IC29y_PART1 = 0x0000000000000000000000000000000017ebe2ad51c5aad8fab603706f5afd66;
    uint256 constant IC29y_PART2 = 0x839b8c741f45d42bd0c4a112e469107d5168663c9b1cdca055ccc6a1b0b97a32;
    uint256 constant IC30x_PART1 = 0x000000000000000000000000000000001881d67ac3833a2eeeae00e049cdffc9;
    uint256 constant IC30x_PART2 = 0x00bc94e51e710e3837bdb00efd640150dbf09796ba0685e03934cda044c01f72;
    uint256 constant IC30y_PART1 = 0x00000000000000000000000000000000010b7a61a2e710aa105736ffb29668ae;
    uint256 constant IC30y_PART2 = 0x8e1af6d94689dd465b607b95a84091b4215ecde1db845206b606ed0582dc4009;
    uint256 constant IC31x_PART1 = 0x00000000000000000000000000000000077daa7b6158fd58e087c502945722ef;
    uint256 constant IC31x_PART2 = 0xd6d862afc747b00544756d0ab1070835d845471a08081f04f5cdec9d1d6f1a22;
    uint256 constant IC31y_PART1 = 0x0000000000000000000000000000000000788c24fcec08461335e7872d5be015;
    uint256 constant IC31y_PART2 = 0x714921b028804173642069cd2ebb3a80c1ed1f046967fd8d6e02a111cb053480;
    uint256 constant IC32x_PART1 = 0x00000000000000000000000000000000172a276be06ade14bb650e9a670cecc3;
    uint256 constant IC32x_PART2 = 0x577cf56ccc0986cd4c89a23f27f23c32528a40ed14aced1c10b72c594bbc3f74;
    uint256 constant IC32y_PART1 = 0x000000000000000000000000000000000407c21089441140a2bd77d399a6193f;
    uint256 constant IC32y_PART2 = 0xa0d7d52a397c5916d9a768930d04b3b1786396ef2365c888d4cf1e31b93fd085;
    uint256 constant IC33x_PART1 = 0x0000000000000000000000000000000006cacf8ac3df7d1f4a318447e8889d72;
    uint256 constant IC33x_PART2 = 0x6a97a0606d029eccc5f5d8273c549cc323cd2bcd185b22b6c61474cd1519218f;
    uint256 constant IC33y_PART1 = 0x00000000000000000000000000000000018689847a84813019e9dc0055f0c4f9;
    uint256 constant IC33y_PART2 = 0x821d01e556a05fa97e0fa7c7ff6df3dde6095c8f2af0c3f02b59e40b15027478;
    uint256 constant IC34x_PART1 = 0x00000000000000000000000000000000058c52fcbde7d6a0baba344ab4d56771;
    uint256 constant IC34x_PART2 = 0x39fa7634c4c30ba9f1201dbd8291f57860cd47da7bb34982c5d65042fd3d9f72;
    uint256 constant IC34y_PART1 = 0x000000000000000000000000000000000ba3d203baadf16daebd923ee1b7d8b8;
    uint256 constant IC34y_PART2 = 0xf2e2716c2c7925e7f43288382fceafa6f3877b58384cdc5c7d37dee3f0bd5848;
    uint256 constant IC35x_PART1 = 0x00000000000000000000000000000000058420845a10040df0a09531a01c5ed0;
    uint256 constant IC35x_PART2 = 0x7bc1600ef6ba4ed08f613dd9df376e5df9c6208472e6ea4ec1c923fd7c6d929d;
    uint256 constant IC35y_PART1 = 0x00000000000000000000000000000000003e5260ec619d9a1f0ae6183fbb7a01;
    uint256 constant IC35y_PART2 = 0x4b99280f83d82b5ea680c0a49af69812d7abce5eeba9943526953cc4b5a7ebfb;
    uint256 constant IC36x_PART1 = 0x000000000000000000000000000000000b3ebacb914c2fcc56fc5badac494dfc;
    uint256 constant IC36x_PART2 = 0x2a25b31e715d694bf947fce3dc0bd9286ed184e8962aca846ede653f830c7f51;
    uint256 constant IC36y_PART1 = 0x0000000000000000000000000000000012e34cfc1dd0c04c243f85bbe414b75e;
    uint256 constant IC36y_PART2 = 0x01b98e3cf458563510965c7def3a206617a25916138fb0a71c3c11bd4860e7f3;
    uint256 constant IC37x_PART1 = 0x0000000000000000000000000000000015f03dab8fc2f4c44bc492f33ba23861;
    uint256 constant IC37x_PART2 = 0x78502380d14e1114c1fc503fdc235ed80ffb8f9feb994e0bd89e74755435ce96;
    uint256 constant IC37y_PART1 = 0x0000000000000000000000000000000015c2f63fcffb102ee737f9829d0200a7;
    uint256 constant IC37y_PART2 = 0x834016421431dfd3fbf960edecc267b2087eccb330381e12d2cd6a33ce856286;
    uint256 constant IC38x_PART1 = 0x00000000000000000000000000000000042849dccf3f5538d041486d26af660c;
    uint256 constant IC38x_PART2 = 0x3f5a04b29394ad96d59949d1bb8582c8275c7432657695c1785f83e86dd8dfb7;
    uint256 constant IC38y_PART1 = 0x000000000000000000000000000000000c0cd85a0dbd5f5d78d3a54b4db7f57c;
    uint256 constant IC38y_PART2 = 0xc5d443fb620681a25afd41289e367b15226b63c7a6b96fd386cff5d3f4a4962f;
    uint256 constant IC39x_PART1 = 0x0000000000000000000000000000000013a9ea68b4e29413f10bdf69927dedf9;
    uint256 constant IC39x_PART2 = 0x6253610e0af0adf8571fff0d3f6ebb2c17ddc32e948b23721dc3f0ec310fac9b;
    uint256 constant IC39y_PART1 = 0x000000000000000000000000000000000a31dcb6688a78b9eeb9adbaf57c9726;
    uint256 constant IC39y_PART2 = 0x50214f56f19f7e5b7362cd318bc8194a32983ecb957154faecde0884bcd06534;
    uint256 constant IC40x_PART1 = 0x0000000000000000000000000000000017466584508f24f0e8728e073523ead1;
    uint256 constant IC40x_PART2 = 0x371eefe09dbd0270f4708d4e38381c7b8563d358eda3b1b40e19bd9a622ee5ee;
    uint256 constant IC40y_PART1 = 0x000000000000000000000000000000000e27d887b44ca3c41e65ac10e0f6aff4;
    uint256 constant IC40y_PART2 = 0x1d880a9c8b23691c5781417fcfb5a7d0b936ceecc543241f8727ea6c6d8ad166;
    uint256 constant IC41x_PART1 = 0x0000000000000000000000000000000001a79b9cdb32c0b5efcb0c51053d8325;
    uint256 constant IC41x_PART2 = 0xdf5f1ddfcb87e7c00861eea7cd9289ab8919b55cef9694ef31ed454509f65a54;
    uint256 constant IC41y_PART1 = 0x000000000000000000000000000000000e8b21d255fc713a29ed189adeaddaad;
    uint256 constant IC41y_PART2 = 0x5745d4ae501d67efa83fc20e49ac3ac0aee2b6fec865fd82e779f126e2a8b11f;
    uint256 constant IC42x_PART1 = 0x000000000000000000000000000000000b1a71cfcbdc67f76ab0d9464a0af650;
    uint256 constant IC42x_PART2 = 0x47e338ca80f7150c8fa92fc3f829cd3b8ad24d28ae916ffb4be8611fda59fdb7;
    uint256 constant IC42y_PART1 = 0x00000000000000000000000000000000171600800a86a771ca420bb88e7b83f3;
    uint256 constant IC42y_PART2 = 0x811e5ad5964cbd98cb4098292b67a2c0b9a6b3a9e680b24f71f9b0ea9b32de1b;
    uint256 constant IC43x_PART1 = 0x00000000000000000000000000000000161e4237e71c39e2c93a6e0a1613ff61;
    uint256 constant IC43x_PART2 = 0x9f7bc2cb8b13cf5353f75eb98dd4568ee508bf6e1ed4dd1852bf9941be99ddc9;
    uint256 constant IC43y_PART1 = 0x000000000000000000000000000000000b1b910f8be5ce5ba57a255f5bd41b60;
    uint256 constant IC43y_PART2 = 0xf4eead82b718162f6dcd54cb2a960a87fb6baf5488a3b57752c0ea59068dcd90;
    uint256 constant IC44x_PART1 = 0x0000000000000000000000000000000012af89851533f07b331d223f745e412c;
    uint256 constant IC44x_PART2 = 0xa9ac4e523c7a5b0eb6bacfb10a1617efaf25fbd75e3db07430b6b6a551b7d590;
    uint256 constant IC44y_PART1 = 0x0000000000000000000000000000000014e220ab1c2442d8314c0e845affb403;
    uint256 constant IC44y_PART2 = 0xcd4acb6a7fddec01e49041a914eb5bc7c5a6785f0d507bf9097f7fc9b01f92bc;
    uint256 constant IC45x_PART1 = 0x000000000000000000000000000000000e90102b995acf171c15e25034ce3051;
    uint256 constant IC45x_PART2 = 0xf01418432a92bd64d39000717c6800d1ff3cfeb0537a8ab3d189e8df1927a22b;
    uint256 constant IC45y_PART1 = 0x00000000000000000000000000000000177a48a00e70602122f25fa2bfd04495;
    uint256 constant IC45y_PART2 = 0x2cb52469557b5083355697975bab7098b2e25d48492144b76fc1cec08cb6504c;
    uint256 constant IC46x_PART1 = 0x0000000000000000000000000000000008c356a384b8016953358f52122618d5;
    uint256 constant IC46x_PART2 = 0xcf05d7e6cf3ac00db441eb81bdd69da9825498ea44659782c583e34626f46f5e;
    uint256 constant IC46y_PART1 = 0x0000000000000000000000000000000011e70b94f0e313c688910913220f977a;
    uint256 constant IC46y_PART2 = 0x9120f97015aa675a2f256bfff9bf5fb4e6ee3a9a720f54d5e95ea40830dcb4e6;
    uint256 constant IC47x_PART1 = 0x000000000000000000000000000000000c3b6c2330f174024b66d664736c9c8f;
    uint256 constant IC47x_PART2 = 0xbb25678a525c6974bd4bdc5e8a092d9f6845a468aa5ade122d153f7c393ec830;
    uint256 constant IC47y_PART1 = 0x00000000000000000000000000000000076f8227c442cc52b9df65d85b1b6538;
    uint256 constant IC47y_PART2 = 0x2a29f62cea5b08836766afa9834aa2431ac596a36e7970bd6e723e7a395ef4d4;
    uint256 constant IC48x_PART1 = 0x00000000000000000000000000000000076b9336642f8978f9dd33094acfb435;
    uint256 constant IC48x_PART2 = 0xb1255bd953919baf2e398dad7ae46ecd0191c5d361d5bd0cb212b83d4d076c3d;
    uint256 constant IC48y_PART1 = 0x000000000000000000000000000000000c4ffc79a099f36170116d083f17552e;
    uint256 constant IC48y_PART2 = 0x907734cf578dc4ea1cee0b0bba5ede7e97038ef6f18277901aa1970129890fc2;
    uint256 constant IC49x_PART1 = 0x000000000000000000000000000000000c9d02cece5f89519e3b7e33cc3357fe;
    uint256 constant IC49x_PART2 = 0xf8583505cc5fb5f2fdc29a6402b89ad79f1751c82e06e97848459768f85f7e5f;
    uint256 constant IC49y_PART1 = 0x0000000000000000000000000000000017fbb1296917b916f5ecf128f7a135e9;
    uint256 constant IC49y_PART2 = 0x743b76570bd3aece18d1a21798e82d56af80c513dd390bee4d75279e51e898c4;
    uint256 constant IC50x_PART1 = 0x000000000000000000000000000000000b355aacdce950d32441d303df00ada9;
    uint256 constant IC50x_PART2 = 0x9855d96dd55c4feb1ef3727414996d6e7e3b1dedeb59af8283b759fd44813441;
    uint256 constant IC50y_PART1 = 0x000000000000000000000000000000000dd52cf3fb60b66e7f8dc426f84c6efa;
    uint256 constant IC50y_PART2 = 0x970022c49c75acfeeaa902518ca5abe8a095c9c7ec952bc3129c32ff53815534;
    uint256 constant IC51x_PART1 = 0x0000000000000000000000000000000017dd9966b46c2f5bca7f6bba1931fd0e;
    uint256 constant IC51x_PART2 = 0x42b8ef567fc35c886707d825c966e73c761e3ffebd01125ae82827d314c61ec4;
    uint256 constant IC51y_PART1 = 0x00000000000000000000000000000000168a6664a7ac9bac39d8e28624105e81;
    uint256 constant IC51y_PART2 = 0x407ccedccad76059d1f15e9126bcd75c97fa1e701fcea1fd1937cb65c7d02032;
    uint256 constant IC52x_PART1 = 0x000000000000000000000000000000000f75f1e0df985d6885fa0ecf1151db69;
    uint256 constant IC52x_PART2 = 0xab5ececbf3eadcbb000d25b5814e198deae157a9badf9fb7860258c4b6b43d46;
    uint256 constant IC52y_PART1 = 0x0000000000000000000000000000000015904b1af7171cae3494787ea4a2eb8c;
    uint256 constant IC52y_PART2 = 0xb34d729f3a6e356f0b182fc21874cede2fc1510c94005b9c3e09182f830aee05;
    uint256 constant IC53x_PART1 = 0x000000000000000000000000000000000faf229df0a8cfe3357741513800211f;
    uint256 constant IC53x_PART2 = 0xe60543474fd3bdf1c0efc4d6c2497914465005afcee98e8937f01b369921e4ba;
    uint256 constant IC53y_PART1 = 0x000000000000000000000000000000001662876a3d45fb06f0fec7aa3a5f1459;
    uint256 constant IC53y_PART2 = 0x2b50bf3a8cb237eacdc857537ced2e129ee7f6b7a26c2b2ead50b9a6e3722d91;
    uint256 constant IC54x_PART1 = 0x000000000000000000000000000000000089fc0aa19967aef33657b0f528ece4;
    uint256 constant IC54x_PART2 = 0xfdf51473e94be2cc61b00d64a47e27387664b8925ec108973530870bf9e0646f;
    uint256 constant IC54y_PART1 = 0x000000000000000000000000000000001690e548a0e450e9d565662883756762;
    uint256 constant IC54y_PART2 = 0x80c1eb64d80e4d9b71da46a79da7d4ff65e7d89806afd1aee6e1279b8f06cad1;
    uint256 constant IC55x_PART1 = 0x000000000000000000000000000000000c4e70178b6111ba139f57aa232da5d5;
    uint256 constant IC55x_PART2 = 0x14a23de10f7817bfea33066878f3c45beb9cc137330ffda0cde1146268546275;
    uint256 constant IC55y_PART1 = 0x0000000000000000000000000000000002fb6d8369f46776b26cd540ebb14fa7;
    uint256 constant IC55y_PART2 = 0x0545f5694ec03f6ded4384ec0278648f42a68b395119e41c6552d8301b8a005b;
    uint256 constant IC56x_PART1 = 0x000000000000000000000000000000000642b618a83a7b82bbd177c5e56ed3a3;
    uint256 constant IC56x_PART2 = 0x3037291fb6e7af16079afb6b564c25f2b361a968e57846aa1e6b0afc233b451e;
    uint256 constant IC56y_PART1 = 0x0000000000000000000000000000000019bb04a1a3d905c904a9eb99ecf5b238;
    uint256 constant IC56y_PART2 = 0x791b4477bc7b0f4bf9135c50b67eff06682a0d1b9f645603839660f2b4c4beb3;
    uint256 constant IC57x_PART1 = 0x0000000000000000000000000000000012d7e34308140e5f6ffeeb75d15e38dd;
    uint256 constant IC57x_PART2 = 0x6a4074e3ce5c5a72013153352d7c56acb0d1ad5744b4db65787ece85e9117173;
    uint256 constant IC57y_PART1 = 0x000000000000000000000000000000000a04d1f4a609ed407919ecf30596819b;
    uint256 constant IC57y_PART2 = 0x704c7195ec89431ca72214896a06b64bf0c6d0297e1f5929517ac3a5f376ea00;
    uint256 constant IC58x_PART1 = 0x0000000000000000000000000000000011dbf45fc8d7e5ba43343fa07b267373;
    uint256 constant IC58x_PART2 = 0x87dd7aee816f9a501af5ec84286f795879ae2ede745c11dd394f8d363b35bfec;
    uint256 constant IC58y_PART1 = 0x000000000000000000000000000000000bba584633be294ad2b3cd3f18d36e00;
    uint256 constant IC58y_PART2 = 0xc17ce26618ebf50ed56d462fe68bed89894f4d26698130243b860deb80d8c8a5;
    uint256 constant IC59x_PART1 = 0x00000000000000000000000000000000026bec7013286f3e7d731500b182d324;
    uint256 constant IC59x_PART2 = 0x600a7b1ec9c9980e96c8f9678a6bd1a836183279d4483463734b146eed068b44;
    uint256 constant IC59y_PART1 = 0x0000000000000000000000000000000009edcd405fb7515acf4c7f8d37a0d03c;
    uint256 constant IC59y_PART2 = 0xad06849556933a80c30cfde82487341622a473db0c3e6fd926e8f67ae65e14ea;
    uint256 constant IC60x_PART1 = 0x000000000000000000000000000000000b169f7540e7781412c3c68f21d149ae;
    uint256 constant IC60x_PART2 = 0x4d9713a12230c2186c8466c654cf2136b75f8232a018e8c521751e049b059865;
    uint256 constant IC60y_PART1 = 0x000000000000000000000000000000001247a6de929324eb0231acf1a8f2bda1;
    uint256 constant IC60y_PART2 = 0xf37e395849dd543ddb03bf4ae661110808c41e09d53d6db91baf3dd0b58512a3;
    uint256 constant IC61x_PART1 = 0x000000000000000000000000000000000874808a45246a988741e0a711022df3;
    uint256 constant IC61x_PART2 = 0xd5683b55034e75519c12a3c0ff2b51cfefa08de2f6a70207ed1805b78afa136d;
    uint256 constant IC61y_PART1 = 0x000000000000000000000000000000000b3acab1e9cb128369215a09569b3481;
    uint256 constant IC61y_PART2 = 0xfae60e58eebd2e501f6477ec4729768ff2339c2e6f2e943470c35e6e29995b8c;
    uint256 constant IC62x_PART1 = 0x000000000000000000000000000000000b2f729c902fe4f37349fb8a8cff62b8;
    uint256 constant IC62x_PART2 = 0x4cabdd7c1f695250138580815161c61095d34d623adf584b8a0891a7a4d3785b;
    uint256 constant IC62y_PART1 = 0x0000000000000000000000000000000010a0ed8474f317aa1d1bbd484e11f6a0;
    uint256 constant IC62y_PART2 = 0xc53b9381b5e076bd1c5f8ff7667213733c277a2e761aa41d09c6ef4bcd424c5e;
    uint256 constant IC63x_PART1 = 0x00000000000000000000000000000000086538bab9b441274acbd8a2d02b5b3e;
    uint256 constant IC63x_PART2 = 0x2b675e1b8efb7704792f3aa62a4fb8332063f609948c7f5e0aa6c79d10e1fabf;
    uint256 constant IC63y_PART1 = 0x0000000000000000000000000000000003e6f04d844c551d18c5d1234a7d8e79;
    uint256 constant IC63y_PART2 = 0xe4eca8fc11de6a82ff8e2243f6d248c93b7dd0da91ecc60045d7847d93a8976b;
    uint256 constant IC64x_PART1 = 0x0000000000000000000000000000000014d3faa8ae2de74b09b5071eb8d48699;
    uint256 constant IC64x_PART2 = 0x16420128fb0d1c33b1f300ef907b2252a71b3cc8e7e7e974f4ed5eb9bff7605f;
    uint256 constant IC64y_PART1 = 0x0000000000000000000000000000000000ac3fe4186da22f242fa4938227483e;
    uint256 constant IC64y_PART2 = 0xda3af40708a9763b46e740c7e7ae7e677c08c5d577e70c113b118f3ab11ed636;
    uint256 constant IC65x_PART1 = 0x00000000000000000000000000000000024facd1bffc60606a04796809e62b31;
    uint256 constant IC65x_PART2 = 0xf09a4601fd7d994f567d5fde5016c7618be7cc0644995fc28ebe3ae5bbfa71e5;
    uint256 constant IC65y_PART1 = 0x0000000000000000000000000000000009db94144fd8d7298ca7c4f462720bcd;
    uint256 constant IC65y_PART2 = 0x4c8f9a8985de0c430de39511d492993805b9820a7abe0574c12a2411cfcaa0a7;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 512;

    uint16 constant pLastMem = 1664;

    function verifyProof(
        uint256[4] calldata _pA,
        uint256[8] calldata _pB,
        uint256[4] calldata _pC,
        uint256[65] calldata _pubSignals
    ) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, R_MOD)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
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

                g1_mulAccC(
                    _pVk, IC34x_PART1, IC34x_PART2, IC34y_PART1, IC34y_PART2, calldataload(add(pubSignals, 1056))
                )

                g1_mulAccC(
                    _pVk, IC35x_PART1, IC35x_PART2, IC35y_PART1, IC35y_PART2, calldataload(add(pubSignals, 1088))
                )

                g1_mulAccC(
                    _pVk, IC36x_PART1, IC36x_PART2, IC36y_PART1, IC36y_PART2, calldataload(add(pubSignals, 1120))
                )

                g1_mulAccC(
                    _pVk, IC37x_PART1, IC37x_PART2, IC37y_PART1, IC37y_PART2, calldataload(add(pubSignals, 1152))
                )

                g1_mulAccC(
                    _pVk, IC38x_PART1, IC38x_PART2, IC38y_PART1, IC38y_PART2, calldataload(add(pubSignals, 1184))
                )

                g1_mulAccC(
                    _pVk, IC39x_PART1, IC39x_PART2, IC39y_PART1, IC39y_PART2, calldataload(add(pubSignals, 1216))
                )

                g1_mulAccC(
                    _pVk, IC40x_PART1, IC40x_PART2, IC40y_PART1, IC40y_PART2, calldataload(add(pubSignals, 1248))
                )

                g1_mulAccC(
                    _pVk, IC41x_PART1, IC41x_PART2, IC41y_PART1, IC41y_PART2, calldataload(add(pubSignals, 1280))
                )

                g1_mulAccC(
                    _pVk, IC42x_PART1, IC42x_PART2, IC42y_PART1, IC42y_PART2, calldataload(add(pubSignals, 1312))
                )

                g1_mulAccC(
                    _pVk, IC43x_PART1, IC43x_PART2, IC43y_PART1, IC43y_PART2, calldataload(add(pubSignals, 1344))
                )

                g1_mulAccC(
                    _pVk, IC44x_PART1, IC44x_PART2, IC44y_PART1, IC44y_PART2, calldataload(add(pubSignals, 1376))
                )

                g1_mulAccC(
                    _pVk, IC45x_PART1, IC45x_PART2, IC45y_PART1, IC45y_PART2, calldataload(add(pubSignals, 1408))
                )

                g1_mulAccC(
                    _pVk, IC46x_PART1, IC46x_PART2, IC46y_PART1, IC46y_PART2, calldataload(add(pubSignals, 1440))
                )

                g1_mulAccC(
                    _pVk, IC47x_PART1, IC47x_PART2, IC47y_PART1, IC47y_PART2, calldataload(add(pubSignals, 1472))
                )

                g1_mulAccC(
                    _pVk, IC48x_PART1, IC48x_PART2, IC48y_PART1, IC48y_PART2, calldataload(add(pubSignals, 1504))
                )

                g1_mulAccC(
                    _pVk, IC49x_PART1, IC49x_PART2, IC49y_PART1, IC49y_PART2, calldataload(add(pubSignals, 1536))
                )

                g1_mulAccC(
                    _pVk, IC50x_PART1, IC50x_PART2, IC50y_PART1, IC50y_PART2, calldataload(add(pubSignals, 1568))
                )

                g1_mulAccC(
                    _pVk, IC51x_PART1, IC51x_PART2, IC51y_PART1, IC51y_PART2, calldataload(add(pubSignals, 1600))
                )

                g1_mulAccC(
                    _pVk, IC52x_PART1, IC52x_PART2, IC52y_PART1, IC52y_PART2, calldataload(add(pubSignals, 1632))
                )

                g1_mulAccC(
                    _pVk, IC53x_PART1, IC53x_PART2, IC53y_PART1, IC53y_PART2, calldataload(add(pubSignals, 1664))
                )

                g1_mulAccC(
                    _pVk, IC54x_PART1, IC54x_PART2, IC54y_PART1, IC54y_PART2, calldataload(add(pubSignals, 1696))
                )

                g1_mulAccC(
                    _pVk, IC55x_PART1, IC55x_PART2, IC55y_PART1, IC55y_PART2, calldataload(add(pubSignals, 1728))
                )

                g1_mulAccC(
                    _pVk, IC56x_PART1, IC56x_PART2, IC56y_PART1, IC56y_PART2, calldataload(add(pubSignals, 1760))
                )

                g1_mulAccC(
                    _pVk, IC57x_PART1, IC57x_PART2, IC57y_PART1, IC57y_PART2, calldataload(add(pubSignals, 1792))
                )

                g1_mulAccC(
                    _pVk, IC58x_PART1, IC58x_PART2, IC58y_PART1, IC58y_PART2, calldataload(add(pubSignals, 1824))
                )

                g1_mulAccC(
                    _pVk, IC59x_PART1, IC59x_PART2, IC59y_PART1, IC59y_PART2, calldataload(add(pubSignals, 1856))
                )

                g1_mulAccC(
                    _pVk, IC60x_PART1, IC60x_PART2, IC60y_PART1, IC60y_PART2, calldataload(add(pubSignals, 1888))
                )

                g1_mulAccC(
                    _pVk, IC61x_PART1, IC61x_PART2, IC61y_PART1, IC61y_PART2, calldataload(add(pubSignals, 1920))
                )

                g1_mulAccC(
                    _pVk, IC62x_PART1, IC62x_PART2, IC62y_PART1, IC62y_PART2, calldataload(add(pubSignals, 1952))
                )

                g1_mulAccC(
                    _pVk, IC63x_PART1, IC63x_PART2, IC63y_PART1, IC63y_PART2, calldataload(add(pubSignals, 1984))
                )

                g1_mulAccC(
                    _pVk, IC64x_PART1, IC64x_PART2, IC64y_PART1, IC64y_PART2, calldataload(add(pubSignals, 2016))
                )

                g1_mulAccC(
                    _pVk, IC65x_PART1, IC65x_PART2, IC65y_PART1, IC65y_PART2, calldataload(add(pubSignals, 2048))
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

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
