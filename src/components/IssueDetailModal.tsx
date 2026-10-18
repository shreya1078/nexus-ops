import React, { useState, useEffect } from 'react';
import { Issue, Comment, ActivityHistory, Approval, User } from '../types/index.ts';
import { api } from '../utils/api.ts';

interface IssueDetailModalProps {
  issueId: string | null;
  onClose: () => void;
  currentUser: User | null;
  availableUsers: User[];
  onIssueUpdated: (updated: Issue) => void;
}

export const IssueDetailModal: React.FC<IssueDetailModalProps> = ({
  issueId,
  onClose,
  currentUser,
  availableUsers,
  onIssueUpdated
}) => {
  const [issue, setIssue] = useState<(Issue & { comments: Comment[]; activities: ActivityHistory[]; activeApproval?: Approval }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tab: 'comments' vs 'activity'
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');

  // Comment Composer
  const [composerMode, setComposerMode] = useState<'write' | 'preview'>('write');
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Comment Editing
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [openCommentMenuId, setOpenCommentMenuId] = useState<string | null>(null);

  // Rejection modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Approval Feedback Banner
  const [approvalFeedback, setApprovalFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  // Assignee picker state
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);

  const fetchIssueData = async () => {
    if (!issueId) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await api.getIssue(issueId);
      setIssue(data);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to load issue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (issueId) {
      fetchIssueData();
      setApprovalFeedback(null);
    }
  }, [issueId]);

  if (!issueId) return null;

  // Handle status update with optimistic concurrency
  const handleStatusChange = async (newStatus: string) => {
    if (!issue) return;
    setErrorMsg(null);
    try {
      const updated = await api.updateIssue(issue.id, {
        version: issue.version,
        status: newStatus
      });
      setIssue(prev => prev ? { ...prev, ...updated, status: updated.status } : null);
      onIssueUpdated({ ...issue, ...updated });
      fetchIssueData(); // Refresh history
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to update status');
    }
  };

  // Handle priority update
  const handlePriorityChange = async (newPriority: string) => {
    if (!issue) return;
    try {
      const updated = await api.updateIssue(issue.id, {
        version: issue.version,
        priority: newPriority
      });
      setIssue(prev => prev ? { ...prev, ...updated, priority: updated.priority } : null);
      onIssueUpdated({ ...issue, ...updated });
      fetchIssueData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Handle assignee change
  const handleAssigneeChange = async (newAssigneeId: string) => {
    if (!issue) return;
    try {
      const updated = await api.updateIssue(issue.id, {
        version: issue.version,
        assignee_id: newAssigneeId || null
      });
      setIssue(prev => prev ? { ...prev, ...updated, assignee_id: updated.assignee_id } : null);
      setShowAssigneePicker(false);
      onIssueUpdated({ ...issue, ...updated });
      fetchIssueData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Submit new comment
  const handleCommentSubmit = async () => {
    if (!commentText.trim() || !issue) return;
    setSubmittingComment(true);
    try {
      await api.addComment(issue.id, commentText.trim());
      setCommentText('');
      setComposerMode('write');
      await fetchIssueData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmittingComment(false);
    }
  };

  // Save comment edit
  const handleSaveCommentEdit = async (commentId: string) => {
    if (!editingText.trim()) return;
    try {
      await api.editComment(commentId, editingText.trim());
      setEditingCommentId(null);
      await fetchIssueData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Delete comment
  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Permanently delete this comment?')) return;
    try {
      await api.deleteComment(commentId);
      setOpenCommentMenuId(null);
      await fetchIssueData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Handle Approval Decision (Approve / Reject)
  const handleApprovalDecision = async (decision: 'APPROVED' | 'REJECTED', reason?: string) => {
    if (!issue?.activeApproval) return;
    setErrorMsg(null);
    setApprovalFeedback(null);

    const idempotencyKey = `idemp_appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const result = await api.decideApproval(
        issue.activeApproval.id,
        decision,
        reason,
        idempotencyKey
      );

      setApprovalFeedback({
        text: `Gate ${decision === 'APPROVED' ? 'Authorized & Approved' : 'Rejected'} by ${result.decided_by}`,
        isError: decision === 'REJECTED'
      });

      setShowRejectModal(false);
      setRejectReason('');
      await fetchIssueData();
    } catch (err: any) {
      console.error(err);
      setApprovalFeedback({
        text: err.message || 'Approval decision rejected by server policy',
        isError: true
      });
    }
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setApprovalFeedback({ text: 'Issue link copied to clipboard', isError: false });
    setTimeout(() => setApprovalFeedback(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex justify-center items-start p-3 md:p-6 animate-in fade-in duration-150">
      <div className="relative bg-surface-container-lowest w-full max-w-6xl rounded shadow-2xl border border-surface-container-high flex flex-col overflow-hidden my-auto max-h-[92vh]">
        {/* Top Action Navigation Bar */}
        <div className="px-6 py-3 bg-surface-container-lowest border-b border-surface-container-high flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={onClose}
              className="h-8 px-3 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>Back to Team Board</span>
            </button>
            <div className="flex items-center gap-1 font-mono-data text-label-md text-secondary truncate">
              <span>{issue?.project_name || 'Customer Operations'}</span>
              <span>/</span>
              <span className="font-semibold text-primary">{issue?.id}</span>
              <span className="font-mono-data text-[10px] px-1.5 py-0.2 rounded bg-surface-container text-secondary ml-1">
                v{issue?.version || 1}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={copyLink}
              className="h-8 px-2.5 rounded text-secondary hover:text-on-surface hover:bg-surface-container font-mono-data text-label-sm flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">link</span>
              <span>Copy Link</span>
            </button>
            <div className="h-4 w-px bg-surface-container-high mx-1"></div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded flex items-center justify-center text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="px-6 py-2.5 bg-error-container text-on-error-container border-b border-error/20 font-body-sm text-body-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-error">error</span>
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-error hover:underline text-label-sm"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Issue Header Title & Status Badges */}
        <div className="px-6 py-4 bg-surface-container-lowest border-b border-surface-container-high flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
              {issue?.title}
            </h1>
            <span className="font-mono-data text-headline-md text-secondary">
              #{issue?.id}
            </span>
          </div>

          {/* Meta status line */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="h-6 px-2.5 rounded bg-primary text-on-primary font-label-md text-label-md flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">sync</span>
                <span>{issue?.status}</span>
              </span>
              <span className="h-6 px-2 rounded bg-surface-container text-on-surface font-mono-data text-label-sm flex items-center font-bold">
                [{issue?.priority}]
              </span>
            </div>
            <div className="text-secondary font-body-sm text-body-sm flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-on-surface">{issue?.creator_name || 'System Operator'}</span>
              <span>opened this issue</span>
              <span>•</span>
              <span className="font-mono-data text-label-sm">
                {issue?.comments?.length || 0} comments
              </span>
            </div>
          </div>
        </div>

        {/* Two-Column Layout */}
        <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-surface-container-lowest">
          {/* LEFT COLUMN: Main Issue Body, Discussion, Timeline, Composer (8 Cols) */}
          <div className="lg:col-span-8 flex flex-col gap-5">
            {/* OPERATIONAL APPROVAL GATE BANNER */}
            {(issue?.requires_approval === 1 || issue?.activeApproval) && (
              <div className="p-4 rounded bg-surface-container-low border border-surface-container-high flex flex-col gap-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">verified_user</span>
                    <span className="font-headline-sm text-headline-sm text-on-surface">Operational Approval Gate</span>
                    <span
                      className={`px-2 py-0.5 rounded font-mono-data text-[11px] font-bold ${
                        issue?.approval_status === 'APPROVED'
                          ? 'bg-primary text-on-primary'
                          : issue?.approval_status === 'REJECTED'
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-primary text-on-primary'
                      }`}
                    >
                      {issue?.approval_status === 'APPROVED'
                        ? 'AUTHORIZED'
                        : issue?.approval_status === 'REJECTED'
                        ? 'REJECTED'
                        : 'PENDING SIGN-OFF'}
                    </span>
                  </div>
                  <span className="font-mono-data text-label-sm text-secondary">
                    Policy: {issue?.approval_policy_code || issue?.activeApproval?.policy_code || 'OPS-FIN-99'}
                  </span>
                </div>

                <p className="font-body-md text-body-md text-on-surface">
                  {issue?.activeApproval?.policy_description ||
                    'This action requires explicit authorization from a designated Operations Approver before release or completion.'}
                </p>

                {issue?.approval_status === 'PENDING' && (
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <button
                      onClick={() => handleApprovalDecision('APPROVED')}
                      className="h-8 px-3.5 rounded bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md flex items-center gap-1 transition-colors shadow-2xs"
                    >
                      <span className="material-symbols-outlined text-[16px]">check</span>
                      <span>Approve &amp; Authorize</span>
                    </button>
                    <button
                      onClick={() => setShowRejectModal(true)}
                      className="h-8 px-3.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center gap-1 transition-colors border border-surface-container-high"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                      <span>Reject with Reason</span>
                    </button>
                  </div>
                )}

                {approvalFeedback && (
                  <div
                    className={`font-mono-data text-label-sm p-2 rounded ${
                      approvalFeedback.isError
                        ? 'bg-error-container text-on-error-container font-medium'
                        : 'bg-surface-container text-primary font-semibold'
                    }`}
                  >
                    {approvalFeedback.text}
                  </div>
                )}
              </div>
            )}

            {/* Description Card (Issue Body) */}
            <div className="rounded bg-surface-container-lowest border border-surface-container-high shadow-2xs overflow-hidden">
              <div className="px-4 py-2.5 bg-surface-container flex items-center justify-between border-b border-surface-container-high">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary font-mono-data text-[11px] font-bold">
                    {issue?.creator_initials || 'SL'}
                  </div>
                  <span className="font-label-md text-label-md font-semibold text-on-surface">
                    {issue?.creator_name || 'Shreya Lavani'}
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-surface-container-high font-mono-data text-[10px] text-secondary font-medium">
                    Author
                  </span>
                </div>
                <span className="font-mono-data text-label-sm text-secondary">
                  {issue?.created_at}
                </span>
              </div>
              <div className="p-4 flex flex-col gap-3 font-body-md text-body-md text-on-surface leading-relaxed whitespace-pre-wrap">
                {issue?.description || 'No description provided.'}
                <div className="p-2.5 rounded bg-surface-container-low border border-surface-container font-mono-data text-body-sm text-secondary flex items-center justify-between mt-2">
                  <span>Compliance Code: REF-EMP-2025-V2</span>
                  <span>Audit Level: STRICT</span>
                </div>
              </div>
            </div>

            {/* Sub-Tabs: Comments (X) vs Activity History (Y) */}
            <div className="flex items-center justify-between pt-2 border-b border-surface-container-high pb-2">
              <div className="flex items-center gap-1 rounded bg-surface-container-low p-0.5">
                <button
                  onClick={() => setActiveTab('comments')}
                  className={`px-3.5 py-1 rounded font-label-md text-label-md flex items-center gap-1.5 transition-colors ${
                    activeTab === 'comments'
                      ? 'bg-primary text-on-primary'
                      : 'text-secondary hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">chat</span>
                  <span>Comments ({issue?.comments?.length || 0})</span>
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`px-3.5 py-1 rounded font-label-md text-label-md flex items-center gap-1.5 transition-colors ${
                    activeTab === 'activity'
                      ? 'bg-primary text-on-primary'
                      : 'text-secondary hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">history</span>
                  <span>Activity History ({issue?.activities?.length || 0})</span>
                </button>
              </div>

              <span className="text-secondary font-mono-data text-label-sm">
                Sorted by oldest
              </span>
            </div>

            {/* TAB CONTENT 1: COMMENTS LIST & COMPOSER */}
            {activeTab === 'comments' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  {issue?.comments?.map((c, idx) => (
                    <div
                      key={c.id}
                      className="rounded bg-surface-container-lowest border border-surface-container-high shadow-2xs overflow-hidden flex flex-col"
                    >
                      <div className="px-4 py-2 bg-surface-container-low border-b border-surface-container-high flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-on-secondary font-mono-data text-[11px] font-bold">
                            {c.author_initials || 'MT'}
                          </div>
                          <span className="font-label-md text-label-md font-semibold text-on-surface">
                            {c.author_name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-surface-container text-secondary font-mono-data text-[10px]">
                            {c.author_title || 'Collaborator'}
                          </span>
                          <span className="font-mono-data text-label-sm text-secondary">
                            • {c.created_at}
                          </span>
                          {c.is_edited === 1 && (
                            <span className="font-mono-data text-[10px] text-secondary">
                              (edited)
                            </span>
                          )}
                        </div>

                        {/* 3-dot dropdown menu */}
                        <div className="relative">
                          <button
                            onClick={() => setOpenCommentMenuId(openCommentMenuId === c.id ? null : c.id)}
                            className="w-7 h-7 rounded flex items-center justify-center text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px]">more_horiz</span>
                          </button>

                          {openCommentMenuId === c.id && (
                            <div className="absolute right-0 mt-1 w-32 rounded bg-surface-container-lowest shadow-md border border-surface-container-high z-30 p-1 font-label-md text-label-md">
                              <button
                                onClick={() => {
                                  setEditingCommentId(c.id);
                                  setEditingText(c.body);
                                  setOpenCommentMenuId(null);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-container-high text-on-surface flex items-center gap-2"
                              >
                                <span className="material-symbols-outlined text-[14px]">edit</span>
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleDeleteComment(c.id)}
                                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-container-high text-error flex items-center gap-2"
                              >
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="p-4 font-body-md text-body-md text-on-surface leading-relaxed">
                        {editingCommentId === c.id ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={editingText}
                              onChange={e => setEditingText(e.target.value)}
                              rows={3}
                              className="w-full p-2.5 rounded bg-surface-container-low border border-surface-container-high text-on-surface font-body-md focus:outline-none"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setEditingCommentId(null)}
                                className="h-7 px-3 rounded text-secondary hover:text-on-surface font-label-md text-label-md"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveCommentEdit(c.id)}
                                className="h-7 px-3 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container"
                              >
                                Save Changes
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap">{c.body}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Refined Comment Composer */}
                <div className="rounded bg-surface-container-lowest border border-surface-container-high shadow-2xs overflow-hidden flex flex-col">
                  <div className="px-4 py-2 bg-surface-container-low border-b border-surface-container-high flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setComposerMode('write')}
                        className={`px-3 py-1 rounded font-label-md text-label-md font-semibold ${
                          composerMode === 'write'
                            ? 'bg-surface-container text-on-surface'
                            : 'text-secondary hover:text-on-surface'
                        }`}
                      >
                        Write
                      </button>
                      <button
                        onClick={() => setComposerMode('preview')}
                        className={`px-3 py-1 rounded font-label-md text-label-md ${
                          composerMode === 'preview'
                            ? 'bg-surface-container text-on-surface font-semibold'
                            : 'text-secondary hover:text-on-surface'
                        }`}
                      >
                        Preview
                      </button>
                    </div>

                    <div className="flex items-center gap-1 text-secondary">
                      <button
                        onClick={() => setCommentText(prev => prev + ' **bold text** ')}
                        className="p-1 hover:text-on-surface rounded"
                        title="Bold"
                      >
                        <span className="material-symbols-outlined text-[16px]">format_bold</span>
                      </button>
                      <button
                        onClick={() => setCommentText(prev => prev + ' `code snippet` ')}
                        className="p-1 hover:text-on-surface rounded"
                        title="Code"
                      >
                        <span className="material-symbols-outlined text-[16px]">code</span>
                      </button>
                      <button
                        onClick={() => setCommentText(prev => prev + ' @Maya T. ')}
                        className="p-1 hover:text-on-surface rounded"
                        title="Mention"
                      >
                        <span className="material-symbols-outlined text-[16px]">alternate_email</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-4 flex flex-col gap-3">
                    {composerMode === 'write' ? (
                      <textarea
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        placeholder="Write a comment... (use @ to mention team members, ⌘+Enter to submit)"
                        rows={4}
                        onKeyDown={e => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            handleCommentSubmit();
                          }
                        }}
                        className="w-full p-3 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-body-md placeholder-secondary focus:border-primary focus:outline-none resize-y"
                      />
                    ) : (
                      <div className="min-h-[96px] p-3 rounded bg-surface-container-low border border-surface-container text-on-surface font-body-md whitespace-pre-wrap">
                        {commentText ? commentText : <span className="text-secondary italic">Nothing to preview yet.</span>}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="font-mono-data text-[11px] text-secondary">
                        Markdown is supported • Press <kbd className="px-1 py-0.2 rounded bg-surface-container text-on-surface">⌘+Enter</kbd>
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCommentText('')}
                          className="h-8 px-3 rounded text-secondary hover:text-on-surface font-label-md text-label-md"
                        >
                          Clear
                        </button>
                        <button
                          onClick={handleCommentSubmit}
                          disabled={!commentText.trim() || submittingComment}
                          className="h-8 px-4 rounded bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[14px]">chat_bubble</span>
                          <span>{submittingComment ? 'Saving...' : 'Comment'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT 2: SEPARATE ACTIVITY HISTORY / AUDIT TIMELINE */}
            {activeTab === 'activity' && (
              <div className="flex flex-col gap-3 rounded bg-surface-container-low border border-surface-container-high p-4 font-mono-data text-label-sm">
                <div className="flex items-center justify-between pb-2 border-b border-surface-container-high">
                  <span className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px] text-secondary">history</span>
                    System Activity &amp; Audit Trail
                  </span>
                  <span className="text-secondary">{issue?.activities?.length || 0} logged events</span>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  {issue?.activities?.map(act => (
                    <div key={act.id} className="flex items-start gap-2.5 text-on-surface">
                      <span className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0"></span>
                      <span className="text-secondary whitespace-nowrap">{act.created_at}</span>
                      <span className="px-1.5 py-0.2 rounded bg-surface-container font-medium whitespace-nowrap">
                        {act.actor_name}
                      </span>
                      <span className="text-on-surface flex-1">{act.details}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT SIDEBAR: GitHub-style Issue Properties (4 Cols) */}
          <div className="lg:col-span-4 flex flex-col gap-4 border-l border-surface-container-high pl-0 lg:pl-6">
            {/* Assignees Block */}
            <div className="flex flex-col gap-1.5 pb-2 border-b border-surface-container-high">
              <div className="flex items-center justify-between text-secondary">
                <span className="font-label-md text-label-md font-semibold text-on-surface uppercase tracking-wide">
                  Assignee
                </span>
                <button
                  onClick={() => setShowAssigneePicker(!showAssigneePicker)}
                  className="font-mono-data text-label-sm hover:text-on-surface flex items-center gap-0.5 text-primary"
                >
                  <span className="material-symbols-outlined text-[14px]">settings</span>
                  <span>Edit</span>
                </button>
              </div>

              {showAssigneePicker ? (
                <div className="p-2 rounded bg-surface-container-low border border-surface-container-high flex flex-col gap-1">
                  <select
                    value={issue?.assignee_id || ''}
                    onChange={e => handleAssigneeChange(e.target.value)}
                    className="w-full h-8 px-2 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-label-md text-label-md focus:outline-none"
                  >
                    <option value="">Unassigned</option>
                    {availableUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.title})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-1.5 rounded bg-surface-container-low border border-surface-container">
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-on-primary font-mono-data text-label-sm font-bold">
                    {issue?.assignee_initials || '--'}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md font-semibold text-on-surface">
                      {issue?.assignee_name || 'Unassigned'}
                    </span>
                    <span className="font-mono-data text-[11px] text-secondary">
                      {issue?.assignee_title || 'Pending assignment'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Labels Block */}
            <div className="flex flex-col gap-1.5 pb-2 border-b border-surface-container-high">
              <div className="flex items-center justify-between text-secondary">
                <span className="font-label-md text-label-md font-semibold text-on-surface uppercase tracking-wide">
                  Labels
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-mono-data text-[11px] font-medium border border-surface-container-high">
                  Compliance
                </span>
                <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-mono-data text-[11px] font-medium border border-surface-container-high">
                  Operations
                </span>
                <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-mono-data text-[11px] font-medium border border-surface-container-high">
                  Q4-Directives
                </span>
              </div>
            </div>

            {/* Project & Status Block */}
            <div className="flex flex-col gap-1.5 pb-2 border-b border-surface-container-high">
              <span className="font-label-md text-label-md font-semibold text-on-surface uppercase tracking-wide">
                Project &amp; Status
              </span>
              <div className="flex flex-col gap-1.5">
                <div className="p-1.5 rounded bg-surface-container-low border border-surface-container text-secondary font-mono-data text-label-sm flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">folder</span>
                  <span className="text-on-surface font-medium">{issue?.project_name}</span>
                </div>
                <select
                  value={issue?.status || 'Open'}
                  onChange={e => handleStatusChange(e.target.value)}
                  className="w-full h-8 px-2.5 rounded bg-surface-container-low border border-surface-container-high text-on-surface font-label-md text-label-md focus:border-primary focus:outline-none"
                >
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="In Review">In Review</option>
                  <option value="Blocked">Blocked</option>
                  <option value="Done">Done</option>
                </select>
              </div>
            </div>

            {/* Priority Block */}
            <div className="flex flex-col gap-1.5 pb-2 border-b border-surface-container-high">
              <span className="font-label-md text-label-md font-semibold text-on-surface uppercase tracking-wide">
                Priority
              </span>
              <select
                value={issue?.priority || 'MED'}
                onChange={e => handlePriorityChange(e.target.value)}
                className="w-full h-8 px-2.5 rounded bg-surface-container-low border border-surface-container-high text-on-surface font-label-md text-label-md focus:border-primary focus:outline-none font-bold"
              >
                <option value="LOW">LOW</option>
                <option value="MED">MED (Medium)</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>

            {/* Due Date Block */}
            <div className="flex flex-col gap-1.5 pb-2 border-b border-surface-container-high">
              <span className="font-label-md text-label-md font-semibold text-on-surface uppercase tracking-wide">
                Due Date
              </span>
              <div className="flex items-center justify-between p-2 rounded bg-surface-container-low border border-surface-container">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-secondary">event</span>
                  <span className="font-label-md text-label-md text-on-surface">
                    {issue?.due_label || issue?.due_date || 'None set'}
                  </span>
                </div>
                <span className="font-mono-data text-[10px] px-1.5 py-0.2 rounded bg-surface-container text-on-surface font-medium">
                  Active
                </span>
              </div>
            </div>

            {/* Optimistic Concurrency Version Badge */}
            <div className="p-2 rounded bg-surface-container border border-surface-container-high font-mono-data text-[11px] text-secondary flex items-center justify-between">
              <span>Optimistic Lock:</span>
              <span className="font-bold text-on-surface">v{issue?.version} (Verified)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Reject with Reason Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-surface-container-lowest rounded shadow-2xl border border-surface-container-high p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-surface-container-high pb-2">
              <h4 className="font-headline-sm text-headline-sm text-on-surface">Operational Gate Rejection</h4>
              <button onClick={() => setShowRejectModal(false)} className="text-secondary hover:text-on-surface">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-secondary">
              A detailed operational justification is required when rejecting this gate.
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Duplicate charge requires secondary accounting voucher before refund release."
              rows={3}
              className="w-full p-2.5 rounded bg-surface-container-low border border-surface-container-high text-on-surface font-body-sm focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-3 py-1.5 rounded text-secondary hover:text-on-surface font-label-md text-label-md"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApprovalDecision('REJECTED', rejectReason)}
                disabled={!rejectReason.trim() || rejectReason.trim().length < 5}
                className="px-4 py-1.5 rounded bg-error text-white font-label-md text-label-md disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
