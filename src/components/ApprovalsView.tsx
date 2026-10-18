import React, { useState, useEffect } from 'react';
import { Approval, User } from '../types/index.ts';
import { api } from '../utils/api.ts';

interface ApprovalsViewProps {
  currentUser: User | null;
  onSelectIssue: (issueId: string) => void;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({
  currentUser,
  onSelectIssue
}) => {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [filter, setFilter] = useState<'pending' | 'my_requests' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Reject modal
  const [rejectingApprovalId, setRejectingApprovalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchApprovals = () => {
    setLoading(true);
    setActionError(null);
    api.getApprovals(filter)
      .then(res => {
        setApprovals(res);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setActionError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchApprovals();
  }, [filter, currentUser]);

  const handleDecision = async (approvalId: string, decision: 'APPROVED' | 'REJECTED', reason?: string) => {
    setActionError(null);
    setActionSuccess(null);
    const idempotencyKey = `idemp_appr_box_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const res = await api.decideApproval(approvalId, decision, reason, idempotencyKey);
      setActionSuccess(`Gate ${decision === 'APPROVED' ? 'Approved' : 'Rejected'} successfully.`);
      setRejectingApprovalId(null);
      setRejectReason('');
      fetchApprovals();
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'Approval decision rejected by server policy');
    }
  };

  return (
    <div className="w-full flex flex-col gap-5 pb-12 animate-in fade-in duration-150">
      {/* Page Title */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Approvals Inbox
          </h1>
          <span className="font-mono-data text-label-sm bg-surface-container text-on-surface px-2 py-0.5 rounded font-semibold">
            {approvals.filter(a => a.status === 'PENDING').length} Pending
          </span>
        </div>
        <p className="font-body-md text-body-md text-secondary">
          Review operational sign-offs, regulatory gates, and financial adjustments requiring designated authorization.
        </p>
      </div>

      {/* Action Banners */}
      {actionError && (
        <div className="p-3.5 rounded bg-error-container text-on-error-container border border-error/20 font-body-sm text-body-sm flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-error">gavel</span>
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-error hover:underline text-label-sm">
            Dismiss
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3.5 rounded bg-surface-container text-primary border border-surface-container-high font-body-sm text-body-sm flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            <span className="font-medium">{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-secondary hover:text-on-surface text-label-sm">
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-surface-container-high pb-2">
        <button
          onClick={() => setFilter('pending')}
          className={`px-3 py-1.5 rounded font-label-md text-label-md transition-colors ${
            filter === 'pending'
              ? 'bg-primary text-on-primary font-semibold'
              : 'text-secondary hover:text-on-surface'
          }`}
        >
          Pending Sign-Offs
        </button>
        <button
          onClick={() => setFilter('my_requests')}
          className={`px-3 py-1.5 rounded font-label-md text-label-md transition-colors ${
            filter === 'my_requests'
              ? 'bg-primary text-on-primary font-semibold'
              : 'text-secondary hover:text-on-surface'
          }`}
        >
          My Submissions
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded font-label-md text-label-md transition-colors ${
            filter === 'all'
              ? 'bg-primary text-on-primary font-semibold'
              : 'text-secondary hover:text-on-surface'
          }`}
        >
          Audit History
        </button>
      </div>

      {/* Approvals List */}
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="py-12 text-center text-secondary font-mono-data text-label-sm">
            Loading approval queue...
          </div>
        ) : approvals.length === 0 ? (
          <div className="p-12 text-center bg-surface-container-lowest rounded border border-surface-container-high text-secondary flex flex-col items-center gap-2 shadow-2xs">
            <span className="material-symbols-outlined text-[32px] text-secondary">verified</span>
            <span className="font-headline-sm text-headline-sm text-on-surface">Queue Clear</span>
            <p className="font-body-sm text-body-sm text-secondary max-w-sm">
              No approval requests match the current filter. All operations are authorized or in progress.
            </p>
          </div>
        ) : (
          approvals.map(item => {
            const isRequester = item.requester_id === currentUser?.id;
            const isApprover = currentUser?.is_approver === 1;

            return (
              <div
                key={item.id}
                className="bg-surface-container-lowest p-5 rounded border border-surface-container-high shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      onClick={() => onSelectIssue(item.issue_id)}
                      className="font-mono-data text-headline-sm text-primary font-bold hover:underline cursor-pointer"
                    >
                      {item.issue_id}
                    </span>
                    <span className="font-mono-data text-[11px] px-2 py-0.5 rounded bg-surface-container text-on-surface font-semibold">
                      Policy: {item.policy_code}
                    </span>
                    <span
                      className={`font-mono-data text-[11px] px-2 py-0.5 rounded font-bold ${
                        item.status === 'APPROVED'
                          ? 'bg-primary text-on-primary'
                          : item.status === 'REJECTED'
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-surface-container text-primary border border-primary'
                      }`}
                    >
                      {item.status}
                    </span>
                    <span className="text-secondary font-body-sm">
                      {item.project_name || 'Customer Operations'}
                    </span>
                  </div>

                  <h3
                    onClick={() => onSelectIssue(item.issue_id)}
                    className="font-headline-sm text-headline-sm text-on-surface hover:text-primary cursor-pointer truncate max-w-xl"
                  >
                    {item.issue_title}
                  </h3>

                  <p className="font-body-sm text-body-sm text-secondary">
                    {item.policy_description}
                  </p>

                  <div className="flex items-center gap-4 pt-1 text-secondary font-mono-data text-label-sm flex-wrap">
                    <span>Requested by: <strong className="text-on-surface">{item.requester_name}</strong></span>
                    <span>Assigned Approver: <strong className="text-on-surface">{item.approver_name}</strong></span>
                    {item.decided_at && (
                      <span>
                        Decided by {item.decided_by_name} at {item.decided_at}
                      </span>
                    )}
                    {item.decision_reason && (
                      <span className="text-error font-medium">
                        Reason: "{item.decision_reason}"
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Decision Controls */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  {item.status === 'PENDING' ? (
                    <div className="flex items-center gap-2">
                      {isRequester ? (
                        <div className="p-2 rounded bg-surface-container text-secondary font-mono-data text-[11px] text-right">
                          <span className="block font-semibold text-on-surface">Self-Approval Prohibited</span>
                          Awaiting independent approver sign-off.
                        </div>
                      ) : !isApprover ? (
                        <div className="p-2 rounded bg-surface-container text-secondary font-mono-data text-[11px] text-right">
                          <span className="block font-semibold text-on-surface">Approver Authorization Required</span>
                          Switch to Operation Head or Lead role to sign off.
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => handleDecision(item.id, 'APPROVED')}
                            className="h-8 px-3.5 rounded bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md flex items-center gap-1 transition-colors shadow-2xs"
                          >
                            <span className="material-symbols-outlined text-[16px]">check</span>
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => setRejectingApprovalId(item.id)}
                            className="h-8 px-3.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center gap-1 transition-colors border border-surface-container-high"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                            <span>Reject</span>
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="font-mono-data text-label-sm text-secondary">
                      Decision Recorded in Audit Trail
                    </div>
                  )}

                  <button
                    onClick={() => onSelectIssue(item.issue_id)}
                    className="text-label-md font-label-md text-secondary hover:text-primary flex items-center gap-1 transition-colors"
                  >
                    <span>View Issue Details</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Reject Modal */}
      {rejectingApprovalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-surface-container-lowest rounded shadow-2xl border border-surface-container-high p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-surface-container-high pb-2">
              <h4 className="font-headline-sm text-headline-sm text-on-surface">Reject Approval Gate</h4>
              <button onClick={() => setRejectingApprovalId(null)} className="text-secondary hover:text-on-surface">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-secondary">
              Please enter the operational reason for rejecting this request (minimum 5 characters).
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Duplicate customer invoice needs second verification before ledger write-off."
              rows={3}
              className="w-full p-2.5 rounded bg-surface-container-low border border-surface-container-high text-on-surface font-body-sm focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setRejectingApprovalId(null)}
                className="px-3 py-1.5 rounded text-secondary hover:text-on-surface font-label-md text-label-md"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDecision(rejectingApprovalId, 'REJECTED', rejectReason)}
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
