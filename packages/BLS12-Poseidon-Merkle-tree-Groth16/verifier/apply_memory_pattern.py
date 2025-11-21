#!/usr/bin/env python3

import re

def apply_memory_pattern():
    with open('src/Groth16Verifier64Leaves.sol', 'r') as f:
        content = f.read()
    
    # Extract all IC constants and their values
    ic_pattern = r'uint256 constant (IC\d+[xy]_PART\d) = (0x[0-9a-fA-F]+);'
    ic_matches = re.findall(ic_pattern, content)
    
    print(f"Found {len(ic_matches)} IC constants to convert")
    
    # Base memory address for IC constants (after alpha which uses 0x8000 + 0x200 + 0x040 to 0x0a0)
    base_memory = "0x8000 + 0x200 + 0x0c0"  # Start after alpha memory slots
    
    # Replace each IC constant with memory slot arithmetic
    updated_content = content
    mstore_lines = []
    
    for i, (name, value) in enumerate(ic_matches):
        # Calculate memory offset for this constant (each constant gets 0x20 bytes)
        offset = i * 0x20
        if offset == 0:
            memory_slot = base_memory
        else:
            memory_slot = f"{base_memory} + {hex(offset)}"
        
        # Replace the constant definition
        old_line = f'uint256 constant {name} = {value};'
        new_line = f'uint256 internal constant {name} = {memory_slot};'
        updated_content = updated_content.replace(old_line, new_line)
        
        # Add mstore line for the _loadVerificationKey function
        mstore_lines.append(f"            mstore({name}, {value})  // {name}")
    
    # Update the _loadVerificationKey function to include IC constants
    load_function_start = updated_content.find('function _loadVerificationKey() internal pure virtual {')
    if load_function_start != -1:
        # Find the end of the alpha mstore calls
        alpha_end = updated_content.find('mstore(alphay_PART2,', load_function_start)
        if alpha_end != -1:
            # Find the end of that line
            line_end = updated_content.find('\n', alpha_end)
            if line_end != -1:
                # Insert IC mstore calls after alpha
                ic_mstore_section = "\n            \n            // IC constants\n" + "\n".join(mstore_lines) + "\n"
                updated_content = updated_content[:line_end] + ic_mstore_section + updated_content[line_end:]
    
    # Add call to _loadVerificationKey in verifyProof function
    # Find the start of assembly block in verifyProof
    verifyproof_pos = updated_content.find('function verifyProof(')
    if verifyproof_pos != -1:
        assembly_start = updated_content.find('assembly {', verifyproof_pos)
        if assembly_start != -1:
            # Insert the load call right after assembly {
            load_call = "\n            // Load verification keys into memory\n            _loadVerificationKey()\n"
            insertion_point = updated_content.find('{', assembly_start) + 1
            # However, we need to call it before assembly, not inside assembly
            # Find the verifyProof function opening brace
            function_start = updated_content.find('{', verifyproof_pos)
            load_call_outside = "\n        _loadVerificationKey();\n"
            updated_content = updated_content[:function_start + 1] + load_call_outside + updated_content[function_start + 1:]
    
    with open('src/Groth16Verifier64Leaves.sol', 'w') as f:
        f.write(updated_content)
    
    print(f"Successfully converted {len(ic_matches)} IC constants to memory pattern")

if __name__ == "__main__":
    apply_memory_pattern()