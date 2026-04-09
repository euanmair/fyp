'use client';

import { useEffect, useMemo, useState } from 'react';

type Organisation = {
  organisationID: string;
  organisationName: string;
  createdAt: string;
  isActive: boolean;
};

type UserAccount = {
  email: string;
  id: string;
  role: 'staff' | 'manager' | 'admin' | string;
  organisationID: string;
  staffID: string;
  createdAt: string;
};

type ScheduleRecord = {
  scheduleID: string;
  organisationID: string;
  weekStartDate: string;
  createdAt: string;
  assignmentCount: number;
};

export default function AdminPage() {
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [scheduleRecords, setScheduleRecords] = useState<ScheduleRecord[]>([]);
  const [selectedOrgFilter, setSelectedOrgFilter] = useState('');
  const [scheduleOrgFilter, setScheduleOrgFilter] = useState('');

  const [status, setStatus] = useState('Loading admin data...');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const [editedUsers, setEditedUsers] = useState<Record<string, { role: string; organisationID: string; staffID: string }>>({}); 

  const filteredUsers = useMemo(() => {
    if (!selectedOrgFilter) return users;
    return users.filter((user) => user.organisationID === selectedOrgFilter);
  }, [users, selectedOrgFilter]);

  const filteredSchedules = useMemo(() => {
    if (!scheduleOrgFilter) return scheduleRecords;
    return scheduleRecords.filter((s) => s.organisationID === scheduleOrgFilter);
  }, [scheduleRecords, scheduleOrgFilter]);

  async function loadAdminData() {
    setIsBusy(true);
    setError('');
    setStatus('Loading admin data...');

    try {
      const [orgRes, userRes, schedRes] = await Promise.all([
        fetch('/api/admin/organisations'),
        fetch('/api/admin/users'),
        fetch('/api/admin/schedules?limit=200'),
      ]);

      const orgData = await orgRes.json();
      const userData = await userRes.json();
      const schedData = await schedRes.json();

      if (!orgRes.ok) {
        throw new Error(orgData?.message || 'Unable to load organisations.');
      }

      if (!userRes.ok) {
        throw new Error(userData?.message || 'Unable to load users.');
      }

      setOrganisations(orgData.organisations || []);
      setUsers(userData.users || []);
      setScheduleRecords(schedRes.ok ? (schedData.schedules || []) : []);
      setStatus('Admin data loaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected admin load error.');
      setStatus('Unable to load admin data.');
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    loadAdminData();
  }, []);

  function beginUserEdit(user: UserAccount) {
    setEditedUsers((prev) => ({
      ...prev,
      [user.email]: {
        role: user.role,
        organisationID: user.organisationID,
        staffID: user.staffID,
      },
    }));
  }

  async function saveUser(email: string) {
    const edit = editedUsers[email];
    if (!edit) {
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edit),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Unable to save user changes.');
      }

      setStatus(`Updated account ${email}.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected user update error.');
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteUser(email: string) {
    if (!confirm(`Delete user account ${email}? This cannot be undone.`)) {
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Unable to delete user.');
      }

      setStatus(`User ${email} deleted.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected user delete error.');
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteSchedule(scheduleID: string) {
    if (!confirm(`Delete schedule ${scheduleID.slice(0, 8)}...?`)) {
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/schedules/${encodeURIComponent(scheduleID)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Unable to delete schedule.');
      }

      setStatus(`Schedule ${scheduleID.slice(0, 8)} deleted.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected schedule delete error.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <section className="rounded-xl border border-foreground/15 bg-background p-6">
        <h1 className="text-3xl font-bold">Admin Console</h1>
        <p className="mt-2 text-foreground/70">Manage user accounts and schedule records.</p>
        <p className="mt-3 text-sm text-foreground/70">{status}</p>
        {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="rounded-xl border border-foreground/15 bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">User accounts</h2>
          <label className="text-sm">
            Filter by organisation
            <select
              className="ml-2 rounded border border-foreground/20 px-2 py-1"
              value={selectedOrgFilter}
              onChange={(e) => setSelectedOrgFilter(e.target.value)}
            >
              <option value="">All</option>
              {organisations.map((org) => (
                <option key={org.organisationID} value={org.organisationID}>{org.organisationID}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 max-h-[28rem] overflow-auto rounded-md border border-foreground/15">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/15 bg-foreground/5">
                <th className="px-2 py-2 text-left">Email</th>
                <th className="px-2 py-2 text-left">Role</th>
                <th className="px-2 py-2 text-left">Organisation</th>
                <th className="px-2 py-2 text-left">Staff ID</th>
                <th className="px-2 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const edit = editedUsers[user.email] || { role: user.role, organisationID: user.organisationID, staffID: user.staffID };
                return (
                  <tr key={user.email} className="border-b border-foreground/10 align-top">
                    <td className="px-2 py-2">{user.email}</td>
                    <td className="px-2 py-2">
                      <select
                        className="rounded border border-foreground/20 px-2 py-1"
                        value={edit.role}
                        onFocus={() => beginUserEdit(user)}
                        onChange={(e) => setEditedUsers((prev) => ({ ...prev, [user.email]: { ...edit, role: e.target.value } }))}
                      >
                        <option value="staff">staff</option>
                        <option value="manager">manager</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="w-44 rounded border border-foreground/20 px-2 py-1"
                        value={edit.organisationID}
                        onFocus={() => beginUserEdit(user)}
                        onChange={(e) => setEditedUsers((prev) => ({ ...prev, [user.email]: { ...edit, organisationID: e.target.value } }))}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="w-32 rounded border border-foreground/20 px-2 py-1"
                        value={edit.staffID}
                        onFocus={() => beginUserEdit(user)}
                        onChange={(e) => setEditedUsers((prev) => ({ ...prev, [user.email]: { ...edit, staffID: e.target.value } }))}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-2">
                        <button disabled={isBusy} onClick={() => saveUser(user.email)} className="rounded border border-foreground/30 px-2 py-1 text-xs disabled:opacity-50">Save user</button>
                        <button disabled={isBusy} onClick={() => deleteUser(user.email)} className="rounded border border-red-500/50 px-2 py-1 text-xs text-red-700 disabled:opacity-50">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 ? (
                <tr><td className="px-2 py-3 text-foreground/60" colSpan={5}>No users match the current filter.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-foreground/15 bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Schedule records</h2>
          <label className="text-sm">
            Filter by organisation
            <select
              className="ml-2 rounded border border-foreground/20 px-2 py-1"
              value={scheduleOrgFilter}
              onChange={(e) => setScheduleOrgFilter(e.target.value)}
            >
              <option value="">All</option>
              {organisations.map((org) => (
                <option key={org.organisationID} value={org.organisationID}>{org.organisationID}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 max-h-[28rem] overflow-auto rounded-md border border-foreground/15">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/15 bg-foreground/5">
                <th className="px-2 py-2 text-left">Schedule ID</th>
                <th className="px-2 py-2 text-left">Organisation</th>
                <th className="px-2 py-2 text-left">Week</th>
                <th className="px-2 py-2 text-left">Shifts</th>
                <th className="px-2 py-2 text-left">Created</th>
                <th className="px-2 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedules.map((sched) => (
                <tr key={sched.scheduleID} className="border-b border-foreground/10 align-top">
                  <td className="px-2 py-2 font-mono text-xs">{sched.scheduleID.slice(0, 12)}</td>
                  <td className="px-2 py-2">{sched.organisationID}</td>
                  <td className="px-2 py-2 font-mono text-xs">{sched.weekStartDate || 'n/a'}</td>
                  <td className="px-2 py-2">{sched.assignmentCount}</td>
                  <td className="px-2 py-2 text-xs">{sched.createdAt ? new Date(sched.createdAt).toLocaleString() : ''}</td>
                  <td className="px-2 py-2">
                    <button disabled={isBusy} onClick={() => deleteSchedule(sched.scheduleID)} className="rounded border border-red-500/50 px-2 py-1 text-xs text-red-700 disabled:opacity-50">Delete</button>
                  </td>
                </tr>
              ))}
              {filteredSchedules.length === 0 ? (
                <tr><td className="px-2 py-3 text-foreground/60" colSpan={6}>No schedule records found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
