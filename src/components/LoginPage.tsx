import React, { useState } from 'react';
import { User } from '../types/index.ts';
import { api } from '../utils/api.ts';

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pre-configured quick demo logins
  const demoAccounts = [
    {
      name: 'Shreya Lavani',
      role: 'Operation Head',
      email: 'shreya.lavani@nexusops.internal',
      isApprover: true,
      initials: 'SL',
      bg: '#000000',
      note: 'Designated Approver • Full Operational Oversight'
    },
    {
      name: 'Rahul V.',
      role: 'Customer Ops Tier 3 Lead',
      email: 'rahul.v@nexusops.internal',
      isApprover: true,
      initials: 'RV',
      bg: '#1b1b1e',
      note: 'Designated Approver • Tier 3 Lead'
    },
    {
      name: 'Maya T.',
      role: 'People Ops Specialist',
      email: 'maya.t@nexusops.internal',
      isApprover: false,
      initials: 'MT',
      bg: '#47464b',
      note: 'Team Member • Non-Approver'
    },
    {
      name: 'Alex C.',
      role: 'FinOps Specialist',
      email: 'alex.c@nexusops.internal',
      isApprover: false,
      initials: 'AC',
      bg: '#5f5e61',
      note: 'Team Member • Non-Approver'
    },
    {
      name: 'Priya K.',
      role: 'Compliance Analyst',
      email: 'priya.k@nexusops.internal',
      isApprover: false,
      initials: 'PK',
      bg: '#77767b',
      note: 'Compliance • Non-Approver'
    },
    {
      name: 'Elena R.',
      role: 'Operations Analyst',
      email: 'elena.r@nexusops.internal',
      isApprover: false,
      initials: 'ER',
      bg: '#2f3038',
      note: 'Team Member • Customer Ops'
    },
    {
      name: 'System Administrator',
      role: 'Chief Security Officer & Admin',
      email: 'admin@nexusops.internal',
      isApprover: true,
      initials: 'SA',
      bg: '#000000',
      note: 'System Admin • Security & Settings Access'
    },
    {
      name: 'Restricted Partner',
      role: 'External Logistics Contractor',
      email: 'guest.vendor@external.internal',
      isApprover: false,
      initials: 'RP',
      bg: '#77767b',
      note: 'Isolated Scope • Test 403 Forbidden'
    }
  ];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await api.login(email.trim(), password);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuickLogin = (accEmail: string) => {
    setEmail(accEmail);
    setPassword('Password123!');
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-surface-container-low flex flex-col justify-center items-center p-4 sm:p-6 font-body-md text-body-md text-on-surface antialiased select-none">
      <div className="w-full max-w-md bg-surface-container-lowest rounded shadow-xl border border-surface-container-high overflow-hidden animate-in fade-in duration-200">
        {/* Brand Header */}
        <div className="px-6 pt-6 pb-4 border-b border-surface-container-high flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary text-[18px]">terminal</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-primary tracking-tight leading-none">Nexus Ops</span>
              <span className="font-body-sm text-[11px] text-secondary">Operations Command Center</span>
            </div>
          </div>
          <span className="font-mono-data text-label-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded font-medium">
            v2.4.0
          </span>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-5">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight">
              Sign In to Workspace
            </h2>
            <p className="font-body-sm text-body-sm text-secondary pt-0.5">
              Enter your credentials to access authorized operational workflows and approval gates.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded bg-error-container text-on-error-container border border-error/20 font-body-sm text-body-sm flex items-start gap-2 shadow-2xs">
              <span className="material-symbols-outlined text-[16px] text-error mt-0.5">lock</span>
              <div className="flex flex-col">
                <span className="font-semibold text-error">Authentication Failed</span>
                <span>{errorMsg}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1">
              <label className="font-label-md text-label-md text-on-surface font-semibold">
                Email Address
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-2.5 text-[16px] text-secondary pointer-events-none">
                  alternate_email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@nexusops.internal"
                  required
                  className="w-full h-9 pl-8 pr-3 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-body-sm text-body-sm placeholder-secondary focus:outline-none focus:border-primary shadow-2xs"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-md text-label-md text-on-surface font-semibold">
                Password
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-2.5 text-[16px] text-secondary pointer-events-none">
                  key
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full h-9 pl-8 pr-9 rounded bg-surface-container-lowest border border-surface-container-high text-on-surface font-body-sm text-body-sm placeholder-secondary focus:outline-none focus:border-primary shadow-2xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 text-secondary hover:text-on-surface text-[16px]"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full h-9 rounded bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md flex items-center justify-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">login</span>
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Credentials Panel */}
          <div className="pt-2 border-t border-surface-container-high flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-secondary font-semibold uppercase tracking-wider">
                Quick Role Credentials
              </span>
              <span className="font-mono-data text-[10px] text-secondary">
                Password: <code className="bg-surface-container px-1 py-0.2 rounded font-semibold text-on-surface">Password123!</code>
              </span>
            </div>

            <div className="grid grid-cols-1 gap-1.5 max-h-[220px] overflow-y-auto pr-0.5">
              {demoAccounts.map(acc => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleSelectQuickLogin(acc.email)}
                  className={`p-2 rounded text-left flex items-center justify-between transition-colors border ${
                    email === acc.email
                      ? 'bg-surface-container-high border-primary text-on-surface'
                      : 'bg-surface-container-low hover:bg-surface-container border-transparent text-secondary hover:text-on-surface'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center text-white font-mono-data text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: acc.bg }}
                    >
                      {acc.initials}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-md text-[12px] font-semibold text-on-surface leading-tight truncate">
                        {acc.name}
                      </span>
                      <span className="font-mono-data text-[10px] text-secondary leading-tight truncate">
                        {acc.note}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`font-mono-data text-[10px] px-1.5 py-0.2 rounded whitespace-nowrap ml-1 ${
                      acc.isApprover
                        ? 'bg-primary text-on-primary font-medium'
                        : 'bg-surface-container text-secondary'
                    }`}
                  >
                    {acc.isApprover ? 'Approver' : 'Member'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-surface-container-low border-t border-surface-container-high text-center font-mono-data text-[11px] text-secondary">
          Protected by session tokens with backend-enforced project boundaries.
        </div>
      </div>
    </div>
  );
};
