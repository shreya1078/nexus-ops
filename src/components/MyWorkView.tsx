import React, { useState, useEffect } from 'react';
import { Issue, User } from '../types/index.ts';
import { api } from '../utils/api.ts';

interface MyWorkViewProps {
  currentUser: User | null;
  onSelectIssue: (issueId: string) => void;
  onOpenCreateIssue: () => void;
}

export const MyWorkView: React.FC<MyWorkViewProps> = ({
  currentUser,
  onSelectIssue,
  onOpenCreateIssue
}) => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [priority, setPriority] = useState('All');
  const [team, setTeam] = useState('All');
  const [sort, setSort] = useState('due_date');
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');

  const fetchMyWork = () => {
    setLoading(true);
    api.getIssues({
      myWork: true,
      search,
      status,
      priority,
      teamId: team !== 'All' ? team : undefined,
      sort,
      page,
      limit: 8
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
    fetchMyWork();
  }, [currentUser, search, status, priority, team, sort, page]);

  return (
    <div className="w-full flex flex-col gap-5 pb-12 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
          My Work
        </h1>
        <p className="font-body-md text-body-md text-secondary">
          Issues assigned to you across all projects you can access.
        </p>
      </div>

      {/* Filter and Control Bar (Matches Image 9) */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
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
            placeholder="Search by issue title or ID..."
            className="w-full h-9 pl-8 pr-3 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-body-sm text-body-sm placeholder-secondary focus:outline-none focus:border-primary shadow-2xs"
          />
        </div>

        {/* Dropdowns & View Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Dropdown */}
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

          {/* Priority Dropdown */}
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

          {/* Team Dropdown */}
          <div className="flex items-center gap-1 bg-surface-container-lowest border border-surface-container-high rounded px-2.5 h-8 text-label-sm font-label-sm shadow-2xs">
            <span className="text-secondary">Team:</span>
            <select
              value={team}
              onChange={e => {
                setTeam(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-primary font-medium focus:outline-none cursor-pointer"
            >
              <option value="All">All</option>
              <option value="team_cust_ops">Customer Operations</option>
              <option value="team_fin_ops">Finance Operations</option>
              <option value="team_compliance">Compliance</option>
              <option value="team_engineering">Engineering</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1 bg-surface-container-lowest border border-surface-container-high rounded px-2.5 h-8 text-label-sm font-label-sm shadow-2xs">
            <span className="material-symbols-outlined text-[14px] text-secondary">swap_vert</span>
            <span className="text-secondary">Sort:</span>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="bg-transparent text-primary font-medium focus:outline-none cursor-pointer"
            >
              <option value="due_date">Due date</option>
              <option value="updated_at">Last updated</option>
              <option value="priority">Priority</option>
            </select>
          </div>

          {/* List vs Board Toggle */}
          <div className="flex items-center rounded bg-surface-container-low p-0.5 border border-surface-container-high">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded font-label-md text-label-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-primary text-on-primary'
                  : 'text-secondary hover:text-on-surface'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`px-3 py-1 rounded font-label-md text-label-md transition-colors ${
                viewMode === 'board'
                  ? 'bg-primary text-on-primary'
                  : 'text-secondary hover:text-on-surface'
              }`}
            >
              Board
            </button>
          </div>
        </div>
      </div>

      {/* Main Table or Card Grid */}
      <div className="bg-surface-container-lowest rounded border border-surface-container-high shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-surface-container-high text-secondary font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-2.5 px-4 font-semibold w-24">ID</th>
                <th className="py-2.5 px-4 font-semibold">Title</th>
                <th className="py-2.5 px-4 font-semibold w-28">Status</th>
                <th className="py-2.5 px-4 font-semibold w-24">Priority</th>
                <th className="py-2.5 px-4 font-semibold w-40">Team</th>
                <th className="py-2.5 px-4 font-semibold w-28">Due date</th>
                <th className="py-2.5 px-4 font-semibold w-28">Last updated</th>
                <th className="py-2.5 px-4 font-semibold w-20 text-center">Assignee</th>
                <th className="py-2.5 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-high font-body-sm text-body-sm text-on-surface">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-secondary font-mono-data">
                    Synchronizing operational queue...
                  </td>
                </tr>
              ) : issues.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-secondary font-mono-data">
                    No matching issues found for the active filter set.
                  </td>
                </tr>
              ) : (
                issues.map(item => (
                  <tr
                    key={item.id}
                    onClick={() => onSelectIssue(item.id)}
                    className="hover:bg-surface-container-low transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-mono-data text-label-sm text-secondary font-medium">
                      {item.id}
                    </td>
                    <td className="py-3 px-4 font-medium text-on-surface">
                      <div className="flex items-center gap-2">
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
                      <span className="font-mono-data text-[11px] px-2.5 py-0.5 rounded bg-surface-container-high text-on-surface font-medium whitespace-nowrap">
                        {item.status}
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
                        {item.priority}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-secondary font-body-sm truncate max-w-[160px]">
                      {item.team_name || 'Customer Operations'}
                    </td>
                    <td className="py-3 px-4 font-mono-data text-label-sm text-secondary whitespace-nowrap">
                      {item.due_label || item.due_date || 'Scheduled'}
                    </td>
                    <td className="py-3 px-4 font-mono-data text-label-sm text-secondary whitespace-nowrap">
                      Recently
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="w-6 h-6 rounded-full bg-primary text-on-primary font-mono-data text-[10px] font-bold mx-auto flex items-center justify-center">
                        {item.assignee_initials || 'SL'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-secondary text-right">
                      <span className="material-symbols-outlined text-[16px] group-hover:text-primary group-hover:translate-x-0.5 transition-transform">
                        chevron_right
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer (Matches Image 9) */}
        <div className="px-4 py-3 bg-surface-container-low border-t border-surface-container-high flex flex-col sm:flex-row items-center justify-between gap-3 text-secondary font-body-sm text-body-sm">
          <span>
            Showing <strong className="text-on-surface font-semibold">{issues.length > 0 ? (page - 1) * 8 + 1 : 0}-{Math.min(page * 8, total)}</strong> of <strong className="text-on-surface font-semibold">{total}</strong> issues
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="w-7 h-7 rounded border border-surface-container-high flex items-center justify-center text-on-surface hover:bg-surface-container disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">chevron_left</span>
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
              className="w-7 h-7 rounded border border-surface-container-high flex items-center justify-center text-on-surface hover:bg-surface-container disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
