# DryDock Spec (Merged)

Updated: 2026-02-02

This document merges the provided build spec with what is currently implemented in this repo. When requirements overlap, the more functional behavior is described, and the current status is noted.

## 0) Current Implementation Snapshot (Ground Truth)

- Local web UI: `apps/command-center-ui` (Next.js).
  - Uses the CLI for all data and write operations.
  - Posts PR comments via CLI commands.
  - Lists recent PR targets and open PRs via CLI.
- CLI: `pnpm --dir apps/command-center-ui cc ...`
  - Single source of truth for config, features, QA packets, and PR comment actions.
  - Web UI shells invoke CLI commands and parse JSON output.
  - Interactive mode for quick ops: `cc interactive`.
- Config: `.command-center.jsonc` with schema at `docs/command-center/command-center.schema.json`.
  - `commentProtocol` controls `/cc` commands.
  - `agentHarness` controls provider and prompts.
- Agent harness: configurable `opencode`, `codex`, or `claude-code` with command prefix and prompts.
- Workflow: `.github/workflows/command-center.yml`
  - Handles `/cc` commands.
  - Uses `.command-center.jsonc` for harness prefix + fix prompt.
  - Creates final PR via branch + merge (current).
- Repo scan: `.github/workflows/repo-scan.yml` posts a placeholder daily "Repo Health Brief".
- Templates: `docs/command-center/templates/qa-packet.md`, `fix-bundle.md`, `ralph-report.md`.
- Local DB: `.data/command-center.sqlite` for recent targets.

Status summary:
- Implemented: comment control panel, CLI onboarding, agent harness config, `/cc` workflow, templates, repo scan placeholder.
- Planned: proposal generation, QA runner, fix bundle automation, final PR squash/cherry-pick, Obsidian integration, markdown watch ingestion, background service + scheduler.

## 1) Summary

Build a local app ("DryDock") that orchestrates the full pipeline:
1) Ingest notes and repo signals (including markdown watchers).
2) Generate feature proposals and variants.
3) Let you approve/edit/add features in one UI.
4) Create GitHub Issues (optional) and manage lifecycle state.
5) Trigger the agent harness by posting PR/Issue comments (default `/opencode`, configurable).
6) Auto-generate QA Packets per feature.
7) Provide a QA Runner UI with pass/fail per checklist item and evidence capture.
8) When QA passes, create a clean Final PR from the working branch (squash/cherry-pick).
9) If QA fails, create a Fix Context Bundle and trigger a fix run.
10) Support a Ralph loop (naive-user chaos testing) as a gate before final PR creation.
11) Run a background service that watches markdown files and scheduled jobs.

Status: Partial (steps 5 and 10 stubs exist; others planned).

## 2) Goals / Non-goals

Core goals:
- One UI to run the full workflow without manual command typing.
- Model-agnostic agent runs via GitHub comment triggers.
- Human gatekeeping: no auto-merge.
- Two-PR flow: working PR for iteration, clean final PR for review.
- Multi-variant generation and selection.
- Repo monitoring without noise.
- Always-on signals from markdown notes and scheduled repo checks.

Non-goals (v1):
- Not a replacement for GitHub Projects/Jira.
- Not a generic agent framework.
- Not auto-merging PRs.
- Not a full task scheduler for arbitrary scripts (only approved DryDock tasks).

Status: Goals align with current direction.

## 3) Users and Primary Workflows

Primary user: single-user local workflow.

Daily flow:
1) Open DryDock.
2) Review brief + proposals (including markdown-derived drafts).
3) Approve/select variants.
4) Trigger implementation (working PR created).
5) Run QA Runner; pass/fail.
6) Pass => create final PR.
7) Fail => fix loop, retest.

Background flow:
1) DryDock service runs locally.
2) Markdown watchers and schedules enqueue jobs.
3) Proposals appear in the inbox; user triages.

Status: Partial (steps 4-7 are manual via PR comments today).

## 4) System Architecture

High-level components:
1) Local UI (web) that shells out to the CLI.
2) Local CLI orchestrator (Node/TS).
3) Local SQLite database.
4) GitHub integration layer (API + webhooks/polling).
5) Watcher + scheduler service (daemon) for markdown files + scheduled jobs.
6) Pipelines:
   - Notes ingestion -> proposals
   - Markdown watch -> proposal drafts
   - Repo monitoring -> proposals
   - Implementation orchestration -> PR comment triggers
   - QA packet generation
   - Final PR creation

Execution model:
- Agent runs happen in GitHub Actions, triggered by PR/issue comments.
- Local UI shells out to the CLI to post comments and read status.
- CLI supports interactive prompts for manual workflows.
- Service mode runs watchers/schedules and accepts piped tasks.

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

Status: Partial (PAT + API in CLI + workflow).

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

### 5.4 Filesystem + Local Service (New)
- Local file watchers (native or polling) for markdown sources.
- Local IPC for service mode (stdin, unix socket, or named pipe).
- PID/log management for background mode.

Status: Planned.

## 6) Data Model (SQLite)

Tables (planned; local DB currently only tracks recent PR targets):
- repos
- features
- feature_variants
- spec_variants
- proposals
- proposal_sources
- watch_sources
- file_snapshots
- change_events
- github_issues
- pull_requests
- qa_packets
- agent_runs
- jobs
- schedules
- events

Status: Planned.

## 7) State Machine

Feature status enum:
- PROPOSED, APPROVED, SPEC_CHOOSING, SPEC_SELECTED, IMPLEMENTING,
  READY_FOR_QA, QA_IN_PROGRESS, QA_FAILED, QA_PASSED,
  FINAL_PR_CREATED, DONE, DEFERRED, REJECTED

Proposal status enum (new):
- DRAFT, INBOX, ACCEPTED, DEFERRED, REJECTED, MERGED, SUPERSEDED

PR type progression:
- Working PR: iterative, can be "dirty".
- Final PR: clean, created after QA passed/accepted.

Status: Planned (labels exist for QA and Ralph gates).

## 8) UI Specification (Merged)

Global layout:
- Left nav: repo selector + main sections.
- Sections: Morning Brief, Proposals, Implementation, QA Gate, Repo Health, Settings.

Current UI (implemented):
- PR comment control panel + command picker (via CLI).
- Recent targets list (via CLI).
- Open PR list (via CLI).

Planned additions:
- Morning Brief, Proposals, Feature detail, Implementation, QA Gate, QA Runner, Ralph tab.
- Proposal Inbox with source, diff, and dedupe hints.
- Watchers + Schedules panel with enable/disable and health status.
- Service status + job queue view.

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
- UI calls the CLI, which posts PR comments for auditability.

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

## 14) Notes + Markdown Watchers (New)

Principles:
- Only watch configured `.md` files under the repo root.
- No automatic approval by default; generate proposal drafts for review.
- Dedupe aggressively to avoid noise.

Behavior:
- Each watch source stores `lastSeenMtime`, `lastProcessedMtime`, and `contentHash`.
- A change is considered actionable when:
  - `mtime` increases AND
  - `contentHash` changes (avoids false positives).
- On change, create a `change_event` with a diff summary and file context.
- Proposal generator consumes the change event and produces proposal drafts.
- Drafts enter the Proposal Inbox with source, evidence, and suggested title.

Parsing options (configurable):
- Frontmatter with structured fields (title, rationale, acceptance criteria).
- Heading/bullet heuristics for quick notes.
- Optional LLM summarization using only the changed sections.

Dedupe rules:
- Normalize title + source path to create a stable key.
- If a newer change supersedes an older draft, mark older as SUPERSEDED.
- Maintain a short "recently seen" window (7-14 days) to avoid repeats.

Status: Planned.

## 15) Repo Monitoring and Suggestions

Principles:
- Diff-first, deduped, capped 5-10 items.

Signals:
- CI failures, lint/typecheck, dependency alerts, hotspots.

Outputs:
- Proposals with title, rationale, evidence, acceptance criteria.

Scheduling:
- Runs via GitHub Action or local service scheduler.
- Produces change events that flow into proposal generation.

Status: Planned (repo-scan placeholder issue exists).

## 16) Service + Scheduler (New)

Service mode:
- Runs a local daemon that powers watchers, repo scans, and scheduled jobs.
- Accepts tasks via stdin or local IPC (`cc service pipe`).
- Writes job state to the local DB for retry and visibility.

Scheduler:
- Supports cron-like schedules or interval-based jobs.
- Job types: `watch.poll`, `repo.scan`, `proposals.generate`, `brief.generate`.
- Configurable timezone and concurrency limits.

Queue behavior:
- At-most-once execution with explicit retry for failed jobs.
- Debounce repeated events from rapid file writes.
- Backoff for repeated failures (exponential, capped).

Status: Planned.

## 17) Security

Tokens:
- PAT in env file for v1.
- Future: keychain or GitHub App.

Actions safety:
- Prefer issue_comment on trusted repos.
- Validate authorized commenters.

Local safety:
- Watchers are allowlisted paths only.
- Skip files larger than a max size threshold (configurable).
- Service IPC is local-only with restrictive permissions.

Status: Partial (PAT only; no auth gate in workflow).

## 18) Settings Screen (Planned)

Per repo configuration:
- Dev/test/lint/typecheck/build commands.
- Output paths.
- Label mapping.
- Branch naming.
- Ralph policy.
- Optional Obsidian vault path.
- Markdown watch sources and parser settings.
- Scheduler jobs and timezone.
- Service defaults (log path, socket path).

Current:
- Config stored in `.command-center.jsonc` and read via CLI.

## 19) Milestones (Merged)

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

Milestone 6 (Markdown watchers + service scheduler):
- Planned.

## 20) Acceptance Criteria (Merged)

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
10) A configured `.md` watch source produces proposal drafts on change.
11) The service runs in the background and accepts piped tasks.
12) Scheduled jobs run and show in the job queue.

Status: Planned.

## 21) Repo Setup Checklist (Generated Output)

The app should generate a checklist that includes:
- Install agent harness integration (OpenCode or equivalent).
- Ensure harness config exists (`opencode.jsonc` or provider equivalent).
- Add `command-center.yml` workflow.
- Create labels.
- Add `.command-center.jsonc` with repo settings.
- Configure markdown watchers and scheduler if desired.
- Start the DryDock service (optional for always-on signals).

Status: Planned (manual today).
