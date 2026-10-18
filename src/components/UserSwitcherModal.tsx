import React, { useEffect, useState } from 'react';
import { User } from '../types/index.ts';
import { api, getActiveUserId, setActiveUserId } from '../utils/api.ts';

interface UserSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserChanged: (newUser: User) => void;
}

export const UserSwitcherModal: React.FC<UserSwitcherModalProps> = ({
  isOpen,
  onClose,
  onUserChanged
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const currentUserId = getActiveUserId();

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      api.getUsers()
        .then(data => {
          setUsers(data);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectUser = async (user: User) => {
    try {
      const res = await api.switchUser(user.id);
      onUserChanged(res.user);
    } catch {
      setActiveUserId(user.id);
      onUserChanged(user);
    } finally {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-surface-container-lowest rounded shadow-2xl border border-surface-container-high overflow-hidden animate-in fade-in duration-150">
        <div className="px-5 py-4 border-b border-surface-container-high flex items-center justify-between">
          <div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Switch Operational Identity</h3>
            <p className="font-body-sm text-body-sm text-secondary">
              Evaluate real backend-enforced permissions across distinct organizational roles.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-secondary hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto flex flex-col gap-2">
          {loading ? (
            <div className="py-8 text-center text-secondary font-mono-data text-label-sm">
              Loading team directory...
            </div>
          ) : (
            users.map(u => {
              const isSelected = u.id === currentUserId;
              return (
                <button
                  key={u.id}
                  onClick={() => handleSelectUser(u)}
                  className={`w-full text-left p-3 rounded flex items-center justify-between transition-colors border ${
                    isSelected
                      ? 'bg-surface-container-high border-primary text-on-surface font-medium'
                      : 'bg-surface-container-low hover:bg-surface-container border-transparent text-on-surface'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded flex items-center justify-center text-white font-mono-data text-xs font-bold"
                      style={{ backgroundColor: u.avatar_bg || '#000000' }}
                    >
                      {u.initials}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-label-md text-label-md font-semibold text-on-surface">
                          {u.name}
                        </span>
                        {isSelected && (
                          <span className="font-mono-data text-[10px] px-1.5 py-0.2 rounded bg-primary text-on-primary">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="font-body-sm text-body-sm text-secondary">
                        {u.title}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className="font-mono-data text-[11px] px-2 py-0.5 rounded bg-surface-container text-secondary uppercase font-medium">
                      {u.system_role.replace('_', ' ')}
                    </span>
                    {u.is_approver === 1 ? (
                      <span className="font-mono-data text-[10px] text-primary flex items-center gap-0.5 font-medium">
                        <span className="material-symbols-outlined text-[12px]">verified_user</span>
                        Approver
                      </span>
                    ) : (
                      <span className="font-mono-data text-[10px] text-secondary">
                        Non-Approver
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-5 py-3 bg-surface-container-low border-t border-surface-container-high flex items-center justify-between text-secondary font-mono-data text-label-sm">
          <span>Role changes immediately re-evaluate project access &amp; UI boundaries.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface text-label-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
