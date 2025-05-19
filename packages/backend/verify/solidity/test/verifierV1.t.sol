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
        serializedProofPart1.push(0x15d0996a364ef608a6acfa21c8affe2e); // s^{(0)}(x,y)_X
        serializedProofPart1.push(0x11b1dfe55a08be270cfa04df5c78c6e9); // s^{(0)}(x,y)_Y
        serializedProofPart1.push(0x10cd1e5a30ac01bfc2ca17531d228d8f); // s^{(1)}(x,y)_X
        serializedProofPart1.push(0x0b1f1d1a8eca57fdc9a3a817b857209f); // s^{(1)}(x,y)_Y      
        serializedProofPart1.push(0x0f383df38d2190488805e23e2be07b5c); // U_X
        serializedProofPart1.push(0x018a70af75aabcf21e85602b908d7541); // U_Y       
        serializedProofPart1.push(0x08d258d35a1354eca106cb183227d83a); // V_X
        serializedProofPart1.push(0x02d4ac64b7cbd1362c359941d036b3a5); // V_Y
        serializedProofPart1.push(0x0778bab28fbcc275411640cb97a686d5); // W_X 
        serializedProofPart1.push(0x063bb0be2cb0f8c9b743bc8dd1291e6f); // W_Y
        serializedProofPart1.push(0x065e7df01eb31054ab767045ea6ca16d); // O_mid_X
        serializedProofPart1.push(0x117ada7cdaabdbd4d95e4754fa2397c0); // O_mid_Y
        serializedProofPart1.push(0x0154e4c2785174043f1a08f9cd567b51); // O_prv_X 
        serializedProofPart1.push(0x0aef573910ac0c898636127ed4cce224); // O_prv_Y
        serializedProofPart1.push(0x0f56ea3af7dec3cef3b49b365c687414); // Q_{AX}_X
        serializedProofPart1.push(0x18622fd04667a402b3f1ed69828c9edf); // Q_{AX}_Y
        serializedProofPart1.push(0x0ae790c6b34df56d325eb5a7eb0799fa); // Q_{AY}_X
        serializedProofPart1.push(0x121bb70167ea9e60a4a2a1c54f1ef416); // Q_{AY}_Y
        serializedProofPart1.push(0x04babccb9e1bea7a85e3e4a05bc834bc); // Q_{CX}_X
        serializedProofPart1.push(0x06192407ba9d719c6b9da4733fdec11d); // Q_{CX}_Y
        serializedProofPart1.push(0x031ea017aa3ce1a7089faaeefa55399f); // Q_{CY}_X
        serializedProofPart1.push(0x102171d2b4d2cc0639d92d2a24db47b5); // Q_{CY}_Y
        serializedProofPart1.push(0x00151613c911c69b6c716717d8e7ca40); // Π_{χ}_X
        serializedProofPart1.push(0x07b30e39f517efbeabf75b6e70804050); // Π_{χ}_Y
        serializedProofPart1.push(0x0075dc81ff0f288a4bc6b2b2bab2acf9); // Π_{ζ}_X
        serializedProofPart1.push(0x004f83db7bb9e480c453f92b92b7f290); // Π_{ζ}_Y
        serializedProofPart1.push(0x192b73296cacb6562101fc85c6c9a5d0); // B_X
        serializedProofPart1.push(0x0b524ae8888d3fbb4e65d63f11e6d076); // B_Y
        serializedProofPart1.push(0x0284f4e31e464dc1f58990b2dbc33f25); // R_X
        serializedProofPart1.push(0x124c56f3c156f453cec1253f41471f80); // R_Y
        serializedProofPart1.push(0x0fcce0da4cc0cb394655b563e6f8e742); // M_ζ_X
        serializedProofPart1.push(0x1060105237035fc8c99174363495b4f1); // M_ζ_Y
        serializedProofPart1.push(0x0cc754a0e377a3e9123bfe6a60f7548a); // M_χ_X
        serializedProofPart1.push(0x156a3c18138b7824f42366ba35635b64); // M_χ_Y
        serializedProofPart1.push(0x084f4d1152a35495b69553487152f497); // N_ζ_X
        serializedProofPart1.push(0x124dfab3a1133f2671750e898fd409f9); // N_ζ_Y
        serializedProofPart1.push(0x0cc754a0e377a3e9123bfe6a60f7548a); // N_χ_X
        serializedProofPart1.push(0x156a3c18138b7824f42366ba35635b64); // N_χ_Y
        serializedProofPart1.push(0x176541fdc59851326046b76e24434538); // O_pub_X
        serializedProofPart1.push(0x0eac02f01cb482ae6e8d78368a2fe1c5); // O_pub_Y
        serializedProofPart1.push(0x0ea3046c60e093c1b870bdb787a3824e); // A_X
        serializedProofPart1.push(0x05cf45028692be53925d0395b03e6af0); // A_Y

        serializedProofPart2.push(0x8b60695f4ddbfab9c4096849bd78172fd068df8a3cc3b0d951b160d7ef8767bb); // s^{(0)}(x,y)_X
        serializedProofPart2.push(0x6aaebe0546bc3cbc834313a3a297af55247069d68e54230b36b92daeb2e28c8c); // s^{(0)}(x,y)_Y
        serializedProofPart2.push(0x2f4bad5c8aff464f611324e228276992e0a5d27bf4c3182784428a6702f2b6cf); // s^{(1)}(x,y)_X
        serializedProofPart2.push(0xb1724631cfe8169d410ad4bb23d1d102eb470997b2310f5c971b0e8501cd975e); // s^{(1)}(x,y)_Y
        serializedProofPart2.push(0x4449cc5958b67b51bcc7eabcde8e14486386400d54d2253b865e2d08f1216959); // U_X
        serializedProofPart2.push(0x355edd43c81bdbb744315fad1bf4c0a855ad29364939bc612cace6b876cc1abc); // U_Y
        serializedProofPart2.push(0x9d22856518440d659b39f8a2ba7f43a59f996c5a8a360cb02115a2167b647a7c); // V_X
        serializedProofPart2.push(0x3301cc669d7c2aee974ccb4411b6cad56327391adec107f5af8c2ec47453ee3e); // V_Y
        serializedProofPart2.push(0xc8bc21f15500b130db478b6360ec157acd88cd7c4facd7cecb494d71e2412e7c); // W_X
        serializedProofPart2.push(0x84092d5e88ebdd388fb5c9ed697683e4078e6e464bb9c612dda827558d9e7b05); // W_Y
        serializedProofPart2.push(0x198a128442be31baa15a052b0ee19dd80419dbcaae080f10a87c03ac08f75292); // O_mid_X
        serializedProofPart2.push(0x527f839a5615c70863b9a052c5ddb1a7a16e4ff3baa11db90e2e6a18d842d3d2); // O_mid_Y
        serializedProofPart2.push(0x16152ddae210b535bc7bd0ab20f921bc25c98bef364cd3d6752b9b97050d61ea); // O_prv_X 
        serializedProofPart2.push(0x911192c0207cc5ecfdaab142191f1047a14cc09635c402f18f8d7df3692eba2a); // O_prv_Y
        serializedProofPart2.push(0x4c6bcc75fc4abdae9d0fb83c2e06141a45453c5ae4a4f492dbdb4687c711b4cc); // Q_{AX}_X
        serializedProofPart2.push(0x36e76ac51e5b569a878aa24b0734021b3c3357be9c4425af2284376aead498bb); // Q_{AX}_Y
        serializedProofPart2.push(0x4dbdda2e7e809c4b80f2f03d509f8a403cf1edf41055e189b70c175bbbb57832); // Q_{AY}_X
        serializedProofPart2.push(0x30065f7d3b2895ec9ce4dbd25ba277c2edf41b484208711bfc8aa3fe18519920); // Q_{AY}_Y
        serializedProofPart2.push(0x1eeba218aa83b6fd23e99d6b2abe78a5a05b175d82484bf9c0a09efabdbc865f); // Q_{CX}_X
        serializedProofPart2.push(0x2718fdd5d4a9d0076772a09997a1ca76f2c1ac294072d9373ff08f56e1ebbe7d); // Q_{CX}_Y
        serializedProofPart2.push(0xdb85a6c40671d84d3641d3b169391da6f59323894bbf89523f83d146a903d283); // Q_{CY}_X
        serializedProofPart2.push(0xb672c775e313d17bb783dd44541d0419e5d70e206e6d91a996072ac2f6dc3cdd); // Q_{CY}_Y
        serializedProofPart2.push(0xa1c5831de660e77d5a4443ddecfa4b5604057efacf1cce909f02ef2a947bc80f); // Π_{χ}_X
        serializedProofPart2.push(0xd33e144446890028255ffe3dc1cd616a3e4324b02e0b7fe2d7b19e332ab22bc9); // Π_{χ}_Y
        serializedProofPart2.push(0x7d1fffde283b9348daa3fb67f6c97f17c9a9f338a7821ca314aa72332f596d6c); // Π_{ζ}_X
        serializedProofPart2.push(0xfb20be9c4347937dfce7ba65f5fe96556340a7fe40a2703521b429b2e38079f0); // Π_{ζ}_Y
        serializedProofPart2.push(0x7dfb47eebb4a3b6bd1f955dc88b364ca6e1b431d51a53279f937dd995fe70e63); // B_X
        serializedProofPart2.push(0x32b9dbee0a730b04d3ae481f0dc52f936ca990905adf18a2e52b8781882f5a42); // B_Y
        serializedProofPart2.push(0x46e9d1c70d8bd250984427ebebd044743147364a8b8b9d63da54fdfa3c9ff2c8); // R_X
        serializedProofPart2.push(0xb96fc46cc938152b0859e4055a2473ebd1e9c8d637fe50dfd925b802b704bd1e); // R_Y
        serializedProofPart2.push(0x4bf09af4ea25d5f68763a4cc3cc61ca51f3a71c1efddb83b57d0c74933dc381e); // M_ζ_X
        serializedProofPart2.push(0x3198d013ed8ccc0d7d0f66ff5b68a7803eae76c35c9b79656dd12d57e97b6265); // M_ζ_Y
        serializedProofPart2.push(0x518ff9782ddc612660c69f1a5c5efe0dedf8ada10063942b36ce90df0c57867f); // M_χ_X
        serializedProofPart2.push(0xda30fe26ccfdb7da32374844613795b2c5e47c75118a1514ada89ba6d7027f11); // M_χ_Y
        serializedProofPart2.push(0xec87b2dba6841f5bd48bafdd8bb29fac1f2ac4c2e4383cc4076f70108c5bcb72); // N_ζ_X
        serializedProofPart2.push(0xf753cdb127b0c893fbd28a809d45e99258f4ca0200b77e8698be79433cd82347); // N_ζ_Y
        serializedProofPart2.push(0x518ff9782ddc612660c69f1a5c5efe0dedf8ada10063942b36ce90df0c57867f); // N_χ_X
        serializedProofPart2.push(0xda30fe26ccfdb7da32374844613795b2c5e47c75118a1514ada89ba6d7027f11); // N_χ_Y
        serializedProofPart2.push(0x43d4af44615621696ec499e126229a7a791e329806452ce52b670476012a3521); // O_pub_X
        serializedProofPart2.push(0xe3bbd5f3c2a8d25f879e819c1a304a74aec0d510e67d9b6227997b0053eddc46); // O_pub_Y
        serializedProofPart2.push(0x92f138e9d50d4057ede29ca5cbe9ac6e05605c99b254678aac13e2547bb58f59); // A_X
        serializedProofPart2.push(0xa65f4920c6e1e6e8f5c07f46fa4bdaca05f76dbce65e2cad2258f3fd890aeafc); // A_Y

        // evaluations
        serializedProofPart2.push(0x0a08cbe44f00cad03075f35d6ac534b2022d725d8c3d305ba90645cfd2e31e83); // R1XY
        serializedProofPart2.push(0x6efab1ba80a6afd0303f2e66610e2b651a9fb6ffc2292a3396577bf0e0bb0e63); // R2XY
        serializedProofPart2.push(0x5878954725ad69506f803beb313ef01885201e9868fbebf6535639b6457bdb80); // R3XY
        serializedProofPart2.push(0x7387ca7ac5d673812a2d2795d3d5169f797a549a9eb8976c0857dda619e0e336); // VXY


        /*
        theta0 = 0x111d98afa617ce701ef344da9c435ffcbc2b0d4bd6217351b72a1d050d124248
        theta1 = 0x04bfd973676b6cd33ae03076adf0bbb3d9db56558a40f7bedfd52d43632c5682
        theta2 = 0x19346fcc9412a7c4f18b704204e5591c559551cb9fc13f6b1be7460a76429611
        kappa0 = 0x082032fcb48c671f154219048d7bb3a3e702d170c2d77e6fbba50325586c8e0f
        chi = 0x0454f739d72daae8da5c74d29b68950970bd6e9bedd99f28eb9ed4b05a8a1c86
        zeta = 0x1ecbbe4cdb2544794eaf9072f44160ae08351dec982c69ba16bcd232f23d0964
        kappa1 = 0x0f4ce6f79f625321a3da60431ed7598a868f21c7bcc0c62cba2a824c6fcca5bd
        kappa2 = 0x1f86041c6865438cc42a126e8b75ce8afa0d5a6928d3a5909a49aedec052fdc5
        */
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
