// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {VerifierV1} from "../src/VerifierV1.sol";
import "forge-std/console.sol";

contract testTokamakVerifier is Test {
    VerifierV1 verifier;

    uint128[] public serializedProofPart1;
    uint256[] public serializedProofPart2;
    

    function setUp() public virtual {
        verifier = new VerifierV1();
        
        // proof
        serializedProofPart1.push(0x19cb86f514f2fde686f60acd3b551422); // s^{(0)}(x,y)_X
        serializedProofPart1.push(0x12d1acda6424a78addd86a7fbfe62c63); // s^{(0)}(x,y)_Y
        serializedProofPart1.push(0x055902aaf869e65761db047a31680785); // s^{(1)}(x,y)_X
        serializedProofPart1.push(0x05ea9a6a8818d4183ddafce487d3018a); // s^{(1)}(x,y)_Y      
        serializedProofPart1.push(0x0b47e7df0150d7b49644d0e5e684993d); // U_X
        serializedProofPart1.push(0x0acd1fd5fdfb5d3371adc0203f44aa57); // U_Y       
        serializedProofPart1.push(0x113177ace381ac1e22c1f5a285d47553); // V_X
        serializedProofPart1.push(0x0fa8c346dda6637289f16283059fd4ee); // V_Y
        serializedProofPart1.push(0x021e195f146578d529760bbe81c274fa); // W_X 
        serializedProofPart1.push(0x1063c6f3d71f2ef73103525dd5da35d3); // W_Y
        serializedProofPart1.push(0x0a46b75bc00b4037fee6c25da2e32c65); // O_mid_X
        serializedProofPart1.push(0x07d3537fbd2b309e7adbfa1ffcf12611); // O_mid_Y
        serializedProofPart1.push(0x0c06eb6d41adc7b256bafceb21ce7d11); // O_prv_X 
        serializedProofPart1.push(0x0085913e7d57a9da4bf6b6e4d3967394); // O_prv_Y
        serializedProofPart1.push(0x07daee21859e967ac82f3f08031969d2); // Q_{AX}_X
        serializedProofPart1.push(0x09a2668a0fcce763d8f1679589ebf194); // Q_{AX}_Y
        serializedProofPart1.push(0x0670efcb065b0f35d5c40e6b23c946b1); // Q_{AY}_X
        serializedProofPart1.push(0x127ed434d31177660e25c49af1ce6c0e); // Q_{AY}_Y
        serializedProofPart1.push(0x09d1863deb2de5a02a0524b05b52cc43); // Q_{CX}_X
        serializedProofPart1.push(0x0c63d028086615e1ee59d4d7e5a6ebb0); // Q_{CX}_Y
        serializedProofPart1.push(0x0cbb1ad443b2de0e9561d1105e2a35c1); // Q_{CY}_X
        serializedProofPart1.push(0x027c7648f836042af611d0168b266676); // Q_{CY}_Y
        serializedProofPart1.push(0x04e2dbecc35d3751a6bf22df51fbbee3); // Π_{A,χ}_X
        serializedProofPart1.push(0x13ea45e26a302d6ca9f6ff7dc1609579); // Π_{A,χ}_Y
        serializedProofPart1.push(0x19b5a0205a481211e59ce4168982a231); // Π_{A,ζ}_X
        serializedProofPart1.push(0x05f46d93249e61b1a8d0e27597af486a); // Π_{A,ζ}_Y
        serializedProofPart1.push(0x0264e39577655e66a1fbe5625c5ff1a2); // Π_{B,χ}_X
        serializedProofPart1.push(0x11cf80ce8c22e04b5602dbc25195ee31); // Π_{B,χ}_Y
        serializedProofPart1.push(0x0b0218bdc2296ad1f6ffac9ad6bdc47b); // Π_{C,χ}_X
        serializedProofPart1.push(0x0efa8a2f999b2f55a9fd1d586fd75ccb); // Π_{C,χ}_Y
        serializedProofPart1.push(0x098071990b93a9833287183579133920); // Π_{C,ζ}_X
        serializedProofPart1.push(0x15af3aa34c66fd0708c5a80a255291d0); // Π_{C,ζ}_Y
        serializedProofPart1.push(0x12ca52011c5c5908260f2b94fd0614e6); // B_X
        serializedProofPart1.push(0x1250cd7feb080b395cb7c6015a6ec627); // B_Y
        serializedProofPart1.push(0x0d25a3274dad19f4b44989cf5d1760dc); // R_X
        serializedProofPart1.push(0x13a136d57b9b5e083c11500333522006); // R_Y
        serializedProofPart1.push(0x17bafdb0a282df520eb3be5708959cfe); // M_ζ_X
        serializedProofPart1.push(0x01da90fbc4a2be46d6dd6c170ee040bf); // M_ζ_Y
        serializedProofPart1.push(0x0a0e03447f742c928e86a717e01fb810); // M_χ_X
        serializedProofPart1.push(0x05540bd752e9bff5bd311049a3f13005); // M_χ_Y
        serializedProofPart1.push(0x0c0cb172408986178758009685497494); // N_ζ_X
        serializedProofPart1.push(0x13be0582a4342d549deca26b0d9747cc); // N_ζ_Y
        serializedProofPart1.push(0x0a0e03447f742c928e86a717e01fb810); // N_χ_X
        serializedProofPart1.push(0x05540bd752e9bff5bd311049a3f13005); // N_χ_Y
        serializedProofPart1.push(0x0a2b173db5c499ee9172f91932767ef6); // O_pub_X
        serializedProofPart1.push(0x117aec668cae3ebe22d29cb462a3fbe1); // O_pub_Y
        serializedProofPart1.push(0x0e6b10b587809bda06d126100b31fb2b); // A_X
        serializedProofPart1.push(0x18bbd6d11d88ae08427b4686339b6fa5); // A_Y

        serializedProofPart2.push(0x1688dfaa9978cbdbb303131fa484d2e94f885abbc9a15a5dc3322b20b28f1d08); // s^{(0)}(x,y)_X
        serializedProofPart2.push(0x3ecd2493b753a0e19fb36306b21f8e9ac2408048e43d0fc44379cea5cd886ac2); // s^{(0)}(x,y)_Y
        serializedProofPart2.push(0x620d663a0a84eb4ef9a2294ec320a1b6fc97378b7cbbedb543b7880fff07f3ef); // s^{(1)}(x,y)_X
        serializedProofPart2.push(0x872e87ee2c1cedbff437e0277193b980731766ddd75bb1419a50da6ba0416f8a); // s^{(1)}(x,y)_Y
        serializedProofPart2.push(0xf27473782b007b49f63f2e58c77856c83aa5d0a708a670c7523cb8b6efc6e9f9); // U_X
        serializedProofPart2.push(0xb31e37856946ec55fdd53c4ae6cfd659d05db44aad85010153e97c9abf21b06d); // U_Y
        serializedProofPart2.push(0x3e115a450bfbd8929cbc0f626bad4c2e2cdef63e3310cacfedd80c77c0dd3565); // V_X
        serializedProofPart2.push(0x4bbca12dc4fa892c6f6600e40edf7a246f432d3d98a6c65ce956e6266980a269); // V_Y
        serializedProofPart2.push(0x78b4f30846d52686a6b3f02a8b20416cb6778fdc4af4bd5f4a7dd571dc3d6e6c); // W_X
        serializedProofPart2.push(0x94705bd01200120c80be3ed1312d2ce0041b006f10f5367ad54feb71d62d6703); // W_Y
        serializedProofPart2.push(0x9446e11fa07c7f114cc2fce27cef55ae3d452790a711b48c0a4669008368d669); // O_mid_X
        serializedProofPart2.push(0xe22a3d1e8e562b0db1c73fd704036930fef06535e17e39a8788facda4bb3965c); // O_mid_Y
        serializedProofPart2.push(0xc9576c6ce4cc2e1598e9f2758d66fc55e84813a5d6515e766b58d7f9b0b588c5); // O_prv_X 
        serializedProofPart2.push(0xe15654f4036b813d973f8d2b2b79591652f20b1a417803f29187850785661bed); // O_prv_Y
        serializedProofPart2.push(0xe1723eb52728498d9cd16c7c1f90f47c2a016e731f4baa71c5dd0592a0c60d27); // Q_{AX}_X
        serializedProofPart2.push(0x90f73db7061e8c9eb4f34a6b5cf06125e55a0ae949e90ab96cfea286c8a10db3); // Q_{AX}_Y
        serializedProofPart2.push(0x78686af2ed9001da0de808e12dfd559042e9bb4cbebcc1da4a3c095bb524172e); // Q_{AY}_X
        serializedProofPart2.push(0x177996d8d63775e2f67d57cd2bcd39b229ab65932678f1dde0c4311848f7be50); // Q_{AY}_Y
        serializedProofPart2.push(0x28f1c8a6fc375a965526044d051cfbc333ac5467cebf0500c03fdcbf2af35c3d); // Q_{CX}_X
        serializedProofPart2.push(0x2d45841928f4512d3d91e36aef67c308285f208e790f20044946f5f907856779); // Q_{CX}_Y
        serializedProofPart2.push(0x04321a5bcdf0f5f7e9a8d6fbb3b6a9304132f2877264062e405892a5257b5d78); // Q_{CY}_X
        serializedProofPart2.push(0x55347f7b073f68037e35b609f4d15f00b5c9042441a7f5358692df8f85ceccf3); // Q_{CY}_Y
        serializedProofPart2.push(0x0c669857bee1aad679bad28a9395993052d8c0b3c8d2270dcb2963835ce7235c); // Π_{A,χ}_X
        serializedProofPart2.push(0x445b59e84e760cd21b48a51080853e59e57a19b169469ef884271e70fc773f2e); // Π_{A,χ}_Y
        serializedProofPart2.push(0x57486daf569339670fed2c42b61b7082caacddf67af5f10571ff655c003f699a); // Π_{A,ζ}_X
        serializedProofPart2.push(0x5455494a5fe242e735e30d730a6333e1164911a09e304cf09587d9efbcd99414); // Π_{A,ζ}_Y
        serializedProofPart2.push(0xdb576fc80ef7687756c1b41c038d3a4eed86836cd9cdb30dbea04d836b05fd4e); // Π_{B,χ}_X
        serializedProofPart2.push(0x7e4a98f436f3b76dc5be6aee2f81556abdae74ae2c00e44bb02900fa580ee3a8); // Π_{B,χ}_Y
        serializedProofPart2.push(0x8e6516d2653f02b8eab41b54117cd11380154fdd4b25453d34298775163db88c); // Π_{C,χ}_X
        serializedProofPart2.push(0x1e441a25e6e729c090168da166f448ce03d6eb66dce296820499e9dabc89482e); // Π_{C,χ}_Y
        serializedProofPart2.push(0x31786f667782b720413828e0fd28c01bd4986db653cf694acf5e680001f994d7); // Π_{C,ζ}_X
        serializedProofPart2.push(0x87ef71a71acf2d24e6007b908d828e62942ffe66b8d723ee022c2e41d4c2786a); // Π_{C,ζ}_Y
        serializedProofPart2.push(0x65d548fb4ea42088a19180969dc28290cab267dbf994ce7e19d2ab29db470bc4); // B_X
        serializedProofPart2.push(0x0b5415bad9056fa2cc879c8ca6cc5d0b651e0ac3e96ba858f581925bbca78321); // B_Y
        serializedProofPart2.push(0x55de8214b571592d2cdd3fdf6a9875d24e457932c1c53f51fea014385e4f7188); // R_X
        serializedProofPart2.push(0x204b750fefdd917174ef6533a678110d411fe35a5b3eda8c9f99508418868f35); // R_Y
        serializedProofPart2.push(0xb2accb11bae36b4564f3a1a2ee031b89397b9b7e996c8eba85ab8a7dd37d7c79); // M_ζ_X
        serializedProofPart2.push(0xfb2b63a4658fa1e5918437a84a2df919790d6210afe01e0ca8d44340660f336d); // M_ζ_Y
        serializedProofPart2.push(0x5951785d575605af59c293257e2412b1ee11649b34be4109f565b38173c269bf); // M_χ_X
        serializedProofPart2.push(0xadc16fb75580cec00f85458120d5f5c9996c2af9938f467efb67cce3b855b3e6); // M_χ_Y
        serializedProofPart2.push(0x479eef7888bd2c365a1a1a10367fb4a86266dbcad3bea173df108821f4154e1f); // N_ζ_X
        serializedProofPart2.push(0xf5069be571eba49713f0fd416483cac8052fa07d8a77abcdc42598aedd620ebf); // N_ζ_Y
        serializedProofPart2.push(0x5951785d575605af59c293257e2412b1ee11649b34be4109f565b38173c269bf); // N_χ_X
        serializedProofPart2.push(0xadc16fb75580cec00f85458120d5f5c9996c2af9938f467efb67cce3b855b3e6); // N_χ_Y
        serializedProofPart2.push(0x3ef544ed2be9ee4f6fe86353586ef3d73dd0d7d642829e2b3f6e6a0ec838ad0b); // O_pub_X
        serializedProofPart2.push(0x8dae22af4ef091641cd3d1c6e49666569944c438b4ee52f729593607d4a155bd); // O_pub_Y
        serializedProofPart2.push(0x969a47171464fd451a69151d96da45859e0f9497fa015663c5fd973ac2916427); // A_X
        serializedProofPart2.push(0x92c85cd381c20752b82282ac005a0292a0baa633d93f4fb599f0875eb12770b4); // A_Y

        // evaluations
        serializedProofPart2.push(0x05d6ecde517a556b9c6ec34d3a38473dad9ca7511f9ea7536f488657664da05a); // R1XY
        serializedProofPart2.push(0x5d5d1b2980cf1992af4d6a8e054a47fb182cf4baeaada40d81e92ed84c3261cd); // R2XY
        serializedProofPart2.push(0x1de78445e5867fb49238f01d56fc9dbcacba3c742489af23e8fcf744ec9d1e86); // R3XY
        serializedProofPart2.push(0x1513dc241890cc0f1511c9adea1bbbf1625320b455b551dd59fa12ed108e29dd); // VXY

    }

    function testVerifier() public view {
        uint256 gasBefore = gasleft();
        bytes32 result = verifier.verify(serializedProofPart1, serializedProofPart2);
        uint256 gasAfter = gasleft();
        uint256 gasUsed = gasBefore - gasAfter;
        
        console.log("Gas used:", gasUsed);
        console.logBytes32(result);
    }
}
