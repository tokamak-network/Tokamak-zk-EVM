# Lessons

## 2026-02-04
- When a request says "2번 job" in a workflow context, clarify whether it means "second job order" or "split into two jobs" before planning changes.
- For CLI optional file inputs, confirm the exact expected filename (e.g., permutation.json vs preprocess.json) by checking code/docs before implementing.
- If the user says "don’t revert/undo," avoid `git reset` and explicitly ask before unstaging; explain that unstaging does not modify working files.
- When making claims about CLI argument expectations, verify against current usage or ask for confirmation before asserting a mismatch.
- When a user asks for a test script, confirm whether they expect a Rust test instead of an external shell runner before implementing.
- When a user says "x_size/y_size", confirm they mean polynomial dimensions (numerator size) rather than parameter symbols like denom degrees.
