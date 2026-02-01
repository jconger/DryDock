---
feature_id: {{FEATURE_ID}}
feature_title: {{FEATURE_TITLE}}
working_pr: {{WORKING_PR_URL}}
generated_at: {{GENERATED_AT_ISO}}
status: needs-fix
fix_style: {{FIX_STYLE}}  # minimal | robust | ux-compromise
---

# Fix Bundle — {{FEATURE_TITLE}}

## What failed (QA)
{{FAILED_CHECKS}}

## Repro steps (normalized)
{{REPRO_STEPS}}

## Expected vs Actual
**Expected**
{{EXPECTED}}

**Actual**
{{ACTUAL}}

## Evidence / logs
{{EVIDENCE}}

## Context
### Files changed (from PR)
{{CHANGED_FILES}}

### Relevant diff hunks
{{DIFF_SNIPPETS}}

## Fix instructions for agent
- Address the failed checks above.
- Prefer changes that satisfy acceptance criteria and do not introduce regressions.
- Add or adjust tests when feasible.
- If behavior is ambiguous, choose the simplest user-proof behavior and document it in the PR.

## Agent harness context
- Provider: {{AGENT_PROVIDER}}
- Command prefix: {{AGENT_COMMAND_PREFIX}}
