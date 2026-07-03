# API Documentation

All protected endpoints require:

```text
Authorization: Bearer <token>
```

Errors are structured:

```json
{"error":"Message","detail":"Optional detail"}
```

## Auth

`POST /api/auth/register`

```json
{"email":"user@example.com","password":"secret123","organization_name":"Acme"}
```

`POST /api/auth/login`

```json
{"email":"demo@example.com","password":"demo12345"}
```

## Projects

- `GET /api/projects`
- `POST /api/projects`

```json
{"name":"Billing","description":"Billing jobs"}
```

## Queues

- `GET /api/queues?project_id=1`
- `POST /api/queues`
- `PATCH /api/queues/{id}`

```json
{
  "project_id": 1,
  "retry_policy_id": 1,
  "name": "critical",
  "priority": 20,
  "concurrency_limit": 4,
  "paused": false
}
```

## Jobs

`GET /api/jobs?queue_id=1&status=queued&kind=immediate&limit=50&offset=0`

`POST /api/jobs`

Immediate:

```json
{"queue_id":1,"kind":"immediate","payload":{"sleep_ms":200}}
```

Delayed:

```json
{"queue_id":1,"kind":"delayed","delay_seconds":60,"payload":{"email":"a@example.com"}}
```

Scheduled:

```json
{"queue_id":1,"kind":"scheduled","run_at":"2026-07-02T10:00:00+00:00","payload":{}}
```

Recurring:

```json
{"queue_id":1,"kind":"recurring","cron":"@every 60s","payload":{}}
```

Batch:

```json
{
  "queue_id": 1,
  "batch_id": "import-42",
  "jobs": [
    {"payload":{"row":1}},
    {"payload":{"row":2}}
  ]
}
```

Retry failed or dead-lettered job:

`POST /api/jobs/{id}/retry`

## Workers, Logs, Metrics

- `GET /api/workers`
- `GET /api/logs?job_id=1&limit=30`
- `GET /api/metrics`
