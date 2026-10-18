# Nexus Ops — Engineering Decisions & Architectural Trade-offs

This document details five key architectural decisions made during the design and implementation of **Nexus Ops** for the *Newtonite Software Engineering Challenge: Operations Under Pressure*.

---

## Decision 1: Relational Database Strategy — SQLite WASM (`sql.js`) with Synchronous Disk Persistence

### The Problem
The challenge mandates a persistent relational database supporting ACID transactions, foreign key integrity, indexes, and server-side filtering/pagination. However, evaluation takes place inside lightweight containerized environments where running an external PostgreSQL daemon introduces port conflicts, daemon startup delays, and environment configuration friction.

### Chosen Approach
We implemented an embedded relational database using **`sql.js`** (the official SQLite engine compiled to WebAssembly) with synchronous binary disk export to `./data/nexus_ops.db`.
- Foreign key constraints are explicitly enforced (`PRAGMA foreign_keys = ON;`).
- Indexed queries (`idx_issues_project_id`, `idx_issues_status`, `idx_approvals_issue_id`) ensure fast server-side pagination and filtering.
- Every mutating transaction exports the database state to disk, surviving server restarts.

### Alternatives Considered
1. **External PostgreSQL Container**: Required external services or Docker-in-Docker setup, adding heavy dependencies and potential network connection failure modes for evaluators.
2. **`better-sqlite3` Native Addon**: Failed compilation during dependency install due to lack of `node-gyp` and Python build toolchains in the evaluation container.
3. **In-Memory Arrays or LocalStorage**: Fails persistence and relational foreign key requirements.

### Trade-offs & Limitations
- *Benefits*: 100% portable, zero setup friction, fast startup, deterministic test runs, and complete SQL relational integrity.
- *Limitations*: The entire database is loaded into memory, and every mutation writes the full binary buffer to disk. This is suitable for tens of thousands of records (~10-50MB), but not suitable for hundreds of gigabytes.

### Evolution at Scale
If Nexus Ops scales to millions of work items and hundreds of concurrent distributed workers, we would migrate to a managed **PostgreSQL** cluster with **PgBouncer** connection pooling and read replicas. The SQL schema and queries in `src/server/db.ts` were intentionally designed with standard ANSI SQL to make this transition seamless.

---

## Decision 2: Backend-Enforced Authorization Matrix Across Teams & Projects

### The Problem
In an enterprise operations center, users belong to multiple functional teams (Customer Ops, FinOps, People Ops, Compliance) and work across multiple projects. Team membership must not automatically grant access to every project unless explicitly configured. Furthermore, security cannot rely on hiding frontend buttons; every API endpoint must strictly enforce resource-level access.

### Chosen Approach
We implemented a multi-tiered authorization matrix evaluated in the backend service layer (`src/server/auth.ts:checkProjectAccess`):
1. **System Administrator**: Full administrative scope across all projects and system settings.
2. **Explicit Project Membership**: Takes highest priority. If a user has a `project_memberships` record with role `admin`, `editor`, or `viewer`, their operations are strictly bound by that tier.
3. **Operation Head**: Granted cross-team operational visibility over core operational pipelines, but strictly barred from isolated partner sandboxes (`proj_isolated`).
4. **Team Leads**: Granted editor access to projects explicitly owned by their primary team.
5. **Team Members**: Granted access *only* when explicit project membership is provisioned.

### Alternatives Considered
- *Flat Role-Based Access Control (RBAC)*: Giving all "Team Members" equal access across all projects would breach tenant isolation (e.g., leaking Customer Operations data to external partners).
- *Frontend-Only Route Guards*: Hiding UI buttons without backend verification would allow unauthorized users to query or mutate records via direct API requests.

### Trade-offs & Limitations
- *Benefits*: True resource-level isolation. Unauthorized requests return `403 Forbidden` (`UNAUTHORIZED_PROJECT_ACCESS`), thoroughly verified by automated tests.
- *Limitations*: Requires joining against `project_memberships` and `team_memberships` on each request.

### Evolution at Scale
At higher request volumes, user project permissions would be cached in a distributed in-memory store (e.g. Redis) using signed capability tokens or JSON Web Tokens (JWTs) with short TTLs to eliminate repeated database permission queries.

---

## Decision 3: Optimistic Concurrency Control (OCC) via Incremental Record Versioning

### The Problem
In high-pressure operations centers, multiple incident commanders and operators frequently triage the same tickets simultaneously. If Operator A marks an issue as "Blocked" with a vendor ticket link while Operator B simultaneously reassigns the issue to Tier-3, a naïve `UPDATE` query would silently overwrite Operator A's changes.

### Chosen Approach
We implemented **Optimistic Concurrency Control (OCC)** using an integer `version` column on the `issues` table:
- When a client retrieves an issue, it receives its current `version` (e.g., `v1`).
- When sending updates (`PATCH /api/issues/:id`), the client must provide `version: expected_version`.
- The backend checks `current_version === expected_version`.
- If another update committed in the interim, the backend aborts the update and returns `409 Conflict` with `CONCURRENCY_CONFLICT` and the newest record state.
- The UI handles the 409 response by notifying the user and preserving their unsaved inputs for reconciliation.

### Alternatives Considered
- *Pessimistic Locking (`SELECT FOR UPDATE`)*: Holding database locks while users edit tickets in browser forms leads to lock contention, timeout cascades, and degraded user experience.
- *Last-Write-Wins (LWW)*: Silently corrupts operational incident logs and erases critical blocker information during live triage.

### Trade-offs & Limitations
- *Benefits*: Zero lock overhead, high read throughput, and guaranteed data integrity during concurrent triaging.
- *Limitations*: Requires client components to maintain version state and implement conflict resolution flows.

### Evolution at Scale
For collaborative environments requiring real-time multi-user editing within long descriptions, we would supplement OCC with Operational Transformation (OT) or Conflict-Free Replicated Data Types (CRDTs) for field-level merge resolution.

---

## Decision 4: Idempotency Key Registry for Critical Operations

### The Problem
During incident surges or network instability, operators may double-click submission buttons or client HTTP libraries may automatically retry timed-out requests. Without duplicate defenses, this results in duplicate ticket creation, repeated comment threads, or conflicting approval decisions.

### Chosen Approach
We implemented an **Idempotency Token Registry** using an `idempotency_keys` table:
- Critical endpoints (`POST /api/issues`, `POST /api/approvals/:id/decide`) accept an `Idempotency-Key` HTTP header.
- On receipt, the server checks if the key was already processed.
- If found, it immediately returns the cached HTTP response payload with status `200 OK` without re-executing business logic or inserting duplicate database rows.
- If new, the operation executes within a transaction and the response payload is cached alongside the key.

### Alternatives Considered
- *Frontend Button Disabling Only*: Helps prevent double clicks, but fails against network disconnect retries, multi-tab submissions, or programmatic API clients.
- *Natural Key Constraints (e.g. unique issue titles)*: Overly rigid; legitimate operations frequently reuse titles across different days or incidents.

### Trade-offs & Limitations
- *Benefits*: Prevents duplicate tickets, duplicate approvals, and duplicate financial adjustments.
- *Limitations*: In the current implementation, idempotency keys are stored in the SQLite database indefinitely without automated TTL purging.

### Evolution at Scale
In a large-scale deployment, idempotency tokens would be stored in **Redis** with an automated 24-hour Time-To-Live (TTL) using atomic `SET NX EX` commands, preventing table bloat in the primary relational database.

---

## Decision 5: Non-Bypassable Operational Approval Gates with Self-Approval Prevention

### The Problem
Certain mission-critical operations (such as high-value billing adjustments, access provisioning, or compliance sign-offs) require explicit authorization before completion. A major organizational vulnerability is operators bypassing the approval gate by directly marking issues as "Done", or request initiators signing off on their own submissions.

### Chosen Approach
We decoupled approval state into a dedicated `approvals` table and enforced two strict invariants:
1. **Approval Gate Bypass Defense (`validateWorkflowTransition`)**:
   - If an issue has `requires_approval = 1`, any attempt to transition status to `Done` is strictly rejected with `HTTP 400 Bad Request` (`APPROVAL_REQUIRED_BYPASS_PREVENTED`) unless `approval_status === 'APPROVED'`.
2. **Designated Approver Authority & Self-Approval Prevention (`canMakeApprovalDecision`)**:
   - The backend enforces `approval.requester_id !== user.id`. If a requester attempts to authorize their own request, the request is rejected with `HTTP 403 Forbidden` (`SELF_APPROVAL_PROHIBITED`).
   - The user must explicitly possess `is_approver = 1`. A user's title or administrative role alone does not grant approver privileges.
   - Rejections require a mandatory operational justification (`decision_reason` >= 5 characters) to ensure clear audit trails.
   - Once finalized (`APPROVED` or `REJECTED`), decisions cannot be overwritten or conflicted (`APPROVAL_ALREADY_DECIDED`).

### Alternatives Considered
- *Soft Warnings / Confirm Dialogs*: Relying on client-side confirmation dialogs is insecure and trivially bypassed.
- *Separate Approvals Microservice*: Introduces distributed transaction overhead and distributed state coordination issues for an internal tool.

### Trade-offs & Limitations
- *Benefits*: Complete auditability, tamper-proof state machine, and defense against unauthorized privilege escalation.
- *Limitations*: Requires a secondary designated approver to be available to avoid blocking urgent workflows.

### Evolution at Scale
For enterprise compliance (e.g. SOC 2, SOX), we would introduce multi-party approval quorums (e.g., 2 of 3 required signatures), automated SLA escalation timers, and integration with enterprise identity providers (SAML/Okta) for step-up multi-factor authentication on approval decisions.
