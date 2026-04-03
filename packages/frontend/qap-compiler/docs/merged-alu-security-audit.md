# Merged ALU Security Audit

> Status update: Revalidated against the repository state on April 4, 2026. The three original merged-wrapper findings in this document are now resolved. A follow-up review also identified additional live vulnerabilities that are recorded below.

## Scope

This report audits the merged arithmetic circuits introduced by the two-circuit ALU consolidation.
It preserves the original audit conclusions, even though some findings were fixed after the audit.
- Audited wrappers:
  - [subcircuits/circom/ALU1_circuit.circom](../subcircuits/circom/ALU1_circuit.circom)
  - [subcircuits/circom/ALU2_circuit.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/subcircuits/circom/ALU2_circuit.circom)
- Audited templates:
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

At audit time, the merged `ALU2` introduced a real regression for the shift and byte family:

- `SIGNEXTEND`
- `BYTE`
- `SHL`
- `SHR`
- `SAR`

In the pre-merge design, the wrappers for `ALU3` and `ALU5` enforced `in1[1] === 0`, ensuring that the shift amount or byte index was canonical and only occupied the low limb. In the merged `ALU2`, that wrapper-level constraint no longer exists. The merged template only reads `in1[0]` for these operations, so different public inputs with different `in1[1]` values are now accepted as the same statement.

That issue was security-relevant at audit time. It has since been remediated in the current repository state.

The audit also found two broader canonicalization concerns:

- selector canonicalization was incomplete
- direct limb-range safety depended on wrapper-level enforcement

Those two merged-wrapper concerns have also been remediated in the current repository state.

However, the follow-up review identified additional live vulnerabilities:

- `DIV` and `SDIV` can still return an unconstrained quotient when the divisor is zero
- `SHR` and `SAR` can still return unconstrained outputs when `shift >= 256`
- selector canonicalization remains incomplete in several standalone ALU templates outside the merged wrappers reviewed here
- several 255-bit hash, Merkle, and Jubjub templates still accept non-canonical limb encodings

## Detailed Findings

### Finding 1: Missing high-limb constraint for shift and byte family inputs

Severity: High

Current status: Resolved

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

#### Current status revalidation

This issue is now fixed in the merged path.

The current `ALU_based_on_div()` template gates the high limb of `in1` for the byte and shift families:

- `is_index_family <== is_byte_family + is_shift_family`
- `in1[1] * is_index_family === 0`

Relevant code:

- [`templates/256bit/alu_safe.circom`](../templates/256bit/alu_safe.circom)

This restores the missing canonicalization constraint for `SIGNEXTEND`, `BYTE`, `SHL`, `SHR`, and `SAR` in the merged ALU path.

### Finding 2: Selector canonicalization remains incomplete

Severity: Medium

Current status: Resolved for the merged wrappers originally audited

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

#### Current status revalidation

For the merged wrappers originally audited, selector canonicalization is now enforced.

The current `ALU1` wrapper constrains the full selector weight to exactly one after bit-decomposition:

- [`subcircuits/circom/ALU1_circuit.circom`](../subcircuits/circom/ALU1_circuit.circom)

The current merged division-based wrapper path also enforces the same selector-weight rule inside `ALU_based_on_div()`:

- [`templates/256bit/alu_safe.circom`](../templates/256bit/alu_safe.circom)

This resolves the original merged-wrapper selector issue. A different selector-canonicalization gap still exists in several standalone templates and is documented below as a new finding.

### Finding 3: Limb range safety still depends on external wiring

Severity: Medium

Current status: Resolved for the merged wrappers originally audited

The merged templates continue to omit direct input bus range checks:

- [templates/256bit/alu_safe.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/templates/256bit/alu_safe.circom#L661)

The same assumption existed before the merge. This is therefore not a regression. However, at audit time it remained a trust boundary:

- If upstream circuits always constrain each limb to 128 bits, the design is consistent.
- If that assumption is violated anywhere, several `unsafe` arithmetic templates can be fed malformed non-canonical limbs.

This was a residual security dependency, not a newly introduced bug. The current repository state hardens the merged `ALU1` and `ALU2` wrappers with direct input-bound enforcement.

#### Current status revalidation

This concern is now resolved for the merged wrappers reviewed in this report:

- The current `ALU2` wrapper applies `CheckBus()` directly to `in1`, `in2`, and `in3`.
- The current `ALU1` wrapper bit-decomposes every input limb with `Num2Bits(128)`, which also enforces the 128-bit limb bound.

Relevant code:

- [`subcircuits/circom/ALU1_circuit.circom`](../subcircuits/circom/ALU1_circuit.circom)
- [`subcircuits/circom/ALU2_circuit.circom`](../subcircuits/circom/ALU2_circuit.circom)

The underlying `unsafe` arithmetic templates still rely on correct callers, but the merged wrappers covered by this document no longer expose the original bus-canonicalization gap.

## Additional Findings From Follow-up Review

### Finding 4: `DIV` and `SDIV` still admit an arbitrary quotient when the divisor is zero

Severity: Critical

Current status: Active

`Div256_unsafe()` zeroes the remainder in the `in2 == 0` branch but does not constrain the quotient in the same branch. Because the arithmetic check only enforces:

- `q * in2 + r_temp == in1`

when `in2 == 0`, the quotient term vanishes and the internal remainder witness can absorb the full numerator. The public output remainder is later masked to zero, but the quotient witness is still left unconstrained.

Relevant code:

- `r <== Mux256()(is_zero_denom, [0, 0], r_temp)` in [`templates/256bit/arithmetic_unsafe_type2.circom`](../templates/256bit/arithmetic_unsafe_type2.circom)
- `outs[ind] <== div.q` for opcode `0x04`
- `outs[ind] <== q` for opcode `0x05`
- [`templates/256bit/alu_safe.circom`](../templates/256bit/alu_safe.circom)

Security impact:

- `DIV` can produce a forged non-zero output when the divisor is zero
- `SDIV` can produce a forged non-zero output when the divisor is zero

This is a live soundness issue in the merged division-based ALU path.

### Finding 5: `SHR` and `SAR` still admit unconstrained outputs when `shift >= 256`

Severity: High

Current status: Active

`FindShiftingTwosPower256()` maps shifts greater than `255` to a zero divisor. The merged shift-family path then reuses `Div256_unsafe()` as the right-shift primitive. This recreates the same unconstrained-quotient problem as zero-divisor division.

Relevant code:

- [`templates/256bit/arithmetic_safe.circom`](../templates/256bit/arithmetic_safe.circom)
- [`templates/256bit/arithmetic_unsafe_type2.circom`](../templates/256bit/arithmetic_unsafe_type2.circom)
- [`templates/256bit/alu_safe.circom`](../templates/256bit/alu_safe.circom)

Security impact:

- `SHR(x, shift >= 256)` should be `0`, but the circuit does not enforce that result
- `SAR(x, shift >= 256)` should saturate by sign, but the circuit builds on the same unconstrained right-shift witness

This is a live semantic and soundness issue in the merged division-based ALU path.

### Finding 6: Selector canonicalization remains incomplete in several standalone ALU templates

Severity: Medium

Current status: Active

The original merged-wrapper selector issue is fixed, but several standalone templates still bit-decompose `selector` without enforcing that exactly one opcode bit is set:

- `ALU3`
- `ALU4`
- `ALU5`
- `ALU_basic`
- `ALU_bitwise`

These templates rely on subset mux constraints only. A prover can set the intended opcode bit together with unrelated extra bits and still satisfy the selected subcircuit.

Relevant code:

- [`templates/256bit/alu_safe.circom`](../templates/256bit/alu_safe.circom)
- [`templates/256bit/mux.circom`](../templates/256bit/mux.circom)
- [`templates/128bit/mux.circom`](../templates/128bit/mux.circom)

Security impact:

- the proof statement is not fully canonical for those standalone templates
- public selector values can encode more than one opcode bit while still proving the same computation

This is distinct from the original merged-wrapper finding because the live issue is now limited to these standalone template entry points.

### Finding 7: Several 255-bit templates accept non-canonical limb encodings

Severity: Medium

Current status: Active

The 255-bit Poseidon, Merkle, and Jubjub templates recombine two 128-bit limbs directly into a field element but do not enforce canonical 255-bit encoding or `< Fr` bounds for external limb inputs.

Affected templates:

- [`templates/255bit/poseidon.circom`](../templates/255bit/poseidon.circom)
- [`templates/255bit/merkleTree.circom`](../templates/255bit/merkleTree.circom)
- [`templates/255bit/jubjub.circom`](../templates/255bit/jubjub.circom)

Security impact:

- different limb pairs that are congruent modulo the field can be accepted as the same Poseidon input
- the same concern propagates into Merkle proof verification and Jubjub-based constructions
- public statements that are expected to bind split limbs uniquely are not fully canonical at the circuit boundary

This issue was identified during the broader template review and was not part of the original merged-ALU audit scope.

## Operation-by-Operation Comparison

### Preserved without identified regression

This section preserves the original merge-comparison conclusion only. It does not override the live follow-up findings above for zero-divisor handling, oversized shifts, or non-canonical statement encoding.

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

### Preserved internally but weakened at the wrapper boundary at audit time

- `SIGNEXTEND`
- `BYTE`
- `SHL`
- `SHR`
- `SAR`

The arithmetic inside the merged template was preserved, but the pre-merge wrapper constraint `in1[1] === 0` was not enforced at the time of the original audit. That specific wrapper-boundary issue has since been fixed, as described in Finding 1.

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

Fix the live division and shift-family soundness bugs:

- force `q = 0` when `Div256_unsafe()` is called with a zero divisor, or mask the quotient to zero in every caller that exposes EVM `DIV` and `SDIV`
- make `ShiftRight256_unsafe()` return the EVM-defined result explicitly when `shift >= 256`
- ensure `SAR` derives its saturated output from a constrained branch for `shift >= 256`

These should be treated as higher priority than the already-resolved canonicalization findings above.

### Recommended follow-up hardening

Complete selector canonicalization for all standalone ALU entry points that still rely only on subset mux constraints.

Also add canonical limb-range checks for 255-bit field-facing inputs in the Poseidon, Merkle, and Jubjub templates when those split limbs are meant to be uniquely bound by the public statement.

### Test coverage improvements

Add negative tests for:

- zero-divisor `DIV` and `SDIV`, asserting that the quotient is forced to zero
- `SHR` with `shift >= 256`, asserting that the result is zero
- `SAR` with `shift >= 256`, asserting that the result saturates by sign
- selectors that include a valid opcode bit plus one or more unsupported bits on the standalone ALU templates
- non-canonical split-limb encodings for 255-bit Poseidon, Merkle, and Jubjub inputs

The older negative tests for non-zero `in1[1]` on the shift and byte family remain useful as regression tests for the issue that has already been fixed.

## Final Assessment

The original merged-wrapper findings in this report are resolved in the current repository state.

However, the follow-up review shows that the merged division-based ALU path still has live soundness bugs around zero-divisor and oversized-shift handling, and the broader template library still contains canonicalization gaps outside the original merged-wrapper scope.
