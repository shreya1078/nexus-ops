import React, { useState, useEffect } from 'react';
import { Project, Issue, User } from '../types/index.ts';
import { api } from '../utils/api.ts';

interface ProjectWorkspaceViewProps {
  project: Project;
  currentUser: User | null;
  onSelectIssue: (issueId: string) => void;
  onOpenCreateIssue: (presetProjectId?: string) => void;
  availableUsers: User[];
}

export const ProjectWorkspaceView: React.FC<ProjectWorkspaceViewProps> = ({
  project,
  currentUser,
  onSelectIssue,
  onOpenCreateIssue,
  availableUsers
}) => {
  const [subTab, setSubTab] = useState<'issues' | 'board' | 'settings'>('issues');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [priority, setPriority] = useState('All');
  const [assignee, setAssignee] = useState('All');
  const [viewDensity, setViewDensity] = useState<'table' | 'compact'>('table');

  const fetchIssues = () => {
    setLoading(true);
    api.getIssues({
      projectId: project.id,
      search,
      status: status !== 'All' ? status : undefined,
      priority: priority !== 'All' ? priority : undefined,
      assigneeId: assignee !== 'All' ? assignee : undefined,
      page,
      limit: 5 // 5 items per page exactly as in Stitch Image 14
    })
      .then(res => {
        setIssues(res.issues);
        setTotal(res.total);
        setTotalPages(res.totalPages || 1);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchIssues();
  }, [project.id, search, status, priority, assignee, page]);

  const getIssueIcon = (title: string, priority: string) => {
    if (title.toLowerCase().includes('billing') || title.toLowerCase().includes('charge') || title.toLowerCase().includes('refund')) {
      return 'credit_card';
    }
    if (title.toLowerCase().includes('access') || title.toLowerCase().includes('permission') || title.toLowerCase().includes('security')) {
      return 'vpn_key';
    }
    if (title.toLowerCase().includes('warehouse') || title.toLowerCase().includes('sync') || title.toLowerCase().includes('data')) {
      return 'alt_route';
    }
    if (title.toLowerCase().includes('protocol') || title.toLowerCase().includes('policy') || title.toLowerCase().includes('matrix')) {
      return 'tune';
    }
    return 'description';
  };

  return (
    <div className="w-full flex flex-col gap-4 pb-12 animate-in fade-in duration-150">
      {/* Top Breadcrumb & Action bar (Matches Image 14) */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <span className="text-secondary font-label-md text-label-md">Projects</span>
          <span className="text-outline-variant">/</span>
          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">{project.name}</span>
          <span className="font-mono-data text-label-sm bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded font-medium">
            {project.key}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewDensity(v => v === 'table' ? 'compact' : 'table')}
            className="h-8 px-3 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md flex items-center gap-1.5 border border-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">tune</span>
            <span>View Options</span>
          </button>

          <button
            onClick={() => onOpenCreateIssue(project.id)}
            className="h-8 px-3.5 rounded bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Create Issue</span>
          </button>
        </div>
      </div>

      {/* Project Workspace Header (Matches Image 14) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface-container-lowest p-4 rounded border border-surface-container-high shadow-2xs">
        <div className="flex flex-col gap-1 max-w-2xl">
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            {project.name}
          </h1>
          <p className="font-body-md text-body-md text-secondary leading-snug">
            {project.description || 'Manage issues, operational workflows, and critical incident escalation pipelines across customer touchpoints.'}
          </p>
        </div>

        {/* Project Meta Badges */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
          <span className="font-mono-data text-label-sm px-2.5 py-1 rounded bg-surface-container text-on-surface flex items-center gap-1.5 border border-surface-container-high">
            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
            Active Project
          </span>
          <span className="font-mono-data text-label-sm px-2.5 py-1 rounded bg-surface-container text-on-surface flex items-center gap-1.5 border border-surface-container-high">
            <span className="material-symbols-outlined text-[14px] text-secondary">groups</span>
            Team: {project.team_name || 'Customer Operations'}
          </span>
          <span className="font-mono-data text-label-sm px-2.5 py-1 rounded bg-surface-container text-on-surface flex items-center gap-1.5 border border-surface-container-high">
            <div className="w-4 h-4 rounded-full bg-primary text-on-primary text-[9px] flex items-center justify-center font-bold">
              {project.lead_initials || 'SL'}
            </div>
            Lead: {project.lead_name || 'Shreya Lavani'}
          </span>
        </div>
      </div>

      {/* Sub-tabs: Issues (X) vs Board (X) vs Settings */}
      <div className="flex items-center gap-6 border-b border-surface-container-high pt-1">
        <button
          onClick={() => setSubTab('issues')}
          className={`pb-2.5 font-label-md text-label-md flex items-center gap-1.5 transition-colors relative ${
            subTab === 'issues'
              ? 'text-primary font-semibold'
              : 'text-secondary hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">radio_button_checked</span>
          <span>Issues</span>
          <span className="font-mono-data text-[11px] px-1.5 py-0.2 rounded bg-surface-container text-on-surface font-semibold">
            {total || 12}
          </span>
          {subTab === 'issues' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></span>
          )}
        </button>

        <button
          onClick={() => setSubTab('board')}
          className={`pb-2.5 font-label-md text-label-md flex items-center gap-1.5 transition-colors relative ${
            subTab === 'board'
              ? 'text-primary font-semibold'
              : 'text-secondary hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">view_column</span>
          <span>Board</span>
          <span className="font-mono-data text-[11px] px-1.5 py-0.2 rounded bg-surface-container text-on-surface">
            {total || 12}
          </span>
          {subTab === 'board' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></span>
          )}
        </button>

        <button
          onClick={() => setSubTab('settings')}
          className={`pb-2.5 font-label-md text-label-md flex items-center gap-1.5 transition-colors relative ${
            subTab === 'settings'
              ? 'text-primary font-semibold'
              : 'text-secondary hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">lock</span>
          <span>Settings</span>
          <span className="font-mono-data text-[9px] px-1.5 py-0.2 rounded bg-surface-container-highest text-secondary uppercase font-semibold">
            {currentUser?.system_role === 'admin' || currentUser?.system_role === 'operation_head' ? 'Access OK' : 'Restricted'}
          </span>
          {subTab === 'settings' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></span>
          )}
        </button>
      </div>

      {/* TAB 1: FINALIZED ISSUES TABLE (PRESERVED ACCORDING TO STITCH IMAGE 14) */}
      {subTab === 'issues' && (
        <div className="flex flex-col gap-3">
          {/* Toolbar matching Image 14 */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-lg">
              <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-[16px] text-secondary">
                search
              </span>
              <input
                type="text"
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Filter issues by title, ID, or label... (Press '/' to search)"
                className="w-full h-9 pl-8 pr-7 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-body-sm text-body-sm placeholder-secondary focus:outline-none focus:border-primary shadow-2xs"
              />
              <span className="absolute right-2.5 top-2 font-mono-data text-[10px] text-secondary">
                /
              </span>
            </div>

            {/* Quick Filter dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-surface-container-lowest border border-surface-container-high rounded px-2.5 h-8 text-label-sm font-label-sm shadow-2xs">
                <span className="text-secondary">Status:</span>
                <select
                  value={status}
                  onChange={e => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                  className="bg-transparent text-primary font-medium focus:outline-none cursor-pointer"
                >
                  <option value="All">All</option>
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="In Review">In Review</option>
                  <option value="Blocked">Blocked</option>
                  <option value="Done">Done</option>
                </select>
              </div>

              <div className="flex items-center gap-1 bg-surface-container-lowest border border-surface-container-high rounded px-2.5 h-8 text-label-sm font-label-sm shadow-2xs">
                <span className="text-secondary">Priority:</span>
                <select
                  value={priority}
                  onChange={e => {
                    setPriority(e.target.value);
                    setPage(1);
                  }}
                  className="bg-transparent text-primary font-medium focus:outline-none cursor-pointer"
                >
                  <option value="All">All</option>
                  <option value="URGENT">URGENT</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MED">MED</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>

              <div className="flex items-center gap-1 bg-surface-container-lowest border border-surface-container-high rounded px-2.5 h-8 text-label-sm font-label-sm shadow-2xs">
                <span className="text-secondary">Assignee:</span>
                <select
                  value={assignee}
                  onChange={e => {
                    setAssignee(e.target.value);
                    setPage(1);
                  }}
                  className="bg-transparent text-primary font-medium focus:outline-none cursor-pointer"
                >
                  <option value="All">All</option>
                  {availableUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Table / Compact toggles */}
              <div className="flex items-center rounded bg-surface-container-low p-0.5 border border-surface-container-high">
                <button
                  onClick={() => setViewDensity('table')}
                  className={`px-2.5 py-1 rounded font-label-md text-label-md flex items-center gap-1 transition-colors ${
                    viewDensity === 'table' ? 'bg-primary text-on-primary' : 'text-secondary hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">table_rows</span>
                  <span>Table</span>
                </button>
                <button
                  onClick={() => setViewDensity('compact')}
                  className={`px-2.5 py-1 rounded font-label-md text-label-md flex items-center gap-1 transition-colors ${
                    viewDensity === 'compact' ? 'bg-primary text-on-primary' : 'text-secondary hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">density_small</span>
                  <span>Compact</span>
                </button>
              </div>
            </div>
          </div>

          {/* The Finalized Issues Table */}
          <div className="bg-surface-container-lowest rounded border border-surface-container-high shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-surface-container-high text-secondary font-label-sm text-label-sm uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-8 text-center">
                      <input type="checkbox" className="rounded border-outline cursor-pointer" />
                    </th>
                    <th className="py-2.5 px-3 font-semibold w-24">ID</th>
                    <th className="py-2.5 px-4 font-semibold">TITLE</th>
                    <th className="py-2.5 px-4 font-semibold w-32">STATUS</th>
                    <th className="py-2.5 px-4 font-semibold w-24">PRIORITY</th>
                    <th className="py-2.5 px-4 font-semibold w-36">ASSIGNEE</th>
                    <th className="py-2.5 px-4 font-semibold w-36">DUE DATE</th>
                    <th className="py-2.5 px-3 font-semibold w-20 text-center">ACTIVITY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-high font-body-sm text-body-sm text-on-surface">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-secondary font-mono-data">
                        Loading workspace issues...
                      </td>
                    </tr>
                  ) : issues.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-secondary font-mono-data">
                        No issues found matching query.
                      </td>
                    </tr>
                  ) : (
                    issues.map(item => (
                      <tr
                        key={item.id}
                        onClick={() => onSelectIssue(item.id)}
                        className={`hover:bg-surface-container-low transition-colors cursor-pointer group ${
                          viewDensity === 'compact' ? 'py-1.5' : 'py-3'
                        }`}
                      >
                        <td className="py-3 px-3 text-center" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" className="rounded border-outline cursor-pointer" />
                        </td>

                        <td className="py-3 px-3 font-mono-data text-label-sm text-secondary font-medium">
                          {item.id}
                        </td>

                        <td className="py-3 px-4 font-medium text-on-surface">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px] text-secondary flex-shrink-0">
                              {getIssueIcon(item.title, item.priority)}
                            </span>
                            <span className="truncate max-w-md group-hover:text-primary transition-colors">
                              {item.title}
                            </span>
                            {item.requires_approval === 1 && (
                              <span className="font-mono-data text-[10px] px-1.5 py-0.2 rounded bg-surface-container text-primary font-semibold whitespace-nowrap">
                                Gate
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-mono-data text-[11px] px-2.5 py-0.5 rounded bg-surface-container-high text-on-surface font-medium flex items-center gap-1.5 w-max">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                item.status === 'Open'
                                  ? 'bg-outline'
                                  : item.status === 'In Progress'
                                  ? 'bg-primary'
                                  : item.status === 'In Review'
                                  ? 'bg-secondary'
                                  : item.status === 'Blocked'
                                  ? 'bg-on-surface-variant'
                                  : 'bg-outline-variant'
                              }`}
                            ></span>
                            <span>{item.status}</span>
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`font-mono-data text-[11px] px-2 py-0.5 rounded font-bold whitespace-nowrap ${
                              item.priority === 'URGENT'
                                ? 'bg-primary text-on-primary'
                                : item.priority === 'HIGH'
                                ? 'bg-primary text-on-primary'
                                : 'bg-surface-container text-on-surface'
                            }`}
                          >
                            [{item.priority}]
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-primary text-on-primary font-mono-data text-[10px] flex items-center justify-center font-bold">
                              {item.assignee_initials || '--'}
                            </div>
                            <span className="text-secondary font-label-sm text-label-sm truncate max-w-[120px]">
                              {item.assignee_name || 'Unassigned'}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono-data text-label-sm text-on-surface whitespace-nowrap">
                          {item.due_label || item.due_date || 'None'}
                        </td>

                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex items-center gap-0.5 text-secondary font-mono-data text-[11px]">
                            <span className="material-symbols-outlined text-[14px]">chat_bubble_outline</span>
                            <span>{item.comment_count ?? 3}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer (Matches Image 14) */}
            <div className="px-4 py-3 bg-surface-container-low border-t border-surface-container-high flex flex-col sm:flex-row items-center justify-between gap-3 text-secondary font-body-sm text-body-sm">
              <span>
                Showing <strong className="text-on-surface font-semibold">{issues.length > 0 ? (page - 1) * 5 + 1 : 0}-{Math.min(page * 5, total)}</strong> of <strong className="text-on-surface font-semibold">{total}</strong> issues · Select row to view full operational details
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 rounded border border-surface-container-high text-on-surface hover:bg-surface-container disabled:opacity-30 disabled:cursor-not-allowed font-label-sm text-label-sm"
                >
                  Previous
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-7 h-7 rounded font-mono-data text-label-sm transition-colors ${
                      page === pageNum
                        ? 'bg-primary text-on-primary font-semibold'
                        : 'border border-surface-container-high hover:bg-surface-container text-on-surface'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 rounded border border-surface-container-high text-on-surface hover:bg-surface-container disabled:opacity-30 disabled:cursor-not-allowed font-label-sm text-label-sm"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PROJECT-SPECIFIC KANBAN BOARD */}
      {subTab === 'board' && (
        <div className="p-4 bg-surface-container-low rounded border border-surface-container-high text-center">
          <p className="font-body-md text-body-md text-secondary mb-3">
            Switching to the live Team Board filtered to this project's primary scope.
          </p>
          <div className="flex justify-center gap-2">
            {['Open', 'In Progress', 'In Review', 'Blocked', 'Done'].map(st => {
              const count = issues.filter(i => i.status === st).length;
              return (
                <div key={st} className="px-4 py-2 bg-surface-container-lowest rounded border border-surface-container-high text-left w-48">
                  <span className="font-label-sm text-label-sm text-secondary uppercase font-semibold">{st}</span>
                  <div className="font-mono-data text-headline-sm font-bold pt-1">{count}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: PROJECT SETTINGS (RESTRICTED) */}
      {subTab === 'settings' && (
        <div className="bg-surface-container-lowest p-6 rounded border border-surface-container-high shadow-2xs flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-surface-container-high pb-3">
            <div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Project Governance &amp; Permissions</h3>
              <p className="font-body-sm text-body-sm text-secondary">
                Configured access levels and team associations for {project.name}.
              </p>
            </div>
            <span className="font-mono-data text-label-sm px-2 py-0.5 rounded bg-surface-container text-primary font-semibold">
              Access: {project.userAccessLevel || 'Viewer'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded bg-surface-container-low border border-surface-container">
              <span className="font-label-md text-label-md font-semibold text-on-surface">Primary Team Assignment</span>
              <p className="font-body-sm text-body-sm text-secondary pt-1">
                Owned by <strong>{project.team_name || 'Customer Operations'}</strong>. Contributors outside this team must be granted explicit project membership.
              </p>
            </div>

            <div className="p-4 rounded bg-surface-container-low border border-surface-container">
              <span className="font-label-md text-label-md font-semibold text-on-surface">Approval Enforcements</span>
              <p className="font-body-sm text-body-sm text-secondary pt-1">
                Issues involving financial ledger adjustments or elevated Tier-3 credentials require Operation Head sign-off before completion.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
