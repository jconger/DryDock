# DryDock Spec (Merged)

Updated: 2026-02-01

This document merges the provided build spec with what is currently implemented in this repo. When requirements overlap, the more functional behavior is described, and the current status is noted.

## 0) Current Implementation Snapshot (Ground Truth)

- Local web UI: `apps/command-center-ui` (Next.js).
  - Posts PR comments via GitHub API.
  - Lists recent PR targets and open PRs.
  - Shows active harness and command list from config.
- CLI: `pnpm --dir apps/command-center-ui cc ...`
  - `cc init` bootstraps `.command-center.jsonc` and writes `apps/command-center-ui/.env.local`.
  - `cc config ...` edits harness and comment protocol settings.
- Config: `.command-center.jsonc` with schema at `docs/command-center/command-center.schema.json`.
  - `commentProtocol` controls `/cc` commands.
  - `agentHarness` controls provider and prompts.
- Agent harness: configurable `opencode`, `codex`, or `claude-code` with command prefix and prompts.
- Workflow: `.github/workflows/command-center.yml`
  - Handles `/cc` commands.
  - Uses `.command-center.jsonc` for harness prefix + fix prompt.
  - Creates final PR via branch + merge.
- Repo scan: `.github/workflows/repo-scan.yml` posts a placeholder daily "Repo Health Brief".
- Templates: `docs/command-center/templates/qa-packet.md`, `fix-bundle.md`, `ralph-report.md`.
- Local DB: `.data/command-center.sqlite` for recent targets.

Status summary:
- Implemented: comment control panel, CLI onboarding, agent harness config, `/cc` workflow, templates, repo scan placeholder.
- Planned: proposal generation, QA runner, fix bundle automation, final PR squash/cherry-pick, Obsidian integration.

## 1) Summary

Build a local app ("DryDock") that orchestrates the full pipeline:
1) Ingests notes and repo signals.
2) Generates feature proposals and variants.
3) Lets you approve/edit/add features in one UI.
4) Creates GitHub Issues (optional) and manages lifecycle state.
5) Triggers the agent harness by posting PR/Issue comments (default `/opencode`, configurable).
6) Auto-generates QA Packets per feature.
7) Provides a QA Runner UI with pass/fail per checklist item and evidence capture.
8) When QA passes, creates a clean Final PR from the working branch (squash/cherry-pick).
9) If QA fails, creates a Fix Context Bundle and triggers a fix run.
10) Supports a Ralph loop (naive-user chaos testing) as a gate before final PR creation.

Status: Partial (steps 5 and 10 stubs exist; others planned).

## 2) Goals / Non-goals

Core goals:
- One UI to run the full workflow without manual command typing.
- Model-agnostic agent runs via GitHub comment triggers.
- Human gatekeeping: no auto-merge.
- Two-PR flow: working PR for iteration, clean final PR for review.
- Multi-variant generation and selection.
- Repo monitoring without noise.

Non-goals (v1):
- Not a replacement for GitHub Projects/Jira.
- Not a generic agent framework.
- Not auto-merging PRs.

Status: Goals align with current direction.

## 3) Users and Primary Workflows

Primary user: single-user local workflow.

Daily flow:
1) Open DryDock.
2) Review brief + proposals.
3) Approve/select variants.
4) Trigger implementation (working PR created).
5) Run QA Runner; pass/fail.
6) Pass => create final PR.
7) Fail => fix loop, retest.

Status: Partial (steps 4-7 are manual via PR comments today).

## 4) System Architecture

High-level components:
1) Local UI (web).
2) Local orchestrator service (Node/TS recommended).
3) Local SQLite database.
4) GitHub integration layer (API + webhooks/polling).
5) Pipelines:
   - Notes ingestion -> proposals
   - Repo monitoring -> proposals
   - Implementation orchestration -> PR comment triggers
   - QA packet generation
   - Final PR creation
6) Optional Obsidian writer.

Execution model:
- Agent runs happen in GitHub Actions, triggered by PR/issue comments.
- Local app posts those comments and watches PR updates.

Status: UI + GitHub API + Actions workflow exist; orchestrator/pipelines planned.

## 5) Integrations

### 5.1 GitHub
Required:
- Read repos/branches/PRs/issues/labels/comments/checks.
- Write issues/branches/PRs/comments/labels.

Auth:
- v1: PAT (current).
- v2: GitHub App (planned).

Events:
- v1: polling (planned).
- v2: webhooks (planned).

Status: Partial (PAT + API in UI + workflow).

### 5.2 Agent Harness (OpenCode / Codex / Claude Code)
- Default prefix: `/opencode`.
- Configurable providers: `opencode`, `codex`, `claude-code`.
- Prompt text is configurable via `.command-center.jsonc`.
- The app only posts comments; agent runs happen in Actions.

Default plan prompt (current, more functional):
- "propose 3 implementation plans: minimal, balanced, robustness-first. For each: scope, CLI + web UI impact, config changes, risks, and testing. End with a recommendation."

Status: Implemented (comment triggers + config), external harness workflow required.

### 5.3 Obsidian (Optional)
- Write-only integration for briefs, feature cards, QA packets.
- App remains canonical data store.

Status: Planned.

## 6) Data Model (SQLite)

Tables (planned; local DB currently only tracks recent PR targets):
- repos
- features
- feature_variants
- spec_variants
- github_issues
- pull_requests
- qa_packets
- agent_runs
- events

Status: Planned.

## 7) State Machine

Feature status enum:
- PROPOSED, APPROVED, SPEC_CHOOSING, SPEC_SELECTED, IMPLEMENTING,
  READY_FOR_QA, QA_IN_PROGRESS, QA_FAILED, QA_PASSED,
  FINAL_PR_CREATED, DONE, DEFERRED, REJECTED

PR type progression:
- Working PR: iterative, can be "dirty".
- Final PR: clean, created after QA passed/accepted.

Status: Planned (labels exist for QA and Ralph gates).

## 8) UI Specification (Merged)

Global layout:
- Left nav: repo selector + main sections.
- Sections: Morning Brief, Proposals, Implementation, QA Gate, Repo Health, Settings.

Current UI (implemented):
- PR comment control panel + command picker.
- Recent targets list.
- Open PR list.

Planned additions:
- Morning Brief, Proposals, Feature detail, Implementation, QA Gate, QA Runner, Ralph tab.

Status: Partial (control panel only).

## 9) Comment-Command Protocol (PR comments only)

Agent harness triggers (configurable):
- `<prefix> propose 3 implementation plans ...`
- `<prefix> implement ...`
- `<prefix> fix robust ...`

DryDock commands (workflow):
- `/cc qa generate`
- `/cc qa pass`
- `/cc qa fail: ...`
- `/cc ralph run`
- `/cc ralph accept: ...`
- `/cc final create`

Notes:
- Commands are configurable via `.command-center.jsonc`.
- UI posts these as PR comments for auditability.

Status: Implemented (configurable).

## 10) GitHub Actions Workflows

Required:
1) Agent harness workflow (OpenCode install or equivalent).
2) `command-center.yml` (exists).
3) `repo-scan.yml` (exists; placeholder output).

Status: Partial (agent harness workflow not in repo).

## 11) QA Packet Generation

Inputs:
- Selected spec variant.
- Working PR diff.
- Repo commands.

Output (template in repo):
- Setup steps
- Acceptance checklist
- Edge cases
- Regression checks
- Ralph lane

Constraints:
- Cap at ~25 items, binary checks.

Status: Planned (template exists).

## 12) Fix Context Bundle

Generated on QA fail:
- Failed checks + notes
- Repro steps
- Expected vs actual
- Diff hunks and file list
- Logs and CI output

Outputs:
- Fix Bundle markdown posted to PR
- Agent run trigger (minimal/robust/UX)

Status: Planned (template exists).

## 13) Final PR Creation (Two-PR Flow)

When:
- QA passed
- Ralph gate passed/accepted (configurable)

How:
1) Create final branch from base.
2) Bring working changes via squash or cherry-pick.
3) Open PR with QA summary + links.
4) Optionally close working PR as superseded.

Status: Partial (workflow creates final PR via merge; squash/cherry-pick planned).

## 14) Repo Monitoring and Suggestions

Principles:
- Diff-first, deduped, capped 5-10 items.

Signals:
- CI failures, lint/typecheck, dependency alerts, hotspots.

Outputs:
- Proposals with title, rationale, evidence, acceptance criteria.

Status: Planned (repo-scan placeholder issue exists).

## 15) Security

Tokens:
- PAT in env file for v1.
- Future: keychain or GitHub App.

Actions safety:
- Prefer issue_comment on trusted repos.
- Validate authorized commenters.

Status: Partial (PAT only; no auth gate in workflow).

## 16) Settings Screen (Planned)

Per repo configuration:
- Dev/test/lint/typecheck/build commands.
- Output paths.
- Label mapping.
- Branch naming.
- Ralph policy.
- Optional Obsidian vault path.

Current:
- Config stored in `.command-center.jsonc`.

## 17) Milestones (Merged)

Milestone 1 (GitHub + Working/Final PR pipeline):
- Implemented: PR comment control + final PR creation (merge).
- Planned: working PR tracking + squash/cherry-pick final PR.

Milestone 2 (QA Runner):
- Planned (template exists).

Milestone 3 (Variants + approval):
- Planned.

Milestone 4 (Ralph loop):
- Partial (command + template).

Milestone 5 (Notes + repo monitoring):
- Partial (repo-scan placeholder).

## 18) Acceptance Criteria (Merged)

System is done when you can:
1) Create/approve a feature in UI.
2) Select spec variant.
3) Click Implement -> working PR appears.
4) Open QA Runner -> checklist appears.
5) Fail item -> fix bundle generated -> fix run updates PR.
6) Pass QA -> clean final PR created.
7) Final PR contains QA summary and links.
8) Ralph gate blocks/accepts final PR creation.
9) Everything is auditable in GitHub comments/logs.

Status: Planned.

## 19) Repo Setup Checklist (Generated Output)

The app should generate a checklist that includes:
- Install agent harness integration (OpenCode or equivalent).
- Ensure harness config exists (`opencode.jsonc` or provider equivalent).
- Add `command-center.yml` workflow.
- Create labels.
- Add `.command-center.jsonc` with repo settings.

Status: Planned (manual today).
