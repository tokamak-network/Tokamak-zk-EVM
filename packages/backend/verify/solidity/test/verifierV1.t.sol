// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {VerifierV1} from "../src/VerifierV1.sol";
import "forge-std/console.sol";

contract testTokamakVerifier is Test {
    VerifierV1 verifier;

    uint128[] public serializedProofPart1;
    uint256[] public serializedProofPart2;
    uint256[] public publicInputs;
    

    function setUp() public virtual {
        verifier = new VerifierV1();
        
        // Complete test suite proof data
        // serializedProofPart1: First 16 bytes (32 hex chars) of each coordinate
        // serializedProofPart2: Last 32 bytes (64 hex chars) of each coordinate

        // SERIALIZED PROOF PART 1 (First 16 bytes)
        serializedProofPart1.push(0x0a7522841d458f62af27437cb5244f59); // s^{(0)}(x,y)_X
        serializedProofPart1.push(0x0ce2fcf4d137e6aec9a37a551d1d0a5e); // s^{(0)}(x,y)_Y
        serializedProofPart1.push(0x02412f1fbf10874e464b79b533a49f8a); // s^{(1)}(x,y)_X
        serializedProofPart1.push(0x0b99f633381e1e8f6c8e8e8e7bdd7720); // s^{(1)}(x,y)_Y      
        serializedProofPart1.push(0x11844befc6048859163e6691de5240bd); // U_X
        serializedProofPart1.push(0x18f2009f3621bdd2e63b21dbd3a5f608); // U_Y       
        serializedProofPart1.push(0x03761eeb1a06cc4cc6eb1c36e51a15a3); // V_X
        serializedProofPart1.push(0x185fe7b4060fee9b8017c332eed51352); // V_Y
        serializedProofPart1.push(0x1101d4f194eb8f1a9ff4bff39be4fd07); // W_X 
        serializedProofPart1.push(0x1884a078d7b494ef1743d9719eda1c54); // W_Y
        serializedProofPart1.push(0x020155b34880e04e86ebee7277cfc7b0); // O_mid_X
        serializedProofPart1.push(0x0bf3323a94d4ceace86f0418f6ba41e8); // O_mid_Y
        serializedProofPart1.push(0x06b64c03e8df9d31d36a7728bba031f5); // O_prv_X 
        serializedProofPart1.push(0x036d82bf851b8e1ede44983e1a756d96); // O_prv_Y
        serializedProofPart1.push(0x188314f3bc9acab369704c5a7df5040d); // Q_{AX}_X
        serializedProofPart1.push(0x06326eb6df441c795871c71358b10ba9); // Q_{AX}_Y
        serializedProofPart1.push(0x0e2741d654689a399cc9362fb923b97d); // Q_{AY}_X
        serializedProofPart1.push(0x072d214a9b5b7ebb2059cdf5e6ea6034); // Q_{AY}_Y
        serializedProofPart1.push(0x08c66e8b65767f9010051f5c8f1f0bc9); // Q_{CX}_X
        serializedProofPart1.push(0x0f335226a9ed0987fad946dc3d6d797d); // Q_{CX}_Y
        serializedProofPart1.push(0x148a2cab790432fe858ca981c33e6722); // Q_{CY}_X
        serializedProofPart1.push(0x19c4865744ccc2b20f31400a7868b3c8); // Q_{CY}_Y
        serializedProofPart1.push(0x0bfa50ac94eeae7540b3fa9662650945); // Π_{χ}_X
        serializedProofPart1.push(0x14963375bf1bb19c758dc697cc97c002); // Π_{χ}_Y
        serializedProofPart1.push(0x150d49e3ab2a63b7709a9847f4a616d5); // Π_{ζ}_X
        serializedProofPart1.push(0x056df4b23377f7e8f3d18134e13ba44e); // Π_{ζ}_Y
        serializedProofPart1.push(0x0df5ac46da7f5456a31301bca31c7f71); // B_X
        serializedProofPart1.push(0x06224fbdff5aab4c8cb494913523300d); // B_Y
        serializedProofPart1.push(0x1222802627381f919dcbfd9e974173cc); // R_X
        serializedProofPart1.push(0x12d56e74e425eaa60c6637a488dfb44c); // R_Y
        serializedProofPart1.push(0x147b30140a3475396e4d8af5b3a70fe2); // M_ζ_X
        serializedProofPart1.push(0x19d9b7789c511ff3e0ff84b0f6c4723f); // M_ζ_Y
        serializedProofPart1.push(0x0195fb6b8d61fa0a8e101752784c42a3); // M_χ_X
        serializedProofPart1.push(0x08109b15f36060f24af20b6f95d79486); // M_χ_Y
        serializedProofPart1.push(0x0651ae695dc0988f976bcd5160ae35b3); // N_ζ_X
        serializedProofPart1.push(0x0a4030be32e87953fbb3a50a88427c74); // N_ζ_Y
        serializedProofPart1.push(0x0195fb6b8d61fa0a8e101752784c42a3); // N_χ_X
        serializedProofPart1.push(0x08109b15f36060f24af20b6f95d79486); // N_χ_Y
        serializedProofPart1.push(0x1927909bdd7428945e0cf005d56da9c6); // O_pub_X
        serializedProofPart1.push(0x05d348b8f08a05c622f6f4da9923c501); // O_pub_Y
        serializedProofPart1.push(0x0e6aabe11a92c32023ceb5c85b89b659); // A_X
        serializedProofPart1.push(0x16291dafb2d4df703cff9bfcae1d3494); // A_Y

// SERIALIZED PROOF PART 2 (Last 32 bytes)
        serializedProofPart2.push(0xae7cf86bb507cfe3a27b947941115c9ff58c2af7fb36d56dcfa52a54fe5cee36); // s^{(0)}(x,y)_X
        serializedProofPart2.push(0x6e0ceb22eaffe99a8c1a4737716d595621d0c8c5c00905c2eb5b2437fd486faf); // s^{(0)}(x,y)_Y
        serializedProofPart2.push(0x9ec2524960ce06c1189a7540763a2e17323c72866b53f9e59dfb1650fac283c4); // s^{(1)}(x,y)_X
        serializedProofPart2.push(0x16b4696f4e7a4586d339c6fd7318d1131a35499b40666cfe7830fb273d3d8459); // s^{(1)}(x,y)_Y
        serializedProofPart2.push(0x8f381a1a79cef342f99b79735c8bdcc9177baa25948e38508d36d49586c31623); // U_X
        serializedProofPart2.push(0x7e1272baccaabfd94b6900dba4b958a8edc3a76718daefcbf79ebeda6cf6719b); // U_Y
        serializedProofPart2.push(0xe699fb6eebe6db8a974ca8a45f559f487e8b4944f0e786d415077f2f743d5c32); // V_X
        serializedProofPart2.push(0x33d800f6ebd6b5f6a3ccab23961794c3856db7b2bf43e797af5a3786866433fe); // V_Y
        serializedProofPart2.push(0x3b4ced9cd9026ee7b1700ec58ec770328ac0163c536ea9fc764469a9ebf8a1fb); // W_X
        serializedProofPart2.push(0x5e2a3ce48fdf63dd0c385d8d8115e170574ca2dc1f9742e57a0541cef17167de); // W_Y
        serializedProofPart2.push(0x03564cf86115dd0a72f69cd72c1a581ea23f1aa90db8c404ef30f4856693ca19); // O_mid_X
        serializedProofPart2.push(0xbbef3b2a66f76d40c3f42f464a6bce9efb151619fb8918b55ef7d410993ef899); // O_mid_Y
        serializedProofPart2.push(0xbdeb03e80b731860c902c97c7ab47de7420c1f1257beefca1d5a9900cec51327); // O_prv_X 
        serializedProofPart2.push(0xccfa83b124018ecd1a9419815b2e651896f7fe87b66f5bd2ffb4793975e25557); // O_prv_Y
        serializedProofPart2.push(0x7870d1e4cdec2d999e971908ca56d648f56d4c418f6c42da69142815f6ff54a5); // Q_{AX}_X
        serializedProofPart2.push(0xa830afff36f44737189a243e952a54205c6e5b4fde53c1f4199b6cb7fad5d365); // Q_{AX}_Y
        serializedProofPart2.push(0x215d72829a2e7e7562c197e2ff6b9f6cffd634375ca5a98b8a97c2f363d2d720); // Q_{AY}_X
        serializedProofPart2.push(0x4a062951da3a74d7914bd5af9d3eb24e94ede7de9ff1db83874aa48f3eb2c4ad); // Q_{AY}_Y
        serializedProofPart2.push(0x558223b733c4aa49ef200ac1146ebb7c0013e9dc803b831cf0d9b9addeb723b5); // Q_{CX}_X
        serializedProofPart2.push(0xdf5ab7964638d58e822c36ecc4edd602dc1c6462c38ce4c849109ed110f34255); // Q_{CX}_Y
        serializedProofPart2.push(0xecfb3de5cc53a2db08055e816a8620cc04731a177dc31551cebe52e272f913e1); // Q_{CY}_X
        serializedProofPart2.push(0x5a8e1687dfb1c0365ae82ccb13e77d44f617fc89465033d27dadc9cb0611fb80); // Q_{CY}_Y
        serializedProofPart2.push(0x6d2c7e2d6a1aebee3ccaa7c8a9ee5f00903dffaec7f3e53480b4a3d16eeb5ed9); // Pi_X_X
        serializedProofPart2.push(0xd3fa2bdc26344d0ddc367c9842fda51cc36e853fe3fd569e6b7b82cea56fc0f2); // Pi_X_Y
        serializedProofPart2.push(0x6ad463a886bd2414604595aaf05c1c5bc5a724a3a6d23c2c5820a414acf7d545); // Pi_Y_X
        serializedProofPart2.push(0xb701dfe4ae3e6014bf3a618526101f36ec5d2b712f880aa77c08c5bbb158dcae); // Pi_Y_Y
        serializedProofPart2.push(0x7d2ce31f572429dca490fa2fa5d70d796a96e31fba41e42a412dbddbcb3fb3d9); // B_X
        serializedProofPart2.push(0x40651840a2a5d0c0b4e449911e4eb66035c0b02ca8060222aadfba2397178c44); // B_Y
        serializedProofPart2.push(0xba403ed624b1c50fc5710108e86c21a64344d91759797c65cd9f2763675586d5); // R_X
        serializedProofPart2.push(0x56825343fe4e3692a7edd6f243500c2cf033dfdc7ce831c1f124d4be42cd771b); // R_Y
        serializedProofPart2.push(0xd351b2f6822b74447cf37dc3d5da8121040c774eb6658133b5b2147baaff51f5); // M_Y_X
        serializedProofPart2.push(0x07f5dcc6324122fcfb33c8453c89f3abaa12fd10b466d06ce7e30d6f014777af); // M_Y_Y
        serializedProofPart2.push(0xf0edcdacb129dd81bd1291b2f56a2bb57f67019be823b98928603088426d5b20); // M_X_X
        serializedProofPart2.push(0x158d2245790f315248f47c1232163b923b889ae1bc71be3df444b368077cadf9); // M_X_Y
        serializedProofPart2.push(0x551c2df12590232edc31076606c9a618957ff372ef4ee56a66c54e68ad8ebc33); // N_Y_X
        serializedProofPart2.push(0xfb34b18352d5e94706c9e694f30cd3619aa20293d5ee6a9d7b23b43313c222c6); // N_Y_Y
        serializedProofPart2.push(0xf0edcdacb129dd81bd1291b2f56a2bb57f67019be823b98928603088426d5b20); // N_X_X
        serializedProofPart2.push(0x158d2245790f315248f47c1232163b923b889ae1bc71be3df444b368077cadf9); // N_X_Y
        serializedProofPart2.push(0x5c063927fb155d03861d86972a0f47cc123f4f83757f6868705f86b9f7d68505); // O_pub_X
        serializedProofPart2.push(0x95cdf0a292654462c55a5487222839ad16bcaa628b8a1b065b5052ad872ea3c6); // O_pub_Y
        serializedProofPart2.push(0x7d8141e56b71667356ea60db8e544bcd99985f127bae12a1dd9bfa2263796467); // A_X
        serializedProofPart2.push(0xf25d2e7b476aa88bf520469f519c6ecccc9019668689f2e0ca7894bc2ccad975); // A_Y

        // evaluations
        serializedProofPart2.push(0x2419edfac6e3f2978611c9154e97cfeed279b632385de5bd4fb21d2d1284e4d3); // R_eval
        serializedProofPart2.push(0x07ea803e6db9b192abf7027aac9ba0c02da8a20c32d7d39816b5e1cd3718ba78); // R_omegaX_eval
        serializedProofPart2.push(0x1c0cb23b89831997fd2b2a902b5249bb4a1bb09d4f662e4ef19bcd2be6093637); // R_omegaX_omegaY_eval
        serializedProofPart2.push(0x13653e529610a57c1b93d9b1cb85bf08779d987e82b15f390baf78a5d95c879f); // V_eval

        publicInputs.push(0x00000000000000000000000000000000392a2d1a05288b172f205541a56fc20d);
        publicInputs.push(0x00000000000000000000000000000000000000000000000000000000c2c30e79);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x00000000000000000000000000000000392a2d1a05288b172f205541a56fc20d);
        publicInputs.push(0x00000000000000000000000000000000000000000000000000000000c2c30e79);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x00000000000000000000000000000000d4ad12e56e54018313761487d2d1fee9);
        publicInputs.push(0x000000000000000000000000000000000000000000000000000000000ce8f6c9);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x00000000000000000000000000000000d4ad12e56e54018313761487d2d1fee9);
        publicInputs.push(0x000000000000000000000000000000000000000000000000000000000ce8f6c9);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x0000000000000000000000000000000020af07748adbb0932a59cfb9ad012354);
        publicInputs.push(0x00000000000000000000000000000000f903343320db59a6e85d0dbb1bc7d722);
        publicInputs.push(0x0000000000000000000000000000000020af07748adbb0932a59cfb9ad012354);
        publicInputs.push(0x00000000000000000000000000000000f903343320db59a6e85d0dbb1bc7d722);
        publicInputs.push(0x000000000000000000000000000000001f924fe321c5cf7ad7a47b57891fbcb0);
        publicInputs.push(0x0000000000000000000000000000000081f4f96b68c216b824fb32a8c09bd5a8);
        publicInputs.push(0x000000000000000000000000000000001f924fe321c5cf7ad7a47b57891fbcb0);
        publicInputs.push(0x0000000000000000000000000000000081f4f96b68c216b824fb32a8c09bd5a8);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
        publicInputs.push(0x0000000000000000000000000000000000000000000000000000000000000000);
    }
    function testVerifier() public view {
        uint256 gasBefore = gasleft();
        bytes32 result = verifier.verify(serializedProofPart1, serializedProofPart2, publicInputs);
        uint256 gasAfter = gasleft();
        uint256 gasUsed = gasBefore - gasAfter;
        
        console.log("Gas used:", gasUsed);
        console.logBytes32(result);
    }
}
