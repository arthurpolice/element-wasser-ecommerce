# QStash message queue boundary

Element Wasser may use QStash for deferred and retried backend work such as fulfillment actions, stock-reservation cleanup, review invites, or other jobs that should not block an interactive request.

Status: accepted

## Decision

Use tRPC procedures as the app-facing entry point for enqueueing work when the action is triggered by the storefront, Customer Area, owner dashboard, or other internal application flows.

Use dedicated Next.js route handlers under `src/app/api/qstash/` as the QStash delivery targets. QStash should call stable HTTP endpoints such as `/api/qstash/orders/fulfill`, not `/api/trpc`.

Keep queue publishing, job payload schemas, and job execution logic in shared server modules rather than embedding the business operation directly in either boundary:

```text
src/server/queue/qstash.ts
src/server/jobs/<job-name>.ts
src/app/api/qstash/<job-name>/route.ts
src/server/api/routers/<domain-router>.ts
```

A tRPC mutation should validate the user session and role, perform any required synchronous database changes, and publish a QStash message. The QStash route handler should verify the QStash signature, validate the payload, and call an idempotent job handler.

For jobs initiated outside the app UI, such as schedules or third-party webhooks, skip tRPC and publish directly from the owning server route or scheduler integration.

## Considered Options

**Deliver QStash messages into tRPC procedures** was rejected because QStash is an external HTTP caller with webhook-style concerns: signature verification, retries, idempotency, and stable endpoint URLs. Those concerns fit Next.js route handlers better than the app-facing RPC layer.

**Put all queue logic in Next.js route handlers** was rejected because user-initiated actions still need the repository's existing tRPC ergonomics: typed inputs, owner/customer authorization, React Query integration, and consistent app-facing error handling.

**Put business logic directly in both tRPC and route handlers** was rejected because queue retries and interactive calls would drift. The operation should live in a reusable server job or commerce module that both boundaries can call when appropriate.

## Consequences

QStash endpoint files must be treated as external integration boundaries. They should not rely on browser session cookies or tRPC context. They must verify QStash request signatures before executing work.

Job handlers must be idempotent because QStash can retry delivery. Prefer durable state transitions, unique operation identifiers, or database constraints over in-memory guards.

Published payloads should be small and durable. Prefer identifiers such as order IDs over large mutable snapshots unless the job specifically needs a point-in-time copy.

Interactive requests should not assume that enqueued work has completed. UI flows should represent the durable state that was written before publishing the message, then update when the deferred job changes state.

Tests should cover the shared job handler separately from the HTTP route. Route-level tests should focus on signature handling, payload validation, and response status behavior.
