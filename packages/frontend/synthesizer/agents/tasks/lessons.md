# Lessons
- Always place agent-generated artifacts (plans, notes, logs) under `./agents/` instead of creating top-level folders.
- Avoid suggesting README updates for developer-only workflow changes unless explicitly requested.
- When updating PR descriptions via CLI, use proper newline handling (e.g., --body-file) to avoid literal \n sequences in GitHub.
- When asked to ignore `runCommand` failures, confirm every script in the test flow that uses `runCommand` and clarify which ones should still fail fast.
- When tests fail, validate whether generated configs are valid before attributing the failure to the execution step.
- When asked to remove timeouts, confirm the actual timeout used by the tool runtime and state it explicitly.
- When corrected on terminology (e.g., “buffer” vs “reserved variable”), align wording to the code’s actual structure and avoid implying non-existent components.
- When updating config schemas, confirm whether legacy fields must be preserved and align any renames with explicit user direction.
