import {
  User,
  Team,
  Project,
  Issue,
  Comment,
  Approval,
  DashboardData
} from '../types/index.ts';

const USER_STORAGE_KEY = 'nexus_ops_active_user_id';
const SESSION_STORAGE_KEY = 'nexus_ops_session_token';

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(SESSION_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // fallback
  }
}

export function getActiveUserId(): string {
  try {
    return localStorage.getItem(USER_STORAGE_KEY) || 'usr_shreya';
  } catch {
    return 'usr_shreya';
  }
}

export function setActiveUserId(userId: string): void {
  try {
    localStorage.setItem(USER_STORAGE_KEY, userId);
  } catch {
    // fallback
  }
}

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getSessionToken();
  const userId = getActiveUserId();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (userId) {
    headers.set('x-user-id', userId);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error: any = new Error(data.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

export const api = {
  // Authentication
  login: async (email: string, password: string): Promise<{ token: string; user: User; expiresAt: string }> => {
    const data = await apiFetch<{ token: string; user: User; expiresAt: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    setSessionToken(data.token);
    setActiveUserId(data.user.id);
    return data;
  },

  logout: async (): Promise<void> => {
    try {
      await apiFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
    } finally {
      setSessionToken(null);
    }
  },

  getSession: async (): Promise<{ user: User } | null> => {
    const token = getSessionToken();
    if (!token) return null;
    try {
      return await apiFetch<{ user: User }>('/api/auth/session');
    } catch {
      setSessionToken(null);
      return null;
    }
  },

  getDemoUsers: () => apiFetch<User[]>('/api/auth/demo-users'),

  switchUser: async (userId: string): Promise<{ token: string; user: User; expiresAt: string }> => {
    const data = await apiFetch<{ token: string; user: User; expiresAt: string }>('/api/auth/switch-user', {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
    setSessionToken(data.token);
    setActiveUserId(data.user.id);
    return data;
  },

  getMe: () => apiFetch<{ user: User; teams: any[]; authorizedProjects: any[] }>('/api/me'),
  getUsers: () => apiFetch<User[]>('/api/users'),
  getTeams: () => apiFetch<Team[]>('/api/teams'),
  getProjects: () => apiFetch<Project[]>('/api/projects'),
  createProject: (data: { name: string; key: string; description?: string; primary_team_id?: string }) =>
    apiFetch<Project>('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
  getProject: (id: string) => apiFetch<Project>(`/api/projects/${id}`),

  getIssues: (params: {
    projectId?: string;
    teamId?: string;
    status?: string;
    priority?: string;
    assigneeId?: string;
    search?: string;
    myWork?: boolean;
    sort?: string;
    page?: number;
    limit?: number;
  } = {}) => {
    const query = new URLSearchParams();
    if (params.projectId) query.set('projectId', params.projectId);
    if (params.teamId) query.set('teamId', params.teamId);
    if (params.status && params.status !== 'All') query.set('status', params.status);
    if (params.priority && params.priority !== 'All') query.set('priority', params.priority);
    if (params.assigneeId && params.assigneeId !== 'All' && params.assigneeId !== 'All Members') {
      query.set('assigneeId', params.assigneeId);
    }
    if (params.search) query.set('search', params.search);
    if (params.myWork) query.set('myWork', 'true');
    if (params.sort) query.set('sort', params.sort);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));

    return apiFetch<{
      issues: Issue[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/issues?${query.toString()}`);
  },

  getIssue: (id: string) => apiFetch<Issue & { comments: Comment[]; activities: any[]; activeApproval?: Approval }>(`/api/issues/${id}`),

  createIssue: (data: {
    project_id: string;
    title: string;
    description?: string;
    priority?: string;
    status?: string;
    assignee_id?: string | null;
    due_date?: string | null;
    requires_approval?: boolean;
    approval_policy_code?: string | null;
  }, idempotencyKey?: string) => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }
    return apiFetch<Issue>('/api/issues', {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
  },

  updateIssue: (id: string, data: {
    version: number;
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    assignee_id?: string | null;
    due_date?: string | null;
    blocked_reason?: string | null;
  }) => apiFetch<Issue>(`/api/issues/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),

  addComment: (issueId: string, body: string) =>
    apiFetch<Comment>(`/api/issues/${issueId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body })
    }),

  editComment: (commentId: string, body: string) =>
    apiFetch<Comment>(`/api/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body })
    }),

  deleteComment: (commentId: string) =>
    apiFetch<{ success: boolean; deleted_id: string }>(`/api/comments/${commentId}`, {
      method: 'DELETE'
    }),

  getApprovals: (filter: 'pending' | 'my_requests' | 'all' = 'pending') =>
    apiFetch<Approval[]>(`/api/approvals?filter=${filter}`),

  decideApproval: (
    approvalId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string,
    idempotencyKey?: string
  ) => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }
    return apiFetch<{
      id: string;
      issue_id: string;
      decision: string;
      reason: string | null;
      decided_by: string;
      decided_at: string;
    }>(`/api/approvals/${approvalId}/decide`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ decision, reason })
    });
  },

  getDashboard: () => apiFetch<DashboardData>('/api/dashboard'),

  resetDemoData: () => apiFetch<{ success: boolean; message: string }>('/api/system/reset-demo', { method: 'POST' })
};
