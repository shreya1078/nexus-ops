import React, { useState } from 'react';
import { Project, User } from '../types/index.ts';
import { api } from '../utils/api.ts';

interface ProjectsViewProps {
  projects: Project[];
  currentUser: User | null;
  onSelectProject: (project: Project) => void;
  onRefreshProjects: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  currentUser,
  onSelectProject,
  onRefreshProjects
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canCreate = currentUser?.system_role === 'admin' || currentUser?.system_role === 'operation_head';

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !key.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      await api.createProject({
        name: name.trim(),
        key: key.trim().toUpperCase(),
        description: description.trim()
      });
      setName('');
      setKey('');
      setDescription('');
      setShowCreateModal(false);
      onRefreshProjects();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-5 pb-12 animate-in fade-in duration-150">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Projects
          </h1>
          <p className="font-body-md text-body-md text-secondary">
            Authorized bodies of operational work and incident escalation pipelines.
          </p>
        </div>

        {canCreate && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="h-8 px-3.5 rounded bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md flex items-center gap-1.5 transition-colors shadow-2xs self-start sm:self-auto"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>New Project</span>
          </button>
        )}
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(p => (
          <div
            key={p.id}
            onClick={() => onSelectProject(p)}
            className="cursor-pointer bg-surface-container-lowest p-5 rounded border border-surface-container-high shadow-2xs hover:shadow-md hover:border-outline-variant transition-all flex flex-col justify-between gap-4 group"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-mono-data text-label-sm px-2 py-0.5 rounded bg-surface-container text-primary font-bold">
                  {p.key}
                </span>
                <span className="font-mono-data text-[11px] text-secondary flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  Active
                </span>
              </div>

              <h3 className="font-headline-sm text-headline-sm text-on-surface group-hover:text-primary transition-colors">
                {p.name}
              </h3>

              <p className="font-body-sm text-body-sm text-secondary line-clamp-2">
                {p.description || 'Dedicated operational workspace for cross-functional triage.'}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-surface-container-high text-label-sm font-label-sm text-secondary">
              <div className="flex items-center justify-between">
                <span>Team: <strong>{p.team_name || 'Customer Operations'}</strong></span>
                <span>Lead: <strong>{p.lead_name || 'Shreya L.'}</strong></span>
              </div>

              <div className="flex items-center justify-between pt-1 font-mono-data text-[11px] text-on-surface">
                <span>{p.stats?.active_issues ?? 12} active issues</span>
                {p.stats?.blocked_issues ? (
                  <span className="text-secondary font-semibold">
                    {p.stats.blocked_issues} blockers
                  </span>
                ) : (
                  <span>0 blockers</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-surface-container-lowest rounded shadow-2xl border border-surface-container-high p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-surface-container-high pb-2">
              <h4 className="font-headline-sm text-headline-sm text-on-surface">Create New Project</h4>
              <button onClick={() => setShowCreateModal(false)} className="text-secondary hover:text-on-surface">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded bg-error-container text-on-error-container text-body-sm">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateProject} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-label-md text-label-md text-on-surface font-semibold">Project Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Identity &amp; Auth Gateway"
                  required
                  className="w-full h-8 px-3 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-body-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-md text-label-md text-on-surface font-semibold">Project Key *</label>
                <input
                  type="text"
                  value={key}
                  onChange={e => setKey(e.target.value.toUpperCase())}
                  placeholder="e.g. AUTH"
                  maxLength={6}
                  required
                  className="w-full h-8 px-3 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-mono-data text-body-sm focus:outline-none focus:border-primary uppercase"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-md text-label-md text-on-surface font-semibold">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Scope of work and responsibilities..."
                  rows={2}
                  className="w-full p-2.5 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-body-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-container-high">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded text-secondary hover:text-on-surface font-label-md text-label-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
