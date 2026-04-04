# Merged ALU Security Audit

> Status update: Revalidated against the repository state on April 4, 2026. The original merged-wrapper findings in this document are resolved. Under the composed-system model used by the external compiler, the fresh review identified two topology-dependent contract gaps outside the original merged-ALU scope. The `Accumulator` / `SubExpBatch` canonicalization observations collapse into system-level bus-well-formedness dependencies rather than standalone public-input exploits. The separate 255-bit split-limb canonicalization observation is retained below only as a boundary-handling note for affected compile targets, not as a live in-repository compiled-circuit issue.

## Scope

This report now has two layers:

- the original merged-ALU security audit
- a fresh April 4, 2026 review of every circuit currently compiled by `scripts/compile.sh`

The fresh compile-target review was performed from code and witness behavior without using the older findings in this document as the source of truth. The older merged-ALU findings are preserved here for historical continuity, but the current-status notes have been updated to match the repository state.

The original scope was the merged arithmetic circuits introduced by the two-circuit ALU consolidation.
- Audited wrappers:
  - [subcircuits/circom/ALU1_circuit.circom](../subcircuits/circom/ALU1_circuit.circom)
  - [subcircuits/circom/ALU2_circuit.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/subcircuits/circom/ALU2_circuit.circom)

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
- `jubjubExpBatch` subcircuits, when present, form a serial chain
- except for the first `jubjubExpBatch` node, each later `jubjubExpBatch` node receives all inputs from the previous chain node's outputs
- the last chain node is always `EdDsaVerify`, and its input is connected to the previous `jubjubExpBatch` output
- the binary inputs of the first `jubjubExpBatch` node come from `DecToBit`
- the point inputs of the first `jubjubExpBatch` node are constant point-at-infinity values
- in practice, inputs to `Accumulator` and `SubExpBatch` are often driven by `buffer*In` outputs or `ALU*` outputs, but that producer set is not guaranteed to be exclusive

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

The fresh compile-target review used the current `scripts/compile.sh` target list, traced each compiled wrapper into its implementation dependencies, and then re-derived findings from the live code. Where a suspected issue affected proof semantics, witness-generation checks were used to confirm that the compiled artifact accepted the problematic case.

## Executive Summary

Most arithmetic constraints were preserved during the merge. The core logic for `ADD`, `MUL`, `SUB`, `LT`, `GT`, `SLT`, `SGT`, `EQ`, `ISZERO`, `NOT`, `AND`, `OR`, `XOR`, `DIV`, `MOD`, `SDIV`, `SMOD`, `ADDMOD`, and `MULMOD` is materially equivalent to the pre-merge design.

At audit time, the merged `ALU2` introduced a real regression for the shift and byte family:

- `SIGNEXTEND`
- `BYTE`
- `SHL`
- `SHR`
- `SAR`

In the pre-merge design, the wrappers for `ALU3` and `ALU5` enforced `in1[1] === 0`, ensuring that the shift amount or byte index was canonical and only occupied the low limb. In the merged `ALU2`, that wrapper-level constraint no longer exists. The merged implementation only reads `in1[0]` for these operations, so different public inputs with different `in1[1]` values are now accepted as the same statement.

That issue was security-relevant at audit time. It has since been remediated in the current repository state.

The audit also found two broader canonicalization concerns:

- selector canonicalization was incomplete
- direct limb-range safety depended on wrapper-level enforcement

Those two merged-wrapper concerns have also been remediated in the current repository state.

However, the fresh compile-target review identified additional issues outside the original merged-wrapper audit scope.

Under the composed-system assumptions above:

- `Accumulator` and `SubExpBatch` no longer present standalone-statement attacks by themselves, but they still rely on system-level bus well-formedness along every producer path that reaches them
- the `jubjubExpBatch -> ... -> EdDsaVerify` chain no longer remains a live issue from this repository alone once the valid chain seed and fixed terminal `EdDsaVerify` sink are taken as part of the system contract
- the standalone `EdDsaVerify` vacuity observation is not a live issue if the artifact is never used standalone

The 255-bit split-limb canonicalization observation is tracked only at the compile-target boundary level for the wrappers that actually move 255-bit split-limb values.

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

The merged wrapper [subcircuits/circom/ALU2_circuit.circom](/Users/jehyuk/Documents/repo/Tokamak-zk-EVM-contracts/submodules/Tokamak-zk-EVM/packages/frontend/qap-compiler/subcircuits/circom/ALU2_circuit.circom#L8) forwarded both limbs of `in1` without any wrapper-level canonicalization.

Within the compiled `ALU2` implementation, only `in1[0]` was used for the shift and byte family:

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

The current compiled `ALU2` path now gates the high limb of `in1` for the byte and shift families:

- `is_index_family <== is_byte_family + is_shift_family`
- `in1[1] * is_index_family === 0`

Relevant implementation:

- [`subcircuits/circom/ALU2_circuit.circom`](../subcircuits/circom/ALU2_circuit.circom)
- [`templates/256bit/alu_safe.circom`](../templates/256bit/alu_safe.circom)

This restores the missing canonicalization constraint for `SIGNEXTEND`, `BYTE`, `SHL`, `SHR`, and `SAR` in the merged ALU path.

### Finding 2: Selector canonicalization remains incomplete

Severity: Medium

Current status: Resolved

The merged compiled `ALU1` / `ALU2` path bit-decomposed the full selector:

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

This was not introduced by the merge. The older ALUs had the same issue. It was nevertheless a real non-canonicality problem for the compiled merged wrappers when selector uniqueness mattered to the surrounding system.

#### Current status revalidation

For the merged wrappers originally audited, selector canonicalization is now enforced.

The current `ALU1` wrapper constrains the full selector weight to exactly one after bit-decomposition:

- [`subcircuits/circom/ALU1_circuit.circom`](../subcircuits/circom/ALU1_circuit.circom)

The current merged division-based compiled path also enforces the same selector-weight rule:

- [`subcircuits/circom/ALU2_circuit.circom`](../subcircuits/circom/ALU2_circuit.circom)
- [`templates/256bit/alu_safe.circom`](../templates/256bit/alu_safe.circom)

This resolves the original merged-wrapper selector issue for the current compiled ALU targets.

### Finding 3: Limb range safety still depends on external wiring

Severity: Medium

Current status: Resolved

At audit time, the merged compiled ALU wrappers still relied on external wiring for input bus well-formedness. The same assumption existed before the merge, so this was not a regression. However, it remained a trust boundary:

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

The underlying implementation still relies on correct callers in some helper paths, but the merged wrappers covered by this document no longer expose the original bus-canonicalization gap.

## Additional Findings From Follow-up Review

### Finding 4: The compiled `ALU2` path for `DIV` and `SDIV` admitted an arbitrary quotient when the divisor was zero

Severity: Critical

Current status: Resolved

The compiled `ALU2` path zeroed the remainder in the `in2 == 0` branch but did not constrain the quotient in the same branch. Because the arithmetic check only enforced:

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

This was a live soundness issue in the compiled merged `ALU2` path.

#### Current status revalidation

This issue is now fixed in the compiled `ALU2` division path.

The current implementation explicitly constrains each quotient limb to zero when `is_zero_denom == 1`:

- `q[0] * is_zero_denom === 0`
- `q[1] * is_zero_denom === 0`

Relevant code:

- [`templates/256bit/arithmetic_unsafe_type2.circom`](../templates/256bit/arithmetic_unsafe_type2.circom)

Focused witness-generation checks against the current `ALU2` build show that `DIV` by zero now yields output `(0, 0)`.

### Finding 5: The compiled `ALU2` path for `SHR` and `SAR` admitted unconstrained outputs when `shift >= 256`

Severity: High

Current status: Resolved

The compiled `ALU2` shift-family path mapped shifts greater than `255` to a zero divisor and then reused the same division-based right-shift machinery. That recreated the same unconstrained-quotient problem as zero-divisor division.

Relevant code:

- [`templates/256bit/arithmetic_safe.circom`](../templates/256bit/arithmetic_safe.circom)
- [`templates/256bit/arithmetic_unsafe_type2.circom`](../templates/256bit/arithmetic_unsafe_type2.circom)
- [`templates/256bit/alu_safe.circom`](../templates/256bit/alu_safe.circom)

Security impact:

- `SHR(x, shift >= 256)` should be `0`, but the circuit does not enforce that result
- `SAR(x, shift >= 256)` should saturate by sign, but the circuit builds on the same unconstrained right-shift witness

This was a live semantic and soundness issue in the compiled merged `ALU2` path.

#### Current status revalidation

This finding is resolved as originally stated because the unconstrained-output path is no longer available.

Focused witness-generation checks against the current `ALU2` build show:

- `SHR` with `shift = 256` yields `(0, 0)`
- `SAR` with `shift = 256` yields `(0, 0)` for non-negative input
- `SAR` with `shift = 256` yields `(2^128 - 1, 2^128 - 1)` for `-1`

For `shift > 255`, the current circuit rejects witness generation through the shift helper range checks instead of admitting an unconstrained output witness.

### Finding 6: Earlier selector-canonicalization follow-up notes outside the current compile set are no longer part of the live compile-target review

Severity: Medium

Current status: Resolved

An earlier follow-up note recorded selector-canonicalization gaps in helper ALU implementations that were not part of the merged `ALU1` / `ALU2` wrappers:

- `ALU3`
- `ALU4`
- `ALU5`
- `ALU_basic`
- `ALU_bitwise`

Those helper circuits are not part of the current `scripts/compile.sh` target set and therefore are not part of the live compile-target review in this document.

The current compiled targets covered by this document do not expose that issue.

#### Current status revalidation

Those earlier helper-circuit selector gaps are now fixed in the current repository state:

- `ALU3`
- `ALU4`
- `ALU5`
- `ALU_basic`
- `ALU_bitwise`

The implementation now zeroes unsupported selector bits before the mux stage, and the existing mux constraints still enforce a one-hot selection across the supported branch flags. This note is retained only for historical continuity and is not a live compile-target vulnerability.

### Finding 7: The compiled 255-bit wrappers do not locally canonicalize split-limb values

Severity: Medium

Current status: Conditional

At the compile-target level, the affected wrappers are:

- [`subcircuits/circom/Poseidon_circuit.circom`](../subcircuits/circom/Poseidon_circuit.circom)
- [`subcircuits/circom/JubjubExpBatch_circuit.circom`](../subcircuits/circom/JubjubExpBatch_circuit.circom)
- [`subcircuits/circom/EdDsaVerify_circuit.circom`](../subcircuits/circom/EdDsaVerify_circuit.circom)
- [`subcircuits/circom/VerifyMerkleProof_circuit.circom`](../subcircuits/circom/VerifyMerkleProof_circuit.circom)

Those wrappers pass split limbs into 255-bit Poseidon, Merkle, and Jubjub logic without adding local `< Fr` or canonical-encoding checks at the wrapper boundary.

Security impact:

- if a final composed circuit exposes such split-limb values as statement-bearing boundary data without canonicalization, different encodings congruent modulo the field can collapse to the same internal field value
- that ambiguity can matter for Poseidon inputs, Merkle-path values, or Jubjub coordinates if the surrounding system expects unique split-limb binding

This issue was identified during the broader follow-up review and was not part of the original merged-ALU audit scope.

#### Composed-system revalidation

Under the repository user's composition model, these compiled wrappers are internal subcircuits rather than final proof boundaries:

- `Poseidon`, `JubjubExpBatch`, and `EdDsaVerify` are not meant to be consumed as standalone top-level proof statements
- every non-buffer subcircuit input and output is internally connected elsewhere
- buffer boundary formats are checked by the external verifier wrapper

Under those assumptions, the lack of local canonicalization in these wrappers is not by itself a live compiled-circuit issue in this repository.

If a future composition surfaces any of these 255-bit split-limb values through public buffer boundaries, the verifier wrapper must still reject non-canonical encodings there. A sufficient boundary check is to reject unless `hi < 2^127` and `(hi, lo) < (Fr_hi, Fr_lo)` in lexicographic limb order. Simple 128-bit masking alone is not sufficient because it does not eliminate encodings of the form `x + Fr`.

Accordingly, this finding is kept only as a compile-target boundary note rather than as an unresolved in-circuit vulnerability.

### Finding 8: `Accumulator` accepts non-canonical public 256-bit split-limb inputs

Severity: Medium

Current status: Conditional

`Accumulator_circuit.circom` chains `Add256_unsafe()` over public split-limb inputs but only checks the final output bus:

- [`subcircuits/circom/Accumulator_circuit.circom`](../subcircuits/circom/Accumulator_circuit.circom)

The arithmetic implementation used by the compiled wrapper explicitly assumes that input and output well-formedness is guaranteed:

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

The repository user also clarified that, in practice, many such producer paths originate from `buffer*In` outputs or `ALU*` outputs. That reduces the chance that a malformed producer is present, but it does not resolve the finding because that producer set is not guaranteed to be exclusive.

That means the standalone reproduction above no longer translates directly into a system-level attack by itself. The issue instead becomes a bus-well-formedness dependency:

- if every producer path feeding `Accumulator` already enforces canonical 128-bit limbs, the missing local input checks are redundant rather than dangerous
- if any producer path can carry unchecked non-canonical split limbs into `Accumulator`, the same ambiguity can still propagate through the composed system

So this is not a confirmed top-level exploit from the local code alone, but it remains a real dependency that must be discharged by the external composition.

### Finding 9: `SubExpBatch` accepts non-canonical hidden 256-bit state

Severity: Medium

Current status: Conditional

`SubExpBatch_circuit.circom` forwards `c_prev` and `a_prev` directly into the compiled exponentiation batch path without any bus-range checks, while the implementation underneath is built from `SubExp_unsafe()`, `Mul256_unsafe()`, and `Add256_unsafe()`:

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
- if downstream logic assumes that `c_prev` and `a_prev` are canonical 256-bit split-limb integers, that assumption is false in the compiled `SubExpBatch` wrapper when viewed in isolation

#### Composed-system revalidation

Under the stated system model, the hidden state of `SubExpBatch` is not a free-standing witness root. Its inputs and outputs are all connected elsewhere in the composed circuit.

The repository user also clarified that, in practice, many such producer paths originate from `buffer*In` outputs or `ALU*` outputs. That reduces practical exposure, but it does not resolve the finding because the surrounding producer set is not guaranteed to be exclusive.

As with `Accumulator`, this weakens the standalone exploit claim and turns the issue into a system-level dependency:

- if all producer paths into `SubExpBatch` already enforce canonical 128-bit limbs, the missing local bus checks are redundant
- if unchecked producer paths can drive `SubExpBatch`, the ambiguity can still persist inside the composed witness

This finding therefore remains relevant as a composition requirement, but it is not by itself a proof that the final top-level circuit is vulnerable.

### Finding 10: The compiled `JubjubExpBatch` wrapper omits local point-validity checks, but that does not remain a live issue under the fixed composed chain

Severity: High

Current status: Resolved

`JubjubExpBatch_circuit.circom` passes split-limb points into its exponentiation implementation, but it never performs local `jubjubCheck()` validation on those points:

- [`subcircuits/circom/JubjubExpBatch_circuit.circom`](../subcircuits/circom/JubjubExpBatch_circuit.circom)
- [`templates/255bit/jubjub.circom`](../templates/255bit/jubjub.circom)

Unlike the compiled `EdDsaVerify` path, the compiled `JubjubExpBatch` path never calls `jubjubCheck()`.

#### Reproduction

A focused witness-generation check against the compiled standalone `JubjubExpBatch` artifact accepted all-zero private inputs, including all-zero point coordinates and all-zero exponent bits.

That reproduction demonstrates only that the compiled wrapper is weak if misused as a standalone artifact. It no longer maps directly to the composed-system contract described for this repository.

#### Security impact

- if treated as a standalone artifact, the wrapper does not itself guarantee that its supplied points are valid Jubjub points
- if misused outside the documented chain topology, the wrapper can accept witnesses that do not correspond to intended Jubjub-point semantics

#### Composed-system revalidation

The fixed chain topology changes this finding materially:

- the first `jubjubExpBatch` node does not receive arbitrary private seeds; its exponent bits come from `DecToBit`
- the point inputs of that first node are fixed point-at-infinity constants, which are valid Jubjub points
- every later `jubjubExpBatch` node consumes only the previous chain node's outputs
- the final chain outputs are not consumed arbitrarily; they are always fed into `EdDsaVerify`
- `EdDsaVerify` does perform `jubjubCheck()` on the terminal points it receives

Under those system facts, the earlier concern about unchecked initial points no longer applies, and the standalone all-zero witness does not describe a reachable top-level proof statement.

No direct evidence remains in this repository that invalid intermediate algebraic states can still be injected or exploited once the chain starts from valid seed points and terminates in `EdDsaVerify`.

Accordingly, this finding should now be treated as an artifact-level observation rather than a live issue in the composed system described by the repository user.

### Finding 11: The compiled `EdDsaVerify` wrapper is vacuous if misused standalone

Severity: High

Current status: Resolved

The compiled `EdDsaVerify` wrapper exposes no public inputs and no public outputs:

- [`subcircuits/circom/EdDsaVerify_circuit.circom`](../subcircuits/circom/EdDsaVerify_circuit.circom)

Its implementation checks only that three private Jubjub points satisfy the curve equation and the relation `SG = R + eA`:

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

The arithmetic inside the merged implementation was preserved, but the pre-merge wrapper constraint `in1[1] === 0` was not enforced at the time of the original audit. That specific wrapper-boundary issue has since been fixed, as described in Finding 1.

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
- ensure the top-level proof statement binds the intended EdDSA message, challenge, key, and relation if `EdDsaVerify` is used as part of the composed circuit

### Recommended follow-up hardening

Retain the merged-ALU regression tests that already cover:

- zero-divisor `DIV` and `SDIV`
- oversized `SHR` and `SAR`
- high-limb rejection for the shift and byte family

If a future composition exposes raw 255-bit split-limb values through public buffer boundaries, enforce canonical limb-range checks in the verifier wrapper at those boundaries or add them locally inside the affected 255-bit circuits.

### Test coverage improvements

Add negative tests for:

- unchecked producer paths feeding non-canonical values into `Accumulator`
- unchecked producer paths feeding non-canonical values into `SubExpBatch`
- top-level statement-binding failures around any composed use of `EdDsaVerify`

## Final Assessment

The original merged-wrapper findings in this report are resolved in the current repository state.

The later merged division-path soundness bugs around zero-divisor handling and oversized shifts are also resolved.

Under the composed-system assumptions supplied for this repository, the current residual concerns are:

- a system-level requirement that producer paths into `Accumulator` and `SubExpBatch` enforce canonical 256-bit bus encoding

The earlier standalone-artifact concerns about `JubjubExpBatch` and `EdDsaVerify` do not remain live issues once the wrappers are understood strictly as internal subcircuits under the fixed composed-chain contract described above. The 255-bit split-limb note is retained only as a boundary-handling consideration for future compositions that choose to expose those values publicly.
