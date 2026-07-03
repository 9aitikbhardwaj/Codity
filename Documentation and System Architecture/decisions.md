# Design Decisions

## Dependency-Light Stack

The project uses Python stdlib HTTP serving, SQLite, and plain HTML/CSS/JavaScript. This makes the deliverable easy to run in an offline assignment environment while still exercising API design, relational modeling, concurrency, and worker behavior.

## Atomic Claiming

Workers claim jobs with a short `BEGIN IMMEDIATE` transaction. The worker selects one eligible job, checks queue pause and concurrency limits, updates it to `claimed`, and commits before execution. This prevents duplicate execution across multiple worker processes.

## Job Lifecycle

The main lifecycle is represented directly in the `jobs.status` column for fast filtering:

`queued` -> `scheduled` -> `claimed` -> `running` -> `completed`

Failures move through `failed` for retryable attempts and `dead_lettered` when attempts are exhausted.

## Retry Policies

Retry policy is queue-level and normalized into `retry_policies`. Fixed, linear, and exponential strategies use base and max delay values. Every retry writes a `retry_history` row.

## Idempotency

Jobs support optional `idempotency_key`, unique per queue. Clients can safely retry job creation with the same key without creating duplicate work.

## Observability

Current job state stays on the job row, while append-only `job_executions`, `job_logs`, `retry_history`, and `worker_heartbeats` preserve operational history.

## Dashboard Updates

The dashboard uses polling instead of WebSockets. Polling is simpler, reliable for this project size, and explicitly allowed by the assignment.

## Trade-offs

- SQLite is excellent for a self-contained assignment. A production deployment would move to PostgreSQL and use row-level locks such as `FOR UPDATE SKIP LOCKED`.
- Job execution is simulated from payload fields. In production, payload handlers would be registered task functions with sandboxing and idempotent side effects.
- Cron support accepts simple `@every Ns`, `@every Nm`, and `*/N * * * *` recurring expressions. A production system would use a full cron parser.
