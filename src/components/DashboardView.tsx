import React, { useState, useEffect } from 'react';
import { User, DashboardData, ViewTab } from '../types/index.ts';
import { api } from '../utils/api.ts';

interface DashboardViewProps {
  currentUser: User | null;
  onSelectTab: (tab: ViewTab) => void;
  onSelectIssue: (issueId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  onSelectTab,
  onSelectIssue
}) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'my' | 'team'>('my');
  const [loading, setLoading] = useState(true);

  const fetchDashboard = () => {
    setLoading(true);
    api.getDashboard()
      .then(res => {
        setData(res);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDashboard();
  }, [currentUser]);

  const totalTeamIssues = data
    ? (data.stageCounts.open + data.stageCounts.in_progress + data.stageCounts.in_review + data.stageCounts.blocked)
    : 14;

  return (
    <div className="w-full flex flex-col gap-6 pb-12 animate-in fade-in duration-150">
      {/* Page Title & Subtitle */}
      <div className="flex flex-col gap-1">
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
          Dashboard
        </h1>
        <p className="font-body-md text-body-md text-secondary">
          Operational overview for <span className="font-medium text-on-surface">{currentUser?.name || 'Shreya Lavani'}</span> ({currentUser?.title || 'Operation Head'}).
        </p>

        {/* Sub-tabs */}
        <div className="flex items-center gap-6 pt-3 border-b border-surface-container-high">
          <button
            onClick={() => setActiveSubTab('my')}
            className={`pb-2 font-label-md text-label-md flex items-center gap-1.5 transition-colors relative ${
              activeSubTab === 'my'
                ? 'text-primary font-semibold'
                : 'text-secondary hover:text-on-surface'
            }`}
          >
            <span>My Dashboard</span>
            <span className="font-mono-data text-[11px] px-1.5 py-0.2 rounded bg-surface-container text-on-surface">
              {data?.metrics.assignedToMe || 4}
            </span>
            {activeSubTab === 'my' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('team')}
            className={`pb-2 font-label-md text-label-md flex items-center gap-1.5 transition-colors relative ${
              activeSubTab === 'team'
                ? 'text-primary font-semibold'
                : 'text-secondary hover:text-on-surface'
            }`}
          >
            <span>Team Dashboard</span>
            <span className="font-mono-data text-[11px] px-1.5 py-0.2 rounded bg-surface-container text-on-surface">
              {totalTeamIssues}
            </span>
            {activeSubTab === 'team' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></span>
            )}
          </button>
        </div>
      </div>

      {/* 3 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Assigned to Me */}
        <div
          onClick={() => onSelectTab('my-work')}
          className="cursor-pointer bg-surface-container-lowest p-5 rounded border border-surface-container-high shadow-2xs hover:border-outline-variant transition-all flex flex-col justify-between"
        >
          <span className="font-label-md text-label-md text-secondary">Assigned to Me</span>
          <div className="text-display font-display text-primary pt-2">
            {loading ? '-' : data?.metrics.assignedToMe || 0}
          </div>
        </div>

        {/* Card 2: Needs Attention */}
        <div
          onClick={() => onSelectTab('team-board')}
          className="cursor-pointer bg-surface-container-lowest p-5 rounded border border-surface-container-high shadow-2xs hover:border-outline-variant transition-all flex flex-col justify-between"
        >
          <span className="font-label-md text-label-md text-secondary">Needs Attention</span>
          <div className="text-display font-display text-primary pt-2">
            {loading ? '-' : data?.metrics.needsAttention || 0}
          </div>
        </div>

        {/* Card 3: Pending My Approval */}
        <div
          onClick={() => onSelectTab('approvals')}
          className="cursor-pointer bg-surface-container-lowest p-5 rounded border border-surface-container-high shadow-2xs hover:border-outline-variant transition-all flex flex-col justify-between"
        >
          <span className="font-label-md text-label-md text-secondary">Pending My Approval</span>
          <div className="text-display font-display text-primary pt-2">
            {loading ? '-' : data?.metrics.pendingMyApproval || 0}
          </div>
        </div>
      </div>

      {/* 2-Column Section (Matches Image 7) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: My Work */}
        <div className="bg-surface-container-lowest rounded border border-surface-container-high shadow-2xs p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-surface-container-high">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">My Work</h3>
            <button
              onClick={() => onSelectTab('my-work')}
              className="text-label-md font-label-md text-secondary hover:text-primary flex items-center gap-1 transition-colors"
            >
              <span>View All</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>

          <div className="flex flex-col divide-y divide-surface-container-high">
            {data?.myWork && data.myWork.length > 0 ? (
              data.myWork.map(item => (
                <div
                  key={item.id}
                  onClick={() => onSelectIssue(item.id)}
                  className="py-3 px-1 hover:bg-surface-container-low transition-colors rounded cursor-pointer flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="font-mono-data text-label-sm text-secondary flex-shrink-0">
                      {item.id}
                    </span>
                    <span className="font-body-md text-body-md text-on-surface truncate font-medium">
                      {item.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono-data text-[11px] px-2 py-0.5 rounded bg-surface-container text-secondary">
                      {item.due_label || 'Scheduled'}
                    </span>
                    <span className="font-mono-data text-[11px] px-2 py-0.5 rounded bg-surface-container text-on-surface font-semibold">
                      {item.priority}
                    </span>
                    <span className="font-mono-data text-[11px] px-2.5 py-0.5 rounded bg-primary text-on-primary font-medium">
                      {item.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-secondary font-mono-data text-label-sm">
                No active assignments in your queue.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Needs Attention */}
        <div className="bg-surface-container-lowest rounded border border-surface-container-high shadow-2xs p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-surface-container-high">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Needs Attention</h3>
            <button
              onClick={() => onSelectTab('approvals')}
              className="text-label-md font-label-md text-secondary hover:text-primary flex items-center gap-1 transition-colors"
            >
              <span>View Approvals</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>

          <div className="flex flex-col divide-y divide-surface-container-high">
            {data?.needsAttention && data.needsAttention.length > 0 ? (
              data.needsAttention.map(item => (
                <div
                  key={item.id}
                  onClick={() => onSelectIssue(item.id)}
                  className="py-3 px-1 hover:bg-surface-container-low transition-colors rounded cursor-pointer flex items-center justify-between gap-3"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-data text-label-sm text-secondary flex-shrink-0">
                        {item.id}
                      </span>
                      <span className="font-body-md text-body-md text-on-surface truncate font-semibold">
                        {item.title}
                      </span>
                    </div>
                    <span className="font-body-sm text-body-sm text-secondary pt-0.5">
                      Reason: {item.reason}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`font-mono-data text-[11px] px-2.5 py-0.5 rounded ${
                        item.status === 'Blocked'
                          ? 'bg-surface-container text-on-surface border border-outline'
                          : 'bg-primary text-on-primary'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-secondary font-mono-data text-label-sm">
                Zero operational blockers or pending gates.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
