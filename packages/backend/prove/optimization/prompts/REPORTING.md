# Prompt: Optimization Reporting (Source Series + Mini-Reports)

You are updating optimization reports for this repo. Follow these rules exactly.

## Output Files (paths are mandatory)
- Main report: `prove/optimization/optimization_report.md`
- Mini-reports directory: `prove/optimization/mini-reports/`
  - One file per Source Series row, named `YYYY-MM-DD_<commit>.md` (e.g., `2026-02-07_8839dbc5.md`).

## Inputs You Must Use
- Timing snapshots: `prove/output/timing.release.md`
- Commit history affecting the timing snapshot file.

## Source Series Table Rules
- The table must be titled **“Source Series (total_wall by snapshot commit)”**.
- Add a new row **only when `total_wall` decreases by ≥ 3.0 seconds** compared to the immediately previous snapshot.
- Columns (in this order):
  1. `date`
  2. `commits`
  3. `change summary`
  4. `total_wall (s)`
  5. `mini-report`
- `commits` must list **all commits since the previous Source Series row** (inclusive of the snapshot commit), in chronological order.
- `change summary` must summarize what changed across the listed commits.
- `mini-report` must be a hyperlink with **link text exactly `mini-report`**, pointing to the corresponding file under `prove/optimization/mini-reports/`.

## Report Structure Requirements
- Do **not** include a “Reduction Events” section.
- Keep the report concise; use a short Notes section if needed.

## Mini-Report Format
Each mini-report must follow this structure:

1. Title: `# Mini Report: <YYYY-MM-DD> (<commit>)`
2. `## total_wall` section with a single bullet containing the value.
3. `## Commits` section listing all commits from the Source Series row.
4. `## Change Analysis` section with a **numbered list of propositions**.

### Proposition Rules
- Each proposition must explicitly state **what** changed and **how** it changed.
- Each proposition must include a **Proof (excerpt)** block directly under it.
- Proofs must be **minimal excerpts** (short code, pseudocode, or formulas). Avoid large blocks.
- If using code, quote only the key lines that demonstrate the claim.
- If code evidence is not appropriate, use a short formula or pseudocode that proves the claim.

### Example Proposition Format
1. **Proposition:** <what/ how>  
Proof (excerpt):
```text
<short excerpt or formula>
```

## Consistency Checks
- The `total_wall` values in mini-reports must match the Source Series row values.
- The commit list in each mini-report must match the Source Series `commits` column.
- Use ASCII; keep wording consistent with existing report style.
