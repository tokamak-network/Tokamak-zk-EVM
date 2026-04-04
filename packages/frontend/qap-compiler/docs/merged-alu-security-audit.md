# Merged ALU Security Audit

> Status update: Revalidated against the repository state on April 4, 2026. The original merged-wrapper findings in this document are resolved. Under the composed-system model used by the external compiler, the fresh review identified one clear remaining external-verifier requirement and several topology-dependent contract gaps outside the original merged-ALU scope. In particular, the 255-bit split-limb canonicalization concern remains an external-verifier requirement, `JubjubExpBatch` still does not guarantee point validity on its own, and the `Accumulator` / `SubExpBatch` canonicalization observations collapse into system-level bus-well-formedness dependencies rather than standalone public-input exploits.

## Scope

This report now has two layers:

- the original merged-ALU security audit
- a fresh April 4, 2026 review of every circuit currently compiled by `scripts/compile.sh`

The fresh compile-target review was performed from code and witness behavior without using the older findings in this document as the source of truth. The older merged-ALU findings are preserved here for historical continuity, but the current-status notes have been updated to match the repository state.

The original scope was the merged arithmetic circuits introduced by the two-circuit ALU consolidation.
- Audited wrappers:
  - [subcircuits/circom/ALU1_circuit.circom](../subcircuits/circom/ALU1_circuit.circom)
  - [subcircuits/circom/ALU2_circuit.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/subcircuits/circom/ALU2_circuit.circom)
- Audited templates:
  - [templates/256bit/alu_safe.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/templates/256bit/alu_safe.circom)

The comparison baseline is the pre-merge implementation from the parent of commit `9b5b616b`, which used separate `ALU1` through `ALU5` wrappers and standalone `AND`, `OR`, and `XOR` circuits.

The added compile-target review scope is the full set of circuits currently built by [scripts/compile.sh](../scripts/compile.sh):

- `bufferPubOut`
- `bufferPubIn`
- `bufferBlockIn`
- `bufferEVMIn`
- `bufferPrvIn`
- `ALU1`
- `ALU2`
- `DecToBit`
- `SubExpBatch`
- `Accumulator`
- `Poseidon`
- `JubjubExpBatch`
- `EdDsaVerify`
- `VerifyMerkleProof`

The goal of the combined document is to preserve the merged-ALU audit history while also recording the current security posture of the compiled circuit library.

## Composition Context

The fresh review is interpreted under the following system-level assumptions supplied by the repository user:

- each circuit compiled by `scripts/compile.sh` is a subcircuit rather than a standalone proof statement
- an external compiler combines those subcircuits with other subcircuits into one independent circuit
- every `buffer*` subcircuit is used exactly once
- every `buffer*Out` input is connected to another subcircuit output
- every `buffer*In` output is connected to another subcircuit input
- for every non-buffer subcircuit, every input and every output is connected to another subcircuit input or output

This context changes how several findings should be interpreted:

- a vulnerability that only exists because a compiled artifact is standalone is not automatically a live system-level issue
- a missing local range check can become either harmless redundancy or a real system-level dependency, depending on whether some connected producer or consumer already enforces the same property
- where the exact external wiring is not part of this repository, the strongest justified conclusion is sometimes conditional rather than absolute

## Methodology

The original merged-ALU audit compared the merged circuits against the pre-merge circuit sources at three levels:

1. Wrapper-level constraints
2. Operation-specific arithmetic and comparison constraints
3. Shared selector and mux constraints

The review also included direct witness-generation reproductions against the compiled merged circuits to check whether suspicious inputs were accepted by the current implementation.

The fresh compile-target review used the current `scripts/compile.sh` target list, traced each wrapper into its transitive templates, and then re-derived findings from the live code. Where a suspected issue affected proof semantics, witness-generation checks were used to confirm that the compiled artifact accepted the problematic case.

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

However, the fresh compile-target review identified additional issues outside the original merged-wrapper audit scope.

Under the composed-system assumptions above:

- `Accumulator` and `SubExpBatch` no longer present standalone-statement attacks by themselves, but they still rely on system-level bus well-formedness along every producer path that reaches them
- `JubjubExpBatch` still does not by itself guarantee that its inputs or outputs are valid Jubjub points
- the standalone `EdDsaVerify` vacuity observation is not a live issue if the artifact is never used standalone

The 255-bit split-limb canonicalization issue remains handled as an external-verifier responsibility. That mitigation is only valid if every proof-verification wrapper rejects non-canonical split-limb inputs before passing them into the proof-verification algorithm.

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

Current status: Resolved

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

This was a live soundness issue in the merged division-based ALU path.

#### Current status revalidation

This issue is now fixed in `Div256_unsafe()`.

The current implementation explicitly constrains each quotient limb to zero when `is_zero_denom == 1`:

- `q[0] * is_zero_denom === 0`
- `q[1] * is_zero_denom === 0`

Relevant code:

- [`templates/256bit/arithmetic_unsafe_type2.circom`](../templates/256bit/arithmetic_unsafe_type2.circom)

Focused witness-generation checks against the current `ALU2` build show that `DIV` by zero now yields output `(0, 0)`.

### Finding 5: `SHR` and `SAR` still admit unconstrained outputs when `shift >= 256`

Severity: High

Current status: Resolved

`FindShiftingTwosPower256()` maps shifts greater than `255` to a zero divisor. The merged shift-family path then reuses `Div256_unsafe()` as the right-shift primitive. This recreates the same unconstrained-quotient problem as zero-divisor division.

Relevant code:

- [`templates/256bit/arithmetic_safe.circom`](../templates/256bit/arithmetic_safe.circom)
- [`templates/256bit/arithmetic_unsafe_type2.circom`](../templates/256bit/arithmetic_unsafe_type2.circom)
- [`templates/256bit/alu_safe.circom`](../templates/256bit/alu_safe.circom)

Security impact:

- `SHR(x, shift >= 256)` should be `0`, but the circuit does not enforce that result
- `SAR(x, shift >= 256)` should saturate by sign, but the circuit builds on the same unconstrained right-shift witness

This was a live semantic and soundness issue in the merged division-based ALU path.

#### Current status revalidation

This finding is resolved as originally stated because the unconstrained-output path is no longer available.

Focused witness-generation checks against the current `ALU2` build show:

- `SHR` with `shift = 256` yields `(0, 0)`
- `SAR` with `shift = 256` yields `(0, 0)` for non-negative input
- `SAR` with `shift = 256` yields `(2^128 - 1, 2^128 - 1)` for `-1`

For `shift > 255`, the current circuit rejects witness generation through the shift helper range checks instead of admitting an unconstrained output witness.

### Finding 6: Selector canonicalization remains incomplete in several standalone ALU templates

Severity: Medium

Current status: Resolved

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

This was distinct from the original merged-wrapper finding because it was limited to standalone template entry points.

#### Current status revalidation

These standalone selector gaps are now fixed in the current repository state:

- `ALU3`
- `ALU4`
- `ALU5`
- `ALU_basic`
- `ALU_bitwise`

The current templates zero unsupported selector bits before the mux stage, and the existing mux constraints still enforce a one-hot selection across the supported branch flags.

### Finding 7: Several 255-bit templates accept non-canonical limb encodings

Severity: Medium

Current status: Mitigated externally

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

Current handling decision:

- this finding is not being fixed inside the circuits because the minimum in-circuit remediation adds a large constraint cost to the affected Poseidon, Merkle, and Jubjub entry points
- instead, the deployed proof-verification wrapper is expected to reject non-canonical split-limb public inputs before invoking the proof-verification algorithm

Required external wrapper behavior:

- do not rely on simple 128-bit masking alone; masking does not eliminate encodings of the form `x + Fr`
- for every external 255-bit split-limb public input, enforce both limb-width and field-canonicality before verification
- a sufficient wrapper check is to reject unless `hi < 2^127` and `(hi, lo) < (Fr_hi, Fr_lo)` in lexicographic limb order

Residual risk:

- this finding should be considered mitigated only under the assumption that every verifier entry point applies the same canonical split-limb check
- if any consumer verifies proofs directly from raw public inputs without that wrapper, the original ambiguity remains

### Finding 8: `Accumulator` accepts non-canonical public 256-bit split-limb inputs

Severity: Medium

Current status: Conditional under composed-system wiring

`Accumulator_circuit.circom` chains `Add256_unsafe()` over public split-limb inputs but only checks the final output bus:

- [`subcircuits/circom/Accumulator_circuit.circom`](../subcircuits/circom/Accumulator_circuit.circom)

The underlying arithmetic template explicitly states that it is safe only when input and output well-formedness is guaranteed:

- [`templates/256bit/arithmetic_unsafe_type1.circom`](../templates/256bit/arithmetic_unsafe_type1.circom)

No `CheckBus()` or equivalent bit-decomposition is applied to the public input pairs before they are fed into the addition chain.

#### Reproduction

A focused witness-generation check against the compiled `Accumulator` artifact used two different public inputs:

- canonical first term `(lo, hi) = (0, 1)`
- non-canonical first term `(lo, hi) = (2^128, 0)`

with every other term set to zero. Both witnesses succeeded and both produced the same public output `(0, 1)`.

#### Security impact

- the public statement is not canonical
- different public input vectors can encode the same accumulated 256-bit value
- downstream systems that interpret each pair as a unique 256-bit split-limb integer can be misled

#### Composed-system revalidation

Under the stated system model, `Accumulator` inputs are not root public inputs of a standalone proof artifact. Each input wire is driven by some other subcircuit output.

That means the standalone reproduction above no longer translates directly into a system-level attack by itself. The issue instead becomes a bus-well-formedness dependency:

- if every producer path feeding `Accumulator` already enforces canonical 128-bit limbs, the missing local input checks are redundant rather than dangerous
- if any producer path can carry unchecked non-canonical split limbs into `Accumulator`, the same ambiguity can still propagate through the composed system

So this is not a confirmed top-level exploit from the local code alone, but it remains a real dependency that must be discharged by the external composition.

### Finding 9: `SubExpBatch` accepts non-canonical hidden 256-bit state

Severity: Medium

Current status: Conditional under composed-system wiring

`SubExpBatch_circuit.circom` forwards `c_prev` and `a_prev` directly into `subExpBatch(N)` without any bus-range checks, while the underlying arithmetic path is built from `SubExp_unsafe()`, `Mul256_unsafe()`, and `Add256_unsafe()`:

- [`subcircuits/circom/SubExpBatch_circuit.circom`](../subcircuits/circom/SubExpBatch_circuit.circom)
- [`templates/256bit/arithmetic_unsafe_type1.circom`](../templates/256bit/arithmetic_unsafe_type1.circom)

The wrapper also leaves its output bus checks commented out.

#### Reproduction

A focused witness-generation check against the compiled `SubExpBatch` artifact used the same private state except for the first `c_prev` pair:

- canonical `(lo, hi) = (0, 1)`
- non-canonical `(lo, hi) = (2^128, 0)`

Both witnesses succeeded and both produced the same public outputs `(0, 1, 1, 0)`.

#### Security impact

- the hidden 256-bit state is not canonically bound
- distinct malformed witnesses can prove the same public transition
- if downstream logic assumes that `c_prev` and `a_prev` are canonical 256-bit split-limb integers, that assumption is false in the standalone artifact

#### Composed-system revalidation

Under the stated system model, the hidden state of `SubExpBatch` is not a free-standing witness root. Its inputs and outputs are all connected elsewhere in the composed circuit.

As with `Accumulator`, this weakens the standalone exploit claim and turns the issue into a system-level dependency:

- if all producer paths into `SubExpBatch` already enforce canonical 128-bit limbs, the missing local bus checks are redundant
- if unchecked producer paths can drive `SubExpBatch`, the ambiguity can still persist inside the composed witness

This finding therefore remains relevant as a composition requirement, but it is not by itself a proof that the final top-level circuit is vulnerable.

### Finding 10: `JubjubExpBatch` does not enforce valid input or output points

Severity: High

Current status: Active unless downstream point validation is guaranteed

`JubjubExpBatch_circuit.circom` passes private split-limb points into `jubjubExp(N)`, which merges them and repeatedly applies the addition formulas, but it never checks that:

- the input points lie on Jubjub
- the output points lie on Jubjub

Relevant code:

- [`subcircuits/circom/JubjubExpBatch_circuit.circom`](../subcircuits/circom/JubjubExpBatch_circuit.circom)
- [`templates/255bit/jubjub.circom`](../templates/255bit/jubjub.circom)

Unlike `edDsaVerify()`, the `jubjubExp()` path never calls `jubjubCheck()`.

#### Reproduction

A focused witness-generation check against the compiled `JubjubExpBatch` artifact used all-zero private inputs, including all-zero point coordinates and all-zero exponent bits. The witness succeeded and the public output point tuple was also all zeros.

The affine point `(0, 0)` does not satisfy the Jubjub curve equation, so the standalone artifact can certify invalid public points.

#### Security impact

- the proof does not guarantee that the public outputs are Jubjub points
- the proof does not guarantee that the published outputs came from valid Jubjub-point exponentiation
- an application that treats the public outputs as valid curve points can accept invalid data

#### Composed-system revalidation

The composed-system context removes the standalone-artifact framing but does not eliminate the underlying contract gap.

If every downstream use of `JubjubExpBatch` outputs passes through a consumer that explicitly checks Jubjub point validity before relying on point semantics, then the missing checks here may be redundant.

If not, the composed circuit can still carry and publish invalid points. Because the exact external topology is not part of this repository, the strongest justified conclusion is conditional rather than absolute. The local subcircuit still does not enforce the property suggested by its name.

### Finding 11: The standalone `EdDsaVerify` artifact is vacuous

Severity: High

Current status: Not a live issue under the composed-system assumption

The compiled `EdDsaVerify` wrapper exposes no public inputs and no public outputs:

- [`subcircuits/circom/EdDsaVerify_circuit.circom`](../subcircuits/circom/EdDsaVerify_circuit.circom)

The inner template checks only that three private Jubjub points satisfy the curve equation and the relation `SG = R + eA`:

- [`templates/255bit/jubjub.circom`](../templates/255bit/jubjub.circom)

As a standalone proof artifact, this does not bind a proof to any message, signature, public key, or challenge.

#### Reproduction

A focused witness-generation check against the compiled `EdDsaVerify` artifact succeeded with the trivial private witness:

- `SG = (0, 1)`
- `R = (0, 1)`
- `eA = (0, 1)`

Those are simply three copies of the affine identity point.

#### Security impact

- a standalone proof over this artifact does not verify any concrete EdDSA statement
- the artifact is satisfiable with a trivial private witness
- any consumer that treats this compiled circuit as a meaningful standalone signature verifier is relying on a false security property

#### Composed-system revalidation

Under the stated system model, this artifact is never used standalone. In that setting, the lack of public inputs and outputs in this wrapper is not itself a vulnerability.

The real system-level question is whether the surrounding composed circuit binds the intended EdDSA statement through other connected subcircuits and public buffers. That question cannot be answered from this repository alone because the final wiring is delegated to the external compiler.

Accordingly, this finding should be treated as an artifact-only observation rather than a live issue in the composed system.

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

Fix or discharge the remaining compiled-circuit issues at the system level:

- ensure every producer path into `Accumulator` and `SubExpBatch` enforces canonical 128-bit limbs, or add local bus checks inside those subcircuits
- ensure every semantic use of `JubjubExpBatch` outputs validates Jubjub point correctness, or add `jubjubCheck()` constraints inside the subcircuit
- ensure the top-level proof statement binds the intended EdDSA message, challenge, key, and relation if `EdDsaVerify` is used as part of the composed circuit
- ensure all deployed proof-verification wrappers reject non-canonical 255-bit split-limb inputs before verification

### Recommended follow-up hardening

Retain the merged-ALU regression tests that already cover:

- zero-divisor `DIV` and `SDIV`
- oversized `SHR` and `SAR`
- high-limb rejection for the shift and byte family

If external verifier-wrapper canonicalization cannot be guaranteed uniformly across all consumers, add canonical limb-range checks inside the Poseidon, Merkle, and Jubjub templates instead.

If `JubjubExpBatch` is intentionally meant to accept unchecked intermediate algebraic states rather than validated Jubjub points, rename the artifact or document that narrower contract explicitly. As currently named, it suggests a stronger guarantee than the circuit enforces.

### Test coverage improvements

Add negative tests for:

- unchecked producer paths feeding non-canonical values into `Accumulator`
- unchecked producer paths feeding non-canonical values into `SubExpBatch`
- invalid private points producing outputs from `JubjubExpBatch` without any downstream point validation
- top-level statement-binding failures around any composed use of `EdDsaVerify`
- verifier-wrapper rejection of non-canonical split-limb encodings for 255-bit Poseidon, Merkle, and Jubjub public inputs

## Final Assessment

The original merged-wrapper findings in this report are resolved in the current repository state.

The later merged division-path soundness bugs around zero-divisor handling and oversized shifts are also resolved.

Under the composed-system assumptions supplied for this repository, the current residual concerns are:

- a system-level requirement that producer paths into `Accumulator` and `SubExpBatch` enforce canonical 256-bit bus encoding
- a still-open contract gap around `JubjubExpBatch` point validity unless downstream validation is guaranteed
- a still-open external-verifier requirement for canonical 255-bit split-limb encoding

The earlier standalone-artifact concern about `EdDsaVerify` does not remain a live issue once the wrapper is understood strictly as an internal subcircuit rather than a standalone proof statement.
