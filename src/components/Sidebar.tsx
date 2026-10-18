import React from 'react';
import { User, ViewTab } from '../types/index.ts';

interface SidebarProps {
  currentTab: ViewTab;
  onSelectTab: (tab: ViewTab) => void;
  currentUser: User | null;
  onOpenUserSwitcher: () => void;
  onLogout: () => void;
  myWorkCount: number;
  pendingApprovalsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  onOpenUserSwitcher,
  onLogout,
  myWorkCount,
  pendingApprovalsCount
}) => {
  const isApprover = currentUser?.is_approver === 1;

  const baseNavItems = [
    {
      tab: 'dashboard' as ViewTab,
      label: 'Dashboard',
      icon: 'dashboard',
      count: null
    },
    {
      tab: 'projects' as ViewTab,
      label: 'Projects',
      icon: 'folder',
      count: null
    },
    {
      tab: 'my-work' as ViewTab,
      label: 'My Work',
      icon: 'check_box',
      count: myWorkCount > 0 ? myWorkCount : null
    },
    {
      tab: 'team-board' as ViewTab,
      label: 'Team Board',
      icon: 'view_column',
      count: null
    }
  ];

  // Show the Approvals Inbox only to authenticated users who have approval permissions!
  const navItems = isApprover
    ? [
        ...baseNavItems,
        {
          tab: 'approvals' as ViewTab,
          label: 'Approvals',
          icon: 'verified_user',
          count: pendingApprovalsCount > 0 ? pendingApprovalsCount : null
        }
      ]
    : baseNavItems;

  const getRoleBadgeLabel = (role?: string) => {
    switch (role) {
      case 'admin':
        return 'Admin / Security';
      case 'operation_head':
        return 'Admin / Ops Head';
      case 'team_lead':
        return 'Team Lead';
      default:
        return 'Team Member';
    }
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface-container-lowest flex flex-col justify-between z-30 shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-r border-surface-container-high select-none">
      <div className="flex flex-col">
        {/* Brand header */}
        <div className="h-14 px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => onSelectTab('dashboard')}>
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary text-[16px]">terminal</span>
            </div>
            <span className="font-headline-sm text-headline-sm text-primary tracking-tight">Nexus Ops</span>
          </div>
          <span className="font-mono-data text-label-sm text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded">
            v2.4.0
          </span>
        </div>

        {/* Primary Navigation */}
        <nav className="px-2 py-2 flex flex-col gap-1">
          {navItems.map(item => {
            const isActive = currentTab === item.tab || (item.tab === 'projects' && currentTab === 'workspace');
            return (
              <button
                key={item.tab}
                onClick={() => onSelectTab(item.tab)}
                className={`flex items-center justify-between px-3 py-1.5 rounded transition-colors text-left ${
                  isActive
                    ? 'bg-primary text-on-primary font-label-md'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface font-label-md'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                  <span className="text-label-md">{item.label}</span>
                </div>
                {item.count !== null && (
                  <span
                    className={`font-mono-data text-label-sm px-1.5 py-0.2 rounded ${
                      isActive
                        ? 'bg-surface-container-highest text-on-surface'
                        : 'bg-surface-container-high text-on-surface'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-3 my-2 h-[1px] bg-surface-container-high"></div>

        {/* Administration & Settings Link */}
        <div className="px-2 flex flex-col gap-1">
          <button
            onClick={() => onSelectTab('settings')}
            className={`flex items-center justify-between px-3 py-1.5 rounded transition-colors text-left ${
              currentTab === 'settings'
                ? 'bg-primary text-on-primary font-label-md'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface font-label-md'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">settings</span>
              <div className="flex flex-col text-left">
                <span className="text-label-md leading-tight">Administration &amp; Settings</span>
                <span className={`text-[10px] leading-none ${currentTab === 'settings' ? 'text-on-primary/75' : 'text-secondary'}`}>
                  {currentUser?.system_role === 'admin' || currentUser?.system_role === 'operation_head' ? 'Configured' : 'Restricted'}
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* User profile card at bottom */}
      <div className="p-2 bg-surface-container-lowest border-t border-surface-container-high">
        <div
          role="button"
          tabIndex={0}
          onClick={onOpenUserSwitcher}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenUserSwitcher();
            }
          }}
          title="Click to switch persona and test role permissions"
          className="w-full p-2.5 rounded bg-surface-container-low hover:bg-surface-container flex flex-col gap-1 transition-colors text-left group cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded flex items-center justify-center text-on-primary font-label-md text-label-md font-bold"
              style={{ backgroundColor: currentUser?.avatar_bg || '#000000' }}
            >
              {currentUser?.initials || 'SL'}
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-label-md text-label-md text-on-surface truncate group-hover:text-primary">
                  {currentUser?.name || 'Shreya Lavani'}
                </span>
                <span className="material-symbols-outlined text-[14px] text-secondary opacity-0 group-hover:opacity-100 transition-opacity">
                  sync_alt
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-secondary truncate">
                {currentUser?.title || 'Operation Head'}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="font-mono-data text-[11px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
              {getRoleBadgeLabel(currentUser?.system_role)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLogout();
                }}
                title="Sign out of operations session"
                className="text-secondary hover:text-error transition-colors p-0.5 rounded hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">logout</span>
              </button>
              <span className="w-2 h-2 rounded-full bg-primary" title="Authenticated session active"></span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
