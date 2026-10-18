export interface User {
  id: string;
  email: string;
  name: string;
  initials: string;
  system_role: 'admin' | 'operation_head' | 'team_lead' | 'team_member';
  title: string;
  is_approver: number;
  avatar_bg: string;
}

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  title: string;
  team_role: 'lead' | 'member';
}

export interface Team {
  id: string;
  name: string;
  code: string;
  description: string;
  lead_user_id: string;
  lead_name?: string;
  lead_initials?: string;
  members?: TeamMember[];
}

export interface ProjectStats {
  total_issues: number;
  active_issues: number;
  blocked_issues: number;
  pending_approvals: number;
}

export interface ProjectMember {
  id: string;
  name: string;
  initials: string;
  title: string;
  access_level: 'admin' | 'editor' | 'viewer';
}

export interface Project {
  id: string;
  name: string;
  key: string;
  description: string;
  lead_user_id: string;
  lead_name?: string;
  lead_initials?: string;
  primary_team_id: string;
  team_name?: string;
  status: 'active' | 'archived';
  issue_counter: number;
  stats?: ProjectStats;
  members?: ProjectMember[];
  userAccessLevel?: 'admin' | 'editor' | 'viewer';
}

export interface Issue {
  id: string;
  project_id: string;
  project_name?: string;
  project_key?: string;
  team_id?: string;
  team_name?: string;
  title: string;
  description: string;
  status: 'Open' | 'In Progress' | 'In Review' | 'Blocked' | 'Done';
  priority: 'LOW' | 'MED' | 'HIGH' | 'URGENT';
  assignee_id: string | null;
  assignee_name?: string | null;
  assignee_initials?: string | null;
  assignee_title?: string | null;
  creator_id: string;
  creator_name?: string;
  creator_initials?: string;
  due_date: string | null;
  due_label: string | null;
  blocked_reason: string | null;
  requires_approval: number;
  approval_status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  approval_policy_code: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  comment_count?: number;
  approval_id?: string;
  approval_gate_status?: string;
  approval_policy_desc?: string;
  approval_assigned_to?: string;
}

export interface Comment {
  id: string;
  issue_id: string;
  author_id: string;
  author_name: string;
  author_initials: string;
  author_title: string;
  author_role: string;
  body: string;
  is_edited: number;
  created_at: string;
  updated_at: string;
}

export interface ActivityHistory {
  id: string;
  issue_id: string;
  actor_id: string;
  actor_name: string;
  actor_initials: string;
  action: string;
  details: string;
  created_at: string;
}

export interface Approval {
  id: string;
  issue_id: string;
  issue_title?: string;
  issue_priority?: string;
  issue_status?: string;
  project_id?: string;
  project_name?: string;
  requester_id: string;
  requester_name?: string;
  requester_initials?: string;
  assigned_approver_id: string;
  approver_name?: string;
  policy_code: string;
  policy_description: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decision_reason: string | null;
  decided_at: string | null;
  decided_by_id: string | null;
  decided_by_name?: string | null;
  created_at: string;
}

export interface DashboardData {
  metrics: {
    assignedToMe: number;
    needsAttention: number;
    pendingMyApproval: number;
  };
  myWork: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    due_label: string;
    due_date: string;
    project_key: string;
  }>;
  needsAttention: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    blocked_reason: string;
    policy_code: string;
    reason: string;
  }>;
  stageCounts: {
    open: number;
    in_progress: number;
    in_review: number;
    blocked: number;
    done: number;
  };
}

export type ViewTab = 'dashboard' | 'projects' | 'my-work' | 'team-board' | 'approvals' | 'settings' | 'workspace';
