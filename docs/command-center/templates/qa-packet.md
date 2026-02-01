---
feature_id: {{FEATURE_ID}}
feature_title: {{FEATURE_TITLE}}
working_pr: {{WORKING_PR_URL}}
spec_ref: {{SPEC_REF}}
generated_at: {{GENERATED_AT_ISO}}
status: proposed
---

# QA Packet — {{FEATURE_TITLE}}

## Setup
- [ ] Checkout branch: `{{WORKING_BRANCH}}`
- [ ] Install deps: `{{CMD_INSTALL}}`
- [ ] Start dev: `{{CMD_DEV}}`
- [ ] Run lint: `{{CMD_LINT}}`
- [ ] Run typecheck: `{{CMD_TYPECHECK}}`
- [ ] Run tests: `{{CMD_TEST}}`

## Acceptance tests (from spec)
{{ACCEPTANCE_CHECKLIST}}

## Edge cases (generated)
{{EDGE_CASE_CHECKLIST}}

## Regression smoke
- [ ] No console errors on primary pages touched
- [ ] Basic navigation back/forward works
- [ ] Empty states display friendly messaging (no crashes)
- [ ] No obvious layout break at narrow widths

## Ralph lane (naïve-user checks)
{{RALPH_CHECKLIST}}

## Agent harness context
- Provider: {{AGENT_PROVIDER}}
- Command prefix: {{AGENT_COMMAND_PREFIX}}
- Plan prompt: {{AGENT_PLAN_PROMPT}}

## Results
- Outcome: ☐ Pass ☐ Fail
- Notes:
  - {{RESULT_NOTES}}
