import { Router, Request, Response } from 'express';
import { Database } from 'sql.js';
import { getDatabase, persistDatabase, seedDatabase, verifyPassword } from './db.ts';
import {
  AuthUser,
  getUserFromDb,
  getUserByEmail,
  createSession,
  validateSession,
  deleteSession,
  checkProjectAccess,
  validateWorkflowTransition,
  canMakeApprovalDecision
} from './auth.ts';

export const apiRouter = Router();

// -------------------------------------------------------------
// Public Authentication Endpoints (Unprotected)
// -------------------------------------------------------------
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Email and password are required' });
    return;
  }

  const db = await getDatabase();
  const userWithSecrets = getUserByEmail(db, email);

  if (!userWithSecrets || !userWithSecrets.password_hash || !userWithSecrets.password_salt) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    return;
  }

  const isValid = verifyPassword(password, userWithSecrets.password_hash, userWithSecrets.password_salt);
  if (!isValid) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    return;
  }

  const session = createSession(db, userWithSecrets.id);
  persistDatabase();

  const user: AuthUser = {
    id: userWithSecrets.id,
    email: userWithSecrets.email,
    name: userWithSecrets.name,
    initials: userWithSecrets.initials,
    system_role: userWithSecrets.system_role,
    title: userWithSecrets.title,
    is_approver: userWithSecrets.is_approver,
    avatar_bg: userWithSecrets.avatar_bg
  };

  res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user
  });
});

apiRouter.post('/auth/logout', async (req: Request, res: Response) => {
  const db = await getDatabase();
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.headers['x-session-token'] as string);

  if (token) {
    deleteSession(db, token);
    persistDatabase();
  }

  res.json({ success: true, message: 'Logged out successfully' });
});

apiRouter.get('/auth/demo-users', async (req: Request, res: Response) => {
  const db = await getDatabase();
  const users = queryAll(
    db,
    'SELECT id, email, name, initials, system_role, title, is_approver, avatar_bg FROM users ORDER BY name ASC'
  );
  res.json(users);
});

// Rapid Persona Switcher (Provides authentic session token for selected user)
apiRouter.post('/auth/switch-user', async (req: Request, res: Response) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'userId is required' });
    return;
  }

  const db = await getDatabase();
  const targetUser = getUserFromDb(db, userId);
  if (!targetUser) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Target user not found' });
    return;
  }

  const session = createSession(db, targetUser.id);
  persistDatabase();

  res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: targetUser
  });
});

// Middleware: Authenticate user from session token (or development testing fallback)
async function authMiddleware(req: Request, res: Response, next: () => void) {
  try {
    const db = await getDatabase();
    (req as any).db = db;

    // 1. Validate Session Token (Bearer or Header)
    const authHeader = req.headers.authorization;
    const sessionToken = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : (req.headers['x-session-token'] as string);

    if (sessionToken) {
      const sessionUser = validateSession(db, sessionToken);
      if (sessionUser) {
        (req as any).user = sessionUser;
        return next();
      }
    }

    // 2. Development & Automated Testing Fallback:
    // Strictly disallowed in production (process.env.NODE_ENV === 'production') to prevent impersonation.
    if (process.env.NODE_ENV !== 'production') {
      const explicitUserId = req.headers['x-user-id'] as string;
      if (explicitUserId) {
        const user = getUserFromDb(db, explicitUserId);
        if (user) {
          (req as any).user = user;
          return next();
        }
      }
    }

    // Unauthenticated request rejected
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required. Please sign in to access protected operational resources.'
    });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
}

// Protect all subsequent API routes with authentication
apiRouter.use(authMiddleware);

apiRouter.get('/auth/session', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  res.json({ user });
});

// Helper: Query helper to convert SQL statement result to array of objects
function queryAll<T = any>(db: Database, sql: string, params: Record<string, any> = {}): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return rows;
}

function queryOne<T = any>(db: Database, sql: string, params: Record<string, any> = {}): T | null {
  const rows = queryAll<T>(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// -------------------------------------------------------------
// 1. Current User Profile & Authorized Projects
// -------------------------------------------------------------
apiRouter.get('/me', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;

  // Find teams user belongs to
  const teams = queryAll(
    db,
    `SELECT t.id, t.name, t.code, tm.team_role
     FROM teams t
     JOIN team_memberships tm ON tm.team_id = t.id
     WHERE tm.user_id = :userId`,
    { ':userId': user.id }
  );

  // Find all projects and filter by user access
  const allProjects = queryAll(db, 'SELECT * FROM projects WHERE status = "active"');
  const authorizedProjects = allProjects.filter(p => checkProjectAccess(db, user, p.id, 'viewer').allowed);

  res.json({
    user,
    teams,
    authorizedProjects: authorizedProjects.map(p => ({
      id: p.id,
      name: p.name,
      key: p.key,
      primary_team_id: p.primary_team_id
    }))
  });
});

// -------------------------------------------------------------
// 2. Users (for assignment and mention pickers)
// -------------------------------------------------------------
apiRouter.get('/users', (req: Request, res: Response) => {
  const db: Database = (req as any).db;
  const users = queryAll(db, 'SELECT id, email, name, initials, system_role, title, is_approver, avatar_bg FROM users ORDER BY name ASC');
  res.json(users);
});

// -------------------------------------------------------------
// 3. Teams
// -------------------------------------------------------------
apiRouter.get('/teams', (req: Request, res: Response) => {
  const db: Database = (req as any).db;
  const teams = queryAll(
    db,
    `SELECT t.id, t.name, t.code, t.description, t.lead_user_id, u.name as lead_name, u.initials as lead_initials
     FROM teams t
     LEFT JOIN users u ON u.id = t.lead_user_id
     ORDER BY t.name ASC`
  );

  // Attach members
  const teamsWithMembers = teams.map(t => {
    const members = queryAll(
      db,
      `SELECT u.id, u.name, u.initials, u.title, tm.team_role
       FROM team_memberships tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = :teamId`,
      { ':teamId': t.id }
    );
    return { ...t, members };
  });

  res.json(teamsWithMembers);
});

// -------------------------------------------------------------
// 4. Projects (Authorized List & Creation)
// -------------------------------------------------------------
apiRouter.get('/projects', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;

  const allProjects = queryAll(
    db,
    `SELECT p.*, u.name as lead_name, u.initials as lead_initials, t.name as team_name
     FROM projects p
     LEFT JOIN users u ON u.id = p.lead_user_id
     LEFT JOIN teams t ON t.id = p.primary_team_id
     WHERE p.status = 'active'
     ORDER BY p.name ASC`
  );

  // Enforce server-side authorization: never return unauthorized projects
  const authorized = allProjects.filter(p => {
    const access = checkProjectAccess(db, user, p.id, 'viewer');
    return access.allowed;
  }).map(p => {
    const stats = queryOne(
      db,
      `SELECT 
        COUNT(*) as total_issues,
        SUM(CASE WHEN status != 'Done' THEN 1 ELSE 0 END) as active_issues,
        SUM(CASE WHEN status = 'Blocked' THEN 1 ELSE 0 END) as blocked_issues,
        SUM(CASE WHEN requires_approval = 1 AND approval_status = 'PENDING' THEN 1 ELSE 0 END) as pending_approvals
       FROM issues
       WHERE project_id = :pId`,
      { ':pId': p.id }
    );
    return {
      ...p,
      stats: {
        total_issues: stats?.total_issues || 0,
        active_issues: stats?.active_issues || 0,
        blocked_issues: stats?.blocked_issues || 0,
        pending_approvals: stats?.pending_approvals || 0
      }
    };
  });

  res.json(authorized);
});

apiRouter.post('/projects', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;

  if (user.system_role !== 'admin' && user.system_role !== 'operation_head') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Only Administrators and Operation Heads can create new projects' });
    return;
  }

  const { name, key, description, primary_team_id } = req.body;
  if (!name || !key) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Project name and key are required' });
    return;
  }

  const cleanKey = String(key).toUpperCase().trim();
  const id = `proj_${cleanKey.toLowerCase()}_${Date.now().toString(36)}`;

  try {
    db.run(
      `INSERT INTO projects (id, name, key, description, lead_user_id, primary_team_id, status, issue_counter, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 100, datetime('now'))`,
      [id, name.trim(), cleanKey, description || '', user.id, primary_team_id || null]
    );

    // Give creator admin access
    db.run(
      `INSERT INTO project_memberships (id, project_id, user_id, access_level, created_at)
       VALUES (?, ?, ?, 'admin', datetime('now'))`,
      [`pm_${Date.now().toString(36)}`, id, user.id]
    );

    persistDatabase();
    res.status(201).json({ id, name, key: cleanKey });
  } catch (err: any) {
    res.status(400).json({ error: 'DB_ERROR', message: err.message });
  }
});

apiRouter.get('/projects/:id', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;
  const projectId = req.params.id;

  const access = checkProjectAccess(db, user, projectId, 'viewer');
  if (!access.allowed) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You are not authorized to access this project' });
    return;
  }

  const project = queryOne(
    db,
    `SELECT p.*, u.name as lead_name, u.initials as lead_initials, t.name as team_name
     FROM projects p
     LEFT JOIN users u ON u.id = p.lead_user_id
     LEFT JOIN teams t ON t.id = p.primary_team_id
     WHERE p.id = :id`,
    { ':id': projectId }
  );

  if (!project) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Project not found' });
    return;
  }

  const members = queryAll(
    db,
    `SELECT u.id, u.name, u.initials, u.title, pm.access_level
     FROM project_memberships pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = :pId`,
    { ':pId': projectId }
  );

  res.json({ ...project, members, userAccessLevel: access.level });
});

// -------------------------------------------------------------
// 5. Issues (Search, Filters, Pagination, & Authorization Scope)
// -------------------------------------------------------------
apiRouter.get('/issues', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;

  const projectId = req.query.projectId as string | undefined;
  const teamId = req.query.teamId as string | undefined;
  const status = req.query.status as string | undefined;
  const priority = req.query.priority as string | undefined;
  const assigneeId = req.query.assigneeId as string | undefined;
  const search = (req.query.search as string || '').toLowerCase().trim();
  const myWorkOnly = req.query.myWork === 'true';
  const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string || '10', 10)));
  const offset = (page - 1) * limit;

  // If projectId is requested specifically, verify access immediately
  if (projectId) {
    const access = checkProjectAccess(db, user, projectId, 'viewer');
    if (!access.allowed) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'You are not authorized to view issues in this project' });
      return;
    }
  }

  // Find all projects the current user is permitted to view
  const allProjects = queryAll(db, 'SELECT id FROM projects WHERE status = "active"');
  const authorizedProjectIds = allProjects
    .map(p => p.id)
    .filter(pId => checkProjectAccess(db, user, pId, 'viewer').allowed);

  if (authorizedProjectIds.length === 0) {
    res.json({ issues: [], total: 0, page, limit, totalPages: 0 });
    return;
  }

  let sqlConditions: string[] = [];
  let params: Record<string, any> = {};

  // Scope to authorized projects only
  if (projectId) {
    sqlConditions.push('i.project_id = :projectId');
    params[':projectId'] = projectId;
  } else {
    // Project IN clause with authorized projects
    const placeholders = authorizedProjectIds.map((_, idx) => `:p_${idx}`).join(', ');
    sqlConditions.push(`i.project_id IN (${placeholders})`);
    authorizedProjectIds.forEach((pId, idx) => {
      params[`:p_${idx}`] = pId;
    });
  }

  if (teamId && teamId !== 'All') {
    sqlConditions.push('p.primary_team_id = :teamId');
    params[':teamId'] = teamId;
  }

  if (status && status !== 'All') {
    sqlConditions.push('i.status = :status');
    params[':status'] = status;
  }

  if (priority && priority !== 'All') {
    sqlConditions.push('i.priority = :priority');
    params[':priority'] = priority;
  }

  if (assigneeId && assigneeId !== 'All' && assigneeId !== 'All Members') {
    if (assigneeId === 'Unassigned') {
      sqlConditions.push('i.assignee_id IS NULL');
    } else {
      sqlConditions.push('i.assignee_id = :assigneeId');
      params[':assigneeId'] = assigneeId;
    }
  }

  if (myWorkOnly) {
    sqlConditions.push('(i.assignee_id = :myUserId OR a.assigned_approver_id = :myUserId)');
    params[':myUserId'] = user.id;
  }

  if (search) {
    sqlConditions.push('(LOWER(i.title) LIKE :search OR LOWER(i.id) LIKE :search OR LOWER(i.description) LIKE :search)');
    params[':search'] = `%${search}%`;
  }

  const whereClause = sqlConditions.length > 0 ? `WHERE ${sqlConditions.join(' AND ')}` : '';

  // Get total count
  const countSql = `
    SELECT COUNT(DISTINCT i.id) as total
    FROM issues i
    JOIN projects p ON p.id = i.project_id
    LEFT JOIN approvals a ON a.issue_id = i.id
    ${whereClause}
  `;
  const countRow = queryOne(db, countSql, params);
  const total = countRow?.total || 0;

  // Sorting
  const sortParam = (req.query.sort as string) || 'due_date';
  let orderBy = 'i.created_at DESC';
  if (sortParam === 'due_date') {
    orderBy = 'CASE WHEN i.due_date IS NULL THEN 1 ELSE 0 END, i.due_date ASC';
  } else if (sortParam === 'priority') {
    orderBy = "CASE i.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MED' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END ASC";
  } else if (sortParam === 'updated_at') {
    orderBy = 'i.updated_at DESC';
  }

  // Fetch paginated results
  const listSql = `
    SELECT 
      i.*,
      p.name as project_name,
      p.key as project_key,
      t.name as team_name,
      t.id as team_id,
      u_assignee.name as assignee_name,
      u_assignee.initials as assignee_initials,
      u_assignee.title as assignee_title,
      u_creator.name as creator_name,
      u_creator.initials as creator_initials,
      (SELECT COUNT(*) FROM comments c WHERE c.issue_id = i.id) as comment_count,
      a.id as approval_id,
      a.status as approval_gate_status,
      a.policy_code as approval_policy_code,
      a.policy_description as approval_policy_desc,
      a.assigned_approver_id as approval_assigned_to
    FROM issues i
    JOIN projects p ON p.id = i.project_id
    LEFT JOIN teams t ON t.id = p.primary_team_id
    LEFT JOIN users u_assignee ON u_assignee.id = i.assignee_id
    LEFT JOIN users u_creator ON u_creator.id = i.creator_id
    LEFT JOIN approvals a ON a.issue_id = i.id AND a.status = 'PENDING'
    ${whereClause}
    GROUP BY i.id
    ORDER BY ${orderBy}
    LIMIT :limit OFFSET :offset
  `;

  params[':limit'] = limit;
  params[':offset'] = offset;

  const issues = queryAll(db, listSql, params);
  const totalPages = Math.ceil(total / limit);

  res.json({
    issues,
    total,
    page,
    limit,
    totalPages
  });
});

// -------------------------------------------------------------
// 6. Single Issue Details (with Comments, History, Approvals)
// -------------------------------------------------------------
apiRouter.get('/issues/:id', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;
  const issueId = req.params.id;

  const issue = queryOne(
    db,
    `SELECT 
      i.*,
      p.name as project_name,
      p.key as project_key,
      t.name as team_name,
      t.id as team_id,
      u_assignee.name as assignee_name,
      u_assignee.initials as assignee_initials,
      u_assignee.title as assignee_title,
      u_creator.name as creator_name,
      u_creator.initials as creator_initials
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     LEFT JOIN teams t ON t.id = p.primary_team_id
     LEFT JOIN users u_assignee ON u_assignee.id = i.assignee_id
     LEFT JOIN users u_creator ON u_creator.id = i.creator_id
     WHERE i.id = :id`,
    { ':id': issueId }
  );

  if (!issue) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Issue not found' });
    return;
  }

  // Authorization check on the issue's project
  const access = checkProjectAccess(db, user, issue.project_id, 'viewer');
  if (!access.allowed) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You are not authorized to view this issue' });
    return;
  }

  // Fetch comments
  const comments = queryAll(
    db,
    `SELECT c.*, u.name as author_name, u.initials as author_initials, u.title as author_title, u.system_role as author_role
     FROM comments c
     JOIN users u ON u.id = c.author_id
     WHERE c.issue_id = :issueId
     ORDER BY c.created_at ASC`,
    { ':issueId': issueId }
  );

  // Fetch activity history
  const activities = queryAll(
    db,
    `SELECT a.*, u.name as actor_name, u.initials as actor_initials
     FROM activity_history a
     JOIN users u ON u.id = a.actor_id
     WHERE a.issue_id = :issueId
     ORDER BY a.created_at ASC`,
    { ':issueId': issueId }
  );

  // Fetch active approval gate if exists
  const activeApproval = queryOne(
    db,
    `SELECT a.*, u_appr.name as approver_name, u_req.name as requester_name
     FROM approvals a
     LEFT JOIN users u_appr ON u_appr.id = a.assigned_approver_id
     LEFT JOIN users u_req ON u_req.id = a.requester_id
     WHERE a.issue_id = :issueId
     ORDER BY a.created_at DESC
     LIMIT 1`,
    { ':issueId': issueId }
  );

  res.json({
    ...issue,
    comments,
    activities,
    activeApproval,
    userAccessLevel: access.level
  });
});

// -------------------------------------------------------------
// 7. Create Issue (Enforces Project Access, Validations & Idempotency)
// -------------------------------------------------------------
apiRouter.post('/issues', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  // 1. Idempotency Check
  if (idempotencyKey) {
    const existing = queryOne(
      db,
      'SELECT response_payload FROM idempotency_keys WHERE key = :key AND action_type = "create_issue"',
      { ':key': idempotencyKey }
    );
    if (existing) {
      res.status(200).json(JSON.parse(existing.response_payload));
      return;
    }
  }

  const {
    project_id,
    title,
    description,
    priority = 'MED',
    status = 'Open',
    assignee_id = null,
    due_date = null,
    requires_approval = 0,
    approval_policy_code = null
  } = req.body;

  // Required Project ID
  if (!project_id) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Project selection is required' });
    return;
  }

  // Authorization Check
  const access = checkProjectAccess(db, user, project_id, 'editor');
  if (!access.allowed) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: `You are not authorized to create issues in project "${project_id}". Reason: ${access.reason}`
    });
    return;
  }

  // Field Validations
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Issue title is required and cannot be empty' });
    return;
  }

  const validPriorities = ['LOW', 'MED', 'HIGH', 'URGENT'];
  if (!validPriorities.includes(priority)) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: `Invalid priority "${priority}". Must be one of ${validPriorities.join(', ')}` });
    return;
  }

  const validInitialStatuses = ['Open', 'In Progress', 'In Review', 'Blocked'];
  if (!validInitialStatuses.includes(status)) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: `Invalid initial status "${status}". Allowed: ${validInitialStatuses.join(', ')}` });
    return;
  }

  // Validate Assignee if provided
  if (assignee_id) {
    const assignee = getUserFromDb(db, assignee_id);
    if (!assignee) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: `Assignee user "${assignee_id}" does not exist` });
      return;
    }
  }

  // Generate Issue ID based on Project Key and counter
  const project = queryOne(db, 'SELECT key, issue_counter FROM projects WHERE id = :id', { ':id': project_id });
  const nextNumber = (project?.issue_counter || 100) + 1;
  const issueId = `${project.key}-${nextNumber}`;

  // Update project counter
  db.run('UPDATE projects SET issue_counter = ? WHERE id = ?', [nextNumber, project_id]);

  const approvalReq = requires_approval ? 1 : 0;
  const approvalStatus = approvalReq ? 'PENDING' : 'NONE';

  // Insert Issue
  db.run(
    `INSERT INTO issues (
      id, project_id, title, description, status, priority, assignee_id, creator_id,
      due_date, due_label, blocked_reason, requires_approval, approval_status,
      approval_policy_code, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
    [
      issueId,
      project_id,
      title.trim(),
      description || '',
      status,
      priority,
      assignee_id || null,
      user.id,
      due_date || null,
      due_date ? 'Scheduled' : 'Pending Allocation',
      approvalReq,
      approvalStatus,
      approval_policy_code || null
    ]
  );

  // If approval is required, create the corresponding Approval request record
  if (approvalReq) {
    const defaultApprover = 'usr_shreya'; // Operation Head as default designated approver
    db.run(
      `INSERT INTO approvals (
        id, issue_id, requester_id, assigned_approver_id, policy_code, policy_description,
        status, decision_reason, decided_at, decided_by_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NULL, NULL, NULL, datetime('now'))`,
      [
        `appr_${Date.now().toString(36)}`,
        issueId,
        user.id,
        defaultApprover,
        approval_policy_code || 'OPS-STD-01',
        'Standard operational review and authorization gate prior to completion.'
      ]
    );
  }

  // Insert Activity Log
  db.run(
    `INSERT INTO activity_history (id, issue_id, actor_id, action, details, created_at)
     VALUES (?, ?, ?, 'created', ?, datetime('now'))`,
    [`act_${Date.now().toString(36)}`, issueId, user.id, `created issue ${issueId} with priority ${priority}`]
  );

  persistDatabase();

  const responsePayload = {
    id: issueId,
    project_id,
    title: title.trim(),
    status,
    priority,
    assignee_id,
    creator_id: user.id,
    requires_approval: approvalReq,
    approval_status: approvalStatus,
    version: 1
  };

  // Cache idempotency response if key supplied
  if (idempotencyKey) {
    db.run(
      `INSERT INTO idempotency_keys (key, action_type, response_payload, created_at)
       VALUES (?, 'create_issue', ?, datetime('now'))`,
      [idempotencyKey, JSON.stringify(responsePayload)]
    );
    persistDatabase();
  }

  res.status(201).json(responsePayload);
});

// -------------------------------------------------------------
// 8. Update Issue (with Optimistic Concurrency & Workflow Enforcement)
// -------------------------------------------------------------
apiRouter.patch('/issues/:id', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;
  const issueId = req.params.id;

  const currentIssue = queryOne(db, 'SELECT * FROM issues WHERE id = :id', { ':id': issueId });
  if (!currentIssue) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Issue not found' });
    return;
  }

  // Check project edit authorization
  const access = checkProjectAccess(db, user, currentIssue.project_id, 'editor');
  if (!access.allowed) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to modify issues in this project' });
    return;
  }

  const {
    version: expectedVersion,
    status: targetStatus,
    priority: targetPriority,
    assignee_id: targetAssigneeId,
    title: targetTitle,
    description: targetDesc,
    due_date: targetDueDate,
    blocked_reason: targetBlockedReason
  } = req.body;

  // 1. OPTIMISTIC CONCURRENCY / STALE UPDATE CHECK
  if (expectedVersion !== undefined && expectedVersion !== null) {
    if (Number(expectedVersion) !== Number(currentIssue.version)) {
      res.status(409).json({
        error: 'CONCURRENCY_CONFLICT',
        message: `Issue ${issueId} was modified by another operator (current version is v${currentIssue.version}, while your client submitted v${expectedVersion}). Please refresh latest data before reapplying changes.`,
        current_version: currentIssue.version
      });
      return;
    }
  }

  // 2. WORKFLOW TRANSITION VALIDATION & APPROVAL BYPASS DEFENSE
  if (targetStatus && targetStatus !== currentIssue.status) {
    const transitionResult = validateWorkflowTransition(currentIssue.status, targetStatus, currentIssue);
    if (!transitionResult.valid) {
      res.status(400).json({
        error: 'INVALID_TRANSITION',
        message: transitionResult.error
      });
      return;
    }
  }

  // Apply updates
  const newVersion = currentIssue.version + 1;
  const nextStatus = targetStatus ?? currentIssue.status;
  const nextPriority = targetPriority ?? currentIssue.priority;
  const nextAssignee = targetAssigneeId !== undefined ? targetAssigneeId : currentIssue.assignee_id;
  const nextTitle = targetTitle !== undefined ? targetTitle.trim() : currentIssue.title;
  const nextDesc = targetDesc !== undefined ? targetDesc : currentIssue.description;
  const nextDueDate = targetDueDate !== undefined ? targetDueDate : currentIssue.due_date;
  const nextBlockedReason = targetBlockedReason !== undefined ? targetBlockedReason : currentIssue.blocked_reason;

  db.run(
    `UPDATE issues SET
      title = ?,
      description = ?,
      status = ?,
      priority = ?,
      assignee_id = ?,
      due_date = ?,
      blocked_reason = ?,
      version = ?,
      updated_at = datetime('now')
     WHERE id = ?`,
    [nextTitle, nextDesc, nextStatus, nextPriority, nextAssignee, nextDueDate, nextBlockedReason, newVersion, issueId]
  );

  // Log Activity for each modified field
  if (targetStatus && targetStatus !== currentIssue.status) {
    db.run(
      `INSERT INTO activity_history (id, issue_id, actor_id, action, details, created_at)
       VALUES (?, ?, ?, 'status_changed', ?, datetime('now'))`,
      [`act_${Date.now().toString(36)}`, issueId, user.id, `changed status from "${currentIssue.status}" to "${targetStatus}"`]
    );
  }

  if (targetAssigneeId !== undefined && targetAssigneeId !== currentIssue.assignee_id) {
    const assigneeName = targetAssigneeId ? getUserFromDb(db, targetAssigneeId)?.name || targetAssigneeId : 'Unassigned';
    db.run(
      `INSERT INTO activity_history (id, issue_id, actor_id, action, details, created_at)
       VALUES (?, ?, ?, 'assigned', ?, datetime('now'))`,
      [`act_${Date.now().toString(36)}_a`, issueId, user.id, `reassigned issue to ${assigneeName}`]
    );
  }

  if (targetPriority && targetPriority !== currentIssue.priority) {
    db.run(
      `INSERT INTO activity_history (id, issue_id, actor_id, action, details, created_at)
       VALUES (?, ?, ?, 'priority_changed', ?, datetime('now'))`,
      [`act_${Date.now().toString(36)}_p`, issueId, user.id, `updated priority from [${currentIssue.priority}] to [${targetPriority}]`]
    );
  }

  persistDatabase();

  res.json({
    id: issueId,
    version: newVersion,
    status: nextStatus,
    priority: nextPriority,
    assignee_id: nextAssignee,
    title: nextTitle,
    description: nextDesc,
    due_date: nextDueDate,
    blocked_reason: nextBlockedReason
  });
});

// -------------------------------------------------------------
// 9. Comments (Create, Edit, Delete with Role Authorization)
// -------------------------------------------------------------
apiRouter.post('/issues/:id/comments', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;
  const issueId = req.params.id;

  const issue = queryOne(db, 'SELECT project_id FROM issues WHERE id = :id', { ':id': issueId });
  if (!issue) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Issue not found' });
    return;
  }

  const access = checkProjectAccess(db, user, issue.project_id, 'viewer');
  if (!access.allowed) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You are not authorized to post comments on this issue' });
    return;
  }

  const { body } = req.body;
  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Comment text cannot be empty' });
    return;
  }

  const commentId = `cmt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  db.run(
    `INSERT INTO comments (id, issue_id, author_id, body, is_edited, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
    [commentId, issueId, user.id, body.trim()]
  );

  db.run(
    `INSERT INTO activity_history (id, issue_id, actor_id, action, details, created_at)
     VALUES (?, ?, ?, 'comment_added', 'posted a comment', datetime('now'))`,
    [`act_${Date.now().toString(36)}`, issueId, user.id]
  );

  persistDatabase();

  res.status(201).json({
    id: commentId,
    issue_id: issueId,
    author_id: user.id,
    author_name: user.name,
    author_initials: user.initials,
    author_title: user.title,
    body: body.trim(),
    created_at: new Date().toISOString()
  });
});

apiRouter.patch('/comments/:id', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;
  const commentId = req.params.id;

  const comment = queryOne(db, 'SELECT * FROM comments WHERE id = :id', { ':id': commentId });
  if (!comment) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Comment not found' });
    return;
  }

  // Only the original author or system admin can edit
  if (comment.author_id !== user.id && user.system_role !== 'admin') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You can only edit your own comments' });
    return;
  }

  const { body } = req.body;
  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Comment body cannot be empty' });
    return;
  }

  db.run(
    'UPDATE comments SET body = ?, is_edited = 1, updated_at = datetime("now") WHERE id = ?',
    [body.trim(), commentId]
  );

  persistDatabase();
  res.json({ id: commentId, body: body.trim(), is_edited: 1 });
});

apiRouter.delete('/comments/:id', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;
  const commentId = req.params.id;

  const comment = queryOne(db, 'SELECT * FROM comments WHERE id = :id', { ':id': commentId });
  if (!comment) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Comment not found' });
    return;
  }

  // Only the author, system admin, or Operation Head can delete comments
  const isAuthor = comment.author_id === user.id;
  const isModerator = user.system_role === 'admin' || user.system_role === 'operation_head';

  if (!isAuthor && !isModerator) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to delete this comment' });
    return;
  }

  db.run('DELETE FROM comments WHERE id = ?', [commentId]);
  persistDatabase();

  res.json({ success: true, deleted_id: commentId });
});

// -------------------------------------------------------------
// 10. Approvals Inbox & Decisions (Strict Business Logic)
// -------------------------------------------------------------
apiRouter.get('/approvals', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;
  const filter = (req.query.filter as string) || 'pending'; // 'pending' | 'all' | 'my_requests'

  // Enforcement: Approvals Inbox for pending reviews is restricted strictly to designated approvers!
  // A Team Lead, Operations Head, or Administrator does NOT automatically become an approver!
  if (filter === 'pending' && user.is_approver !== 1) {
    res.status(403).json({
      error: 'APPROVER_PERMISSION_REQUIRED',
      message: 'Approvals Inbox is restricted to designated approvers. Your account does not possess approval authority.'
    });
    return;
  }

  // Find authorized projects for current user
  const allProjects = queryAll(db, 'SELECT id FROM projects WHERE status = "active"');
  const authorizedProjectIds = allProjects
    .map(p => p.id)
    .filter(pId => checkProjectAccess(db, user, pId, 'viewer').allowed);

  if (authorizedProjectIds.length === 0) {
    res.json([]);
    return;
  }

  let sql = `
    SELECT 
      a.*,
      i.title as issue_title,
      i.priority as issue_priority,
      i.status as issue_status,
      p.name as project_name,
      p.id as project_id,
      u_req.name as requester_name,
      u_req.initials as requester_initials,
      u_appr.name as approver_name,
      u_dec.name as decided_by_name
    FROM approvals a
    JOIN issues i ON i.id = a.issue_id
    JOIN projects p ON p.id = i.project_id
    LEFT JOIN users u_req ON u_req.id = a.requester_id
    LEFT JOIN users u_appr ON u_appr.id = a.assigned_approver_id
    LEFT JOIN users u_dec ON u_dec.id = a.decided_by_id
  `;

  let conditions: string[] = [];
  let params: Record<string, any> = {};

  // Scope to authorized projects
  const placeholders = authorizedProjectIds.map((_, i) => `:p_${i}`).join(', ');
  conditions.push(`i.project_id IN (${placeholders})`);
  authorizedProjectIds.forEach((pId, i) => {
    params[`:p_${i}`] = pId;
  });

  if (filter === 'pending') {
    conditions.push('a.status = "PENDING"');
    // Display ONLY requests assigned to the signed-in user or where user has authorized project admin oversight
    conditions.push('(a.assigned_approver_id = :myUserId OR a.assigned_approver_id IS NULL)');
    params[':myUserId'] = user.id;
  } else if (filter === 'my_requests') {
    conditions.push('a.requester_id = :myUserId');
    params[':myUserId'] = user.id;
  } else {
    // 'all' filter:
    if (user.is_approver === 1) {
      conditions.push('(a.assigned_approver_id = :myUserId OR a.requester_id = :myUserId)');
      params[':myUserId'] = user.id;
    } else {
      conditions.push('a.requester_id = :myUserId');
      params[':myUserId'] = user.id;
    }
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ' ORDER BY a.created_at DESC';

  const approvals = queryAll(db, sql, params);
  res.json(approvals);
});

apiRouter.get('/approvals/:id', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;
  const approvalId = req.params.id;

  const approval = queryOne(
    db,
    `SELECT a.*, i.project_id, i.title as issue_title, p.name as project_name
     FROM approvals a
     JOIN issues i ON i.id = a.issue_id
     JOIN projects p ON p.id = i.project_id
     WHERE a.id = :id`,
    { ':id': approvalId }
  );

  if (!approval) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Approval request not found' });
    return;
  }

  // Check project scope
  const projAccess = checkProjectAccess(db, user, approval.project_id, 'viewer');
  if (!projAccess.allowed) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have access to the project associated with this approval' });
    return;
  }

  // Check authorization: must be either the assigned approver (with is_approver === 1) or the requester
  const isAssignedApprover = approval.assigned_approver_id === user.id && user.is_approver === 1;
  const isRequester = approval.requester_id === user.id;
  const isProjectAdminApprover = user.is_approver === 1 && projAccess.level === 'admin';

  if (!isAssignedApprover && !isRequester && !isProjectAdminApprover) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'You are not authorized to view this approval request'
    });
    return;
  }

  res.json(approval);
});

apiRouter.post('/approvals/:id/decide', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;
  const approvalId = req.params.id;
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  // 1. Idempotency Check
  if (idempotencyKey) {
    const existing = queryOne(
      db,
      'SELECT response_payload FROM idempotency_keys WHERE key = :key AND action_type = "approval_decision"',
      { ':key': idempotencyKey }
    );
    if (existing) {
      res.status(200).json(JSON.parse(existing.response_payload));
      return;
    }
  }

  const approval = queryOne(
    db,
    `SELECT a.*, i.project_id
     FROM approvals a
     JOIN issues i ON i.id = a.issue_id
     WHERE a.id = :id`,
    { ':id': approvalId }
  );

  if (!approval) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Approval request not found' });
    return;
  }

  // Conflict Check: Prevent duplicate or conflicting approval decisions once finalized
  if (approval.status !== 'PENDING') {
    res.status(409).json({
      error: 'APPROVAL_ALREADY_DECIDED',
      message: `Approval request ${approvalId} has already been finalized with status "${approval.status}". Subsequent or conflicting decisions are rejected.`,
      status: approval.status
    });
    return;
  }

  const { decision, reason } = req.body; // 'APPROVED' or 'REJECTED'

  if (decision !== 'APPROVED' && decision !== 'REJECTED') {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Decision must be either "APPROVED" or "REJECTED"' });
    return;
  }

  // Rejection requires reason (minimum 5 chars)
  if (decision === 'REJECTED') {
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({
        error: 'REASON_REQUIRED',
        message: 'A detailed operational reason (minimum 5 characters) is required when rejecting an approval request'
      });
      return;
    }
  }

  // 2. BACKEND AUTHORIZATION & SELF-APPROVAL DEFENSE
  const decisionAuth = canMakeApprovalDecision(db, user, approval, approval.project_id);
  if (!decisionAuth.allowed) {
    res.status(403).json({
      error: 'APPROVAL_DECISION_FORBIDDEN',
      message: decisionAuth.error
    });
    return;
  }

  // Record Decision
  const decidedAt = new Date().toISOString();
  db.run(
    `UPDATE approvals SET
      status = ?,
      decision_reason = ?,
      decided_at = ?,
      decided_by_id = ?
     WHERE id = ?`,
    [decision, reason?.trim() || null, decidedAt, user.id, approvalId]
  );

  // Update associated issue approval_status
  db.run(
    `UPDATE issues SET
      approval_status = ?,
      version = version + 1,
      updated_at = datetime('now')
     WHERE id = ?`,
    [decision, approval.issue_id]
  );

  // Log in Activity History
  const logDetails = decision === 'APPROVED'
    ? `Operational Approval Gate APPROVED by ${user.name} (${user.title}) [Policy: ${approval.policy_code}]`
    : `Operational Approval Gate REJECTED by ${user.name} (${user.title}) [Reason: "${reason?.trim()}"]`;

  db.run(
    `INSERT INTO activity_history (id, issue_id, actor_id, action, details, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [`act_${Date.now().toString(36)}`, approval.issue_id, user.id, decision === 'APPROVED' ? 'approved' : 'rejected', logDetails]
  );

  persistDatabase();

  const responsePayload = {
    id: approvalId,
    issue_id: approval.issue_id,
    decision,
    reason: reason?.trim() || null,
    decided_by: user.name,
    decided_at: decidedAt
  };

  if (idempotencyKey) {
    db.run(
      `INSERT INTO idempotency_keys (key, action_type, response_payload, created_at)
       VALUES (?, 'approval_decision', ?, datetime('now'))`,
      [idempotencyKey, JSON.stringify(responsePayload)]
    );
    persistDatabase();
  }

  res.json(responsePayload);
});

// -------------------------------------------------------------
// 11. Dashboard Aggregations (Enforcing User Permissions)
// -------------------------------------------------------------
apiRouter.get('/dashboard', (req: Request, res: Response) => {
  const user: AuthUser = (req as any).user;
  const db: Database = (req as any).db;

  // Find authorized projects
  const allProjects = queryAll(db, 'SELECT id FROM projects WHERE status = "active"');
  const authorizedProjectIds = allProjects
    .map(p => p.id)
    .filter(pId => checkProjectAccess(db, user, pId, 'viewer').allowed);

  if (authorizedProjectIds.length === 0) {
    res.json({
      metrics: { assignedToMe: 0, needsAttention: 0, pendingMyApproval: 0 },
      myWork: [],
      needsAttention: [],
      stageCounts: { open: 0, in_progress: 0, in_review: 0, blocked: 0, done: 0 }
    });
    return;
  }

  const placeholders = authorizedProjectIds.map((_, i) => `:p_${i}`).join(', ');
  const baseParams: Record<string, any> = { ':userId': user.id };
  authorizedProjectIds.forEach((pId, i) => {
    baseParams[`:p_${i}`] = pId;
  });

  // 1. Assigned to Me count
  const assignedRow = queryOne(
    db,
    `SELECT COUNT(*) as count 
     FROM issues 
     WHERE project_id IN (${placeholders}) 
     AND assignee_id = :userId 
     AND status != 'Done'`,
    baseParams
  );
  const assignedToMe = assignedRow?.count || 0;

  // 2. Needs Attention count (Urgent, Blocked, or SLA risk in authorized scope)
  const attentionRow = queryOne(
    db,
    `SELECT COUNT(*) as count 
     FROM issues 
     WHERE project_id IN (${placeholders}) 
     AND (status = 'Blocked' OR priority = 'URGENT' OR (requires_approval = 1 AND approval_status = 'PENDING'))
     AND status != 'Done'`,
    baseParams
  );
  const needsAttention = attentionRow?.count || 0;

  // 3. Pending My Approval count
  const apprRow = queryOne(
    db,
    `SELECT COUNT(*) as count
     FROM approvals a
     JOIN issues i ON i.id = a.issue_id
     WHERE i.project_id IN (${placeholders})
     AND a.status = 'PENDING'
     AND (a.assigned_approver_id = :userId OR (:userRole IN ('admin', 'operation_head') AND :isApprover = 1))`,
    { ...baseParams, ':userRole': user.system_role, ':isApprover': user.is_approver }
  );
  const pendingMyApproval = apprRow?.count || 0;

  // 4. My Work List items (Matching Stitch Image 7)
  const myWorkItems = queryAll(
    db,
    `SELECT i.id, i.title, i.priority, i.status, i.due_label, i.due_date, p.key as project_key
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     WHERE i.project_id IN (${placeholders})
     AND i.assignee_id = :userId
     AND i.status != 'Done'
     ORDER BY CASE i.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MED' THEN 3 ELSE 4 END ASC
     LIMIT 5`,
    baseParams
  );

  // 5. Needs Attention List items (Matching Stitch Image 7)
  const attentionItems = queryAll(
    db,
    `SELECT i.id, i.title, i.priority, i.status, i.blocked_reason, a.policy_code,
            CASE 
              WHEN a.status = 'PENDING' THEN 'Awaiting Ops Head Approval'
              WHEN i.status = 'Blocked' THEN 'Blocked by ' || COALESCE(i.blocked_reason, 'external dependency')
              WHEN i.priority = 'URGENT' THEN 'SLA breach risk (Urgent)'
              ELSE 'Action Required'
            END as reason
     FROM issues i
     LEFT JOIN approvals a ON a.issue_id = i.id AND a.status = 'PENDING'
     WHERE i.project_id IN (${placeholders})
     AND (i.status = 'Blocked' OR i.priority = 'URGENT' OR a.status = 'PENDING')
     AND i.status != 'Done'
     ORDER BY CASE WHEN a.status = 'PENDING' THEN 1 WHEN i.priority = 'URGENT' THEN 2 ELSE 3 END ASC
     LIMIT 5`,
    baseParams
  );

  // 6. Workflow stage breakdown
  const stageStats = queryOne(
    db,
    `SELECT
       SUM(CASE WHEN status = 'Open' THEN 1 ELSE 0 END) as open_count,
       SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress_count,
       SUM(CASE WHEN status = 'In Review' THEN 1 ELSE 0 END) as in_review_count,
       SUM(CASE WHEN status = 'Blocked' THEN 1 ELSE 0 END) as blocked_count,
       SUM(CASE WHEN status = 'Done' THEN 1 ELSE 0 END) as done_count
     FROM issues
     WHERE project_id IN (${placeholders})`,
    baseParams
  );

  res.json({
    metrics: {
      assignedToMe,
      needsAttention,
      pendingMyApproval
    },
    myWork: myWorkItems,
    needsAttention: attentionItems,
    stageCounts: {
      open: stageStats?.open_count || 0,
      in_progress: stageStats?.in_progress_count || 0,
      in_review: stageStats?.in_review_count || 0,
      blocked: stageStats?.blocked_count || 0,
      done: stageStats?.done_count || 0
    }
  });
});

// -------------------------------------------------------------
// 12. Reset Demo Database
// -------------------------------------------------------------
apiRouter.post('/system/reset-demo', (req: Request, res: Response) => {
  const db: Database = (req as any).db;
  seedDatabase(db);
  persistDatabase();
  res.json({ success: true, message: 'Database reset to canonical demo state' });
});
