# Markdown Watchers (Planned)

This document defines how DryDock watches `.md` files and turns changes into proposal drafts.

## Goals
- Convert notes and repo markdown changes into actionable proposals.
- Avoid noise with dedupe and timestamp checks.
- Keep users in control (no auto-approve).

## Non-goals
- Not a generic file indexing system.
- Not a full markdown parser for all dialects.

## Watch Source Definition
Each watch source is a single markdown file under the repo root.

Example config snippet:
```json
{
  "watch": {
    "pollIntervalSeconds": 120,
    "debounceMs": 800,
    "sources": [
      {
        "id": "product-notes",
        "path": "docs/notes/product.md",
        "mode": "mtime+hash",
        "enabled": true,
        "maxFileSizeKb": 512,
        "parser": {
          "mode": "frontmatter+headings",
          "acceptSections": ["Ideas", "Bugs", "Experiments"]
        },
        "proposal": {
          "autoDraft": true,
          "defaultOwner": "me",
          "labels": ["proposal", "notes"]
        }
      }
    ]
  }
}
```

## Change Detection
- Store `lastSeenMtime`, `lastProcessedMtime`, and `contentHash` for each watch source.
- A change is actionable when:
  - `mtime` increases AND
  - `contentHash` changes.
- Store a `file_snapshot` for each change (mtime, hash, size, excerpt, optional diff).

## Proposal Generation Pipeline
1) Scan watch source.
2) Create `change_event` with diff summary + relevant excerpts.
3) Proposal generator converts change event into proposal drafts.
4) Drafts enter Proposal Inbox with source and evidence.

## Dedupe + Noise Control
- Normalize title + path into a stable key.
- Suppress duplicates for 7-14 days unless content changed significantly.
- When a newer change supersedes an older draft, mark older as SUPERSEDED.
- Debounce rapid writes (default 500-1000ms).

## Parsing Modes (Configurable)
- `frontmatter+headings`: use frontmatter fields when present, otherwise headings.
- `headings-only`: treat H2/H3 blocks as candidate proposals.
- `bullets-only`: treat bullet lists under headings as proposals.

## Failure Modes + Guardrails
- Skip files over max size; emit a warning event.
- If file is deleted, mark watch source as inactive and alert.
- If parsing fails, create a minimal draft with the raw excerpt.

## UI Expectations
- Watchers list with status, last change, and last error.
- Proposal Inbox badges indicating source file and last change time.
- Manual "Run scan" action for each source.

## CLI Expectations (Planned)
```bash
cc watch list
cc watch add --id notes --path docs/notes.md --mode mtime+hash
cc watch run --id notes
cc watch snapshot --id notes
```
