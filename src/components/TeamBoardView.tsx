import React, { useState, useEffect } from 'react';
import { Issue, Team, User } from '../types/index.ts';
import { api } from '../utils/api.ts';

interface TeamBoardViewProps {
  currentUser: User | null;
  teams: Team[];
  onSelectIssue: (issueId: string) => void;
  onOpenCreateIssue: (presetTeamId?: string) => void;
}

const COLUMNS: Array<{ key: Issue['status']; title: string; dotClass: string }> = [
  { key: 'Open', title: 'Open', dotClass: 'bg-outline' },
  { key: 'In Progress', title: 'In Progress', dotClass: 'bg-primary' },
  { key: 'In Review', title: 'In Review', dotClass: 'bg-secondary' },
  { key: 'Blocked', title: 'Blocked', dotClass: 'bg-on-surface-variant' },
  { key: 'Done', title: 'Done', dotClass: 'bg-outline-variant' }
];

export const TeamBoardView: React.FC<TeamBoardViewProps> = ({
  currentUser,
  teams,
  onSelectIssue,
  onOpenCreateIssue
}) => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showTeamMenu, setShowTeamMenu] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [assigneeFilter, setAssigneeFilter] = useState('All Members');
  const [myAssignedOnly, setMyAssignedOnly] = useState(false);

  // Dropdown states
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showAssigneeMenu, setShowAssigneeMenu] = useState(false);

  // Drag & Move state
  const [movingIssueId, setMovingIssueId] = useState<string | null>(null);
  const [quickStageError, setQuickStageError] = useState<string | null>(null);

  useEffect(() => {
    if (teams.length > 0 && !selectedTeam) {
      setSelectedTeam(teams[0]);
    }
  }, [teams]);

  const fetchBoardIssues = () => {
    api.getIssues({
      teamId: selectedTeam?.id || undefined,
      limit: 50
    })
      .then(res => setIssues(res.issues))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchBoardIssues();
  }, [selectedTeam, currentUser]);

  // Filter issues locally for instantaneous responsiveness
  const filteredIssues = issues.filter(issue => {
    const matchesSearch = !search ||
      issue.title.toLowerCase().includes(search.toLowerCase()) ||
      issue.id.toLowerCase().includes(search.toLowerCase());

    const matchesPriority = priorityFilter === 'All' || issue.priority === priorityFilter;

    let matchesAssignee = true;
    if (assigneeFilter === 'Unassigned') {
      matchesAssignee = !issue.assignee_id;
    } else if (assigneeFilter !== 'All Members') {
      matchesAssignee = issue.assignee_name?.toLowerCase().includes(assigneeFilter.toLowerCase()) ?? false;
    }

    const matchesMyAssigned = !myAssignedOnly || issue.assignee_id === currentUser?.id;

    return matchesSearch && matchesPriority && matchesAssignee && matchesMyAssigned;
  });

  const getColumnIssues = (status: Issue['status']) => {
    return filteredIssues.filter(i => i.status === status);
  };

  // Quick Move Stage Handler
  const handleQuickMove = async (issue: Issue, targetStatus: Issue['status'], e: React.MouseEvent) => {
    e.stopPropagation();
    setQuickStageError(null);
    setMovingIssueId(issue.id);

    try {
      await api.updateIssue(issue.id, {
        version: issue.version,
        status: targetStatus
      });
      fetchBoardIssues();
    } catch (err: any) {
      console.error(err);
      setQuickStageError(err.message || `Cannot move ${issue.id} to ${targetStatus}`);
      setTimeout(() => setQuickStageError(null), 5000);
    } finally {
      setMovingIssueId(null);
    }
  };

  return (
    <div className="w-full flex flex-col pb-12 animate-in fade-in duration-150">
      {/* Elevated Access Banner (Matches Image 3) */}
      <div className="px-6 py-2 bg-surface-container-high border-b border-surface-container-highest flex items-center justify-between text-on-surface -mx-6 -mt-6 mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-primary">admin_panel_settings</span>
          <p className="font-mono-data text-label-sm">
            <span className="font-semibold text-primary">
              {currentUser?.title || 'Operation Head'} Access:
            </span>{' '}
            Viewing {selectedTeam?.name || 'Customer Operations'}. You can assign, reassign, or move issues across all 5 workflow stages.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
          <span className="font-mono-data text-label-sm text-secondary">Real-Time Sync Active</span>
        </div>
      </div>

      {/* Stage Error Feedback if rule blocked */}
      {quickStageError && (
        <div className="mb-4 p-3 rounded bg-error-container text-on-error-container border border-error/20 font-body-sm text-body-sm flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-error">gavel</span>
            <span>{quickStageError}</span>
          </div>
          <button onClick={() => setQuickStageError(null)} className="text-error hover:underline text-label-sm">
            Dismiss
          </button>
        </div>
      )}

      {/* Page Header (Matches Image 3) */}
      <div className="pt-2 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">Team Board</h1>
            <span className="font-mono-data text-label-sm bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded font-medium">
              OPS-BOARD
            </span>
          </div>
          <p className="font-body-md text-body-md text-secondary">
            Operational workflow and workload across authorized teams.
          </p>
        </div>

        {/* Right Controls: Team Selector & Action */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Team Dropdown */}
          <div className="relative inline-block text-left">
            <button
              onClick={() => setShowTeamMenu(!showTeamMenu)}
              className="h-8 px-3 bg-surface-container-low hover:bg-surface-container text-primary font-label-md text-label-md rounded border border-surface-container-high flex items-center gap-2 transition-colors shadow-2xs"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">groups</span>
              <span className="font-medium">Team: {selectedTeam?.name || 'Customer Operations'}</span>
              <span className="material-symbols-outlined text-[16px] text-secondary">expand_more</span>
            </button>

            {showTeamMenu && (
              <div className="absolute right-0 mt-1 w-60 bg-surface-container-lowest rounded shadow-xl border border-surface-container-high z-40 py-1 animate-in fade-in">
                <div className="px-3 py-1 font-mono-data text-label-sm text-secondary bg-surface-container-low">
                  Authorized Teams
                </div>
                {teams.map(t => {
                  const isCur = t.id === selectedTeam?.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSelectedTeam(t);
                        setShowTeamMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 font-label-md text-label-md hover:bg-surface-container flex items-center justify-between transition-colors ${
                        isCur ? 'bg-surface-container-high' : ''
                      }`}
                    >
                      <span>{t.name}</span>
                      {isCur && (
                        <span className="material-symbols-outlined text-[16px] text-primary">check</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Create Issue Button */}
          <button
            onClick={() => onOpenCreateIssue()}
            className="h-8 px-3.5 bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md rounded flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Create Issue</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar (Matches Image 3) */}
      <div className="px-4 py-2.5 bg-surface-container-low border border-surface-container-high rounded flex flex-col xl:flex-row xl:items-center justify-between gap-3 shadow-2xs mb-4">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Input */}
          <div className="relative flex items-center min-w-[220px] max-w-xs">
            <span className="material-symbols-outlined absolute left-2.5 text-[16px] text-secondary pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter team issues..."
              className="w-full h-8 pl-8 pr-3 bg-surface-container-lowest font-body-sm text-body-sm text-on-surface placeholder-secondary rounded border border-surface-container-high focus:outline-none focus:border-primary shadow-2xs"
            />
          </div>

          {/* Quick Filters Group */}
          <div className="flex items-center gap-1 bg-surface-container-lowest p-0.5 rounded border border-surface-container-high shadow-2xs">
            {/* Priority Filter */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowPriorityMenu(!showPriorityMenu);
                  setShowAssigneeMenu(false);
                }}
                className="h-7 px-2.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-label-sm text-label-sm rounded flex items-center gap-1 transition-colors"
              >
                <span className="text-secondary">Priority:</span>
                <span className="font-medium text-primary">{priorityFilter}</span>
                <span className="material-symbols-outlined text-[14px]">arrow_drop_down</span>
              </button>

              {showPriorityMenu && (
                <div className="absolute left-0 mt-1 w-32 bg-surface-container-lowest rounded shadow-lg border border-surface-container-high z-30 py-1 font-label-sm text-label-sm">
                  {['All', 'URGENT', 'HIGH', 'MED', 'LOW'].map(p => (
                    <button
                      key={p}
                      onClick={() => {
                        setPriorityFilter(p);
                        setShowPriorityMenu(false);
                      }}
                      className="w-full text-left px-3 py-1 hover:bg-surface-container text-on-surface"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="w-[1px] h-4 bg-surface-container-highest"></span>

            {/* Assignee Filter */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowAssigneeMenu(!showAssigneeMenu);
                  setShowPriorityMenu(false);
                }}
                className="h-7 px-2.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-label-sm text-label-sm rounded flex items-center gap-1 transition-colors"
              >
                <span className="text-secondary">Assignee:</span>
                <span className="font-medium text-primary truncate max-w-[100px]">{assigneeFilter}</span>
                <span className="material-symbols-outlined text-[14px]">arrow_drop_down</span>
              </button>

              {showAssigneeMenu && (
                <div className="absolute left-0 mt-1 w-44 bg-surface-container-lowest rounded shadow-lg border border-surface-container-high z-30 py-1 font-label-sm text-label-sm">
                  {['All Members', 'Shreya L.', 'Rahul V.', 'Alex C.', 'Maya T.', 'Priya K.', 'Elena R.', 'Unassigned'].map(a => (
                    <button
                      key={a}
                      onClick={() => {
                        setAssigneeFilter(a);
                        setShowAssigneeMenu(false);
                      }}
                      className="w-full text-left px-3 py-1 hover:bg-surface-container text-on-surface"
                    >
                      {a}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="w-[1px] h-4 bg-surface-container-highest"></span>

            {/* My Assigned Toggle */}
            <button
              onClick={() => setMyAssignedOnly(!myAssignedOnly)}
              className={`h-7 px-2.5 rounded font-label-sm text-label-sm flex items-center gap-1.5 transition-colors ${
                myAssignedOnly
                  ? 'bg-surface-container-high text-primary font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full transition-colors ${
                  myAssignedOnly ? 'bg-primary' : 'bg-outline-variant'
                }`}
              ></span>
              <span>My Assigned</span>
            </button>
          </div>
        </div>

        {/* Scope Indicator */}
        <div className="flex items-center gap-2 self-start xl:self-auto font-mono-data text-label-sm px-2.5 py-1 bg-surface-container rounded border border-surface-container-high text-on-surface">
          {selectedTeam?.name || 'Customer Operations'} — 5 workflow stages •{' '}
          <span className="font-semibold">{filteredIssues.length}</span> active issues
        </div>
      </div>

      {/* 5-Column Kanban Grid (Matches Image 3) */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5 min-w-[1100px] items-start">
          {COLUMNS.map(col => {
            const colIssues = getColumnIssues(col.key);
            return (
              <div
                key={col.key}
                className="flex flex-col bg-surface-container-low rounded border border-surface-container-high p-2.5 shadow-2xs min-h-[580px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 px-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${col.dotClass}`}></span>
                    <span className="font-label-md text-label-md tracking-wider uppercase text-on-surface font-semibold">
                      {col.title}
                    </span>
                  </div>
                  <span className="font-mono-data text-label-sm px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface font-semibold">
                    {colIssues.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="flex flex-col gap-2 flex-1">
                  {colIssues.map(issue => (
                    <div
                      key={issue.id}
                      onClick={() => onSelectIssue(issue.id)}
                      className="cursor-pointer bg-surface-container-lowest p-3 rounded border border-surface-container-high shadow-2xs hover:shadow-md hover:border-outline-variant transition-all flex flex-col gap-2 group relative"
                    >
                      {/* Top line: Key + Priority */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono-data text-label-sm text-secondary font-medium">
                          {issue.id}
                        </span>
                        <span
                          className={`font-mono-data text-[11px] px-1.5 py-0.2 rounded font-bold ${
                            issue.priority === 'URGENT' || issue.priority === 'HIGH'
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface-container text-on-surface font-medium'
                          }`}
                        >
                          {issue.priority}
                        </span>
                      </div>

                      {/* Title */}
                      <p className="font-body-sm text-body-sm text-on-surface font-medium leading-snug line-clamp-2">
                        {issue.title}
                      </p>

                      {/* Special Indicators matching Stitch Image 3 */}
                      {issue.requires_approval === 1 && issue.approval_status === 'PENDING' && (
                        <div className="flex items-center gap-1 text-primary pt-0.5">
                          <span className="material-symbols-outlined text-[14px]">verified_user</span>
                          <span className="font-mono-data text-[11px] font-semibold">
                            {issue.priority === 'URGENT' ? 'Needs Approval' : 'Approval Required'}
                          </span>
                        </div>
                      )}

                      {issue.status === 'Blocked' && (
                        <div className="px-2 py-1 rounded bg-surface-container flex items-start gap-1 font-mono-data text-[11px] text-on-surface font-medium">
                          <span className="material-symbols-outlined text-[13px] text-primary mt-0.5">block</span>
                          <span className="truncate">
                            Blocked: {issue.blocked_reason || 'Awaiting dependency'}
                          </span>
                        </div>
                      )}

                      {issue.status === 'Done' && (
                        <div className="flex items-center gap-1 pt-0.5 text-secondary">
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          <span className="font-mono-data text-[11px]">Completed Today</span>
                        </div>
                      )}

                      {issue.due_label && issue.status !== 'Blocked' && issue.status !== 'Done' && (
                        <div className="flex items-center gap-1 pt-0.5 text-secondary font-mono-data text-[11px]">
                          <span className="material-symbols-outlined text-[13px]">schedule</span>
                          <span>{issue.due_label}</span>
                        </div>
                      )}

                      {/* Card Footer: Assignee & Comment Count */}
                      <div className="pt-1 flex items-center justify-between text-secondary border-t border-surface-container-high/60">
                        <div className="flex items-center gap-1.5 font-label-sm text-label-sm">
                          <div className="w-5 h-5 rounded-full bg-primary text-on-primary font-mono-data text-[10px] flex items-center justify-center font-bold">
                            {issue.assignee_initials || '--'}
                          </div>
                          <span className="truncate max-w-[100px]">
                            {issue.assignee_name || 'Unassigned'}
                          </span>
                        </div>

                        <div className="flex items-center gap-0.5 font-mono-data text-[11px]">
                          <span className="material-symbols-outlined text-[14px]">chat_bubble_outline</span>
                          <span>{issue.comment_count ?? 2}</span>
                        </div>
                      </div>

                      {/* Quick Move Overlay in hover */}
                      <div className="hidden group-hover:flex items-center gap-1 absolute top-2 right-2 bg-surface-container-lowest/95 backdrop-blur-xs p-1 rounded shadow-md border border-surface-container-high z-10" onClick={e => e.stopPropagation()}>
                        {col.key !== 'Open' && (
                          <button
                            title="Move to Open"
                            onClick={e => handleQuickMove(issue, 'Open', e)}
                            className="w-5 h-5 rounded bg-surface-container hover:bg-primary hover:text-white flex items-center justify-center text-[10px]"
                          >
                            O
                          </button>
                        )}
                        {col.key !== 'In Progress' && (
                          <button
                            title="Move to In Progress"
                            onClick={e => handleQuickMove(issue, 'In Progress', e)}
                            className="w-5 h-5 rounded bg-surface-container hover:bg-primary hover:text-white flex items-center justify-center text-[10px]"
                          >
                            P
                          </button>
                        )}
                        {col.key !== 'In Review' && (
                          <button
                            title="Move to In Review"
                            onClick={e => handleQuickMove(issue, 'In Review', e)}
                            className="w-5 h-5 rounded bg-surface-container hover:bg-primary hover:text-white flex items-center justify-center text-[10px]"
                          >
                            R
                          </button>
                        )}
                        {col.key !== 'Blocked' && (
                          <button
                            title="Move to Blocked"
                            onClick={e => handleQuickMove(issue, 'Blocked', e)}
                            className="w-5 h-5 rounded bg-surface-container hover:bg-primary hover:text-white flex items-center justify-center text-[10px]"
                          >
                            B
                          </button>
                        )}
                        {col.key !== 'Done' && (
                          <button
                            title="Move to Done (validates approval gate)"
                            onClick={e => handleQuickMove(issue, 'Done', e)}
                            className="w-5 h-5 rounded bg-surface-container hover:bg-primary hover:text-white flex items-center justify-center text-[10px]"
                          >
                            D
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Column Add Issue Button */}
                <button
                  onClick={() => onOpenCreateIssue(selectedTeam?.id)}
                  className="mt-2 w-full py-1.5 px-2 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container text-left font-label-sm text-label-sm flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  <span>Add Issue</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
