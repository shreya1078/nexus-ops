import { Database } from 'sql.js';
import crypto from 'crypto';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  initials: string;
  system_role: 'admin' | 'operation_head' | 'team_lead' | 'team_member';
  title: string;
  is_approver: number;
  avatar_bg: string;
}

export function getUserFromDb(db: Database, userId: string): AuthUser | null {
  const stmt = db.prepare('SELECT id, email, name, initials, system_role, title, is_approver, avatar_bg FROM users WHERE id = :id');
  stmt.bind({ ':id': userId });
  if (stmt.step()) {
    const row = stmt.getAsObject() as unknown as AuthUser;
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

export function getUserByEmail(db: Database, email: string): (AuthUser & { password_hash: string; password_salt: string }) | null {
  const stmt = db.prepare('SELECT id, email, name, initials, system_role, title, is_approver, avatar_bg, password_hash, password_salt FROM users WHERE LOWER(email) = LOWER(:email)');
  stmt.bind({ ':email': email.trim() });
  if (stmt.step()) {
    const row = stmt.getAsObject() as unknown as (AuthUser & { password_hash: string; password_salt: string });
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

export function createSession(db: Database, userId: string): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('hex');
  // 30 days expiration
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.run(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, datetime("now"), ?)',
    [token, userId, expiresAt]
  );

  return { token, expiresAt };
}

export function validateSession(db: Database, token: string): AuthUser | null {
  if (!token) return null;
  const stmt = db.prepare(`
    SELECT u.id, u.email, u.name, u.initials, u.system_role, u.title, u.is_approver, u.avatar_bg
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = :token AND s.expires_at > datetime('now')
  `);
  stmt.bind({ ':token': token });
  if (stmt.step()) {
    const row = stmt.getAsObject() as unknown as AuthUser;
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

export function deleteSession(db: Database, token: string): void {
  if (!token) return;
  db.run('DELETE FROM sessions WHERE token = ?', [token]);
}

export interface ProjectAccessResult {
  allowed: boolean;
  level?: 'admin' | 'editor' | 'viewer';
  reason?: string;
}

export function checkProjectAccess(
  db: Database,
  user: AuthUser,
  projectId: string,
  requiredLevel: 'viewer' | 'editor' | 'admin' = 'viewer'
): ProjectAccessResult {
  // 1. System Admins have unrestricted administrative access
  if (user.system_role === 'admin') {
    return { allowed: true, level: 'admin' };
  }

  // Check if project exists
  const projStmt = db.prepare('SELECT id, primary_team_id, status FROM projects WHERE id = :id');
  projStmt.bind({ ':id': projectId });
  if (!projStmt.step()) {
    projStmt.free();
    return { allowed: false, reason: 'PROJECT_NOT_FOUND' };
  }
  const project = projStmt.getAsObject() as { id: string; primary_team_id: string; status: string };
  projStmt.free();

  // 2. Explicit Project Membership takes priority
  const memStmt = db.prepare('SELECT access_level FROM project_memberships WHERE project_id = :pId AND user_id = :uId');
  memStmt.bind({ ':pId': projectId, ':uId': user.id });
  let explicitLevel: 'admin' | 'editor' | 'viewer' | null = null;
  if (memStmt.step()) {
    explicitLevel = (memStmt.getAsObject() as { access_level: string }).access_level as 'admin' | 'editor' | 'viewer';
  }
  memStmt.free();

  if (explicitLevel) {
    if (satisfiesLevel(explicitLevel, requiredLevel)) {
      return { allowed: true, level: explicitLevel };
    } else {
      return { allowed: false, reason: 'INSUFFICIENT_PROJECT_PERMISSIONS' };
    }
  }

  // 3. Operation Head has cross-team operational visibility over active core projects (except explicitly isolated partner sandboxes)
  if (user.system_role === 'operation_head') {
    if (projectId !== 'proj_isolated') {
      return { allowed: true, level: 'admin' };
    }
  }

  // 4. Team-level access: If user belongs to the project's primary team as a lead or member
  if (project.primary_team_id) {
    const teamMemStmt = db.prepare('SELECT team_role FROM team_memberships WHERE team_id = :tId AND user_id = :uId');
    teamMemStmt.bind({ ':tId': project.primary_team_id, ':uId': user.id });
    let teamRole: string | null = null;
    if (teamMemStmt.step()) {
      teamRole = (teamMemStmt.getAsObject() as { team_role: string }).team_role;
    }
    teamMemStmt.free();

    if (teamRole === 'lead') {
      const level = 'editor';
      if (satisfiesLevel(level, requiredLevel)) {
        return { allowed: true, level };
      }
    }
  }

  return { allowed: false, reason: 'UNAUTHORIZED_PROJECT_ACCESS' };
}

function satisfiesLevel(
  current: 'admin' | 'editor' | 'viewer',
  required: 'admin' | 'editor' | 'viewer'
): boolean {
  const hierarchy = { viewer: 1, editor: 2, admin: 3 };
  return hierarchy[current] >= hierarchy[required];
}

export function validateWorkflowTransition(
  currentStatus: string,
  targetStatus: string,
  issue: {
    requires_approval: number;
    approval_status: string;
  }
): { valid: boolean; error?: string } {
  if (currentStatus === targetStatus) {
    return { valid: true };
  }

  // Allowed transitions
  const allowedTransitions: Record<string, string[]> = {
    'Open': ['In Progress', 'Blocked', 'In Review'],
    'In Progress': ['Open', 'In Review', 'Blocked'],
    'In Review': ['In Progress', 'Done', 'Blocked', 'Open'],
    'Blocked': ['Open', 'In Progress', 'In Review'],
    'Done': ['Open', 'In Progress'] // reopening
  };

  const validTargets = allowedTransitions[currentStatus] || [];
  if (!validTargets.includes(targetStatus)) {
    return {
      valid: false,
      error: `Invalid status transition from "${currentStatus}" to "${targetStatus}". Allowed next stages: ${validTargets.join(', ')}`
    };
  }

  // CRITICAL APPROVAL RULE: An issue requiring approval cannot be transitioned to Done without approved status
  if (targetStatus === 'Done') {
    if (issue.requires_approval === 1) {
      if (issue.approval_status !== 'APPROVED') {
        return {
          valid: false,
          error: `APPROVAL_REQUIRED_BYPASS_PREVENTED: Cannot mark issue as Done. Operational Approval Gate has status "${issue.approval_status}". Explicit approval is required before completion.`
        };
      }
    }
  }

  return { valid: true };
}

export function canMakeApprovalDecision(
  db: Database,
  user: AuthUser,
  approval: {
    id?: string;
    requester_id: string;
    assigned_approver_id: string;
    status: string;
    issue_id?: string;
  },
  projectId?: string
): { allowed: boolean; error?: string } {
  // 1. Approval must be in PENDING status
  if (approval.status !== 'PENDING') {
    return {
      allowed: false,
      error: `APPROVAL_ALREADY_DECIDED: Approval request is already in status "${approval.status}". Decisions cannot be altered once finalized.`
    };
  }

  // 2. Self-approval prevention
  if (approval.requester_id === user.id) {
    return {
      allowed: false,
      error: 'SELF_APPROVAL_PROHIBITED: As the initiator/requester of this operation, you cannot approve your own request. An independent designated approver is required.'
    };
  }

  // 3. User MUST be an explicitly designated approver
  // A Team Lead, Operations Head, or Administrator does NOT automatically become an approver because of their role!
  if (user.is_approver !== 1) {
    return {
      allowed: false,
      error: 'UNAUTHORIZED_APPROVER: Role alone does not grant approval permissions. You must be explicitly designated as an approver.'
    };
  }

  // 4. Project Scope Authorization check
  if (projectId) {
    const projAccess = checkProjectAccess(db, user, projectId, 'viewer');
    if (!projAccess.allowed) {
      return {
        allowed: false,
        error: 'PROJECT_SCOPE_RESTRICTED: You do not have authorized project scope for the project associated with this approval request.'
      };
    }
  }

  // 5. Must be assigned approver or have authorized project administrative oversight
  const isAssigned = approval.assigned_approver_id === user.id;
  const hasProjectAdminOversight = projectId ? checkProjectAccess(db, user, projectId, 'admin').allowed : false;

  if (!isAssigned && !hasProjectAdminOversight) {
    return {
      allowed: false,
      error: 'UNAUTHORIZED_APPROVER: This approval request is assigned to another designated approver and you do not hold administrative oversight for this project scope.'
    };
  }

  return { allowed: true };
}
