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

def check_b_point():
    """Check B point formatting"""
    
    # Read the proof data
    with open('test/proof.json', 'r') as f:
        proof = json.load(f)
    
    print("=== Checking B Point Constants ===")
    print()
    
    # B point from proof.json
    pi_b_x0 = proof['pi_b'][0][0]  # x real part
    pi_b_x1 = proof['pi_b'][0][1]  # x imaginary part
    pi_b_y0 = proof['pi_b'][1][0]  # y real part
    pi_b_y1 = proof['pi_b'][1][1]  # y imaginary part
    
    print("Pi_B from proof.json:")
    print(f"  x0 (real): {pi_b_x0}")
    print(f"  x1 (imag): {pi_b_x1}")
    print(f"  y0 (real): {pi_b_y0}")
    print(f"  y1 (imag): {pi_b_y1}")
    print()
    
    # Convert each component
    pb_x0_part1, pb_x0_part2 = split_bls12_381_field_element(pi_b_x0)
    pb_x1_part1, pb_x1_part2 = split_bls12_381_field_element(pi_b_x1)
    pb_y0_part1, pb_y0_part2 = split_bls12_381_field_element(pi_b_y0)
    pb_y1_part1, pb_y1_part2 = split_bls12_381_field_element(pi_b_y1)
    
    print("Correct B point constants:")
    print(f"uint256 constant pB_x0_PART1 = 0x{pb_x0_part1:064x};")
    print(f"uint256 constant pB_x0_PART2 = 0x{pb_x0_part2:064x};")
    print(f"uint256 constant pB_x1_PART1 = 0x{pb_x1_part1:064x};")
    print(f"uint256 constant pB_x1_PART2 = 0x{pb_x1_part2:064x};")
    print(f"uint256 constant pB_y0_PART1 = 0x{pb_y0_part1:064x};")
    print(f"uint256 constant pB_y0_PART2 = 0x{pb_y0_part2:064x};")
    print(f"uint256 constant pB_y1_PART1 = 0x{pb_y1_part1:064x};")
    print(f"uint256 constant pB_y1_PART2 = 0x{pb_y1_part2:064x};")
    print()
    
    # Current values from test (after our fix)
    current_pb_x0_part1 = 0x0000000000000000000000000000000008b21ff4281b079ea2b36bf99999d480
    current_pb_x0_part2 = 0xa72e1ccc1f38130c686899c43d452465a49f9fc6daa41a2a1142e9171ee6a617
    current_pb_x1_part1 = 0x0000000000000000000000000000000014612fac3de54874f258b1a82e2855d6
    current_pb_x1_part2 = 0x1bc056aef408467dd31e8aae6e37864bd84ad4b71d0a08107cd4dee4b217ca71
    current_pb_y0_part1 = 0x000000000000000000000000000000001004b79154de3210656b66c0ccb3382f
    current_pb_y0_part2 = 0xebd865141035fcfd8a1088d1b739c56cac9cae783d4dc413bc6666176e48a366
    current_pb_y1_part1 = 0x000000000000000000000000000000001880c48857e7e6a2cb43bec3e93f5482
    current_pb_y1_part2 = 0xcd80fae83b5e8d450ef26b919beb326205d91639787485982d1530f0addc37f7
    
    print("Current test constants:")
    print(f"uint256 constant pB_x0_PART1 = 0x{current_pb_x0_part1:064x};")
    print(f"uint256 constant pB_x0_PART2 = 0x{current_pb_x0_part2:064x};")
    print(f"uint256 constant pB_x1_PART1 = 0x{current_pb_x1_part1:064x};")
    print(f"uint256 constant pB_x1_PART2 = 0x{current_pb_x1_part2:064x};")
    print(f"uint256 constant pB_y0_PART1 = 0x{current_pb_y0_part1:064x};")
    print(f"uint256 constant pB_y0_PART2 = 0x{current_pb_y0_part2:064x};")
    print(f"uint256 constant pB_y1_PART1 = 0x{current_pb_y1_part1:064x};")
    print(f"uint256 constant pB_y1_PART2 = 0x{current_pb_y1_part2:064x};")
    print()
    
    print("Comparison:")
    print(f"  pB_x0_PART1: {'✓' if pb_x0_part1 == current_pb_x0_part1 else '✗'}")
    print(f"  pB_x0_PART2: {'✓' if pb_x0_part2 == current_pb_x0_part2 else '✗'}")
    print(f"  pB_x1_PART1: {'✓' if pb_x1_part1 == current_pb_x1_part1 else '✗'}")
    print(f"  pB_x1_PART2: {'✓' if pb_x1_part2 == current_pb_x1_part2 else '✗'}")
    print(f"  pB_y0_PART1: {'✓' if pb_y0_part1 == current_pb_y0_part1 else '✗'}")
    print(f"  pB_y0_PART2: {'✓' if pb_y0_part2 == current_pb_y0_part2 else '✗'}")
    print(f"  pB_y1_PART1: {'✓' if pb_y1_part1 == current_pb_y1_part1 else '✗'}")
    print(f"  pB_y1_PART2: {'✓' if pb_y1_part2 == current_pb_y1_part2 else '✗'}")

if __name__ == "__main__":
    check_b_point()