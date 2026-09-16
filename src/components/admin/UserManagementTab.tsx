import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../services/authContext';
import { useLanguage } from '../../i18n/LanguageContext';
import type { User, UserRole, Permission } from '../../models/auth';

const AVAILABLE_PERMISSIONS: { id: Permission; labelKey: string; descKey: string }[] = [
  { id: 'view_media', labelKey: 'permViewMedia', descKey: 'permViewMediaDesc' },
  { id: 'edit_metadata', labelKey: 'permEditMetadata', descKey: 'permEditMetadataDesc' },
  { id: 'manage_faces', labelKey: 'permManageFaces', descKey: 'permManageFacesDesc' },
  { id: 'admin_panel', labelKey: 'permAdminPanel', descKey: 'permAdminPanelDesc' },
  { id: 'vault_access', labelKey: 'permVaultAccess', descKey: 'permVaultAccessDesc' },
  { id: 'manage_users', labelKey: 'permManageUsers', descKey: 'permManageUsersDesc' },
];

export default function UserManagementTab() {
  const { authFetch, currentUser, isAdmin } = useAuth();
  const { t } = useLanguage();

  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [formUsername, setFormUsername] = useState<string>('');
  const [formDisplayName, setFormDisplayName] = useState<string>('');
  const [formPassword, setFormPassword] = useState<string>('');
  const [formRole, setFormRole] = useState<UserRole>('viewer');
  const [formPermissions, setFormPermissions] = useState<Permission[]>(['view_media']);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/auth/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        setError('Failed to load users');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleOpenCreateModal = useCallback(() => {
    setEditingUserId(null);
    setFormUsername('');
    setFormDisplayName('');
    setFormPassword('');
    setFormRole('editor');
    setFormPermissions(['view_media', 'edit_metadata', 'manage_faces', 'vault_access']);
    setModalError(null);
    setIsModalOpen(true);
  }, []);

  const handleOpenEditModal = useCallback((user: User) => {
    setEditingUserId(user.id);
    setFormUsername(user.username);
    setFormDisplayName(user.displayName || user.username);
    setFormPassword('');
    setFormRole(user.role);
    setFormPermissions(user.permissions || []);
    setModalError(null);
    setIsModalOpen(true);
  }, []);

  const handleRoleChange = useCallback((newRole: UserRole) => {
    setFormRole(newRole);
    if (newRole === 'admin') {
      setFormPermissions(['view_media', 'edit_metadata', 'manage_faces', 'admin_panel', 'vault_access', 'manage_users']);
    } else if (newRole === 'editor') {
      setFormPermissions(['view_media', 'edit_metadata', 'manage_faces', 'vault_access']);
    } else if (newRole === 'viewer') {
      setFormPermissions(['view_media']);
    }
  }, []);

  const handleTogglePermission = useCallback((perm: Permission) => {
    setFormPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  }, []);

  const handleSubmitUser = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setModalError(null);

      if (!editingUserId && !formUsername.trim()) {
        setModalError(t('authUsernameRequired' as any) || 'Username is required');
        return;
      }
      if (!editingUserId && (!formPassword || formPassword.length < 4)) {
        setModalError(t('authPasswordMinLength' as any) || 'Password must be at least 4 characters');
        return;
      }

      setIsSubmitting(true);
      try {
        if (editingUserId) {
          // Update
          const payload: any = {
            displayName: formDisplayName.trim() || undefined,
            role: formRole,
            permissions: formPermissions,
          };
          if (formPassword && formPassword.trim().length >= 4) {
            payload.password = formPassword.trim();
          }

          const res = await authFetch(`/api/auth/users/${editingUserId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            const errData = await res.json();
            setModalError(errData.message || 'Failed to update user');
            setIsSubmitting(false);
            return;
          }
        } else {
          // Create
          const res = await authFetch('/api/auth/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: formUsername.trim(),
              displayName: formDisplayName.trim() || formUsername.trim(),
              password: formPassword,
              role: formRole,
              permissions: formPermissions,
            }),
          });

          if (!res.ok) {
            const errData = await res.json();
            setModalError(errData.message || 'Failed to create user');
            setIsSubmitting(false);
            return;
          }
        }

        setIsModalOpen(false);
        await fetchUsers();
      } catch (err: any) {
        setModalError(err.message || 'Network error');
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingUserId, formUsername, formDisplayName, formPassword, formRole, formPermissions, authFetch, fetchUsers, t]
  );

  const handleDeleteUser = useCallback(
    async (user: User) => {
      if (user.id === currentUser?.id) {
        alert(t('authCannotDeleteSelf' as any) || 'You cannot delete your own account');
        return;
      }
      if (
        !window.confirm(
          `${t('authConfirmDeleteUser' as any) || 'Are you sure you want to delete user account'} "${user.username}"?`
        )
      ) {
        return;
      }

      try {
        const res = await authFetch(`/api/auth/users/${user.id}`, { method: 'DELETE' });
        if (res.ok) {
          await fetchUsers();
        } else {
          const errData = await res.json();
          alert(errData.message || 'Failed to delete user');
        }
      } catch (err: any) {
        alert(err.message || 'Network error');
      }
    },
    [currentUser?.id, authFetch, fetchUsers, t]
  );

  return (
    <div className="admin-section-content" id="tab-content-users">
      <div className="admin-section-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h3>👥 {t('rbacUsersTitle' as any) || 'User & Access Control Management (RBAC)'}</h3>
          <p className="admin-subtitle">
            {t('rbacUsersSubtitle' as any) || 'Manage user accounts, assign roles, and configure granular permissions.'}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenCreateModal}
            id="btn-add-user"
          >
            ➕ {t('rbacAddUserButton' as any) || 'Create New User'}
          </button>
        )}
      </div>

      {error && (
        <div className="login-error-alert" style={{ marginBottom: '1rem' }}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#9aa0a6' }}>
          ⏳ {t('rbacLoadingUsers' as any) || 'Loading users...'}
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-flags-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>{t('rbacColUsername' as any) || 'Username'}</th>
                <th>{t('rbacColDisplayName' as any) || 'Display Name'}</th>
                <th>{t('rbacColRole' as any) || 'Role'}</th>
                <th>{t('rbacColPermissions' as any) || 'Permissions'}</th>
                <th style={{ textAlign: 'right' }}>{t('rbacColActions' as any) || 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === currentUser?.id;
                return (
                  <tr key={user.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 600, color: '#fff' }}>{user.username}</span>
                        {isSelf && (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              padding: '0.15rem 0.45rem',
                              background: 'rgba(99, 102, 241, 0.25)',
                              border: '1px solid rgba(99, 102, 241, 0.4)',
                              borderRadius: '6px',
                              color: '#a5b4fc',
                            }}
                          >
                            {t('rbacYouPill' as any) || 'You'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{user.displayName || '—'}</td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.6rem',
                          borderRadius: '8px',
                          textTransform: 'uppercase',
                          background:
                            user.role === 'admin'
                              ? 'rgba(168, 85, 247, 0.2)'
                              : user.role === 'editor'
                              ? 'rgba(59, 130, 246, 0.2)'
                              : 'rgba(16, 185, 129, 0.2)',
                          color:
                            user.role === 'admin'
                              ? '#d8b4fe'
                              : user.role === 'editor'
                              ? '#93c5fd'
                              : '#6ee7b7',
                          border: `1px solid ${
                            user.role === 'admin'
                              ? 'rgba(168, 85, 247, 0.4)'
                              : user.role === 'editor'
                              ? 'rgba(59, 130, 246, 0.4)'
                              : 'rgba(16, 185, 129, 0.4)'
                          }`,
                        }}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {user.role === 'admin' ? (
                          <span style={{ fontSize: '0.78rem', color: '#d8b4fe' }}>
                            ✨ {t('rbacAllPermissions' as any) || 'All Privileges (Bypass)'}
                          </span>
                        ) : user.permissions && user.permissions.length > 0 ? (
                          user.permissions.map((p) => (
                            <span
                              key={p}
                              style={{
                                fontSize: '0.72rem',
                                padding: '0.1rem 0.4rem',
                                background: 'rgba(255, 255, 255, 0.08)',
                                borderRadius: '4px',
                                color: '#e2e8f0',
                              }}
                            >
                              {p.replace('_', ' ')}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: '#9aa0a6' }}>
                            {t('rbacNoPermissions' as any) || 'None'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                          onClick={() => handleOpenEditModal(user)}
                        >
                          ✏️ {t('btnEdit' as any) || 'Edit'}
                        </button>
                        {!isSelf && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{
                              padding: '0.3rem 0.6rem',
                              fontSize: '0.78rem',
                              color: '#fca5a5',
                              borderColor: 'rgba(239, 68, 68, 0.3)',
                            }}
                            onClick={() => handleDeleteUser(user)}
                          >
                            🗑️ {t('btnDelete' as any) || 'Delete'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div
          className="login-modal-overlay"
          onClick={() => setIsModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="login-modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="login-modal-header">
              <div className="login-header-title-wrap">
                <span className="login-header-icon" aria-hidden="true">
                  {editingUserId ? '✏️' : '➕'}
                </span>
                <div>
                  <h2>
                    {editingUserId
                      ? t('rbacEditUserTitle' as any) || 'Edit User Account'
                      : t('rbacCreateUserTitle' as any) || 'Create New User Account'}
                  </h2>
                  <p>{t('rbacUserModalSubtitle' as any) || 'Configure role and permissions'}</p>
                </div>
              </div>
              <button
                type="button"
                className="login-modal-close"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmitUser}>
              <div className="login-modal-body">
                {modalError && (
                  <div className="login-error-alert" role="alert">
                    <span>⚠️</span>
                    <span>{modalError}</span>
                  </div>
                )}

                <div className="login-form-group">
                  <label>{t('authUsernameLabel' as any) || 'Username'}</label>
                  <input
                    type="text"
                    className="login-input"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    disabled={Boolean(editingUserId)}
                    placeholder="e.g. editor_jane"
                    required
                  />
                </div>

                <div className="login-form-group">
                  <label>{t('rbacDisplayNameLabel' as any) || 'Display Name'}</label>
                  <input
                    type="text"
                    className="login-input"
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                  />
                </div>

                <div className="login-form-group">
                  <label>
                    {editingUserId
                      ? t('rbacNewPasswordOptional' as any) || 'New Password (leave blank to keep current)'
                      : t('authPasswordLabel' as any) || 'Password'}
                  </label>
                  <input
                    type="password"
                    className="login-input"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder={editingUserId ? '••••••••' : 'SecretPassword123'}
                    required={!editingUserId}
                  />
                </div>

                <div className="login-form-group">
                  <label>{t('rbacRoleLabel' as any) || 'Role Preset'}</label>
                  <select
                    className="login-input"
                    value={formRole}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    style={{ background: '#1e222d', color: '#fff' }}
                  >
                    <option value="viewer">Viewer (Read-Only Gallery & Tree)</option>
                    <option value="editor">Editor (Tagging, Metadata Editing & Vault)</option>
                    <option value="admin">Administrator (Full System & User Control)</option>
                  </select>
                </div>

                <div className="login-form-group">
                  <label>{t('rbacPermissionsLabel' as any) || 'Granular Permissions'}</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                    {AVAILABLE_PERMISSIONS.map((perm) => {
                      const isChecked = formPermissions.includes(perm.id);
                      return (
                        <label
                          key={perm.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.4rem 0.6rem',
                            background: isChecked ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                            border: `1px solid ${isChecked ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.82rem',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleTogglePermission(perm.id)}
                            disabled={formRole === 'admin'}
                          />
                          <span>{t(perm.labelKey as any) || perm.id.replace('_', ' ')}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="login-modal-footer" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  {t('btnCancel' as any) || 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? t('btnSaving' as any) || 'Saving...'
                    : editingUserId
                    ? t('btnSaveChanges' as any) || 'Save Changes'
                    : t('btnCreate' as any) || 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
