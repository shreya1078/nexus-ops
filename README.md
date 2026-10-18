# Nexus Ops

**Nexus Ops** is an internal operations management application engineered for the **Newtonite Software Engineering Challenge: Operations Under Pressure**.

Newtonite historically managed mission-critical operational work through ad-hoc chat channels, emails, and disconnected spreadsheets—leading to missed handoffs, unclear ticket ownership, untracked dependencies, and unverified approval bypasses. Nexus Ops provides a unified command center for cross-functional teams (Customer Operations, People Ops, FinOps, Compliance, and Security) to coordinate work items, enforce stage-gate workflows, prevent conflicting edits, and audit operational decisions.

---

## 1. Features

- **Work Item Management**: Full lifecycle management of operational issues (create, triage, edit, reassign, priority escalation, and resolution).
- **Team & Project Separation**: Independent organization of teams and project workspaces. Team membership does not implicitly grant project access without explicit authorization.
- **Kanban Board & Issues Workspace**: Interactive 5-stage Kanban board (*Open*, *In Progress*, *In Review*, *Blocked*, *Done*) and data table with server-side pagination, sorting, and multi-field filtering.
- **Personalized Workflows ("My Work")**: Dedicated view showing assignments across all authorized projects, filtered by priority, status, and due date.
- **Collaboration & Audit Timeline**: Segregated issue comments with real-time editing and an immutable activity timeline recording actors, actions, and timestamps.
- **Enforced Approval Gates**: Formal sign-off workflow for high-risk operations (e.g., regulatory compliance, financial overrides). Requires designated approver authority, prevents self-approval, and enforces mandatory justification on rejection.
- **Optimistic Concurrency Control (OCC)**: Version-checked updates prevent concurrent operators from silently overwriting recent changes.
- **Duplicate Operation Defense**: Idempotency token registry ensures retried submissions and duplicate clicks do not produce duplicate records or double sign-offs.

---

## 2. Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4 (incorporating Google Stitch design tokens and typography).
- **Backend**: Node.js, Express 4, TypeScript via `tsx`.
- **Database**: SQLite WebAssembly (`sql.js`) with synchronous binary file persistence to `./data/nexus_ops.db`.
- **Testing**: Node.js built-in test runner (`node:test`) and strict assertions (`node:assert/strict`).
- **Build & Development**: Vite 8 with Express middleware integration.

---

## 3. Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ / v22+ recommended).
- **npm**: v9.0.0 or higher (or `bun` / `yarn`).

---

## 4. Installation and Setup

1. **Clone or enter the project directory**:
   ```bash
   cd /app/applet
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   Copy `.env.example` to `.env` (optional, default values run out-of-the-box):
   ```bash
   cp .env.example .env
   ```

   `.env` values:
   ```bash
   PORT=3000
   NODE_ENV=development
   ```

4. **Start the application**:
   ```bash
   npm run dev
   ```

5. **Access the application**:
   Open `http://localhost:3000` in your browser. Both the API and the frontend are served from this single unified server process.

---

## 5. Database and Persistence

- **Engine**: Nexus Ops uses `sql.js`, the official SQLite engine compiled to WebAssembly. This delivers full relational SQL capabilities (foreign keys, ACID transactions, indexes, and constraints) without requiring external database daemons.
- **File Storage**: The database binary state is automatically persisted to `./data/nexus_ops.db`.
- **Initialization & Migrations**: On server startup, schema migrations create all relational tables (`users`, `teams`, `team_memberships`, `projects`, `project_memberships`, `issues`, `comments`, `activity_history`, `approvals`, `idempotency_keys`) and high-performance querying indexes.
- **Seeding**: If the database is fresh, canonical demo fixtures matching the operations center scenarios are populated automatically.
- **Resetting Demo Data**: You can reset the database to its pristine state via **Administration & Settings** -> **Reset Demo Data**, or by sending `POST /api/system/reset-demo`.
- **Persistence Architecture & Limitations**: Each write transaction triggers a synchronous binary buffer export to disk. While ideal for single-instance container sandboxes, horizontal multi-instance scaling requires migrating to a client-server relational database (e.g. PostgreSQL) to avoid split-brain writes.

---

## 6. Authentication and Authorization

### Authentication
- A dedicated **Sign In** screen protects all application views and APIs.
- User passwords are secure: salted and hashed using PBKDF2 with SHA-256 (1,000 iterations, 32-byte key length).
- Authenticated requests use cryptographically random 32-byte bearer tokens stored in the `sessions` table with a 30-day sliding expiry.
- Unauthenticated requests receive `401 Unauthorized`.

### Development & Test Shortcut Safeguards
- For automated testing and persona switching in development mode, the server accepts an `x-user-id` header.
- **Security Safeguard**: This fallback is strictly barred when `NODE_ENV === 'production'`, preventing client-side user impersonation in production environments.

### Authorization Model
- **Administrator**: Global system and user administrative oversight.
- **Operation Head**: Cross-team operational visibility across standard internal projects, but barred from isolated partner environments (`proj_isolated`).
- **Team Lead**: Management and issue assignment within projects owned by their primary team.
- **Team Member**: Access scoped strictly to explicitly provisioned project memberships.
- **Designated Approver**: Required for approval decisions. A user's role (even Admin or Operation Head) does not grant approver status unless explicitly flagged as `is_approver = 1`.

---

## 7. Demo Accounts

All pre-seeded demo accounts share the standard password: `Password123!`. Quick-select buttons are provided on the login card.

| User / Email | Title | System Role | Approver Status | Permissions Scope |
|---|---|---|---|---|
| `shreya.lavani@nexusops.internal` | Operation Head | `operation_head` | **Yes** | Full operational oversight over internal pipelines |
| `rahul.v@nexusops.internal` | Customer Ops Tier 3 Lead | `team_lead` | **Yes** | Lead for Customer Ops; designated approver |
| `maya.t@nexusops.internal` | People Ops Specialist | `team_member` | **No** | People Ops project member |
| `alex.c@nexusops.internal` | FinOps Specialist | `team_member` | **No** | FinOps project member |
| `priya.k@nexusops.internal` | Compliance Analyst | `team_member` | **No** | Read-only compliance auditor |
| `elena.r@nexusops.internal` | Operations Analyst | `team_member` | **No** | Customer Ops member |
| `admin@nexusops.internal` | Chief Security Officer | `admin` | **Yes** | System configuration, user administration |
| `guest.vendor@external.internal` | Logistics Contractor | `team_member` | **No** | Restricted to isolated partner sandbox (`proj_isolated`) |

---

## 8. API and Important Behavior

All endpoints are mounted under `/api` and return standardized JSON responses.

### Key Endpoints
- `POST /api/auth/login`: Authenticate with email/password; returns session token and user profile.
- `POST /api/auth/logout`: Revoke active session token.
- `POST /api/auth/switch-user`: Issue a valid session token for persona testing.
- `GET /api/me`: Retrieve current profile, teams, and authorized projects.
- `GET /api/dashboard`: Aggregated KPI counters and urgent blockers matching user permissions.
- `GET /api/issues`: Paginated issues list with `status`, `priority`, `assigneeId`, `projectId`, and `search` filters.
- `POST /api/issues`: Create an issue. Requires project authorization. Supports `Idempotency-Key` header.
- `PATCH /api/issues/:id`: Update issue attributes. Requires `version` property for optimistic concurrency.
- `POST /api/issues/:id/comments`: Post a comment. Requires project viewer access.
- `GET /api/approvals`: List approval requests scoped to current approver or requester.
- `POST /api/approvals/:id/decide`: Approve or reject a request. Supports `Idempotency-Key` header.

### Standard HTTP Status Responses
- `400 Bad Request`: Validation failure (empty field, invalid workflow transition stage, missing rejection reason).
- `401 Unauthorized`: Missing, expired, or invalid session token.
- `403 Forbidden`: Insufficient permissions (unauthorized project access, non-approver attempting sign-off, or self-approval attempt).
- `404 Not Found`: Resource does not exist.
- `409 Conflict`: Concurrency conflict (stale issue version) or conflicting approval decision attempt on an already finalized record.

---

## 9. Testing

The repository includes automated correctness and security regression tests:

```bash
npm test
```

### Verified Correctness Scenarios
1. **Resource Authorization Boundaries**: Confirms Operation Head can manage authorized projects while external contractors and unauthorized team members receive `403 Forbidden` (`UNAUTHORIZED_PROJECT_ACCESS`).
2. **Optimistic Concurrency Control**: Confirms that submitting an update with a stale version number triggers `409 Conflict`, preventing silent overwrites.
3. **Idempotency Protection**: Confirms that duplicate submissions with identical idempotency keys return the cached response without creating duplicate database rows.
4. **Approval Gate Defense**: Confirms that an issue requiring approval cannot be transitioned to `Done` while approval is pending (`APPROVAL_REQUIRED_BYPASS_PREVENTED`), and succeeds once approved.
5. **Designated Approver Rules & Self-Approval Block**: Confirms request initiators cannot self-approve (`SELF_APPROVAL_PROHIBITED`), non-approvers are rejected (`UNAUTHORIZED_APPROVER`), and finalized decisions cannot be re-decided.
6. **Authentication & Session Lifecycle**: Confirms PBKDF2 password verification and session expiration handling.

*Test Execution Status*: All 14 tests in 7 suites pass synchronously.

---

## 10. Known Limitations

1. **Single-Process Relational Persistence**: SQLite WASM synchronizes the binary database buffer to disk on write. This design is robust for single-node deployments but cannot coordinate writes across multiple horizontally scaled servers without a centralized database like PostgreSQL.
2. **Simulated Real-Time Synchronization**: The UI reflects live optimistic updates and refreshes data on mutation. Cross-tab real-time sync is simulated; native WebSockets or Server-Sent Events (SSE) would be needed for distributed live broadcasts.
3. **Synchronous Mutation Processing**: Approval and issue updates process synchronously. At higher scale (thousands of operations per second), background task queues (e.g. BullMQ / Redis) would handle asynchronous notifications and downstream webhooks.

---

## 11. Engineering Decisions

For an in-depth analysis of architectural trade-offs, concurrency defense, and database selection, refer to [ENGINEERING_DECISIONS.md](./ENGINEERING_DECISIONS.md).
