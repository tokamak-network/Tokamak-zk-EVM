# Merged ALU Security Audit

## Scope

This report audits the merged arithmetic circuits introduced by the two-circuit ALU consolidation:

- Current merged wrappers:
  - [subcircuits/circom/ALU1_circuit.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/subcircuits/circom/ALU1_circuit.circom)
  - [subcircuits/circom/ALU2_circuit.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/subcircuits/circom/ALU2_circuit.circom)
- Current merged templates:
  - [templates/256bit/alu_safe.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/templates/256bit/alu_safe.circom)

The comparison baseline is the pre-merge implementation from the parent of commit `9b5b616b`, which used separate `ALU1` through `ALU5` wrappers and standalone `AND`, `OR`, and `XOR` circuits.

The goal of this audit is to determine whether each operation in the merged ALUs preserves all relevant constraints from the pre-merge design, with special attention to constraint loss that could create soundness or security issues.

## Methodology

The audit compared the current merged circuits against the pre-merge circuit sources at three levels:

1. Wrapper-level constraints
2. Operation-specific arithmetic and comparison constraints
3. Shared selector and mux constraints

The review also included direct witness-generation reproductions against the compiled merged circuits to check whether suspicious inputs were accepted by the current implementation.

## Executive Summary

Most arithmetic constraints were preserved during the merge. The core logic for `ADD`, `MUL`, `SUB`, `LT`, `GT`, `SLT`, `SGT`, `EQ`, `ISZERO`, `NOT`, `AND`, `OR`, `XOR`, `DIV`, `MOD`, `SDIV`, `SMOD`, `ADDMOD`, and `MULMOD` is materially equivalent to the pre-merge design.

However, the merged `ALU2` introduced a real regression for the shift and byte family:

- `SIGNEXTEND`
- `BYTE`
- `SHL`
- `SHR`
- `SAR`

In the pre-merge design, the wrappers for `ALU3` and `ALU5` enforced `in1[1] === 0`, ensuring that the shift amount or byte index was canonical and only occupied the low limb. In the merged `ALU2`, that wrapper-level constraint no longer exists. The merged template only reads `in1[0]` for these operations, so different public inputs with different `in1[1]` values are now accepted as the same statement.

This is a soundness regression and should be treated as security-relevant.

The audit also found a second issue that already existed before the merge and still exists now: selectors are not fully canonicalized. Unused selector bits may be set without causing the proof to fail.

## Detailed Findings

### Finding 1: Missing high-limb constraint for shift and byte family inputs

Severity: High

#### Pre-merge behavior

Before the merge, the wrappers explicitly constrained the high limb of the shift or byte index:

- [subcircuits/circom/ALU3_circuit.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/subcircuits/circom/ALU3_circuit.circom)
- [subcircuits/circom/ALU5_circuit.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/subcircuits/circom/ALU5_circuit.circom)

The parent-of-merge versions included:

- `alu3.in1[1] === 0`
- `alu5.in1[1] === 0`

This ensured that the shift amount or byte index was represented canonically in the low limb only.

#### Current behavior

The merged wrapper [subcircuits/circom/ALU2_circuit.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/subcircuits/circom/ALU2_circuit.circom#L8) forwards both limbs of `in1` without any wrapper-level canonicalization.

Inside the merged template, only `in1[0]` is used for the shift and byte family:

- `safe_byte_minus_one <== is_byte_family * in1[0]` at [templates/256bit/alu_safe.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/templates/256bit/alu_safe.circom#L739)
- `safe_shift <== is_shift_family * in1[0]` at [templates/256bit/alu_safe.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/templates/256bit/alu_safe.circom#L769)
- `sar.shift <== safe_shift` at [templates/256bit/alu_safe.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/templates/256bit/alu_safe.circom#L799)

As a result, `in1[1]` is now an unconstrained public input for these operations.

#### Reproduction

Two separate witness-generation checks were performed against the compiled merged `ALU2` wasm:

1. `SHR` with:
   - `(in1[0], in1[1]) = (1, 0)`
   - `(in1[0], in1[1]) = (1, 123456789)`
   - Both proofs succeeded and both returned `(2, 0)`.

2. `BYTE` with:
   - `(in1[0], in1[1]) = (31, 0)`
   - `(in1[0], in1[1]) = (31, 42)`
   - Both proofs succeeded and both returned `(255, 0)`.

This confirms that the statement is no longer canonical.

#### Security impact

This allows multiple different public inputs to represent the same logical operation. If downstream logic assumes that a proven public input uniquely identifies the operation input, that assumption is now false for these opcodes.

This is the most important regression identified in the audit.

### Finding 2: Selector canonicalization remains incomplete

Severity: Medium

The merged circuits bit-decompose the full selector:

- [subcircuits/circom/ALU1_circuit.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/subcircuits/circom/ALU1_circuit.circom#L17)
- [templates/256bit/alu_safe.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/templates/256bit/alu_safe.circom#L659)

But the mux circuits only require that the selected subset sums to exactly one:

- [templates/256bit/mux.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/templates/256bit/mux.circom#L22)
- [templates/128bit/mux.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/templates/128bit/mux.circom#L9)

Unused selector bits are not forced to zero.

#### Reproduction

The merged `ALU1` accepted both:

- selector `2^1`
- selector `2^1 + 2^10`

for the same `ADD` input, and both produced the same output `(16, 0)`.

#### Security impact

This is not introduced by the merge. The older ALUs had the same issue. It is nevertheless a real non-canonicality problem and should be fixed if selector uniqueness matters to the surrounding system.

### Finding 3: Limb range safety still depends on external wiring

Severity: Medium

The merged templates continue to omit direct input bus range checks:

- [templates/256bit/alu_safe.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/templates/256bit/alu_safe.circom#L661)

The same assumption existed before the merge. This is therefore not a regression. However, it remains a trust boundary:

- If upstream circuits always constrain each limb to 128 bits, the design is consistent.
- If that assumption is violated anywhere, several `unsafe` arithmetic templates can be fed malformed non-canonical limbs.

This is a residual security dependency, not a newly introduced bug.

## Operation-by-Operation Comparison

### Preserved without identified regression

- `ADD`
- `MUL`
- `SUB`
- `LT`
- `GT`
- `SLT`
- `SGT`
- `EQ`
- `ISZERO`
- `NOT`
- `AND`
- `OR`
- `XOR`
- `DIV`
- `MOD`
- `SDIV`
- `SMOD`
- `ADDMOD`
- `MULMOD`

These operations preserve the relevant pre-merge arithmetic and comparison constraints.

### Preserved internally but weakened at the wrapper boundary

- `SIGNEXTEND`
- `BYTE`
- `SHL`
- `SHR`
- `SAR`

The arithmetic inside the merged template is still present, but the pre-merge wrapper constraint `in1[1] === 0` is no longer enforced. This weakens the statement being proven.

## Additional Notes

The merged bitwise implementation is not weaker than the old standalone `AND`, `OR`, and `XOR` circuits. The merged `ALU1` explicitly decomposes both input limbs with `Num2Bits(128)` and reconstructs outputs with `Bits2Num`, which is at least as strong as the previous standalone design.

No evidence was found that the merge removed the remainder checks for:

- division-based operations
- modulo-based operations
- byte extraction
- sign extension
- right-shift operations

Those checks still exist through the `rem < divisor` structure and the internal helper constraints.

## Recommendations

### Immediate remediation

Reintroduce canonical high-limb constraints for the shift and byte family in merged `ALU2`.

At minimum, enforce:

- `in1[1] === 0` for `SIGNEXTEND`
- `in1[1] === 0` for `BYTE`
- `in1[1] === 0` for `SHL`
- `in1[1] === 0` for `SHR`
- `in1[1] === 0` for `SAR`

This can be done either:

- in the `ALU2` wrapper, gated by selector, or
- inside `ALU_based_on_div()`, also gated by selector

### Recommended follow-up hardening

Force every unused selector bit to zero.

For example, after `Num2Bits`, explicitly constrain the sum of all unsupported opcode bits to zero.

### Test coverage improvements

Add negative tests for:

- non-zero `in1[1]` on `SIGNEXTEND`, `BYTE`, `SHL`, `SHR`, and `SAR`
- selectors that include a valid opcode bit plus one or more unsupported bits

These tests should fail once the hardening changes are in place.

## Final Assessment

The ALU merge preserved most core arithmetic constraints, but it did not preserve full statement canonicality.

The highest-priority issue is the missing `in1[1] === 0` constraint for the shift and byte family in merged `ALU2`. That is a genuine regression compared with the pre-merge circuit set and should be fixed before relying on the merged circuit for security-sensitive proving flows.
