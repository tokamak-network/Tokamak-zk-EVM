#!/usr/bin/env python3
"""
Convert decimal coordinates to BLS12-381 hexadecimal format with PART1/PART2 splitting.
Each coordinate is split into two 32-byte parts where:
- PART1 is the high part padded with 32 zeros
- PART2 is the low part
"""

import json
from typing import Tuple

def decimal_to_bls12_format(decimal_value: str) -> Tuple[str, str]:
    """
    Convert a decimal string to BLS12-381 format with PART1/PART2 splitting.
    
    Args:
        decimal_value: String representation of decimal number
        
    Returns:
        Tuple of (PART1, PART2) as hexadecimal strings
    """
    # Convert to integer
    num = int(decimal_value)
    
    # Convert to hex (remove '0x' prefix)
    hex_str = hex(num)[2:]
    
    # Pad to 96 characters (48 bytes total for BLS12-381 field element)
    hex_str = hex_str.zfill(96)
    
    # Split into high and low 32-byte parts
    # PART1: high 32 bytes (first 64 hex chars) with 32 zeros prefix
    high_part = hex_str[:32]  # First 32 characters (16 bytes)
    # PART2: low 32 bytes (last 64 hex chars)
    low_part = hex_str[32:]   # Last 64 characters (32 bytes)
    
    # PART1: pad the high part with 32 leading zeros to make 64 characters
    part1 = "0" * 32 + high_part
    # PART2: the low part should already be 64 characters
    part2 = low_part
    
    # Format as Solidity hex constants
    part1_hex = f"0x{part1}"
    part2_hex = f"0x{part2}"
    
    return part1_hex, part2_hex

def convert_verification_key():
    """Convert the verification key from JSON to Solidity constants."""
    
    # Load the verification key
    with open('/Users/mehdiberiane/Documents/tokamak/Tokamak-zk-EVM/packages/BLS12-Poseidon-Merkle-tree-Groth16/verifier/src/verification_key_64.json', 'r') as f:
        vk = json.load(f)
    
    print("// Verification Key data - split into PART1/PART2 for BLS12-381 format")
    
    # Alpha
    alpha_x = vk['vk_alpha_1'][0]
    alpha_y = vk['vk_alpha_1'][1]
    
    alphax_p1, alphax_p2 = decimal_to_bls12_format(alpha_x)
    alphay_p1, alphay_p2 = decimal_to_bls12_format(alpha_y)
    
    print(f"uint256 constant alphax_PART1 = {alphax_p1};")
    print(f"uint256 constant alphax_PART2 = {alphax_p2};")
    print(f"uint256 constant alphay_PART1 = {alphay_p1};")
    print(f"uint256 constant alphay_PART2 = {alphay_p2};")
    
    # Beta
    beta_x1 = vk['vk_beta_2'][0][1]  # x0
    beta_x2 = vk['vk_beta_2'][0][0]  # x1
    beta_y1 = vk['vk_beta_2'][1][1]  # y0
    beta_y2 = vk['vk_beta_2'][1][0]  # y1
    
    betax1_p1, betax1_p2 = decimal_to_bls12_format(beta_x1)
    betax2_p1, betax2_p2 = decimal_to_bls12_format(beta_x2)
    betay1_p1, betay1_p2 = decimal_to_bls12_format(beta_y1)
    betay2_p1, betay2_p2 = decimal_to_bls12_format(beta_y2)
    
    print(f"uint256 constant betax1_PART1 = {betax1_p1};")
    print(f"uint256 constant betax1_PART2 = {betax1_p2};")
    print(f"uint256 constant betax2_PART1 = {betax2_p1};")
    print(f"uint256 constant betax2_PART2 = {betax2_p2};")
    print(f"uint256 constant betay1_PART1 = {betay1_p1};")
    print(f"uint256 constant betay1_PART2 = {betay1_p2};")
    print(f"uint256 constant betay2_PART1 = {betay2_p1};")
    print(f"uint256 constant betay2_PART2 = {betay2_p2};")
    
    # Gamma
    gamma_x1 = vk['vk_gamma_2'][0][1]  # x0
    gamma_x2 = vk['vk_gamma_2'][0][0]  # x1
    gamma_y1 = vk['vk_gamma_2'][1][1]  # y0
    gamma_y2 = vk['vk_gamma_2'][1][0]  # y1
    
    gammax1_p1, gammax1_p2 = decimal_to_bls12_format(gamma_x1)
    gammax2_p1, gammax2_p2 = decimal_to_bls12_format(gamma_x2)
    gammay1_p1, gammay1_p2 = decimal_to_bls12_format(gamma_y1)
    gammay2_p1, gammay2_p2 = decimal_to_bls12_format(gamma_y2)
    
    print(f"uint256 constant gammax1_PART1 = {gammax1_p1};")
    print(f"uint256 constant gammax1_PART2 = {gammax1_p2};")
    print(f"uint256 constant gammax2_PART1 = {gammax2_p1};")
    print(f"uint256 constant gammax2_PART2 = {gammax2_p2};")
    print(f"uint256 constant gammay1_PART1 = {gammay1_p1};")
    print(f"uint256 constant gammay1_PART2 = {gammay1_p2};")
    print(f"uint256 constant gammay2_PART1 = {gammay2_p1};")
    print(f"uint256 constant gammay2_PART2 = {gammay2_p2};")
    
    # Delta
    delta_x1 = vk['vk_delta_2'][0][1]  # x0
    delta_x2 = vk['vk_delta_2'][0][0]  # x1
    delta_y1 = vk['vk_delta_2'][1][1]  # y0
    delta_y2 = vk['vk_delta_2'][1][0]  # y1
    
    deltax1_p1, deltax1_p2 = decimal_to_bls12_format(delta_x1)
    deltax2_p1, deltax2_p2 = decimal_to_bls12_format(delta_x2)
    deltay1_p1, deltay1_p2 = decimal_to_bls12_format(delta_y1)
    deltay2_p1, deltay2_p2 = decimal_to_bls12_format(delta_y2)
    
    print(f"uint256 constant deltax1_PART1 = {deltax1_p1};")
    print(f"uint256 constant deltax1_PART2 = {deltax1_p2};")
    print(f"uint256 constant deltax2_PART1 = {deltax2_p1};")
    print(f"uint256 constant deltax2_PART2 = {deltax2_p2};")
    print(f"uint256 constant deltay1_PART1 = {deltay1_p1};")
    print(f"uint256 constant deltay1_PART2 = {deltay1_p2};")
    print(f"uint256 constant deltay2_PART1 = {deltay2_p1};")
    print(f"uint256 constant deltay2_PART2 = {deltay2_p2};")
    
    print("\n// IC Points - split into PART1/PART2 for BLS12-381 format\n")
    
    # IC points
    for i, ic_point in enumerate(vk['IC']):
        ic_x = ic_point[0]
        ic_y = ic_point[1]
        
        icx_p1, icx_p2 = decimal_to_bls12_format(ic_x)
        icy_p1, icy_p2 = decimal_to_bls12_format(ic_y)
        
        print(f"uint256 constant IC{i}x_PART1 = {icx_p1};")
        print(f"uint256 constant IC{i}x_PART2 = {icx_p2};")
        print(f"uint256 constant IC{i}y_PART1 = {icy_p1};")
        print(f"uint256 constant IC{i}y_PART2 = {icy_p2};")
        if i == 0:
            print("//")

if __name__ == "__main__":
    convert_verification_key()