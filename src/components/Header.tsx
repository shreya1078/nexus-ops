import React, { useState, useEffect, useRef } from 'react';
import { User, Project, ViewTab } from '../types/index.ts';

interface HeaderProps {
  currentTab: ViewTab;
  activeProject: Project | null;
  currentUser: User | null;
  onOpenCreateIssue: () => void;
  onOpenUserSwitcher: () => void;
  onSelectIssue: (issueId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  unreadCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  activeProject,
  currentUser,
  onOpenCreateIssue,
  onOpenUserSwitcher,
  searchQuery,
  onSearchChange,
  unreadCount = 2
}) => {
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getBreadcrumb = () => {
    if (activeProject && currentTab === 'workspace') {
      return (
        <div className="flex items-center gap-1.5 text-on-surface-variant font-label-md text-label-md">
          <span className="text-secondary">Projects</span>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface font-headline-sm text-headline-sm truncate max-w-[240px]">
            {activeProject.name}
          </span>
          <span className="font-mono-data text-[10px] bg-surface-container px-1 py-0.2 rounded text-secondary ml-1">
            {activeProject.key}
          </span>
        </div>
      );
    }

    const tabLabels: Record<ViewTab, string> = {
      'dashboard': 'Dashboard',
      'projects': 'Projects',
      'my-work': 'My Work',
      'team-board': 'Workspace',
      'approvals': 'Approvals Inbox',
      'settings': 'Administration & Settings',
      'workspace': 'Project Workspace'
    };

    return (
      <div className="flex items-center gap-1.5 text-on-surface-variant font-label-md text-label-md">
        <span className="text-secondary">Nexus Ops</span>
        <span className="text-outline-variant">/</span>
        <span className="text-on-surface font-headline-sm text-headline-sm">
          {tabLabels[currentTab] || 'Workspace'}
        </span>
      </div>
    );
  };

  return (
    <>
      <header className="fixed top-0 left-64 right-0 h-14 bg-surface-container-lowest/90 backdrop-blur-md z-20 shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-surface-container-high">
        <div className="h-14 w-full px-6 flex items-center justify-between gap-4">
          {/* Breadcrumbs */}
          <div className="flex items-center min-w-0">
            {getBreadcrumb()}
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-3 flex-1 max-w-md justify-center">
            <div className="w-full flex items-center gap-2 px-3 py-1 rounded bg-surface-container-low text-on-surface-variant border border-surface-container-high focus-within:border-primary focus-within:bg-surface-container-lowest transition-colors shadow-2xs">
              <span className="material-symbols-outlined text-[16px] text-secondary">search</span>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                className="w-full bg-transparent font-body-sm text-body-sm text-on-surface placeholder-secondary focus:outline-none"
                placeholder="Search ops, incidents, telemetry... (⌘K)"
                type="text"
              />
              <kbd className="font-mono-data text-[10px] px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="w-8 h-8 flex items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors relative"
                type="button"
                title="Notifications"
              >
                <span className="material-symbols-outlined text-[18px]">notifications</span>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary ring-2 ring-surface-container-lowest"></span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-surface-container-lowest rounded shadow-xl border border-surface-container-high p-3 z-50 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-surface-container-high">
                    <span className="font-headline-sm text-headline-sm text-on-surface">System Alerts</span>
                    <span className="font-mono-data text-[11px] px-1.5 py-0.2 rounded bg-surface-container text-secondary">
                      {unreadCount} unread
                    </span>
                  </div>
                  <div className="py-2 flex flex-col gap-2">
                    <div className="p-2 rounded bg-surface-container-low flex items-start gap-2 text-label-sm">
                      <span className="material-symbols-outlined text-[16px] text-primary mt-0.5">verified_user</span>
                      <div className="flex flex-col">
                        <span className="font-semibold text-on-surface">Approval Required</span>
                        <span className="text-secondary">NEX-101 pending Operation Head review.</span>
                      </div>
                    </div>
                    <div className="p-2 rounded bg-surface-container-low flex items-start gap-2 text-label-sm">
                      <span className="material-symbols-outlined text-[16px] text-primary mt-0.5">block</span>
                      <div className="flex flex-col">
                        <span className="font-semibold text-on-surface">External Blocker</span>
                        <span className="text-secondary">NEX-106 awaiting third-party vendor hotfix.</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="w-full mt-1 py-1 text-center font-mono-data text-[11px] text-secondary hover:text-on-surface"
                  >
                    Close alerts
                  </button>
                </div>
              )}
            </div>

            {/* Help / Docs */}
            <button
              onClick={() => setShowHelpModal(true)}
              className="w-8 h-8 flex items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
              type="button"
              title="Operational Guide & Architecture"
            >
              <span className="material-symbols-outlined text-[18px]">help</span>
            </button>

            {/* Primary Action: Create Issue */}
            <button
              onClick={onOpenCreateIssue}
              className="flex items-center gap-1.5 px-3.5 h-8 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors shadow-2xs whitespace-nowrap"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Create Issue</span>
            </button>

            {/* User profile button */}
            <button
              onClick={onOpenUserSwitcher}
              title={`Logged in as ${currentUser?.name} (${currentUser?.title}). Click to switch persona.`}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-primary font-mono-data text-xs font-bold ring-1 ring-surface-container-high hover:ring-primary transition-all cursor-pointer"
              style={{ backgroundColor: currentUser?.avatar_bg || '#000000' }}
            >
              {currentUser?.initials || 'SL'}
            </button>
          </div>
        </div>
      </header>

      {/* Help & Architecture Reference Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl bg-surface-container-lowest rounded shadow-2xl border border-surface-container-high overflow-hidden animate-in fade-in duration-150">
            <div className="px-6 py-4 border-b border-surface-container-high flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">info</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Nexus Ops — Architecture &amp; Controls</h3>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="w-7 h-7 rounded flex items-center justify-center text-secondary hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto flex flex-col gap-4 font-body-sm text-body-sm text-on-surface leading-relaxed">
              <div>
                <h4 className="font-semibold text-primary font-label-md text-label-md uppercase tracking-wider mb-1">
                  1. Role-Based Permissions &amp; Identity Testing
                </h4>
                <p className="text-secondary">
                  Nexus Ops enforces backend authorization rules for Team Members, Team Leads, Operation Heads, Administrators, and Designated Approvers.
                  Click the user card in the bottom-left sidebar or the top-right avatar to switch roles instantly and test permission enforcement.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-primary font-label-md text-label-md uppercase tracking-wider mb-1">
                  2. Concurrency &amp; Stale-Update Protection
                </h4>
                <p className="text-secondary">
                  Every issue tracks an incremental <code>version</code> number. If two operators attempt concurrent modifications, the server rejects outdated updates with HTTP 409 Conflict, preventing silent data overwrite.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-primary font-label-md text-label-md uppercase tracking-wider mb-1">
                  3. Operational Approval Gate Bypass Defense
                </h4>
                <p className="text-secondary">
                  Issues tagged with <code>requires_approval</code> cannot transition to "Done" unless an authorized designated approver has formally signed off. Requesters are prohibited from self-approving their own requests.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-primary font-label-md text-label-md uppercase tracking-wider mb-1">
                  4. Duplicate Request Protection
                </h4>
                <p className="text-secondary">
                  All issue creation and approval decisions support <code>Idempotency-Key</code> headers, preventing double-clicks or network retries from generating duplicate issues or repeated ledger entries.
                </p>
              </div>

              <div className="p-3 rounded bg-surface-container-low border border-surface-container font-mono-data text-[11px] text-secondary">
                <span>Keyboard Shortcuts: </span>
                <span className="font-semibold text-on-surface">⌘K</span> Quick Search &nbsp;•&nbsp;
                <span className="font-semibold text-on-surface">/</span> Focus filter &nbsp;•&nbsp;
                <span className="font-semibold text-on-surface">Esc</span> Close modals
              </div>
            </div>
            <div className="px-6 py-3 bg-surface-container-low border-t border-surface-container-high flex justify-end">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-1.5 rounded bg-primary text-on-primary font-label-md text-label-md"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
