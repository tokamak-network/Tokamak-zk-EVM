#!/usr/bin/env python3

import json

def split_bls12_381_field_element(value_str):
    """Split a BLS12-381 field element (up to 48 bytes) into two parts"""
    value = int(value_str)
    hex_str = hex(value)[2:].zfill(96)  # Pad to 96 hex chars (48 bytes)
    high_part = hex_str[:32]   # First 32 hex chars = 16 bytes
    low_part = hex_str[32:]    # Last 64 hex chars = 32 bytes
    part1 = int(high_part, 16) if high_part != '0' * 32 else 0
    part2 = int(low_part, 16) if low_part != '0' * 64 else 0
    return part1, part2

def debug_g2_order():
    """Debug G2 coordinate ordering"""
    
    # Read the proof data
    with open('test/proof.json', 'r') as f:
        proof = json.load(f)
    
    print("=== G2 Point B Coordinate Analysis ===")
    print()
    
    # Raw values from proof.json
    print("Raw values from proof.json:")
    print("pi_b[0][0] (first value):", proof['pi_b'][0][0])  
    print("pi_b[0][1] (second value):", proof['pi_b'][0][1])
    print("pi_b[1][0] (third value):", proof['pi_b'][1][0])
    print("pi_b[1][1] (fourth value):", proof['pi_b'][1][1])
    print()
    
    # Current interpretation (what we're using now)
    print("Current interpretation (x0=real, x1=imag, y0=real, y1=imag):")
    x0 = proof['pi_b'][0][0]  # Assuming real part of x
    x1 = proof['pi_b'][0][1]  # Assuming imaginary part of x
    y0 = proof['pi_b'][1][0]  # Assuming real part of y
    y1 = proof['pi_b'][1][1]  # Assuming imaginary part of y
    
    print(f"  x = ({x0}, {x1})")
    print(f"  y = ({y0}, {y1})")
    print()
    
    # Alternative interpretation (swap real/imaginary parts)
    print("Alternative interpretation (x1=real, x0=imag, y1=real, y0=imag):")
    x0_alt = proof['pi_b'][0][1]  # Swap: imaginary becomes real
    x1_alt = proof['pi_b'][0][0]  # Swap: real becomes imaginary
    y0_alt = proof['pi_b'][1][1]  # Swap: imaginary becomes real  
    y1_alt = proof['pi_b'][1][0]  # Swap: real becomes imaginary
    
    print(f"  x = ({x0_alt}, {x1_alt})")
    print(f"  y = ({y0_alt}, {y1_alt})")
    print()
    
    # Convert both interpretations to split format
    print("Current interpretation (split format):")
    b_x0_p1, b_x0_p2 = split_bls12_381_field_element(x0)
    b_x1_p1, b_x1_p2 = split_bls12_381_field_element(x1)
    b_y0_p1, b_y0_p2 = split_bls12_381_field_element(y0)
    b_y1_p1, b_y1_p2 = split_bls12_381_field_element(y1)
    
    print(f"uint256 constant pB_x0_PART1 = 0x{b_x0_p1:064x};")
    print(f"uint256 constant pB_x0_PART2 = 0x{b_x0_p2:064x};")
    print(f"uint256 constant pB_x1_PART1 = 0x{b_x1_p1:064x};")
    print(f"uint256 constant pB_x1_PART2 = 0x{b_x1_p2:064x};")
    print(f"uint256 constant pB_y0_PART1 = 0x{b_y0_p1:064x};")
    print(f"uint256 constant pB_y0_PART2 = 0x{b_y0_p2:064x};")
    print(f"uint256 constant pB_y1_PART1 = 0x{b_y1_p1:064x};")
    print(f"uint256 constant pB_y1_PART2 = 0x{b_y1_p2:064x};")
    print()
    
    print("Alternative interpretation (split format):")
    b_x0_alt_p1, b_x0_alt_p2 = split_bls12_381_field_element(x0_alt)
    b_x1_alt_p1, b_x1_alt_p2 = split_bls12_381_field_element(x1_alt)
    b_y0_alt_p1, b_y0_alt_p2 = split_bls12_381_field_element(y0_alt)
    b_y1_alt_p1, b_y1_alt_p2 = split_bls12_381_field_element(y1_alt)
    
    print(f"uint256 constant pB_x0_PART1 = 0x{b_x0_alt_p1:064x};")
    print(f"uint256 constant pB_x0_PART2 = 0x{b_x0_alt_p2:064x};")
    print(f"uint256 constant pB_x1_PART1 = 0x{b_x1_alt_p1:064x};")
    print(f"uint256 constant pB_x1_PART2 = 0x{b_x1_alt_p2:064x};")
    print(f"uint256 constant pB_y0_PART1 = 0x{b_y0_alt_p1:064x};")
    print(f"uint256 constant pB_y0_PART2 = 0x{b_y0_alt_p2:064x};")
    print(f"uint256 constant pB_y1_PART1 = 0x{b_y1_alt_p1:064x};")
    print(f"uint256 constant pB_y1_PART2 = 0x{b_y1_alt_p2:064x};")

if __name__ == "__main__":
    debug_g2_order()