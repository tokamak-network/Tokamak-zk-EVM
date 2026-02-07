# Lessons
- When a user questions the PR/source, verify the exact PR on GitHub before summarizing conflicts or file changes, and cross-check with local conflict files.
- If performance regresses, stop and pivot: gather timing data, identify bottlenecks, and avoid adding memory-heavy fusion without measurement.
- When the user corrects a conclusion, update task notes promptly and incorporate the corrected technical detail (e.g., NTT coset handled via `NTTConfig.coset_gen` rather than domain init).
- When the user explicitly asks to include all changes in a commit, do not pause to filter unexpected files; proceed to stage everything unless they revoke.
