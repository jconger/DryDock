# Service + Scheduler (Planned)

This document defines the always-on service mode and cron-like scheduler for DryDock.

## Goals
- Run watchers and repo scans without manual CLI invocation.
- Allow jobs to be enqueued via stdin or IPC.
- Provide basic scheduling for repeated tasks.

## Non-goals
- Not a general purpose job runner.
- Not a replacement for system cron.

## Service Mode
The service runs locally as a background process.

Responsibilities:
- Execute scheduled jobs.
- Run watchers on interval.
- Maintain a job queue with status and logs.

Process management:
- PID file and log file paths are configurable.
- Socket or pipe path is local-only.

## Pipe Interface
`cc service pipe` accepts JSON lines. Each line is a single job.

Example:
```json
{"task":"proposals.generate","repo":{"owner":"acme","name":"app"},"source":"watch:product-notes"}
{"task":"brief.generate","repo":{"owner":"acme","name":"app"}}
```

Job fields (proposed):
- `task` (required): task name.
- `repo` (optional): owner/name.
- `args` (optional): task arguments.
- `source` (optional): origin for auditability.
- `id` (optional): caller-supplied idempotency key.

## Scheduler
Supports cron-like and interval-based jobs.

Example config snippet:
```json
{
  "scheduler": {
    "timezone": "America/Los_Angeles",
    "maxConcurrency": 2,
    "jobs": [
      {
        "id": "daily-brief",
        "enabled": true,
        "cron": "0 8 * * *",
        "task": "brief.generate",
        "repo": {"owner": "acme", "name": "app"}
      },
      {
        "id": "watch-scan",
        "enabled": true,
        "intervalSeconds": 300,
        "task": "watch.poll"
      }
    ]
  }
}
```

## Job States
- `queued`, `running`, `succeeded`, `failed`, `skipped`, `canceled`.

## Retry + Backoff
- At-most-once execution by default.
- Retries are opt-in per task.
- Exponential backoff with a max cap.

## CLI Expectations (Planned)
```bash
cc service start
cc service status
cc service stop
cc service pipe < tasks.jsonl

cc schedule list
cc schedule add --id daily-brief --cron "0 8 * * *" --task brief.generate
cc schedule run --id daily-brief
```

Notes:
- `tasks.jsonl` should be newline-delimited JSON (JSONL).
