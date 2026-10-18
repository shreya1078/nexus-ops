import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let dbInstance: Database | null = null;
const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.resolve(DB_DIR, 'nexus_ops.db');

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, s, 1000, 32, 'sha256').toString('hex');
  return { hash, salt: s };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  if (!password || !hash || !salt) return false;
  const computed = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
  return computed === hash;
}

export async function getDatabase(): Promise<Database> {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      dbInstance = new SQL.Database(fileBuffer);
    } catch (err) {
      console.warn('Failed to load existing database file, creating fresh instance:', err);
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  // Enforce foreign keys
  dbInstance.run('PRAGMA foreign_keys = ON;');

  // Run migrations & initial seed
  runMigrations(dbInstance);
  persistDatabase();

  return dbInstance;
}

export function persistDatabase(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Failed to persist database to disk:', err);
  }
}

function runMigrations(db: Database): void {
  // Create tables if not exist
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      system_role TEXT NOT NULL, -- 'admin', 'operation_head', 'team_lead', 'team_member'
      title TEXT NOT NULL,
      is_approver INTEGER NOT NULL DEFAULT 0,
      avatar_bg TEXT NOT NULL DEFAULT '#000000',
      password_hash TEXT,
      password_salt TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      description TEXT,
      lead_user_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_memberships (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_role TEXT NOT NULL, -- 'lead', 'member'
      created_at TEXT NOT NULL,
      UNIQUE(team_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      description TEXT,
      lead_user_id TEXT REFERENCES users(id),
      primary_team_id TEXT REFERENCES teams(id),
      status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived'
      issue_counter INTEGER NOT NULL DEFAULT 120,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_memberships (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      access_level TEXT NOT NULL, -- 'admin', 'editor', 'viewer'
      created_at TEXT NOT NULL,
      UNIQUE(project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL, -- 'Open', 'In Progress', 'In Review', 'Blocked', 'Done'
      priority TEXT NOT NULL, -- 'LOW', 'MED', 'HIGH', 'URGENT'
      assignee_id TEXT REFERENCES users(id),
      creator_id TEXT NOT NULL REFERENCES users(id),
      due_date TEXT,
      due_label TEXT,
      blocked_reason TEXT,
      requires_approval INTEGER NOT NULL DEFAULT 0,
      approval_status TEXT NOT NULL DEFAULT 'NONE', -- 'NONE', 'PENDING', 'APPROVED', 'REJECTED'
      approval_policy_code TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      is_edited INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_history (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      requester_id TEXT NOT NULL REFERENCES users(id),
      assigned_approver_id TEXT NOT NULL REFERENCES users(id),
      policy_code TEXT NOT NULL,
      policy_description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
      decision_reason TEXT,
      decided_at TEXT,
      decided_by_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      response_payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Indices for high-performance server-side querying and scale
    CREATE INDEX IF NOT EXISTS idx_issues_project_id ON issues(project_id);
    CREATE INDEX IF NOT EXISTS idx_issues_assignee_id ON issues(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
    CREATE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority);
    CREATE INDEX IF NOT EXISTS idx_comments_issue_id ON comments(issue_id);
    CREATE INDEX IF NOT EXISTS idx_activity_issue_id ON activity_history(issue_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_issue_id ON approvals(issue_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_approver ON approvals(assigned_approver_id, status);
  `);

  // Ensure backward compatibility if users table existed prior to password hashing
  try {
    const tableInfo = db.exec('PRAGMA table_info(users);');
    if (tableInfo.length > 0) {
      const colNames = tableInfo[0].values.map((v: any[]) => v[1]);
      if (!colNames.includes('password_hash')) {
        db.run('ALTER TABLE users ADD COLUMN password_hash TEXT;');
      }
      if (!colNames.includes('password_salt')) {
        db.run('ALTER TABLE users ADD COLUMN password_salt TEXT;');
      }
    }
  } catch (e) {
    // ignore
  }

  // Check if users exist; if not, seed realistic data matching Stitch mockups
  const userCountResult = db.exec('SELECT COUNT(*) as count FROM users');
  const userCount = userCountResult.length > 0 ? (userCountResult[0].values[0][0] as number) : 0;

  if (userCount === 0) {
    seedDatabase(db);
  }
}

export function seedDatabase(db: Database): void {
  // Clear any existing tables in proper order
  db.run('DELETE FROM sessions');
  db.run('DELETE FROM comments');
  db.run('DELETE FROM activity_history');
  db.run('DELETE FROM approvals');
  db.run('DELETE FROM issues');
  db.run('DELETE FROM project_memberships');
  db.run('DELETE FROM projects');
  db.run('DELETE FROM team_memberships');
  db.run('DELETE FROM teams');
  db.run('DELETE FROM users');
  db.run('DELETE FROM idempotency_keys');

  // Insert Users with standard demo credentials (Password: Password123!)
  const defaultPassword = 'Password123!';
  const { hash: defaultHash, salt: defaultSalt } = hashPassword(defaultPassword);

  const users = [
    {
      id: 'usr_shreya',
      email: 'shreya.lavani@nexusops.internal',
      name: 'Shreya Lavani',
      initials: 'SL',
      system_role: 'operation_head',
      title: 'Operation Head',
      is_approver: 1,
      avatar_bg: '#000000'
    },
    {
      id: 'usr_rahul',
      email: 'rahul.v@nexusops.internal',
      name: 'Rahul V.',
      initials: 'RV',
      system_role: 'team_lead',
      title: 'Customer Ops Tier 3 Lead',
      is_approver: 1,
      avatar_bg: '#1b1b1e'
    },
    {
      id: 'usr_maya',
      email: 'maya.t@nexusops.internal',
      name: 'Maya T.',
      initials: 'MT',
      system_role: 'team_member',
      title: 'People Ops Specialist',
      is_approver: 0,
      avatar_bg: '#47464b'
    },
    {
      id: 'usr_alex',
      email: 'alex.c@nexusops.internal',
      name: 'Alex C.',
      initials: 'AC',
      system_role: 'team_member',
      title: 'FinOps Specialist',
      is_approver: 0,
      avatar_bg: '#5f5e61'
    },
    {
      id: 'usr_priya',
      email: 'priya.k@nexusops.internal',
      name: 'Priya K.',
      initials: 'PK',
      system_role: 'team_member',
      title: 'Compliance Analyst',
      is_approver: 0,
      avatar_bg: '#77767b'
    },
    {
      id: 'usr_elena',
      email: 'elena.r@nexusops.internal',
      name: 'Elena R.',
      initials: 'ER',
      system_role: 'team_member',
      title: 'Operations Analyst',
      is_approver: 0,
      avatar_bg: '#2f3038'
    },
    {
      id: 'usr_admin',
      email: 'admin@nexusops.internal',
      name: 'System Administrator',
      initials: 'SA',
      system_role: 'admin',
      title: 'Chief Security Officer & Admin',
      is_approver: 1,
      avatar_bg: '#000000'
    },
    {
      id: 'usr_restricted',
      email: 'guest.vendor@external.internal',
      name: 'Restricted Partner',
      initials: 'RP',
      system_role: 'team_member',
      title: 'External Logistics Contractor',
      is_approver: 0,
      avatar_bg: '#77767b'
    }
  ];

  for (const u of users) {
    db.run(
      `INSERT INTO users (id, email, name, initials, system_role, title, is_approver, avatar_bg, password_hash, password_salt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-30 days'))`,
      [u.id, u.email, u.name, u.initials, u.system_role, u.title, u.is_approver, u.avatar_bg, defaultHash, defaultSalt]
    );
  }

  // Insert Teams
  const teams = [
    {
      id: 'team_cust_ops',
      name: 'Customer Operations',
      code: 'CUST-OPS',
      description: 'Customer journey, payment dispute resolutions, enterprise escalations, and SLA triage.',
      lead_user_id: 'usr_rahul'
    },
    {
      id: 'team_fin_ops',
      name: 'Finance Operations',
      code: 'FIN-OPS',
      description: 'Payment gateways, invoicing, tax compliance, and automated refund pipelines.',
      lead_user_id: 'usr_alex'
    },
    {
      id: 'team_compliance',
      name: 'Compliance & Risk',
      code: 'COMP',
      description: 'SOC2 audits, KYC verification checkpoints, and regulatory oversight.',
      lead_user_id: 'usr_priya'
    },
    {
      id: 'team_engineering',
      name: 'Core Platform Engineering',
      code: 'ENG',
      description: 'Webhook triggers, API gateway integrations, and telemetry sync infrastructure.',
      lead_user_id: 'usr_admin'
    }
  ];

  for (const t of teams) {
    db.run(
      `INSERT INTO teams (id, name, code, description, lead_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', '-30 days'))`,
      [t.id, t.name, t.code, t.description, t.lead_user_id]
    );
  }

  // Insert Team Memberships
  const memberships = [
    { team_id: 'team_cust_ops', user_id: 'usr_shreya', role: 'lead' },
    { team_id: 'team_cust_ops', user_id: 'usr_rahul', role: 'lead' },
    { team_id: 'team_cust_ops', user_id: 'usr_maya', role: 'member' },
    { team_id: 'team_cust_ops', user_id: 'usr_alex', role: 'member' },
    { team_id: 'team_cust_ops', user_id: 'usr_elena', role: 'member' },

    { team_id: 'team_fin_ops', user_id: 'usr_shreya', role: 'lead' },
    { team_id: 'team_fin_ops', user_id: 'usr_alex', role: 'lead' },
    { team_id: 'team_fin_ops', user_id: 'usr_priya', role: 'member' },

    { team_id: 'team_compliance', user_id: 'usr_shreya', role: 'lead' },
    { team_id: 'team_compliance', user_id: 'usr_priya', role: 'lead' },
    { team_id: 'team_compliance', user_id: 'usr_maya', role: 'member' },

    { team_id: 'team_engineering', user_id: 'usr_admin', role: 'lead' },
    { team_id: 'team_engineering', user_id: 'usr_rahul', role: 'member' }
  ];

  for (let i = 0; i < memberships.length; i++) {
    const m = memberships[i];
    db.run(
      `INSERT INTO team_memberships (id, team_id, user_id, team_role, created_at)
       VALUES (?, ?, ?, ?, datetime('now', '-25 days'))`,
      [`tm_${i + 1}`, m.team_id, m.user_id, m.role]
    );
  }

  // Insert Projects
  const projects = [
    {
      id: 'proj_cop',
      name: 'Customer Operations',
      key: 'NEX',
      description: 'Manage issues, operational workflows, and critical incident escalation pipelines across customer touchpoints.',
      lead_user_id: 'usr_shreya',
      primary_team_id: 'team_cust_ops'
    },
    {
      id: 'proj_fin',
      name: 'Billing & Payments',
      key: 'FIN',
      description: 'Billing gateway reconciliations, double-charge remediation, and vendor SLA waivers.',
      lead_user_id: 'usr_alex',
      primary_team_id: 'team_fin_ops'
    },
    {
      id: 'proj_sec',
      name: 'Security & Compliance',
      key: 'SEC',
      description: 'Tier-3 access control enforcement, identity verification gateways, and SOC2 audits.',
      lead_user_id: 'usr_priya',
      primary_team_id: 'team_compliance'
    },
    {
      id: 'proj_isolated',
      name: 'Restricted Partner Logistics',
      key: 'PART',
      description: 'Isolated external partner project strictly for vendor logistics sandbox.',
      lead_user_id: 'usr_restricted',
      primary_team_id: 'team_cust_ops'
    }
  ];

  for (const p of projects) {
    db.run(
      `INSERT INTO projects (id, name, key, description, lead_user_id, primary_team_id, status, issue_counter, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 120, datetime('now', '-25 days'))`,
      [p.id, p.name, p.key, p.description, p.lead_user_id, p.primary_team_id]
    );
  }

  // Insert Project Memberships (explicit permissions)
  const projMembers = [
    // proj_cop (Customer Operations)
    { proj: 'proj_cop', user: 'usr_shreya', level: 'admin' },
    { proj: 'proj_cop', user: 'usr_rahul', level: 'editor' },
    { proj: 'proj_cop', user: 'usr_maya', level: 'editor' },
    { proj: 'proj_cop', user: 'usr_alex', level: 'editor' },
    { proj: 'proj_cop', user: 'usr_priya', level: 'viewer' },
    { proj: 'proj_cop', user: 'usr_elena', level: 'editor' },
    { proj: 'proj_cop', user: 'usr_admin', level: 'admin' },

    // proj_fin (Billing & Payments)
    { proj: 'proj_fin', user: 'usr_shreya', level: 'admin' },
    { proj: 'proj_fin', user: 'usr_alex', level: 'admin' },
    { proj: 'proj_fin', user: 'usr_priya', level: 'editor' },
    { proj: 'proj_fin', user: 'usr_admin', level: 'admin' },

    // proj_sec (Security & Compliance)
    { proj: 'proj_sec', user: 'usr_shreya', level: 'admin' },
    { proj: 'proj_sec', user: 'usr_priya', level: 'admin' },
    { proj: 'proj_sec', user: 'usr_admin', level: 'admin' },

    // proj_isolated (Restricted Partner Logistics)
    { proj: 'proj_isolated', user: 'usr_restricted', level: 'editor' },
    { proj: 'proj_isolated', user: 'usr_admin', level: 'admin' }
  ];

  for (let i = 0; i < projMembers.length; i++) {
    const pm = projMembers[i];
    db.run(
      `INSERT INTO project_memberships (id, project_id, user_id, access_level, created_at)
       VALUES (?, ?, ?, ?, datetime('now', '-20 days'))`,
      [`pm_${i + 1}`, pm.proj, pm.user, pm.level]
    );
  }

  // Insert Issues (exactly matching the Stitch mockups and specifications)
  const issues = [
    {
      id: 'NEX-101',
      project_id: 'proj_cop',
      title: 'Customer was charged twice on billing renewal',
      description: 'A customer reported a duplicate $4,200 charge during the automated Q4 renewal cycle. Requires financial adjustment approval and credit reconciliation before closing.',
      status: 'In Review',
      priority: 'HIGH',
      assignee_id: 'usr_rahul',
      creator_id: 'usr_rahul',
      due_date: '2026-10-18T18:00:00Z',
      due_label: 'Due Today',
      blocked_reason: null,
      requires_approval: 1,
      approval_status: 'PENDING',
      approval_policy_code: 'OPS-FIN-99'
    },
    {
      id: 'NEX-102',
      project_id: 'proj_cop',
      title: 'Update employee onboarding verification documents',
      description: 'As part of our updated compliance directives for Q4 employee onboarding, we need to refresh the identity verification document packet to include standard automated proof of address, right-to-work certifications, and explicit tax residence declarations.\n\nTechnical & Operational Deliverables:\n- Audit existing PDF checklist templates across APAC and EMEA operational nodes.\n- Integrate document upload verification checks with the newly ratified encryption vault schemas.\n- Ensure automated Slack webhook notifications fire when candidates submit documentation without unredacted social security records.\n- Secure sign-off from Internal Legal / People Ops leads before deploying to active applicant pipelines.',
      status: 'In Progress',
      priority: 'MED',
      assignee_id: 'usr_maya',
      creator_id: 'usr_shreya',
      due_date: '2026-10-19T17:00:00Z',
      due_label: 'Tomorrow (24h left)',
      blocked_reason: null,
      requires_approval: 0,
      approval_status: 'NONE',
      approval_policy_code: null
    },
    {
      id: 'NEX-104',
      project_id: 'proj_cop',
      title: 'Review tier-3 access permission request',
      description: 'Customer support tier-2 lead requesting elevated read-write permissions to production multi-tenant accounts. Requires explicit security authorization from Operation Head.',
      status: 'In Review',
      priority: 'URGENT',
      assignee_id: 'usr_alex',
      creator_id: 'usr_alex',
      due_date: '2026-10-18T20:00:00Z',
      due_label: 'Due Today',
      blocked_reason: null,
      requires_approval: 1,
      approval_status: 'PENDING',
      approval_policy_code: 'SEC-TIER3-01'
    },
    {
      id: 'NEX-105',
      project_id: 'proj_cop',
      title: 'Update EU vendor VAT registration records',
      description: 'Synchronize 28 updated VAT certificates from the automated VIES validator into the ERP accounting registry.',
      status: 'Open',
      priority: 'MED',
      assignee_id: 'usr_shreya',
      creator_id: 'usr_shreya',
      due_date: '2026-10-24T12:00:00Z',
      due_label: 'Due Oct 24',
      blocked_reason: null,
      requires_approval: 0,
      approval_status: 'NONE',
      approval_policy_code: null
    },
    {
      id: 'NEX-106',
      project_id: 'proj_cop',
      title: 'Customer communication data sync pipeline error',
      description: 'Third-party webhook receiver dropped 142 message receipts due to an expired TLS intermediate certificate on the downstream ingress gateway.',
      status: 'Blocked',
      priority: 'URGENT',
      assignee_id: 'usr_alex',
      creator_id: 'usr_shreya',
      due_date: '2026-10-19T09:00:00Z',
      due_label: 'Blocked: Awaiting vendor hotfix',
      blocked_reason: 'Awaiting vendor hotfix',
      requires_approval: 0,
      approval_status: 'NONE',
      approval_policy_code: null
    },
    {
      id: 'NEX-107',
      project_id: 'proj_cop',
      title: 'Revise support escalation triage matrix',
      description: 'Redefine severity 1 vs severity 2 thresholds for customer payment gateway downtime scenarios across European shifts.',
      status: 'In Progress',
      priority: 'HIGH',
      assignee_id: 'usr_rahul',
      creator_id: 'usr_rahul',
      due_date: '2026-10-22T17:00:00Z',
      due_label: 'Due in 4 days',
      blocked_reason: null,
      requires_approval: 0,
      approval_status: 'NONE',
      approval_policy_code: null
    },
    {
      id: 'NEX-108',
      project_id: 'proj_cop',
      title: 'Authorize supplier contract revision for logistics',
      description: 'Annual SLA renegotiation with primary APAC freight forwarder. Terms reviewed by procurement, pending Ops Head sign-off.',
      status: 'Open',
      priority: 'MED',
      assignee_id: 'usr_shreya',
      creator_id: 'usr_elena',
      due_date: '2026-10-26T17:00:00Z',
      due_label: 'Due Oct 26',
      blocked_reason: null,
      requires_approval: 0,
      approval_status: 'NONE',
      approval_policy_code: null
    },
    {
      id: 'NEX-109',
      project_id: 'proj_cop',
      title: 'Security verification checklist review',
      description: 'Conduct bi-weekly operational review of multi-factor authentication enforcement compliance for all support personnel.',
      status: 'In Review',
      priority: 'HIGH',
      assignee_id: 'usr_shreya',
      creator_id: 'usr_priya',
      due_date: '2026-10-20T17:00:00Z',
      due_label: 'Due Oct 20',
      blocked_reason: null,
      requires_approval: 0,
      approval_status: 'NONE',
      approval_policy_code: null
    },
    {
      id: 'NEX-110',
      project_id: 'proj_cop',
      title: 'Self-service tier-2 ticket routing policy',
      description: 'Configure automated Zendesk triage macros for enterprise SLA tickets based on customer account tier tags.',
      status: 'Open',
      priority: 'LOW',
      assignee_id: null,
      creator_id: 'usr_rahul',
      due_date: '2026-10-29T17:00:00Z',
      due_label: 'Due Oct 29',
      blocked_reason: null,
      requires_approval: 0,
      approval_status: 'NONE',
      approval_policy_code: null
    },
    {
      id: 'NEX-112',
      project_id: 'proj_cop',
      title: 'Payroll direct deposit processing exception',
      description: 'SEPA batch export returned 3 invalid IBAN checksums for newly onboarded contractors. Critical payroll cutoff today.',
      status: 'Open',
      priority: 'URGENT',
      assignee_id: 'usr_shreya',
      creator_id: 'usr_maya',
      due_date: '2026-10-28T17:00:00Z',
      due_label: 'Due Oct 28',
      blocked_reason: null,
      requires_approval: 0,
      approval_status: 'NONE',
      approval_policy_code: null
    },
    {
      id: 'NEX-113',
      project_id: 'proj_cop',
      title: 'Customer account merger conflict remediation',
      description: 'Resolve primary contact and billing owner conflicts during enterprise consolidation of two regional subsidiaries.',
      status: 'In Progress',
      priority: 'HIGH',
      assignee_id: 'usr_shreya',
      creator_id: 'usr_rahul',
      due_date: '2026-10-21T17:00:00Z',
      due_label: 'Due Oct 21',
      blocked_reason: null,
      requires_approval: 0,
      approval_status: 'NONE',
      approval_policy_code: null
    },
    {
      id: 'NEX-114',
      project_id: 'proj_cop',
      title: 'Enterprise client onboarding checklist signoff',
      description: 'Successfully verified all 45 security questions, single sign-on assertions, and custom data processing agreements for Acme Global.',
      status: 'Done',
      priority: 'MED',
      assignee_id: 'usr_shreya',
      creator_id: 'usr_shreya',
      due_date: '2026-10-18T10:00:00Z',
      due_label: 'Completed Today',
      blocked_reason: null,
      requires_approval: 0,
      approval_status: 'NONE',
      approval_policy_code: null
    },
    {
      id: 'NEX-115',
      project_id: 'proj_cop',
      title: 'Vendor SLA Waiver signoff',
      description: 'Temporary 48-hour SLA buffer requested by identity verification vendor during scheduled database partition migration.',
      status: 'In Review',
      priority: 'MED',
      assignee_id: 'usr_priya',
      creator_id: 'usr_alex',
      due_date: '2026-10-21T12:00:00Z',
      due_label: 'Due Oct 21',
      blocked_reason: null,
      requires_approval: 1,
      approval_status: 'PENDING',
      approval_policy_code: 'OPS-SLA-44'
    },
    {
      id: 'NEX-116',
      project_id: 'proj_cop',
      title: 'Third-party identity verification gateway timeout',
      description: 'REST API calls to KYC provider failing with HTTP 504 Gateway Timeout during peak European verification hours.',
      status: 'Blocked',
      priority: 'HIGH',
      assignee_id: 'usr_priya',
      creator_id: 'usr_maya',
      due_date: '2026-10-19T14:00:00Z',
      due_label: 'Blocked: Gateway API 504',
      blocked_reason: 'Gateway API 504',
      requires_approval: 0,
      approval_status: 'NONE',
      approval_policy_code: null
    },
    {
      id: 'NEX-118',
      project_id: 'proj_cop',
      title: 'Vendor API rate limit adjustment request',
      description: 'Requesting quota increase from 100 req/sec to 350 req/sec from payment gateway provider ahead of Black Friday operational surge.',
      status: 'Open',
      priority: 'MED',
      assignee_id: 'usr_alex',
      creator_id: 'usr_alex',
      due_date: '2026-10-25T17:00:00Z',
      due_label: 'Due Oct 25',
      blocked_reason: null,
      requires_approval: 0,
      approval_status: 'NONE',
      approval_policy_code: null
    },
    {
      id: 'NEX-098',
      project_id: 'proj_cop',
      title: 'Deploy monthly operational reconciliation report',
      description: 'Automated finance ledger and customer ticket count reconciliation compiled and verified against Stripe monthly billing exports.',
      status: 'Done',
      priority: 'MED',
      assignee_id: 'usr_elena',
      creator_id: 'usr_shreya',
      due_date: '2026-10-17T17:00:00Z',
      due_label: 'Signed off by SL',
      blocked_reason: null,
      requires_approval: 0,
      approval_status: 'NONE',
      approval_policy_code: null
    }
  ];

  for (const issue of issues) {
    db.run(
      `INSERT INTO issues (
        id, project_id, title, description, status, priority, assignee_id, creator_id,
        due_date, due_label, blocked_reason, requires_approval, approval_status,
        approval_policy_code, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now', '-5 days'), datetime('now', '-1 hours'))`,
      [
        issue.id,
        issue.project_id,
        issue.title,
        issue.description,
        issue.status,
        issue.priority,
        issue.assignee_id,
        issue.creator_id,
        issue.due_date,
        issue.due_label,
        issue.blocked_reason,
        issue.requires_approval,
        issue.approval_status,
        issue.approval_policy_code
      ]
    );
  }

  // Insert Comments for NEX-102 (matches Image 10)
  const comments = [
    {
      id: 'cmt_102_1',
      issue_id: 'NEX-102',
      author_id: 'usr_maya',
      body: 'Reviewed the initial draft of the EU right-to-work guidelines. Section 3 needs revision to cover remote contractors based in the UK under updated cross-border payroll protocols. Draft updated in shared workspace docs for @Maya T. and team review.',
      is_edited: 1,
      created_at: '2026-10-16 11:32:00'
    },
    {
      id: 'cmt_102_2',
      issue_id: 'NEX-102',
      author_id: 'usr_rahul',
      body: 'Backend webhook triggers are now operational on the staging cluster. All sample documents uploaded through the verification endpoint return HTTP 200 with hash receipts logged in our central ledger. Verified by @Shreya Lavani.',
      is_edited: 0,
      created_at: '2026-10-17 14:45:00'
    },
    {
      id: 'cmt_102_3',
      issue_id: 'NEX-102',
      author_id: 'usr_shreya',
      body: 'Thank you team. Once Maya finishes the cross-border appendix tonight, we will run the final verification pipeline and transition this card directly to In Review for approval gate sign-off. Track updates on @Maya T..',
      is_edited: 0,
      created_at: '2026-10-18 09:12:00'
    },
    {
      id: 'cmt_101_1',
      issue_id: 'NEX-101',
      author_id: 'usr_rahul',
      body: 'Verified Stripe invoice transaction ID #ch_3N8F9x2. Customer was billed on 2026-10-14 and again on 2026-10-15 due to gateway retry loop. Awaiting Operation Head sign-off to issue refund.',
      is_edited: 0,
      created_at: '2026-10-17 10:20:00'
    }
  ];

  for (const c of comments) {
    db.run(
      `INSERT INTO comments (id, issue_id, author_id, body, is_edited, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [c.id, c.issue_id, c.author_id, c.body, c.is_edited, c.created_at, c.created_at]
    );
  }

  // Insert Activity History for NEX-102 (matches Image 10)
  const activities = [
    {
      id: 'act_102_1',
      issue_id: 'NEX-102',
      actor_id: 'usr_shreya',
      action: 'created',
      details: 'created issue NEX-102 via Ops Console',
      created_at: '2026-10-15 09:14:02'
    },
    {
      id: 'act_102_2',
      issue_id: 'NEX-102',
      actor_id: 'usr_shreya',
      action: 'assigned',
      details: 'assigned Maya T. and set priority to Medium',
      created_at: '2026-10-15 14:00:15'
    },
    {
      id: 'act_102_3',
      issue_id: 'NEX-102',
      actor_id: 'usr_maya',
      action: 'status_changed',
      details: 'changed state from Open to In Progress',
      created_at: '2026-10-16 08:30:44'
    },
    {
      id: 'act_102_4',
      issue_id: 'NEX-102',
      actor_id: 'usr_admin',
      action: 'field_updated',
      details: 'linked commit ref #a90fc3b to branch feat/onboarding-docs',
      created_at: '2026-10-17 17:10:00'
    }
  ];

  for (const a of activities) {
    db.run(
      `INSERT INTO activity_history (id, issue_id, actor_id, action, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [a.id, a.issue_id, a.actor_id, a.action, a.details, a.created_at]
    );
  }

  // Insert Approvals
  const approvals = [
    {
      id: 'appr_101',
      issue_id: 'NEX-101',
      requester_id: 'usr_rahul',
      assigned_approver_id: 'usr_shreya',
      policy_code: 'OPS-FIN-99',
      policy_description: 'Refund authorization exceeding $2,500 threshold requires explicit sign-off from Operation Head.',
      status: 'PENDING',
      decision_reason: null,
      decided_at: null,
      decided_by_id: null,
      created_at: '2026-10-17 10:25:00'
    },
    {
      id: 'appr_104',
      issue_id: 'NEX-104',
      requester_id: 'usr_alex',
      assigned_approver_id: 'usr_shreya',
      policy_code: 'SEC-TIER3-01',
      policy_description: 'Granting elevated Tier-3 production database read/write access requires operational gate approval.',
      status: 'PENDING',
      decision_reason: null,
      decided_at: null,
      decided_by_id: null,
      created_at: '2026-10-17 15:40:00'
    },
    {
      id: 'appr_115',
      issue_id: 'NEX-115',
      requester_id: 'usr_alex',
      assigned_approver_id: 'usr_rahul',
      policy_code: 'OPS-SLA-44',
      policy_description: 'Vendor maintenance SLA extension exceeding 24 hours requires Team Lead authorization.',
      status: 'PENDING',
      decision_reason: null,
      decided_at: null,
      decided_by_id: null,
      created_at: '2026-10-18 08:00:00'
    }
  ];

  for (const app of approvals) {
    db.run(
      `INSERT INTO approvals (
        id, issue_id, requester_id, assigned_approver_id, policy_code, policy_description,
        status, decision_reason, decided_at, decided_by_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        app.id,
        app.issue_id,
        app.requester_id,
        app.assigned_approver_id,
        app.policy_code,
        app.policy_description,
        app.status,
        app.decision_reason,
        app.decided_at,
        app.decided_by_id,
        app.created_at
      ]
    );
  }
}
