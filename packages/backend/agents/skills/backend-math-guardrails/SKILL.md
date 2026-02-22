# Backend Math Guardrails

## Purpose
Use this skill whenever an agent edits backend proving-system code and must preserve the mathematical design.

Primary targets in this workspace:
- `setup/trusted-setup`
- `prove`
- `verify/preprocess`
- `verify/verify-rust`

## Scope
This skill is for **math-preserving changes**: refactors, optimizations, serialization updates, IO changes, and bug fixes.
If a change intentionally alters protocol equations, this skill must block the patch until the protocol change is explicitly approved.

## Non-Negotiable Rule
No merged patch may change the protocol relation
`Completeness + Soundness equations + Fiat-Shamir challenge flow`
without an explicit protocol-change request.

## Guardrail References
- Trusted setup: `agents/skills/backend-math-guardrails/references/trusted-setup.md`
- Prover: `agents/skills/backend-math-guardrails/references/prove.md`
- Verifier preprocess: `agents/skills/backend-math-guardrails/references/verify-preprocess.md`
- Verifier core: `agents/skills/backend-math-guardrails/references/verify-rust.md`

## Execution Workflow
1. Map changed files to package(s).
2. Load only the corresponding reference file(s) above.
3. Build an invariant impact table with rows:
   - `Invariant ID`
   - `Touched code path`
   - `Why unchanged (algebra)`
   - `Evidence (test/check/log)`
4. Reject patch if any invariant cannot be justified.
5. Run the minimum checks:
   - `cargo check -p trusted-setup -p prove -p preprocess -p verify`
   - `cargo test -p verify --lib`
6. If polynomial/division code changed, add:
   - `cargo test -p libs test_div_by_vanishing_opt_basic -- --nocapture`
7. Report results with explicit PASS/FAIL per invariant.

## Allowed Changes
- Performance improvements that preserve algebraic equalities.
- Refactors that keep transcript order and serialized field ordering identical.
- Memory/IO optimizations that do not change committed group elements or field evaluations.

## Disallowed Changes (Without Explicit Approval)
- Reordering transcript commitments/challenges.
- Changing commitment serialization order used by prover/verifier.
- Modifying CRS element definitions (`sigma_1`, `sigma_2`) semantics.
- Changing vanishing-polynomial factors or quotient equations.
- Changing pairing equation decomposition in verifier.

## Required Output Template (for agent final report)
Use this exact structure in the report:

1. `Changed paths`
2. `Invariant impact table` (ID, status, evidence)
3. `Verification commands + outputs`
4. `Residual risks` (if any)

