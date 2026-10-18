import React, { useState, useEffect } from 'react';
import { Project, User, Issue } from '../types/index.ts';
import { api } from '../utils/api.ts';

interface CreateIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIssueCreated: (newIssue: Issue) => void;
  presetProjectId?: string | null;
  authorizedProjects: Project[];
  availableUsers: User[];
}

export const CreateIssueModal: React.FC<CreateIssueModalProps> = ({
  isOpen,
  onClose,
  onIssueCreated,
  presetProjectId,
  authorizedProjects,
  availableUsers
}) => {
  const [projectId, setProjectId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MED' | 'HIGH' | 'URGENT'>('MED');
  const [status, setStatus] = useState<'Open' | 'In Progress' | 'In Review' | 'Blocked'>('Open');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [policyCode, setPolicyCode] = useState('OPS-STD-01');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize project selection based on preset or first authorized project
  useEffect(() => {
    if (presetProjectId) {
      setProjectId(presetProjectId);
    } else if (authorizedProjects.length > 0) {
      setProjectId(authorizedProjects[0].id);
    }
    setErrorMsg(null);
  }, [presetProjectId, authorizedProjects, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!projectId) {
      setErrorMsg('Please select a valid project');
      return;
    }

    if (!title.trim()) {
      setErrorMsg('Issue title is required');
      return;
    }

    setLoading(true);

    // Generate unique idempotency key to prevent double submissions on latency/retry
    const idempotencyKey = `idemp_issue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const created = await api.createIssue(
        {
          project_id: projectId,
          title: title.trim(),
          description: description.trim(),
          priority,
          status,
          assignee_id: assigneeId || null,
          due_date: dueDate || null,
          requires_approval: requiresApproval,
          approval_policy_code: requiresApproval ? policyCode : null
        },
        idempotencyKey
      );

      // Reset form
      setTitle('');
      setDescription('');
      setPriority('MED');
      setStatus('Open');
      setAssigneeId('');
      setDueDate('');
      setRequiresApproval(false);

      onIssueCreated(created);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to create issue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl bg-surface-container-lowest rounded shadow-2xl border border-surface-container-high overflow-hidden animate-in fade-in duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-container-high flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">add_circle</span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Create Operational Issue</h3>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-7 h-7 rounded flex items-center justify-center text-secondary hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 max-h-[75vh] overflow-y-auto flex flex-col gap-4">
          {errorMsg && (
            <div className="p-3 rounded bg-error-container text-on-error-container border border-error/20 font-body-sm text-body-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-error">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Project Selector (Context-Aware) */}
          <div className="flex flex-col gap-1">
            <label className="font-label-md text-label-md text-on-surface font-semibold">
              Project <span className="text-error">*</span>
            </label>
            {presetProjectId ? (
              <div className="p-2 rounded bg-surface-container-low border border-surface-container font-mono-data text-body-sm text-on-surface flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-secondary">folder</span>
                  <span>
                    {authorizedProjects.find(p => p.id === presetProjectId)?.name || presetProjectId}
                  </span>
                </div>
                <span className="font-mono-data text-[10px] px-1.5 py-0.2 rounded bg-surface-container text-secondary">
                  Locked to Current Workspace
                </span>
              </div>
            ) : (
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                required
                className="w-full h-9 px-3 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-body-sm text-body-sm focus:border-primary focus:outline-none"
              >
                {authorizedProjects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.key})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1">
            <label className="font-label-md text-label-md text-on-surface font-semibold">
              Title <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Investigate payment webhook TLS timeout"
              required
              className="w-full h-9 px-3 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-body-sm text-body-sm focus:border-primary focus:outline-none shadow-2xs"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="font-label-md text-label-md text-on-surface font-semibold">
              Description &amp; Deliverables
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe operational scope, technical impacts, and reproduction details..."
              rows={3}
              className="w-full p-3 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-body-sm text-body-sm focus:border-primary focus:outline-none resize-y"
            />
          </div>

          {/* Row: Priority & Starting Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-label-md text-label-md text-on-surface font-semibold">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as any)}
                className="w-full h-9 px-3 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-body-sm text-body-sm focus:border-primary focus:outline-none"
              >
                <option value="LOW">LOW</option>
                <option value="MED">MED (Medium)</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-md text-label-md text-on-surface font-semibold">Initial Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full h-9 px-3 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-body-sm text-body-sm focus:border-primary focus:outline-none"
              >
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="In Review">In Review</option>
                <option value="Blocked">Blocked</option>
              </select>
            </div>
          </div>

          {/* Row: Assignee & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-label-md text-label-md text-on-surface font-semibold">Assignee</label>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full h-9 px-3 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-body-sm text-body-sm focus:border-primary focus:outline-none"
              >
                <option value="">Unassigned</option>
                {availableUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.title})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-md text-label-md text-on-surface font-semibold">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full h-9 px-3 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-body-sm text-body-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Operational Approval Gate Checkbox */}
          <div className="p-3.5 rounded bg-surface-container-low border border-surface-container flex flex-col gap-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={e => setRequiresApproval(e.target.checked)}
                className="w-4 h-4 rounded border-outline accent-primary cursor-pointer"
              />
              <span className="font-label-md text-label-md text-on-surface font-semibold">
                Require Operational Approval Gate before Done
              </span>
            </label>
            <p className="font-body-sm text-body-sm text-secondary pl-6">
              Enforces backend rule: Issue cannot transition to "Done" unless an authorized designated approver signs off.
            </p>

            {requiresApproval && (
              <div className="pl-6 pt-1 flex items-center gap-2">
                <span className="font-mono-data text-label-sm text-secondary">Policy Code:</span>
                <input
                  type="text"
                  value={policyCode}
                  onChange={e => setPolicyCode(e.target.value)}
                  placeholder="OPS-FIN-99"
                  className="h-7 px-2 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-mono-data text-label-sm w-36 focus:outline-none focus:border-primary"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between border-t border-surface-container-high">
            <span className="font-mono-data text-[11px] text-secondary">
              Protected by Idempotency Key
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 rounded text-secondary hover:text-on-surface font-label-md text-label-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    <span>Create Issue</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
