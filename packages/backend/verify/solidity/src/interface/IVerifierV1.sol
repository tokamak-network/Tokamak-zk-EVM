// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title The interface of the Verifier contract, responsible for the zero knowledge proof verification.
/// @author TOKAMAK project Ooo
interface IVerifierV1 {
    /// @dev Verifies a zk-SNARK proof.
    /// Note: The function may revert execution instead of returning false in some cases.
    function verify(uint256[] calldata proof, uint256[] calldata publicInputs) external view returns (bool);
}
