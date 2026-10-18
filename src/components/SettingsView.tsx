import React, { useState } from 'react';
import { User, Team } from '../types/index.ts';
import { api } from '../utils/api.ts';

interface SettingsViewProps {
  currentUser: User | null;
  users: User[];
  teams: Team[];
  onRefreshData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentUser,
  users,
  teams,
  onRefreshData
}) => {
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const isAdminOrOpsHead = currentUser?.system_role === 'admin' || currentUser?.system_role === 'operation_head';

  const handleResetDemo = async () => {
    if (!confirm('Reset database to pristine canonical demo state? All test modifications will be re-seeded.')) return;
    setResetting(true);
    setResetMessage(null);
    try {
      const res = await api.resetDemoData();
      setResetMessage(res.message);
      onRefreshData();
    } catch (err: any) {
      setResetMessage('Error resetting database: ' + err.message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 pb-12 animate-in fade-in duration-150">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Administration &amp; System Settings
          </h1>
          <span
            className={`font-mono-data text-label-sm px-2 py-0.5 rounded font-semibold ${
              isAdminOrOpsHead
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-secondary'
            }`}
          >
            {isAdminOrOpsHead ? 'Authorized Access' : 'Restricted (Read-Only)'}
          </span>
        </div>
        <p className="font-body-md text-body-md text-secondary">
          Manage operational security, cross-team memberships, and relational persistence controls.
        </p>
      </div>

      {resetMessage && (
        <div className="p-3.5 rounded bg-surface-container border border-surface-container-high text-primary font-body-sm text-body-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">info</span>
            <span>{resetMessage}</span>
          </div>
          <button onClick={() => setResetMessage(null)} className="text-secondary hover:text-on-surface text-label-sm">
            Dismiss
          </button>
        </div>
      )}

      {/* Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 1: Users & System Roles */}
        <div className="bg-surface-container-lowest p-5 rounded border border-surface-container-high shadow-2xs flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-surface-container-high">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Users &amp; Roles Roster</h3>
            <span className="font-mono-data text-label-sm text-secondary">{users.length} members</span>
          </div>

          <div className="flex flex-col divide-y divide-surface-container-high max-h-[380px] overflow-y-auto">
            {users.map(u => (
              <div key={u.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center text-white font-mono-data text-[11px] font-bold"
                    style={{ backgroundColor: u.avatar_bg || '#000000' }}
                  >
                    {u.initials}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md font-semibold text-on-surface">
                      {u.name}
                    </span>
                    <span className="font-body-sm text-body-sm text-secondary">
                      {u.title}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-0.5">
                  <span className="font-mono-data text-[11px] px-1.5 py-0.2 rounded bg-surface-container text-on-surface uppercase font-medium">
                    {u.system_role.replace('_', ' ')}
                  </span>
                  {u.is_approver === 1 && (
                    <span className="font-mono-data text-[10px] text-primary flex items-center gap-0.5 font-semibold">
                      <span className="material-symbols-outlined text-[12px]">verified_user</span>
                      Approver
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Teams & Multi-Membership */}
        <div className="bg-surface-container-lowest p-5 rounded border border-surface-container-high shadow-2xs flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-surface-container-high">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Operational Teams</h3>
            <span className="font-mono-data text-label-sm text-secondary">{teams.length} units</span>
          </div>

          <div className="flex flex-col gap-3 max-h-[380px] overflow-y-auto">
            {teams.map(t => (
              <div key={t.id} className="p-3 rounded bg-surface-container-low border border-surface-container flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md font-semibold text-on-surface">
                    {t.name}
                  </span>
                  <span className="font-mono-data text-[11px] px-1.5 py-0.2 rounded bg-surface-container text-secondary">
                    {t.code}
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-secondary">
                  {t.description}
                </p>
                <div className="flex items-center justify-between pt-1 border-t border-surface-container font-mono-data text-[11px] text-secondary">
                  <span>Lead: <strong className="text-on-surface">{t.lead_name || 'Assigned Lead'}</strong></span>
                  <span>{t.members?.length || 0} members</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 3: Relational Persistence & Integrity Engine */}
      <div className="bg-surface-container-lowest p-5 rounded border border-surface-container-high shadow-2xs flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-surface-container-high pb-3">
          <div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Relational Architecture &amp; Correctness Guarantees</h3>
            <p className="font-body-sm text-body-sm text-secondary">
              Persistent SQLite storage with foreign key constraints, optimistic concurrency checking, and idempotency protection.
            </p>
          </div>
          <span className="font-mono-data text-label-sm px-2 py-0.5 rounded bg-surface-container text-primary font-bold">
            ACID / Disk Sync Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="p-3 rounded bg-surface-container-low border border-surface-container font-mono-data text-body-sm">
            <span className="text-secondary text-[11px] block">DATABASE ENGINE</span>
            <span className="text-on-surface font-semibold text-label-md">SQLite (sql.js WASM)</span>
          </div>

          <div className="p-3 rounded bg-surface-container-low border border-surface-container font-mono-data text-body-sm">
            <span className="text-secondary text-[11px] block">PERSISTENCE TARGET</span>
            <span className="text-on-surface font-semibold text-label-md">./data/nexus_ops.db</span>
          </div>

          <div className="p-3 rounded bg-surface-container-low border border-surface-container font-mono-data text-body-sm">
            <span className="text-secondary text-[11px] block">CONCURRENCY STRATEGY</span>
            <span className="text-on-surface font-semibold text-label-md">Optimistic Version Checks (409)</span>
          </div>

          <div className="p-3 rounded bg-surface-container-low border border-surface-container font-mono-data text-body-sm">
            <span className="text-secondary text-[11px] block">IDEMPOTENCY SAFEGUARD</span>
            <span className="text-on-surface font-semibold text-label-md">Header Token Registry</span>
          </div>
        </div>

        {/* Reset Demo Data Action */}
        <div className="pt-3 border-t border-surface-container-high flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-label-md text-label-md font-semibold text-on-surface">Reset Canonical Evaluation State</span>
            <span className="font-body-sm text-body-sm text-secondary">
              Reverts all issues, comments, approval gates, and counters to the pristine Stitch demo fixtures.
            </span>
          </div>

          <button
            onClick={handleResetDemo}
            disabled={resetting}
            className="h-8 px-4 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md border border-surface-container-high transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[16px]">restart_alt</span>
            <span>{resetting ? 'Resetting...' : 'Reset Demo Data'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
