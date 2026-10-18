import React, { useState, useEffect } from 'react';
import { User, Project, Team, Issue, ViewTab } from './types/index.ts';
import { api } from './utils/api.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { MyWorkView } from './components/MyWorkView.tsx';
import { TeamBoardView } from './components/TeamBoardView.tsx';
import { ProjectWorkspaceView } from './components/ProjectWorkspaceView.tsx';
import { ApprovalsView } from './components/ApprovalsView.tsx';
import { ProjectsView } from './components/ProjectsView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { IssueDetailModal } from './components/IssueDetailModal.tsx';
import { CreateIssueModal } from './components/CreateIssueModal.tsx';
import { UserSwitcherModal } from './components/UserSwitcherModal.tsx';
import { LoginPage } from './components/LoginPage.tsx';

export default function App() {
  const [currentTab, setCurrentTab] = useState<ViewTab>('team-board');
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Telemetry counts
  const [myWorkCount, setMyWorkCount] = useState<number>(4);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(2);

  // Modals state
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [presetProjectIdForCreate, setPresetProjectIdForCreate] = useState<string | null>(null);
  const [isUserSwitcherOpen, setIsUserSwitcherOpen] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Initial data loading
  const loadInitialData = async () => {
    try {
      const meRes = await api.getMe();
      setCurrentUser(meRes.user);

      const [projList, teamList, userList, dashboardData] = await Promise.all([
        api.getProjects(),
        api.getTeams(),
        api.getUsers(),
        api.getDashboard()
      ]);

      setProjects(projList);
      setTeams(teamList);
      setUsers(userList);

      if (projList.length > 0) {
        setActiveProject(prev => prev || projList[0]);
      }

      setMyWorkCount(dashboardData.metrics.assignedToMe);
      setPendingApprovalsCount(dashboardData.metrics.pendingMyApproval);
    } catch (err) {
      console.warn('Initial session check not authenticated or expired:', err);
      setCurrentUser(null);
    } finally {
      setIsAuthChecking(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    loadInitialData();
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.warn('Logout API error:', err);
    } finally {
      setCurrentUser(null);
      setProjects([]);
      setTeams([]);
      setUsers([]);
      setCurrentTab('team-board');
    }
  };

  const handleUserChanged = (newUser: User) => {
    setCurrentUser(newUser);
    loadInitialData();
  };

  const handleOpenCreateIssue = (presetProjId?: string) => {
    setPresetProjectIdForCreate(presetProjId || (currentTab === 'workspace' && activeProject ? activeProject.id : null));
    setIsCreateIssueOpen(true);
  };

  const handleIssueCreated = (newIssue: Issue) => {
    setSelectedIssueId(newIssue.id);
    loadInitialData();
  };

  const handleIssueUpdated = () => {
    loadInitialData();
  };

  const handleSelectProject = (project: Project) => {
    setActiveProject(project);
    setCurrentTab('workspace');
  };

  // 1. Initial Authentication Checking Screen
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-surface-container-low flex flex-col items-center justify-center font-body-md text-on-surface select-none">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded bg-primary flex items-center justify-center shadow-sm">
            <span className="material-symbols-outlined text-on-primary text-[22px] animate-pulse">terminal</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="font-headline-sm text-headline-sm text-primary font-bold">Nexus Ops</span>
            <span className="font-mono-data text-label-sm text-secondary">Verifying secure credentials...</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated: Render dedicated Login Page
  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // 3. Authenticated: Render Main Application Layout
  return (
    <div className="min-h-screen bg-surface-container-lowest flex font-body-md text-body-md text-on-surface antialiased">
      {/* Fixed Left Navigation Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={tab => {
          setCurrentTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        currentUser={currentUser}
        onOpenUserSwitcher={() => setIsUserSwitcherOpen(true)}
        onLogout={handleLogout}
        myWorkCount={myWorkCount}
        pendingApprovalsCount={pendingApprovalsCount}
      />

      {/* Main View Area offset by sidebar */}
      <div className="pl-64 flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <Header
          currentTab={currentTab}
          activeProject={activeProject}
          currentUser={currentUser}
          onOpenCreateIssue={() => handleOpenCreateIssue()}
          onOpenUserSwitcher={() => setIsUserSwitcherOpen(true)}
          onSelectIssue={id => setSelectedIssueId(id)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          unreadCount={pendingApprovalsCount}
        />

        {/* View Content Viewport */}
        <main className="w-full pt-14 px-6 md:px-8 py-6 max-w-7xl mx-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              currentUser={currentUser}
              onSelectTab={tab => setCurrentTab(tab)}
              onSelectIssue={id => setSelectedIssueId(id)}
            />
          )}

          {currentTab === 'my-work' && (
            <MyWorkView
              currentUser={currentUser}
              onSelectIssue={id => setSelectedIssueId(id)}
              onOpenCreateIssue={() => handleOpenCreateIssue()}
            />
          )}

          {currentTab === 'team-board' && (
            <TeamBoardView
              currentUser={currentUser}
              teams={teams}
              onSelectIssue={id => setSelectedIssueId(id)}
              onOpenCreateIssue={() => handleOpenCreateIssue()}
            />
          )}

          {currentTab === 'projects' && (
            <ProjectsView
              projects={projects}
              currentUser={currentUser}
              onSelectProject={handleSelectProject}
              onRefreshProjects={loadInitialData}
            />
          )}

          {currentTab === 'workspace' && activeProject && (
            <ProjectWorkspaceView
              project={activeProject}
              currentUser={currentUser}
              onSelectIssue={id => setSelectedIssueId(id)}
              onOpenCreateIssue={pId => handleOpenCreateIssue(pId)}
              availableUsers={users}
            />
          )}

          {currentTab === 'approvals' && (
            currentUser.is_approver === 1 ? (
              <ApprovalsView
                currentUser={currentUser}
                onSelectIssue={id => setSelectedIssueId(id)}
              />
            ) : (
              <div className="p-8 bg-surface-container-lowest rounded border border-surface-container-high shadow-2xs flex flex-col items-center text-center gap-3 max-w-lg mx-auto mt-12 animate-in fade-in">
                <span className="material-symbols-outlined text-[36px] text-error">gavel</span>
                <h2 className="font-headline-md text-headline-md text-on-surface">Approvals Authorization Required</h2>
                <p className="font-body-sm text-body-sm text-secondary">
                  The Approvals Inbox is restricted to designated operational approvers. Your account (<strong>{currentUser.name}</strong>, {currentUser.title}) does not have active approver authority.
                </p>
                <button
                  onClick={() => setIsUserSwitcherOpen(true)}
                  className="mt-2 px-4 h-8 rounded bg-primary text-on-primary font-label-md text-label-md flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[16px]">sync_alt</span>
                  <span>Switch to Operation Head / Lead</span>
                </button>
              </div>
            )
          )}

          {currentTab === 'settings' && (
            <SettingsView
              currentUser={currentUser}
              users={users}
              teams={teams}
              onRefreshData={loadInitialData}
            />
          )}
        </main>
      </div>

      {/* Global Modals */}
      <IssueDetailModal
        issueId={selectedIssueId}
        onClose={() => setSelectedIssueId(null)}
        currentUser={currentUser}
        availableUsers={users}
        onIssueUpdated={handleIssueUpdated}
      />

      <CreateIssueModal
        isOpen={isCreateIssueOpen}
        onClose={() => setIsCreateIssueOpen(false)}
        onIssueCreated={handleIssueCreated}
        presetProjectId={presetProjectIdForCreate}
        authorizedProjects={projects}
        availableUsers={users}
      />

      <UserSwitcherModal
        isOpen={isUserSwitcherOpen}
        onClose={() => setIsUserSwitcherOpen(false)}
        onUserChanged={handleUserChanged}
      />
    </div>
  );
}
